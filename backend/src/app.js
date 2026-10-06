const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const pinoHttp = require('pino-http');

const logger = require('./utils/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { UPLOAD_DIR } = require('./services/storageService');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const addressRoutes = require('./routes/addressRoutes');
const scrapRoutes = require('./routes/scrapRoutes');
const pickupRoutes = require('./routes/pickupRoutes');
const collectorRoutes = require('./routes/collectorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const chatRoutes = require('./routes/chatRoutes');
const publicRoutes = require('./routes/publicRoutes');
const growthRoutes = require('./routes/growthRoutes');
const { sitemap } = require('./controllers/publicController');

const app = express();

// Behind a proxy (Render, Nginx, load balancer) so req.ip and secure cookies work.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.disable('x-powered-by');

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim());

app.use(
  helmet({
    // The API serves JSON, PDFs and uploaded images; lock everything else down.
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // uploaded images are shown by the frontend
  })
);
app.use(
  cors({
    origin(origin, cb) {
      // Same-origin/server-to-server requests have no Origin header.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(Object.assign(new Error('Not allowed by CORS'), { status: 403 }));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
// Strip $-operators and dotted keys from user input (NoSQL injection).
app.use(mongoSanitize());
if (process.env.NODE_ENV !== 'test') {
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    })
  );
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT || 600),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Local uploads (when Cloudinary isn't configured).
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false, index: false }));

app.get('/api/health', (req, res) => {
  const db = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  const ok = db === 'connected';
  res.status(ok ? 200 : 503).json({
    success: ok,
    message: ok ? 'ScrapMate API is running' : 'Database unavailable',
    db,
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version || '2.0.0',
  });
});
app.get('/api/health/live', (req, res) => res.json({ success: true }));
app.get(['/sitemap.xml', '/api/sitemap.xml'], sitemap);
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /api/\n'));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/scrap', scrapRoutes);
app.use('/api/pickups', pickupRoutes);
app.use('/api/collector', collectorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', growthRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
