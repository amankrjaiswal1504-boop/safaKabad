const mongoose = require('mongoose');

// Nepali address: the customer picks a service area (municipality) and ward;
// city, district, province and postal code are filled from that area.
const addressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    area: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceArea', index: true },
    ward: { type: Number, min: 1, max: 40 },
    houseNumber: { type: String, default: '' }, // house / building / flat (optional in Nepal)
    street: { type: String, required: true }, // tole / street
    locality: { type: String, required: true }, // "Kirtipur-5" (municipality-ward)
    municipality: { type: String, default: '' },
    district: { type: String, default: '' },
    city: { type: String, required: true }, // price-list city
    state: { type: String, required: true }, // province
    pinCode: { type: String, required: true },
    landmark: { type: String },
    location: { lat: Number, lng: Number },
    addressType: { type: String, enum: ['home', 'work', 'other'], default: 'home' },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Address', addressSchema);
