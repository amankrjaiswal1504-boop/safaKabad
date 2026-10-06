const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    topic: { type: String, required: true, trim: true, lowercase: true, index: true },
    keywords: { type: [String], default: [] },
    language: { type: String, enum: ['en', 'ne'], default: 'en' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

faqSchema.index({ question: 'text', answer: 'text', keywords: 'text' });

module.exports = mongoose.model('Faq', faqSchema);
