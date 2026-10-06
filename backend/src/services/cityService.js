// Cities (price zones) and their service areas (municipalities): the single
// source of truth for "where do we operate". Everything that needs a city
// list, the default city, or "can we pick up from this address" reads it here.
const mongoose = require('mongoose');
const { City, ServiceArea } = require('../models/platform');
const { POSTAL_CODE_RE } = require('../config/locale');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Small cache; admin changes call clearGeoCache().
let cache = null;
let cacheAt = 0;
const TTL_MS = 30 * 1000;
function clearGeoCache() {
  cache = null;
}

async function load() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const [cities, areas] = await Promise.all([
    City.find({}).sort({ sortOrder: 1, name: 1 }).lean(),
    ServiceArea.find({}).sort({ sortOrder: 1, name: 1 }).lean(),
  ]);
  cache = { cities, areas };
  cacheAt = Date.now();
  return cache;
}

// Active cities, default first.
async function listCities({ includeInactive = false } = {}) {
  const { cities } = await load();
  const list = includeInactive ? cities : cities.filter((c) => c.isActive);
  return [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

async function cityNames() {
  return (await listCities()).map((c) => c.name);
}

// The admin-chosen default city, else the first active one, else null.
async function defaultCity() {
  const [first] = await listCities();
  return first ? first.name : null;
}

// Canonical name of an active city (case-insensitive), or null.
async function findCity(name, { includeInactive = false } = {}) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  const city = (await listCities({ includeInactive })).find((c) => c.name.toLowerCase() === n || c.slug === slugify(name));
  return city || null;
}

// Active areas whose city is also active (optionally for one city).
async function listAreas({ city, includeInactive = false } = {}) {
  const { areas } = await load();
  const activeCities = new Set((await listCities()).map((c) => c.name));
  return areas.filter(
    (a) => (includeInactive || (a.isActive && activeCities.has(a.city))) && (!city || a.city.toLowerCase() === String(city).toLowerCase())
  );
}

async function getArea(id, { includeInactive = false } = {}) {
  if (!mongoose.isValidObjectId(id)) return null;
  const { areas } = await load();
  const area = areas.find((a) => String(a._id) === String(id));
  if (!area) return null;
  if (includeInactive) return area;
  const city = await findCity(area.city);
  return area.isActive && city ? area : null;
}

const wardServed = (area, ward) => !area.servedWards?.length || area.servedWards.includes(Number(ward));
const areaSummary = (a) => ({
  _id: a._id,
  name: a.name,
  city: a.city,
  minPickupWeightKg: a.minPickupWeightKg,
  minPickupValue: a.minPickupValue,
});

// Can we pick up from this area/ward?
async function checkArea(areaId, ward) {
  const area = await getArea(areaId);
  if (!area) return { serviceable: false, area: null, reason: "We don't pick up from this area yet." };
  if (ward != null && !wardServed(area, ward)) {
    return { serviceable: false, area: areaSummary(area), reason: `We don't pick up from ward ${ward} of ${area.name} yet.` };
  }
  return { serviceable: true, area: areaSummary(area), reason: null };
}

// Older addresses without an area: match by postal code, then by city.
async function checkPin(pinCode, city) {
  const pin = String(pinCode || '').trim();
  const areas = await listAreas();
  if (!areas.length) return { serviceable: false, area: null, reason: "We're not taking pickups yet." };
  let area = pin ? areas.find((a) => a.pinCodes.includes(pin)) : null;
  if (!area && city) area = areas.find((a) => a.city.toLowerCase() === String(city).toLowerCase() || a.name.toLowerCase() === String(city).toLowerCase());
  if (!area) return { serviceable: false, area: null, reason: `We don't pick up from ${pin || city || 'this area'} yet.` };
  return { serviceable: true, area: areaSummary(area), reason: null };
}

async function checkAddress(address) {
  if (address?.area) return checkArea(address.area, address.ward);
  return checkPin(address?.pinCode, address?.city);
}

class AddressError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Builds a full address from the customer's choice of area + ward and what
// they typed (tole, house, landmark). City, district, province and postal code
// always come from the area, so they can't be mistyped.
async function resolveAddress(input, { partialOf } = {}) {
  const areaId = input.areaId ?? partialOf?.area;
  const area = await getArea(areaId);
  if (!area) throw new AddressError('Choose your municipality from the list');
  const ward = Number(input.ward ?? partialOf?.ward);
  if (!Number.isInteger(ward) || ward < 1 || ward > area.wards) throw new AddressError(`Choose a ward between 1 and ${area.wards}`);
  let pinCode = input.pinCode ?? (partialOf && String(partialOf.area) === String(area._id) ? partialOf.pinCode : undefined);
  if (area.pinCodes.length) {
    if (!pinCode || !area.pinCodes.includes(pinCode)) pinCode = area.pinCodes[0];
  } else if (!pinCode || !POSTAL_CODE_RE.test(pinCode)) {
    throw new AddressError('Enter the 5-digit postal code');
  }
  const out = {
    area: area._id,
    ward,
    municipality: area.name,
    district: area.district,
    city: area.city,
    state: area.state,
    locality: `${area.name}-${ward}`,
    pinCode,
  };
  for (const f of ['houseNumber', 'street', 'landmark', 'addressType', 'isDefault', 'location']) {
    if (input[f] !== undefined) out[f] = input[f];
  }
  if (!out.location && !partialOf?.location?.lat && area.center?.lat) out.location = { lat: area.center.lat, lng: area.center.lng };
  return out;
}

module.exports = {
  listCities,
  cityNames,
  defaultCity,
  findCity,
  listAreas,
  getArea,
  checkArea,
  checkPin,
  checkAddress,
  resolveAddress,
  wardServed,
  clearGeoCache,
  slugify,
  escapeRegex,
  AddressError,
};
