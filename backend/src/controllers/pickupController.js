const Pickup = require('../models/Pickup');
const User = require('../models/User');
const Address = require('../models/Address');
const ScrapItem = require('../models/ScrapItem');
const { Review } = require('../models/platform');
const SupportTicket = require('../models/SupportTicket');
const { createPickupForUser, BookingError } = require('../services/bookingService');
const {
  cancelCustomerPickup,
  rescheduleCustomerPickup,
  PickupActionError,
  ownershipFilter,
} = require('../services/pickupService');
const { verifyOtp, OtpError } = require('../services/otpService');
const { issueSession } = require('./authController');
const { haversineKm, etaMinutes } = require('../services/assignmentService');
const { receiptPdf, certificatePdf } = require('../services/pdfService');
const { notifyAdmins, notify } = require('../services/notificationService');
const { generateTicketId } = require('../services/chat/tickets');
const { emitTo } = require('../socket');
const { TIMEZONE } = require('../config/locale');
const { resolveAddress } = require('../services/cityService');

function sendError(res, err, next) {
  if (err instanceof BookingError || err instanceof PickupActionError || err instanceof OtpError || err.status) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
  return next(err);
}

async function createPickup(req, res, next) {
  try {
    const pickup = await createPickupForUser(req.user, { ...req.body, source: req.body.source === 'chat' ? 'chat' : 'web' }, { ip: req.ip });
    const obj = pickup.toObject();
    obj.otp = pickup.otp;
    res.status(201).json({ success: true, data: { pickup: obj } });
  } catch (err) {
    sendError(res, err, next);
  }
}

// Guest booking: phone + OTP instead of a password. Creates (or reuses) the
// customer account and address, books the pickup, and signs the guest in.
async function createGuestPickup(req, res, next) {
  try {
    const { phone, code, name, address, ...booking } = req.body;
    // Validate the address before the one-time code is used up.
    const resolved = await resolveAddress(address);
    await verifyOtp(phone, code, 'booking');
    let user = await User.findOne({ phone, role: 'customer' });
    if (!user) {
      user = await User.create({ name, phone, phoneVerified: true, role: 'customer' });
    } else if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account is deactivated' });
    }
    const saved = await Address.create({ ...resolved, user: user._id, isDefault: !(await Address.exists({ user: user._id })) });
    const pickup = await createPickupForUser(user, { ...booking, addressId: String(saved._id), contactPhone: phone, source: 'guest' }, { ip: req.ip });
    await issueSession(req, res, await User.findById(user._id).select('+tokenVersion'));
    const obj = pickup.toObject();
    obj.otp = pickup.otp;
    res.status(201).json({ success: true, data: { pickup: obj, user: user.toSafeObject() } });
  } catch (err) {
    sendError(res, err, next);
  }
}

async function listMyPickups(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const filter = { customer: req.user._id };
    if (req.query.status === 'active') filter.status = { $nin: ['COMPLETED', 'CANCELLED'] };
    else if (req.query.status) filter.status = req.query.status;
    const [pickups, total] = await Promise.all([
      Pickup.find(filter)
        .populate('collector', 'name phone collectorProfile.rating')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Pickup.countDocuments(filter),
    ]);
    res.json({ success: true, data: { pickups, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (err) {
    next(err);
  }
}

async function getPickup(req, res, next) {
  try {
    const filter = { pickupId: req.params.id.toUpperCase(), ...ownershipFilter(req.user) };
    const pickup = await Pickup.findOne(filter)
      .select('+otp')
      .populate('collector', 'name phone collectorProfile.rating collectorProfile.vehicleNumber collectorProfile.location')
      .populate('customer', 'name phone email')
      .populate('ngo', 'name')
      .populate('review', 'rating comment status');
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    const obj = pickup.toObject();
    // Only the customer sees the door code, and only until weighing starts.
    const isCustomer = String(pickup.customer._id) === String(req.user._id);
    if (!isCustomer || pickup.otpVerifiedAt || ['COMPLETED', 'CANCELLED'].includes(pickup.status)) delete obj.otp;
    // Live collector position only while they're on the way.
    const loc = pickup.collector?.collectorProfile?.location;
    if (obj.collector?.collectorProfile) delete obj.collector.collectorProfile.location;
    if (pickup.status === 'COLLECTOR_ON_THE_WAY' && loc?.lat) {
      const km = haversineKm(loc, pickup.location);
      obj.live = { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt, km: km && Math.round(km * 10) / 10, etaMinutes: etaMinutes(km) };
    }
    res.json({ success: true, data: { pickup: obj } });
  } catch (err) {
    next(err);
  }
}

async function cancelPickup(req, res, next) {
  try {
    const pickup = await cancelCustomerPickup(req.user, req.params.id, req.body.reason);
    res.json({ success: true, data: { pickup } });
  } catch (err) {
    sendError(res, err, next);
  }
}

async function reschedulePickup(req, res, next) {
  try {
    const pickup = await rescheduleCustomerPickup(req.user, req.params.id, req.body.date, req.body.timeSlot);
    res.json({ success: true, data: { pickup } });
  } catch (err) {
    sendError(res, err, next);
  }
}

// Customer accepts or disputes the weighed amount.
async function decideAmount(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), customer: req.user._id });
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    if (!['WEIGHING', 'COMPLETED'].includes(pickup.status) || pickup.finalAmount == null) {
      return res.status(400).json({ success: false, message: 'There is no weighed amount to review yet' });
    }
    const { decision, note } = req.body;
    pickup.customerDecision = { status: decision, note: note || '', at: new Date() };
    await pickup.save();
    emitTo(`pickup:${pickup.pickupId}`, 'pickup:decision', { pickupId: pickup.pickupId, decision });
    if (decision === 'disputed') {
      const ticket = await SupportTicket.create({
        ticketId: generateTicketId(),
        user: req.user._id,
        pickupId: pickup.pickupId,
        summary: `Weighing dispute on ${pickup.pickupId} (रु ${pickup.finalAmount}): ${note || 'no details'}`.slice(0, 2000),
        reason: 'other',
      });
      await notifyAdmins({ type: 'dispute', title: 'Weighing disputed', body: `${pickup.pickupId}: ${note || ''}`, link: '/admin/support' });
      if (pickup.collector) {
        await notify(pickup.collector, {
          type: 'collector.dispute',
          title: 'Customer disputed the weighing',
          body: `${pickup.pickupId}: please re-check the weights with the customer.`,
          link: `/collector/pickups/${pickup.pickupId}`,
          channels: ['inapp', 'push'],
        });
      }
      return res.json({ success: true, data: { pickup, ticketId: ticket.ticketId } });
    }
    res.json({ success: true, data: { pickup } });
  } catch (err) {
    next(err);
  }
}

async function reviewPickup(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), customer: req.user._id });
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    if (pickup.status !== 'COMPLETED') return res.status(400).json({ success: false, message: 'You can review after the pickup is completed' });
    if (pickup.review) return res.status(409).json({ success: false, message: 'You have already reviewed this pickup' });
    const review = await Review.create({
      pickup: pickup._id,
      customer: req.user._id,
      collector: pickup.collector,
      rating: req.body.rating,
      comment: req.body.comment || '',
      // Ratings without text don't need moderation.
      status: req.body.comment ? 'pending' : 'approved',
    });
    pickup.review = review._id;
    await pickup.save();
    const { recomputeCollectorRating } = require('./adminGrowthController');
    if (pickup.collector) await recomputeCollectorRating(pickup.collector);
    res.status(201).json({ success: true, data: { review } });
  } catch (err) {
    next(err);
  }
}

// Calendar file so customers can add the pickup to their calendar.
async function calendarFile(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), customer: req.user._id });
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    const { slotStartHour } = require('../services/slotService');
    const day = pickup.scheduledDate.toISOString().slice(0, 10).replace(/-/g, '');
    const startH = slotStartHour(pickup.timeSlot);
    const pad = (n) => String(n).padStart(2, '0');
    const a = pickup.addressSnapshot || {};
    const location = [a.houseNumber, a.street, a.locality, a.city].filter(Boolean).join(', ').replace(/,/g, '\\,');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SafaKabad//Pickup//EN',
      'BEGIN:VEVENT',
      `UID:${pickup.pickupId}@safakabad`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;TZID=${TIMEZONE}:${day}T${pad(startH)}0000`,
      `DTEND;TZID=${TIMEZONE}:${day}T${pad(startH + 2)}0000`,
      `SUMMARY:SafaKabad pickup ${pickup.pickupId}`,
      `DESCRIPTION:Scrap pickup (${pickup.items.map((i) => i.itemName).join('\\, ')}). Track: ${process.env.CLIENT_URL || 'http://localhost:5173'}/pickups/${pickup.pickupId}`,
      `LOCATION:${location}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="safakabad-${pickup.pickupId}.ics"`);
    res.send(ics);
  } catch (err) {
    next(err);
  }
}

async function receipt(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), ...ownershipFilter(req.user) })
      .populate('customer', 'name phone')
      .populate('collector', 'name');
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    if (pickup.status !== 'COMPLETED') return res.status(400).json({ success: false, message: 'Receipt is available after completion' });
    const pdf = await receiptPdf(pickup);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="SafaKabad-${pickup.pickupId}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
}

// Donation certificate (donations) or certified e-waste disposal certificate.
async function certificate(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), ...ownershipFilter(req.user) })
      .populate('customer', 'name business accountType')
      .populate('ngo', 'name registrationNumber');
    if (!pickup || pickup.status !== 'COMPLETED') {
      return res.status(404).json({ success: false, message: 'Certificate is available for completed pickups' });
    }
    const items = await ScrapItem.find({ _id: { $in: pickup.items.map((i) => i.item) } }).populate('category', 'slug');
    const ewaste = items.filter((i) => i.category?.slug === 'e-waste');
    const kind = req.params.kind;
    const recipient = pickup.customer.accountType === 'business' && pickup.customer.business?.companyName
      ? pickup.customer.business.companyName
      : pickup.customer.name;
    const lines = pickup.items.map((i) => [i.itemName, `${i.actualWeight ?? i.estimatedQuantity} ${i.unit || 'kg'}`]);
    let pdf;
    if (kind === 'donation') {
      if (pickup.type !== 'donation') return res.status(400).json({ success: false, message: 'This pickup was not a donation' });
      pdf = await certificatePdf({
        title: 'Donation certificate',
        certificateNo: `DON-${pickup.pickupId}`,
        recipient,
        statement: `donated the items below through SafaKabad to ${pickup.ngo?.name || 'our partner NGO'}${pickup.ngo?.registrationNumber ? ` (Reg. ${pickup.ngo.registrationNumber})` : ''}. Thank you for your generosity.`,
        lines: [['Pickup', pickup.pickupId], ...lines],
        issuedOn: pickup.completedAt,
      });
    } else {
      if (!ewaste.length) return res.status(400).json({ success: false, message: 'This pickup had no e-waste' });
      const ewasteNames = new Set(ewaste.map((i) => i.name));
      pdf = await certificatePdf({
        title: 'E-waste disposal certificate',
        certificateNo: `EW-${pickup.pickupId}`,
        recipient,
        statement:
          'handed over the electronic waste listed below to SafaKabad for environmentally sound recycling through authorised recycling partners, in line with the Solid Waste Management Act, 2068 (2011) and the Environment Protection Act, 2076 (2019) of Nepal.',
        lines: [['Pickup', pickup.pickupId], ...lines.filter(([name]) => ewasteNames.has(name))],
        issuedOn: pickup.completedAt,
      });
    }
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="SafaKabad-${kind}-${pickup.pickupId}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPickup,
  createGuestPickup,
  listMyPickups,
  getPickup,
  cancelPickup,
  reschedulePickup,
  decideAmount,
  reviewPickup,
  calendarFile,
  receipt,
  certificate,
};
