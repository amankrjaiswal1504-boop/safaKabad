const ScrapItem = require('../../models/ScrapItem');
const { DEFAULT_CITY } = require('../../config/constants');
const { listServiceCities, escapeRegex } = require('../rateService');

// Whole-word match that also works for Devanagari (\b does not).
function wordRe(word, suffix = '') {
  return new RegExp(`(^|[^\\p{L}])${escapeRegex(word)}${suffix}($|[^\\p{L}])`, 'u');
}

// Common Nepali / local names for catalogue items -> canonical item name.
const SYNONYMS = {
  phalam: 'Iron', falam: 'Iron', फलाम: 'Iron',
  tama: 'Copper', तामा: 'Copper',
  pittal: 'Brass', pital: 'Brass', पित्तल: 'Brass',
  patrika: 'Newspaper', akhbar: 'Newspaper', newspapers: 'Newspaper', raddi: 'Newspaper', पत्रिका: 'Newspaper', अखबार: 'Newspaper', रद्दी: 'Newspaper',
  kartun: 'Cardboard', cartoon: 'Cardboard', carton: 'Cardboard', cartons: 'Cardboard', baksa: 'Cardboard', कार्टुन: 'Cardboard', बाकस: 'Cardboard',
  kagaj: 'Office Paper', कागज: 'Office Paper',
  kitab: 'Books', book: 'Books', किताब: 'Books', पुस्तक: 'Books',
  प्लास्टिक: 'Plastic', bottles: 'Plastic',
  aluminum: 'Aluminium', almunium: 'Aluminium', एल्मुनियम: 'Aluminium', एल्युमिनियम: 'Aluminium',
  cans: 'Aluminium Can', can: 'Aluminium Can', क्यान: 'Aluminium Can',
  luga: 'Clothes', kapada: 'Clothes', लुगा: 'Clothes', कपडा: 'Clothes',
  sisa: 'Glass', sisi: 'Glass', सिसा: 'Glass', सिसी: 'Glass',
  fridge: 'Refrigerator', फ्रिज: 'Refrigerator',
  ac: 'Air Conditioner', एसी: 'Air Conditioner',
  tv: 'Television', टिभी: 'Television', टीभी: 'Television',
  'washing machine': 'Washing Machine', वासिङ: 'Washing Machine',
  computer: 'Desktop CPU', cpu: 'Desktop CPU', कम्प्युटर: 'Desktop CPU',
  laptops: 'Laptop', ल्यापटप: 'Laptop',
  pankha: 'Fan', पंखा: 'Fan',
  motorcycle: 'Bike', motorbike: 'Bike', bike: 'Bike', मोटरसाइकल: 'Bike', बाइक: 'Bike',
  scooty: 'Scooter', स्कुटर: 'Scooter',
  gadi: 'Car', गाडी: 'Car', कार: 'Car',
  steel: 'Steel', स्टिल: 'Steel',
};

// Nepali postpositions that attach to the noun ("तामाको", "फलामलाई").
const NE_SUFFIX = '(?:को|का|की|लाई|मा|ले|हरू|हरु)?';

let cache = { at: 0, items: [] };
const TTL_MS = 60 * 1000;

async function activeItems() {
  if (Date.now() - cache.at > TTL_MS) {
    cache = { at: Date.now(), items: await ScrapItem.find({ isActive: true }).select('name unit category').lean() };
  }
  return cache.items;
}

function resetCatalogCache() {
  cache = { at: 0, items: [] };
}

function normalise(s) {
  return String(s).toLowerCase().trim();
}

// Resolve a free-text item name ("copper wire", "fridge", "तांबा") to a catalogue item.
async function resolveItemByName(name) {
  const items = await activeItems();
  const n = normalise(name);
  if (!n) return null;
  const byName = (target) => items.find((i) => normalise(i.name) === normalise(target));
  return (
    byName(n) ||
    (SYNONYMS[n] && byName(SYNONYMS[n])) ||
    items.find((i) => n.includes(normalise(i.name))) ||
    items.find((i) => normalise(i.name).includes(n)) ||
    (() => {
      const key = Object.keys(SYNONYMS).find((k) => wordRe(k, NE_SUFFIX).test(n));
      return key ? byName(SYNONYMS[key]) : null;
    })() ||
    null
  );
}

// Every catalogue item mentioned in a sentence, longest names first so
// "Aluminium Can" wins over "Aluminium".
async function findItemsInText(text) {
  const items = await activeItems();
  const t = ` ${normalise(text)} `;
  const found = new Map();
  const sorted = [...items].sort((a, b) => b.name.length - a.name.length);
  let remaining = t;
  for (const item of sorted) {
    const re = wordRe(normalise(item.name), 's?');
    if (re.test(remaining)) {
      found.set(String(item._id), item);
      remaining = remaining.replace(re, ' ');
    }
  }
  for (const [syn, canonical] of Object.entries(SYNONYMS)) {
    const re = wordRe(syn, NE_SUFFIX);
    if (re.test(remaining)) {
      const item = items.find((i) => i.name === canonical);
      if (item) found.set(String(item._id), item);
    }
  }
  return [...found.values()];
}

// City for rate lookups: one named in the text, else the user's default address
// city, else the configured default.
async function pickCity(text, fallbackCity) {
  const cities = await listServiceCities();
  const t = normalise(text || '');
  const named = cities.find((c) => t.includes(normalise(c)));
  return named || fallbackCity || DEFAULT_CITY;
}

module.exports = { resolveItemByName, findItemsInText, pickCity, resetCatalogCache };
