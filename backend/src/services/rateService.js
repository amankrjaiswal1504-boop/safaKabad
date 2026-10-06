const mongoose = require('mongoose');
const ScrapCategory = require('../models/ScrapCategory');
const ScrapItem = require('../models/ScrapItem');
const ScrapPrice = require('../models/ScrapPrice');
const settings = require('./settingsService');
const { cityNames } = require('./cityService');

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Small in-memory cache for the public rate list (cleared on any price change).
const rateCache = new Map();
const RATE_TTL_MS = 60 * 1000;
function clearRateCache() {
  rateCache.clear();
}

// Accepts a category ObjectId, slug, or (case-insensitive) name.
async function resolveCategoryId(category) {
  if (!category) return null;
  if (mongoose.isValidObjectId(category)) return category;
  const re = new RegExp(`^${escapeRegex(category)}$`, 'i');
  const found = await ScrapCategory.findOne({ $or: [{ slug: String(category).toLowerCase() }, { name: re }] });
  return found ? found._id : undefined; // undefined = "asked for a category that doesn't exist"
}

// Items + price range for a city. Powers the public rates page and the chat assistant.
async function fetchRates({ city, search, category } = {}) {
  if (!city) return [];
  const key = JSON.stringify([city, search, category]);
  const hit = rateCache.get(key);
  if (hit && Date.now() - hit.at < RATE_TTL_MS) return hit.value;

  const itemFilter = { isActive: true };
  if (search) itemFilter.name = { $regex: escapeRegex(search), $options: 'i' };
  if (category) {
    const categoryId = await resolveCategoryId(category);
    if (categoryId === undefined) return [];
    itemFilter.category = categoryId;
  }

  const items = await ScrapItem.find(itemFilter)
    .populate({ path: 'category', select: 'name nameNe slug icon conditionGrading isActive sortOrder' })
    .lean();
  const activeItems = items.filter((i) => i.category && i.category.isActive !== false);
  const prices = await ScrapPrice.find({
    item: { $in: activeItems.map((i) => i._id) },
    city,
    isActive: true,
  }).lean();
  const priceByItem = new Map(prices.map((p) => [String(p.item), p]));

  const value = activeItems
    .filter((item) => priceByItem.has(String(item._id))) // only items priced in this city
    .map((item) => {
      const price = priceByItem.get(String(item._id));
      return {
        itemId: item._id,
        name: item.name,
        nameNe: item.nameNe,
        image: item.image,
        unit: item.unit,
        category: item.category,
        minPrice: price.minPrice,
        maxPrice: price.maxPrice,
        city: price.city,
        lastUpdated: price.updatedAt,
      };
    })
    .sort((a, b) => (a.category.sortOrder ?? 0) - (b.category.sortOrder ?? 0) || a.name.localeCompare(b.name));
  rateCache.set(key, { at: Date.now(), value });
  return value;
}

// Server-side estimate for [{ itemId, estimatedQuantity, condition? }] in a city.
// Same maths the booking wizard and chat show. Condition (working / not
// working / damaged) scales the rate for items whose category is graded.
// Items without a price in the city are returned with priced:false and listed
// in `unpriced`; they never add to the totals.
async function estimateItems(entries, city, { conditionMultipliers } = {}) {
  const multipliers = conditionMultipliers || (await settings.get('conditionMultipliers'));
  let min = 0;
  let max = 0;
  let weightKg = 0;
  const lines = [];
  for (const entry of entries) {
    if (!mongoose.isValidObjectId(entry.itemId)) continue;
    const item = await ScrapItem.findById(entry.itemId).populate('category', 'conditionGrading slug');
    if (!item || !item.isActive) continue;
    const price = city ? await ScrapPrice.findOne({ item: item._id, city, isActive: true }) : null;
    const qty = Math.max(0, Math.min(100000, Number(entry.estimatedQuantity) || 0));
    const graded = Boolean(item.category?.conditionGrading);
    const condition = graded ? entry.condition || 'working' : null;
    const factor = graded ? multipliers[condition] ?? 1 : 1;
    const lineMin = price ? Math.round(price.minPrice * qty * factor) : 0;
    const lineMax = price ? Math.round(price.maxPrice * qty * factor) : 0;
    min += lineMin;
    max += lineMax;
    weightKg += item.unit === 'kg' ? qty : qty * (item.kgPerUnit || 1);
    lines.push({ item, quantity: qty, condition, priced: Boolean(price), min: lineMin, max: lineMax });
  }
  const unpriced = lines.filter((l) => !l.priced).map((l) => l.item.name);
  return { min, max, weightKg: Math.round(weightKg * 10) / 10, lines, unpriced };
}

// Active cities (admin-managed), default first.
const listServiceCities = cityNames;

module.exports = { fetchRates, estimateItems, listServiceCities, escapeRegex, clearRateCache };
