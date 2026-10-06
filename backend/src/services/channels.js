// Outgoing message channels. Each uses a real provider when its env keys are set
// and otherwise logs the message (mock mode), so the app runs locally for free.
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { cleanPhone, intlPhone } = require('../config/locale');

const mock = (channel, to, body) => {
  logger.info({ channel, to }, `[mock-${channel}] ${String(body).slice(0, 300)}`);
  return { mock: true };
};

// ---------- Email (SMTP via Nodemailer) ----------
let transporter = null;
function emailEnabled() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}
async function sendEmail({ to, subject, text, html, attachments }) {
  if (!to) return { skipped: true };
  if (!emailEnabled()) return mock('email', to, `${subject} — ${text || ''}`);
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `ScrapMate <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
    attachments,
  });
  return { sent: true };
}

// ---------- SMS (Sparrow SMS for Nepal, or Twilio) ----------
async function sendSms(phone, text) {
  const provider = process.env.SMS_PROVIDER; // 'sparrow' | 'twilio'
  if (!phone) return { skipped: true };
  try {
    if (provider === 'sparrow' && process.env.SPARROW_SMS_TOKEN) {
      // Sparrow SMS takes the 10-digit Nepali number without the country code.
      const res = await fetch('https://api.sparrowsms.com/v2/sms/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: process.env.SPARROW_SMS_TOKEN,
          from: process.env.SPARROW_SMS_FROM || 'ScrapMate',
          to: cleanPhone(phone),
          text,
        }),
      });
      if (!res.ok) throw new Error(`Sparrow SMS ${res.status}`);
      return { sent: true };
    }
    if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `+${intlPhone(phone)}`, From: process.env.TWILIO_FROM || '', Body: text }),
      });
      if (!res.ok) throw new Error(`Twilio ${res.status}`);
      return { sent: true };
    }
  } catch (err) {
    logger.error({ err: err.message }, 'SMS send failed');
    return { failed: true };
  }
  return mock('sms', phone, text);
}

// ---------- WhatsApp (Meta Cloud API) ----------
async function sendWhatsApp(phone, text) {
  if (!phone) return { skipped: true };
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) return mock('whatsapp', phone, text);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: intlPhone(phone),
        type: 'text',
        text: { body: text },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status}`);
    return { sent: true };
  } catch (err) {
    logger.error({ err: err.message }, 'WhatsApp send failed');
    return { failed: true };
  }
}

// ---------- Web push ----------
let webpush = null;
function pushEnabled() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
async function sendPush(subscriptions, payload) {
  if (!subscriptions?.length) return { skipped: true };
  if (!pushEnabled()) return mock('push', `${subscriptions.length} device(s)`, payload.title);
  if (!webpush) {
    webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@scrapmate.dev',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
  const expired = [];
  await Promise.all(
    subscriptions.map((sub) =>
      webpush.sendNotification(sub, JSON.stringify(payload)).catch((err) => {
        if (err.statusCode === 404 || err.statusCode === 410) expired.push(sub.endpoint);
      })
    )
  );
  return { sent: true, expired };
}

module.exports = { sendEmail, sendSms, sendWhatsApp, sendPush, emailEnabled, pushEnabled };
