const User = require('../models/User');

const BUSINESS_TYPES = ['kirana', 'office', 'society', 'factory', 'other'];

async function getProfile(req, res) {
  res.json({ success: true, data: { user: req.user.toSafeObject() } });
}

async function updateProfile(req, res, next) {
  try {
    const { name, email, language, notificationPrefs, business, accountType } = req.body;
    const user = await User.findById(req.user._id);
    if (name) user.name = name;
    if (email !== undefined && email !== user.email) {
      if (email && (await User.exists({ email, _id: { $ne: user._id } }))) {
        return res.status(409).json({ success: false, message: 'That email is already in use' });
      }
      user.email = email || undefined;
    }
    if (language) user.language = language;
    if (notificationPrefs) user.notificationPrefs = { ...user.notificationPrefs.toObject?.(), ...notificationPrefs };
    if (user.role === 'customer' && accountType) user.accountType = accountType;
    if (user.role === 'customer' && business) {
      user.business = {
        ...user.business?.toObject?.(),
        companyName: business.companyName,
        businessType: BUSINESS_TYPES.includes(business.businessType) ? business.businessType : 'other',
        panVat: business.panVat,
        billingAddress: business.billingAddress,
        // pricingTier is set by admins only
        pricingTier: user.business?.pricingTier || 'standard',
      };
    }
    await user.save();
    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

async function subscribePush(req, res, next) {
  try {
    const sub = req.body.subscription;
    const user = await User.findById(req.user._id).select('+pushSubscriptions');
    user.pushSubscriptions = [...(user.pushSubscriptions || []).filter((s) => s.endpoint !== sub.endpoint), sub].slice(-5);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function unsubscribePush(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+pushSubscriptions');
    user.pushSubscriptions = (user.pushSubscriptions || []).filter((s) => s.endpoint !== req.body.endpoint);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, updateProfile, subscribePush, unsubscribePush };
