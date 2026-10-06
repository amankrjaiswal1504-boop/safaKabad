const mongoose = require('mongoose');

// A pending account action (cancel / reschedule) proposed in chat. It only runs
// when the user presses the confirm button, never on the model's say-so.
const pendingActionSchema = new mongoose.Schema(
  {
    actionId: { type: String, required: true },
    type: { type: String, enum: ['cancel_pickup', 'reschedule_pickup'], required: true },
    pickupId: { type: String, required: true },
    params: { type: Object, default: {} },
    summary: { type: String, required: true },
    status: { type: String, enum: ['pending', 'confirmed', 'dismissed', 'failed', 'expired'], default: 'pending' },
    expiresAt: { type: Date, required: true },
  },
  { _id: false, timestamps: true }
);

const chatSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    anonId: { type: String, default: null, index: true },
    archived: { type: Boolean, default: false, index: true },
    escalated: { type: Boolean, default: false, index: true },
    resolved: { type: Boolean, default: false, index: true },
    consecutiveFailures: { type: Number, default: 0 },
    language: { type: String, enum: ['en', 'ne'], default: 'en' },
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastUserMessage: { type: String, default: '' },
    pendingActions: { type: [pendingActionSchema], default: [] },
  },
  { timestamps: true }
);

chatSessionSchema.index({ user: 1, archived: 1, updatedAt: -1 });
chatSessionSchema.index({ anonId: 1, archived: 1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
