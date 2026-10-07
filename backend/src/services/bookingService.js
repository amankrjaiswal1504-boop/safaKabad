// Single path for creating and completing pickups, used by the web wizard,
// guest booking, recurring plans, the chat assistant and admin. Every price,
// bonus and payout amount is computed here on the server.
const mongoose = require('mongoose');
const Pickup = require('../models/Pickup');
const Address = require('../models/Address');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { Coupon, Ngo } = require('../models/platform');
const { estimateItems } = require('./rateService');
const { checkAddress } = require('./cityService');
const { assertSlotAvailable } = require('./slotService');
const { checkBooking } = require('./fraudService');
const { validateCoupon, couponBonus, firstPickupBonus } = require('./couponService');
const { autoAssign } = require('./assignmentService');
const { pickupOtp } = require('./otpService');
const { pickupStatusChanged, notify } = require('./notificationService');
const { userImpact } = require('./impactService');
const { rewardOnFirstPickup } = require('./referralService');
const wallet = require('./walletService');
const gateway = require('./paymentGateway');
const settings = require('./settingsService');
const { track } = require('./jobs');
const { generatePickupId, generatePaymentId } = require('../utils/generateId');
const { receiptPdf } = require('./pdfService');
const { cleanPhone, MOBILE_RE } = require('../config/locale');

class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function createPickupForUser(user, payload, { ip, actor } = {}) {
  const {
    items,
    addressId,
    scheduledDate,
    timeSlot,
    contactPhone,
    notes = '',
    photos = [],
    couponCode,
    type = 'sale',
    ngoId,
    source = 'web',
    recurringPlan,
    skipSlotCheck = false,
  } = payload;

  if (!Array.isArray(items) || !items.length) throw new BookingError('Add at least one scrap item');
  if (!mongoose.isValidObjectId(addressId)) throw new BookingError('Choose a pickup address');
  const address = await Address.findOne({ _id: addressId, user: user._id });
  if (!address) throw new BookingError('Address not found', 404);

  const service = await checkAddress(address);
  if (!service.serviceable) throw new BookingError(service.reason);

  const date = String(scheduledDate).slice(0, 10);
  if (!skipSlotCheck) {
    const slotProblem = await assertSlotAvailable(date, timeSlot, { areaId: address.area, pinCode: address.pinCode });
    if (slotProblem) throw new BookingError(slotProblem);
  }

  const conditionMultipliers = await settings.get('conditionMultipliers');
  const estimate = await estimateItems(items, address.city, { conditionMultipliers });
  if (!estimate.lines.length) throw new BookingError('None of the selected items are available');
  if (estimate.unpriced.length) {
    throw new BookingError(`We don't buy ${estimate.unpriced.join(', ')} in ${address.city} yet. Remove ${estimate.unpriced.length > 1 ? 'them' : 'it'} to continue.`);
  }

  if (type !== 'donation' && service.area) {
    const { minPickupWeightKg, minPickupValue } = service.area;
    if (minPickupWeightKg && estimate.weightKg < minPickupWeightKg) {
      throw new BookingError(`Minimum pickup in ${service.area.name} is ${minPickupWeightKg} kg`);
    }
    if (minPickupValue && estimate.max < minPickupValue) {
      throw new BookingError(`Minimum pickup value in ${service.area.name} is रु ${minPickupValue}`);
    }
  }

  let ngo = null;
  if (type === 'donation') {
    ngo = mongoose.isValidObjectId(ngoId) ? await Ngo.findOne({ _id: ngoId, isActive: true }) : null;
    if (!ngo) throw new BookingError('Choose an NGO to donate to');
  }

  const { flags } = await checkBooking(user, { pinCode: address.pinCode, items, scheduledDate: date, ip });

  let coupon = null;
  if (couponCode && type !== 'donation') {
    const { coupon: c, bonus } = await validateCoupon(couponCode, user, {
      weightKg: estimate.weightKg,
      value: estimate.min,
    });
    coupon = { code: c.code, bonusAmount: bonus };
    await Coupon.updateOne({ _id: c._id }, { $inc: { usedCount: 1 } });
  }

  const pickup = new Pickup({
    pickupId: await generatePickupId(),
    type,
    ngo: ngo?._id || null,
    customer: user._id,
    items: estimate.lines.map((l) => ({
      item: l.item._id,
      itemName: l.item.name,
      unit: l.item.unit,
      estimatedQuantity: l.quantity,
      condition: l.condition,
    })),
    address: address._id,
    addressSnapshot: address.toObject(),
    pinCode: address.pinCode,
    area: address.area || service.area?._id || null,
    city: address.city,
    location: address.location?.lat ? address.location : undefined,
    scheduledDate: new Date(`${date}T00:00:00.000Z`),
    timeSlot,
    contactPhone: contactPhone || user.phone,
    notes: String(notes).slice(0, 500),
    photos: photos.slice(0, 6),
    estimatedValueMin: type === 'donation' ? 0 : estimate.min,
    estimatedValueMax: type === 'donation' ? 0 : estimate.max,
    status: 'BOOKED',
    otp: pickupOtp(),
    coupon: coupon || undefined,
    source,
    recurringPlan: recurringPlan || null,
    flags,
  });
  pickup.$locals.changedBy = actor?._id || user._id;
  await pickup.save();

  await pickupStatusChanged(pickup);
  const collector = await autoAssign(pickup);
  if (collector) {
    await pickupStatusChanged(pickup, { collectorName: collector.name });
    await notify(collector._id, {
      type: 'collector.assigned',
      title: 'New pickup assigned',
      body: `${pickup.pickupId} · ${date} · ${timeSlot} · ${address.locality}, ${address.city}`,
      link: `/collector/pickups/${pickup.pickupId}`,
      channels: ['inapp', 'push', 'whatsapp'],
    });
  }
  await track('booking', { user: user._id, city: address.city });
  return pickup;
}

// Bonus on top of the final amount: the better of coupon vs first-pickup bonus,
// plus loyalty-tier and business-tier percentages.
async function computeBonus(pickup, customer) {
  if (pickup.type === 'donation' || !pickup.finalAmount) return 0;
  let promo = 0;
  if (pickup.coupon?.code) {
    const c = await Coupon.findOne({ code: pickup.coupon.code });
    if (c) promo = couponBonus(c, pickup.finalAmount);
  } else {
    promo = await firstPickupBonus(customer, pickup.finalAmount);
  }
  const impact = await userImpact(customer._id);
  let tierPercent = impact.tier.current?.bonusPercent || 0;
  if (customer.accountType === 'business') {
    const { tiers } = await settings.get('business');
    const t = tiers.find((x) => x.name === customer.business?.pricingTier);
    tierPercent += t?.bonusPercent || 0;
  }
  return Math.round(promo + (pickup.finalAmount * tierPercent) / 100);
}

// Pay the customer. Wallet credits and payment records run in one transaction
// where supported. eSewa / Khalti / bank go through the payout provider (see
// paymentGateway.sendPayout: mock in development, manual settlement otherwise).
async function payOut(pickup, customer, { method, walletId, bankAccount }) {
  const amount = Math.round(((pickup.finalAmount || 0) + (pickup.bonusAmount || 0)) * 100) / 100;
  const paymentId = generatePaymentId();
  if (pickup.type === 'donation' || amount <= 0) {
    pickup.payout = { method: null, status: null };
    return null;
  }
  const { payoutMethods } = await settings.get('payments');
  if (!payoutMethods.includes(method)) throw new BookingError('This payout method is not available right now');
  if (method === 'wallet') {
    return wallet.withTransaction(async (session) => {
      await wallet.credit(customer._id, amount, 'pickup_payout', { reference: pickup.pickupId }, session);
      const [payment] = await Payment.create(
        [{ paymentId, pickup: pickup._id, user: customer._id, amount, method: 'wallet', status: 'successful' }],
        { session }
      );
      pickup.payout = { method: 'wallet', status: 'paid', reference: paymentId, paidAt: new Date() };
      return payment;
    });
  }
  if (['esewa', 'khalti', 'bank_transfer'].includes(method)) {
    const id = cleanPhone(walletId);
    if (method !== 'bank_transfer' && !MOBILE_RE.test(id)) {
      throw new BookingError(`Enter the customer's ${method === 'esewa' ? 'eSewa' : 'Khalti'} ID (10-digit mobile number)`);
    }
    if (method === 'bank_transfer' && !(bankAccount?.accountNumber && bankAccount?.bankName)) {
      throw new BookingError('Enter the bank account number and bank name');
    }
    const result = await gateway.sendPayout({
      amount,
      method: method === 'bank_transfer' ? 'bank' : method,
      walletId: method === 'bank_transfer' ? undefined : id,
      bankAccount,
      name: customer.name,
      reference: pickup.pickupId,
    });
    const paid = ['processed', 'processing', 'queued'].includes(result.status);
    const payment = await Payment.create({
      paymentId,
      pickup: pickup._id,
      user: customer._id,
      amount,
      method,
      status: result.status === 'processed' ? 'successful' : paid ? 'pending' : 'failed',
      payoutReference: result.id,
      isMock: result.mock,
    });
    pickup.payout = {
      method,
      walletId: method === 'bank_transfer' ? undefined : cleanPhone(walletId),
      status: result.status === 'processed' ? 'paid' : paid ? 'processing' : 'failed',
      reference: result.id,
      paidAt: result.status === 'processed' ? new Date() : undefined,
    };
    return payment;
  }
  // Cash handed over at the door by the collector.
  const payment = await Payment.create({ paymentId, pickup: pickup._id, user: customer._id, amount, method: 'cash', status: 'successful' });
  pickup.payout = { method: 'cash', status: 'paid', reference: paymentId, paidAt: new Date() };
  return payment;
}

async function completePickup(pickup, payoutDetails, actor) {
  const customer = await User.findById(pickup.customer);
  pickup.bonusAmount = await computeBonus(pickup, customer);
  await payOut(pickup, customer, payoutDetails);
  pickup.status = 'COMPLETED';
  pickup.$locals.changedBy = actor?._id;
  await pickup.save();

  if (pickup.collector) {
    await User.updateOne({ _id: pickup.collector }, { $inc: { 'collectorProfile.totalPickupsCompleted': 1 } });
  }
  await pickup.populate([{ path: 'customer', select: 'name email phone' }, { path: 'collector', select: 'name phone' }]);
  const pdf = await receiptPdf(pickup).catch(() => null);
  await pickupStatusChanged(pickup, {
    attachments: pdf ? [{ filename: `ScrapMate-${pickup.pickupId}.pdf`, content: pdf }] : undefined,
  });
  await rewardOnFirstPickup(customer._id);
  await track('completed', { user: customer._id, city: pickup.addressSnapshot?.city });
  return pickup;
}

module.exports = { createPickupForUser, completePickup, computeBonus, payOut, BookingError };
