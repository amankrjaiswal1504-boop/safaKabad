const crypto = require('crypto');
const { OtpCode } = require('../models/platform');
const { sendSms } = require('./channels');
const logger = require('../utils/logger');

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 3;
const SEND_WINDOW_MS = 10 * 60 * 1000;

function hash(phone, code) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'dev_secret')
    .update(`${phone}:${code}`)
    .digest('hex');
}

function smsConfigured() {
  return Boolean(process.env.SMS_PROVIDER && (process.env.SPARROW_SMS_TOKEN || process.env.TWILIO_AUTH_TOKEN));
}

class OtpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Sends a 6-digit code. Without an SMS provider the code is printed to the
// console, and (outside production) returned as devCode so the flow can be demoed.
async function sendOtp(phone, purpose = 'login') {
  const recent = await OtpCode.countDocuments({ phone, createdAt: { $gte: new Date(Date.now() - SEND_WINDOW_MS) } });
  if (recent >= MAX_SENDS_PER_WINDOW) throw new OtpError('Too many codes requested. Try again in a few minutes.', 429);

  const code = String(crypto.randomInt(100000, 1000000));
  await OtpCode.create({ phone, purpose, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + TTL_MS) });

  const text = `${code} is your ScrapMate verification code. It expires in 5 minutes. Do not share it.`;
  if (smsConfigured()) {
    await sendSms(phone, text);
  } else {
    logger.info(`[mock-otp] ${phone}: ${code}`);
    if (process.env.NODE_ENV !== 'test') console.log(`[mock-otp] OTP for ${phone} is ${code}`);
  }
  const exposeCode = !smsConfigured() && process.env.NODE_ENV !== 'production';
  return { sent: true, devCode: exposeCode ? code : undefined };
}

async function verifyOtp(phone, code, purpose = 'login') {
  const record = await OtpCode.findOne({ phone, purpose }).sort({ createdAt: -1 });
  if (!record || record.expiresAt < new Date()) throw new OtpError('Code expired. Please request a new one.');
  if (record.attempts >= MAX_ATTEMPTS) throw new OtpError('Too many wrong attempts. Request a new code.', 429);
  const ok = crypto.timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(hash(phone, String(code).trim())));
  if (!ok) {
    record.attempts += 1;
    await record.save();
    throw new OtpError('Incorrect code');
  }
  await OtpCode.deleteMany({ phone, purpose });
  return true;
}

// 4-digit code the customer reads out to the collector at the door.
function pickupOtp() {
  return String(crypto.randomInt(1000, 10000));
}

module.exports = { sendOtp, verifyOtp, pickupOtp, OtpError, smsConfigured };
