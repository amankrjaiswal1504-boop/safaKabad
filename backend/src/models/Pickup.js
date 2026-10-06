const mongoose = require('mongoose');

const PICKUP_STATUSES = [
  'BOOKED',
  'ASSIGNED',
  'COLLECTOR_ON_THE_WAY',
  'ARRIVED',
  'WEIGHING',
  'COMPLETED',
  'CANCELLED',
];

const pickupItemSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'ScrapItem', required: true },
    itemName: { type: String, required: true }, // snapshot at booking time
    unit: { type: String, default: 'kg' },
    estimatedQuantity: { type: Number, required: true },
    // E-waste / appliance condition, adjusts the estimate and final rate
    condition: { type: String, enum: ['working', 'not_working', 'damaged', null], default: null },
    actualWeight: { type: Number },
    rateApplied: { type: Number },
    subtotal: { type: Number },
    weighingPhoto: { type: String }, // photo of the scale display
  },
  { _id: false }
);

const pickupSchema = new mongoose.Schema(
  {
    pickupId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['sale', 'donation'], default: 'sale' },
    ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'Ngo', default: null },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    collector: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    items: { type: [pickupItemSchema], required: true },
    address: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', required: true },
    addressSnapshot: { type: Object, required: true },
    pinCode: { type: String, index: true },
    area: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceArea', index: true },
    city: { type: String, index: true },
    location: { lat: Number, lng: Number },
    scheduledDate: { type: Date, required: true, index: true },
    timeSlot: { type: String, required: true },
    contactPhone: { type: String, required: true },
    notes: { type: String, default: '' },
    estimatedValueMin: { type: Number, required: true },
    estimatedValueMax: { type: Number, required: true },
    finalAmount: { type: Number },
    bonusAmount: { type: Number, default: 0 }, // coupon / tier bonus, paid on top of finalAmount
    status: { type: String, enum: PICKUP_STATUSES, default: 'BOOKED', index: true },
    statusHistory: {
      type: [{ status: String, at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, _id: false }],
      default: [],
    },
    // Customer photos at booking + collector before/after evidence
    photos: { type: [String], default: [] },
    evidencePhotos: { type: [String], default: [] },
    // 4-digit code the customer shares at the door before weighing can start
    otp: { type: String, select: false },
    otpVerifiedAt: { type: Date },
    customerDecision: {
      status: { type: String, enum: ['pending', 'accepted', 'disputed', null], default: null },
      note: String,
      at: Date,
    },
    payout: {
      method: { type: String, enum: ['cash', 'esewa', 'khalti', 'bank_transfer', 'wallet', null], default: null },
      status: { type: String, enum: ['pending', 'processing', 'paid', 'failed', null], default: null },
      reference: String,
      walletId: String, // customer's eSewa / Khalti ID (their mobile number)
      paidAt: Date,
    },
    coupon: { code: String, bonusAmount: Number },
    review: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: null },
    recurringPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurringPlan', default: null },
    source: { type: String, enum: ['web', 'chat', 'recurring', 'admin', 'guest'], default: 'web' },
    rescheduleCount: { type: Number, default: 0 },
    flags: { type: [String], default: [] }, // fraud/abuse signals, e.g. "duplicate"
    cancelReason: { type: String },
    cancelledBy: { type: String, enum: ['customer', 'collector', 'admin', 'system', null], default: null },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

pickupSchema.index({ status: 1, scheduledDate: 1 });
pickupSchema.index({ customer: 1, createdAt: -1 });
pickupSchema.index({ collector: 1, status: 1, scheduledDate: 1 });
pickupSchema.index({ scheduledDate: 1, timeSlot: 1, pinCode: 1 });

// Record every status change with a timestamp (used by the tracking timeline).
pickupSchema.pre('save', function recordStatus(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({ status: this.status, at: new Date(), by: this.$locals?.changedBy });
    if (this.status === 'COMPLETED' && !this.completedAt) this.completedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Pickup', pickupSchema);
module.exports.PICKUP_STATUSES = PICKUP_STATUSES;
