// Categories, items, city prices (with history) and serviceable areas.
const ScrapCategory = require('../models/ScrapCategory');
const ScrapItem = require('../models/ScrapItem');
const ScrapPrice = require('../models/ScrapPrice');
const PriceHistory = require('../models/PriceHistory');
const { findCity } = require('../services/cityService');
const { audit } = require('../services/auditService');
const { clearRateCache, escapeRegex } = require('../services/rateService');
const { checkPriceAlerts } = require('../services/jobs');
const { resetCatalogCache } = require('../services/chat/catalog');
const { paginate } = require('../utils/paginate');

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function catalogChanged() {
  clearRateCache();
  resetCatalogCache();
}

// ---------- Categories ----------
async function listCategories(req, res, next) {
  try {
    const categories = await ScrapCategory.find({}).sort({ sortOrder: 1, name: 1 }).lean();
    const counts = await ScrapItem.aggregate([{ $group: { _id: '$category', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }]);
    const by = Object.fromEntries(counts.map((c) => [String(c._id), c]));
    res.json({ success: true, data: { categories: categories.map((c) => ({ ...c, itemCount: by[String(c._id)]?.total || 0, activeItems: by[String(c._id)]?.active || 0 })) } });
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await ScrapCategory.create({ ...req.body, slug: slugify(req.body.slug || req.body.name) });
    catalogChanged();
    await audit(req, 'category.create', { entity: 'ScrapCategory', entityId: category._id, after: req.body });
    res.status(201).json({ success: true, data: { category } });
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await ScrapCategory.findById(req.params.id);
    if (!category) return fail(res, 404, 'Category not found');
    const before = category.toObject();
    Object.assign(category, req.body);
    if (req.body.name && !req.body.slug) category.slug = slugify(req.body.name);
    await category.save();
    catalogChanged();
    await audit(req, 'category.update', { entity: 'ScrapCategory', entityId: category._id, before, after: req.body });
    res.json({ success: true, data: { category } });
  } catch (err) {
    next(err);
  }
}

// ---------- Items ----------
async function listItems(req, res, next) {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search) filter.name = new RegExp(escapeRegex(req.query.search), 'i');
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'inactive') filter.isActive = false;
    const city = req.query.city;
    const { rows, pagination } = await paginate(ScrapItem, filter, req, { defaultSort: 'name', populate: [{ path: 'category', select: 'name' }] });
    const prices = city ? await ScrapPrice.find({ item: { $in: rows.map((r) => r._id) }, city }).lean() : [];
    const priceBy = Object.fromEntries(prices.map((p) => [String(p.item), p]));
    res.json({ success: true, data: { items: rows.map((i) => ({ ...i, price: priceBy[String(i._id)] || null })), pagination } });
  } catch (err) {
    next(err);
  }
}

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

// Prices only exist for cities set up in Service areas (canonical spelling).
async function cityOrThrow(name) {
  const city = await findCity(name, { includeInactive: true });
  if (!city) throw bad(`${name || 'This city'} is not set up yet. Add it under Service areas first.`);
  return city.name;
}

async function setPrice(req, item, { city: cityName, minPrice, maxPrice, recyclerPrice }) {
  if (minPrice > maxPrice) throw bad(`${item.name}: minimum price cannot be more than maximum`);
  const city = await cityOrThrow(cityName);
  let price = await ScrapPrice.findOne({ item: item._id, city });
  const before = price ? { minPrice: price.minPrice, maxPrice: price.maxPrice, recyclerPrice: price.recyclerPrice } : null;
  if (price) {
    price.minPrice = minPrice;
    price.maxPrice = maxPrice;
    if (recyclerPrice !== undefined) price.recyclerPrice = recyclerPrice;
    price.updatedBy = req.user._id;
    price.isActive = true;
    await price.save();
  } else {
    price = await ScrapPrice.create({ item: item._id, city, minPrice, maxPrice, recyclerPrice: recyclerPrice ?? null, updatedBy: req.user._id });
  }
  if (!before || before.minPrice !== minPrice || before.maxPrice !== maxPrice) {
    await PriceHistory.create({
      price: price._id,
      item: item._id,
      city,
      oldMinPrice: before?.minPrice,
      oldMaxPrice: before?.maxPrice,
      newMinPrice: minPrice,
      newMaxPrice: maxPrice,
      changedBy: req.user._id,
    });
    await audit(req, 'price.update', { entity: 'ScrapPrice', entityId: price._id, before, after: { item: item.name, city, minPrice, maxPrice, recyclerPrice } });
    checkPriceAlerts(item._id, city).catch(() => {});
  }
  return price;
}

async function createScrapItem(req, res, next) {
  try {
    const { categoryId, minPrice, maxPrice, city, recyclerPrice, ...fields } = req.body;
    const category = await ScrapCategory.findById(categoryId);
    if (!category) return fail(res, 404, 'Category not found');
    const item = await ScrapItem.create({ ...fields, category: category._id });
    if (minPrice !== undefined && maxPrice !== undefined && city) await setPrice(req, item, { city, minPrice, maxPrice, recyclerPrice });
    catalogChanged();
    await audit(req, 'item.create', { entity: 'ScrapItem', entityId: item._id, after: req.body });
    res.status(201).json({ success: true, data: { item } });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

async function updateScrapItem(req, res, next) {
  try {
    const item = await ScrapItem.findById(req.params.id);
    if (!item) return fail(res, 404, 'Item not found');
    const { minPrice, maxPrice, city, recyclerPrice, categoryId, ...fields } = req.body;
    const before = item.toObject();
    Object.assign(item, fields);
    if (categoryId) item.category = categoryId;
    await item.save();
    if (minPrice !== undefined && maxPrice !== undefined && city) await setPrice(req, item, { city, minPrice, maxPrice, recyclerPrice });
    catalogChanged();
    if (Object.keys(fields).length) await audit(req, 'item.update', { entity: 'ScrapItem', entityId: item._id, before, after: fields });
    res.json({ success: true, data: { item } });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

async function deleteScrapItem(req, res, next) {
  try {
    const item = await ScrapItem.findById(req.params.id);
    if (!item) return fail(res, 404, 'Item not found');
    item.isActive = false; // soft delete keeps history and past pickups intact
    await item.save();
    catalogChanged();
    await audit(req, 'item.deactivate', { entity: 'ScrapItem', entityId: item._id });
    res.json({ success: true, message: 'Item deactivated' });
  } catch (err) {
    next(err);
  }
}

// Update many prices at once (e.g. a whole city, or +5% across metals).
async function bulkPrices(req, res, next) {
  try {
    const { updates, percentChange, categoryId } = req.body;
    const city = await cityOrThrow(req.body.city);
    const results = [];
    if (percentChange !== undefined) {
      const itemFilter = { isActive: true, ...(categoryId ? { category: categoryId } : {}) };
      const items = await ScrapItem.find(itemFilter).select('_id name');
      const prices = await ScrapPrice.find({ city, isActive: true, item: { $in: items.map((i) => i._id) } });
      for (const p of prices) {
        const item = items.find((i) => String(i._id) === String(p.item));
        const f = 1 + percentChange / 100;
        await setPrice(req, item, {
          city,
          minPrice: Math.max(0, Math.round(p.minPrice * f)),
          maxPrice: Math.max(0, Math.round(p.maxPrice * f)),
          recyclerPrice: p.recyclerPrice != null ? Math.max(0, Math.round(p.recyclerPrice * f)) : undefined,
        });
        results.push(item.name);
      }
    } else {
      for (const u of updates) {
        const item = await ScrapItem.findById(u.itemId);
        if (!item) continue;
        await setPrice(req, item, { city, minPrice: u.minPrice, maxPrice: u.maxPrice, recyclerPrice: u.recyclerPrice });
        results.push(item.name);
      }
    }
    catalogChanged();
    res.json({ success: true, data: { updated: results.length } });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

async function priceHistory(req, res, next) {
  try {
    const filter = {};
    if (req.query.city) filter.city = req.query.city;
    if (req.query.item) filter.item = req.query.item;
    const { rows, pagination } = await paginate(PriceHistory, filter, req, {
      populate: [
        { path: 'item', select: 'name unit' },
        { path: 'changedBy', select: 'name' },
      ],
    });
    res.json({ success: true, data: { history: rows, pagination } });
  } catch (err) {
    next(err);
  }
}

// Copy one city's price list into another (launching a new city).
async function copyCityPrices(req, res, next) {
  try {
    const { percentChange = 0, overwrite = false } = req.body;
    const fromCity = await cityOrThrow(req.body.fromCity);
    const toCity = await cityOrThrow(req.body.toCity);
    if (fromCity === toCity) return fail(res, 400, 'Choose two different cities');
    const prices = await ScrapPrice.find({ city: fromCity, isActive: true }).populate('item', 'name');
    const f = 1 + percentChange / 100;
    let created = 0;
    let updated = 0;
    for (const p of prices) {
      if (!p.item) continue;
      const existing = await ScrapPrice.findOne({ item: p.item._id, city: toCity, isActive: true });
      if (existing && !overwrite) continue;
      await setPrice(req, p.item, {
        city: toCity,
        minPrice: Math.round(p.minPrice * f),
        maxPrice: Math.round(p.maxPrice * f),
        recyclerPrice: p.recyclerPrice != null ? Math.round(p.recyclerPrice * f) : undefined,
      });
      if (existing) updated += 1;
      else created += 1;
    }
    catalogChanged();
    await audit(req, 'price.copy_city', { after: { fromCity, toCity, percentChange, overwrite, created, updated } });
    res.json({ success: true, data: { created, updated } });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

// ---------- City price grid ----------
// Every active item with this city's price (or null when not priced yet), so
// admins can see gaps and fill them in one place.
async function cityPriceGrid(req, res, next) {
  try {
    const city = await cityOrThrow(req.query.city);
    const [items, prices] = await Promise.all([
      ScrapItem.find({ isActive: true }).populate('category', 'name nameNe sortOrder isActive').lean(),
      ScrapPrice.find({ city }).populate('updatedBy', 'name').lean(),
    ]);
    const by = Object.fromEntries(prices.map((p) => [String(p.item), p]));
    const rows = items
      .filter((i) => i.category)
      .map((i) => {
        const p = by[String(i._id)];
        return {
          itemId: i._id,
          name: i.name,
          nameNe: i.nameNe,
          unit: i.unit,
          category: i.category,
          price: p && p.isActive ? { minPrice: p.minPrice, maxPrice: p.maxPrice, recyclerPrice: p.recyclerPrice, updatedAt: p.updatedAt, updatedBy: p.updatedBy?.name || null } : null,
        };
      })
      .sort((a, b) => (a.category.sortOrder ?? 0) - (b.category.sortOrder ?? 0) || a.name.localeCompare(b.name));
    res.json({ success: true, data: { city, items: rows, priced: rows.filter((r) => r.price).length, total: rows.length } });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

// Stop buying an item in one city (keeps history; customers no longer see it).
async function unpublishPrice(req, res, next) {
  try {
    const city = await cityOrThrow(req.query.city);
    const price = await ScrapPrice.findOne({ item: req.params.itemId, city, isActive: true }).populate('item', 'name');
    if (!price) return fail(res, 404, 'This item is not priced in that city');
    price.isActive = false;
    price.updatedBy = req.user._id;
    await price.save();
    catalogChanged();
    await audit(req, 'price.unpublish', { entity: 'ScrapPrice', entityId: price._id, before: { item: price.item?.name, city } });
    res.json({ success: true });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  listItems,
  createScrapItem,
  updateScrapItem,
  deleteScrapItem,
  bulkPrices,
  priceHistory,
  copyCityPrices,
  cityPriceGrid,
  unpublishPrice,
};
