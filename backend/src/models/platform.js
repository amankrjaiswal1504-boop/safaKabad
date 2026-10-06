// New collections added in the upgrade. Each is a small schema, kept together
// here to make the data model easy to review; they're re-exported by name.
const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// ---------- CMS / settings (single document per key) ----------
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// ---------- Audit log ----------
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: ObjectId, ref: 'User', index: true },
    actorName: String,
    action: { type: String, required: true, index: true }, // e.g. "price.update"
    entity: String,
    entityId: String,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditLogSchema.index({ createdAt: -1 });

// ---------- Notifications ----------
const notificationSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
    channels: { type: [String], default: [] },
  },
  { timestamps: true }
);
notificationSchema.index({ user: 1, createdAt: -1 });

// ---------- OTP codes (phone login, guest booking) ----------
const otpCodeSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['login', 'booking'], default: 'login' },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------- Refresh tokens ----------
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    userAgent: String,
  },
  { timestamps: true }
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------- Cities (price zones) ----------
// A city owns one price list (ScrapPrice.city === City.name) and groups the
// service areas (municipalities) customers can book from. Admin-managed; the
// customer site, chat and SEO pages read the active list from here.
const citySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    nameNe: { type: String, trim: true, default: '' },
    slug: { type: String, required: true, unique: true },
    district: { type: String, trim: true, default: '' },
    province: { type: String, trim: true, default: '' },
    center: { lat: Number, lng: Number },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ---------- Serviceable areas (municipalities within a city) ----------
const AREA_TYPES = ['metropolitan', 'sub_metropolitan', 'municipality', 'rural_municipality'];
const serviceAreaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // municipality, e.g. "Kirtipur"
    nameNe: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true, index: true }, // City.name (price list)
    type: { type: String, enum: AREA_TYPES, default: 'municipality' },
    district: { type: String, trim: true, default: '' },
    state: { type: String, default: '' }, // province
    wards: { type: Number, min: 1, max: 40, default: 1 },
    servedWards: { type: [Number], default: [] }, // empty = every ward
    pinCodes: { type: [String], default: [] }, // post offices serving the area; first = default
    minPickupWeightKg: { type: Number, default: 0 },
    minPickupValue: { type: Number, default: 0 },
    center: { lat: Number, lng: Number },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);
serviceAreaSchema.index({ pinCodes: 1 });
serviceAreaSchema.index({ city: 1, name: 1 }, { unique: true });

// ---------- Reviews ----------
const reviewSchema = new mongoose.Schema(
  {
    pickup: { type: ObjectId, ref: 'Pickup', required: true, unique: true },
    customer: { type: ObjectId, ref: 'User', required: true, index: true },
    collector: { type: ObjectId, ref: 'User', index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 1000, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    featured: { type: Boolean, default: false }, // shown as a testimonial on the home page
  },
  { timestamps: true }
);

// ---------- Coupons ----------
const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 },
    maxBonus: { type: Number, default: null },
    minWeightKg: { type: Number, default: 0 },
    minOrderValue: { type: Number, default: 0 },
    firstPickupOnly: { type: Boolean, default: false },
    usageLimit: { type: Number, default: null },
    perUserLimit: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    validFrom: { type: Date, default: Date.now },
    validTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ---------- Wallet ----------
const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true },
    reason: { type: String, required: true }, // pickup_payout | referral | withdrawal | refund | bonus
    reference: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);
walletTransactionSchema.index({ user: 1, createdAt: -1 });

const withdrawalSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ['esewa', 'khalti', 'bank_transfer'], required: true },
    walletId: String, // eSewa / Khalti ID (mobile number)
    bankAccount: { accountNumber: String, bankName: String, branch: String, holderName: String },
    status: { type: String, enum: ['requested', 'processing', 'paid', 'rejected'], default: 'requested', index: true },
    payoutReference: String,
    isMock: { type: Boolean, default: false },
    processedBy: { type: ObjectId, ref: 'User' },
    note: String,
  },
  { timestamps: true }
);

// ---------- Recurring pickups ----------
const recurringPlanSchema = new mongoose.Schema(
  {
    customer: { type: ObjectId, ref: 'User', required: true, index: true },
    address: { type: ObjectId, ref: 'Address', required: true },
    items: [{ item: { type: ObjectId, ref: 'ScrapItem' }, estimatedQuantity: Number, _id: false }],
    frequency: { type: String, enum: ['weekly', 'biweekly', 'monthly'], required: true },
    dayOfWeek: { type: Number, min: 0, max: 6, default: 6 }, // weekly/biweekly
    dayOfMonth: { type: Number, min: 1, max: 28, default: 1 }, // monthly
    timeSlot: { type: String, required: true },
    contactPhone: { type: String, required: true },
    nextRunDate: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true },
    lastPickupId: String,
  },
  { timestamps: true }
);

// ---------- Business quotes ----------
const quoteSchema = new mongoose.Schema(
  {
    quoteId: { type: String, required: true, unique: true },
    customer: { type: ObjectId, ref: 'User', index: true },
    contactName: { type: String, required: true },
    companyName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: '' },
    city: { type: String, required: true },
    panVat: { type: String, default: '' }, // Nepal PAN/VAT number
    businessType: { type: String, default: 'other' },
    description: { type: String, required: true },
    estimatedQuantityKg: { type: Number, default: 0 },
    wantsCertificate: { type: Boolean, default: false },
    status: { type: String, enum: ['new', 'contacted', 'quoted', 'won', 'lost'], default: 'new', index: true },
    quotedAmount: { type: Number, default: null },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

// ---------- Price alerts ----------
const priceAlertSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    item: { type: ObjectId, ref: 'ScrapItem', required: true, index: true },
    city: { type: String, required: true },
    direction: { type: String, enum: ['above', 'below'], default: 'above' },
    threshold: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    lastTriggeredAt: Date,
  },
  { timestamps: true }
);

// ---------- NGO partners (donations) ----------
const ngoSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    cities: { type: [String], default: [] },
    accepts: { type: [String], default: [] }, // category slugs, e.g. clothes, books, ewaste
    registrationNumber: { type: String, default: '' },
    logo: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ---------- Funnel analytics events ----------
const analyticsEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['visit', 'estimate', 'booking_started', 'booking', 'completed'], required: true, index: true },
    sessionId: String,
    user: { type: ObjectId, ref: 'User' },
    path: String,
    city: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
analyticsEventSchema.index({ createdAt: -1, type: 1 });

// ---------- Fraud / abuse blocklist ----------
const blocklistSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['phone', 'email', 'ip', 'pincode'], required: true },
    value: { type: String, required: true, trim: true, lowercase: true },
    reason: { type: String, default: '' },
    addedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
blocklistSchema.index({ type: 1, value: 1 }, { unique: true });

module.exports = {
  Setting: mongoose.model('Setting', settingSchema),
  AuditLog: mongoose.model('AuditLog', auditLogSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  OtpCode: mongoose.model('OtpCode', otpCodeSchema),
  RefreshToken: mongoose.model('RefreshToken', refreshTokenSchema),
  ServiceArea: mongoose.model('ServiceArea', serviceAreaSchema),
  City: mongoose.model('City', citySchema),
  AREA_TYPES,
  Review: mongoose.model('Review', reviewSchema),
  Coupon: mongoose.model('Coupon', couponSchema),
  WalletTransaction: mongoose.model('WalletTransaction', walletTransactionSchema),
  Withdrawal: mongoose.model('Withdrawal', withdrawalSchema),
  RecurringPlan: mongoose.model('RecurringPlan', recurringPlanSchema),
  Quote: mongoose.model('Quote', quoteSchema),
  PriceAlert: mongoose.model('PriceAlert', priceAlertSchema),
  Ngo: mongoose.model('Ngo', ngoSchema),
  AnalyticsEvent: mongoose.model('AnalyticsEvent', analyticsEventSchema),
  Blocklist: mongoose.model('Blocklist', blocklistSchema),
};
