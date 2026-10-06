const express = require('express');
const { createPayment, verifyPayment, getPayment, myPayments } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

router.use(protect);
router.get('/', myPayments);
// Starts a Khalti payment and returns the Khalti payment page URL.
router.post('/create', validate(z.object({ quoteId: z.string().max(40) })), createPayment);
// Verifies a Khalti payment by pidx (lookup API) after the redirect back.
router.post('/verify', validate(z.object({ paymentId: z.string().max(60), pidx: z.string().max(80) })), verifyPayment);
router.get('/:id', getPayment);

module.exports = router;
