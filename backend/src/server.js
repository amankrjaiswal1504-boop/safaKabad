require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');
const { startJobs, stopJobs } = require('./services/jobs');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  logger.fatal('JWT_SECRET must be set to a long random value in production');
  process.exit(1);
}

const server = http.createServer(app);
initSocket(server);

connectDB().then(() => {
  server.listen(PORT, () => {
    logger.info(`SafaKabad API listening on http://localhost:${PORT}`);
    startJobs();
  });
});

// Graceful shutdown: stop taking requests, finish in-flight ones, close DB.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  stopJobs();
  server.close(async () => {
    await mongoose.connection.close(false).catch(() => {});
    logger.info('Shutdown complete');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
