const Pickup = require('../models/Pickup');
const User = require('../models/User');
const ScrapPrice = require('../models/ScrapPrice');
const ScrapItem = require('../models/ScrapItem');
const settings = require('../services/settingsService');
const { completePickup, BookingError } = require('../services/bookingService');
const { pickupStatusChanged, notify } = require('../services/notificationService');
const { haversineKm, etaMinutes } = require('../services/assignmentService');
const { releaseCoupon } = require('../services/pickupService');
const { emitTo } = require('../socket');

const ACTIVE = ['ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING'];

function dayBounds(iso) {
  return { $gte: new Date(`${iso}T00:00:00.000Z`), $lte: new Date(`${iso}T23:59:59.999Z`) };
}
const { todayLocal } = require('../config/locale');

async function listAssignedPickups(req, res, next) {
  try {
    const filter = { collector: req.user._id };
    const view = req.query.view || 'active';
    if (view === 'active') filter.status = { $in: ACTIVE };
    else if (view === 'today') {
      filter.scheduledDate = dayBounds(todayLocal());
    } else if (view === 'history') filter.status = { $in: ['COMPLETED', 'CANCELLED'] };
    const pickups = await Pickup.find(filter)
      .populate('customer', 'name phone')
      .sort(view === 'history' ? { updatedAt: -1 } : { scheduledDate: 1, timeSlot: 1 })
      .limit(view === 'history' ? 50 : 200);
    res.json({ success: true, data: { pickups } });
  } catch (err) {
    next(err);
  }
}

// Today's stops ordered nearest-neighbour from the collector's last location,
// with Google Maps navigation links.
async function dailyRoute(req, res, next) {
  try {
    const date = req.query.date || todayLocal();
    const me = await User.findById(req.user._id).lean();
    const pickups = await Pickup.find({ collector: req.user._id, status: { $in: ACTIVE }, scheduledDate: dayBounds(date) })
      .populate('customer', 'name phone')
      .lean();
    let here = me.collectorProfile?.location?.lat ? me.collectorProfile.location : null;
    const remaining = [...pickups];
    const ordered = [];
    while (remaining.length) {
      let bestIdx = 0;
      if (here) {
        let best = Infinity;
        remaining.forEach((p, i) => {
          const km = haversineKm(here, p.location);
          if (km != null && km < best) {
            best = km;
            bestIdx = i;
          }
        });
      }
      const [stop] = remaining.splice(bestIdx, 1);
      const km = here ? haversineKm(here, stop.location) : null;
      const a = stop.addressSnapshot || {};
      const dest = stop.location?.lat
        ? `${stop.location.lat},${stop.location.lng}`
        : encodeURIComponent([a.houseNumber, a.street, a.locality, a.city, a.pinCode].filter(Boolean).join(', '));
      ordered.push({
        ...stop,
        legKm: km != null ? Math.round(km * 10) / 10 : null,
        legEtaMinutes: etaMinutes(km),
        navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`,
      });
      if (stop.location?.lat) here = stop.location;
    }
    res.json({ success: true, data: { date, start: me.collectorProfile?.location || null, stops: ordered } });
  } catch (err) {
    next(err);
  }
}

async function getAssignedPickup(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), collector: req.user._id })
      .populate('customer', 'name phone')
      .populate('ngo', 'name');
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    res.json({ success: true, data: { pickup } });
  } catch (err) {
    next(err);
  }
}

const ALLOWED_TRANSITIONS = {
  ASSIGNED: ['COLLECTOR_ON_THE_WAY', 'CANCELLED'],
  COLLECTOR_ON_THE_WAY: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['CANCELLED'], // ARRIVED -> WEIGHING happens via the door OTP
  WEIGHING: ['CANCELLED'],
};

async function updateStatus(req, res, next) {
  try {
    const { status, reason } = req.body;
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), collector: req.user._id }).select('+otp');
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    const allowed = ALLOWED_TRANSITIONS[pickup.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Cannot move from ${pickup.status} to ${status}` });
    }
    if (status === 'CANCELLED') {
      if (!reason) return res.status(400).json({ success: false, message: 'Please give a reason for cancelling' });
      pickup.cancelReason = reason;
      pickup.cancelledBy = 'collector';
      await releaseCoupon(pickup);
    }
    pickup.status = status;
    pickup.$locals.changedBy = req.user._id;
    await pickup.save();
    await pickupStatusChanged(pickup, { otp: pickup.otp, collectorName: req.user.name });
    await pickup.populate([{ path: 'customer', select: 'name phone' }, { path: 'ngo', select: 'name' }]);
    const obj = pickup.toObject();
    delete obj.otp;
    res.json({ success: true, data: { pickup: obj } });
  } catch (err) {
    next(err);
  }
}

// Collector enters the customer's 4-digit code at the door; weighing unlocks.
async function verifyDoorOtp(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), collector: req.user._id }).select('+otp');
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    if (!['ARRIVED', 'COLLECTOR_ON_THE_WAY'].includes(pickup.status)) {
      return res.status(400).json({ success: false, message: 'Mark yourself as arrived first' });
    }
    if (String(req.body.otp).trim() !== pickup.otp) {
      return res.status(400).json({ success: false, message: 'Incorrect code. Ask the customer to check the code in their app or SMS.' });
    }
    pickup.otpVerifiedAt = new Date();
    pickup.status = 'WEIGHING';
    pickup.$locals.changedBy = req.user._id;
    await pickup.save();
    emitTo(`pickup:${pickup.pickupId}`, 'pickup:status', { pickupId: pickup.pickupId, status: 'WEIGHING', at: new Date() });
    await pickup.populate([{ path: 'customer', select: 'name phone' }, { path: 'ngo', select: 'name' }]);
    const obj = pickup.toObject();
    delete obj.otp;
    res.json({ success: true, data: { pickup: obj } });
  } catch (err) {
    next(err);
  }
}

// Actual weights + scale photos. The rate always comes from the admin price
// list; the collector only chooses min/avg/max within that range.
async function applyWeighing(pickup, weighedItems, rateChoice) {
  if (!pickup.otpVerifiedAt) throw new BookingError('Verify the customer\'s door code before weighing');
  if (pickup.status !== 'WEIGHING') throw new BookingError('Pickup is not ready for weighing');
  const multipliers = await settings.get('conditionMultipliers');
  const city = pickup.addressSnapshot.city;
  let finalAmount = 0;
  for (const line of pickup.items) {
    const submitted = weighedItems.find((w) => w.itemName === line.itemName);
    if (!submitted) continue;
    const price = await ScrapPrice.findOne({ item: line.item, city, isActive: true });
    let rate = 0;
    if (price) {
      if (rateChoice === 'min') rate = price.minPrice;
      else if (rateChoice === 'max') rate = price.maxPrice;
      else rate = (price.minPrice + price.maxPrice) / 2;
    }
    if (line.condition) rate *= multipliers[line.condition] ?? 1;
    line.actualWeight = Math.max(0, Number(submitted.actualWeight) || 0);
    line.rateApplied = Math.round(rate * 100) / 100;
    line.subtotal = Math.round(line.actualWeight * rate * 100) / 100;
    if (submitted.weighingPhoto) line.weighingPhoto = submitted.weighingPhoto;
    finalAmount += line.subtotal;
  }
  pickup.finalAmount = pickup.type === 'donation' ? 0 : Math.round(finalAmount * 100) / 100;
  pickup.customerDecision = { status: 'pending', at: new Date() };
  pickup.markModified('items');
  await pickup.save();
  return pickup;
}

async function submitWeighing(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), collector: req.user._id });
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    await applyWeighing(pickup, req.body.weighedItems, req.body.rateChoice);
    await pickupStatusChanged(pickup);
    await pickup.populate([{ path: 'customer', select: 'name phone' }, { path: 'ngo', select: 'name' }]);
    res.json({ success: true, data: { pickup } });
  } catch (err) {
    if (err instanceof BookingError) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
}

// Offline-tolerant weighing: the collector app queues weighings while offline
// and replays them here when the connection returns.
async function syncOffline(req, res, next) {
  try {
    const results = [];
    for (const entry of req.body.entries) {
      const pickup = await Pickup.findOne({ pickupId: entry.pickupId.toUpperCase(), collector: req.user._id });
      if (!pickup) {
        results.push({ pickupId: entry.pickupId, ok: false, message: 'Not found' });
        continue;
      }
      try {
        await applyWeighing(pickup, entry.weighedItems, entry.rateChoice);
        await pickupStatusChanged(pickup);
        results.push({ pickupId: entry.pickupId, ok: true, finalAmount: pickup.finalAmount });
      } catch (err) {
        results.push({ pickupId: entry.pickupId, ok: false, message: err.message });
      }
    }
    res.json({ success: true, data: { results } });
  } catch (err) {
    next(err);
  }
}

async function finishPickup(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), collector: req.user._id });
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    if (pickup.status !== 'WEIGHING' || pickup.finalAmount == null) {
      return res.status(400).json({ success: false, message: 'Weighing must be completed first' });
    }
    if (pickup.customerDecision?.status === 'disputed') {
      return res.status(400).json({ success: false, message: 'The customer disputed this amount. Re-weigh or contact support.' });
    }
    if (req.body.evidencePhotos) pickup.evidencePhotos = req.body.evidencePhotos.slice(0, 6);
    const done = await completePickup(
      pickup,
      { method: pickup.type === 'donation' ? null : req.body.payoutMethod, walletId: req.body.walletId, bankAccount: req.body.bankAccount },
      req.user
    );
    res.json({ success: true, data: { pickup: done } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
}

// Live location from the collector's browser. Pushed to customers following
// an on-the-way pickup, and to the admin live map.
async function updateLocation(req, res, next) {
  try {
    const { lat, lng } = req.body;
    const location = { lat, lng, updatedAt: new Date() };
    await User.updateOne({ _id: req.user._id }, { 'collectorProfile.location': location });
    const onTheWay = await Pickup.find({ collector: req.user._id, status: 'COLLECTOR_ON_THE_WAY' }).select('pickupId location').lean();
    onTheWay.forEach((p) => {
      const km = haversineKm(location, p.location);
      emitTo(`pickup:${p.pickupId}`, 'collector:location', {
        pickupId: p.pickupId,
        lat,
        lng,
        km: km && Math.round(km * 10) / 10,
        etaMinutes: etaMinutes(km),
        at: location.updatedAt,
      });
    });
    emitTo('role:admin', 'collector:location', { collectorId: String(req.user._id), name: req.user.name, lat, lng, at: location.updatedAt });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function updateAvailability(req, res, next) {
  try {
    const { isAvailable, workingHours, servicePinCodes } = req.body;
    const set = {};
    if (typeof isAvailable === 'boolean') set['collectorProfile.isAvailable'] = isAvailable;
    if (workingHours) set['collectorProfile.workingHours'] = workingHours;
    if (servicePinCodes) set['collectorProfile.servicePinCodes'] = [...new Set(servicePinCodes)];
    const user = await User.findByIdAndUpdate(req.user._id, set, { new: true });
    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

function weekStart(d) {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - day);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// Per-pickup commission, weekly bonus, and weekly statements.
async function earnings(req, res, next) {
  try {
    const cfg = await settings.get('collector');
    const me = await User.findById(req.user._id).lean();
    const percent = me.collectorProfile?.commissionRate ?? cfg.commissionPercent;
    const weeks = Math.min(12, Number(req.query.weeks) || 6);
    const since = weekStart(new Date(Date.now() - (weeks - 1) * 7 * 86400000));
    const done = await Pickup.find({ collector: req.user._id, status: 'COMPLETED', completedAt: { $gte: since } })
      .select('pickupId finalAmount completedAt addressSnapshot.locality')
      .sort({ completedAt: -1 })
      .lean();
    const byWeek = new Map();
    const lines = done.map((p) => {
      const commission = Math.round(cfg.baseFeePerPickup + ((p.finalAmount || 0) * percent) / 100);
      const wk = weekStart(p.completedAt).toISOString().slice(0, 10);
      const w = byWeek.get(wk) || { weekOf: wk, pickups: 0, commission: 0, collected: 0 };
      w.pickups += 1;
      w.commission += commission;
      w.collected += p.finalAmount || 0;
      byWeek.set(wk, w);
      return { pickupId: p.pickupId, completedAt: p.completedAt, finalAmount: p.finalAmount, commission, locality: p.addressSnapshot?.locality };
    });
    const statements = [...byWeek.values()]
      .map((w) => {
        const bonus = w.pickups >= cfg.weeklyBonusThreshold ? cfg.weeklyBonusAmount : 0;
        return { ...w, bonus, total: w.commission + bonus, collected: Math.round(w.collected) };
      })
      .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1));
    const thisWeek = statements.find((s) => s.weekOf === weekStart(new Date()).toISOString().slice(0, 10));
    res.json({
      success: true,
      data: {
        rules: { baseFeePerPickup: cfg.baseFeePerPickup, commissionPercent: percent, weeklyBonusThreshold: cfg.weeklyBonusThreshold, weeklyBonusAmount: cfg.weeklyBonusAmount },
        thisWeek: thisWeek || { pickups: 0, commission: 0, bonus: 0, total: 0 },
        toNextBonus: Math.max(0, cfg.weeklyBonusThreshold - (thisWeek?.pickups || 0)),
        statements,
        lines: lines.slice(0, 100),
        rating: me.collectorProfile?.rating || 0,
        ratingCount: me.collectorProfile?.ratingCount || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function catalogForWeighing(req, res, next) {
  try {
    const items = await ScrapItem.find({ isActive: true }).select('name unit').lean();
    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
}

async function notifyCustomerRunningLate(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase(), collector: req.user._id });
    if (!pickup) return res.status(404).json({ success: false, message: 'Pickup not found' });
    await notify(pickup.customer, {
      type: 'pickup.late',
      title: 'Your collector is running late',
      body: `${req.user.name} will reach about ${req.body.minutes || 15} minutes late for ${pickup.pickupId}. Sorry for the wait!`,
      link: `/pickups/${pickup.pickupId}`,
      channels: ['inapp', 'push', 'whatsapp'],
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAssignedPickups,
  dailyRoute,
  getAssignedPickup,
  updateStatus,
  verifyDoorOtp,
  submitWeighing,
  syncOffline,
  finishPickup,
  updateLocation,
  updateAvailability,
  earnings,
  catalogForWeighing,
  notifyCustomerRunningLate,
};
