const { Setting } = require('../models/platform');
const { TIME_SLOTS } = require('../config/constants');

// Defaults for every admin-editable setting. Stored values are merged over these,
// so adding a new setting never needs a migration.
const DEFAULTS = {
  support: {
    whatsappNumber: (process.env.SUPPORT_WHATSAPP_NUMBER || '').replace(/\D/g, ''),
    hoursStart: Number(process.env.SUPPORT_HOURS_START ?? 9),
    hoursEnd: Number(process.env.SUPPORT_HOURS_END ?? 20),
    timezone: process.env.SUPPORT_TIMEZONE || 'Asia/Kathmandu',
    replyMinutes: Number(process.env.SUPPORT_REPLY_MINUTES || 10),
    email: 'support@scrapmate.dev',
    phone: '',
  },
  home: {
    heroTitle: 'Sell your scrap at the best price, right from your doorstep',
    heroSubtitle: 'Free pickup, digital weighing in front of you, and instant payment by eSewa, Khalti, bank or cash.',
    banners: [{ text: 'Get +5% on your first pickup with code FIRST5', link: '/schedule-pickup', active: true }],
    statsOverride: { enabled: false, kgRecycled: 0, pickups: 0, cities: 0, rating: 0 },
  },
  slots: {
    slots: TIME_SLOTS.map((label) => ({ label, capacity: 8 })),
    sameDayCutoffHour: 12, // same-day booking allowed only before 12:00
    maxDaysAhead: 14,
    holidays: [],
    closedWeekdays: [],
    rescheduleCutoffHours: 4,
  },
  ai: { enabled: true, greeting: '' },
  referral: { referrerReward: 50, refereeReward: 50, enabled: true },
  firstPickupBonus: { enabled: true, percent: 5, maxBonus: 200 },
  loyalty: {
    tiers: [
      { name: 'Bronze', minKg: 0, bonusPercent: 0 },
      { name: 'Silver', minKg: 50, bonusPercent: 2 },
      { name: 'Gold', minKg: 200, bonusPercent: 3 },
      { name: 'Platinum', minKg: 500, bonusPercent: 5 },
    ],
  },
  collector: {
    baseFeePerPickup: 30,
    commissionPercent: 5,
    weeklyBonusThreshold: 25,
    weeklyBonusAmount: 500,
    autoAssign: true,
  },
  fraud: {
    maxActiveBookings: 3,
    maxCancellationsPer30Days: 5,
    duplicateWindowHours: 24,
  },
  business: {
    tiers: [
      { name: 'standard', minMonthlyKg: 0, bonusPercent: 0 },
      { name: 'silver', minMonthlyKg: 200, bonusPercent: 3 },
      { name: 'gold', minMonthlyKg: 1000, bonusPercent: 6 },
    ],
  },
  conditionMultipliers: { working: 1, not_working: 0.6, damaged: 0.35 },
  wallet: { minWithdrawal: 50, maxWithdrawal: 100000 },
  // Which payout options collectors can offer and customers can withdraw to.
  payments: {
    payoutMethods: ['cash', 'esewa', 'khalti', 'bank_transfer', 'wallet'],
    withdrawalMethods: ['esewa', 'khalti', 'bank_transfer'],
  },
};

const PUBLIC_KEYS = ['support', 'home', 'slots', 'referral', 'firstPickupBonus', 'loyalty', 'conditionMultipliers', 'wallet', 'payments', 'business'];

let cache = null;
let cacheAt = 0;
const TTL_MS = 30 * 1000;

function merge(base, override) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return override ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && base[k] ? merge(base[k], v) : v;
  }
  return out;
}

async function getAll() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const docs = await Setting.find({}).lean();
  const stored = Object.fromEntries(docs.map((d) => [d.key, d.value]));
  cache = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, merge(v, stored[k])]));
  // Env number wins only if the admin hasn't set one.
  if (!cache.support.whatsappNumber) cache.support.whatsappNumber = DEFAULTS.support.whatsappNumber;
  cacheAt = Date.now();
  return cache;
}

async function get(key) {
  return (await getAll())[key];
}

const PAYOUT_METHODS = ['cash', 'esewa', 'khalti', 'bank_transfer', 'wallet'];
const WITHDRAWAL_METHODS = ['esewa', 'khalti', 'bank_transfer'];
const bad = (message) => Object.assign(new Error(message), { status: 400 });

// Sanity checks for settings that the server enforces elsewhere.
const VALIDATORS = {
  wallet(v) {
    const min = Number(v?.minWithdrawal);
    const max = Number(v?.maxWithdrawal);
    if (!(min >= 1) || !(max >= min)) throw bad('Minimum withdrawal must be at least 1 and not above the maximum');
    return { minWithdrawal: Math.round(min), maxWithdrawal: Math.round(max) };
  },
  payments(v) {
    const payout = [...new Set(v?.payoutMethods || [])].filter((m) => PAYOUT_METHODS.includes(m));
    const withdrawal = [...new Set(v?.withdrawalMethods || [])].filter((m) => WITHDRAWAL_METHODS.includes(m));
    if (!payout.length) throw bad('Keep at least one payout method');
    if (!withdrawal.length) throw bad('Keep at least one withdrawal method');
    return { payoutMethods: payout, withdrawalMethods: withdrawal };
  },
};

async function set(key, value, userId) {
  if (!(key in DEFAULTS)) throw Object.assign(new Error(`Unknown setting: ${key}`), { status: 400 });
  if (VALIDATORS[key]) value = VALIDATORS[key](value);
  await Setting.findOneAndUpdate({ key }, { value, updatedBy: userId }, { upsert: true });
  cache = null;
  return get(key);
}

async function getPublic() {
  const all = await getAll();
  return Object.fromEntries(PUBLIC_KEYS.map((k) => [k, all[k]]));
}

function clearCache() {
  cache = null;
}

module.exports = { get, getAll, set, getPublic, clearCache, DEFAULTS, PAYOUT_METHODS, WITHDRAWAL_METHODS };
