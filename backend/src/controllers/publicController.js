// Public, unauthenticated helpers: site config, serviceability, slots, address
// search, testimonials, FAQs, NGOs, leaderboard, SEO (sitemap, city pages).
const { Review, Ngo } = require('../models/platform');
const Faq = require('../models/Faq');
const settings = require('../services/settingsService');
const { checkPin, listAreas } = require('../services/serviceabilityService');
const { getAvailability, todayLocal, addDays } = require('../services/slotService');
const geo = require('../services/geoService');
const { leaderboard } = require('../services/referralService');
const { fetchRates, listServiceCities } = require('../services/rateService');
const { track } = require('../services/jobs');
const { isAiEnabled } = require('../services/chat/claudeAgent');

async function config(req, res, next) {
  try {
    const pub = await settings.getPublic();
    const [areas, cities] = await Promise.all([listAreas(), listServiceCities()]);
    res.json({
      success: true,
      data: {
        ...pub,
        cities,
        serviceAreas: areas.map((a) => ({ city: a.city, state: a.state, minPickupWeightKg: a.minPickupWeightKg, minPickupValue: a.minPickupValue })),
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
    res.json({ success: true, data: await checkPin(req.query.pin, req.query.city) });
  } catch (err) {
    next(err);
  }
}

async function slots(req, res, next) {
  try {
    const date = req.query.date || todayLocal();
    res.json({ success: true, data: await getAvailability(date, { pinCode: req.query.pin, excludePickupId: req.query.exclude }) });
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
      const a = await getAvailability(date, { pinCode: req.query.pin });
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
    const cities = await listServiceCities();
    const city = cities.find((c) => slugify(c) === slugify(req.params.city));
    if (!city) return res.status(404).json({ success: false, message: 'We are not in this city yet' });
    const rates = await fetchRates({ city });
    res.json({ success: true, data: { city, slug: slugify(city), rates: rates.slice(0, 40), itemCount: rates.length } });
  } catch (err) {
    next(err);
  }
}

async function sitemap(req, res, next) {
  try {
    const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const cities = await listServiceCities();
    const paths = ['/', '/rates', '/business', '/donate', '/how-it-works', '/login', '/register', '/schedule-pickup', '/referrals/leaderboard'];
    const urls = [...paths, ...cities.map((c) => `/sell-scrap/${slugify(c)}`)];
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
