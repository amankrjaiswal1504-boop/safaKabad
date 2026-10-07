const express = require('express');
const rateLimit = require('express-rate-limit');
const pub = require('../controllers/publicController');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const geoLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const eventLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const callLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.get('/config', pub.config);
router.get('/serviceability', pub.serviceability);
router.get('/slots', pub.slots);
router.get('/slots/calendar', pub.slotCalendar);
router.get('/geo/search', geoLimiter, pub.geoSearch);
router.get('/geo/reverse', geoLimiter, pub.geoReverse);
router.get('/testimonials', pub.testimonials);
router.get('/faqs', pub.faqs);
router.get('/ngos', pub.ngos);
router.get('/leaderboard', pub.referralLeaderboard);
router.get('/cities/:city', pub.cityPage);
router.post('/events', eventLimiter, optionalAuth, pub.trackEvent);
router.post('/call-request', callLimiter, optionalAuth, pub.createCallRequest);
router.post('/call-click', eventLimiter, optionalAuth, pub.trackCallClick);

module.exports = router;
