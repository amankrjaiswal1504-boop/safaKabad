const User = require('../models/User');
const Pickup = require('../models/Pickup');
const Payment = require('../models/Payment');
const { paginate, toCsv } = require('../utils/paginate');
const { escapeRegex } = require('../services/rateService');
const { audit } = require('../services/auditService');
const { rankCollectors, autoAssign } = require('../services/assignmentService');
const { pickupStatusChanged, notify } = require('../services/notificationService');
const { releaseCoupon } = require('../services/pickupService');
const { createPickupForUser, BookingError } = require('../services/bookingService');
const { STAFF_ROLES } = require('../models/User');
const { TIMEZONE, todayLocal } = require('../config/locale');

const ACTIVE = ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING'];
const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function dashboard(req, res, next) {
  try {
    const since = new Date(Date.now() - 29 * 86400000);
    since.setUTCHours(0, 0, 0, 0);
    const [totalCustomers, totalCollectors, pickupsByStatus, paid, daily, today, flagged] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'collector' }),
      Pickup.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { status: 'successful', direction: { $ne: 'collection' } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Pickup.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIMEZONE } },
            bookings: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
            value: { $sum: { $ifNull: ['$finalAmount', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Pickup.countDocuments({
        scheduledDate: (() => {
          // Pickup dates are stored as the Nepal calendar day at 00:00Z.
          const d = todayLocal();
          return { $gte: new Date(`${d}T00:00:00Z`), $lte: new Date(`${d}T23:59:59Z`) };
        })(),
        status: { $ne: 'CANCELLED' },
      }),
      Pickup.countDocuments({ flags: { $ne: [] }, status: { $in: ACTIVE } }),
    ]);
    const statusMap = Object.fromEntries(pickupsByStatus.map((s) => [s._id, s.count]));
    const totalPickups = Object.values(statusMap).reduce((a, b) => a + b, 0);
    res.json({
      success: true,
      data: {
        totalCustomers,
        totalCollectors,
        totalPickups,
        completedPickups: statusMap.COMPLETED || 0,
        pendingPickups: ACTIVE.reduce((a, s) => a + (statusMap[s] || 0), 0),
        unassigned: statusMap.BOOKED || 0,
        cancelledPickups: statusMap.CANCELLED || 0,
        totalAmountPaid: paid[0]?.total || 0,
        pickupsToday: today,
        flaggedActive: flagged,
        pickupsByStatus: statusMap,
        daily,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Users ----------
function userFilter(req, role) {
  const filter = { role };
  if (req.query.search) {
    const re = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ name: re }, { email: re }, { phone: re }];
  }
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;
  if (req.query.accountType) filter.accountType = req.query.accountType;
  if (req.query.city) filter['collectorProfile.city'] = new RegExp(`^${escapeRegex(req.query.city)}$`, 'i');
  return filter;
}

async function listUsers(req, res, next) {
  try {
    const filter = userFilter(req, 'customer');
    if (req.query.format === 'csv') {
      const users = await User.find(filter).sort({ createdAt: -1 }).limit(10000).lean();
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename="customers.csv"');
      return res.send(
        toCsv(users, [
          { label: 'Name', value: (u) => u.name },
          { label: 'Email', value: (u) => u.email },
          { label: 'Phone', value: (u) => u.phone },
          { label: 'Type', value: (u) => u.accountType },
          { label: 'Wallet', value: (u) => u.walletBalance },
          { label: 'Active', value: (u) => u.isActive },
          { label: 'Joined', value: (u) => new Date(u.createdAt).toISOString().slice(0, 10) },
        ])
      );
    }
    const { rows, pagination } = await paginate(User, filter, req, {
      select: 'name email phone isActive accountType business walletBalance createdAt lastLoginAt referralCode',
    });
    res.json({ success: true, data: { users: rows, pagination } });
  } catch (err) {
    next(err);
  }
}

async function toggleUserActive(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 404, 'User not found');
    if (user.role === 'admin') return fail(res, 400, 'Admins cannot be deactivated here');
    user.isActive = !user.isActive;
    await user.save();
    await audit(req, 'user.toggle_active', { entity: 'User', entityId: user._id, after: { isActive: user.isActive } });
    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

async function bulkUsers(req, res, next) {
  try {
    const { ids, action } = req.body;
    const isActive = action === 'activate';
    const result = await User.updateMany({ _id: { $in: ids }, role: { $ne: 'admin' } }, { isActive });
    await audit(req, `user.bulk_${action}`, { entity: 'User', after: { ids, count: result.modifiedCount } });
    res.json({ success: true, data: { modified: result.modifiedCount } });
  } catch (err) {
    next(err);
  }
}

async function setBusinessTier(req, res, next) {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'customer' });
    if (!user) return fail(res, 404, 'Customer not found');
    const before = user.business?.pricingTier;
    user.accountType = 'business';
    user.business = { ...user.business?.toObject?.(), pricingTier: req.body.pricingTier };
    await user.save();
    await audit(req, 'user.business_tier', { entity: 'User', entityId: user._id, before, after: req.body.pricingTier });
    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

// ---------- Collectors ----------
async function listCollectors(req, res, next) {
  try {
    const filter = userFilter(req, 'collector');
    if (req.query.available === 'true') filter['collectorProfile.isAvailable'] = true;
    const { rows, pagination } = await paginate(User, filter, req, { defaultSort: 'name', select: '-pushSubscriptions' });
    const active = await Pickup.aggregate([
      { $match: { collector: { $in: rows.map((r) => r._id) }, status: { $in: ACTIVE } } },
      { $group: { _id: '$collector', count: { $sum: 1 } } },
    ]);
    const activeBy = Object.fromEntries(active.map((a) => [String(a._id), a.count]));
    res.json({ success: true, data: { collectors: rows.map((c) => ({ ...c, activePickups: activeBy[String(c._id)] || 0 })), pagination } });
  } catch (err) {
    next(err);
  }
}

async function createCollector(req, res, next) {
  try {
    const { name, email, phone, password, city, vehicleNumber, servicePinCodes, commissionRate } = req.body;
    if (await User.exists({ email })) return fail(res, 409, 'Email already in use');
    const collector = await User.create({
      name,
      email,
      phone,
      password,
      role: 'collector',
      collectorProfile: { city, vehicleNumber, servicePinCodes: servicePinCodes || [], commissionRate: commissionRate ?? null },
    });
    await audit(req, 'collector.create', { entity: 'User', entityId: collector._id, after: { name, email, city } });
    res.status(201).json({ success: true, data: { collector: collector.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

async function updateCollector(req, res, next) {
  try {
    const collector = await User.findOne({ _id: req.params.id, role: 'collector' });
    if (!collector) return fail(res, 404, 'Collector not found');
    const before = { ...collector.collectorProfile.toObject(), isActive: collector.isActive };
    const { name, phone, city, vehicleNumber, isActive, isAvailable, servicePinCodes, commissionRate, workingHours } = req.body;
    if (name) collector.name = name;
    if (phone) collector.phone = phone;
    if (city) collector.collectorProfile.city = city;
    if (vehicleNumber !== undefined) collector.collectorProfile.vehicleNumber = vehicleNumber;
    if (typeof isActive === 'boolean') collector.isActive = isActive;
    if (typeof isAvailable === 'boolean') collector.collectorProfile.isAvailable = isAvailable;
    if (servicePinCodes) collector.collectorProfile.servicePinCodes = servicePinCodes;
    if (commissionRate !== undefined) collector.collectorProfile.commissionRate = commissionRate;
    if (workingHours) collector.collectorProfile.workingHours = workingHours;
    await collector.save();
    await audit(req, 'collector.update', { entity: 'User', entityId: collector._id, before, after: req.body });
    res.json({ success: true, data: { collector: collector.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

// ---------- Staff ----------
async function listStaff(req, res, next) {
  try {
    const staff = await User.find({ role: { $in: ['staff', 'admin'] } }).sort({ role: 1, name: 1 });
    res.json({ success: true, data: { staff: staff.map((s) => s.toSafeObject()), roles: STAFF_ROLES } });
  } catch (err) {
    next(err);
  }
}

async function createStaff(req, res, next) {
  try {
    const { name, email, phone, password, staffRole } = req.body;
    if (await User.exists({ email })) return fail(res, 409, 'Email already in use');
    const user = await User.create({ name, email, phone, password, role: 'staff', staffRole });
    await audit(req, 'staff.create', { entity: 'User', entityId: user._id, after: { email, staffRole } });
    res.status(201).json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

async function updateStaff(req, res, next) {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'staff' });
    if (!user) return fail(res, 404, 'Staff member not found');
    const before = { staffRole: user.staffRole, isActive: user.isActive };
    if (req.body.staffRole) user.staffRole = req.body.staffRole;
    if (typeof req.body.isActive === 'boolean') user.isActive = req.body.isActive;
    await user.save();
    await audit(req, 'staff.role_change', { entity: 'User', entityId: user._id, before, after: req.body });
    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

// ---------- Pickups ----------
function pickupFilter(req) {
  const filter = {};
  if (req.query.status === 'active') filter.status = { $in: ACTIVE };
  else if (req.query.status) filter.status = req.query.status;
  if (req.query.city) filter['addressSnapshot.city'] = new RegExp(`^${escapeRegex(req.query.city)}$`, 'i');
  if (req.query.collector === 'none') filter.collector = null;
  else if (req.query.collector) filter.collector = req.query.collector;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.flagged === 'true') filter.flags = { $ne: [] };
  if (req.query.search) {
    const re = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ pickupId: re }, { contactPhone: re }, { 'addressSnapshot.locality': re }, { pinCode: re }];
  }
  if (req.query.dateFrom || req.query.dateTo) {
    filter.scheduledDate = {};
    if (req.query.dateFrom) filter.scheduledDate.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter.scheduledDate.$lte = new Date(`${req.query.dateTo}T23:59:59Z`);
  }
  return filter;
}

async function listAllPickups(req, res, next) {
  try {
    const filter = pickupFilter(req);
    if (req.query.format === 'csv') {
      const rows = await Pickup.find(filter).populate('customer', 'name phone').populate('collector', 'name').sort({ createdAt: -1 }).limit(20000).lean();
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename="pickups.csv"');
      return res.send(
        toCsv(rows, [
          { label: 'Pickup ID', value: (p) => p.pickupId },
          { label: 'Status', value: (p) => p.status },
          { label: 'Type', value: (p) => p.type },
          { label: 'Customer', value: (p) => p.customer?.name },
          { label: 'Phone', value: (p) => p.contactPhone },
          { label: 'City', value: (p) => p.addressSnapshot?.city },
          { label: 'PIN', value: (p) => p.pinCode },
          { label: 'Date', value: (p) => new Date(p.scheduledDate).toISOString().slice(0, 10) },
          { label: 'Slot', value: (p) => p.timeSlot },
          { label: 'Collector', value: (p) => p.collector?.name },
          { label: 'Estimate min', value: (p) => p.estimatedValueMin },
          { label: 'Estimate max', value: (p) => p.estimatedValueMax },
          { label: 'Final amount', value: (p) => p.finalAmount },
          { label: 'Bonus', value: (p) => p.bonusAmount },
          { label: 'Payout', value: (p) => p.payout?.method },
          { label: 'Flags', value: (p) => (p.flags || []).join(' ') },
        ])
      );
    }
    const { rows, pagination } = await paginate(Pickup, filter, req, {
      populate: [
        { path: 'customer', select: 'name phone' },
        { path: 'collector', select: 'name phone' },
      ],
    });
    res.json({ success: true, data: { pickups: rows, pagination } });
  } catch (err) {
    next(err);
  }
}

async function getPickupAdmin(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase() })
      .populate('customer', 'name phone email accountType')
      .populate('collector', 'name phone collectorProfile.rating')
      .populate('ngo', 'name')
      .populate('review');
    if (!pickup) return fail(res, 404, 'Pickup not found');
    const candidates = ACTIVE.includes(pickup.status) ? await rankCollectors(pickup) : [];
    res.json({
      success: true,
      data: {
        pickup,
        candidates: candidates.slice(0, 5).map((c) => ({ id: c.collector._id, name: c.collector.name, load: c.load, km: c.km && Math.round(c.km * 10) / 10, servesPin: c.servesPin })),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function assignTo(pickup, collector, req) {
  const before = pickup.collector;
  pickup.collector = collector._id;
  if (pickup.status === 'BOOKED') pickup.status = 'ASSIGNED';
  pickup.$locals.changedBy = req.user._id;
  await pickup.save();
  await audit(req, 'pickup.assign', { entity: 'Pickup', entityId: pickup.pickupId, before, after: collector._id });
  await pickupStatusChanged(pickup, { collectorName: collector.name });
  await notify(collector._id, {
    type: 'collector.assigned',
    title: 'New pickup assigned',
    body: `${pickup.pickupId} · ${pickup.timeSlot} · ${pickup.addressSnapshot?.locality || ''}`,
    link: `/collector/pickups/${pickup.pickupId}`,
    channels: ['inapp', 'push', 'whatsapp'],
  });
}

// Manual assignment (admin override of auto-assignment).
async function assignCollector(req, res, next) {
  try {
    const { pickupId, collectorId } = req.body;
    const pickup = await Pickup.findOne({ pickupId });
    if (!pickup) return fail(res, 404, 'Pickup not found');
    if (!ACTIVE.includes(pickup.status)) return fail(res, 400, `Pickup is ${pickup.status}`);
    const collector = await User.findOne({ _id: collectorId, role: 'collector', isActive: true });
    if (!collector) return fail(res, 404, 'Collector not found or inactive');
    await assignTo(pickup, collector, req);
    res.json({ success: true, data: { pickup } });
  } catch (err) {
    next(err);
  }
}

async function autoAssignPickup(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase() });
    if (!pickup) return fail(res, 404, 'Pickup not found');
    pickup.collector = null;
    const [best] = await rankCollectors(pickup);
    if (!best) return fail(res, 404, 'No available collector serves this area');
    await assignTo(pickup, best.collector, req);
    res.json({ success: true, data: { pickup, collector: { id: best.collector._id, name: best.collector.name } } });
  } catch (err) {
    next(err);
  }
}

async function adminUpdatePickupStatus(req, res, next) {
  try {
    const pickup = await Pickup.findOne({ pickupId: req.params.id.toUpperCase() });
    if (!pickup) return fail(res, 404, 'Pickup not found');
    const before = pickup.status;
    if (req.body.status === 'CANCELLED') {
      pickup.cancelReason = req.body.reason || 'Cancelled by ScrapMate';
      pickup.cancelledBy = 'admin';
      await releaseCoupon(pickup);
    }
    pickup.status = req.body.status;
    pickup.$locals.changedBy = req.user._id;
    await pickup.save();
    await audit(req, 'pickup.status', { entity: 'Pickup', entityId: pickup.pickupId, before, after: pickup.status });
    await pickupStatusChanged(pickup);
    res.json({ success: true, data: { pickup } });
  } catch (err) {
    next(err);
  }
}

async function bulkPickups(req, res, next) {
  try {
    const { pickupIds, action, collectorId, reason } = req.body;
    const pickups = await Pickup.find({ pickupId: { $in: pickupIds }, status: { $in: ACTIVE } });
    let done = 0;
    if (action === 'assign') {
      const collector = await User.findOne({ _id: collectorId, role: 'collector', isActive: true });
      if (!collector) return fail(res, 404, 'Collector not found');
      for (const p of pickups) {
        await assignTo(p, collector, req);
        done += 1;
      }
    } else if (action === 'auto-assign') {
      for (const p of pickups) {
        const c = await autoAssign(p);
        if (c) {
          done += 1;
          await pickupStatusChanged(p, { collectorName: c.name });
        }
      }
    } else if (action === 'cancel') {
      for (const p of pickups) {
        p.status = 'CANCELLED';
        p.cancelReason = reason || 'Cancelled by ScrapMate';
        p.cancelledBy = 'admin';
        p.$locals.changedBy = req.user._id;
        await p.save();
        await releaseCoupon(p);
        await pickupStatusChanged(p);
        done += 1;
      }
    }
    await audit(req, `pickup.bulk_${action}`, { entity: 'Pickup', after: { pickupIds, done } });
    res.json({ success: true, data: { processed: done } });
  } catch (err) {
    next(err);
  }
}

// Book on behalf of a customer (phone orders).
async function adminCreatePickup(req, res, next) {
  try {
    const customer = await User.findOne({ _id: req.body.customerId, role: 'customer' });
    if (!customer) return fail(res, 404, 'Customer not found');
    const pickup = await createPickupForUser(customer, { ...req.body, source: 'admin', skipSlotCheck: Boolean(req.body.overrideSlot) }, { actor: req.user });
    await audit(req, 'pickup.create_for_customer', { entity: 'Pickup', entityId: pickup.pickupId });
    res.status(201).json({ success: true, data: { pickup } });
  } catch (err) {
    if (err instanceof BookingError || err.status) return fail(res, err.status || 400, err.message);
    next(err);
  }
}

// Dispatch board: active pickups grouped by status (kanban) for a date range.
async function dispatchBoard(req, res, next) {
  try {
    const filter = { status: { $in: ACTIVE } };
    if (req.query.date) {
      filter.scheduledDate = { $gte: new Date(`${req.query.date}T00:00:00Z`), $lte: new Date(`${req.query.date}T23:59:59Z`) };
    }
    if (req.query.city) filter['addressSnapshot.city'] = new RegExp(`^${escapeRegex(req.query.city)}$`, 'i');
    const pickups = await Pickup.find(filter)
      .populate('customer', 'name phone')
      .populate('collector', 'name')
      .sort({ scheduledDate: 1, timeSlot: 1 })
      .limit(500)
      .lean();
    const columns = Object.fromEntries(ACTIVE.map((s) => [s, []]));
    pickups.forEach((p) => columns[p.status].push(p));
    res.json({ success: true, data: { columns } });
  } catch (err) {
    next(err);
  }
}

// Live map: collectors with recent locations + today's active pickups.
async function liveMap(req, res, next) {
  try {
    const [collectors, pickups] = await Promise.all([
      User.find({ role: 'collector', isActive: true, 'collectorProfile.location.lat': { $exists: true } })
        .select('name phone collectorProfile.location collectorProfile.isAvailable collectorProfile.city')
        .lean(),
      Pickup.find({ status: { $in: ACTIVE }, 'location.lat': { $exists: true }, scheduledDate: { $lte: new Date(Date.now() + 86400000) } })
        .select('pickupId status location addressSnapshot.locality timeSlot collector')
        .populate('collector', 'name')
        .limit(500)
        .lean(),
    ]);
    res.json({ success: true, data: { collectors, pickups } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  dashboard,
  listUsers,
  toggleUserActive,
  bulkUsers,
  setBusinessTier,
  listCollectors,
  createCollector,
  updateCollector,
  listStaff,
  createStaff,
  updateStaff,
  listAllPickups,
  getPickupAdmin,
  assignCollector,
  autoAssignPickup,
  adminUpdatePickupStatus,
  bulkPickups,
  adminCreatePickup,
  dispatchBoard,
  liveMap,
};
