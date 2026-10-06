const Payment = require('../models/Payment');
const { Quote } = require('../models/platform');
const gateway = require('../services/paymentGateway');
const { generatePaymentId } = require('../utils/generateId');

// Khalti checkout is used when a business pays ScrapMate (e.g. a certified
// e-waste disposal fee on an accepted quote). Customer payouts for scrap go
// through bookingService.payOut instead.
async function createPayment(req, res, next) {
  try {
    const { quoteId } = req.body;
    const quote = await Quote.findOne({ quoteId, customer: req.user._id });
    if (!quote || quote.quotedAmount == null || quote.quotedAmount <= 0) {
      return res.status(404).json({ success: false, message: 'No payable quote found' });
    }
    const paymentId = generatePaymentId();
    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0];
    const order = await gateway.createOrder({
      amount: quote.quotedAmount,
      orderId: paymentId,
      orderName: `ScrapMate quote ${quote.quoteId}`,
      returnUrl: `${clientUrl}/business?paymentId=${paymentId}`,
      customer: { name: req.user.name, email: req.user.email || undefined, phone: req.user.phone },
    });
    const payment = await Payment.create({
      paymentId,
      user: req.user._id,
      amount: quote.quotedAmount,
      direction: 'collection',
      purpose: 'quote',
      method: 'khalti',
      status: 'pending',
      gatewayRef: order.pidx,
      isMock: order.mock,
    });
    res.status(201).json({ success: true, data: { payment, paymentUrl: order.paymentUrl, pidx: order.pidx, mock: order.mock } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
}

// Called after Khalti redirects back (with ?pidx=...). Always re-checks the
// status with Khalti's lookup API; the redirect parameters alone are not trusted.
async function verifyPayment(req, res, next) {
  try {
    const { paymentId, pidx } = req.body;
    const payment = await Payment.findOne({ paymentId, user: req.user._id });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.status === 'successful') return res.json({ success: true, data: { payment } });
    if (pidx !== payment.gatewayRef) return res.status(400).json({ success: false, message: 'Payment reference does not match' });
    const result = await gateway.verifyPayment(pidx);
    if (result.status === 'Completed') {
      payment.status = 'successful';
      payment.gatewayTxnId = result.transactionId;
    } else if (['Expired', 'User canceled', 'Failed', 'Refunded'].includes(result.status)) {
      payment.status = 'failed';
      payment.failureReason = result.status;
    }
    await payment.save();
    if (payment.status !== 'successful') {
      return res.status(payment.status === 'failed' ? 400 : 202).json({
        success: payment.status !== 'failed',
        message: payment.status === 'failed' ? `Payment ${result.status.toLowerCase()}` : 'Payment is still pending',
        data: { payment },
      });
    }
    res.json({ success: true, data: { payment } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
}

async function getPayment(req, res, next) {
  try {
    const filter = { paymentId: req.params.id };
    if (!['admin', 'staff'].includes(req.user.role)) filter.user = req.user._id;
    const payment = await Payment.findOne(filter).populate('pickup', 'pickupId status');
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: { payment } });
  } catch (err) {
    next(err);
  }
}

async function myPayments(req, res, next) {
  try {
    const payments = await Payment.find({ user: req.user._id }).populate('pickup', 'pickupId').sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: { payments } });
  } catch (err) {
    next(err);
  }
}

module.exports = { createPayment, verifyPayment, getPayment, myPayments };
