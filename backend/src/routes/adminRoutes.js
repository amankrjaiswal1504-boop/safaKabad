const express = require('express');
const admin = require('../controllers/adminController');
const catalog = require('../controllers/adminCatalogController');
const growth = require('../controllers/adminGrowthController');
const system = require('../controllers/adminSystemController');
const support = require('../controllers/supportAdminController');
const { protect, authorize, requirePermission: can } = require('../middleware/auth');
const { validate, z, objectId, pinCode, phone, password, isoDate } = require('../middleware/validate');
const { STAFF_ROLES } = require('../models/User');

const router = express.Router();

// Admins have every permission; staff get the subset for their role.
router.use(protect, authorize('admin', 'staff'));

const email = z.string().trim().toLowerCase().email();
const money = z.coerce.number().min(0).max(10000000);
const pickupIdParam = validate(z.object({ id: z.string().regex(/^SM-\d{4}-\d{6}$/i, 'Invalid pickup ID') }), 'params');
const idParam = validate(z.object({ id: objectId }), 'params');

router.get('/dashboard', can('pickups:read', 'analytics'), admin.dashboard);

// Users / collectors / staff
router.get('/users', can('users:read'), admin.listUsers);
router.put('/users/:id/toggle-active', can('users'), idParam, admin.toggleUserActive);
router.post('/users/bulk', can('users'), validate(z.object({ ids: z.array(objectId).min(1).max(500), action: z.enum(['activate', 'deactivate']) })), admin.bulkUsers);
router.put('/users/:id/business-tier', can('users'), idParam, validate(z.object({ pricingTier: z.string().trim().min(2).max(30) })), admin.setBusinessTier);

const collectorFields = {
  city: z.string().trim().min(2).max(60),
  vehicleNumber: z.string().trim().max(20).optional(),
  servicePinCodes: z.array(pinCode).max(100).optional(),
  commissionRate: z.coerce.number().min(0).max(50).nullable().optional(),
};
router.get('/collectors', can('collectors', 'dispatch', 'pickups'), admin.listCollectors);
router.post('/collectors', can('collectors'), validate(z.object({ name: z.string().trim().min(2).max(80), email, phone, password, ...collectorFields })), admin.createCollector);
router.put(
  '/collectors/:id',
  can('collectors'),
  idParam,
  validate(
    z
      .object({
        name: z.string().trim().min(2).max(80),
        phone,
        isActive: z.boolean(),
        isAvailable: z.boolean(),
        workingHours: z.object({ start: z.string(), end: z.string() }),
        ...collectorFields,
      })
      .partial()
  ),
  admin.updateCollector
);

router.get('/staff', can('*'), admin.listStaff);
router.post('/staff', can('*'), validate(z.object({ name: z.string().trim().min(2).max(80), email, phone, password, staffRole: z.enum(STAFF_ROLES) })), admin.createStaff);
router.put('/staff/:id', can('*'), idParam, validate(z.object({ staffRole: z.enum(STAFF_ROLES).optional(), isActive: z.boolean().optional() })), admin.updateStaff);

// Pickups & dispatch
router.get('/pickups', can('pickups:read'), admin.listAllPickups);
router.post(
  '/pickups',
  can('pickups'),
  validate(
    z.object({
      customerId: objectId,
      addressId: objectId,
      items: z.array(z.object({ itemId: objectId, estimatedQuantity: z.coerce.number().positive(), condition: z.enum(['working', 'not_working', 'damaged']).optional() })).min(1),
      scheduledDate: isoDate,
      timeSlot: z.string().min(3).max(40),
      contactPhone: phone.optional(),
      notes: z.string().max(500).optional(),
      overrideSlot: z.boolean().optional(),
    })
  ),
  admin.adminCreatePickup
);
router.get('/pickups/:id', can('pickups:read'), pickupIdParam, admin.getPickupAdmin);
router.put(
  '/pickups/:id/status',
  can('pickups'),
  pickupIdParam,
  validate(z.object({ status: z.enum(['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING', 'CANCELLED']), reason: z.string().max(300).optional() })),
  admin.adminUpdatePickupStatus
);
router.post('/pickups/:id/auto-assign', can('pickups', 'dispatch'), pickupIdParam, admin.autoAssignPickup);
router.put('/pickups/:id/clear-flags', can('pickups'), pickupIdParam, system.clearFlags);
router.post(
  '/pickups/bulk',
  can('pickups', 'dispatch'),
  validate(
    z.object({
      pickupIds: z.array(z.string().regex(/^SM-\d{4}-\d{6}$/i)).min(1).max(200),
      action: z.enum(['assign', 'auto-assign', 'cancel']),
      collectorId: objectId.optional(),
      reason: z.string().max(300).optional(),
    })
  ),
  admin.bulkPickups
);
router.post('/assign-collector', can('pickups', 'dispatch'), validate(z.object({ pickupId: z.string(), collectorId: objectId })), admin.assignCollector);
router.get('/dispatch', can('dispatch', 'pickups'), admin.dispatchBoard);
router.get('/live-map', can('dispatch', 'pickups'), admin.liveMap);

// Catalog & prices
const categoryBody = z.object({
  name: z.string().trim().min(2).max(60),
  nameNe: z.string().trim().max(60).optional(),
  slug: z.string().trim().max(60).optional(),
  description: z.string().trim().max(300).optional(),
  icon: z.string().trim().max(30).optional(),
  image: z.string().url().or(z.literal('')).optional(),
  sortOrder: z.coerce.number().int().optional(),
  conditionGrading: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const priceFields = { city: z.string().trim().min(2).max(60).optional(), minPrice: money.optional(), maxPrice: money.optional(), recyclerPrice: money.nullable().optional() };
const itemBody = z.object({
  categoryId: objectId,
  name: z.string().trim().min(2).max(80),
  nameNe: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
  image: z.string().url().or(z.literal('')).optional(),
  unit: z.enum(['kg', 'piece', 'unit']).default('kg'),
  co2PerUnit: z.coerce.number().min(0).max(10000).optional(),
  kgPerUnit: z.coerce.number().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  ...priceFields,
});
router.get('/categories', can('catalog', 'prices'), catalog.listCategories);
router.post('/categories', can('catalog'), validate(categoryBody), catalog.createCategory);
router.put('/categories/:id', can('catalog'), idParam, validate(categoryBody.partial()), catalog.updateCategory);
router.get('/scrap-items', can('catalog', 'prices'), catalog.listItems);
router.post('/scrap-items', can('catalog'), validate(itemBody), catalog.createScrapItem);
router.put('/scrap-items/:id', can('catalog', 'prices'), idParam, validate(itemBody.partial()), catalog.updateScrapItem);
router.delete('/scrap-items/:id', can('catalog'), idParam, catalog.deleteScrapItem);
router.post(
  '/prices/bulk',
  can('prices'),
  validate(
    z.object({
      city: z.string().trim().min(2).max(60),
      percentChange: z.coerce.number().min(-90).max(500).optional(),
      categoryId: objectId.optional(),
      updates: z.array(z.object({ itemId: objectId, minPrice: money, maxPrice: money, recyclerPrice: money.nullable().optional() })).max(500).default([]),
    })
  ),
  catalog.bulkPrices
);
router.post('/prices/copy-city', can('prices'), validate(z.object({ fromCity: z.string().min(2), toCity: z.string().trim().min(2).max(60), percentChange: z.coerce.number().min(-90).max(200).default(0) })), catalog.copyCityPrices);
router.get('/prices/history', can('prices', 'catalog'), catalog.priceHistory);

// Service areas
const areaBody = z.object({
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).optional(),
  pinCodes: z.array(pinCode).max(2000).default([]),
  minPickupWeightKg: z.coerce.number().min(0).max(10000).default(0),
  minPickupValue: z.coerce.number().min(0).max(1000000).default(0),
  center: z.object({ lat: z.number(), lng: z.number() }).optional(),
  isActive: z.boolean().optional(),
});
router.get('/service-areas', can('service-areas'), catalog.listAreas);
router.post('/service-areas', can('service-areas'), validate(areaBody), catalog.createArea);
router.put('/service-areas/:id', can('service-areas'), idParam, validate(areaBody.partial()), catalog.updateArea);
router.delete('/service-areas/:id', can('service-areas'), idParam, catalog.deleteArea);

// Coupons, reviews, NGOs, quotes, finance
const couponBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, 'Use 3-20 letters/numbers'),
  description: z.string().trim().max(200).optional(),
  type: z.enum(['percent', 'flat']),
  value: z.coerce.number().positive().max(100000),
  maxBonus: money.nullable().optional(),
  minWeightKg: z.coerce.number().min(0).default(0),
  minOrderValue: money.default(0),
  firstPickupOnly: z.boolean().default(false),
  usageLimit: z.coerce.number().int().positive().nullable().optional(),
  perUserLimit: z.coerce.number().int().positive().default(1),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
});
router.get('/coupons', can('coupons'), growth.listCoupons);
router.post('/coupons', can('coupons'), validate(couponBody), growth.createCoupon);
router.put('/coupons/:id', can('coupons'), idParam, validate(couponBody.partial()), growth.updateCoupon);

router.get('/reviews', can('reviews'), growth.listReviews);
router.put('/reviews/:id', can('reviews'), idParam, validate(z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional(), featured: z.boolean().optional() })), growth.moderateReview);

const ngoBody = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  cities: z.array(z.string().trim().max(60)).max(50).default([]),
  accepts: z.array(z.string().trim().max(40)).max(20).default([]),
  registrationNumber: z.string().trim().max(60).optional(),
  logo: z.string().url().or(z.literal('')).optional(),
  isActive: z.boolean().optional(),
});
router.get('/ngos', can('*'), growth.listNgos);
router.post('/ngos', can('*'), validate(ngoBody), growth.upsertNgo);
router.put('/ngos/:id', can('*'), idParam, validate(ngoBody.partial()), growth.upsertNgo);

router.get('/quotes', can('users:read', 'payments'), growth.listQuotes);
router.put(
  '/quotes/:id',
  can('users', 'payments', 'pickups'),
  idParam,
  validate(z.object({ status: z.enum(['new', 'contacted', 'quoted', 'won', 'lost']).optional(), quotedAmount: money.nullable().optional(), adminNote: z.string().max(1000).optional() })),
  growth.updateQuote
);

router.get('/withdrawals', can('withdrawals'), growth.listWithdrawals);
router.post('/withdrawals/:id', can('withdrawals'), idParam, validate(z.object({ action: z.enum(['approve', 'reject']), note: z.string().max(300).optional() })), growth.processWithdrawal);
router.get('/payments', can('payments'), growth.listPayments);
router.put('/payments/:paymentId/mark-paid', can('payments', 'withdrawals'), validate(z.object({ reference: z.string().trim().max(120).optional() })), growth.markPaymentPaid);

// Analytics, settings, audit, fraud
router.get('/analytics', can('analytics'), system.analytics);
router.get('/reports', can('analytics'), system.analytics); // older reports page
router.get('/settings', can('*'), system.getSettings);
router.put('/settings/:key', can('*'), validate(z.object({ value: z.any() })), system.updateSetting);
router.get('/audit-log', can('*'), system.auditLog);
router.get('/fraud', can('users', 'pickups'), system.listBlocklist);
router.post(
  '/fraud/blocklist',
  can('*'),
  validate(z.object({ type: z.enum(['phone', 'email', 'ip', 'pincode']), value: z.string().trim().min(3).max(120), reason: z.string().trim().max(300).optional() })),
  system.addBlock
);
router.delete('/fraud/blocklist/:id', can('*'), idParam, system.removeBlock);

// Chat & Support
router.get('/support/conversations', can('support'), support.listConversations);
router.get('/support/conversations/:id', can('support'), support.getConversation);
router.put('/support/conversations/:id/resolve', can('support'), support.resolveConversation);
router.get('/support/tickets', can('support'), support.listTickets);
router.put('/support/tickets/:ticketId', can('support'), support.updateTicket);
router.get('/support/analytics', can('support', 'analytics'), support.chatAnalytics);
router.get('/faqs', can('support'), support.listFaqs);
router.post('/faqs', can('support'), validate(z.object({ question: z.string().trim().min(5).max(300), answer: z.string().trim().min(5).max(2000), topic: z.string().trim().min(2).max(40), keywords: z.any().optional(), language: z.enum(['en', 'ne']).optional(), order: z.coerce.number().optional(), isActive: z.boolean().optional() })), support.createFaq);
router.put('/faqs/:id', can('support'), support.updateFaq);
router.delete('/faqs/:id', can('support'), support.deleteFaq);

module.exports = router;
