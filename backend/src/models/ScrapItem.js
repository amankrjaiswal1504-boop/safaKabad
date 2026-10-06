const mongoose = require('mongoose');

const scrapItemSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ScrapCategory', required: true, index: true },
    name: { type: String, required: true, trim: true },
    nameNe: { type: String, default: '' },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    unit: { type: String, enum: ['kg', 'piece', 'unit'], default: 'kg' },
    // kg of CO2 avoided per unit recycled; drives the eco-impact dashboard
    co2PerUnit: { type: Number, default: 1 },
    // Approximate kg per piece, so pieces count toward "kg recycled"
    kgPerUnit: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

scrapItemSchema.index({ category: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ScrapItem', scrapItemSchema);
