const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatSession', required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, default: '' },
    // Rich UI cards (rates, estimate, tracking, confirm, handoff, ...) rendered by the widget.
    cards: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // Coarse topic for admin analytics (rates, booking, tracking, payment, ...).
    topic: { type: String, default: null, index: true },
    language: { type: String, enum: ['en', 'ne'], default: 'en' },
    mode: { type: String, enum: ['ai', 'fallback', 'system'], default: 'system' },
    escalated: { type: Boolean, default: false },
    failed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

chatMessageSchema.index({ session: 1, createdAt: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
