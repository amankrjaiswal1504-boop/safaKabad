const crypto = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const SupportTicket = require('../models/SupportTicket');
const Address = require('../models/Address');
const { runClaudeTurn, isAiEnabled } = require('../services/chat/claudeAgent');
const fallbackBot = require('../services/chat/fallbackBot');
const { defaultCityFor, trackingCard } = require('../services/chat/tools');
const { detectLanguage, detectEscalation, classifyTopic, extractPickupId } = require('../services/chat/classifier');
const { escalateSession } = require('../services/chat/tickets');
const { cleanString } = require('../services/chat/sanitize');
const { cancelCustomerPickup, rescheduleCustomerPickup, PickupActionError } = require('../services/pickupService');
const settings = require('../services/settingsService');
const { todayLocal } = require('../config/locale');

const CHAT_COOKIE = 'scrapmate_chat';
const MAX_MESSAGE_LENGTH = 1000;
const HISTORY_FOR_MODEL = 16;
const HISTORY_MESSAGE_CHARS = 1500;
const FAILURES_BEFORE_HANDOFF = 2;
const CARD_TOPIC = {
  rates: 'rates',
  estimate: 'rates',
  tracking: 'tracking',
  pickups: 'tracking',
  confirm: 'cancel_reschedule',
  handoff: 'support',
  login: 'account',
};

// ---------- helpers ----------

function setChatCookie(res, value) {
  // Session cookie (no maxAge): anonymous chats last for the browser session.
  res.cookie(CHAT_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

async function resolveSession(req, res, { create }) {
  const anonId = req.cookies?.[CHAT_COOKIE];
  if (req.user) {
    let session = await ChatSession.findOne({ user: req.user._id, archived: false }).sort({ updatedAt: -1 });
    if (!session && anonId) {
      // Logged in mid-conversation: carry the anonymous chat over to the account.
      session = await ChatSession.findOne({ anonId, user: null, archived: false });
      if (session) {
        session.user = req.user._id;
        await session.save();
      }
    }
    if (!session && create) session = await ChatSession.create({ user: req.user._id });
    return session;
  }
  if (anonId) {
    const session = await ChatSession.findOne({ anonId, user: null, archived: false });
    if (session) return session;
  }
  if (!create) return null;
  const newId = crypto.randomUUID();
  setChatCookie(res, newId);
  return ChatSession.create({ anonId: newId });
}

function serialize(msg) {
  return {
    id: String(msg._id),
    role: msg.role,
    content: msg.content,
    cards: msg.cards || [],
    mode: msg.mode,
    createdAt: msg.createdAt,
  };
}

function describeCards(cards) {
  return (cards || [])
    .map((c) => {
      if (c.type === 'tracking') return `[Showed tracking card for ${c.pickup?.pickupId}: ${c.pickup?.status}]`;
      if (c.type === 'estimate') return `[Showed estimate रु ${c.min}-रु ${c.max} in ${c.city}]`;
      if (c.type === 'rates') return `[Showed ${c.rates?.length || 0} rates for ${c.city}]`;
      if (c.type === 'confirm') return `[Showed confirm button: ${c.summary} (${c.state})]`;
      if (c.type === 'handoff') return `[Created support ticket ${c.ticketId}]`;
      return '';
    })
    .filter(Boolean)
    .join(' ');
}

// Last N messages as Claude message params: text only, alternating roles, starting with user.
function toModelHistory(messages) {
  const out = [];
  for (const m of messages) {
    let text = (m.content || '').slice(0, HISTORY_MESSAGE_CHARS);
    if (m.role === 'assistant') text = [text, describeCards(m.cards)].filter(Boolean).join('\n');
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${text}`;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

function safePage(page) {
  return typeof page === 'string' && /^\/[\w\-/]{0,100}$/.test(page) ? page : null;
}

function contextNote({ user, defaultCity, page, pagePickupId, lang }) {
  const today = todayLocal();
  const who = user
    ? `logged in as a ${user.role}, first name "${cleanString(user.name.split(' ')[0]).slice(0, 40)}"`
    : 'not logged in (anonymous visitor)';
  return [
    'Request context from the SafaKabad server (not written by the user):',
    `- Today: ${today} (Nepal time)`,
    `- User: ${who}`,
    `- Default city for rates: ${defaultCity}`,
    page ? `- Current page: ${page}${pagePickupId ? ` (pickup ${pagePickupId})` : ''}` : null,
    `- Detected language of latest message: ${lang === 'ne' ? 'Nepali' : 'English'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

const HANDOFF_TEXT = {
  en: (id) =>
    `I'm sorry for the trouble. I've passed this to our support team (ticket **${id}**) and they'll get back to you. For a faster reply, continue on WhatsApp:`,
  ne: (id) =>
    `असुविधाको लागि माफ गर्नुहोस्। मैले तपाईंको कुरा हाम्रो सहायता टोलीलाई पठाएको छु (टिकट **${id}**), उहाँहरूले चाँडै सम्पर्क गर्नुहुनेछ। छिटो जवाफका लागि WhatsApp मा कुरा गर्नुहोस्:`,
};

async function buildTicketSummary(session, latestText) {
  const recent = await ChatMessage.find({ session: session._id, role: 'user' }).sort({ createdAt: -1 }).limit(4).lean();
  const lines = [latestText, ...recent.map((m) => m.content)].filter(Boolean);
  const unique = [...new Set(lines)].slice(0, 4).reverse();
  return `Customer said: ${unique.map((l) => `"${l.slice(0, 200)}"`).join(' / ')}`;
}

// ---------- public config ----------

// Support hours and WhatsApp number are admin-editable (Settings > support).
async function supportStatus() {
  const cfg = await settings.get('support');
  const start = Number(cfg.hoursStart);
  const end = Number(cfg.hoursEnd);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: cfg.timezone }).format(new Date()));
  const fmt = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;
  return {
    online: hour >= start && hour < end,
    hoursLabel: `${fmt(start)} – ${fmt(end)}`,
    replyMinutes: Number(cfg.replyMinutes),
    whatsappNumber: String(cfg.whatsappNumber || '').replace(/\D/g, '') || null,
  };
}

async function getConfig(req, res, next) {
  try {
    const support = await supportStatus();
    const ai = await settings.get('ai');
    res.json({
      success: true,
      data: {
        aiMode: isAiEnabled() && ai.enabled !== false ? 'ai' : 'fallback',
        whatsappNumber: support.whatsappNumber,
        greeting: ai.greeting || '',
        support,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------- history ----------

async function getHistory(req, res, next) {
  try {
    const session = await resolveSession(req, res, { create: false });
    if (!session) return res.json({ success: true, data: { messages: [], escalated: false } });
    const messages = await ChatMessage.find({ session: session._id }).sort({ createdAt: -1 }).limit(50);
    res.json({
      success: true,
      data: { messages: messages.reverse().map(serialize), escalated: session.escalated && !session.resolved },
    });
  } catch (err) {
    next(err);
  }
}

async function clearHistory(req, res, next) {
  try {
    const session = await resolveSession(req, res, { create: false });
    if (session) {
      const hasTicket = await SupportTicket.exists({ session: session._id });
      if (session.escalated || hasTicket) {
        // Keep escalated conversations for the support team; hide them from the user.
        session.archived = true;
        await session.save();
      } else {
        await ChatMessage.deleteMany({ session: session._id });
        await session.deleteOne();
      }
    }
    res.json({ success: true, message: 'Chat cleared' });
  } catch (err) {
    next(err);
  }
}

// ---------- send message ----------

async function sendMessage(req, res, next) {
  const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!text) return res.status(400).json({ success: false, message: 'Message is required' });
  if (text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` });
  }

  const streaming = req.body.stream !== false;
  let clientGone = false;
  res.on('close', () => {
    if (!res.writableEnded) clientGone = true;
  });
  const send = (event) => {
    if (streaming && !clientGone) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const session = await resolveSession(req, res, { create: true });
    const lang = detectLanguage(text);
    const topic = classifyTopic(text);
    const page = safePage(req.body.page);
    const pagePickupId = extractPickupId(page || '') || extractPickupId(text);

    const userMsg = await ChatMessage.create({ session: session._id, role: 'user', content: text, topic, language: lang });
    session.language = lang;
    session.messageCount += 1;
    session.lastMessageAt = new Date();
    session.lastUserMessage = text.slice(0, 200);

    if (streaming) {
      res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
    }
    send({ type: 'start', userMessage: serialize(userMsg) });

    const defaultAddress = req.user
      ? await Address.findOne({ user: req.user._id, isDefault: true }).lean()
      : null;
    const toolCtx = {
      user: req.user || null,
      session,
      cards: [],
      defaultCity: await defaultCityFor(req.user, defaultAddress),
      pagePickupId,
      escalated: false,
    };

    let replyText = '';
    let mode = 'fallback';
    let failed = false;
    const escalation = detectEscalation(text);

    if (escalation) {
      // Explicit request for a person, or an upset customer: hand off right away.
      const ticket = await escalateSession(session, {
        summary: await buildTicketSummary(session, text),
        reason: escalation,
        pickupId: pagePickupId,
      });
      replyText = HANDOFF_TEXT[lang](ticket.ticketId);
      toolCtx.cards.push({ type: 'handoff', ticketId: ticket.ticketId, summary: ticket.summary });
      toolCtx.escalated = true;
      mode = 'system';
      send({ type: 'delta', text: replyText });
      toolCtx.cards.forEach((card) => send({ type: 'card', card }));
    } else {
      let aiWorked = false;
      if (isAiEnabled() && (await settings.get('ai')).enabled !== false) {
        try {
          const history = await ChatMessage.find({ session: session._id }).sort({ createdAt: -1 }).limit(HISTORY_FOR_MODEL);
          const result = await runClaudeTurn({
            history: toModelHistory(history.reverse()),
            contextNote: contextNote({ user: req.user, defaultCity: toolCtx.defaultCity, page, pagePickupId, lang }),
            toolCtx,
            onText: (delta) => {
              replyText += delta;
              send({ type: 'delta', text: delta });
            },
            onCard: (card) => send({ type: 'card', card }),
            isAborted: () => clientGone,
          });
          replyText = result.text;
          mode = 'ai';
          // A refusal (rare on this topic) is answered by the rule-based bot instead.
          aiWorked = Boolean(result.text || toolCtx.cards.length) && !result.refused;
        } catch (err) {
          const detail = err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err.message;
          console.error('[chat] AI request failed, using fallback bot:', detail);
          // If text already streamed, keep it rather than mixing in a second answer.
          aiWorked = Boolean(replyText);
          if (aiWorked) mode = 'ai';
        }
      }

      if (!aiWorked && !failed) {
        // Discard anything a failed/refused AI turn already streamed.
        if (replyText || toolCtx.cards.length) send({ type: 'reset' });
        toolCtx.cards.length = 0;
        const bot = await fallbackBot.reply({ text, lang, ctx: toolCtx });
        mode = 'fallback';
        failed = bot.failed;
        replyText = bot.text;
        if (bot.text) send({ type: 'delta', text: bot.text });
        toolCtx.cards.forEach((card) => send({ type: 'card', card }));
      }

      // Two misses in a row: offer a human.
      session.consecutiveFailures = failed ? session.consecutiveFailures + 1 : 0;
      if (failed && session.consecutiveFailures >= FAILURES_BEFORE_HANDOFF && !toolCtx.escalated) {
        const ticket = await escalateSession(session, {
          summary: await buildTicketSummary(session, text),
          reason: 'bot_failed',
          pickupId: pagePickupId,
        });
        const extra = `\n\n${HANDOFF_TEXT[lang](ticket.ticketId)}`;
        replyText += extra;
        send({ type: 'delta', text: extra });
        const card = { type: 'handoff', ticketId: ticket.ticketId, summary: ticket.summary };
        toolCtx.cards.push(card);
        send({ type: 'card', card });
        toolCtx.escalated = true;
      }
    }

    if (toolCtx.escalated) userMsg.escalated = true;
    // Keyword topic missed it ("10 kg newspaper")? Use what was actually answered.
    if (userMsg.topic === 'other') {
      const card = toolCtx.cards.find((c) => CARD_TOPIC[c.type]);
      if (card) userMsg.topic = CARD_TOPIC[card.type];
    }
    await userMsg.save();
    await session.save();

    const assistantMsg = await ChatMessage.create({
      session: session._id,
      role: 'assistant',
      content: replyText,
      cards: toolCtx.cards,
      topic,
      language: lang,
      mode,
      escalated: toolCtx.escalated,
      failed,
    });

    if (streaming) {
      send({ type: 'done', message: serialize(assistantMsg), escalated: toolCtx.escalated });
      return res.end();
    }
    return res.json({
      success: true,
      data: { userMessage: serialize(userMsg), message: serialize(assistantMsg), escalated: toolCtx.escalated },
    });
  } catch (err) {
    if (streaming && res.headersSent) {
      console.error('[chat] stream failed:', err.message);
      send({ type: 'error', message: 'Something went wrong. Please try again.' });
      return res.end();
    }
    return next(err);
  }
}

// ---------- confirm / dismiss a proposed action ----------

const ACTION_TEXT = {
  en: {
    cancelled: (id) => `Done. Pickup **${id}** has been cancelled.`,
    rescheduled: (id, d, s) => `Done. Pickup **${id}** is now scheduled for **${d}, ${s}**.`,
    dismissed: "Okay, I haven't changed anything.",
    failed: (msg) => `I couldn't complete that: ${msg}`,
    expired: 'That confirmation has expired. Please ask again.',
  },
  ne: {
    cancelled: (id) => `भयो। पिकअप **${id}** रद्द गरिएको छ।`,
    rescheduled: (id, d, s) => `भयो। पिकअप **${id}** अब **${d}, ${s}** मा तय भएको छ।`,
    dismissed: 'ठीक छ, मैले केही परिवर्तन गरिनँ।',
    failed: (msg) => `यो पूरा गर्न सकिएन: ${msg}`,
    expired: 'यो पुष्टिको समय सकियो। कृपया फेरि सोध्नुहोस्।',
  },
};

async function resolveAction(req, res, next) {
  try {
    const { actionId } = req.params;
    const decision = req.body?.decision === 'confirm' ? 'confirm' : 'dismiss';
    // Ownership: the action must belong to a session owned by this user.
    const session = await ChatSession.findOne({ user: req.user._id, 'pendingActions.actionId': actionId });
    if (!session) return res.status(404).json({ success: false, message: 'Action not found' });
    const action = session.pendingActions.find((a) => a.actionId === actionId);
    if (action.status !== 'pending') {
      return res.status(409).json({ success: false, message: `This action was already ${action.status}` });
    }

    const t = ACTION_TEXT[session.language] || ACTION_TEXT.en;
    let content;
    const cards = [];
    if (action.expiresAt < new Date()) {
      action.status = 'expired';
      content = t.expired;
    } else if (decision === 'dismiss') {
      action.status = 'dismissed';
      content = t.dismissed;
    } else {
      try {
        let pickup;
        if (action.type === 'cancel_pickup') {
          pickup = await cancelCustomerPickup(req.user, action.pickupId, action.params?.reason || 'Cancelled via chat assistant');
          content = t.cancelled(action.pickupId);
        } else {
          pickup = await rescheduleCustomerPickup(req.user, action.pickupId, action.params.date, action.params.slot);
          content = t.rescheduled(action.pickupId, action.params.date, action.params.slot);
        }
        action.status = 'confirmed';
        cards.push(trackingCard(pickup));
      } catch (err) {
        if (!(err instanceof PickupActionError)) throw err;
        action.status = 'failed';
        content = t.failed(err.message);
      }
    }
    session.markModified('pendingActions');
    await session.save();

    // Reflect the outcome on the original confirm card.
    const original = await ChatMessage.findOne({ session: session._id, 'cards.actionId': actionId });
    if (original) {
      original.cards = original.cards.map((c) => (c.actionId === actionId ? { ...c, state: action.status } : c));
      original.markModified('cards');
      await original.save();
    }

    const message = await ChatMessage.create({
      session: session._id,
      role: 'assistant',
      content,
      cards,
      topic: 'cancel_reschedule',
      language: session.language,
      mode: 'system',
    });
    res.json({
      success: true,
      data: { message: serialize(message), updatedMessage: original ? serialize(original) : null },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getConfig, getHistory, clearHistory, sendMessage, resolveAction, toModelHistory };
