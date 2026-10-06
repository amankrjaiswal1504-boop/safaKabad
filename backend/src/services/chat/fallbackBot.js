// Rule-based assistant used when ANTHROPIC_API_KEY is missing or the API fails.
// It answers the common questions from real DB data through the same tool
// executors the AI uses, so permissions behave identically in both modes.
const ScrapCategory = require('../../models/ScrapCategory');
const ScrapItem = require('../../models/ScrapItem');
const { runTool } = require('./tools');
const { classifyTopic, extractPickupId } = require('./classifier');
const { findItemsInText, pickCity } = require('./catalog');
const { money } = require('../../config/locale');

const T = {
  en: {
    greeting:
      "Namaste! I'm the ScrapMate Assistant. I can check scrap rates, estimate your payout, help you book or track a pickup, and answer payment questions. What would you like to do?",
    ratesFor: (city) => `Here are the current indicative rates in **${city}**. The final amount depends on actual weight at pickup.`,
    ratesNone: (city) => `I couldn't find rates for that in **${city}**. You can see the full list on the [rates page](/rates).`,
    ratesGeneric: (city) =>
      `Here are some current indicative rates in **${city}**. Tell me an item (e.g. "copper rate") or see the full list on the [rates page](/rates).`,
    estimate: (min, max) =>
      `Your estimated payout is **${money(min)} – ${money(max)}**. This is an estimate; the final amount is based on the actual weight at pickup.`,
    book:
      'Booking takes about a minute: pick your items, add quantities, choose an address and a time slot. Pickup is free.',
    loginNeeded: 'Please log in so I can look up your pickups.',
    noPickups: "You don't have any pickups yet. Would you like to book one?",
    latestPickup: 'Here is your most recent pickup:',
    latestFor: (id) => `Here's the latest on **${id}**:`,
    trackNotFound: (id) => `I couldn't find pickup ${id} on your account. Please check the ID.`,
    askPickupId: 'Which pickup? Here are your recent ones. Reply with the pickup ID (like SM-2026-000123).',
    confirmCancel: (id) => `Do you want to cancel pickup **${id}**? Press **Confirm** below to go ahead.`,
    confirmMove: 'Press **Confirm** below to move your pickup.',
    cannotChange: (msg) => `I can't do that: ${msg}`,
    reschedHelp: (id) =>
      `To reschedule **${id}**, tell me the new date and slot, for example: "reschedule ${id} to 2026-10-12 11:00 AM - 1:00 PM". Available slots:`,
    catalog: (cats) => `We pick up:\n${cats}\n\nAsk me for any item's rate, or book a pickup.`,
    areas: (cities) => `We currently pick up in: **${cities}**. More cities are coming soon.`,
    slots: (date, slots) => `Pickup slots for ${date}:\n${slots}`,
    faq: (q, a) => `**${q}**\n\n${a}`,
    payment:
      'You can be paid by **cash, eSewa, Khalti or bank transfer** right after the collector weighs your scrap. A digital receipt is created for every completed pickup.',
    bookLabel: 'Book a pickup',
    ratesLabel: 'See all rates',
    unknown:
      "Sorry, I didn't quite get that. I can help with scrap rates, estimates, booking, tracking a pickup, and payments. You can also talk to our team on WhatsApp.",
  },
  ne: {
    greeting:
      'नमस्ते! म ScrapMate सहायक हुँ। म कबाडीको भाउ, अनुमानित रकम, पिकअप बुक वा ट्र्याक गर्न र भुक्तानी सम्बन्धी प्रश्नमा मद्दत गर्न सक्छु। तपाईं के गर्न चाहनुहुन्छ?',
    ratesFor: (city) => `**${city}** मा अहिलेको अनुमानित भाउ यस्तो छ। अन्तिम रकम पिकअपमा वास्तविक तौल अनुसार हुन्छ।`,
    ratesNone: (city) => `**${city}** मा यसको भाउ भेटिएन। पूरा सूची [भाउ पेज](/rates) मा हेर्नुहोस्।`,
    ratesGeneric: (city) =>
      `**${city}** का केही हालको अनुमानित भाउ यस्ता छन्। सामानको नाम लेख्नुहोस् (जस्तै "तामाको भाउ") वा पूरा सूची [भाउ पेज](/rates) मा हेर्नुहोस्।`,
    estimate: (min, max) =>
      `तपाईंको अनुमानित रकम **${money(min)} – ${money(max)}** हो। यो अनुमान मात्र हो; अन्तिम रकम पिकअपमा वास्तविक तौल अनुसार हुन्छ।`,
    book: 'बुकिङ गर्न करिब एक मिनेट लाग्छ: सामान छान्नुहोस्, परिमाण राख्नुहोस्, ठेगाना र समय छान्नुहोस्। पिकअप निःशुल्क छ।',
    loginNeeded: 'तपाईंको पिकअप हेर्न कृपया लगइन गर्नुहोस्।',
    noPickups: 'तपाईंको अहिलेसम्म कुनै पिकअप छैन। एउटा बुक गर्नुहुन्छ?',
    latestPickup: 'तपाईंको पछिल्लो पिकअप:',
    latestFor: (id) => `**${id}** को ताजा अवस्था:`,
    trackNotFound: (id) => `तपाईंको खातामा पिकअप ${id} भेटिएन। कृपया ID जाँच गर्नुहोस्।`,
    askPickupId: 'कुन पिकअप? तपाईंका पछिल्ला पिकअपहरू यी हुन्। पिकअप ID पठाउनुहोस् (जस्तै SM-2026-000123)।',
    confirmCancel: (id) => `के तपाईं पिकअप **${id}** रद्द गर्न चाहनुहुन्छ? अगाडि बढ्न तल **Confirm** थिच्नुहोस्।`,
    confirmMove: 'नयाँ समय पक्का गर्न तल **Confirm** थिच्नुहोस्।',
    cannotChange: (msg) => `यो गर्न मिलेन: ${msg}`,
    reschedHelp: (id) =>
      `**${id}** को समय सार्न नयाँ मिति र स्लट लेख्नुहोस्, जस्तै: "reschedule ${id} to 2026-10-12 11:00 AM - 1:00 PM"। उपलब्ध स्लटहरू:`,
    catalog: (cats) => `हामी यी सामान लिन्छौं:\n${cats}\n\nकुनै पनि सामानको भाउ सोध्नुहोस् वा पिकअप बुक गर्नुहोस्।`,
    areas: (cities) => `हामी अहिले यी सहरहरूमा पिकअप गर्छौं: **${cities}**।`,
    slots: (date, slots) => `${date} का पिकअप स्लटहरू:\n${slots}`,
    faq: (q, a) => `**${q}**\n\n${a}`,
    payment:
      'कलेक्टरले तौलिएपछि तुरुन्तै **नगद, eSewa, Khalti वा बैंक ट्रान्सफर** बाट भुक्तानी पाउनुहुन्छ। हरेक पूरा भएको पिकअपको डिजिटल रसिद बन्छ।',
    bookLabel: 'पिकअप बुक गर्नुहोस्',
    ratesLabel: 'सबै भाउ हेर्नुहोस्',
    unknown:
      'माफ गर्नुहोस्, मैले बुझिनँ। म भाउ, अनुमान, बुकिङ, पिकअप ट्र्याकिङ र भुक्तानीमा मद्दत गर्न सक्छु। तपाईं WhatsApp मा हाम्रो टोलीसँग पनि कुरा गर्न सक्नुहुन्छ।',
  },
};

const QTY_RE = /(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos|केजी|किलो|pcs|pieces?|piece|nos|wata|वटा|units?)?/i;

function bulletList(lines) {
  return lines.map((l) => `- ${l}`).join('\n');
}

function isoDateFromText(text) {
  const m = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m) return m[1];
  const d = new Date();
  if (/\b(tomorrow|bholi)\b|भोलि/i.test(text)) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// "10 kg newspaper and 2 fridge" -> [{ item: 'Newspaper', quantity: 10 }, ...]
async function parseQuantities(text) {
  // "and" / Nepali "र", "अनि" only as whole words (र appears inside many words).
  const parts = text.split(/,|\band\b|\bra\b|\sर\s|\bani\b|\sअनि\s|\+|;/i);
  const out = [];
  for (const part of parts) {
    const q = part.match(QTY_RE);
    if (!q) continue;
    const items = await findItemsInText(part);
    if (items.length) out.push({ item: items[0].name, quantity: Number(q[1]) });
  }
  return out;
}

async function reply({ text, lang, ctx }) {
  const t = T[lang] || T.en;
  const topic = classifyTopic(text);
  const pickupId = extractPickupId(text);
  const say = (content, extra = {}) => ({ text: content, topic, failed: false, ...extra });

  // Specific pickup questions (track / cancel / reschedule)
  if (topic === 'cancel_reschedule') {
    if (!ctx.user) {
      ctx.cards.push({ type: 'login' });
      return say(t.loginNeeded);
    }
    if (!pickupId) {
      await runTool('get_my_pickups', {}, ctx);
      return say(t.askPickupId);
    }
    if (/reschedul|change|postpone|sarnu|सार्नु|बदल/i.test(text)) {
      const slotMatch = text.match(/\d{1,2}:\d{2}\s*[AP]M\s*-\s*\d{1,2}:\d{2}\s*[AP]M/i);
      const dateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (slotMatch && dateMatch) {
        const { result } = await runTool(
          'reschedule_pickup',
          { pickup_id: pickupId, date: dateMatch[0], slot: slotMatch[0].replace(/\s+/g, ' ').replace(/\s*-\s*/, ' - ') },
          ctx
        );
        if (result.error) return say(t.cannotChange(result.message));
        return say(t.confirmMove);
      }
      const { result } = await runTool('get_time_slots', { date: isoDateFromText(text) }, ctx);
      return say(`${t.reschedHelp(pickupId)}\n${bulletList(result.slots || [])}`);
    }
    const { result } = await runTool('cancel_pickup', { pickup_id: pickupId }, ctx);
    if (result.error) return say(t.cannotChange(result.message));
    return say(t.confirmCancel(pickupId));
  }

  if (topic === 'tracking' || pickupId) {
    if (!ctx.user) {
      ctx.cards.push({ type: 'login' });
      return say(t.loginNeeded);
    }
    if (pickupId) {
      const { result } = await runTool('track_pickup', { pickup_id: pickupId }, ctx);
      if (result.error) return say(t.trackNotFound(pickupId));
      return say(t.latestFor(pickupId));
    }
    const { result } = await runTool('get_my_pickups', {}, ctx);
    if (!result.pickups?.length) {
      ctx.cards.push({ type: 'link', label: t.bookLabel, to: '/schedule-pickup' });
      return say(t.noPickups);
    }
    // Show the most relevant one as a tracking card instead of the whole list.
    ctx.cards.length = 0;
    const active = result.pickups.find((p) => !['COMPLETED', 'CANCELLED'].includes(p.status)) || result.pickups[0];
    ctx.cards.push({ type: 'tracking', pickup: active });
    return say(t.latestPickup);
  }

  // Item + quantity => estimate (checked before generic rates)
  const city = await pickCity(text, ctx.defaultCity);
  const quantities = /\d/.test(text) ? await parseQuantities(text) : [];
  if (quantities.length && ['rates', 'booking', 'other', 'catalog'].includes(topic)) {
    const { result } = await runTool('estimate_value', { items: quantities, city }, ctx);
    if (result.lines?.length) return say(t.estimate(result.totalMin, result.totalMax), { topic: 'rates' });
  }

  const mentioned = await findItemsInText(text);
  if (topic === 'rates' || (mentioned.length && ['other', 'catalog'].includes(topic))) {
    if (mentioned.length) {
      const before = ctx.cards.length;
      const lines = [];
      for (const item of mentioned.slice(0, 4)) {
        const { result } = await runTool('get_scrap_rates', { city, search: item.name }, ctx);
        lines.push(...(result.rates || []));
      }
      // Merge into one rates card.
      ctx.cards.splice(before);
      if (!lines.length) return say(t.ratesNone(city), { topic: 'rates' });
      ctx.cards.push({ type: 'rates', city, rates: lines.slice(0, 8), more: 0 });
      return say(t.ratesFor(city), { topic: 'rates' });
    }
    const { result } = await runTool('get_scrap_rates', { city }, ctx);
    if (!result.rates?.length) return say(t.ratesNone(city), { topic: 'rates' });
    return say(t.ratesGeneric(city), { topic: 'rates' });
  }

  if (topic === 'booking') {
    ctx.cards.push({ type: 'link', label: t.bookLabel, to: '/schedule-pickup' });
    return say(t.book);
  }

  if (topic === 'catalog') {
    const categories = await ScrapCategory.find({ isActive: true }).sort({ name: 1 }).lean();
    const lines = [];
    for (const c of categories) {
      const items = await ScrapItem.find({ category: c._id, isActive: true }).limit(6).lean();
      lines.push(`**${c.name}**: ${items.map((i) => i.name).join(', ')}`);
    }
    ctx.cards.push({ type: 'link', label: t.ratesLabel, to: '/rates' });
    return say(t.catalog(bulletList(lines)));
  }

  if (topic === 'service_area') {
    const { result } = await runTool('get_service_areas', {}, ctx);
    return say(t.areas(result.cities.join(', ')));
  }

  if (topic === 'time_slots') {
    const date = isoDateFromText(text);
    const { result } = await runTool('get_time_slots', { date }, ctx);
    return say(t.slots(date, bulletList(result.slots || [])));
  }

  if (topic === 'greeting' && text.trim().split(/\s+/).length <= 4) return say(t.greeting);

  // Admin-editable FAQ before giving up.
  const { result: faq } = await runTool('get_faq', { topic: text }, ctx);
  if (faq.faqs?.length) return say(t.faq(faq.faqs[0].question, faq.faqs[0].answer));

  if (topic === 'payment') return say(t.payment);
  if (topic === 'greeting') return say(t.greeting);

  return { text: t.unknown, topic, failed: true };
}

module.exports = { reply, T };
