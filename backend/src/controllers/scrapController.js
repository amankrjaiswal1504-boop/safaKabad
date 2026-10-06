const ScrapCategory = require('../models/ScrapCategory');
const ScrapItem = require('../models/ScrapItem');
const ScrapPrice = require('../models/ScrapPrice');
const PriceHistory = require('../models/PriceHistory');
const Pickup = require('../models/Pickup');
const User = require('../models/User');
const { Review } = require('../models/platform');
const { fetchRates, estimateItems, listServiceCities } = require('../services/rateService');
const { computeImpact } = require('../services/impactService');
const settings = require('../services/settingsService');
const { track } = require('../services/jobs');
const { findCity, defaultCity, listAreas } = require('../services/cityService');

// The requested city if we operate there, else the default city when none was
// asked for. Unknown cities resolve to null (empty results, never a guess).
async function resolveCity(name) {
  if (name) return (await findCity(name))?.name || null;
  return defaultCity();
}

async function getCategories(req, res, next) {
  try {
    const categories = await ScrapCategory.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
    const counts = await ScrapItem.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$category', count: { $sum: 1 } } }]);
    const countBy = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
    res.json({ success: true, data: { categories: categories.map((c) => ({ ...c, itemCount: countBy[String(c._id)] || 0 })) } });
  } catch (err) {
    next(err);
  }
}

async function getItems(req, res, next) {
  try {
    const filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;
    const items = await ScrapItem.find(filter).populate('category', 'name slug conditionGrading').sort({ name: 1 });
    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
}

// Items + their price range for a given city. Powers the public rates page.
async function getRates(req, res, next) {
  try {
    const city = await resolveCity(req.query.city);
    const rates = await fetchRates({
      city,
      search: req.query.search,
      category: req.query.category,
    });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      success: true,
      data: {
        city,
        rates,
        disclaimer: 'Indicative price. Final value depends on actual weight/condition and verification.',
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getCities(req, res, next) {
  try {
    res.json({ success: true, data: { cities: await listServiceCities() } });
  } catch (err) {
    next(err);
  }
}

// Public instant estimate (home page + wizard). Never trusts client prices.
async function estimate(req, res, next) {
  try {
    const { items } = req.body;
    const city = await resolveCity(req.body.city);
    if (!city) return res.status(400).json({ success: false, message: "We don't operate in this city yet" });
    const result = await estimateItems(items, city, {
      conditionMultipliers: await settings.get('conditionMultipliers'),
    });
    await track('estimate', { user: req.user?._id, sessionId: req.get('x-session-id'), city });
    res.json({
      success: true,
      data: {
        city,
        min: result.min,
        max: result.max,
        weightKg: result.weightKg,
        unpriced: result.unpriced,
        lines: result.lines.map((l) => ({
          itemId: l.item._id,
          name: l.item.name,
          unit: l.item.unit,
          quantity: l.quantity,
          condition: l.condition,
          priced: l.priced,
          min: l.min,
          max: l.max,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

// Price history for one item in one city (rate trends chart).
async function getTrend(req, res, next) {
  try {
    const city = await resolveCity(req.query.city);
    if (!city) return res.status(404).json({ success: false, message: "We don't operate in this city yet" });
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 180));
    const item = await ScrapItem.findById(req.params.itemId).select('name unit');
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    const current = await ScrapPrice.findOne({ item: item._id, city }).lean();
    const history = await PriceHistory.find({
      item: item._id,
      city,
      createdAt: { $gte: new Date(Date.now() - days * 86400000) },
    })
      .sort({ createdAt: 1 })
      .select('newMinPrice newMaxPrice oldMinPrice oldMaxPrice createdAt')
      .lean();
    const points = [];
    if (history.length && history[0].oldMinPrice != null) {
      points.push({ date: new Date(Date.now() - days * 86400000), min: history[0].oldMinPrice, max: history[0].oldMaxPrice });
    }
    history.forEach((h) => points.push({ date: h.createdAt, min: h.newMinPrice, max: h.newMaxPrice }));
    if (current) points.push({ date: new Date(), min: current.minPrice, max: current.maxPrice });
    res.json({ success: true, data: { item, city, points } });
  } catch (err) {
    next(err);
  }
}

// Real numbers for the home page (admin can override for launch marketing).
async function publicStats(req, res, next) {
  try {
    const home = await settings.get('home');
    if (home.statsOverride?.enabled) {
      const o = home.statsOverride;
      return res.json({ success: true, data: { kgRecycled: o.kgRecycled, pickups: o.pickups, cities: o.cities, areas: (await listAreas()).length, rating: o.rating, customers: null } });
    }
    const [impact, cities, areas, ratingAgg, customers] = await Promise.all([
      computeImpact({}),
      listServiceCities(),
      listAreas(),
      Review.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]),
      User.countDocuments({ role: 'customer' }),
    ]);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      success: true,
      data: {
        kgRecycled: impact.kg,
        co2Kg: impact.co2Kg,
        pickups: await Pickup.countDocuments({ status: 'COMPLETED' }),
        cities: cities.length,
        areas: areas.length,
        rating: ratingAgg[0] ? Math.round(ratingAgg[0].avg * 10) / 10 : null,
        ratingCount: ratingAgg[0]?.n || 0,
        customers,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCategories, getItems, getRates, getCities, estimate, getTrend, publicStats };
