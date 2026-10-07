import { CURRENCY_SYMBOL, DATE_LOCALE, NUMBER_LOCALE, TIMEZONE } from './locale';

// Nepali rupees, e.g. "रु 1,23,456". (Name kept short and generic for callers.)
export const rupees = (n, { decimals = 0 } = {}) =>
  `${CURRENCY_SYMBOL} ${Number(n || 0).toLocaleString(NUMBER_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export const compact = (n) => {
  const v = Number(n || 0);
  if (v >= 1e7) return `${(v / 1e7).toFixed(1).replace(/\.0$/, '')} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return v.toLocaleString(NUMBER_LOCALE);
};

export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  d ? new Date(d).toLocaleDateString(DATE_LOCALE, { timeZone: TIMEZONE, ...opts }) : '—';

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString(DATE_LOCALE, { timeZone: TIMEZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export const fmtDay = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString(DATE_LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

export const timeAgo = (d) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(d, { day: 'numeric', month: 'short' });
};

export const STATUS_STEPS = ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING', 'COMPLETED'];

export const STATUS_LABEL = {
  BOOKED: 'Booked',
  ASSIGNED: 'Collector assigned',
  COLLECTOR_ON_THE_WAY: 'On the way',
  ARRIVED: 'Arrived',
  WEIGHING: 'Weighing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const STATUS_TONE = {
  BOOKED: 'steel',
  ASSIGNED: 'blue',
  COLLECTOR_ON_THE_WAY: 'amber',
  ARRIVED: 'amber',
  WEIGHING: 'rust',
  COMPLETED: 'patina',
  CANCELLED: 'danger',
};

export const unitLabel = (u) => ({ kg: 'kg', piece: 'pc', unit: 'unit' })[u] || u;

// Today's date (YYYY-MM-DD) in Nepal time.
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());

export const addressLine = (a) =>
  a ? [a.houseNumber, a.street, a.locality, a.city].filter(Boolean).join(', ') + (a.pinCode ? ` – ${a.pinCode}` : '') : '';

export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
