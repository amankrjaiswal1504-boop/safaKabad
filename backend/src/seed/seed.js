require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const User = require('../models/User');
const ScrapCategory = require('../models/ScrapCategory');
const ScrapItem = require('../models/ScrapItem');
const ScrapPrice = require('../models/ScrapPrice');
const PriceHistory = require('../models/PriceHistory');
const Address = require('../models/Address');
const Pickup = require('../models/Pickup');
const Payment = require('../models/Payment');
const Faq = require('../models/Faq');
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const SupportTicket = require('../models/SupportTicket');
const platform = require('../models/platform');

const { City, ServiceArea, Coupon, Ngo, Review, WalletTransaction, RecurringPlan, PriceAlert, Quote, AnalyticsEvent, Setting } = platform;
const { CITIES, areaDocs } = require('./kathmanduValley');

// Indicative buying prices in Nepali rupees (NPR) for Kathmandu.
const CATEGORY_DATA = [
  {
    name: 'Normal Recyclables',
    nameNe: 'सामान्य पुनःप्रयोग सामग्री',
    icon: 'recycle',
    description: 'Paper, cardboard, plastic, metals, glass and clothes',
    items: [
      { name: 'Newspaper', nameNe: 'पत्रिका', unit: 'kg', min: 15, max: 20, co2: 1.0 },
      { name: 'Cardboard', nameNe: 'कार्टुन', unit: 'kg', min: 10, max: 14, co2: 0.9 },
      { name: 'Office Paper', nameNe: 'अफिस कागज', unit: 'kg', min: 14, max: 18, co2: 1.0 },
      { name: 'Books', nameNe: 'किताब', unit: 'kg', min: 12, max: 16, co2: 0.9 },
      { name: 'Plastic', nameNe: 'प्लास्टिक', unit: 'kg', min: 10, max: 18, co2: 1.5 },
      { name: 'Iron', nameNe: 'फलाम', unit: 'kg', min: 30, max: 38, co2: 1.5 },
      { name: 'Steel', nameNe: 'स्टिल', unit: 'kg', min: 35, max: 45, co2: 1.6 },
      { name: 'Aluminium', nameNe: 'एल्मुनियम', unit: 'kg', min: 160, max: 200, co2: 9 },
      { name: 'Aluminium Can', nameNe: 'एल्मुनियम क्यान', unit: 'kg', min: 140, max: 180, co2: 9 },
      { name: 'Brass', nameNe: 'पित्तल', unit: 'kg', min: 450, max: 520, co2: 3 },
      { name: 'Copper', nameNe: 'तामा', unit: 'kg', min: 780, max: 900, co2: 3.5 },
      { name: 'Glass', nameNe: 'सिसा', unit: 'kg', min: 2, max: 4, co2: 0.3 },
      { name: 'Clothes', nameNe: 'लुगा', unit: 'kg', min: 5, max: 10, co2: 3 },
    ],
  },
  {
    name: 'E-Waste',
    nameNe: 'इ-फोहोर',
    icon: 'ewaste',
    conditionGrading: true,
    description: 'Laptops, computers, monitors, printers, TVs and gadgets',
    items: [
      { name: 'Laptop', nameNe: 'ल्यापटप', unit: 'piece', min: 300, max: 1000, co2: 30, kg: 2.5 },
      { name: 'Desktop CPU', nameNe: 'डेस्कटप CPU', unit: 'piece', min: 250, max: 650, co2: 40, kg: 8 },
      { name: 'Monitor', nameNe: 'मनिटर', unit: 'piece', min: 120, max: 400, co2: 25, kg: 5 },
      { name: 'Printer', nameNe: 'प्रिन्टर', unit: 'piece', min: 100, max: 300, co2: 15, kg: 6 },
      { name: 'Scanner', nameNe: 'स्क्यानर', unit: 'piece', min: 60, max: 200, co2: 10, kg: 4 },
      { name: 'Television', nameNe: 'टिभी', unit: 'piece', min: 250, max: 800, co2: 60, kg: 15 },
      { name: 'Tablet', nameNe: 'ट्याब्लेट', unit: 'piece', min: 80, max: 300, co2: 8, kg: 0.5 },
      { name: 'Other Electronic Waste', nameNe: 'अन्य इ-फोहोर', unit: 'kg', min: 30, max: 90, co2: 12 },
    ],
  },
  {
    name: 'Appliances',
    nameNe: 'घरायसी उपकरण',
    icon: 'appliance',
    conditionGrading: true,
    description: 'Fridges, washing machines, ACs, coolers and more',
    items: [
      { name: 'Refrigerator', nameNe: 'फ्रिज', unit: 'piece', min: 800, max: 2000, co2: 150, kg: 45 },
      { name: 'Washing Machine', nameNe: 'वासिङ मेसिन', unit: 'piece', min: 650, max: 1600, co2: 100, kg: 35 },
      { name: 'Microwave', nameNe: 'माइक्रोवेभ', unit: 'piece', min: 150, max: 450, co2: 20, kg: 12 },
      { name: 'Air Conditioner', nameNe: 'एसी', unit: 'piece', min: 1000, max: 2500, co2: 120, kg: 40 },
      { name: 'Cooler', nameNe: 'कुलर', unit: 'piece', min: 250, max: 650, co2: 25, kg: 15 },
      { name: 'Fan', nameNe: 'पंखा', unit: 'piece', min: 100, max: 250, co2: 6, kg: 4 },
      { name: 'Geyser', nameNe: 'गिजर', unit: 'piece', min: 250, max: 650, co2: 20, kg: 12 },
      { name: 'UPS', nameNe: 'युपिएस', unit: 'piece', min: 150, max: 450, co2: 15, kg: 10 },
      { name: 'Inverter', nameNe: 'इन्भर्टर', unit: 'piece', min: 300, max: 800, co2: 30, kg: 15 },
      { name: 'Other Appliances', nameNe: 'अन्य उपकरण', unit: 'piece', min: 80, max: 300, co2: 15, kg: 8 },
    ],
  },
  {
    name: 'Vehicle Scrap',
    nameNe: 'पुराना सवारी साधन',
    icon: 'vehicle',
    description: 'Old motorbikes, scooters and cars (bring the bluebook for deregistration)',
    items: [
      { name: 'Bike', nameNe: 'मोटरसाइकल', unit: 'piece', min: 2500, max: 6500, co2: 300, kg: 100 },
      { name: 'Scooter', nameNe: 'स्कुटर', unit: 'piece', min: 2500, max: 6500, co2: 250, kg: 90 },
      { name: 'Car', nameNe: 'कार', unit: 'piece', min: 25000, max: 65000, co2: 2000, kg: 900 },
    ],
  },
];

const FAQ_DATA = [
  { topic: 'pricing', question: 'Is the price I see final?', answer: 'No. Rates shown are indicative ranges in Nepali rupees. The final amount is calculated from the actual weight and condition verified at your door, using the ScrapMate rate for your city.', keywords: ['final', 'price', 'rate', 'exact', 'bhau'] },
  { topic: 'pickup', question: 'Is pickup free?', answer: 'Yes. Doorstep pickup is free for every scrap category we support.', keywords: ['free', 'charge', 'fee', 'cost'] },
  { topic: 'payment', question: 'How do I get paid?', answer: 'Choose cash, eSewa, Khalti, bank transfer or your ScrapMate wallet once the collector has weighed your scrap. A digital receipt is generated straight away.', keywords: ['payment', 'paid', 'esewa', 'khalti', 'cash', 'bank', 'money', 'wallet'] },
  { topic: 'payment', question: 'I have not received my payment. What should I do?', answer: 'Open the pickup in your dashboard to check the payment status. eSewa, Khalti and bank payouts are usually settled the same day. If it shows paid but you have not received it, contact support on WhatsApp with your pickup ID.', keywords: ['not received', 'missing', 'pending', 'refund'] },
  { topic: 'pickup', question: 'Where do you pick up?', answer: 'Across the Kathmandu valley: Kathmandu, Lalitpur and Bhaktapur districts. When you add your address, choose your municipality and ward and we will confirm straight away.', keywords: ['area', 'where', 'city', 'municipality', 'ward', 'kathmandu', 'lalitpur', 'bhaktapur'] },
  { topic: 'pickup', question: 'Is there a minimum quantity for pickup?', answer: 'Most areas have a small minimum (shown when you book). Large or commercial quantities are welcome too: use the Business page for a bulk quote.', keywords: ['minimum', 'small', 'quantity', 'weight'] },
  { topic: 'pickup', question: 'Can I cancel or reschedule a pickup?', answer: 'Yes. You can reschedule up to 4 hours before your slot, and cancel any time before the collector arrives, from your pickup page or by asking the chat assistant.', keywords: ['cancel', 'reschedule', 'change', 'date'] },
  { topic: 'weighing', question: 'How is my scrap weighed?', answer: 'The collector weighs each item on a digital scale in front of you and photographs the scale reading. You can review the amount and accept or dispute it before payment.', keywords: ['weigh', 'scale', 'weight', 'collector', 'dispute'] },
  { topic: 'safety', question: 'Why do I get a 4-digit code?', answer: 'For your safety, the collector must enter the 4-digit code shown on your pickup page before weighing can start. Only share it with the collector at your door.', keywords: ['otp', 'code', 'pin', 'safety', 'verify'] },
  { topic: 'account', question: 'I forgot my password.', answer: 'Use "Forgot password" on the login page, or simply log in with your mobile number and a one-time code.', keywords: ['password', 'forgot', 'login', 'reset'] },
  { topic: 'items', question: 'What items do you not accept?', answer: 'We do not collect hazardous waste (chemicals, medical waste, asbestos), food waste or wet garbage.', keywords: ['not accept', 'hazardous', 'reject', 'garbage'] },
  { topic: 'business', question: 'Do you work with shops, offices and societies?', answer: 'Yes. Business accounts get recurring pickups, PAN/VAT bills, dedicated pricing tiers and certified e-waste disposal certificates. Request a quote on the Business page.', keywords: ['business', 'office', 'shop', 'pasal', 'society', 'bulk', 'vat', 'pan'] },
  { topic: 'donation', question: 'Can I donate instead of selling?', answer: 'Yes. Choose "Donate" when booking and pick one of our partner NGOs. You will get a donation certificate after pickup.', keywords: ['donate', 'ngo', 'charity', 'donation'] },
  { topic: 'pickup', question: 'Do you pick up during Dashain and Tihar?', answer: 'Pickups run on most days. Festival holidays are shown as closed in the date picker, so you can always see which days are open.', keywords: ['dashain', 'tihar', 'festival', 'holiday'] },
];

const NGOS = [
  { name: 'Sahara Clothing Bank', description: 'Sorts and shares donated clothes with families in need across the Kathmandu valley.', cities: [], accepts: ['normal-recyclables'], registrationNumber: 'SWC 41235' },
  { name: 'Pustak Ghar Nepal', description: 'Builds community libraries in public schools with donated books.', cities: [], accepts: ['normal-recyclables'], registrationNumber: 'SWC 38517' },
  { name: 'Digital Saathi Nepal', description: 'Refurbishes old laptops and phones for students in rural schools.', cities: [], accepts: ['e-waste'], registrationNumber: 'SWC 50922' },
];

const REVIEWS = [
  [5, 'Collector came on time, weighed everything in front of me and the eSewa payment arrived before he left.'],
  [5, 'Sold an old fridge and an AC in one pickup. The estimate was very close to the final amount.'],
  [4, 'Smooth process. Liked that I could see the photo of the scale reading on my receipt.'],
  [5, 'Our society now has a monthly pickup. The VAT bill makes accounting easy.'],
  [4, 'Booked in Nepali through the chat assistant, very convenient for my parents.'],
  [5, 'Got the e-waste certificate for our office within minutes of the pickup.'],
];

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
const r2 = (n) => Math.round(n);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const jitter = ([lat, lng], spread = 0.04) => ({ lat: lat + (Math.random() - 0.5) * spread, lng: lng + (Math.random() - 0.5) * spread });

async function seed() {
  await connectDB();
  console.log('[seed] Clearing existing data...');
  const platformModels = Object.values(platform).filter((m) => typeof m?.deleteMany === 'function');
  const models = [User, ScrapCategory, ScrapItem, ScrapPrice, PriceHistory, Address, Pickup, Payment, Faq, ChatSession, ChatMessage, SupportTicket, ...platformModels];
  await Promise.all(models.map((m) => m.deleteMany({})));

  console.log('[seed] Creating staff and admin accounts (DEVELOPMENT / DEMO credentials)...');
  const admin = await User.create({ name: 'Admin User', email: 'admin@scrapmate.dev', phone: '9800000000', password: 'Admin@123', role: 'admin' });
  await User.create([
    { name: 'Sabina Support', email: 'support@scrapmate.dev', phone: '9800000010', password: 'Staff@123', role: 'staff', staffRole: 'support' },
    { name: 'Oshin Operations', email: 'ops@scrapmate.dev', phone: '9800000011', password: 'Staff@123', role: 'staff', staffRole: 'operations' },
    { name: 'Firoj Finance', email: 'finance@scrapmate.dev', phone: '9800000012', password: 'Staff@123', role: 'staff', staffRole: 'finance' },
  ]);

  console.log('[seed] Creating Kathmandu valley cities, municipalities and collectors...');
  await City.insertMany(CITIES.map(({ priceFactor, ...c }) => ({ ...c, slug: slugify(c.name), isActive: true })));
  const areas = await ServiceArea.insertMany(areaDocs());
  const area = (name) => areas.find((a) => a.name === name);

  // One collector per patch of municipalities; plates in the Bagmati style.
  const COLLECTORS = [
    ['Ram Bahadur Thapa', 'Kathmandu', ['Kathmandu Metropolitan City', 'Kirtipur', 'Nagarjun', 'Chandragiri']],
    ['Hari Shrestha', 'Kathmandu', ['Kathmandu Metropolitan City', 'Budhanilkantha', 'Tokha', 'Tarakeshwar']],
    ['Bikash Gurung', 'Kathmandu', ['Kathmandu Metropolitan City', 'Gokarneshwar', 'Kageshwori-Manohara', 'Shankharapur', 'Dakshinkali']],
    ['Suman Tamang', 'Lalitpur', ['Lalitpur Metropolitan City', 'Mahalaxmi']],
    ['Dipak Maharjan', 'Lalitpur', ['Lalitpur Metropolitan City', 'Godawari', 'Mahankal']],
    ['Prakash Prajapati', 'Bhaktapur', ['Bhaktapur', 'Suryabinayak']],
    ['Kiran Duwal', 'Bhaktapur', ['Madhyapur Thimi', 'Changunarayan']],
  ];
  const collectors = [];
  for (const [i, [name, city, areaNames]] of COLLECTORS.entries()) {
    const home = area(areaNames[areaNames.length > 1 ? 1 : 0]);
    collectors.push(
      await User.create({
        name,
        email: `collector${i + 1}@scrapmate.dev`,
        phone: `98000001${String(i).padStart(2, '0')}`,
        password: 'Collector@123',
        role: 'collector',
        collectorProfile: {
          city,
          vehicleNumber: `BA ${(i % 9) + 1} PA ${1000 + i * 37}`,
          serviceAreas: areaNames.map((n) => area(n)._id),
          location: { ...jitter([home.center.lat, home.center.lng], 0.02), updatedAt: new Date() },
          isAvailable: true,
        },
      })
    );
  }

  console.log('[seed] Creating categories, items and city prices in NPR (with history)...');
  const itemsByName = {};
  for (const [ci, cat] of CATEGORY_DATA.entries()) {
    const category = await ScrapCategory.create({
      name: cat.name,
      nameNe: cat.nameNe,
      slug: slugify(cat.name),
      icon: cat.icon,
      description: cat.description,
      sortOrder: ci,
      conditionGrading: Boolean(cat.conditionGrading),
    });
    for (const it of cat.items) {
      const item = await ScrapItem.create({
        category: category._id,
        name: it.name,
        nameNe: it.nameNe,
        unit: it.unit,
        co2PerUnit: it.co2,
        kgPerUnit: it.kg || 1,
      });
      itemsByName[it.name] = item;
      for (const c of CITIES) {
        const min = Math.max(1, r2(it.min * c.priceFactor));
        const max = Math.max(min, r2(it.max * c.priceFactor));
        const price = await ScrapPrice.create({ item: item._id, city: c.name, minPrice: min, maxPrice: max, recyclerPrice: r2(max * 1.18), updatedBy: admin._id });
        // Earlier price points so the trends chart has a history.
        {
          const steps = [0.9, 0.95, 0.97];
          let prevMin;
          let prevMax;
          for (const [si, s] of steps.entries()) {
            const nm = Math.max(1, r2(min * s));
            const nx = Math.max(nm, r2(max * s));
            const h = await PriceHistory.create({ price: price._id, item: item._id, city: c.name, oldMinPrice: prevMin, oldMaxPrice: prevMax, newMinPrice: nm, newMaxPrice: nx, changedBy: admin._id });
            await PriceHistory.collection.updateOne({ _id: h._id }, { $set: { createdAt: daysAgo(150 - si * 45) } });
            prevMin = nm;
            prevMax = nx;
          }
          const last = await PriceHistory.create({ price: price._id, item: item._id, city: c.name, oldMinPrice: prevMin, oldMaxPrice: prevMax, newMinPrice: min, newMaxPrice: max, changedBy: admin._id });
          await PriceHistory.collection.updateOne({ _id: last._id }, { $set: { createdAt: daysAgo(10) } });
        }
      }
    }
  }

  console.log('[seed] Creating customers, addresses and pickups...');
  const customer = await User.create({ name: 'Demo Customer', email: 'customer@scrapmate.dev', phone: '9800000003', password: 'Customer@123', role: 'customer', referralCode: 'DEMO50' });
  const business = await User.create({
    name: 'Priya Joshi',
    email: 'business@scrapmate.dev',
    phone: '9800000004',
    password: 'Business@123',
    role: 'customer',
    accountType: 'business',
    business: { companyName: 'Sunrise Apartments Society', businessType: 'society', panVat: '301234567', billingAddress: 'Bishalnagar, Kathmandu Metropolitan City-5, Kathmandu 44616', pricingTier: 'silver' },
  });
  const extraNames = ['Sita Shrestha', 'Anita Gurung', 'Pratik Maharjan', 'Rohan KC', 'Sunita Tamang', 'Bibek Pandey'];
  const others = [];
  for (const [i, name] of extraNames.entries()) {
    others.push(await User.create({ name, email: `user${i + 1}@scrapmate.dev`, phone: `98100000${String(i).padStart(2, '0')}`, password: 'Customer@123', role: 'customer', referredBy: i < 3 ? customer._id : null, referralRewarded: i < 2 }));
  }

  // Same shape the API builds from (area, ward): see cityService.resolveAddress.
  const addressIn = (user, areaName, ward, extra = {}) => {
    const a = area(areaName);
    return Address.create({
      user: user._id,
      area: a._id,
      ward,
      municipality: a.name,
      district: a.district,
      city: a.city,
      state: a.state,
      locality: `${a.name}-${ward}`,
      pinCode: extra.pinCode || a.pinCodes[0],
      location: extra.location || jitter([a.center.lat, a.center.lng], 0.015),
      isDefault: true,
      ...extra,
    });
  };
  const address = await addressIn(customer, 'Kathmandu Metropolitan City', 10, {
    houseNumber: 'House 221',
    street: 'New Baneshwor',
    landmark: 'Near Baneshwor Chowk',
    pinCode: '44600',
    addressType: 'home',
    location: { lat: 27.6915, lng: 85.342 },
  });
  const bizAddress = await addressIn(business, 'Kathmandu Metropolitan City', 5, {
    houseNumber: 'Society Clubhouse',
    street: 'Bishalnagar',
    pinCode: '44616',
    location: { lat: 27.7174, lng: 85.3354 },
  });

  const mkItems = (lines) =>
    lines.map(([name, qty, cond]) => {
      const it = itemsByName[name];
      return { item: it._id, itemName: it.name, unit: it.unit, estimatedQuantity: qty, condition: cond || null };
    });

  // Upcoming pickup for the demo customer (assigned).
  await Pickup.create({
    pickupId: 'SM-2026-000001',
    customer: customer._id,
    collector: collectors[0]._id,
    items: mkItems([['Iron', 10], ['Newspaper', 15]]),
    address: address._id,
    addressSnapshot: address.toObject(),
    pinCode: address.pinCode,
    area: address.area,
    city: address.city,
    location: address.location,
    scheduledDate: new Date(`${new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)}T00:00:00.000Z`),
    timeSlot: '11:00 AM - 1:00 PM',
    contactPhone: customer.phone,
    estimatedValueMin: 10 * 30 + 15 * 15,
    estimatedValueMax: 10 * 38 + 15 * 20,
    status: 'ASSIGNED',
    otp: '4321',
    statusHistory: [
      { status: 'BOOKED', at: daysAgo(1) },
      { status: 'ASSIGNED', at: daysAgo(1) },
    ],
  });

  // Completed history across customers & cities, with payments and reviews.
  let seq = 2;
  const completed = [];
  const histories = [
    [customer, address, [['Newspaper', 18], ['Cardboard', 9], ['Iron', 6]], 40, 'esewa'],
    [customer, address, [['Laptop', 1, 'not_working'], ['Monitor', 2, 'working']], 22, 'wallet'],
    [business, bizAddress, [['Cardboard', 85], ['Plastic', 30], ['Office Paper', 40]], 15, 'bank_transfer'],
    [business, bizAddress, [['Desktop CPU', 4, 'not_working'], ['Printer', 2, 'damaged'], ['Other Electronic Waste', 12]], 8, 'bank_transfer'],
  ];
  // Other customers spread across the valley: [municipality, ward, tole].
  const homes = [
    ['Kirtipur', 5, 'Naya Bazar'],
    ['Lalitpur Metropolitan City', 3, 'Jhamsikhel'],
    ['Bhaktapur', 7, 'Suryamadhi'],
    ['Madhyapur Thimi', 4, 'Bode'],
    ['Budhanilkantha', 6, 'Chapali'],
    ['Mahalaxmi', 2, 'Imadol'],
  ];
  for (const [i, u] of others.entries()) {
    const [areaName, ward, tole] = homes[i % homes.length];
    const a = await addressIn(u, areaName, ward, { houseNumber: `House ${12 + i}`, street: tole });
    histories.push([u, a, [['Newspaper', 10 + i * 3], ['Aluminium', 2 + i], ['Copper', 1]], 5 + i * 4, ['cash', 'khalti', 'wallet', 'esewa'][i % 4]]);
  }
  for (const [hi, [user, a, lines, ago, method]] of histories.entries()) {
    const c = { city: a.city };
    const collector =
      collectors.find((col) => col.collectorProfile.serviceAreas.some((x) => String(x) === String(a.area))) ||
      collectors.find((col) => col.collectorProfile.city === a.city);
    let total = 0;
    const items = [];
    for (const [name, qty, cond] of lines) {
      const it = itemsByName[name];
      const price = await ScrapPrice.findOne({ item: it._id, city: c.city });
      const mult = { working: 1, not_working: 0.6, damaged: 0.35 }[cond] ?? 1;
      const rate = Math.round(((price.minPrice + price.maxPrice) / 2) * mult * 100) / 100;
      const actual = it.unit === 'kg' ? Math.round(qty * (0.9 + Math.random() * 0.2) * 10) / 10 : qty;
      const subtotal = Math.round(actual * rate * 100) / 100;
      total += subtotal;
      items.push({ item: it._id, itemName: it.name, unit: it.unit, estimatedQuantity: qty, condition: cond || null, actualWeight: actual, rateApplied: rate, subtotal });
    }
    const when = daysAgo(ago);
    const pickupId = `SM-2026-${String(seq).padStart(6, '0')}`;
    seq += 1;
    const bonus = hi === 0 ? Math.round(total * 0.05) : 0;
    const p = await Pickup.create({
      pickupId,
      customer: user._id,
      collector: collector._id,
      items,
      address: a._id,
      addressSnapshot: a.toObject(),
      pinCode: a.pinCode,
      area: a.area,
      city: a.city,
      location: a.location,
      scheduledDate: new Date(`${when.toISOString().slice(0, 10)}T00:00:00.000Z`),
      timeSlot: '9:00 AM - 11:00 AM',
      contactPhone: user.phone,
      estimatedValueMin: Math.round(total * 0.85),
      estimatedValueMax: Math.round(total * 1.15),
      finalAmount: Math.round(total * 100) / 100,
      bonusAmount: bonus,
      status: 'COMPLETED',
      otp: '1234',
      otpVerifiedAt: when,
      completedAt: when,
      customerDecision: { status: 'accepted', at: when },
      payout: { method, status: 'paid', reference: `PAY-SEED-${seq}`, paidAt: when, walletId: ['esewa', 'khalti'].includes(method) ? user.phone : undefined },
      coupon: hi === 0 ? { code: 'FIRST5', bonusAmount: bonus } : undefined,
      statusHistory: ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING', 'COMPLETED'].map((s, si) => ({ status: s, at: new Date(when.getTime() - (5 - si) * 3600000) })),
    });
    await Pickup.collection.updateOne({ _id: p._id }, { $set: { createdAt: new Date(when.getTime() - 2 * 86400000) } });
    await Payment.create({ paymentId: `PAY-SEED-${seq}`, pickup: p._id, user: user._id, amount: p.finalAmount + bonus, method, status: 'successful', isMock: true });
    if (method === 'wallet') {
      const u = await User.findByIdAndUpdate(user._id, { $inc: { walletBalance: p.finalAmount + bonus } }, { new: true });
      await WalletTransaction.create({ user: user._id, type: 'credit', amount: p.finalAmount + bonus, balanceAfter: u.walletBalance, reason: 'pickup_payout', reference: pickupId });
    }
    completed.push({ p, collector, user });
  }

  // Referral rewards that were already paid out.
  for (const u of others.slice(0, 2)) {
    const c = await User.findByIdAndUpdate(customer._id, { $inc: { walletBalance: 100 } }, { new: true });
    await WalletTransaction.create({ user: customer._id, type: 'credit', amount: 100, balanceAfter: c.walletBalance, reason: 'referral', reference: String(u._id), note: `Referred ${u.name}` });
  }

  console.log('[seed] Reviews, coupons, NGOs, FAQs, quotes, plans and alerts...');
  for (const [i, { p, collector, user }] of completed.entries()) {
    const [rating, comment] = REVIEWS[i % REVIEWS.length];
    const rev = await Review.create({ pickup: p._id, customer: user._id, collector: collector._id, rating, comment, status: i === completed.length - 1 ? 'pending' : 'approved', featured: i < 3 });
    await Pickup.updateOne({ _id: p._id }, { review: rev._id });
  }
  for (const col of collectors) {
    const agg = await Review.aggregate([{ $match: { collector: col._id, status: 'approved' } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
    const done = await Pickup.countDocuments({ collector: col._id, status: 'COMPLETED' });
    await User.updateOne({ _id: col._id }, { 'collectorProfile.rating': agg[0] ? Math.round(agg[0].avg * 10) / 10 : 0, 'collectorProfile.ratingCount': agg[0]?.n || 0, 'collectorProfile.totalPickupsCompleted': done });
  }

  await Coupon.insertMany([
    { code: 'FIRST5', description: '+5% on your first pickup', type: 'percent', value: 5, maxBonus: 300, firstPickupOnly: true, perUserLimit: 1 },
    { code: 'BULK100', description: '+रु 100 on pickups of 50 kg or more', type: 'flat', value: 100, minWeightKg: 50, perUserLimit: 5 },
    { code: 'DASHAIN10', description: 'Dashain-Tihar bonus: +10% (max रु 500)', type: 'percent', value: 10, maxBonus: 500, perUserLimit: 1, validTo: new Date(Date.now() + 45 * 86400000) },
    { code: 'EWASTE150', description: '+रु 150 when you recycle e-waste worth रु 800+', type: 'flat', value: 150, minOrderValue: 800, perUserLimit: 2 },
  ]);
  await Ngo.insertMany(NGOS);
  await Faq.insertMany(FAQ_DATA.map((f, i) => ({ ...f, order: i })));
  await Quote.create({
    quoteId: 'QT-SEED-0001',
    customer: business._id,
    contactName: business.name,
    companyName: business.business.companyName,
    phone: business.phone,
    email: business.email,
    city: 'Kathmandu',
    panVat: business.business.panVat,
    businessType: 'society',
    description: 'Monthly cardboard and plastic from 240 flats, plus old office electronics once a quarter.',
    estimatedQuantityKg: 600,
    wantsCertificate: true,
    status: 'quoted',
    quotedAmount: 0,
    adminNote: 'Silver tier pricing (+3%), monthly pickup on the first Saturday.',
  });
  await Quote.create({ quoteId: 'QT-SEED-0002', contactName: 'Bikram Shrestha', companyName: 'Shrestha Kirana Pasal', phone: '9841000011', city: 'Lalitpur', businessType: 'kirana', description: 'About 150 kg of cartons every week.', estimatedQuantityKg: 150 });
  await RecurringPlan.create({
    customer: business._id,
    address: bizAddress._id,
    items: [{ item: itemsByName.Cardboard._id, estimatedQuantity: 80 }, { item: itemsByName.Plastic._id, estimatedQuantity: 25 }],
    frequency: 'monthly',
    dayOfMonth: 5,
    timeSlot: '9:00 AM - 11:00 AM',
    contactPhone: business.phone,
    nextRunDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 5)),
  });
  await PriceAlert.create({ user: customer._id, item: itemsByName.Copper._id, city: 'Kathmandu', direction: 'above', threshold: 920 });

  console.log('[seed] Sample chat tickets and analytics events...');
  const session = await ChatSession.create({ user: customer._id, escalated: true, language: 'en', messageCount: 2, lastUserMessage: 'My payment for the last pickup is showing pending' });
  await ChatMessage.create([
    { session: session._id, role: 'user', content: 'My payment for the last pickup is showing pending', topic: 'payment' },
    { session: session._id, role: 'assistant', content: "I'm sorry for the trouble. I've passed this to our support team (ticket **TKT-SEED-0001**).", mode: 'system', escalated: true },
  ]);
  await SupportTicket.create([
    { ticketId: 'TKT-SEED-0001', user: customer._id, session: session._id, summary: 'Customer says the eSewa payout for SM-2026-000002 shows pending.', reason: 'user_request', pickupId: 'SM-2026-000002' },
    { ticketId: 'TKT-SEED-0002', summary: 'Anonymous visitor asked about bulk e-waste pickup from a factory in Madhyapur Thimi.', reason: 'assistant_handoff', status: 'in_progress' },
  ]);
  const events = [];
  for (let d = 0; d < 30; d += 1) {
    const visits = 40 + Math.round(Math.random() * 30);
    for (let v = 0; v < visits; v += 1) events.push({ type: 'visit', createdAt: daysAgo(d) });
    for (let e = 0; e < Math.round(visits * 0.35); e += 1) events.push({ type: 'estimate', createdAt: daysAgo(d) });
    for (let b = 0; b < Math.round(visits * 0.12); b += 1) events.push({ type: 'booking_started', createdAt: daysAgo(d) });
  }
  await AnalyticsEvent.insertMany(events);
  await Setting.deleteMany({});

  console.log('\n[seed] Done! Demo credentials (DEVELOPMENT ONLY):');
  console.log('  Admin:      admin@scrapmate.dev / Admin@123');
  console.log('  Staff:      support@ / ops@ / finance@scrapmate.dev / Staff@123');
  console.log('  Collectors: collector1..7@scrapmate.dev / Collector@123  (1-3 Kathmandu, 4-5 Lalitpur, 6-7 Bhaktapur)');
  console.log('  Customer:   customer@scrapmate.dev / Customer@123  (or mobile 9800000003 + OTP)');
  console.log('  Business:   business@scrapmate.dev / Business@123\n');

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
