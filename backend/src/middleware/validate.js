const { z } = require('zod');
const { MOBILE_RE, POSTAL_CODE_RE, PAN_VAT_RE, cleanPhone } = require('../config/locale');

// Lightweight field-presence validator (kept for older routes).
// Usage: validateBody(['name','email','password'])
function validateBody(requiredFields) {
  return (req, res, next) => {
    const missing = requiredFields.filter((f) => {
      const val = req.body?.[f];
      return val === undefined || val === null || val === '';
    });
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s): ${missing.join(', ')}`,
      });
    }
    next();
  };
}

// Zod validation: replaces req[part] with the parsed (coerced, stripped) value.
function validate(schema, part = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join('.');
      return res.status(400).json({
        success: false,
        message: field ? `${field}: ${issue.message}` : issue.message,
        errors: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    if (part === 'query') {
      // req.query is a getter in some Express setups; copy values over instead.
      Object.keys(req.query).forEach((k) => delete req.query[k]);
      Object.assign(req.query, result.data);
    } else {
      req[part] = result.data;
    }
    next();
  };
}

// Nepali mobile number (98XXXXXXXX / 97XXXXXXXX / 96XXXXXXXX), +977 optional.
const phone = z
  .string()
  .trim()
  .transform(cleanPhone)
  .refine((v) => MOBILE_RE.test(v), 'Enter a valid 10-digit Nepali mobile number (98XXXXXXXX)');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
// Nepal postal codes are 5 digits (e.g. 44600 Kathmandu). Field names stay
// pinCode/pinCodes in the API for backwards compatibility.
const pinCode = z.string().trim().regex(POSTAL_CODE_RE, 'Postal code must be 5 digits');
const panVat = z.union([z.string().trim().regex(PAN_VAT_RE, 'PAN/VAT number must be 9 digits'), z.literal('')]);
// Nepali bank account for payouts/withdrawals (no IFSC in Nepal: bank + branch).
const bankAccount = z.object({
  accountNumber: z.string().trim().regex(/^\d{8,20}$/, 'Account number should be 8-20 digits'),
  bankName: z.string().trim().min(2, 'Enter the bank name').max(80),
  branch: z.string().trim().max(80).optional(),
  holderName: z.string().trim().min(2, 'Enter the account holder name').max(80),
});
const payoutMethod = z.enum(['cash', 'esewa', 'khalti', 'bank_transfer', 'wallet']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

module.exports = { validateBody, validate, z, phone, objectId, pinCode, panVat, bankAccount, payoutMethod, isoDate, password };
