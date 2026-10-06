const express = require('express');
const { getProfile, updateProfile, subscribePush, unsubscribePush } = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { validate, z, panVat } = require('../middleware/validate');

const router = express.Router();

router.use(protect);
router.get('/profile', getProfile);
router.put(
  '/profile',
  validate(
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      email: z.union([z.string().trim().toLowerCase().email(), z.literal('')]).optional(),
      language: z.enum(['en', 'ne']).optional(),
      accountType: z.enum(['individual', 'business']).optional(),
      notificationPrefs: z
        .object({ email: z.boolean(), whatsapp: z.boolean(), sms: z.boolean(), push: z.boolean() })
        .partial()
        .optional(),
      business: z
        .object({
          companyName: z.string().trim().max(120).optional(),
          businessType: z.string().max(20).optional(),
          // Nepal PAN / VAT registration number (9 digits)
          panVat: panVat.optional(),
          billingAddress: z.string().trim().max(300).optional(),
        })
        .optional(),
    })
  ),
  updateProfile
);
router.post(
  '/push/subscribe',
  validate(z.object({ subscription: z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }) })),
  subscribePush
);
router.post('/push/unsubscribe', validate(z.object({ endpoint: z.string() })), unsubscribePush);

module.exports = router;
