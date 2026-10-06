// Mounted at /api: /wallet, /referrals, /impact, /coupons, /recurring,
// /price-alerts, /quotes, /notifications, /uploads
const express = require('express');
const rateLimit = require('express-rate-limit');
const g = require('../controllers/growthController');
const { protect, optionalAuth, authorize } = require('../middleware/auth');
const { validate, z, objectId, phone, bankAccount, panVat } = require('../middleware/validate');
const { upload } = require('../services/storageService');

const router = express.Router();
const customer = [protect, authorize('customer')];
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const quoteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

router.get('/wallet', customer, g.getWallet);
router.post(
  '/wallet/withdraw',
  customer,
  validate(
    z
      .object({
        amount: z.coerce.number().min(50, 'Minimum withdrawal is Rs. 50').max(100000),
        method: z.enum(['esewa', 'khalti', 'bank_transfer']),
        // eSewa / Khalti ID = registered mobile number
        walletId: phone.optional(),
        bankAccount: bankAccount.optional(),
      })
      .refine((v) => (v.method === 'bank_transfer' ? v.bankAccount : v.walletId), 'Add your eSewa/Khalti ID or bank details')
  ),
  g.requestWithdrawal
);

router.get('/referrals', customer, g.myReferrals);
router.get('/impact', customer, g.myImpact);
router.post(
  '/coupons/validate',
  customer,
  validate(z.object({ code: z.string().trim().min(2).max(30), weightKg: z.coerce.number().min(0).default(0), value: z.coerce.number().min(0).default(0) })),
  g.checkCoupon
);

const planItems = z.array(z.object({ itemId: objectId, estimatedQuantity: z.coerce.number().positive().max(100000) })).min(1).max(20);
router.get('/recurring', customer, g.listPlans);
router.post(
  '/recurring',
  customer,
  validate(
    z.object({
      addressId: objectId,
      items: planItems,
      frequency: z.enum(['weekly', 'biweekly', 'monthly']),
      dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
      dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
      timeSlot: z.string().min(3).max(40),
      contactPhone: phone.optional(),
    })
  ),
  g.createPlan
);
router.put(
  '/recurring/:id',
  customer,
  validate(
    z.object({
      frequency: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
      dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
      dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
      timeSlot: z.string().min(3).max(40).optional(),
      isActive: z.boolean().optional(),
    })
  ),
  g.updatePlan
);
router.delete('/recurring/:id', customer, g.deletePlan);

router.get('/price-alerts', customer, g.listAlerts);
router.post(
  '/price-alerts',
  customer,
  validate(
    z.object({
      itemId: objectId,
      city: z.string().trim().min(2).max(60),
      direction: z.enum(['above', 'below']).default('above'),
      threshold: z.coerce.number().positive().max(1000000),
    })
  ),
  g.createAlert
);
router.delete('/price-alerts/:id', customer, g.deleteAlert);

router.post(
  '/quotes',
  quoteLimiter,
  optionalAuth,
  validate(
    z.object({
      contactName: z.string().trim().min(2).max(80),
      companyName: z.string().trim().min(2).max(120),
      phone,
      email: z.union([z.string().trim().email(), z.literal('')]).optional(),
      city: z.string().trim().min(2).max(60),
      panVat: panVat.optional(),
      businessType: z.enum(['kirana', 'office', 'society', 'factory', 'other']).default('other'),
      description: z.string().trim().min(10, 'Tell us a little about the scrap').max(2000),
      estimatedQuantityKg: z.coerce.number().min(0).max(10000000).default(0),
      wantsCertificate: z.boolean().default(false),
    })
  ),
  g.createQuote
);
router.get('/quotes/mine', customer, g.myQuotes);

router.get('/notifications', protect, g.listNotifications);
router.put('/notifications/:id/read', protect, g.markRead);

// Guests may upload booking photos (pickups folder only); staff folders need login.
router.post('/uploads', optionalAuth, uploadLimiter, upload.array('photos', 6), g.uploadPhotos);

module.exports = router;
