const ENV_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');
const ENV_MESSAGE = import.meta.env.VITE_WHATSAPP_MESSAGE || 'Hi SafaKabad, I need help with scrap pickup';

const PICKUP_ID_RE = /SM-\d{4}-\d{6}/i;

export function pickupIdFromPath(pathname) {
  const m = pathname.match(PICKUP_ID_RE);
  return m ? m[0].toUpperCase() : null;
}

// Frontend env wins; falls back to the number the backend reports.
export function whatsappNumber(config) {
  return ENV_NUMBER || config?.whatsappNumber || '';
}

export function buildWhatsAppText({ user, pickupId, extra } = {}) {
  const firstLine = user ? `Hi SafaKabad, this is ${user.name}.` : 'Hi SafaKabad,';
  let body;
  if (pickupId) body = `I need help with pickup ${pickupId}.`;
  else body = ENV_MESSAGE.replace(/^hi safakabad,?\s*/i, '');
  const text = user || pickupId ? `${firstLine} ${body}` : ENV_MESSAGE;
  return extra ? `${text}\n\n${extra}` : text;
}

export function buildWhatsAppLink(number, text) {
  const base = number ? `https://wa.me/${number}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}
