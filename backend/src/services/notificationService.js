// One place to tell a user something: stores an in-app notification, pushes it
// live over Socket.IO, and fans out to email / WhatsApp / SMS / web push based
// on the user's preferences. Every external channel has a console fallback.
const User = require('../models/User');
const { Notification } = require('../models/platform');
const { emitTo } = require('../socket');
const { sendEmail, sendWhatsApp, sendSms, sendPush } = require('./channels');
const logger = require('../utils/logger');
const { TIMEZONE } = require('../config/locale');

const CLIENT_URL = () => process.env.CLIENT_URL || 'http://localhost:5173';

const STATUS_COPY = {
  BOOKED: (p) => ({ title: 'Pickup booked', body: `Your pickup ${p.pickupId} is booked for ${fmtDate(p.scheduledDate)}, ${p.timeSlot}.` }),
  ASSIGNED: (p, x) => ({ title: 'Collector assigned', body: `${x.collectorName || 'A collector'} will collect pickup ${p.pickupId}.` }),
  COLLECTOR_ON_THE_WAY: (p, x) => ({
    title: 'Collector is on the way',
    body: `Your collector is on the way for ${p.pickupId}. Share code ${x.otp || '(see app)'} at the door to start weighing.`,
  }),
  ARRIVED: (p) => ({ title: 'Collector has arrived', body: `Your collector has arrived for ${p.pickupId}.` }),
  WEIGHING: (p) => ({ title: 'Weighing done', body: `Final amount for ${p.pickupId} is ready. Please review and accept.` }),
  COMPLETED: (p) => ({ title: 'Pickup completed', body: `Thanks for recycling! Pickup ${p.pickupId} is complete. Receipt: ${CLIENT_URL()}/receipt/${p.pickupId}` }),
  CANCELLED: (p) => ({ title: 'Pickup cancelled', body: `Pickup ${p.pickupId} was cancelled.` }),
};

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'short' });
}

async function notify(userId, { type, title, body, link = '', channels = ['inapp', 'email', 'whatsapp', 'push'], emailAttachments }) {
  try {
    const user = await User.findById(userId).select('+pushSubscriptions');
    if (!user) return null;
    const notification = await Notification.create({ user: user._id, type, title, body, link, channels });
    emitTo(`user:${user._id}`, 'notification', notification);

    const prefs = user.notificationPrefs || {};
    const text = `${title}\n${body}${link ? `\n${CLIENT_URL()}${link}` : ''}`;
    const jobs = [];
    if (channels.includes('email') && prefs.email !== false && user.email) {
      jobs.push(sendEmail({ to: user.email, subject: `ScrapMate: ${title}`, text, attachments: emailAttachments }));
    }
    if (channels.includes('whatsapp') && prefs.whatsapp !== false) jobs.push(sendWhatsApp(user.phone, text));
    if (channels.includes('sms') && prefs.sms) jobs.push(sendSms(user.phone, text));
    if (channels.includes('push') && prefs.push !== false && user.pushSubscriptions?.length) {
      jobs.push(
        sendPush(user.pushSubscriptions, { title, body, url: link || '/' }).then(async (r) => {
          if (r.expired?.length) {
            user.pushSubscriptions = user.pushSubscriptions.filter((s) => !r.expired.includes(s.endpoint));
            await user.save();
          }
        })
      );
    }
    await Promise.allSettled(jobs);
    return notification;
  } catch (err) {
    logger.error({ err: err.message, type }, 'notify failed');
    return null;
  }
}

// Pickup lifecycle: notify the customer and broadcast the change to watchers.
async function pickupStatusChanged(pickup, extra = {}) {
  const copy = STATUS_COPY[pickup.status];
  emitTo(`pickup:${pickup.pickupId}`, 'pickup:status', {
    pickupId: pickup.pickupId,
    status: pickup.status,
    finalAmount: pickup.finalAmount,
    at: new Date(),
  });
  emitTo('role:admin', 'pickup:updated', { pickupId: pickup.pickupId, status: pickup.status });
  if (!copy) return;
  const { title, body } = copy(pickup, extra);
  const channels = pickup.status === 'COLLECTOR_ON_THE_WAY' ? ['inapp', 'whatsapp', 'sms', 'push', 'email'] : undefined;
  await notify(pickup.customer?._id || pickup.customer, {
    type: `pickup.${pickup.status.toLowerCase()}`,
    title,
    body,
    link: `/pickups/${pickup.pickupId}`,
    channels,
    emailAttachments: extra.attachments,
  });
}

async function notifyAdmins(payload) {
  emitTo('role:admin', 'notification', { ...payload, createdAt: new Date() });
}

module.exports = { notify, pickupStatusChanged, notifyAdmins };
