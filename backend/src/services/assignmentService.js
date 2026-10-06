const User = require('../models/User');
const Pickup = require('../models/Pickup');
const settings = require('./settingsService');
const { escapeRegex } = require('./rateService');

function haversineKm(a, b) {
  if (a?.lat == null || b?.lat == null) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rough ETA from straight-line distance at city speed (~18 km/h incl. traffic).
function etaMinutes(km) {
  if (km == null) return null;
  return Math.max(2, Math.round((km * 1.3 * 60) / 18));
}

// Ranks available collectors for a pickup: serves the municipality (else the
// postal code, else the city), fewest pickups that day, then nearest. Best first.
async function rankCollectors(pickup) {
  const city = pickup.city || pickup.addressSnapshot?.city || '';
  const areaId = pickup.area || pickup.addressSnapshot?.area || null;
  const or = [{ 'collectorProfile.city': new RegExp(`^${escapeRegex(city)}$`, 'i') }];
  if (areaId) or.push({ 'collectorProfile.serviceAreas': areaId });
  if (pickup.pinCode) or.push({ 'collectorProfile.servicePinCodes': pickup.pinCode });
  const collectors = await User.find({
    role: 'collector',
    isActive: true,
    'collectorProfile.isAvailable': true,
    $or: or,
  }).lean();
  if (!collectors.length) return [];

  const day = new Date(pickup.scheduledDate).toISOString().slice(0, 10);
  const loads = await Pickup.aggregate([
    {
      $match: {
        collector: { $in: collectors.map((c) => c._id) },
        status: { $nin: ['COMPLETED', 'CANCELLED'] },
        scheduledDate: { $gte: new Date(`${day}T00:00:00Z`), $lte: new Date(`${day}T23:59:59Z`) },
      },
    },
    { $group: { _id: '$collector', count: { $sum: 1 } } },
  ]);
  const loadBy = Object.fromEntries(loads.map((l) => [String(l._id), l.count]));

  return collectors
    .map((c) => ({
      collector: c,
      load: loadBy[String(c._id)] || 0,
      km: haversineKm(c.collectorProfile?.location, pickup.location),
      servesArea: Boolean(areaId) && (c.collectorProfile?.serviceAreas || []).some((a) => String(a) === String(areaId)),
      servesPin: Boolean(pickup.pinCode) && (c.collectorProfile?.servicePinCodes || []).includes(pickup.pinCode),
    }))
    .sort(
      (a, b) =>
        Number(b.servesArea) - Number(a.servesArea) ||
        Number(b.servesPin) - Number(a.servesPin) ||
        a.load - b.load ||
        (a.km ?? 999) - (b.km ?? 999)
    );
}

// Assigns the best collector when auto-assignment is on. Admins can override.
async function autoAssign(pickup) {
  const cfg = await settings.get('collector');
  if (!cfg.autoAssign || pickup.collector) return null;
  const [best] = await rankCollectors(pickup);
  if (!best) return null;
  pickup.collector = best.collector._id;
  if (pickup.status === 'BOOKED') pickup.status = 'ASSIGNED';
  await pickup.save();
  return best.collector;
}

module.exports = { autoAssign, rankCollectors, haversineKm, etaMinutes };
