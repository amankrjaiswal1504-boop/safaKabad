// Nightly "daily pickups" email for admins. Settings live under the `reports`
// key (Admin > Site settings > Daily report): the report goes to the primary
// email, and optionally a copy to the secondary email.
const Pickup = require('../models/Pickup');
const { Setting } = require('../models/platform');
const settings = require('./settingsService');
const { sendEmail } = require('./channels');
const { money, todayLocal, hourLocal, UTC_OFFSET, TIMEZONE } = require('../config/locale');
const logger = require('../utils/logger');

const STATE_KEY = 'reports.lastDailySent'; // internal, not admin-editable
const OPEN = ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING'];
const STATUS_LABEL = {
  BOOKED: 'Booked',
  ASSIGNED: 'Assigned',
  COLLECTOR_ON_THE_WAY: 'On the way',
  ARRIVED: 'Arrived',
  WEIGHING: 'Weighing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
const STATUS_COLOR = { COMPLETED: '#0f6247', CANCELLED: '#be2e2a' };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const csvCell = (s) => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayLabel = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
// scheduledDate is stored as the local date at 00:00 UTC.
const scheduledOn = (ymd) => ({ $gte: new Date(`${ymd}T00:00:00Z`), $lte: new Date(`${ymd}T23:59:59.999Z`) });
// A local calendar day as real instants (for createdAt).
const localDay = (ymd) => ({ $gte: new Date(`${ymd}T00:00:00${UTC_OFFSET}`), $lt: new Date(`${addDays(ymd, 1)}T00:00:00${UTC_OFFSET}`) });

const placeOf = (p) => p.addressSnapshot?.locality || p.addressSnapshot?.municipality || p.area?.name || p.city || '';
const kgOf = (p) => (p.items || []).reduce((s, i) => s + (i.unit === 'kg' ? Number(i.actualWeight ?? 0) : 0), 0);
const amountOf = (p) => (p.status === 'COMPLETED' ? Number(p.finalAmount || 0) + Number(p.bonusAmount || 0) : null);
const amountText = (p) => {
  if (p.type === 'donation') return 'Donation';
  const a = amountOf(p);
  return a != null ? money(a) : `≈ ${money(p.estimatedValueMin)}–${money(p.estimatedValueMax).replace(/^\S+\s/, '')}`;
};

function load(filter) {
  return Pickup.find(filter)
    .populate('customer', 'name phone')
    .populate('collector', 'name phone')
    .populate('area', 'name')
    .sort({ timeSlot: 1, createdAt: 1 })
    .lean();
}

async function buildDailyReport(day = todayLocal()) {
  const tomorrow = addDays(day, 1);
  const [today, next, newBookings] = await Promise.all([
    load({ scheduledDate: scheduledOn(day) }),
    load({ scheduledDate: scheduledOn(tomorrow), status: { $ne: 'CANCELLED' } }),
    Pickup.countDocuments({ createdAt: localDay(day) }),
  ]);
  const done = today.filter((p) => p.status === 'COMPLETED');
  const stats = {
    scheduled: today.length,
    completed: done.length,
    cancelled: today.filter((p) => p.status === 'CANCELLED').length,
    open: today.filter((p) => OPEN.includes(p.status)).length,
    kg: Math.round(done.reduce((s, p) => s + kgOf(p), 0) * 10) / 10,
    paid: done.reduce((s, p) => s + (p.type === 'donation' ? 0 : amountOf(p) || 0), 0),
    newBookings,
    tomorrow: next.length,
  };
  return { day, tomorrow, today, next, stats };
}

function rowsHtml(list, withAmount = true) {
  if (!list.length) return '<tr><td colspan="7" style="padding:14px;color:#67706c;text-align:center">No pickups</td></tr>';
  return list
    .map(
      (p, i) => `<tr style="background:${i % 2 ? '#fbfaf7' : '#ffffff'}">
  <td style="padding:8px 10px;font-weight:600;white-space:nowrap">${esc(p.pickupId)}</td>
  <td style="padding:8px 10px;white-space:nowrap">${esc(p.timeSlot)}</td>
  <td style="padding:8px 10px">${esc(p.customer?.name || '—')}<br><span style="color:#67706c;font-size:12px">${esc(p.contactPhone || p.customer?.phone || '')}</span></td>
  <td style="padding:8px 10px">${esc(placeOf(p))}</td>
  <td style="padding:8px 10px">${esc(p.collector?.name || 'Unassigned')}</td>
  <td style="padding:8px 10px;white-space:nowrap;font-weight:600;color:${STATUS_COLOR[p.status] || '#a0701a'}">${STATUS_LABEL[p.status] || p.status}</td>
  ${withAmount ? `<td style="padding:8px 10px;text-align:right;white-space:nowrap">${esc(amountText(p))}</td>` : ''}
</tr>`
    )
    .join('');
}

function tableHtml(title, list, withAmount = true) {
  const head = ['Pickup', 'Slot', 'Customer', 'Area', 'Collector', 'Status', ...(withAmount ? ['Amount'] : [])];
  return `<h3 style="margin:28px 0 10px;font-size:16px;color:#171f1c">${esc(title)}</h3>
<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e1ded5;border-radius:10px;overflow:hidden">
<thead><tr style="background:#eef5f0">${head.map((h) => `<th align="${h === 'Amount' ? 'right' : 'left'}" style="padding:9px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#3c4441">${h}</th>`).join('')}</tr></thead>
<tbody>${rowsHtml(list, withAmount)}</tbody></table>`;
}

function renderDailyReport(r) {
  const s = r.stats;
  const kpis = [
    ['Scheduled', s.scheduled],
    ['Completed', s.completed],
    ['Still open', s.open],
    ['Cancelled', s.cancelled],
    ['Collected', `${s.kg} kg`],
    ['Paid out', money(s.paid)],
    ['New bookings', s.newBookings],
    ['Tomorrow', s.tomorrow],
  ];
  const subject = `Daily pickups · ${dayLabel(r.day)} · ${s.completed}/${s.scheduled} completed · ${money(s.paid)} paid`;

  const html = `<!doctype html><html><body style="margin:0;background:#f8f7f3;font-family:Segoe UI,Arial,'Noto Sans Devanagari',sans-serif;color:#171f1c">
<div style="max-width:760px;margin:0 auto;padding:24px 16px">
  <div style="background:linear-gradient(135deg,#11523c,#0c2f25);background-color:#0f3d2e;color:#fff;border-radius:16px;padding:22px 24px">
    <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#e9cf8e">Daily pickup report</div>
    <div style="font-size:24px;font-weight:700;margin-top:6px">${esc(dayLabel(r.day))}</div>
    <div style="font-size:13px;color:#c7d2cd;margin-top:4px">Sent automatically at the end of the day (${esc(TIMEZONE)}).</div>
  </div>
  <table role="presentation" cellspacing="8" cellpadding="0" style="width:100%;margin-top:8px"><tr>
  ${kpis
    .map(
      ([label, value], i) => `${i === 4 ? '</tr><tr>' : ''}<td style="background:#fff;border:1px solid #e1ded5;border-radius:12px;padding:12px 14px;width:25%">
    <div style="font-size:20px;font-weight:700;color:${label === 'Paid out' ? '#0f6247' : '#171f1c'}">${esc(value)}</div>
    <div style="font-size:12px;color:#67706c;margin-top:2px">${label}</div></td>`
    )
    .join('')}
  </tr></table>
  ${tableHtml(`Today's pickups (${r.today.length})`, r.today)}
  ${tableHtml(`Tomorrow · ${dayLabel(r.tomorrow)} (${r.next.length})`, r.next, false)}
  <p style="font-size:12px;color:#67706c;margin-top:24px">A CSV of today's pickups is attached. Change who receives this report in Admin › Site settings › Daily report.</p>
</div></body></html>`;

  const line = (p) => `- ${p.pickupId} | ${p.timeSlot} | ${p.customer?.name || '-'} | ${placeOf(p)} | ${p.collector?.name || 'Unassigned'} | ${STATUS_LABEL[p.status] || p.status} | ${amountText(p)}`;
  const text = [
    `Daily pickup report - ${dayLabel(r.day)}`,
    '',
    ...kpis.map(([l, v]) => `${l}: ${v}`),
    '',
    `Today's pickups (${r.today.length}):`,
    ...(r.today.length ? r.today.map(line) : ['- none']),
    '',
    `Tomorrow (${r.next.length}):`,
    ...(r.next.length ? r.next.map(line) : ['- none']),
  ].join('\n');

  const csv = [
    ['Pickup ID', 'Date', 'Slot', 'Customer', 'Phone', 'Area', 'City', 'Collector', 'Status', 'Type', 'Weight (kg)', 'Amount (NPR)', 'Estimate min', 'Estimate max'],
    ...r.today.map((p) => [p.pickupId, r.day, p.timeSlot, p.customer?.name, p.contactPhone || p.customer?.phone, placeOf(p), p.city, p.collector?.name || '', STATUS_LABEL[p.status] || p.status, p.type, kgOf(p) || '', amountOf(p) ?? '', p.estimatedValueMin, p.estimatedValueMax]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');

  // Leading byte-order mark so Excel opens the UTF-8 CSV (रु, Nepali names) correctly.
  const BOM = String.fromCharCode(0xfeff);
  return { subject, html, text, attachments: [{ filename: `pickups-${r.day}.csv`, content: BOM + csv, contentType: 'text/csv; charset=utf-8' }] };
}

// Sends the report for `day` to the configured recipients. Returns who got it.
async function sendDailyReport({ day = todayLocal(), cfg } = {}) {
  cfg = cfg || (await settings.get('reports'));
  if (!cfg?.primaryEmail) throw Object.assign(new Error('Add a primary email in Site settings › Daily report first'), { status: 400 });
  const report = await buildDailyReport(day);
  const mail = renderDailyReport(report);
  const cc = cfg.copySecondary && cfg.secondaryEmail ? cfg.secondaryEmail : undefined;
  const result = await sendEmail({ to: cfg.primaryEmail, cc, ...mail });
  return { to: cfg.primaryEmail, cc: cc || null, mock: Boolean(result?.mock), stats: report.stats };
}

// Called every minute by the job runner. Sends once per local day, at or after
// the configured hour. The atomic claim stops two server instances (or a
// restart) from sending twice.
async function runDailyReport() {
  const cfg = await settings.get('reports');
  if (!cfg?.dailyEnabled || !cfg.primaryEmail) return false;
  if (hourLocal() < Number(cfg.sendHour ?? 20)) return false;
  const day = todayLocal();
  try {
    const claimed = await Setting.findOneAndUpdate({ key: STATE_KEY, value: { $ne: day } }, { value: day }, { upsert: true, new: true });
    if (!claimed) return false;
  } catch (err) {
    if (err.code === 11000) return false; // already sent today
    throw err;
  }
  try {
    const out = await sendDailyReport({ day, cfg });
    logger.info({ to: out.to, cc: out.cc, stats: out.stats }, 'daily pickup report sent');
    return true;
  } catch (err) {
    // Release the claim so the next tick retries.
    await Setting.updateOne({ key: STATE_KEY, value: day }, { value: null }).catch(() => {});
    throw err;
  }
}

async function lastSentDay() {
  const doc = await Setting.findOne({ key: STATE_KEY }).lean();
  return doc?.value || null;
}

module.exports = { buildDailyReport, renderDailyReport, sendDailyReport, runDailyReport, lastSentDay };
