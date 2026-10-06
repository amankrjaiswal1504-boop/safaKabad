const mongoose = require('mongoose');

const scrapCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    nameNe: { type: String, default: '' },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' }, // icon key used by the frontend (e.g. "paper", "ewaste")
    image: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    // Items in this category ask about condition (working / not working / damaged)
    conditionGrading: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ScrapCategory', scrapCategorySchema);
