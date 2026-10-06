const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const STAFF_ROLES = ['support', 'operations', 'finance'];

// Permissions each staff role gets on admin routes. Admins have all of them.
const STAFF_PERMISSIONS = {
  support: ['support', 'users:read', 'pickups:read', 'reviews'],
  operations: ['pickups', 'pickups:read', 'dispatch', 'collectors', 'users:read', 'service-areas', 'slots', 'catalog', 'prices'],
  finance: ['payments', 'withdrawals', 'analytics', 'coupons', 'pickups:read', 'users:read'],
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Email is optional for accounts created through phone OTP (guest booking).
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    phoneVerified: { type: Boolean, default: false },
    password: { type: String, minlength: 6, select: false },
    role: {
      type: String,
      enum: ['customer', 'collector', 'admin', 'staff'],
      default: 'customer',
    },
    staffRole: { type: String, enum: [...STAFF_ROLES, null], default: null },
    isActive: { type: Boolean, default: true },
    language: { type: String, enum: ['en', 'ne'], default: 'en' },

    // Customer growth/retention
    walletBalance: { type: Number, default: 0, min: 0 },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralRewarded: { type: Boolean, default: false },
    accountType: { type: String, enum: ['individual', 'business'], default: 'individual' },
    business: {
      companyName: String,
      businessType: { type: String, enum: ['kirana', 'office', 'society', 'factory', 'other', null], default: null },
      panVat: String, // Nepal PAN/VAT number (9 digits)
      billingAddress: String,
      pricingTier: { type: String, default: 'standard' },
    },
    notificationPrefs: {
      email: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
    },
    pushSubscriptions: { type: [Object], default: [], select: false },

    // collector-only fields
    collectorProfile: {
      city: { type: String },
      vehicleNumber: { type: String },
      totalPickupsCompleted: { type: Number, default: 0 },
      rating: { type: Number, default: 0 },
      ratingCount: { type: Number, default: 0 },
      isAvailable: { type: Boolean, default: true },
      workingHours: {
        start: { type: String, default: '09:00' },
        end: { type: String, default: '19:00' },
      },
      servicePinCodes: { type: [String], default: [] },
      serviceAreas: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ServiceArea' }],
      commissionRate: { type: Number, default: null }, // overrides the global rate when set
      location: {
        lat: Number,
        lng: Number,
        updatedAt: Date,
      },
    },

    // Security
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    tokenVersion: { type: Number, default: 0, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ 'collectorProfile.servicePinCodes': 1 });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.referralCode && this.role === 'customer') {
    const base = (this.name || 'SM').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'SM';
    this.referralCode = `${base}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil > new Date());
};

userSchema.methods.permissions = function permissions() {
  if (this.role === 'admin') return ['*'];
  if (this.role === 'staff') return STAFF_PERMISSIONS[this.staffRole] || [];
  return [];
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.failedLoginAttempts;
  delete obj.lockUntil;
  delete obj.tokenVersion;
  delete obj.pushSubscriptions;
  obj.permissions = this.permissions();
  return obj;
};

module.exports = mongoose.model('User', userSchema);
module.exports.STAFF_ROLES = STAFF_ROLES;
module.exports.STAFF_PERMISSIONS = STAFF_PERMISSIONS;
module.exports.MAX_LOGIN_ATTEMPTS = MAX_LOGIN_ATTEMPTS;
module.exports.LOCK_MINUTES = LOCK_MINUTES;
