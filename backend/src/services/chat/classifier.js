// Cheap, deterministic text signals used in both AI and fallback modes:
// language detection (English / Nepali), escalation triggers, and a coarse
// topic for analytics.

const DEVANAGARI = /[ऀ-ॿ]/;
// Common words in Nepali typed in Latin script ("kabadi ko bhau kati cha?").
const ROMAN_NEPALI = /\b(ke|kati|cha|chha|chaina|xa|ho|hola|huncha|hunchha|malai|mero|hamro|tapai|tapain|hajur|kahile|kaha|kasari|garnu|garne|gardinu|chahiyo|chaiyo|bechna|bechne|kinne|kabadi|kawadi|bhau|bhaau|mol|paisa|rupaiya|ramro|dherai|thik|ani|pani|lai|ko|ma|sanga)\b/i;

function detectLanguage(text) {
  if (DEVANAGARI.test(text)) return 'ne';
  const hits = (String(text).match(new RegExp(ROMAN_NEPALI.source, 'gi')) || []).length;
  return hits >= 2 ? 'ne' : 'en';
}

const HUMAN_RE =
  /\b(human|real person|agent|representative|executive|customer care|support team|call me|talk to (a |some)?(person|human|someone|team)|manager|manche sanga|manxe sanga|kasai sanga kura|staff sanga)\b|मान्छे|कसैसँग कुरा|प्रतिनिधि|कर्मचारीसँग/i;
const ANGRY_RE =
  /\b(fraud|cheat(ed|ing)?|scam|worst|useless|pathetic|terrible|horrible|angry|furious|disgusting|rubbish|nonsense|thagi|thag|jhur|bakwas|bekar|faltu|dhoka|chor)\b|ठगी|ठग|झुर|बकवास|बेकार|फाल्तु|धोका|चोर/i;

function detectEscalation(text) {
  const t = String(text);
  if (HUMAN_RE.test(t)) return 'user_request';
  const letters = t.replace(/[^A-Za-z]/g, '');
  const shouting = letters.length >= 12 && letters === letters.toUpperCase();
  if (ANGRY_RE.test(t) || /!{3,}/.test(t) || shouting) return 'frustration';
  return null;
}

const TOPICS = [
  // Checked before tracking: "cancel SM-2026-000001" is a cancel, not a status check.
  ['cancel_reschedule', /\b(cancel\w*|reschedul\w*|change (the )?(date|time|slot)|postpone|radda|sarnu|sarne)\b|रद्द|सार्नु|बदल्नु|मिति बदल/i],
  ['tracking', /\b(track\w*|status|where is|arriv\w*|on the way|collector|kaha pugyo|kahile aaucha|kahile auxa)\b|SM-\d{4}-\d{6}|ट्र्याक|कहाँ|कहिले आउँछ/i],
  ['payment', /\b(pay|payment|paid|esewa|khalti|cash|bank|refund|money|paisa|bhuktani|wallet|receipt)\b|पैसा|भुक्तानी|रसिद|इसेवा|खल्ती/i],
  ['booking', /\b(book|schedule|pickup chahiyo|pick up|pickup)\b|बुक/i],
  ['rates', /\b(rate|rates|price|prices|bhau|bhaau|mol|kati|how much|worth|estimate|value)\b|भाउ|रेट|मूल्य|दर/i],
  ['catalog', /\b(what can i sell|what do you (buy|accept|take)|items|categories|accept|ke bechna|ke ke)\b|के बेच्न|के के/i],
  ['service_area', /\b(city|cities|area|areas|serviceable|available in|postal ?code|pin ?code|location|kun sahar|thau)\b|शहर|सहर|ठाउँ|इलाका/i],
  ['time_slots', /\b(slot|slots|timing|timings|what time|samaya|bela)\b|समय|बेला/i],
  ['account', /\b(login|log in|password|account|register|sign ?up|otp|profile|address)\b|पासवर्ड|खाता|ठेगाना/i],
  ['greeting', /^\s*(hi+|hello|hey|namaste|namaskar|k cha|k xa|good (morning|afternoon|evening))\b|नमस्ते|नमस्कार/i],
];

function classifyTopic(text) {
  for (const [topic, re] of TOPICS) if (re.test(text)) return topic;
  return 'other';
}

const PICKUP_ID_RE = /\bSM-\d{4}-\d{6}\b/i;

function extractPickupId(text) {
  const m = String(text).match(PICKUP_ID_RE);
  return m ? m[0].toUpperCase() : null;
}

module.exports = { detectLanguage, detectEscalation, classifyTopic, extractPickupId, PICKUP_ID_RE };
