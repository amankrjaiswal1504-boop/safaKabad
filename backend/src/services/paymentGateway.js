// Payments for Nepal.
//
// Collections (a business paying ScrapMate, e.g. an e-waste disposal quote) use
// Khalti ePayment: initiate -> customer pays on Khalti's page -> we verify with
// the lookup API. Without KHALTI_SECRET_KEY a clearly marked mock is used.
//
// Payouts (ScrapMate paying a customer to eSewa / Khalti / bank) have no public
// self-serve API in Nepal; they need a merchant payout agreement. When
// PAYOUT_PROVIDER_URL is configured, payouts are POSTed there (adapter for your
// bank/aggregator). Otherwise:
//   - development: mock "processed" so the full flow can be demoed;
//   - production: queued as "pending" for the finance team to settle and then
//     mark paid in Admin > Payouts & wallet.
const crypto = require('crypto');
const logger = require('../utils/logger');

const KHALTI_BASE = () => (process.env.KHALTI_BASE_URL || 'https://dev.khalti.com/api/v2').replace(/\/$/, '');

function khaltiEnabled() {
  return Boolean(process.env.KHALTI_SECRET_KEY);
}
function payoutsEnabled() {
  return Boolean(process.env.PAYOUT_PROVIDER_URL);
}

async function khaltiRequest(path, body) {
  const res = await fetch(`${KHALTI_BASE()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.detail || data?.error_key || Object.values(data || {})[0] || `Khalti ${res.status}`;
    throw Object.assign(new Error(Array.isArray(msg) ? msg[0] : String(msg)), { status: 502 });
  }
  return data;
}

// Starts a Khalti payment. Amount is in rupees; Khalti expects paisa.
async function createOrder({ amount, orderId, orderName, returnUrl, customer }) {
  const paisa = Math.round(Number(amount) * 100);
  if (!khaltiEnabled()) {
    const pidx = `mock_pidx_${crypto.randomBytes(6).toString('hex')}`;
    return { pidx, paymentUrl: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}pidx=${pidx}&mock=1`, amount: paisa, mock: true };
  }
  const data = await khaltiRequest('/epayment/initiate/', {
    return_url: returnUrl,
    website_url: process.env.CLIENT_URL || 'http://localhost:5173',
    amount: paisa,
    purchase_order_id: orderId,
    purchase_order_name: orderName,
    customer_info: customer,
  });
  return { pidx: data.pidx, paymentUrl: data.payment_url, amount: paisa, mock: false };
}

// Confirms a payment with Khalti's lookup API (never trust the redirect alone).
// Returns { status: 'Completed' | 'Pending' | 'Expired' | 'User canceled' | ..., transactionId, amount }.
async function verifyPayment(pidx) {
  if (!khaltiEnabled()) {
    return String(pidx).startsWith('mock_pidx_') ? { status: 'Completed', transactionId: `mock_txn_${Date.now()}`, mock: true } : { status: 'Failed' };
  }
  const data = await khaltiRequest('/epayment/lookup/', { pidx });
  return { status: data.status, transactionId: data.transaction_id, amount: data.total_amount, mock: false };
}

// Sends money to a customer. method: 'esewa' | 'khalti' | 'bank'.
async function sendPayout({ amount, method, walletId, bankAccount, name, reference }) {
  if (payoutsEnabled()) {
    const res = await fetch(process.env.PAYOUT_PROVIDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.PAYOUT_PROVIDER_TOKEN ? { Authorization: `Bearer ${process.env.PAYOUT_PROVIDER_TOKEN}` } : {}),
        'Idempotency-Key': reference,
      },
      body: JSON.stringify({ amount, currency: 'NPR', method, walletId, bankAccount, name, reference }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.message || 'Payout failed'), { status: 502 });
    return { id: data.id || reference, status: data.status === 'processed' ? 'processed' : 'processing', mock: false };
  }
  if (process.env.NODE_ENV === 'production') {
    logger.info({ amount, method, reference }, 'payout queued for manual settlement');
    return { id: `manual_${reference}`, status: 'queued', mock: false, manual: true };
  }
  logger.info({ amount, method, reference }, '[mock-payout] payout recorded without a payout provider');
  return { id: `mock_payout_${crypto.randomBytes(6).toString('hex')}`, status: 'processed', mock: true };
}

module.exports = { createOrder, verifyPayment, sendPayout, khaltiEnabled, payoutsEnabled };
