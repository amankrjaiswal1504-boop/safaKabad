const mongoose = require('mongoose');
const Pickup = require('../models/Pickup');
const settings = require('./settingsService');

const { TIMEZONE: TZ, UTC_OFFSET } = require('../config/locale');

function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function hourLocal() {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date()));
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Slot start hour from labels like "9:00 AM - 11:00 AM".
function slotStartHour(label) {
  const m = String(label).match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return 0;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  return h;
}

function dayRange(iso) {
  return { $gte: new Date(`${iso}T00:00:00.000Z`), $lte: new Date(`${iso}T23:59:59.999Z`) };
}

// Availability for a date: each slot with remaining capacity and why it's closed.
async function getAvailability(date, { areaId, pinCode, excludePickupId } = {}) {
  const cfg = await settings.get('slots');
  const today = todayLocal();
  const result = { date, open: true, reason: null, slots: [] };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return { ...result, open: false, reason: 'Invalid date' };
  if (date < today) return { ...result, open: false, reason: 'Date is in the past' };
  if (date > addDays(today, cfg.maxDaysAhead)) return { ...result, open: false, reason: `Book up to ${cfg.maxDaysAhead} days ahead` };
  if ((cfg.holidays || []).includes(date)) return { ...result, open: false, reason: 'Holiday: no pickups this day' };
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if ((cfg.closedWeekdays || []).includes(weekday)) return { ...result, open: false, reason: 'No pickups on this weekday' };

  const filter = { scheduledDate: dayRange(date), status: { $ne: 'CANCELLED' } };
  if (excludePickupId) filter.pickupId = { $ne: excludePickupId };
  // Capacity is per service area (municipality); per postal code for older
  // addresses without an area; otherwise global.
  if (areaId && mongoose.isValidObjectId(areaId)) filter.area = new mongoose.Types.ObjectId(String(areaId));
  else if (pinCode) filter.pinCode = pinCode;
  const booked = await Pickup.aggregate([{ $match: filter }, { $group: { _id: '$timeSlot', count: { $sum: 1 } } }]);
  const bookedBySlot = Object.fromEntries(booked.map((b) => [b._id, b.count]));

  const isToday = date === today;
  const nowHour = hourLocal();
  result.slots = cfg.slots.map(({ label, capacity }) => {
    const used = bookedBySlot[label] || 0;
    let reason = null;
    if (isToday && nowHour >= cfg.sameDayCutoffHour) reason = 'Same-day booking closed';
    else if (isToday && slotStartHour(label) <= nowHour + 1) reason = 'Too soon';
    else if (used >= capacity) reason = 'Fully booked';
    return { label, capacity, remaining: Math.max(0, capacity - used), available: !reason, reason };
  });
  if (!result.slots.some((s) => s.available)) {
    result.open = false;
    result.reason = 'No slots left on this day';
  }
  return result;
}

// Returns an error message, or null when the slot can be booked.
async function assertSlotAvailable(date, slot, opts) {
  const avail = await getAvailability(date, opts);
  if (!avail.slots.length) return avail.reason;
  const s = avail.slots.find((x) => x.label === slot);
  if (!s) return 'Choose one of the available time slots';
  if (!s.available) return `${slot}: ${s.reason}`;
  return null;
}

// Customers can reschedule/cancel freely until X hours before the slot starts.
async function canReschedule(pickup) {
  const cfg = await settings.get('slots');
  const day = new Date(pickup.scheduledDate).toISOString().slice(0, 10);
  const start = new Date(`${day}T${String(slotStartHour(pickup.timeSlot)).padStart(2, '0')}:00:00${UTC_OFFSET}`);
  return start.getTime() - Date.now() >= cfg.rescheduleCutoffHours * 3600000;
}

module.exports = { getAvailability, assertSlotAvailable, canReschedule, todayLocal, addDays, slotStartHour };
