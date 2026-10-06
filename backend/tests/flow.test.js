// Core business flows: auth (lockout, refresh, OTP, reset), booking -> door OTP
// -> weighing -> payout -> receipt, permissions, fraud controls, coupons, wallet,
// slots, and admin analytics.
const { startDb, stopDb, resetDb, seedBasics, bearer, dayFromNow } = require('./helpers');

const mockSentEmails = [];
jest.mock('../src/services/channels', () => {
  const actual = jest.requireActual('../src/services/channels');
  return {
    ...actual,
    sendEmail: jest.fn(async (msg) => {
      mockSentEmails.push(msg);
      return { mock: true };
    }),
  };
});

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Pickup = require('../src/models/Pickup');
const Payment = require('../src/models/Payment');
const { Coupon, WalletTransaction, Blocklist, ServiceArea, Withdrawal } = require('../src/models/platform');
const settings = require('../src/services/settingsService');

let w;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  mockSentEmails.length = 0;
  w = await seedBasics();
});

const as = (user) => ({ Authorization: bearer(user) });

async function book(user, body = {}) {
  return request(app)
    .post('/api/pickups')
    .set(as(user))
    .send({
      items: [{ itemId: String(w.copper._id), estimatedQuantity: 5 }],
      addressId: String(w.address._id),
      scheduledDate: dayFromNow(3),
      timeSlot: '11:00 AM - 1:00 PM',
      ...body,
    });
}

describe('auth', () => {
  it('registers with validation and rejects weak input', async () => {
    const bad = await request(app).post('/api/auth/register').send({ name: 'X', email: 'nope', phone: '123', password: 'short' });
    expect(bad.status).toBe(400);
    const ok = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Neha Jain', email: 'neha@test.dev', phone: '+977 98412 34567', password: 'longpassword', referralCode: (await User.findById(w.alice._id)).referralCode });
    expect(ok.status).toBe(201);
    const neha = await User.findOne({ email: 'neha@test.dev' });
    expect(neha.phone).toBe('9841234567');
    expect(String(neha.referredBy)).toBe(String(w.alice._id));
    expect(ok.headers['set-cookie'].join(';')).toMatch(/scrapmate_refresh/);
  });

  it('locks the account after 5 wrong passwords', async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await request(app).post('/api/auth/login').send({ email: 'alice@test.dev', password: 'wrong-pass' });
      expect(r.status).toBe(401);
    }
    const locked = await request(app).post('/api/auth/login').send({ email: 'alice@test.dev', password: 'secret12' });
    expect(locked.status).toBe(423);
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'alice@test.dev', password: 'secret12' }).expect(200);
    const first = await agent.post('/api/auth/refresh').expect(200);
    const oldCookie = first.request.cookies;
    expect(first.body.data.user.email).toBe('alice@test.dev');
    await agent.post('/api/auth/refresh').expect(200);
    expect(oldCookie).toBeDefined();
  });

  it('logs in with a phone OTP and creates the account on first use', async () => {
    const req1 = await request(app).post('/api/auth/otp/request').send({ phone: '9811122222' }).expect(200);
    expect(req1.body.data.isNewUser).toBe(true);
    const wrong = await request(app).post('/api/auth/otp/verify').send({ phone: '9811122222', code: '000000' });
    expect(wrong.status).toBe(400);
    const ok = await request(app).post('/api/auth/otp/verify').send({ phone: '9811122222', code: req1.body.data.devCode, name: 'Kiran' }).expect(201);
    expect(ok.body.data.user).toMatchObject({ name: 'Kiran', phone: '9811122222', phoneVerified: true, role: 'customer' });
  });

  it('resets a password with an emailed, single-use token', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'alice@test.dev' }).expect(200);
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@test.dev' });
    expect(unknown.body.message).toMatch(/If that email is registered/);
    expect(mockSentEmails).toHaveLength(1);
    const token = mockSentEmails[0].text.match(/reset-password\/([a-f\d]{64})/)[1];
    await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' }).expect(200);
    await request(app).post('/api/auth/reset-password').send({ token, password: 'another-pass1' }).expect(400);
    await request(app).post('/api/auth/login').send({ email: 'alice@test.dev', password: 'brand-new-pass' }).expect(200);
  });
});

describe('booking -> door OTP -> weighing -> payout', () => {
  it('runs end to end with server-side amounts, bonus, wallet payout and receipt', async () => {
    // Bob referred Alice; Alice's first completed pickup pays both.
    await User.updateOne({ _id: w.alice._id }, { referredBy: w.bob._id });

    const res = await book(w.alice);
    expect(res.status).toBe(201);
    const { pickupId, otp } = res.body.data.pickup;
    expect(otp).toMatch(/^\d{4}$/);
    expect(res.body.data.pickup.estimatedValueMin).toBe(5 * 480);

    // Auto-assigned to the collector who serves postal code 44600.
    let p = await Pickup.findOne({ pickupId });
    expect(p.status).toBe('ASSIGNED');
    expect(String(p.collector)).toBe(String(w.collector._id));

    // Customer sees the door code; another customer can't see the pickup at all.
    const mine = await request(app).get(`/api/pickups/${pickupId}`).set(as(w.alice)).expect(200);
    expect(mine.body.data.pickup.otp).toBe(otp);
    await request(app).get(`/api/pickups/${pickupId}`).set(as(w.bob)).expect(404);

    const c = as(w.collector);
    await request(app).put(`/api/collector/pickups/${pickupId}/status`).set(c).send({ status: 'COLLECTOR_ON_THE_WAY' }).expect(200);
    await request(app).put(`/api/collector/location`).set(c).send({ lat: 12.975, lng: 77.641 }).expect(200);
    const live = await request(app).get(`/api/pickups/${pickupId}`).set(as(w.alice));
    expect(live.body.data.pickup.live.etaMinutes).toBeGreaterThan(0);
    await request(app).put(`/api/collector/pickups/${pickupId}/status`).set(c).send({ status: 'ARRIVED' }).expect(200);

    // Weighing is locked until the door OTP is verified.
    const early = await request(app).put(`/api/collector/pickups/${pickupId}/weighing`).set(c).send({ weighedItems: [{ itemName: 'Copper', actualWeight: 4 }] });
    expect(early.status).toBe(400);
    await request(app).post(`/api/collector/pickups/${pickupId}/verify-otp`).set(c).send({ otp: otp === '0000' ? '1111' : '0000' }).expect(400);
    await request(app).post(`/api/collector/pickups/${pickupId}/verify-otp`).set(c).send({ otp }).expect(200);

    const weighed = await request(app)
      .put(`/api/collector/pickups/${pickupId}/weighing`)
      .set(c)
      .send({ weighedItems: [{ itemName: 'Copper', actualWeight: 4, weighingPhoto: 'http://localhost:5000/uploads/weighing/x.jpg' }], rateChoice: 'max' });
    expect(weighed.status).toBe(200);
    // Rate comes from the admin price list (max = 550), not from the collector.
    expect(weighed.body.data.pickup.finalAmount).toBe(4 * 550);

    await request(app).put(`/api/pickups/${pickupId}/decision`).set(as(w.alice)).send({ decision: 'accepted' }).expect(200);
    const done = await request(app).put(`/api/collector/pickups/${pickupId}/complete`).set(c).send({ payoutMethod: 'wallet' });
    expect(done.status).toBe(200);

    p = await Pickup.findOne({ pickupId });
    expect(p.status).toBe('COMPLETED');
    // First-pickup bonus: 5% of 2200 = 110 (cap 200).
    expect(p.bonusAmount).toBe(110);
    expect(p.payout).toMatchObject({ method: 'wallet', status: 'paid' });
    const alice = await User.findById(w.alice._id);
    // payout + referral welcome reward
    expect(alice.walletBalance).toBe(2200 + 110 + 50);
    expect((await User.findById(w.bob._id)).walletBalance).toBe(50);
    expect(await Payment.countDocuments({ pickup: p._id, status: 'successful' })).toBe(1);
    expect(await WalletTransaction.countDocuments({ user: w.alice._id })).toBe(2);

    const pdf = await request(app).get(`/api/pickups/${pickupId}/receipt.pdf`).set(as(w.alice));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    const review = await request(app).post(`/api/pickups/${pickupId}/review`).set(as(w.alice)).send({ rating: 4 });
    expect(review.status).toBe(201);
    expect((await User.findById(w.collector._id)).collectorProfile.rating).toBe(4);

    const ics = await request(app).get(`/api/pickups/${pickupId}/calendar.ics`).set(as(w.alice));
    expect(ics.text).toContain('BEGIN:VEVENT');
  });

  it('blocks completion while the customer disputes the amount', async () => {
    const { pickupId, otp } = (await book(w.alice)).body.data.pickup;
    const c = as(w.collector);
    await request(app).put(`/api/collector/pickups/${pickupId}/status`).set(c).send({ status: 'COLLECTOR_ON_THE_WAY' });
    await request(app).put(`/api/collector/pickups/${pickupId}/status`).set(c).send({ status: 'ARRIVED' });
    await request(app).post(`/api/collector/pickups/${pickupId}/verify-otp`).set(c).send({ otp });
    await request(app).put(`/api/collector/pickups/${pickupId}/weighing`).set(c).send({ weighedItems: [{ itemName: 'Copper', actualWeight: 1 }] });
    const dispute = await request(app).put(`/api/pickups/${pickupId}/decision`).set(as(w.alice)).send({ decision: 'disputed', note: 'Scale looked off' });
    expect(dispute.body.data.ticketId).toMatch(/^TKT-/);
    await request(app).put(`/api/collector/pickups/${pickupId}/complete`).set(c).send({ payoutMethod: 'cash' }).expect(400);
  });

  it('applies the condition multiplier for graded e-waste', async () => {
    const res = await request(app)
      .post('/api/scrap/estimate')
      .send({ city: 'Kathmandu', items: [{ itemId: String(w.laptop._id), estimatedQuantity: 1, condition: 'damaged' }] });
    expect(res.body.data.min).toBe(Math.round(200 * 0.35));
    expect(res.body.data.max).toBe(Math.round(600 * 0.35));
  });

  it('books as a guest with phone OTP and signs them in', async () => {
    const otp = await request(app).post('/api/auth/otp/request').send({ phone: '9802223333', purpose: 'booking' });
    const res = await request(app)
      .post('/api/pickups/guest')
      .send({
        phone: '9802223333',
        code: otp.body.data.devCode,
        name: 'Guest Gupta',
        address: { areaId: String(w.kmc._id), ward: 31, street: 'Old Baneshwor', houseNumber: '7' },
        items: [{ itemId: String(w.newspaper._id), estimatedQuantity: 20 }],
        scheduledDate: dayFromNow(2),
        timeSlot: '2:00 PM - 4:00 PM',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ name: 'Guest Gupta', role: 'customer' });
    expect(res.headers['set-cookie'].join(';')).toMatch(/scrapmate_token/);
  });
});

describe('slots, serviceability and fraud controls', () => {
  it('stops booking when the municipality is switched off', async () => {
    await ServiceArea.updateOne({ _id: w.kmc._id }, { isActive: false });
    require('../src/services/cityService').clearGeoCache();
    const res = await book(w.alice);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/don't pick up/);
  });

  it('enforces per-slot capacity', async () => {
    const cfg = await settings.get('slots');
    await settings.set('slots', { ...cfg, slots: [{ label: '11:00 AM - 1:00 PM', capacity: 1 }] });
    expect((await book(w.alice)).status).toBe(201);
    const full = await book(w.bob, { addressId: String((await require('../src/models/Address').create({ ...w.address.toObject(), _id: undefined, user: w.bob._id }))._id) });
    expect(full.status).toBe(400);
    expect(full.body.message).toMatch(/Fully booked/);
  });

  it('rejects past dates and holidays', async () => {
    expect((await book(w.alice, { scheduledDate: dayFromNow(-1) })).status).toBe(400);
    const cfg = await settings.get('slots');
    await settings.set('slots', { ...cfg, holidays: [dayFromNow(3)] });
    const res = await book(w.alice);
    expect(res.body.message).toMatch(/Holiday/);
  });

  it('flags duplicates and caps active bookings', async () => {
    expect((await book(w.alice)).status).toBe(201);
    const dup = await book(w.alice);
    expect(dup.status).toBe(201);
    expect(dup.body.data.pickup.flags).toContain('duplicate');
    // Alice now has 3 active (seeded + 2); the 4th is refused.
    const fourth = await book(w.alice, { scheduledDate: dayFromNow(4) });
    expect(fourth.status).toBe(403);
  });

  it('blocks blocklisted phones from requesting OTPs', async () => {
    await Blocklist.create({ type: 'phone', value: '9803334444' });
    const res = await request(app).post('/api/auth/otp/request').send({ phone: '9803334444' });
    expect(res.status).toBe(403);
  });
});

describe('coupons and wallet', () => {
  it('validates coupon rules on the server', async () => {
    await Coupon.create({ code: 'BULK50', type: 'flat', value: 50, minWeightKg: 50 });
    const small = await request(app).post('/api/coupons/validate').set(as(w.alice)).send({ code: 'bulk50', weightKg: 10 });
    expect(small.status).toBe(400);
    const big = await request(app).post('/api/coupons/validate').set(as(w.alice)).send({ code: 'bulk50', weightKg: 60 });
    expect(big.body.data.bonus).toBe(50);
  });

  it('debits on withdrawal request and refunds on rejection', async () => {
    await User.updateOne({ _id: w.alice._id }, { walletBalance: 500 });
    const res = await request(app).post('/api/wallet/withdraw').set(as(w.alice)).send({ amount: 300, method: 'esewa', walletId: '9800000002' });
    expect(res.status).toBe(201);
    expect((await User.findById(w.alice._id)).walletBalance).toBe(200);
    const tooMuch = await request(app).post('/api/wallet/withdraw').set(as(w.alice)).send({ amount: 300, method: 'esewa', walletId: '9800000002' });
    expect(tooMuch.status).toBe(409);
    const wd = await Withdrawal.findOne({ user: w.alice._id });
    await request(app).post(`/api/admin/withdrawals/${wd._id}`).set(as(w.admin)).send({ action: 'reject' }).expect(200);
    expect((await User.findById(w.alice._id)).walletBalance).toBe(500);
  });
});

describe('admin permissions and analytics', () => {
  it('gives staff only their role permissions', async () => {
    const support = await User.create({ name: 'Sam', email: 'sam@test.dev', phone: '9800000009', password: 'secret12', role: 'staff', staffRole: 'support' });
    const finance = await User.create({ name: 'Fin', email: 'fin@test.dev', phone: '9800000010', password: 'secret12', role: 'staff', staffRole: 'finance' });
    await request(app).get('/api/admin/support/tickets').set(as(support)).expect(200);
    await request(app).post('/api/admin/prices/bulk').set(as(support)).send({ city: 'Kathmandu', percentChange: 5 }).expect(403);
    await request(app).get('/api/admin/analytics').set(as(finance)).expect(200);
    await request(app).get('/api/admin/settings').set(as(finance)).expect(403);
    await request(app).get('/api/admin/dashboard').set(as(w.collector)).expect(403);
    await request(app).get('/api/admin/dashboard').set(as(w.alice)).expect(403);
  });

  it('records price changes in history and the audit log, and exports CSV', async () => {
    await request(app)
      .put(`/api/admin/scrap-items/${w.copper._id}`)
      .set(as(w.admin))
      .send({ city: 'Kathmandu', minPrice: 500, maxPrice: 560 })
      .expect(200);
    const hist = await request(app).get('/api/admin/prices/history').set(as(w.admin));
    expect(hist.body.data.history[0]).toMatchObject({ newMinPrice: 500, newMaxPrice: 560, oldMinPrice: 480 });
    const log = await request(app).get('/api/admin/audit-log').set(as(w.admin));
    expect(log.body.data.entries.some((e) => e.action === 'price.update')).toBe(true);
    const csv = await request(app).get('/api/admin/pickups?format=csv').set(as(w.admin));
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toMatch(/^Pickup ID,Status/);
  });

  it('paginates and searches admin tables', async () => {
    const res = await request(app).get('/api/admin/users?limit=1&page=2&search=a').set(as(w.admin));
    expect(res.body.data.pagination).toMatchObject({ page: 2, limit: 1 });
    expect(res.body.data.users).toHaveLength(1);
  });

  it('computes analytics with margin and funnel', async () => {
    const res = await request(app).get('/api/admin/analytics?days=30').set(as(w.admin)).expect(200);
    expect(res.body.data.funnel.map((f) => f.step)).toEqual(['Visits', 'Estimates', 'Booking started', 'Bookings', 'Completed']);
    expect(res.body.data.totals).toHaveProperty('margin');
  });
});
