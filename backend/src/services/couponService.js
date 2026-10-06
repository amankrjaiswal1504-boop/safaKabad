const Pickup = require('../models/Pickup');
const { Coupon } = require('../models/platform');
const settings = require('./settingsService');

class CouponError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function couponBonus(coupon, value) {
  let bonus = coupon.type === 'percent' ? (value * coupon.value) / 100 : coupon.value;
  if (coupon.maxBonus != null) bonus = Math.min(bonus, coupon.maxBonus);
  return Math.max(0, Math.round(bonus));
}

// Server-side validation. weightKg/value are the estimated (or final) totals.
async function validateCoupon(code, user, { weightKg = 0, value = 0 } = {}) {
  const coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase(), isActive: true });
  if (!coupon) throw new CouponError('This code is not valid');
  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) throw new CouponError('This code is not active yet');
  if (coupon.validTo && coupon.validTo < now) throw new CouponError('This code has expired');
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw new CouponError('This code has been fully used');
  if (weightKg < coupon.minWeightKg) throw new CouponError(`Needs at least ${coupon.minWeightKg} kg of scrap`);
  if (value < coupon.minOrderValue) throw new CouponError(`Needs an estimated value of at least Rs. ${coupon.minOrderValue}`);
  if (user) {
    const uses = await Pickup.countDocuments({ customer: user._id, 'coupon.code': coupon.code, status: { $ne: 'CANCELLED' } });
    if (uses >= (coupon.perUserLimit || 1)) throw new CouponError('You have already used this code');
    if (coupon.firstPickupOnly) {
      const prior = await Pickup.exists({ customer: user._id, status: 'COMPLETED' });
      if (prior) throw new CouponError('This code is only for your first pickup');
    }
  }
  return { coupon, bonus: couponBonus(coupon, value) };
}

// First-pickup bonus from settings; used when the customer has no coupon.
async function firstPickupBonus(user, value) {
  const cfg = await settings.get('firstPickupBonus');
  if (!cfg.enabled || !user) return 0;
  const prior = await Pickup.exists({ customer: user._id, status: 'COMPLETED' });
  if (prior) return 0;
  return Math.min(Math.round((value * cfg.percent) / 100), cfg.maxBonus || Infinity);
}

module.exports = { validateCoupon, couponBonus, firstPickupBonus, CouponError };
