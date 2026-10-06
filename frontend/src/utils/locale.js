// Country conventions for Nepal (formats, phone and postal rules, labels).
// Business data (cities, municipalities, wards, postal codes per area, prices,
// payment options, limits) is NOT here: it comes from the API via ConfigContext.
export const COUNTRY = 'Nepal';
export const DIAL_CODE = '977';
export const TIMEZONE = 'Asia/Kathmandu';
export const CURRENCY = 'NPR';
export const CURRENCY_SYMBOL = 'Rs.';
// Nepal uses the same lakh/crore digit grouping as en-IN (1,23,456).
export const NUMBER_LOCALE = 'en-IN';
export const DATE_LOCALE = 'en-GB';
// Only used for maps before any city is configured.
export const COUNTRY_CENTER = [28.3949, 84.124];

export const AREA_TYPES = [
  { value: 'metropolitan', label: 'Metropolitan city' },
  { value: 'sub_metropolitan', label: 'Sub-metropolitan city' },
  { value: 'municipality', label: 'Municipality' },
  { value: 'rural_municipality', label: 'Rural municipality' },
];
export const areaTypeLabel = (t) => AREA_TYPES.find((x) => x.value === t)?.label || '';

// 10-digit mobile numbers: NTC 984/985/986/974/975/976, Ncell 980/981/982/970,
// SmartCell 961/962/988.
export const MOBILE_RE = /^9[678]\d{8}$/;
export const MOBILE_PLACEHOLDER = '98XXXXXXXX';
export const POSTAL_CODE_RE = /^\d{5}$/;
export const POSTAL_CODE_LABEL = 'Postal code';
export const TAX_ID_LABEL = 'PAN/VAT no.';
export const TAX_ID_RE = /^\d{9}$/;

// Strip spaces, dashes and a leading +977 / 977.
export const cleanPhone = (p) =>
  String(p || '')
    .replace(/[\s-]/g, '')
    .replace(/^\+?977(?=\d{10}$)/, '');

export const isMobile = (p) => MOBILE_RE.test(cleanPhone(p));

// Labels for every payout method the backend supports. Which ones are switched
// on comes from Settings > Payments (useConfig().payoutMethods / withdrawalMethods).
export const PAYOUT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'esewa', label: 'eSewa' },
  { value: 'khalti', label: 'Khalti' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'wallet', label: 'ScrapMate wallet' },
];
export const payoutLabel = (m) => PAYOUT_METHODS.find((x) => x.value === m)?.label || String(m || '').replace('_', ' ');
