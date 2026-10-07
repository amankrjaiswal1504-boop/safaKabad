// Background jobs: recurring-pickup creation and price-alert checks.
// Runs in-process on an interval (use a single API instance or move to a
// worker/cron when scaling horizontally).
const { RecurringPlan, PriceAlert, AnalyticsEvent } = require('../models/platform');
const Address = require('../models/Address');
const User = require('../models/User');
const ScrapPrice = require('../models/ScrapPrice');
const { notify } = require('./notificationService');
const logger = require('../utils/logger');

function nextDate(plan, from) {
  const d = new Date(from);
  if (plan.frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (plan.frequency === 'biweekly') d.setUTCDate(d.getUTCDate() + 14);
  else {
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(plan.dayOfMonth || 1);
  }
  return d;
}

// First run date on/after `from` matching the plan's weekday / day-of-month.
function firstRunDate(plan, from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  if (plan.frequency === 'monthly') {
    if (d.getUTCDate() > (plan.dayOfMonth || 1)) d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(plan.dayOfMonth || 1);
    return d;
  }
  while (d.getUTCDay() !== (plan.dayOfWeek ?? 6)) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Creates pickups for plans due within the next 2 days.
async function runRecurringPlans() {
  const { createPickupForUser } = require('./bookingService');
  const horizon = new Date(Date.now() + 2 * 86400000);
  const due = await RecurringPlan.find({ isActive: true, nextRunDate: { $lte: horizon } }).limit(100);
  for (const plan of due) {
    try {
      const user = await User.findById(plan.customer);
      const address = await Address.findOne({ _id: plan.address, user: plan.customer });
      if (!user?.isActive || !address) {
        plan.isActive = false;
        await plan.save();
        continue;
      }
      const date = plan.nextRunDate.toISOString().slice(0, 10);
      const pickup = await createPickupForUser(user, {
        items: plan.items.map((i) => ({ itemId: String(i.item), estimatedQuantity: i.estimatedQuantity })),
        addressId: String(address._id),
        scheduledDate: date,
        timeSlot: plan.timeSlot,
        contactPhone: plan.contactPhone,
        source: 'recurring',
        recurringPlan: plan._id,
        skipSlotCheck: false,
      });
      plan.lastPickupId = pickup.pickupId;
    } catch (err) {
      logger.warn({ err: err.message, plan: String(plan._id) }, 'recurring pickup skipped');
    }
    plan.nextRunDate = nextDate(plan, plan.nextRunDate);
    await plan.save();
  }
  return due.length;
}

// Called after a price change: notify users whose alert threshold is crossed.
async function checkPriceAlerts(itemId, city) {
  const price = await ScrapPrice.findOne({ item: itemId, city }).populate('item', 'name unit');
  if (!price) return 0;
  const alerts = await PriceAlert.find({ item: itemId, city, isActive: true });
  let sent = 0;
  for (const a of alerts) {
    const hit = a.direction === 'above' ? price.maxPrice >= a.threshold : price.minPrice <= a.threshold;
    const cooledDown = !a.lastTriggeredAt || Date.now() - a.lastTriggeredAt.getTime() > 24 * 3600000;
    if (hit && cooledDown) {
      await notify(a.user, {
        type: 'price.alert',
        title: `${price.item.name} price alert`,
        body: `${price.item.name} in ${city} is now रु ${price.minPrice}–रु ${price.maxPrice}/${price.item.unit} (your alert: ${a.direction} रु ${a.threshold}).`,
        link: '/rates',
        channels: ['inapp', 'push', 'email', 'whatsapp'],
      });
      a.lastTriggeredAt = new Date();
      await a.save();
      sent += 1;
    }
  }
  return sent;
}

async function track(type, { user, sessionId, path, city } = {}) {
  try {
    await AnalyticsEvent.create({ type, user, sessionId, path, city });
  } catch (err) {
    // analytics must never break a request
  }
}

let timer = null;
function startJobs() {
  if (timer || process.env.NODE_ENV === 'test') return;
  const tick = () => runRecurringPlans().catch((err) => logger.error({ err: err.message }, 'recurring job failed'));
  timer = setInterval(tick, 60 * 60 * 1000);
  setTimeout(tick, 15 * 1000);
}
function stopJobs() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { runRecurringPlans, checkPriceAlerts, track, startJobs, stopJobs, firstRunDate, nextDate };
