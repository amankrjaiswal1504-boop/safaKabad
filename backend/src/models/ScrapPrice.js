const mongoose = require('mongoose');

const scrapPriceSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'ScrapItem', required: true, index: true },
    city: { type: String, required: true, trim: true, index: true },
    minPrice: { type: Number, required: true, min: 0 },
    maxPrice: { type: Number, required: true, min: 0 },
    // What SafaKabad sells to recyclers for; used for margin analytics (admin only).
    recyclerPrice: { type: Number, min: 0, default: null },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

scrapPriceSchema.index({ item: 1, city: 1 }, { unique: true });

module.exports = mongoose.model('ScrapPrice', scrapPriceSchema);
