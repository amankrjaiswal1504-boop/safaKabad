// Public, unauthenticated helpers: site config, serviceability, slots, address
// search, testimonials, FAQs, NGOs, leaderboard, SEO (sitemap, city pages).
const { Review, Ngo } = require('../models/platform');
const Faq = require('../models/Faq');
const settings = require('../services/settingsService');
const { checkPin, checkArea, listAreas, listCities, defaultCity, findCity } = require('../services/cityService');
const { PROVINCES } = require('../config/locale');
const { getAvailability, todayLocal, addDays } = require('../services/slotService');
const geo = require('../services/geoService');
const { leaderboard } = require('../services/referralService');
const { fetchRates } = require('../services/rateService');
const { track } = require('../services/jobs');
const { isAiEnabled } = require('../services/chat/claudeAgent');

async function config(req, res, next) {
  try {
    const pub = await settings.getPublic();
    const [areas, cities, fallbackCity] = await Promise.all([listAreas(), listCities(), defaultCity()]);
    res.json({
      success: true,
      data: {
        ...pub,
        // Everything about where we operate comes from admin-managed cities and
        // service areas (no hard-coded lists in the apps).
        cities: cities.map((c) => c.name),
        cityList: cities.map((c) => ({
          name: c.name,
          nameNe: c.nameNe,
          slug: c.slug,
          district: c.district,
          province: c.province,
          center: c.center?.lat != null ? c.center : null,
          isDefault: c.isDefault,
          areaCount: areas.filter((a) => a.city === c.name).length,
        })),
        defaultCity: fallbackCity,
        serviceAreas: areas.map((a) => ({
          _id: a._id,
          name: a.name,
          nameNe: a.nameNe,
          city: a.city,
          type: a.type,
          district: a.district,
          state: a.state,
          wards: a.wards,
          servedWards: a.servedWards,
          pinCodes: a.pinCodes,
          center: a.center?.lat != null ? a.center : null,
          minPickupWeightKg: a.minPickupWeightKg,
          minPickupValue: a.minPickupValue,
        })),
        provinces: PROVINCES,
        features: {
          ai: isAiEnabled(),
          onlinePayments: process.env.KHALTI_SECRET_KEY ? 'khalti' : 'mock',
          vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
          mapsProvider: process.env.MAPS_API_KEY ? 'google' : 'osm',
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

async function serviceability(req, res, next) {
  try {
    const data = req.query.area ? await checkArea(req.query.area, req.query.ward) : await checkPin(req.query.pin, req.query.city);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function slots(req, res, next) {
  try {
    const date = req.query.date || todayLocal();
    res.json({ success: true, data: await getAvailability(date, { areaId: req.query.area, pinCode: req.query.pin, excludePickupId: req.query.exclude }) });
  } catch (err) {
    next(err);
  }
}

// Next N days with whether each has any open slot (date picker).
async function slotCalendar(req, res, next) {
  try {
    const cfg = await settings.get('slots');
    const today = todayLocal();
    const days = [];
    for (let i = 0; i <= cfg.maxDaysAhead; i += 1) {
      const date = addDays(today, i);
      const a = await getAvailability(date, { areaId: req.query.area, pinCode: req.query.pin });
      days.push({ date, open: a.open, reason: a.reason, freeSlots: a.slots.filter((s) => s.available).length });
    }
    res.json({ success: true, data: { days } });
  } catch (err) {
    next(err);
  }
}

async function geoSearch(req, res, next) {
  try {
    res.json({ success: true, data: { results: await geo.search(req.query.q) } });
  } catch (err) {
    next(err);
  }
}

async function geoReverse(req, res, next) {
  try {
    res.json({ success: true, data: { result: await geo.reverse(req.query.lat, req.query.lng) } });
  } catch (err) {
    next(err);
  }
}

async function testimonials(req, res, next) {
  try {
    const reviews = await Review.find({ status: 'approved', comment: { $ne: '' } })
      .sort({ featured: -1, rating: -1, createdAt: -1 })
      .limit(30)
      .populate('customer', 'name')
      .populate('pickup', 'addressSnapshot.city')
      .lean();
    res.json({
      success: true,
      data: {
        // One card per distinct comment, newest/featured first.
        testimonials: reviews.filter((r, i, all) => all.findIndex((x) => x.comment.trim().toLowerCase() === r.comment.trim().toLowerCase()) === i).slice(0, 9).map((r) => {
          const [first, last] = (r.customer?.name || 'Customer').split(' ');
          return {
            id: r._id,
            name: `${first}${last ? ` ${last[0]}.` : ''}`,
            city: r.pickup?.addressSnapshot?.city || '',
            rating: r.rating,
            comment: r.comment,
            date: r.createdAt,
          };
        }),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function faqs(req, res, next) {
  try {
    const filter = { isActive: true };
    if (req.query.topic) filter.topic = String(req.query.topic).toLowerCase();
    const list = await Faq.find(filter).sort({ order: 1, createdAt: 1 }).select('question answer topic').lean();
    res.json({ success: true, data: { faqs: list } });
  } catch (err) {
    next(err);
  }
}

async function ngos(req, res, next) {
  try {
    const filter = { isActive: true };
    if (req.query.city) filter.$or = [{ cities: req.query.city }, { cities: { $size: 0 } }];
    res.json({ success: true, data: { ngos: await Ngo.find(filter).sort({ name: 1 }).lean() } });
  } catch (err) {
    next(err);
  }
}

async function referralLeaderboard(req, res, next) {
  try {
    res.json({ success: true, data: { leaders: await leaderboard(10) } });
  } catch (err) {
    next(err);
  }
}

// Funnel tracking from the browser (visits). Rate-limited, no PII.
async function trackEvent(req, res) {
  const { type, path, city, sessionId } = req.body || {};
  if (['visit', 'booking_started'].includes(type)) {
    await track(type, { user: req.user?._id, sessionId: String(sessionId || '').slice(0, 64), path: String(path || '').slice(0, 120), city });
  }
  res.status(204).end();
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Data for /sell-scrap/:city landing pages.
async function cityPage(req, res, next) {
  try {
    const found = await findCity(req.params.city);
    if (!found) return res.status(404).json({ success: false, message: 'We are not in this city yet' });
    const city = found.name;
    const [rates, areas] = await Promise.all([fetchRates({ city }), listAreas({ city })]);
    res.json({
      success: true,
      data: {
        city,
        nameNe: found.nameNe,
        slug: found.slug,
        district: found.district,
        province: found.province,
        areas: areas.map((a) => ({ name: a.name, nameNe: a.nameNe, type: a.type, wards: a.wards })),
        rates: rates.slice(0, 40),
        itemCount: rates.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function sitemap(req, res, next) {
  try {
    const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const paths = ['/', '/rates', '/business', '/donate', '/how-it-works', '/login', '/register', '/schedule-pickup', '/referrals/leaderboard'];
    const urls = [...paths, ...(await listCities()).map((c) => `/sell-scrap/${c.slug}`)];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${base}${u}</loc><changefreq>${u.startsWith('/sell-scrap') || u === '/rates' ? 'daily' : 'weekly'}</changefreq></url>`)
      .join('\n')}\n</urlset>\n`;
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  config,
  serviceability,
  slots,
  slotCalendar,
  geoSearch,
  geoReverse,
  testimonials,
  faqs,
  ngos,
  referralLeaderboard,
  trackEvent,
  cityPage,
  sitemap,
  slugify,
};
