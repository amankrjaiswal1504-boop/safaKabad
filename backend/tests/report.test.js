// Nightly daily-pickup report: settings, contents, once-a-day sending.
jest.mock('../src/services/channels', () => {
  const actual = jest.requireActual('../src/services/channels');
  return { ...actual, sendEmail: jest.fn(async () => ({ sent: true })) };
});

const { startDb, stopDb, resetDb, seedBasics, bearer, dayFromNow } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const Pickup = require('../src/models/Pickup');
const settings = require('../src/services/settingsService');
const { sendEmail } = require('../src/services/channels');
const reports = require('../src/services/reportService');

let w;
beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  sendEmail.mockClear();
  w = await seedBasics();
});

async function pickupOn(day, extra = {}) {
  return Pickup.create({
    pickupId: `SM-2026-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
    customer: w.alice._id,
    items: [{ item: w.copper._id, itemName: 'Copper', unit: 'kg', estimatedQuantity: 5 }],
    address: w.address._id,
    addressSnapshot: { ...w.address.toObject(), locality: 'Kathmandu-10' },
    area: w.kmc._id,
    city: 'Kathmandu',
    scheduledDate: new Date(`${day}T00:00:00.000Z`),
    timeSlot: '9:00 AM - 11:00 AM',
    contactPhone: '9800000002',
    estimatedValueMin: 4000,
    estimatedValueMax: 4500,
    ...extra,
  });
}

describe('report settings', () => {
  const put = (value) => request(app).put('/api/admin/settings/reports').set('Authorization', bearer(w.admin)).send({ value });

  it('saves two emails and validates them', async () => {
    const ok = await put({ dailyEnabled: true, sendHour: 20, primaryEmail: 'Ops@Example.com ', secondaryEmail: 'owner@example.com', copySecondary: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.value).toMatchObject({ primaryEmail: 'ops@example.com', secondaryEmail: 'owner@example.com', copySecondary: true, sendHour: 20 });

    expect((await put({ dailyEnabled: true, primaryEmail: 'not-an-email' })).status).toBe(400);
    expect((await put({ dailyEnabled: true, primaryEmail: '' })).status).toBe(400);
    expect((await put({ dailyEnabled: true, primaryEmail: 'a@b.co', secondaryEmail: 'a@b.co' })).status).toBe(400);
    expect((await put({ dailyEnabled: true, primaryEmail: 'a@b.co', sendHour: 25 })).status).toBe(400);
  });

  it('only admins with full access can send a test', async () => {
    const res = await request(app).post('/api/admin/reports/daily/send').set('Authorization', bearer(w.alice));
    expect(res.status).toBe(403);
  });
});

describe('daily report', () => {
  it('summarises today and lists tomorrow', async () => {
    const today = dayFromNow(0);
    await pickupOn(today, { status: 'COMPLETED', finalAmount: 4200, bonusAmount: 100, collector: w.collector._id, items: [{ item: w.copper._id, itemName: 'Copper', unit: 'kg', estimatedQuantity: 5, actualWeight: 4.8 }] });
    await pickupOn(today, { status: 'CANCELLED' });
    await pickupOn(today, { status: 'ASSIGNED' });
    await pickupOn(dayFromNow(1));

    const r = await reports.buildDailyReport(today);
    expect(r.stats).toMatchObject({ scheduled: 3, completed: 1, cancelled: 1, open: 1, kg: 4.8, paid: 4300, tomorrow: 1 });

    const mail = reports.renderDailyReport(r);
    expect(mail.subject).toMatch(/1\/3 completed/);
    expect(mail.html).toContain('Kathmandu-10');
    expect(mail.html).toContain('रु 4,300');
    expect(mail.attachments[0].filename).toBe(`pickups-${today}.csv`);
    expect(mail.attachments[0].content.split('\n')).toHaveLength(4); // header + 3 rows
  });

  it('sends to the primary email, copies the secondary only when asked', async () => {
    await settings.set('reports', { dailyEnabled: true, sendHour: 20, primaryEmail: 'ops@example.com', secondaryEmail: 'owner@example.com', copySecondary: false });
    const res = await request(app).post('/api/admin/reports/daily/send').set('Authorization', bearer(w.admin));
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: 'ops@example.com', cc: undefined });

    await settings.set('reports', { dailyEnabled: true, sendHour: 20, primaryEmail: 'ops@example.com', secondaryEmail: 'owner@example.com', copySecondary: true });
    await request(app).post('/api/admin/reports/daily/send').set('Authorization', bearer(w.admin));
    expect(sendEmail.mock.calls[1][0]).toMatchObject({ to: 'ops@example.com', cc: 'owner@example.com' });
  });

  it('the scheduled run sends once per day, after the set hour', async () => {
    await settings.set('reports', { dailyEnabled: true, sendHour: 0, primaryEmail: 'ops@example.com' });
    expect(await reports.runDailyReport()).toBe(true);
    expect(await reports.runDailyReport()).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(await reports.lastSentDay()).toBe(dayFromNow(0));
  });

  it('does nothing when switched off', async () => {
    await settings.set('reports', { dailyEnabled: false, sendHour: 0, primaryEmail: 'ops@example.com' });
    expect(await reports.runDailyReport()).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
