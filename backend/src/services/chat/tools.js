const crypto = require('crypto');
const Pickup = require('../../models/Pickup');
const Faq = require('../../models/Faq');
const { fetchRates, estimateItems, listServiceCities, escapeRegex } = require('../rateService');
const { ownershipFilter } = require('../pickupService');
const { getAvailability, assertSlotAvailable } = require('../slotService');
const { DEFAULT_CITY, RESCHEDULABLE_STATUSES } = require('../../config/constants');
const { resolveItemByName } = require('./catalog');
const { escalateSession } = require('./tickets');

// Tool definitions sent to Claude. Keep this list deterministic (stable order and
// text) so the tools+system prefix stays prompt-cacheable.
const TOOL_DEFINITIONS = [
  {
    name: 'get_scrap_rates',
    description:
      'Look up current indicative scrap buying rates (min-max per unit) from the ScrapMate price list. Always use this before quoting any price. Rates are city-specific.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name, e.g. "Kathmandu". Omit to use the user\'s city or the default city.' },
        search: { type: 'string', description: 'Optional item name filter, e.g. "copper".' },
        category: { type: 'string', description: 'Optional category name, e.g. "E-Waste".' },
      },
    },
  },
  {
    name: 'estimate_value',
    description:
      'Estimate the payout range for a list of items and quantities in a city, using the same calculation as the booking wizard. Quantities are in each item\'s unit (kg or pieces).',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item: { type: 'string', description: 'Item name, e.g. "Newspaper" or "Refrigerator".' },
              quantity: { type: 'number', description: 'Quantity in the item\'s unit.' },
            },
            required: ['item', 'quantity'],
          },
        },
        city: { type: 'string' },
      },
      required: ['items'],
    },
  },
  {
    name: 'get_my_pickups',
    description: "List the logged-in user's recent pickups with their status. Requires login.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'track_pickup',
    description: 'Get the live status of one of the logged-in user\'s pickups by pickup ID (format SM-YYYY-NNNNNN). Requires login.',
    input_schema: {
      type: 'object',
      properties: { pickup_id: { type: 'string' } },
      required: ['pickup_id'],
    },
  },
  {
    name: 'get_service_areas',
    description: 'List the cities where ScrapMate currently offers doorstep pickup.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_time_slots',
    description: 'List the pickup time slots available on a date (YYYY-MM-DD).',
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['date'],
    },
  },
  {
    name: 'cancel_pickup',
    description:
      'Propose cancelling one of the logged-in user\'s pickups. This does NOT cancel immediately: it shows the user a confirmation button, and the pickup is only cancelled if they press it. Only call after the user clearly asked to cancel that specific pickup.',
    input_schema: {
      type: 'object',
      properties: {
        pickup_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['pickup_id'],
    },
  },
  {
    name: 'reschedule_pickup',
    description:
      'Propose moving one of the logged-in user\'s pickups to a new date and slot. This does NOT reschedule immediately: it shows the user a confirmation button. Check get_time_slots first for a valid slot string.',
    input_schema: {
      type: 'object',
      properties: {
        pickup_id: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        slot: { type: 'string', description: 'Exact slot string from get_time_slots.' },
      },
      required: ['pickup_id', 'date', 'slot'],
    },
  },
  {
    name: 'create_support_ticket',
    description:
      'Hand the conversation to the human support team. Creates a support ticket and shows the user a WhatsApp button. Use when you cannot resolve the issue, the user asks for a person, or the issue involves a dispute, damage, missing payment, or a complaint about a collector.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One or two sentences describing the issue for the support agent.' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'get_faq',
    description: 'Search ScrapMate\'s official FAQ (payments, pickups, pricing, accounts, policies).',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'Topic or question keywords, e.g. "payment methods".' } },
      required: ['topic'],
    },
  },
].map((tool) => ({ ...tool, eager_input_streaming: true }));

const LOGIN_REQUIRED = {
  error: 'login_required',
  message: 'The user is not logged in. Ask them to log in to see or change their pickups.',
};

const ACTION_TTL_MS = 10 * 60 * 1000;

function str(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function pickupSummary(p) {
  return {
    pickupId: p.pickupId,
    status: p.status,
    scheduledDate: p.scheduledDate ? new Date(p.scheduledDate).toISOString().split('T')[0] : null,
    timeSlot: p.timeSlot,
    items: (p.items || []).map((i) => ({
      name: i.itemName,
      estimatedQuantity: i.estimatedQuantity,
      actualWeight: i.actualWeight ?? null,
    })),
    estimatedValueMin: p.estimatedValueMin,
    estimatedValueMax: p.estimatedValueMax,
    finalAmount: p.finalAmount ?? null,
    collectorName: p.collector?.name || null,
    city: p.addressSnapshot?.city || null,
  };
}

function trackingCard(p) {
  return { type: 'tracking', pickup: pickupSummary(p) };
}

async function proposeAction(ctx, type, pickupId, params, summary) {
  const actionId = crypto.randomUUID();
  ctx.session.pendingActions = ctx.session.pendingActions.filter((a) => a.status === 'pending' && a.expiresAt > new Date());
  ctx.session.pendingActions.push({
    actionId,
    type,
    pickupId,
    params,
    summary,
    expiresAt: new Date(Date.now() + ACTION_TTL_MS),
  });
  await ctx.session.save();
  ctx.cards.push({ type: 'confirm', actionId, action: type, pickupId, summary, state: 'pending' });
  return {
    status: 'awaiting_user_confirmation',
    message:
      'A confirmation button is now shown to the user. Nothing has changed yet. Tell the user to press Confirm if they want to go ahead.',
  };
}

const EXECUTORS = {
  async get_scrap_rates(input, ctx) {
    const city = str(input.city, 60) || ctx.defaultCity;
    const rates = await fetchRates({ city, search: str(input.search, 60), category: str(input.category, 60) });
    if (!rates.length) {
      const cities = await listServiceCities();
      return { city, rates: [], note: `No rates found for that filter in ${city}.`, serviceCities: cities };
    }
    const top = rates.slice(0, 12).map((r) => ({
      itemId: String(r.itemId),
      name: r.name,
      unit: r.unit,
      category: r.category?.name,
      minPrice: r.minPrice,
      maxPrice: r.maxPrice,
    }));
    ctx.cards.push({ type: 'rates', city, rates: top.slice(0, 8), more: Math.max(0, rates.length - 8) });
    return {
      city,
      currency: 'NPR',
      rates: top,
      totalMatches: rates.length,
      note: 'Indicative rates per unit. Final amount depends on actual weight and condition at pickup.',
    };
  },

  async estimate_value(input, ctx) {
    const city = str(input.city, 60) || ctx.defaultCity;
    const requested = Array.isArray(input.items) ? input.items.slice(0, 15) : [];
    if (!requested.length) return { error: 'no_items', message: 'Provide at least one item with a quantity.' };
    const unknown = [];
    const entries = [];
    for (const r of requested) {
      const item = await resolveItemByName(str(r?.item, 80));
      const qty = Number(r?.quantity);
      if (!item) unknown.push(str(r?.item, 80));
      else if (Number.isFinite(qty) && qty > 0 && qty <= 100000) entries.push({ itemId: item._id, estimatedQuantity: qty });
    }
    const est = await estimateItems(entries, city);
    const lines = est.lines.map((l) => ({
      itemId: String(l.item._id),
      name: l.item.name,
      unit: l.item.unit,
      quantity: l.quantity,
      min: l.min,
      max: l.max,
      priced: l.priced,
    }));
    if (lines.length) {
      ctx.cards.push({ type: 'estimate', city, items: lines, min: est.min, max: est.max });
    }
    return {
      city,
      currency: 'NPR',
      lines,
      totalMin: est.min,
      totalMax: est.max,
      unknownItems: unknown,
      note: 'Estimate only. The final amount is calculated from the actual weight at pickup. A "Book this pickup" button has been shown to the user.',
    };
  },

  async get_my_pickups(input, ctx) {
    if (!ctx.user) {
      ctx.cards.push({ type: 'login' });
      return LOGIN_REQUIRED;
    }
    const pickups = await Pickup.find(ownershipFilter(ctx.user))
      .populate('collector', 'name')
      .sort({ createdAt: -1 })
      .limit(5);
    if (pickups.length) ctx.cards.push({ type: 'pickups', pickups: pickups.map(pickupSummary) });
    return { pickups: pickups.map(pickupSummary) };
  },

  async track_pickup(input, ctx) {
    if (!ctx.user) {
      ctx.cards.push({ type: 'login' });
      return LOGIN_REQUIRED;
    }
    const pickupId = str(input.pickup_id, 40).toUpperCase();
    const pickup = await Pickup.findOne({ pickupId, ...ownershipFilter(ctx.user) }).populate('collector', 'name');
    // Same answer for "doesn't exist" and "not yours" so IDs can't be probed.
    if (!pickup) return { error: 'not_found', message: `No pickup ${pickupId} found on this account.` };
    ctx.cards.push(trackingCard(pickup));
    return { pickup: pickupSummary(pickup) };
  },

  async get_service_areas() {
    const cities = await listServiceCities();
    return { cities, note: 'Pickups are available in these cities. PIN-code level checks happen at booking.' };
  },

  async get_time_slots(input) {
    const date = str(input.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'bad_date', message: 'Use YYYY-MM-DD.' };
    const avail = await getAvailability(date);
    if (!avail.slots.length) return { date, slots: [], message: avail.reason };
    return { date, slots: avail.slots.filter((s) => s.available).map((s) => s.label), closed: avail.slots.filter((s) => !s.available).map((s) => `${s.label}: ${s.reason}`) };
  },

  async cancel_pickup(input, ctx) {
    if (!ctx.user) {
      ctx.cards.push({ type: 'login' });
      return LOGIN_REQUIRED;
    }
    if (ctx.user.role !== 'customer') return { error: 'forbidden', message: 'Only customers can cancel their pickups here.' };
    const pickupId = str(input.pickup_id, 40).toUpperCase();
    const pickup = await Pickup.findOne({ pickupId, customer: ctx.user._id });
    if (!pickup) return { error: 'not_found', message: `No pickup ${pickupId} found on this account.` };
    if (['COMPLETED', 'CANCELLED'].includes(pickup.status)) {
      return { error: 'not_allowed', message: `Pickup is already ${pickup.status}.` };
    }
    const reason = str(input.reason, 200);
    return proposeAction(ctx, 'cancel_pickup', pickupId, { reason }, `Cancel pickup ${pickupId}`);
  },

  async reschedule_pickup(input, ctx) {
    if (!ctx.user) {
      ctx.cards.push({ type: 'login' });
      return LOGIN_REQUIRED;
    }
    if (ctx.user.role !== 'customer') return { error: 'forbidden', message: 'Only customers can reschedule their pickups here.' };
    const pickupId = str(input.pickup_id, 40).toUpperCase();
    const date = str(input.date, 10);
    const slot = str(input.slot, 40);
    const pickup = await Pickup.findOne({ pickupId, customer: ctx.user._id });
    if (!pickup) return { error: 'not_found', message: `No pickup ${pickupId} found on this account.` };
    if (!RESCHEDULABLE_STATUSES.includes(pickup.status)) {
      return { error: 'not_allowed', message: `Pickups that are ${pickup.status} can no longer be rescheduled.` };
    }
    const invalid = await assertSlotAvailable(date, slot, { pinCode: pickup.pinCode, excludePickupId: pickupId });
    if (invalid) {
      const avail = await getAvailability(date, { pinCode: pickup.pinCode });
      return { error: 'invalid_slot', message: invalid, validSlots: avail.slots.filter((s) => s.available).map((s) => s.label) };
    }
    return proposeAction(ctx, 'reschedule_pickup', pickupId, { date, slot }, `Move pickup ${pickupId} to ${date}, ${slot}`);
  },

  async create_support_ticket(input, ctx) {
    const summary = str(input.summary, 1000) || 'Customer asked for help via chat.';
    const ticket = await escalateSession(ctx.session, { summary, reason: 'assistant_handoff', pickupId: ctx.pagePickupId });
    ctx.escalated = true;
    ctx.cards.push({ type: 'handoff', ticketId: ticket.ticketId, summary: ticket.summary });
    return {
      ticketId: ticket.ticketId,
      message: 'Ticket created. A "Chat on WhatsApp" button is shown to the user; the team will follow up.',
    };
  },

  async get_faq(input) {
    const topic = str(input.topic, 120);
    if (!topic) return { faqs: [] };
    let faqs = await Faq.find({ isActive: true, $text: { $search: topic } }, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(3)
      .lean()
      .catch(() => []);
    if (!faqs.length) {
      const re = new RegExp(escapeRegex(topic.split(/\s+/)[0]), 'i');
      faqs = await Faq.find({ isActive: true, $or: [{ topic: re }, { question: re }, { keywords: re }] })
        .limit(3)
        .lean();
    }
    return { faqs: faqs.map((f) => ({ question: f.question, answer: f.answer, topic: f.topic })) };
  },
};

// ctx: { user, session, cards[], defaultCity, pagePickupId, escalated }
async function runTool(name, input, ctx) {
  const exec = EXECUTORS[name];
  if (!exec) return { isError: true, result: { error: 'unknown_tool' } };
  try {
    const result = await exec(input && typeof input === 'object' ? input : {}, ctx);
    return { isError: Boolean(result?.error), result };
  } catch (err) {
    console.error(`[chat] tool ${name} failed:`, err.message);
    return { isError: true, result: { error: 'tool_failed', message: 'This lookup failed. Apologise and offer human help.' } };
  }
}

function defaultCityFor(user, defaultAddress) {
  return defaultAddress?.city || user?.collectorProfile?.city || DEFAULT_CITY;
}

module.exports = { TOOL_DEFINITIONS, runTool, pickupSummary, trackingCard, defaultCityFor, EXECUTORS };
