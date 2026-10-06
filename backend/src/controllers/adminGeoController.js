// Admin: cities (price zones) and service areas (municipalities with wards and
// postal codes). Renaming a city updates every record that refers to it;
// deleting is only allowed when nothing depends on the record.
const ScrapPrice = require('../models/ScrapPrice');
const PriceHistory = require('../models/PriceHistory');
const Address = require('../models/Address');
const Pickup = require('../models/Pickup');
const User = require('../models/User');
const { City, ServiceArea, PriceAlert, Ngo, Quote } = require('../models/platform');
const { audit } = require('../services/auditService');
const { clearGeoCache, slugify, escapeRegex } = require('../services/cityService');
const { clearRateCache } = require('../services/rateService');
const { resetCatalogCache } = require('../services/chat/catalog');

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const ci = (s) => new RegExp(`^${escapeRegex(s)}$`, 'i');

function geoChanged() {
  clearGeoCache();
  clearRateCache();
  resetCatalogCache();
}

// Only one default city at a time.
async function makeDefault(cityId) {
  await City.updateMany({ _id: { $ne: cityId } }, { $set: { isDefault: false } });
}

// ---------- Cities ----------
async function listCities(req, res, next) {
  try {
    const [cities, areas, prices, collectors] = await Promise.all([
      City.find({}).sort({ sortOrder: 1, name: 1 }).lean(),
      ServiceArea.aggregate([{ $group: { _id: '$city', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }]),
      ScrapPrice.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$city', count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { role: 'collector', isActive: true } }, { $group: { _id: '$collectorProfile.city', count: { $sum: 1 } } }]),
    ]);
    const by = (rows) => Object.fromEntries(rows.map((r) => [String(r._id).toLowerCase(), r]));
    const a = by(areas);
    const p = by(prices);
    const c = by(collectors);
    res.json({
      success: true,
      data: {
        cities: cities.map((city) => {
          const k = city.name.toLowerCase();
          return {
            ...city,
            areaCount: a[k]?.total || 0,
            activeAreaCount: a[k]?.active || 0,
            pricedItems: p[k]?.count || 0,
            collectorCount: c[k]?.count || 0,
          };
        }),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function createCity(req, res, next) {
  try {
    const name = req.body.name.trim();
    if (await City.exists({ $or: [{ name: ci(name) }, { slug: slugify(name) }] })) return fail(res, 409, `${name} already exists`);
    const first = !(await City.exists({}));
    const city = await City.create({ ...req.body, name, slug: slugify(name), isDefault: first || Boolean(req.body.isDefault) });
    if (city.isDefault) await makeDefault(city._id);
    geoChanged();
    await audit(req, 'city.create', { entity: 'City', entityId: city._id, after: req.body });
    res.status(201).json({ success: true, data: { city } });
  } catch (err) {
    next(err);
  }
}

// Every record that stores a city by name.
async function renameCityEverywhere(from, to) {
  const m = { $regex: ci(from) };
  await Promise.all([
    ScrapPrice.updateMany({ city: m }, { $set: { city: to } }),
    PriceHistory.updateMany({ city: m }, { $set: { city: to } }),
    ServiceArea.updateMany({ city: m }, { $set: { city: to } }),
    Address.updateMany({ city: m }, { $set: { city: to } }),
    Pickup.updateMany({ $or: [{ city: m }, { 'addressSnapshot.city': m }] }, { $set: { city: to, 'addressSnapshot.city': to } }),
    User.updateMany({ 'collectorProfile.city': m }, { $set: { 'collectorProfile.city': to } }),
    PriceAlert.updateMany({ city: m }, { $set: { city: to } }),
    Quote.updateMany({ city: m }, { $set: { city: to } }),
    Ngo.updateMany({ cities: m }, { $set: { 'cities.$[c]': to } }, { arrayFilters: [{ c: m }] }),
  ]);
}

async function updateCity(req, res, next) {
  try {
    const city = await City.findById(req.params.id);
    if (!city) return fail(res, 404, 'City not found');
    const before = city.toObject();
    const { name, ...rest } = req.body;
    const renamed = name && name.trim() !== city.name;
    if (renamed) {
      const clash = await City.exists({ _id: { $ne: city._id }, $or: [{ name: ci(name.trim()) }, { slug: slugify(name) }] });
      if (clash) return fail(res, 409, `${name.trim()} already exists`);
    }
    if (rest.isDefault === false && city.isDefault) return fail(res, 400, 'Choose another default city instead of switching this one off');
    if (rest.isActive === false && (rest.isDefault ?? city.isDefault)) return fail(res, 400, 'The default city cannot be deactivated. Make another city the default first.');
    Object.assign(city, rest);
    if (renamed) {
      await renameCityEverywhere(city.name, name.trim());
      city.name = name.trim();
      city.slug = slugify(city.name);
    }
    await city.save();
    if (city.isDefault) await makeDefault(city._id);
    geoChanged();
    await audit(req, renamed ? 'city.rename' : 'city.update', { entity: 'City', entityId: city._id, before, after: req.body });
    res.json({ success: true, data: { city } });
  } catch (err) {
    next(err);
  }
}

async function deleteCity(req, res, next) {
  try {
    const city = await City.findById(req.params.id);
    if (!city) return fail(res, 404, 'City not found');
    if (city.isDefault) return fail(res, 400, 'Make another city the default before deleting this one');
    const m = ci(city.name);
    const [addresses, pickups, collectors] = await Promise.all([
      Address.countDocuments({ city: m }),
      Pickup.countDocuments({ $or: [{ city: m }, { 'addressSnapshot.city': m }] }),
      User.countDocuments({ role: 'collector', 'collectorProfile.city': m }),
    ]);
    if (addresses || pickups || collectors) {
      return fail(
        res,
        409,
        `${city.name} has ${pickups} pickups, ${addresses} saved addresses and ${collectors} collectors. Deactivate it instead so history stays intact.`
      );
    }
    // Nothing depends on it: remove the city with its areas and price list.
    await Promise.all([ServiceArea.deleteMany({ city: m }), ScrapPrice.deleteMany({ city: m }), PriceHistory.deleteMany({ city: m })]);
    await city.deleteOne();
    geoChanged();
    await audit(req, 'city.delete', { entity: 'City', entityId: city._id, before: city.toObject() });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ---------- Service areas ----------
function checkWards(body, wardsFallback) {
  const wards = body.wards ?? wardsFallback;
  if (body.servedWards?.some((w) => w > wards)) return `Served wards must be between 1 and ${wards}`;
  return null;
}

async function listAreas(req, res, next) {
  try {
    const filter = {};
    if (req.query.city) filter.city = ci(req.query.city);
    const areas = await ServiceArea.find(filter).sort({ city: 1, sortOrder: 1, name: 1 }).lean();
    const ids = areas.map((a) => a._id);
    const [addr, coll] = await Promise.all([
      Address.aggregate([{ $match: { area: { $in: ids } } }, { $group: { _id: '$area', count: { $sum: 1 } } }]),
      User.aggregate([
        { $match: { role: 'collector', isActive: true, 'collectorProfile.serviceAreas': { $in: ids } } },
        { $unwind: '$collectorProfile.serviceAreas' },
        { $group: { _id: '$collectorProfile.serviceAreas', count: { $sum: 1 } } },
      ]),
    ]);
    const a = Object.fromEntries(addr.map((r) => [String(r._id), r.count]));
    const c = Object.fromEntries(coll.map((r) => [String(r._id), r.count]));
    res.json({
      success: true,
      data: { areas: areas.map((x) => ({ ...x, addressCount: a[String(x._id)] || 0, collectorCount: c[String(x._id)] || 0 })) },
    });
  } catch (err) {
    next(err);
  }
}

async function createArea(req, res, next) {
  try {
    const city = await City.findOne({ name: ci(req.body.city) });
    if (!city) return fail(res, 400, 'Choose a city from the list (add the city first)');
    const problem = checkWards(req.body, req.body.wards);
    if (problem) return fail(res, 400, problem);
    if (await ServiceArea.exists({ city: city.name, name: ci(req.body.name) })) return fail(res, 409, `${req.body.name} already exists in ${city.name}`);
    const area = await ServiceArea.create({
      ...req.body,
      city: city.name,
      district: req.body.district || city.district,
      state: req.body.state || city.province,
      pinCodes: [...new Set(req.body.pinCodes || [])],
      servedWards: [...new Set(req.body.servedWards || [])].sort((x, y) => x - y),
    });
    geoChanged();
    await audit(req, 'area.create', { entity: 'ServiceArea', entityId: area._id, after: req.body });
    res.status(201).json({ success: true, data: { area } });
  } catch (err) {
    next(err);
  }
}

async function updateArea(req, res, next) {
  try {
    const area = await ServiceArea.findById(req.params.id);
    if (!area) return fail(res, 404, 'Area not found');
    const before = area.toObject();
    const body = { ...req.body };
    if (body.city) {
      const city = await City.findOne({ name: ci(body.city) });
      if (!city) return fail(res, 400, 'Choose a city from the list');
      body.city = city.name;
    }
    const problem = checkWards(body, area.wards);
    if (problem) return fail(res, 400, problem);
    const name = body.name ?? area.name;
    const cityName = body.city ?? area.city;
    if (await ServiceArea.exists({ _id: { $ne: area._id }, city: cityName, name: ci(name) })) return fail(res, 409, `${name} already exists in ${cityName}`);
    if (body.pinCodes) body.pinCodes = [...new Set(body.pinCodes)];
    if (body.servedWards) body.servedWards = [...new Set(body.servedWards)].sort((x, y) => x - y);
    if (body.wards && !body.servedWards) body.servedWards = area.servedWards.filter((w) => w <= body.wards);
    Object.assign(area, body);
    await area.save();
    // Keep saved addresses in step with the area's names.
    if (body.name || body.city || body.district || body.state) {
      const addresses = await Address.find({ area: area._id });
      for (const addr of addresses) {
        addr.municipality = area.name;
        addr.city = area.city;
        addr.district = area.district;
        addr.state = area.state;
        addr.locality = `${area.name}-${addr.ward}`;
        await addr.save();
      }
    }
    geoChanged();
    await audit(req, 'area.update', { entity: 'ServiceArea', entityId: area._id, before, after: req.body });
    res.json({ success: true, data: { area } });
  } catch (err) {
    next(err);
  }
}

async function deleteArea(req, res, next) {
  try {
    const area = await ServiceArea.findById(req.params.id);
    if (!area) return fail(res, 404, 'Area not found');
    const [addresses, pickups] = await Promise.all([Address.countDocuments({ area: area._id }), Pickup.countDocuments({ area: area._id })]);
    if (addresses || pickups) {
      return fail(res, 409, `${area.name} is used by ${addresses} saved addresses and ${pickups} pickups. Deactivate it instead.`);
    }
    await area.deleteOne();
    await User.updateMany({ 'collectorProfile.serviceAreas': area._id }, { $pull: { 'collectorProfile.serviceAreas': area._id } });
    geoChanged();
    await audit(req, 'area.delete', { entity: 'ServiceArea', entityId: area._id, before: area.toObject() });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listCities, createCity, updateCity, deleteCity, listAreas, createArea, updateArea, deleteArea, geoChanged };
