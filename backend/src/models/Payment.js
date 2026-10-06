const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true },
    pickup: { type: mongoose.Schema.Types.ObjectId, ref: 'Pickup', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    amount: { type: Number, required: true },
    // direction: payout = ScrapMate pays the customer; collection = customer/business pays ScrapMate
    direction: { type: String, enum: ['payout', 'collection'], default: 'payout' },
    purpose: { type: String, default: 'pickup' }, // pickup | quote | withdrawal
    method: {
      type: String,
      enum: ['cash', 'esewa', 'khalti', 'bank_transfer', 'wallet'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'successful', 'failed'],
      default: 'pending',
      index: true,
    },
    // Gateway references (Khalti pidx / transaction id) for online collections.
    gatewayRef: { type: String, index: true },
    gatewayTxnId: { type: String },
    payoutReference: { type: String },
    isMock: { type: Boolean, default: false },
    failureReason: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
