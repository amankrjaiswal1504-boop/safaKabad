process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret';
process.env.CHAT_RATE_LIMIT_PER_MIN = '1000';
process.env.AUTH_RATE_LIMIT = '1000';
process.env.API_RATE_LIMIT = '100000';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');
const ScrapCategory = require('../src/models/ScrapCategory');
const ScrapItem = require('../src/models/ScrapItem');
const ScrapPrice = require('../src/models/ScrapPrice');
const Address = require('../src/models/Address');
const Pickup = require('../src/models/Pickup');
const Faq = require('../src/models/Faq');
const { signToken } = require('../src/utils/jwt');
const { resetCatalogCache } = require('../src/services/chat/catalog');
const { clearRateCache } = require('../src/services/rateService');
const settings = require('../src/services/settingsService');

let mongo;

async function startDb() {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri());
}

async function stopDb() {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
}

async function resetDb() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  resetCatalogCache();
  clearRateCache();
  settings.clearCache();
}

// YYYY-MM-DD n days from today (Nepal time).
function dayFromNow(n) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Minimal world: two customers, an admin, a collector, a few priced items, one pickup owned by Alice.
async function seedBasics() {
  const admin = await User.create({ name: 'Admin', email: 'admin@test.dev', phone: '9800000001', password: 'secret12', role: 'admin' });
  const alice = await User.create({ name: 'Alice Rai', email: 'alice@test.dev', phone: '9800000002', password: 'secret12' });
  const bob = await User.create({ name: 'Bob Das', email: 'bob@test.dev', phone: '9800000003', password: 'secret12' });
  const collector = await User.create({
    name: 'Ravi Collector',
    email: 'ravi@test.dev',
    phone: '9800000004',
    password: 'secret12',
    role: 'collector',
    collectorProfile: { city: 'Kathmandu', servicePinCodes: ['44600'], location: { lat: 27.69, lng: 85.34 } },
  });

  const metals = await ScrapCategory.create({ name: 'Normal Recyclables', slug: 'normal-recyclables' });
  const ewaste = await ScrapCategory.create({ name: 'E-Waste', slug: 'e-waste', conditionGrading: true });
  const copper = await ScrapItem.create({ category: metals._id, name: 'Copper', unit: 'kg', co2PerUnit: 3.5 });
  const newspaper = await ScrapItem.create({ category: metals._id, name: 'Newspaper', unit: 'kg', co2PerUnit: 1 });
  const fridge = await ScrapItem.create({ category: metals._id, name: 'Refrigerator', unit: 'piece', kgPerUnit: 45 });
  const laptop = await ScrapItem.create({ category: ewaste._id, name: 'Laptop', unit: 'piece', kgPerUnit: 2.5 });
  await ScrapPrice.create([
    { item: copper._id, city: 'Kathmandu', minPrice: 480, maxPrice: 550, recyclerPrice: 600 },
    { item: newspaper._id, city: 'Kathmandu', minPrice: 12, maxPrice: 14, recyclerPrice: 17 },
    { item: fridge._id, city: 'Kathmandu', minPrice: 500, maxPrice: 1200 },
    { item: laptop._id, city: 'Kathmandu', minPrice: 200, maxPrice: 600 },
    { item: copper._id, city: 'Pokhara', minPrice: 470, maxPrice: 540 },
  ]);

  const address = await Address.create({
    user: alice._id,
    houseNumber: '1',
    street: 'MG Road',
    locality: 'Indiranagar',
    city: 'Kathmandu',
    state: 'Bagmati',
    pinCode: '44600',
    isDefault: true,
    location: { lat: 12.978, lng: 77.64 },
  });
  const pickup = await Pickup.create({
    pickupId: 'SM-2026-000001',
    customer: alice._id,
    items: [{ item: newspaper._id, itemName: 'Newspaper', estimatedQuantity: 10 }],
    address: address._id,
    addressSnapshot: address.toObject(),
    pinCode: '44600',
    scheduledDate: new Date(`${dayFromNow(2)}T00:00:00.000Z`),
    timeSlot: '9:00 AM - 11:00 AM',
    contactPhone: '9800000002',
    estimatedValueMin: 120,
    estimatedValueMax: 140,
    status: 'BOOKED',
    otp: '1111',
  });
  await Faq.create({
    topic: 'payment',
    question: 'How do I get paid?',
    answer: 'Cash, eSewa, Khalti or bank transfer after weighing.',
    keywords: ['payment', 'paid', 'esewa'],
  });
  await Faq.syncIndexes();

  return { admin, alice, bob, collector, copper, newspaper, fridge, laptop, pickup, address };
}

const bearer = (user) => `Bearer ${signToken(user)}`;

module.exports = { startDb, stopDb, resetDb, seedBasics, bearer, dayFromNow };
