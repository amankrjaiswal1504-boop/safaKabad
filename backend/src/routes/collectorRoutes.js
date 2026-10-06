const express = require('express');
const c = require('../controllers/collectorController');
const { protect, authorize } = require('../middleware/auth');
const { validate, z, pinCode, phone, bankAccount, payoutMethod } = require('../middleware/validate');

const router = express.Router();

const weighedItems = z
  .array(
    z.object({
      itemName: z.string().min(1).max(120),
      actualWeight: z.coerce.number().min(0).max(100000),
      weighingPhoto: z.string().url().optional(),
    })
  )
  .min(1);
const rateChoice = z.enum(['min', 'avg', 'max']).default('avg');
const time = z.string().regex(/^\d{2}:\d{2}$/);

router.use(protect, authorize('collector'));
router.get('/pickups', c.listAssignedPickups);
router.get('/route', c.dailyRoute);
router.get('/earnings', c.earnings);
router.get('/items', c.catalogForWeighing);
router.get('/pickups/:id', c.getAssignedPickup);
router.put(
  '/pickups/:id/status',
  validate(z.object({ status: z.enum(['COLLECTOR_ON_THE_WAY', 'ARRIVED', 'CANCELLED']), reason: z.string().trim().max(300).optional() })),
  c.updateStatus
);
router.post('/pickups/:id/verify-otp', validate(z.object({ otp: z.string().regex(/^\d{4}$/, 'Enter the 4-digit code') })), c.verifyDoorOtp);
router.put('/pickups/:id/weighing', validate(z.object({ weighedItems, rateChoice })), c.submitWeighing);
router.put(
  '/pickups/:id/complete',
  validate(
    z.object({
      payoutMethod: payoutMethod.default('cash'),
      // eSewa / Khalti ID = the customer's mobile number
      walletId: phone.optional(),
      bankAccount: bankAccount.optional(),
      evidencePhotos: z.array(z.string().url()).max(6).optional(),
    })
  ),
  c.finishPickup
);
router.post('/pickups/:id/late', validate(z.object({ minutes: z.coerce.number().int().min(5).max(120).optional() })), c.notifyCustomerRunningLate);
router.post(
  '/sync',
  validate(z.object({ entries: z.array(z.object({ pickupId: z.string().max(20), weighedItems, rateChoice })).min(1).max(20) })),
  c.syncOffline
);
router.put('/location', validate(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })), c.updateLocation);
router.put(
  '/availability',
  validate(
    z.object({
      isAvailable: z.boolean().optional(),
      workingHours: z.object({ start: time, end: time }).optional(),
      servicePinCodes: z.array(pinCode).max(50).optional(),
    })
  ),
  c.updateAvailability
);

module.exports = router;
