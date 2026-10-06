// Address search + reverse geocoding. Google Places/Geocoding when MAPS_API_KEY
// is set, otherwise OpenStreetMap Nominatim (free; requires a User-Agent and
// light usage, which a small cache helps with).
const logger = require('../utils/logger');

const UA = 'ScrapMate/1.0 (support@scrapmate.dev)';
const cache = new Map();
const TTL = 10 * 60 * 1000;

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

function fromNominatim(r) {
  const a = r.address || {};
  return {
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    houseNumber: a.house_number || '',
    street: a.road || a.pedestrian || '',
    locality: a.suburb || a.neighbourhood || a.quarter || a.village || '',
    city: a.city || a.town || a.city_district || a.county || '',
    state: (a.state || a.province || '').replace(/\s*Province$/i, ''),
    pinCode: (a.postcode || '').replace(/\s/g, ''),
  };
}

function fromGoogle(r) {
  const get = (type) => r.address_components?.find((c) => c.types.includes(type))?.long_name || '';
  return {
    label: r.formatted_address,
    lat: r.geometry?.location?.lat,
    lng: r.geometry?.location?.lng,
    houseNumber: get('street_number'),
    street: get('route'),
    locality: get('sublocality') || get('sublocality_level_1') || get('neighborhood'),
    city: get('locality') || get('administrative_area_level_2'),
    state: get('administrative_area_level_1').replace(/\s*Province$/i, ''),
    pinCode: get('postal_code'),
  };
}

async function search(q) {
  const query = String(q || '').trim().slice(0, 200);
  if (query.length < 3) return [];
  return cached(`s:${query.toLowerCase()}`, async () => {
    try {
      if (process.env.MAPS_API_KEY) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?region=np&components=country:NP&address=${encodeURIComponent(query)}&key=${process.env.MAPS_API_KEY}`;
        const data = await (await fetch(url)).json();
        return (data.results || []).slice(0, 5).map(fromGoogle);
      }
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=np&limit=5&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      return (await res.json()).map(fromNominatim);
    } catch (err) {
      logger.warn({ err: err.message }, 'geo search failed');
      return [];
    }
  });
}

async function reverse(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return cached(`r:${la.toFixed(4)},${ln.toFixed(4)}`, async () => {
    try {
      if (process.env.MAPS_API_KEY) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${la},${ln}&key=${process.env.MAPS_API_KEY}`;
        const data = await (await fetch(url)).json();
        return data.results?.[0] ? fromGoogle(data.results[0]) : null;
      }
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${la}&lon=${ln}`;
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      return fromNominatim(await res.json());
    } catch (err) {
      logger.warn({ err: err.message }, 'reverse geocode failed');
      return { label: '', lat: la, lng: ln };
    }
  });
}

module.exports = { search, reverse };
