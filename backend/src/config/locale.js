// Country settings for Nepal. Country-specific behaviour (currency, phone
// numbers, postal codes, time zone) reads from here.
const TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kathmandu';
const UTC_OFFSET = process.env.APP_UTC_OFFSET || '+05:45';
const DIAL_CODE = '977';
const CURRENCY = 'NPR';
const CURRENCY_SYMBOL = 'रु';

// 10-digit mobiles: NTC 984/985/986/974/975/976, Ncell 980/981/982/970, SmartCell 961/962/988.
const MOBILE_RE = /^9[678]\d{8}$/;
const POSTAL_CODE_RE = /^\d{5}$/;
const PAN_VAT_RE = /^\d{9}$/;
const PROVINCES = ['Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim'];

// Nepal uses lakh/crore grouping, same as en-IN.
const money = (n, decimals = 0) =>
  `${CURRENCY_SYMBOL} ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const cleanPhone = (p) =>
  String(p || '')
    .replace(/[\s-]/g, '')
    .replace(/^\+?977(?=\d{10}$)/, '');

// International format for WhatsApp/SMS providers: 977XXXXXXXXXX.
const intlPhone = (p) => {
  const d = cleanPhone(p).replace(/\D/g, '');
  return d.length === 10 ? `${DIAL_CODE}${d}` : d;
};

const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
const hourLocal = () => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TIMEZONE }).format(new Date()));
const fmtDate = (d, opts = { day: 'numeric', month: 'short' }) => new Date(d).toLocaleDateString('en-GB', { timeZone: TIMEZONE, ...opts });

module.exports = {
  COUNTRY: 'Nepal',
  TIMEZONE,
  UTC_OFFSET,
  DIAL_CODE,
  CURRENCY,
  CURRENCY_SYMBOL,
  MOBILE_RE,
  POSTAL_CODE_RE,
  PAN_VAT_RE,
  PROVINCES,
  money,
  cleanPhone,
  intlPhone,
  todayLocal,
  hourLocal,
  fmtDate,
};
