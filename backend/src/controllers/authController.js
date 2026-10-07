const crypto = require('crypto');
const User = require('../models/User');
const { RefreshToken } = require('../models/platform');
const {
  signToken,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  newRefreshToken,
  hashToken,
  REFRESH_COOKIE,
} = require('../utils/jwt');
const { sendOtp, verifyOtp, OtpError } = require('../services/otpService');
const { sendEmail } = require('../services/channels');
const { isBlocked } = require('../services/fraudService');
const { MAX_LOGIN_ATTEMPTS, LOCK_MINUTES } = require('../models/User');

// Issues an access cookie + a rotating refresh cookie.
async function issueSession(req, res, user) {
  const access = signToken(user);
  setAuthCookie(res, access);
  const refresh = newRefreshToken();
  await RefreshToken.create({ user: user._id, tokenHash: refresh.hash, expiresAt: refresh.expiresAt, userAgent: req.get('user-agent') });
  setRefreshCookie(res, refresh.token);
  user.lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { lastLoginAt: user.lastLoginAt });
  return access;
}

async function applyReferral(user, code) {
  if (!code) return;
  const referrer = await User.findOne({ referralCode: String(code).trim().toUpperCase(), role: 'customer' });
  if (referrer && String(referrer._id) !== String(user._id)) user.referredBy = referrer._id;
}

async function register(req, res, next) {
  try {
    const { name, email, phone, password, referralCode } = req.body;
    if (await User.exists({ email })) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    if (await isBlocked({ phone, email, ip: req.ip })) {
      return res.status(403).json({ success: false, message: 'Registration is not allowed. Please contact support.' });
    }
    // Public registration is always 'customer'; collector/admin/staff accounts are created by admin.
    const user = new User({ name, email, phone, password, role: 'customer' });
    await applyReferral(user, referralCode);
    await user.save();
    const token = await issueSession(req, res, user);
    res.status(201).json({ success: true, data: { user: user.toSafeObject(), token } });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockUntil +tokenVersion');
    if (user?.isLocked()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ success: false, message: `Too many failed attempts. Try again in ${mins} minute(s).` });
    }
    if (!user || !(await user.comparePassword(password))) {
      if (user) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const update = { failedLoginAttempts: attempts };
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          update.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
          update.failedLoginAttempts = 0;
        }
        await User.updateOne({ _id: user._id }, update);
      }
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }
    await User.updateOne({ _id: user._id }, { failedLoginAttempts: 0, $unset: { lockUntil: 1 } });
    const token = await issueSession(req, res, user);
    res.json({ success: true, data: { user: user.toSafeObject(), token } });
  } catch (err) {
    next(err);
  }
}

// Rotates the refresh token and issues a fresh access cookie.
async function refresh(req, res, next) {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE];
    // No refresh cookie = simply not logged in (not an error for visitors).
    if (!raw) return res.json({ success: true, data: { user: null } });
    const record = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      // Reuse of a revoked token: revoke every session for that user.
      if (record?.revokedAt) await RefreshToken.updateMany({ user: record.user }, { revokedAt: new Date() });
      clearAuthCookie(res);
      return res.status(401).json({ success: false, message: 'Session expired' });
    }
    const user = await User.findById(record.user).select('+tokenVersion');
    if (!user?.isActive) return res.status(401).json({ success: false, message: 'Session expired' });
    record.revokedAt = new Date();
    await record.save();
    await issueSession(req, res, user);
    res.json({ success: true, data: { user: user.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) await RefreshToken.updateOne({ tokenHash: hashToken(raw) }, { revokedAt: new Date() }).catch(() => {});
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logged out' });
}

async function me(req, res) {
  res.json({ success: true, data: { user: req.user.toSafeObject() } });
}

// ---------- Phone OTP ----------

async function requestOtp(req, res, next) {
  try {
    const { phone, purpose } = req.body;
    if (await isBlocked({ phone, ip: req.ip })) {
      return res.status(403).json({ success: false, message: 'This number cannot be used. Please contact support.' });
    }
    const result = await sendOtp(phone, purpose === 'booking' ? 'booking' : 'login');
    const existing = await User.exists({ phone, role: 'customer' });
    res.json({
      success: true,
      message: 'Code sent',
      data: { isNewUser: !existing, devCode: result.devCode },
    });
  } catch (err) {
    if (err instanceof OtpError) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
}

// Verifies the code and logs in. Creates the customer account on first use
// (phone-only accounts can add an email and password later from Profile).
async function verifyOtpLogin(req, res, next) {
  try {
    const { phone, code, name, referralCode } = req.body;
    await verifyOtp(phone, code, 'login');
    let user = await User.findOne({ phone, role: { $in: ['customer', 'collector'] } }).select('+tokenVersion');
    let created = false;
    if (!user) {
      user = new User({ name: name?.trim() || 'SafaKabad customer', phone, phoneVerified: true, role: 'customer' });
      await applyReferral(user, referralCode);
      await user.save();
      created = true;
    } else if (!user.phoneVerified) {
      user.phoneVerified = true;
      await user.save();
    }
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated' });
    const token = await issueSession(req, res, user);
    res.status(created ? 201 : 200).json({ success: true, data: { user: user.toSafeObject(), token, created } });
  } catch (err) {
    if (err instanceof OtpError) return res.status(err.status).json({ success: false, message: err.message });
    next(err);
  }
}

// ---------- Password reset ----------

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    // Always respond the same way so this can't be used to find registered emails.
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = hashToken(token);
      user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${token}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your SafaKabad password',
        text: `Hi ${user.name},\n\nUse this link to set a new password (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.`,
      });
    }
    res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    const user = await User.findOne({
      resetPasswordToken: hashToken(token),
      resetPasswordExpires: { $gt: new Date() },
    }).select('+resetPasswordToken +resetPasswordExpires +tokenVersion');
    if (!user) return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired' });
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out every other session
    await user.save();
    await RefreshToken.updateMany({ user: user._id }, { revokedAt: new Date() });
    await issueSession(req, res, user);
    res.json({ success: true, message: 'Password updated', data: { user: user.toSafeObject() } });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password +tokenVersion');
    if (user.password && !(await user.comparePassword(currentPassword || ''))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await RefreshToken.updateMany({ user: user._id }, { revokedAt: new Date() });
    await issueSession(req, res, user);
    res.json({ success: true, message: 'Password changed' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  requestOtp,
  verifyOtpLogin,
  forgotPassword,
  resetPassword,
  changePassword,
  issueSession,
};
