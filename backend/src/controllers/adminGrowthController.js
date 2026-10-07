// Coupons, review moderation, NGO partners, business quotes, withdrawals, payments.
const mongoose = require('mongoose');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Pickup = require('../models/Pickup');
const { Coupon, Review, Ngo, Quote, Withdrawal } = require('../models/platform');
const { audit } = require('../services/auditService');
const wallet = require('../services/walletService');
const gateway = require('../services/paymentGateway');
const { notify } = require('../services/notificationService');
const { paginate } = require('../utils/paginate');
const { escapeRegex } = require('../services/rateService');

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Approved reviews drive collectorProfile.rating.
async function recomputeCollectorRating(collectorId) {
  const [agg] = await Review.aggregate([
    { $match: { collector: new mongoose.Types.ObjectId(String(collectorId)), status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]);
  await User.updateOne(
    { _id: collectorId },
    { 'collectorProfile.rating': agg ? Math.round(agg.avg * 10) / 10 : 0, 'collectorProfile.ratingCount': agg?.n || 0 }
  );
}

// ---------- Coupons ----------
async function listCoupons(req, res, next) {
  try {
    res.json({ success: true, data: { coupons: await Coupon.find({}).sort({ createdAt: -1 }) } });
  } catch (err) {
    next(err);
  }
}
async function createCoupon(req, res, next) {
  try {
    const coupon = await Coupon.create(req.body);
    await audit(req, 'coupon.create', { entity: 'Coupon', entityId: coupon.code, after: req.body });
    res.status(201).json({ success: true, data: { coupon } });
  } catch (err) {
    next(err);
  }
}
async function updateCoupon(req, res, next) {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return fail(res, 404, 'Coupon not found');
    const before = coupon.toObject();
    Object.assign(coupon, req.body);
    await coupon.save();
    await audit(req, 'coupon.update', { entity: 'Coupon', entityId: coupon.code, before, after: req.body });
    res.json({ success: true, data: { coupon } });
  } catch (err) {
    next(err);
  }
}

// ---------- Reviews ----------
async function listReviews(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const { rows, pagination } = await paginate(Review, filter, req, {
      populate: [
        { path: 'customer', select: 'name' },
        { path: 'collector', select: 'name' },
        { path: 'pickup', select: 'pickupId' },
      ],
    });
    res.json({ success: true, data: { reviews: rows, pagination } });
  } catch (err) {
    next(err);
  }
}
async function moderateReview(req, res, next) {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return fail(res, 404, 'Review not found');
    if (req.body.status) review.status = req.body.status;
    if (typeof req.body.featured === 'boolean') review.featured = req.body.featured;
    await review.save();
    if (review.collector) await recomputeCollectorRating(review.collector);
    await audit(req, 'review.moderate', { entity: 'Review', entityId: review._id, after: req.body });
    res.json({ success: true, data: { review } });
  } catch (err) {
    next(err);
  }
}

// ---------- NGOs ----------
async function listNgos(req, res, next) {
  try {
    res.json({ success: true, data: { ngos: await Ngo.find({}).sort({ name: 1 }) } });
  } catch (err) {
    next(err);
  }
}
async function upsertNgo(req, res, next) {
  try {
    let ngo;
    if (req.params.id) {
      ngo = await Ngo.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!ngo) return fail(res, 404, 'NGO not found');
    } else {
      ngo = await Ngo.create(req.body);
    }
    await audit(req, req.params.id ? 'ngo.update' : 'ngo.create', { entity: 'Ngo', entityId: ngo._id, after: req.body });
    res.status(req.params.id ? 200 : 201).json({ success: true, data: { ngo } });
  } catch (err) {
    next(err);
  }
}

// ---------- Quotes ----------
async function listQuotes(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const re = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ companyName: re }, { contactName: re }, { quoteId: re }, { city: re }];
    }
    const { rows, pagination } = await paginate(Quote, filter, req);
    res.json({ success: true, data: { quotes: rows, pagination } });
  } catch (err) {
    next(err);
  }
}
async function updateQuote(req, res, next) {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return fail(res, 404, 'Quote not found');
    const before = { status: quote.status, quotedAmount: quote.quotedAmount };
    Object.assign(quote, req.body);
    await quote.save();
    await audit(req, 'quote.update', { entity: 'Quote', entityId: quote.quoteId, before, after: req.body });
    if (quote.customer && req.body.status === 'quoted') {
      await notify(quote.customer, {
        type: 'quote.ready',
        title: 'Your bulk quote is ready',
        body: `Quote ${quote.quoteId}: ${quote.quotedAmount != null ? `रु ${quote.quotedAmount}` : 'see details'}. ${quote.adminNote || ''}`,
        link: '/business',
        channels: ['inapp', 'email', 'whatsapp'],
      });
    }
    res.json({ success: true, data: { quote } });
  } catch (err) {
    next(err);
  }
}

// ---------- Withdrawals ----------
async function listWithdrawals(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const { rows, pagination } = await paginate(Withdrawal, filter, req, { populate: [{ path: 'user', select: 'name phone' }] });
    res.json({ success: true, data: { withdrawals: rows, pagination } });
  } catch (err) {
    next(err);
  }
}

// Approve = send the payout (provider, mock, or queued for manual settlement).
// Reject = refund to wallet.
async function processWithdrawal(req, res, next) {
  try {
    const w = await Withdrawal.findById(req.params.id).populate('user', 'name');
    if (!w) return fail(res, 404, 'Withdrawal not found');
    if (w.status !== 'requested') return fail(res, 409, `Already ${w.status}`);
    if (req.body.action === 'reject') {
      await wallet.withTransaction(async (session) => {
        await wallet.credit(w.user._id, w.amount, 'refund', { reference: String(w._id), note: 'Withdrawal rejected' }, session);
        w.status = 'rejected';
        w.note = req.body.note || '';
        w.processedBy = req.user._id;
        await w.save({ session });
      });
    } else {
      const result = await gateway.sendPayout({
        amount: w.amount,
        method: w.method === 'bank_transfer' ? 'bank' : w.method,
        walletId: w.walletId,
        bankAccount: w.bankAccount,
        name: w.user.name,
        reference: `WD-${w._id}`,
      });
      w.status = result.status === 'processed' ? 'paid' : 'processing';
      w.payoutReference = result.id;
      w.isMock = result.mock;
      w.processedBy = req.user._id;
      await w.save();
      await Payment.create({
        paymentId: `WD-${w._id}`,
        user: w.user._id,
        amount: w.amount,
        purpose: 'withdrawal',
        method: w.method,
        status: w.status === 'paid' ? 'successful' : 'pending',
        payoutReference: result.id,
        isMock: result.mock,
      });
    }
    await audit(req, `withdrawal.${req.body.action}`, { entity: 'Withdrawal', entityId: w._id, after: { status: w.status, amount: w.amount } });
    await notify(w.user._id, {
      type: 'wallet.withdrawal',
      title: w.status === 'rejected' ? 'Withdrawal rejected' : 'Withdrawal sent',
      body: w.status === 'rejected' ? `रु ${w.amount} is back in your wallet. ${w.note || ''}` : `रु ${w.amount} is on its way to your ${{ esewa: 'eSewa', khalti: 'Khalti', bank_transfer: 'bank account' }[w.method] || 'account'}.`,
      link: '/wallet',
      channels: ['inapp', 'push', 'whatsapp'],
    });
    res.json({ success: true, data: { withdrawal: w } });
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    next(err);
  }
}

// Finance marks a manually settled payout (eSewa/Khalti/bank transfer done
// outside the app) as paid. Updates the linked pickup or withdrawal too.
async function markPaymentPaid(req, res, next) {
  try {
    const payment = await Payment.findOne({ paymentId: req.params.paymentId });
    if (!payment) return fail(res, 404, 'Payment not found');
    if (payment.status === 'successful') return fail(res, 409, 'Already paid');
    if (payment.direction === 'collection') return fail(res, 400, 'Only payouts can be marked paid here');
    const before = payment.status;
    payment.status = 'successful';
    if (req.body.reference) payment.payoutReference = req.body.reference;
    await payment.save();
    if (payment.pickup) {
      await Pickup.updateOne({ _id: payment.pickup }, { 'payout.status': 'paid', 'payout.paidAt': new Date(), ...(req.body.reference ? { 'payout.reference': req.body.reference } : {}) });
    }
    if (payment.purpose === 'withdrawal') {
      await Withdrawal.updateOne({ _id: payment.paymentId.replace(/^WD-/, '') }, { status: 'paid', ...(req.body.reference ? { payoutReference: req.body.reference } : {}) });
    }
    await audit(req, 'payment.mark_paid', { entity: 'Payment', entityId: payment.paymentId, before, after: { status: 'successful', reference: req.body.reference } });
    if (payment.user) {
      await notify(payment.user, {
        type: 'payment.paid',
        title: 'Payment sent',
        body: `रु ${payment.amount} has been paid to your ${{ esewa: 'eSewa', khalti: 'Khalti', bank_transfer: 'bank account' }[payment.method] || 'account'}.`,
        link: '/wallet',
        channels: ['inapp', 'push', 'whatsapp'],
      });
    }
    res.json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
}

async function listPayments(req, res, next) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.method) filter.method = req.query.method;
    const { rows, pagination } = await paginate(Payment, filter, req, {
      populate: [
        { path: 'user', select: 'name phone' },
        { path: 'pickup', select: 'pickupId' },
      ],
    });
    res.json({ success: true, data: { payments: rows, pagination } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  recomputeCollectorRating,
  listCoupons,
  createCoupon,
  updateCoupon,
  listReviews,
  moderateReview,
  listNgos,
  upsertNgo,
  listQuotes,
  updateQuote,
  listWithdrawals,
  processWithdrawal,
  listPayments,
  markPaymentPaid,
};
