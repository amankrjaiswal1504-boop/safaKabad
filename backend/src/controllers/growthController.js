// Customer-facing growth & retention features: wallet, referrals, eco impact,
// coupons, recurring pickups, price alerts, business quotes, notifications.
const User = require('../models/User');
const Address = require('../models/Address');
const ScrapItem = require('../models/ScrapItem');
const {
  WalletTransaction,
  Withdrawal,
  RecurringPlan,
  PriceAlert,
  Quote,
  Notification,
} = require('../models/platform');
const wallet = require('../services/walletService');
const { userImpact } = require('../services/impactService');
const { validateCoupon, CouponError } = require('../services/couponService');
const { firstRunDate } = require('../services/jobs');
const { notifyAdmins, notify } = require('../services/notificationService');
const settings = require('../services/settingsService');
const { shortId } = require('../utils/generateId');
const { saveFile } = require('../services/storageService');

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// ---------- Wallet ----------
async function getWallet(req, res, next) {
  try {
    const [user, transactions, withdrawals] = await Promise.all([
      User.findById(req.user._id).select('walletBalance'),
      WalletTransaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100),
      Withdrawal.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20),
    ]);
    res.json({ success: true, data: { balance: user.walletBalance, transactions, withdrawals } });
  } catch (err) {
    next(err);
  }
}

// Debit now (so the money can't be spent twice), pay out after admin approval.
async function requestWithdrawal(req, res, next) {
  try {
    const { amount, method, walletId, bankAccount } = req.body;
    const pending = await Withdrawal.exists({ user: req.user._id, status: { $in: ['requested', 'processing'] } });
    if (pending) return fail(res, 409, 'You already have a withdrawal in progress');
    const withdrawal = await wallet.withTransaction(async (session) => {
      const [w] = await Withdrawal.create([{ user: req.user._id, amount, method, walletId, bankAccount }], { session });
      await wallet.debit(req.user._id, amount, 'withdrawal', { reference: String(w._id) }, session);
      return w;
    });
    await notifyAdmins({ type: 'withdrawal', title: 'New withdrawal request', body: `Rs. ${amount} by ${req.user.name}`, link: '/admin/finance' });
    res.status(201).json({ success: true, data: { withdrawal } });
  } catch (err) {
    if (err instanceof wallet.WalletError) return fail(res, err.status, err.message);
    next(err);
  }
}

// ---------- Referrals & impact ----------
async function myReferrals(req, res, next) {
  try {
    const cfg = await settings.get('referral');
    const referred = await User.find({ referredBy: req.user._id }).select('name referralRewarded createdAt').sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      data: {
        code: req.user.referralCode,
        rewards: { referrer: cfg.referrerReward, referee: cfg.refereeReward },
        referred: referred.map((r) => ({ name: r.name.split(' ')[0], rewarded: r.referralRewarded, joinedAt: r.createdAt })),
        earned: referred.filter((r) => r.referralRewarded).length * cfg.referrerReward,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function myImpact(req, res, next) {
  try {
    res.json({ success: true, data: await userImpact(req.user._id) });
  } catch (err) {
    next(err);
  }
}

// ---------- Coupons ----------
async function checkCoupon(req, res, next) {
  try {
    const { code, weightKg, value } = req.body;
    const { coupon, bonus } = await validateCoupon(code, req.user, { weightKg, value });
    res.json({ success: true, data: { code: coupon.code, description: coupon.description, bonus } });
  } catch (err) {
    if (err instanceof CouponError) return fail(res, 400, err.message);
    next(err);
  }
}

// ---------- Recurring pickups ----------
async function listPlans(req, res, next) {
  try {
    const plans = await RecurringPlan.find({ customer: req.user._id })
      .populate('items.item', 'name unit')
      .populate('address', 'houseNumber street locality city pinCode')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: { plans } });
  } catch (err) {
    next(err);
  }
}

async function createPlan(req, res, next) {
  try {
    const address = await Address.findOne({ _id: req.body.addressId, user: req.user._id });
    if (!address) return fail(res, 404, 'Address not found');
    const items = await ScrapItem.find({ _id: { $in: req.body.items.map((i) => i.itemId) }, isActive: true });
    if (!items.length) return fail(res, 400, 'Choose at least one item');
    if ((await RecurringPlan.countDocuments({ customer: req.user._id, isActive: true })) >= 5) {
      return fail(res, 400, 'You can have up to 5 active recurring plans');
    }
    const plan = new RecurringPlan({
      customer: req.user._id,
      address: address._id,
      items: req.body.items.filter((i) => items.some((x) => String(x._id) === i.itemId)).map((i) => ({ item: i.itemId, estimatedQuantity: i.estimatedQuantity })),
      frequency: req.body.frequency,
      dayOfWeek: req.body.dayOfWeek,
      dayOfMonth: req.body.dayOfMonth,
      timeSlot: req.body.timeSlot,
      contactPhone: req.body.contactPhone || req.user.phone,
      nextRunDate: new Date(),
    });
    plan.nextRunDate = firstRunDate(plan);
    await plan.save();
    res.status(201).json({ success: true, data: { plan } });
  } catch (err) {
    next(err);
  }
}

async function updatePlan(req, res, next) {
  try {
    const plan = await RecurringPlan.findOne({ _id: req.params.id, customer: req.user._id });
    if (!plan) return fail(res, 404, 'Plan not found');
    ['frequency', 'dayOfWeek', 'dayOfMonth', 'timeSlot', 'isActive'].forEach((k) => {
      if (req.body[k] !== undefined) plan[k] = req.body[k];
    });
    if (req.body.frequency || req.body.dayOfWeek !== undefined || req.body.dayOfMonth !== undefined || req.body.isActive) {
      plan.nextRunDate = firstRunDate(plan);
    }
    await plan.save();
    res.json({ success: true, data: { plan } });
  } catch (err) {
    next(err);
  }
}

async function deletePlan(req, res, next) {
  try {
    const plan = await RecurringPlan.findOneAndDelete({ _id: req.params.id, customer: req.user._id });
    if (!plan) return fail(res, 404, 'Plan not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ---------- Price alerts ----------
async function listAlerts(req, res, next) {
  try {
    const alerts = await PriceAlert.find({ user: req.user._id }).populate('item', 'name unit').sort({ createdAt: -1 });
    res.json({ success: true, data: { alerts } });
  } catch (err) {
    next(err);
  }
}

async function createAlert(req, res, next) {
  try {
    if ((await PriceAlert.countDocuments({ user: req.user._id })) >= 20) return fail(res, 400, 'You can have up to 20 alerts');
    const item = await ScrapItem.findById(req.body.itemId);
    if (!item) return fail(res, 404, 'Item not found');
    const alert = await PriceAlert.create({ ...req.body, item: item._id, user: req.user._id });
    res.status(201).json({ success: true, data: { alert: await alert.populate('item', 'name unit') } });
  } catch (err) {
    next(err);
  }
}

async function deleteAlert(req, res, next) {
  try {
    const alert = await PriceAlert.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!alert) return fail(res, 404, 'Alert not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ---------- Business quotes ----------
async function createQuote(req, res, next) {
  try {
    const quote = await Quote.create({ ...req.body, quoteId: shortId('QT'), customer: req.user?._id || null });
    await notifyAdmins({ type: 'quote', title: 'New bulk quote request', body: `${quote.companyName}, ${quote.city}`, link: '/admin/business' });
    if (req.user) {
      await notify(req.user._id, {
        type: 'quote.received',
        title: 'Quote request received',
        body: `We got your request ${quote.quoteId}. Our business team will contact you within one working day.`,
        link: '/business',
        channels: ['inapp', 'email'],
      });
    }
    res.status(201).json({ success: true, data: { quote } });
  } catch (err) {
    next(err);
  }
}

async function myQuotes(req, res, next) {
  try {
    res.json({ success: true, data: { quotes: await Quote.find({ customer: req.user._id }).sort({ createdAt: -1 }) } });
  } catch (err) {
    next(err);
  }
}

// ---------- Notifications ----------
async function listNotifications(req, res, next) {
  try {
    const [notifications, unread] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);
    res.json({ success: true, data: { notifications, unread } });
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const filter = { user: req.user._id };
    if (req.params.id !== 'all') filter._id = req.params.id;
    await Notification.updateMany(filter, { read: true });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ---------- Uploads ----------
async function uploadPhotos(req, res, next) {
  try {
    if (!req.files?.length) return fail(res, 400, 'Choose at least one photo');
    const allowed = !req.user ? ['pickups'] : req.user.role === 'customer' ? ['pickups'] : req.user.role === 'collector' ? ['pickups', 'weighing', 'evidence'] : ['pickups', 'weighing', 'evidence', 'items', 'categories', 'ngos'];
    const folder = allowed.includes(req.query.folder) ? req.query.folder : 'pickups';
    const urls = await Promise.all(req.files.map((f) => saveFile(f, folder)));
    res.status(201).json({ success: true, data: { urls } });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

module.exports = {
  getWallet,
  requestWithdrawal,
  myReferrals,
  myImpact,
  checkCoupon,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  listAlerts,
  createAlert,
  deleteAlert,
  createQuote,
  myQuotes,
  listNotifications,
  markRead,
  uploadPhotos,
};
