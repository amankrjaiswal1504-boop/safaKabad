// Analytics (with CSV/PDF export), CMS settings, audit log, fraud blocklist.
const Pickup = require('../models/Pickup');
const User = require('../models/User');
const ScrapPrice = require('../models/ScrapPrice');
const { AuditLog, Blocklist, AnalyticsEvent, Review } = require('../models/platform');
const settings = require('../services/settingsService');
const { audit } = require('../services/auditService');
const { paginate, toCsv } = require('../utils/paginate');
const { reportPdf, rs } = require('../services/pdfService');
const { escapeRegex } = require('../services/rateService');
const reports = require('../services/reportService');
const { emailEnabled } = require('../services/channels');

const fail = (res, status, message) => res.status(status).json({ success: false, message });

async function buildAnalytics({ days, city }) {
  const since = new Date(Date.now() - days * 86400000);
  const match = { createdAt: { $gte: since } };
  if (city) match['addressSnapshot.city'] = new RegExp(`^${escapeRegex(city)}$`, 'i');
  const completedMatch = { ...match, status: 'COMPLETED' };
  delete completedMatch.createdAt;
  completedMatch.completedAt = { $gte: since };

  const cfg = await settings.get('collector');
  const completed = await Pickup.find(completedMatch)
    .select('items finalAmount bonusAmount addressSnapshot.city pinCode timeSlot collector customer completedAt')
    .lean();

  // Margin = what recyclers pay us - what we paid customers - collector commission.
  const priceKeys = new Set();
  completed.forEach((p) => p.items.forEach((i) => priceKeys.add(`${i.item}|${p.addressSnapshot?.city}`)));
  const prices = await ScrapPrice.find({ $or: [...priceKeys].map((k) => ({ item: k.split('|')[0], city: k.split('|')[1] })) })
    .select('item city recyclerPrice')
    .lean()
    .catch(() => []);
  const recyclerBy = Object.fromEntries(prices.map((p) => [`${p.item}|${p.city}`, p.recyclerPrice]));

  const daily = {};
  const items = {};
  let payout = 0;
  let recyclerValue = 0;
  let commission = 0;
  let weight = 0;
  let missingRecyclerPrice = 0;
  for (const p of completed) {
    const day = new Date(p.completedAt).toISOString().slice(0, 10);
    const d = (daily[day] ||= { date: day, completed: 0, payout: 0, recyclerValue: 0, margin: 0 });
    const paid = (p.finalAmount || 0) + (p.bonusAmount || 0);
    const fee = cfg.baseFeePerPickup + ((p.finalAmount || 0) * cfg.commissionPercent) / 100;
    let rv = 0;
    p.items.forEach((i) => {
      const r = recyclerBy[`${i.item}|${p.addressSnapshot?.city}`];
      if (r == null) missingRecyclerPrice += 1;
      rv += (r || 0) * (i.actualWeight || 0);
      const it = (items[i.itemName] ||= { item: i.itemName, weight: 0, value: 0, pickups: 0 });
      it.weight += i.actualWeight || 0;
      it.value += i.subtotal || 0;
      it.pickups += 1;
      weight += i.actualWeight || 0;
    });
    d.completed += 1;
    d.payout += paid;
    d.recyclerValue += rv;
    d.margin += rv - paid - fee;
    payout += paid;
    recyclerValue += rv;
    commission += fee;
  }

  const [byArea, bySlot, collectors, repeat, funnelEvents, bookings, cancelled] = await Promise.all([
    Pickup.aggregate([{ $match: match }, { $group: { _id: { city: '$addressSnapshot.city', pin: '$pinCode' }, pickups: { $sum: 1 } } }, { $sort: { pickups: -1 } }, { $limit: 20 }]),
    Pickup.aggregate([{ $match: match }, { $group: { _id: '$timeSlot', pickups: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Pickup.aggregate([
      { $match: { ...match, collector: { $ne: null } } },
      {
        $group: {
          _id: '$collector',
          assigned: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$cancelledBy', 'collector'] }, 1, 0] } },
          value: { $sum: { $ifNull: ['$finalAmount', 0] } },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $unwind: '$u' },
      { $project: { name: '$u.name', rating: '$u.collectorProfile.rating', assigned: 1, completed: 1, cancelled: 1, value: 1 } },
      { $sort: { completed: -1 } },
    ]),
    Pickup.aggregate([{ $match: { status: 'COMPLETED' } }, { $group: { _id: '$customer', n: { $sum: 1 } } }, { $group: { _id: null, customers: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gte: ['$n', 2] }, 1, 0] } } } }]),
    AnalyticsEvent.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
    Pickup.countDocuments(match),
    Pickup.countDocuments({ ...match, status: 'CANCELLED' }),
  ]);
  const ev = Object.fromEntries(funnelEvents.map((e) => [e._id, e.count]));

  return {
    days,
    city: city || null,
    totals: {
      bookings,
      completed: completed.length,
      cancelled,
      cancellationRate: bookings ? cancelled / bookings : 0,
      weightKg: Math.round(weight),
      payout: Math.round(payout),
      recyclerValue: Math.round(recyclerValue),
      collectorCommission: Math.round(commission),
      margin: Math.round(recyclerValue - payout - commission),
      marginPercent: recyclerValue ? (recyclerValue - payout - commission) / recyclerValue : null,
      avgPickupValue: completed.length ? Math.round(payout / completed.length) : 0,
      repeatCustomerRate: repeat[0]?.customers ? repeat[0].repeat / repeat[0].customers : 0,
      missingRecyclerPrice,
    },
    daily: Object.values(daily).sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({ ...d, payout: Math.round(d.payout), recyclerValue: Math.round(d.recyclerValue), margin: Math.round(d.margin) })),
    topItems: Object.values(items).sort((a, b) => b.weight - a.weight).slice(0, 12).map((i) => ({ ...i, weight: Math.round(i.weight * 10) / 10, value: Math.round(i.value) })),
    byArea: byArea.map((a) => ({ city: a._id.city, pinCode: a._id.pin, pickups: a.pickups })),
    bySlot: bySlot.map((s) => ({ slot: s._id, pickups: s.pickups })),
    collectors,
    funnel: [
      { step: 'Visits', count: ev.visit || 0 },
      { step: 'Estimates', count: ev.estimate || 0 },
      { step: 'Booking started', count: ev.booking_started || 0 },
      { step: 'Bookings', count: bookings },
      { step: 'Completed', count: completed.length },
    ],
  };
}

async function analytics(req, res, next) {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const data = await buildAnalytics({ days, city: req.query.city });
    if (req.query.format === 'csv') {
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="scrapmate-analytics-${days}d.csv"`);
      return res.send(
        toCsv(data.daily, [
          { label: 'Date', value: (d) => d.date },
          { label: 'Completed pickups', value: (d) => d.completed },
          { label: 'Paid to customers', value: (d) => d.payout },
          { label: 'Recycler value', value: (d) => d.recyclerValue },
          { label: 'Margin', value: (d) => d.margin },
        ])
      );
    }
    if (req.query.format === 'pdf') {
      const t = data.totals;
      const pdf = await reportPdf({
        title: 'Operations report',
        subtitle: `Last ${days} days${data.city ? ` · ${data.city}` : ''}`,
        sections: [
          {
            heading: 'Summary',
            rows: [
              ['Bookings', String(t.bookings)],
              ['Completed', String(t.completed)],
              ['Cancellation rate', `${Math.round(t.cancellationRate * 100)}%`],
              ['Scrap collected', `${t.weightKg} kg`],
              ['Paid to customers', rs(t.payout)],
              ['Recycler value', rs(t.recyclerValue)],
              ['Collector commission', rs(t.collectorCommission)],
              ['Margin', `${rs(t.margin)}${t.marginPercent != null ? ` (${Math.round(t.marginPercent * 100)}%)` : ''}`],
              ['Repeat customers', `${Math.round(t.repeatCustomerRate * 100)}%`],
            ],
          },
          { heading: 'Funnel', rows: data.funnel.map((f) => [f.step, String(f.count)]) },
          { heading: 'Top items (kg / value)', table: data.topItems.map((i) => [i.item, `${i.weight} kg`, rs(i.value)]) },
          { heading: 'Collectors', table: data.collectors.map((c) => [c.name, `${c.completed}/${c.assigned} done`, `rating ${c.rating || '-'}`, rs(c.value)]) },
          { heading: 'Busiest areas', table: data.byArea.map((a) => [a.city || '-', a.pinCode || '-', `${a.pickups} pickups`]) },
        ],
      });
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `attachment; filename="scrapmate-report-${days}d.pdf"`);
      return res.send(pdf);
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ---------- Settings (CMS) ----------
async function getSettings(req, res, next) {
  try {
    res.json({ success: true, data: { settings: await settings.getAll() } });
  } catch (err) {
    next(err);
  }
}
async function updateSetting(req, res, next) {
  try {
    const before = await settings.get(req.params.key);
    const value = await settings.set(req.params.key, req.body.value, req.user._id);
    await audit(req, `settings.${req.params.key}`, { entity: 'Setting', entityId: req.params.key, before, after: value });
    res.json({ success: true, data: { key: req.params.key, value } });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

// ---------- Audit log ----------
async function auditLog(req, res, next) {
  try {
    const filter = {};
    if (req.query.action) filter.action = new RegExp(`^${escapeRegex(req.query.action)}`);
    if (/^[a-f\d]{24}$/i.test(req.query.actor || '')) filter.actor = req.query.actor;
    const { rows, pagination } = await paginate(AuditLog, filter, req);
    res.json({ success: true, data: { entries: rows, pagination } });
  } catch (err) {
    next(err);
  }
}

// ---------- Fraud & abuse ----------
async function listBlocklist(req, res, next) {
  try {
    const [entries, flagged, frequentCancellers] = await Promise.all([
      Blocklist.find({}).populate('addedBy', 'name').sort({ createdAt: -1 }),
      Pickup.find({ flags: { $ne: [] } }).populate('customer', 'name phone').sort({ createdAt: -1 }).limit(50).lean(),
      Pickup.aggregate([
        { $match: { status: 'CANCELLED', cancelledBy: 'customer', updatedAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
        { $group: { _id: '$customer', cancellations: { $sum: 1 } } },
        { $match: { cancellations: { $gte: 2 } } },
        { $sort: { cancellations: -1 } },
        { $limit: 20 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $unwind: '$u' },
        { $project: { cancellations: 1, name: '$u.name', phone: '$u.phone' } },
      ]),
    ]);
    res.json({ success: true, data: { entries, flagged, frequentCancellers } });
  } catch (err) {
    next(err);
  }
}
async function addBlock(req, res, next) {
  try {
    const entry = await Blocklist.create({ ...req.body, addedBy: req.user._id });
    await audit(req, 'blocklist.add', { entity: 'Blocklist', entityId: entry._id, after: req.body });
    // Blocking a phone also deactivates matching accounts.
    if (entry.type === 'phone') await User.updateMany({ phone: entry.value, role: 'customer' }, { isActive: false });
    if (entry.type === 'email') await User.updateMany({ email: entry.value, role: 'customer' }, { isActive: false });
    res.status(201).json({ success: true, data: { entry } });
  } catch (err) {
    next(err);
  }
}
async function removeBlock(req, res, next) {
  try {
    const entry = await Blocklist.findByIdAndDelete(req.params.id);
    if (!entry) return fail(res, 404, 'Entry not found');
    await audit(req, 'blocklist.remove', { entity: 'Blocklist', entityId: entry._id, before: entry.toObject() });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
async function clearFlags(req, res, next) {
  try {
    await Pickup.updateOne({ pickupId: req.params.id.toUpperCase() }, { flags: [] });
    await audit(req, 'pickup.clear_flags', { entity: 'Pickup', entityId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function reviewSummary() {
  return Review.countDocuments({ status: 'pending' });
}

// Daily pickup report: status for the settings card, and a send-now test.
async function dailyReportStatus(req, res, next) {
  try {
    res.json({ success: true, data: { lastSentDay: await reports.lastSentDay(), emailConfigured: emailEnabled() } });
  } catch (err) {
    next(err);
  }
}
async function sendDailyReportNow(req, res, next) {
  try {
    const out = await reports.sendDailyReport();
    await audit(req, 'reports.daily.test', { entity: 'Setting', entityId: 'reports', after: { to: out.to, cc: out.cc } });
    res.json({ success: true, data: out });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

module.exports = { dailyReportStatus, sendDailyReportNow, analytics, getSettings, updateSetting, auditLog, listBlocklist, addBlock, removeBlock, clearFlags, buildAnalytics, reviewSummary };
