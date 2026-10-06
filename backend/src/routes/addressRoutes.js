const express = require('express');
const { listAddresses, createAddress, updateAddress, deleteAddress } = require('../controllers/addressController');
const { protect } = require('../middleware/auth');
const { validate, z, objectId } = require('../middleware/validate');

const router = express.Router();

// The customer picks a municipality (service area) and ward; city, district,
// province and postal code are filled in from the area on the server.
const address = z.object({
  areaId: objectId,
  ward: z.coerce.number().int().min(1, 'Choose your ward').max(40),
  street: z.string().trim().min(2, 'Tole / street is required').max(120),
  houseNumber: z.string().trim().max(60).optional(),
  landmark: z.string().trim().max(120).optional(),
  pinCode: z.string().trim().regex(/^\d{5}$/, 'Postal code must be 5 digits').optional(),
  addressType: z.enum(['home', 'work', 'other']).optional(),
  isDefault: z.boolean().optional(),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
});

router.use(protect);
router.get('/', listAddresses);
router.post('/', validate(address), createAddress);
router.put('/:id', validate(z.object({ id: objectId }), 'params'), validate(address.partial()), updateAddress);
router.delete('/:id', deleteAddress);

module.exports = router;
module.exports.addressSchema = address;
