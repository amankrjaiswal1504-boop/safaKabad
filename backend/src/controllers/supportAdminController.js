const mongoose = require('mongoose');
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const SupportTicket = require('../models/SupportTicket');
const Faq = require('../models/Faq');
const { CallRequest } = require('../models/platform');

function paging(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// ---------- conversations ----------

async function listConversations(req, res, next) {
  try {
    const { page, limit, skip } = paging(req);
    const filter = {};
    if (req.query.filter === 'escalated') filter.escalated = true;
    if (req.query.filter === 'unresolved') {
      filter.escalated = true;
      filter.resolved = false;
    }
    const [sessions, total] = await Promise.all([
      ChatSession.find(filter)
        .populate('user', 'name email phone role')
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ChatSession.countDocuments(filter),
    ]);
    const tickets = await SupportTicket.find({ session: { $in: sessions.map((s) => s._id) } })
      .select('ticketId status session')
      .lean();
    const ticketBySession = new Map(tickets.map((t) => [String(t.session), t]));
    res.json({
      success: true,
      data: {
        conversations: sessions.map((s) => ({
          ...s,
          pendingActions: undefined,
          ticket: ticketBySession.get(String(s._id)) || null,
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getConversation(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }
    const session = await ChatSession.findById(req.params.id).populate('user', 'name email phone role').lean();
    if (!session) return res.status(404).json({ success: false, message: 'Conversation not found' });
    const [messages, tickets] = await Promise.all([
      ChatMessage.find({ session: session._id }).sort({ createdAt: 1 }).lean(),
      SupportTicket.find({ session: session._id }).sort({ createdAt: -1 }).lean(),
    ]);
    res.json({ success: true, data: { conversation: session, messages, tickets } });
  } catch (err) {
    next(err);
  }
}

async function resolveConversation(req, res, next) {
  try {
    const session = mongoose.isValidObjectId(req.params.id) ? await ChatSession.findById(req.params.id) : null;
    if (!session) return res.status(404).json({ success: false, message: 'Conversation not found' });
    session.resolved = true;
    await session.save();
    await SupportTicket.updateMany(
      { session: session._id, status: { $ne: 'resolved' } },
      { status: 'resolved', resolvedBy: req.user._id, resolvedAt: new Date() }
    );
    res.json({ success: true, data: { conversation: session } });
  } catch (err) {
    next(err);
  }
}

// ---------- tickets ----------

async function listTickets(req, res, next) {
  try {
    const { page, limit, skip } = paging(req);
    const filter = {};
    if (['open', 'in_progress', 'resolved'].includes(req.query.status)) filter.status = req.query.status;
    if (req.query.status === 'unresolved') filter.status = { $ne: 'resolved' };
    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate('user', 'name email phone')
        .populate('resolvedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);
    res.json({ success: true, data: { tickets, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (err) {
    next(err);
  }
}

async function updateTicket(req, res, next) {
  try {
    const ticket = await SupportTicket.findOne({ ticketId: req.params.ticketId });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const { status, adminNote } = req.body;
    if (status) {
      if (!['open', 'in_progress', 'resolved'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      ticket.status = status;
      if (status === 'resolved') {
        ticket.resolvedBy = req.user._id;
        ticket.resolvedAt = new Date();
      }
    }
    if (typeof adminNote === 'string') ticket.adminNote = adminNote.slice(0, 2000);
    await ticket.save();
    // Resolving the last open ticket also resolves the conversation.
    if (ticket.session && ticket.status === 'resolved') {
      const stillOpen = await SupportTicket.exists({ session: ticket.session, status: { $ne: 'resolved' } });
      if (!stillOpen) await ChatSession.updateOne({ _id: ticket.session }, { resolved: true });
    }
    res.json({ success: true, data: { ticket } });
  } catch (err) {
    next(err);
  }
}

// ---------- analytics ----------

async function chatAnalytics(req, res, next) {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [sessions, escalated, unresolved, openTickets, byMode, topics, questions] = await Promise.all([
      ChatSession.countDocuments({ createdAt: { $gte: since } }),
      ChatSession.countDocuments({ createdAt: { $gte: since }, escalated: true }),
      ChatSession.countDocuments({ escalated: true, resolved: false }),
      SupportTicket.countDocuments({ status: { $ne: 'resolved' } }),
      ChatMessage.aggregate([
        { $match: { role: 'assistant', createdAt: { $gte: since } } },
        { $group: { _id: '$mode', count: { $sum: 1 }, failed: { $sum: { $cond: ['$failed', 1, 0] } } } },
      ]),
      ChatMessage.aggregate([
        { $match: { role: 'user', createdAt: { $gte: since } } },
        { $group: { _id: '$topic', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ChatMessage.aggregate([
        { $match: { role: 'user', createdAt: { $gte: since } } },
        { $project: { q: { $toLower: { $trim: { input: '$content' } } } } },
        { $group: { _id: '$q', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);
    const answered = byMode.reduce((a, m) => a + m.count, 0);
    const failed = byMode.reduce((a, m) => a + m.failed, 0);
    res.json({
      success: true,
      data: {
        days,
        sessions,
        escalated,
        escalationRate: sessions ? escalated / sessions : 0,
        unresolvedConversations: unresolved,
        openTickets,
        replies: Object.fromEntries(byMode.map((m) => [m._id, m.count])),
        unansweredRate: answered ? failed / answered : 0,
        topics: topics.map((t) => ({ topic: t._id || 'other', count: t.count })),
        commonQuestions: questions.map((q) => ({ question: q._id, count: q.count })),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------- FAQs (used by the assistant's get_faq tool) ----------

const FAQ_FIELDS = ['question', 'answer', 'topic', 'keywords', 'language', 'order', 'isActive'];

function pickFaq(body) {
  const out = {};
  for (const f of FAQ_FIELDS) if (body[f] !== undefined) out[f] = body[f];
  if (typeof out.keywords === 'string') out.keywords = out.keywords.split(',').map((k) => k.trim()).filter(Boolean);
  return out;
}

async function listFaqs(req, res, next) {
  try {
    const faqs = await Faq.find({}).sort({ topic: 1, order: 1, createdAt: 1 });
    res.json({ success: true, data: { faqs } });
  } catch (err) {
    next(err);
  }
}

async function createFaq(req, res, next) {
  try {
    const faq = await Faq.create(pickFaq(req.body));
    res.status(201).json({ success: true, data: { faq } });
  } catch (err) {
    next(err);
  }
}

async function updateFaq(req, res, next) {
  try {
    const faq = mongoose.isValidObjectId(req.params.id)
      ? await Faq.findByIdAndUpdate(req.params.id, pickFaq(req.body), { new: true, runValidators: true })
      : null;
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
    res.json({ success: true, data: { faq } });
  } catch (err) {
    next(err);
  }
}

async function deleteFaq(req, res, next) {
  try {
    const faq = mongoose.isValidObjectId(req.params.id) ? await Faq.findByIdAndDelete(req.params.id) : null;
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
    res.json({ success: true, message: 'FAQ deleted' });
  } catch (err) {
    next(err);
  }
}

// ---------- call requests ----------

async function listCallRequests(req, res, next) {
  try {
    const { page, limit, skip } = paging(req);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const [calls, total] = await Promise.all([
      CallRequest.find(filter)
        .populate('user', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CallRequest.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: {
        calls,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    next(err);
  }
}

async function updateCallRequest(req, res, next) {
  try {
    const { status, adminNote } = req.body || {};
    const update = {};
    if (status) update.status = status;
    if (adminNote !== undefined) update.adminNote = adminNote;
    if (status === 'resolved' || status === 'called') {
      update.resolvedBy = req.user._id;
      update.resolvedAt = new Date();
    }
    const call = await CallRequest.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!call) return res.status(404).json({ success: false, message: 'Call request not found' });
    res.json({ success: true, data: call });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listConversations,
  getConversation,
  resolveConversation,
  listTickets,
  updateTicket,
  chatAnalytics,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  listCallRequests,
  updateCallRequest,
};
