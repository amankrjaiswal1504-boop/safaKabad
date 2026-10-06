// Cities, service areas (municipality + ward), prices per city and the settings
// that replaced hard-coded values. Everything the apps show about "where we
// operate" must come from these admin-managed records.
const { startDb, stopDb, resetDb, seedBasics, bearer, dayFromNow } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Address = require('../src/models/Address');
const ScrapPrice = require('../src/models/ScrapPrice');
const PriceHistory = require('../src/models/PriceHistory');
const { City, ServiceArea } = require('../src/models/platform');
const settings = require('../src/services/settingsService');

let w;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  w = await seedBasics();
});

const as = (user) => ({ Authorization: bearer(user) });
const addAddress = (user, body) => request(app).post('/api/addresses').set(as(user)).send(body);

describe('public config', () => {
  it('lists cities, the default city and municipalities from the database', async () => {
    const { body } = await request(app).get('/api/public/config').expect(200);
    expect(body.data.cities).toEqual(['Kathmandu', 'Lalitpur']);
    expect(body.data.defaultCity).toBe('Kathmandu');
    expect(body.data.cityList[0]).toMatchObject({ name: 'Kathmandu', slug: 'kathmandu', areaCount: 2 });
    const kirtipur = body.data.serviceAreas.find((a) => a.name === 'Kirtipur');
    expect(kirtipur).toMatchObject({ city: 'Kathmandu', wards: 10, servedWards: [1, 2, 3, 4, 5], pinCodes: ['44618'] });
    expect(body.data.provinces).toContain('Bagmati');
    expect(body.data.wallet).toMatchObject({ minWithdrawal: 50 });
    expect(body.data.payments.withdrawalMethods).toEqual(['esewa', 'khalti', 'bank_transfer']);
  });

  it('hides inactive cities and their areas, and never lists a city just because it has prices', async () => {
    await City.updateOne({ name: 'Lalitpur' }, { isActive: false });
    await ScrapPrice.create({ item: w.copper._id, city: 'Pokhara', minPrice: 1, maxPrice: 2 });
    require('../src/services/cityService').clearGeoCache();
    const { body } = await request(app).get('/api/public/config');
    expect(body.data.cities).toEqual(['Kathmandu']);
    expect(body.data.serviceAreas.map((a) => a.city)).not.toContain('Lalitpur');
    await request(app).get('/api/public/cities/lalitpur').expect(404);
  });

  it('serves rates for the default city and nothing for unknown cities', async () => {
    const def = await request(app).get('/api/scrap/rates');
    expect(def.body.data.city).toBe('Kathmandu');
    expect(def.body.data.rates.length).toBe(4);
    const unknown = await request(app).get('/api/scrap/rates?city=Pokhara');
    expect(unknown.body.data.rates).toEqual([]);
  });
});

describe('addresses by municipality and ward', () => {
  it('fills city, district, province, locality and postal code from the area', async () => {
    const res = await addAddress(w.bob, { areaId: String(w.kirtipur._id), ward: 3, street: 'Naya Bazar', pinCode: '99999' });
    expect(res.status).toBe(201);
    expect(res.body.data.address).toMatchObject({
      municipality: 'Kirtipur',
      city: 'Kathmandu',
      district: 'Kathmandu',
      state: 'Bagmati',
      locality: 'Kirtipur-3',
      pinCode: '44618', // not one of the area's codes -> the area's default
      serviceable: true,
    });
  });

  it('rejects wards that do not exist and flags wards we do not serve yet', async () => {
    const tooHigh = await addAddress(w.bob, { areaId: String(w.kirtipur._id), ward: 11, street: 'Panga' });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.message).toMatch(/between 1 and 10/);

    const unserved = await addAddress(w.bob, { areaId: String(w.kirtipur._id), ward: 8, street: 'Panga' });
    expect(unserved.status).toBe(201);
    expect(unserved.body.data.address).toMatchObject({ serviceable: false });
    const res = await request(app)
      .post('/api/pickups')
      .set(as(w.bob))
      .send({ items: [{ itemId: String(w.copper._id), estimatedQuantity: 5 }], addressId: unserved.body.data.address._id, scheduledDate: dayFromNow(3), timeSlot: '11:00 AM - 1:00 PM' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ward 8 of Kirtipur/);
  });

  it('checks serviceability by area and ward', async () => {
    const ok = await request(app).get(`/api/public/serviceability?area=${w.kirtipur._id}&ward=2`);
    expect(ok.body.data).toMatchObject({ serviceable: true, area: { name: 'Kirtipur', city: 'Kathmandu' } });
    const no = await request(app).get(`/api/public/serviceability?area=${w.kirtipur._id}&ward=9`);
    expect(no.body.data.serviceable).toBe(false);
  });
});

describe('prices belong to cities', () => {
  it("refuses to book items the customer's city doesn't buy", async () => {
    const lalitpurHome = await addAddress(w.bob, { areaId: String(w.lmc._id), ward: 3, street: 'Jhamsikhel' });
    const res = await request(app)
      .post('/api/pickups')
      .set(as(w.bob))
      .send({
        items: [{ itemId: String(w.copper._id), estimatedQuantity: 5 }, { itemId: String(w.newspaper._id), estimatedQuantity: 20 }],
        addressId: lalitpurHome.body.data.address._id,
        scheduledDate: dayFromNow(3),
        timeSlot: '11:00 AM - 1:00 PM',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/don't buy Newspaper in Lalitpur/);
  });

  it('estimates list unpriced items instead of counting them as Rs. 0', async () => {
    const res = await request(app)
      .post('/api/scrap/estimate')
      .send({ city: 'Lalitpur', items: [{ itemId: String(w.copper._id), estimatedQuantity: 1 }, { itemId: String(w.newspaper._id), estimatedQuantity: 10 }] });
    expect(res.body.data).toMatchObject({ city: 'Lalitpur', min: 470, max: 540, unpriced: ['Newspaper'] });
  });

  it('admin price grid shows gaps; prices for unknown cities are rejected; unpublish hides an item', async () => {
    const grid = await request(app).get('/api/admin/prices?city=lalitpur').set(as(w.admin)).expect(200);
    expect(grid.body.data).toMatchObject({ city: 'Lalitpur', priced: 1, total: 4 });
    expect(grid.body.data.items.find((i) => i.name === 'Newspaper').price).toBeNull();

    const unknown = await request(app)
      .post('/api/admin/prices/bulk')
      .set(as(w.admin))
      .send({ city: 'Pokhara', updates: [{ itemId: String(w.copper._id), minPrice: 1, maxPrice: 2 }] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toMatch(/not set up yet/);

    await request(app).delete(`/api/admin/prices/${w.copper._id}?city=Lalitpur`).set(as(w.admin)).expect(200);
    const rates = await request(app).get('/api/scrap/rates?city=Lalitpur');
    expect(rates.body.data.rates).toEqual([]);
  });

  it('copies a price list into another city with history, optionally overwriting', async () => {
    const res = await request(app).post('/api/admin/prices/copy-city').set(as(w.admin)).send({ fromCity: 'Kathmandu', toCity: 'Lalitpur', percentChange: 10 });
    expect(res.body.data).toMatchObject({ created: 3, updated: 0 });
    expect(await PriceHistory.countDocuments({ city: 'Lalitpur' })).toBe(3);
    const copper = await ScrapPrice.findOne({ city: 'Lalitpur', item: w.copper._id });
    expect(copper.minPrice).toBe(470); // existing price kept without overwrite
    const again = await request(app).post('/api/admin/prices/copy-city').set(as(w.admin)).send({ fromCity: 'Kathmandu', toCity: 'Lalitpur', overwrite: true });
    expect(again.body.data).toMatchObject({ created: 0, updated: 4 });
  });
});

describe('admin cities and areas', () => {
  it('renames a city everywhere it is referenced', async () => {
    const city = await City.findOne({ name: 'Lalitpur' });
    await addAddress(w.bob, { areaId: String(w.lmc._id), ward: 2, street: 'Pulchowk' });
    await User.updateOne({ _id: w.collector._id }, { 'collectorProfile.city': 'Lalitpur' });
    const res = await request(app).put(`/api/admin/cities/${city._id}`).set(as(w.admin)).send({ name: 'Patan' });
    expect(res.status).toBe(200);
    expect(res.body.data.city).toMatchObject({ name: 'Patan', slug: 'patan' });
    expect(await ScrapPrice.countDocuments({ city: 'Patan' })).toBe(1);
    expect(await ServiceArea.countDocuments({ city: 'Patan' })).toBe(1);
    expect(await Address.countDocuments({ city: 'Patan' })).toBe(1);
    expect((await User.findById(w.collector._id)).collectorProfile.city).toBe('Patan');
    expect((await request(app).get('/api/public/config')).body.data.cities).toContain('Patan');
  });

  it('guards the default city and deletes only unused cities', async () => {
    const ktm = await City.findOne({ name: 'Kathmandu' });
    const ltp = await City.findOne({ name: 'Lalitpur' });
    await request(app).put(`/api/admin/cities/${ktm._id}`).set(as(w.admin)).send({ isActive: false }).expect(400);
    await request(app).delete(`/api/admin/cities/${ktm._id}`).set(as(w.admin)).expect(400);

    // Making Lalitpur the default clears the old default.
    await request(app).put(`/api/admin/cities/${ltp._id}`).set(as(w.admin)).send({ isDefault: true }).expect(200);
    expect((await City.findById(ktm._id)).isDefault).toBe(false);
    expect((await request(app).get('/api/public/config')).body.data.defaultCity).toBe('Lalitpur');

    // Kathmandu has pickups and addresses -> must be deactivated, not deleted.
    const used = await request(app).delete(`/api/admin/cities/${ktm._id}`).set(as(w.admin));
    expect(used.status).toBe(409);

    const empty = await request(app).post('/api/admin/cities').set(as(w.admin)).send({ name: 'Bhaktapur', district: 'Bhaktapur', province: 'Bagmati' });
    expect(empty.status).toBe(201);
    await request(app).post('/api/admin/cities').set(as(w.admin)).send({ name: 'bhaktapur' }).expect(409);
    await request(app).delete(`/api/admin/cities/${empty.body.data.city._id}`).set(as(w.admin)).expect(200);
  });

  it('creates areas only in known cities, validates wards and protects areas in use', async () => {
    await request(app).post('/api/admin/service-areas').set(as(w.admin)).send({ name: 'Lekhnath', city: 'Pokhara', wards: 5 }).expect(400);
    await request(app).post('/api/admin/service-areas').set(as(w.admin)).send({ name: 'Tokha', city: 'Kathmandu', wards: 11, servedWards: [12] }).expect(400);
    const tokha = await request(app).post('/api/admin/service-areas').set(as(w.admin)).send({ name: 'Tokha', city: 'kathmandu', wards: 11, pinCodes: ['44608'] });
    expect(tokha.status).toBe(201);
    expect(tokha.body.data.area).toMatchObject({ city: 'Kathmandu', district: 'Kathmandu', state: 'Bagmati' });
    await request(app).post('/api/admin/service-areas').set(as(w.admin)).send({ name: 'tokha', city: 'Kathmandu', wards: 11 }).expect(409);

    // KMC has Alice's address and pickup.
    await request(app).delete(`/api/admin/service-areas/${w.kmc._id}`).set(as(w.admin)).expect(409);
    await request(app).delete(`/api/admin/service-areas/${tokha.body.data.area._id}`).set(as(w.admin)).expect(200);

    // Renaming an area updates saved addresses.
    await request(app).put(`/api/admin/service-areas/${w.kmc._id}`).set(as(w.admin)).send({ name: 'Kathmandu Metro' }).expect(200);
    expect(await Address.findById(w.address._id)).toMatchObject({ municipality: 'Kathmandu Metro', locality: 'Kathmandu Metro-10' });
  });

  it("only lets collectors cover municipalities in their own city", async () => {
    const bad = await request(app).put(`/api/admin/collectors/${w.collector._id}`).set(as(w.admin)).send({ serviceAreas: [String(w.lmc._id)] });
    expect(bad.status).toBe(400);
    const ok = await request(app).put(`/api/admin/collectors/${w.collector._id}`).set(as(w.admin)).send({ serviceAreas: [String(w.kmc._id), String(w.kirtipur._id)] });
    expect(ok.status).toBe(200);
    const moved = await request(app).put(`/api/admin/collectors/${w.collector._id}`).set(as(w.admin)).send({ city: 'Lalitpur', serviceAreas: [String(w.lmc._id)] });
    expect(moved.body.data.collector.collectorProfile).toMatchObject({ city: 'Lalitpur' });
  });
});

describe('settings that replaced hard-coded values', () => {
  it('enforces the admin-set withdrawal limits and methods', async () => {
    await User.updateOne({ _id: w.alice._id }, { walletBalance: 1000 });
    await settings.set('wallet', { minWithdrawal: 200, maxWithdrawal: 500 });
    const low = await request(app).post('/api/wallet/withdraw').set(as(w.alice)).send({ amount: 100, method: 'esewa', walletId: '9800000002' });
    expect(low.body.message).toMatch(/Minimum withdrawal is Rs. 200/);
    const high = await request(app).post('/api/wallet/withdraw').set(as(w.alice)).send({ amount: 600, method: 'esewa', walletId: '9800000002' });
    expect(high.body.message).toMatch(/Maximum withdrawal is Rs. 500/);
    await settings.set('payments', { payoutMethods: ['cash'], withdrawalMethods: ['khalti'] });
    const method = await request(app).post('/api/wallet/withdraw').set(as(w.alice)).send({ amount: 300, method: 'esewa', walletId: '9800000002' });
    expect(method.body.message).toMatch(/not available/);
    await expect(settings.set('wallet', { minWithdrawal: 900, maxWithdrawal: 100 })).rejects.toThrow(/not above the maximum/);
  });

  it('counts slot capacity per municipality', async () => {
    const cfg = await settings.get('slots');
    await settings.set('slots', { ...cfg, slots: [{ label: '11:00 AM - 1:00 PM', capacity: 1 }] });
    const pickup = (addressId, user) =>
      request(app)
        .post('/api/pickups')
        .set(as(user))
        .send({ items: [{ itemId: String(w.copper._id), estimatedQuantity: 5 }], addressId, scheduledDate: dayFromNow(4), timeSlot: '11:00 AM - 1:00 PM' });
    expect((await pickup(String(w.address._id), w.alice)).status).toBe(201);
    // Same slot, different municipality: still free.
    const kirtipurHome = await addAddress(w.bob, { areaId: String(w.kirtipur._id), ward: 2, street: 'Naya Bazar' });
    expect((await pickup(kirtipurHome.body.data.address._id, w.bob)).status).toBe(201);
    const avail = await request(app).get(`/api/public/slots?date=${dayFromNow(4)}&area=${w.kmc._id}`);
    expect(avail.body.data.slots[0]).toMatchObject({ remaining: 0, available: false });
  });
});
