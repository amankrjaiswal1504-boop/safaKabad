import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Crosshair, Info, Loader2, MapPin, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useDebounce } from '../hooks/useApi';
import { Button, EmptyState, Field, Input, Select, cx } from './ui';
import MapView from './MapView';
import { useI18n } from '../i18n/I18nContext';
import { useConfig } from '../context/ConfigContext';
import { POSTAL_CODE_LABEL, POSTAL_CODE_RE } from '../utils/locale';

const EMPTY = { city: '', areaId: '', ward: '', street: '', houseNumber: '', landmark: '', pinCode: '', addressType: 'home', location: null };

const wardServed = (area, ward) => !area?.servedWards?.length || area.servedWards.includes(Number(ward));
const norm = (s) => String(s || '').toLowerCase();

function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Best municipality for a geocoded place: one whose name appears in the place
// label (nearest if several), else the nearest one within ~6 km.
function matchArea(areas, place) {
  const label = norm([place.label, place.locality, place.city, place.street].join(' '));
  const at = place.lat != null ? { lat: place.lat, lng: place.lng } : null;
  const byDistance = (list) => [...list].sort((x, y) => distanceKm(at, x.center) - distanceKm(at, y.center));
  const named = areas.filter((a) => label.includes(norm(a.name)) || label.includes(norm(a.name.split(/[\s-]/)[0])));
  if (named.length) return at ? byDistance(named)[0] : named[0];
  if (!at) return null;
  const [nearest] = byDistance(areas.filter((a) => a.center));
  return nearest && distanceKm(at, nearest.center) <= 6 ? nearest : null;
}

function Chip({ active, onClick, children, small }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx(
        'rounded-full border font-medium transition-colors',
        small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        active ? 'bg-rust-600 border-rust-600 text-white shadow-sm' : 'bg-rust-50/60 border-steel-200 text-steel-800 hover:border-rust-500'
      )}
    >
      {children}
    </button>
  );
}

// Nepali address entry: city -> municipality -> ward come from the service areas
// set up by the admin, so customers can only pick places we serve. District,
// province and postal code are filled in from the municipality. A map pin (search,
// "use my location" or tap) helps the collector find the exact gate.
export default function AddressForm({ initial, onSubmit, onCancel, submitLabel = 'Save address', busy }) {
  const { t, lang } = useI18n();
  const { cities, cityList, city: browsingCity, defaultCity, areasFor, areaById, serviceAreas, mapCenter, loading } = useConfig();

  const [form, setForm] = useState(() => {
    const start = { ...EMPTY, ...(initial || {}) };
    const area = initial?.area ? areaById(initial.area) : null;
    return {
      ...start,
      areaId: area ? String(area._id) : '',
      city: area?.city || initial?.city || browsingCity || defaultCity || '',
      ward: initial?.ward ? String(initial.ward) : '',
    };
  });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState({});
  const [showMap, setShowMap] = useState(Boolean(initial?.location));
  const q = useDebounce(query, 400);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const areas = useMemo(() => areasFor(form.city), [areasFor, form.city]);
  const area = form.areaId ? areaById(form.areaId) : null;
  const savedAreaGone = Boolean(initial?.area) && !areaById(initial.area);
  const nameOf = (x) => (lang === 'ne' && x?.nameNe) || x?.name || '';

  // If config finishes loading after mount, fill in the city.
  useEffect(() => {
    if (!form.city && (browsingCity || defaultCity)) set('city', browsingCity || defaultCity);
  }, [browsingCity, defaultCity, form.city]);

  // Keep the postal code valid for the chosen municipality.
  useEffect(() => {
    if (!area) return;
    if (area.pinCodes?.length && !area.pinCodes.includes(form.pinCode)) set('pinCode', area.pinCodes[0]);
  }, [area, form.pinCode]);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    api
      .get('/public/geo/search', { params: { q } })
      .then((res) => setResults(res.data.data.results))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [q]);

  function chooseArea(a) {
    setForm((f) => ({
      ...f,
      city: a.city,
      areaId: String(a._id),
      ward: f.areaId === String(a._id) ? f.ward : '',
      pinCode: a.pinCodes?.[0] || f.pinCode,
    }));
  }

  // Apply a search result / reverse-geocoded point.
  function applyPlace(place) {
    const location = place.lat != null ? { lat: place.lat, lng: place.lng } : form.location;
    const match = matchArea(serviceAreas, place);
    setForm((f) => ({ ...f, location, street: f.street || place.street || place.locality || '' }));
    if (match) chooseArea(match);
    else toast(t('address.outsideAreas'), { icon: 'ℹ️' });
  }

  async function reverse(lat, lng) {
    set('location', { lat, lng });
    try {
      const res = await api.get('/public/geo/reverse', { params: { lat, lng } });
      applyPlace({ ...(res.data.data.result || {}), lat, lng });
    } catch {
      applyPlace({ lat, lng });
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error(t('address.noGeo'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await reverse(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error(t('address.geoDenied'));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function validate() {
    const e = {};
    if (!form.city) e.city = t('address.chooseCity');
    if (!area) e.areaId = t('address.chooseArea');
    if (!form.ward) e.ward = t('address.chooseWard');
    if (form.street.trim().length < 2) e.street = t('address.enterTole');
    if (area && !area.pinCodes?.length && !POSTAL_CODE_RE.test(form.pinCode)) e.pinCode = t('address.enterPostal');
    setErrors(e);
    return !Object.keys(e).length;
  }

  function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      // Sent to the API:
      areaId: String(area._id),
      ward: Number(form.ward),
      street: form.street.trim(),
      houseNumber: form.houseNumber.trim() || undefined,
      landmark: form.landmark.trim() || undefined,
      pinCode: form.pinCode || undefined,
      addressType: form.addressType,
      location: form.location || undefined,
      // For display before the address is saved (guest booking):
      municipality: area.name,
      locality: `${area.name}-${form.ward}`,
      city: area.city,
      district: area.district,
      state: area.state,
      area: area._id,
      serviceable: true,
    });
  }

  if (!loading && !cities.length) {
    return <EmptyState icon={MapPin} title={t('address.notOpenTitle')} description={t('address.notOpenText')} />;
  }

  const showCityPicker = cityList.length > 1;
  const pin = form.location || (area?.center ? { lat: area.center.lat, lng: area.center.lng } : null);

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {savedAreaGone && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 text-amber-700 px-3 py-2.5 text-sm" role="status">
          <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {t('address.areaGone')}
        </p>
      )}

      {/* Where: city -> municipality chips, then ward */}
      <div className="space-y-4">
        {showCityPicker && (
          <div>
            <div className="label">
              {t('address.city')} <span className="text-rust-600">*</span>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('address.city')}>
              {cityList.map((c) => (
                <Chip key={c.name} active={form.city === c.name} onClick={() => setForm((f) => ({ ...f, city: c.name, areaId: '', ward: '' }))}>
                  {nameOf(c)}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="label">
            {t('address.municipality')} <span className="text-rust-600">*</span>
          </div>
          {areas.length ? (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('address.municipality')}>
              {areas.map((a) => (
                <Chip key={a._id} active={form.areaId === String(a._id)} onClick={() => chooseArea(a)}>
                  {nameOf(a).replace(/ Metropolitan City$/, ' Metro')}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-sm text-steel-500">{t('address.noAreas')}</p>
          )}
          {errors.areaId && (
            <p className="text-danger-600 text-xs mt-1.5" role="alert">
              {errors.areaId}
            </p>
          )}
        </div>
        {area && (
          <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 items-end">
            <Field label={t('address.ward')} required error={errors.ward}>
              {(id) => (
                <Select id={id} value={form.ward} onChange={(e) => set('ward', e.target.value)} invalid={!!errors.ward}>
                  <option value="">{t('address.selectWard')}</option>
                  {Array.from({ length: area.wards }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w} disabled={!wardServed(area, w)}>
                      {t('address.wardN', { n: w })}
                      {wardServed(area, w) ? '' : ` · ${t('address.comingSoon')}`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-patina-700 pb-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> {t('address.weServe', { area: nameOf(area) })}
              {area.minPickupWeightKg > 0 && <span className="text-steel-500">· min {area.minPickupWeightKg} kg</span>}
            </p>
          </div>
        )}
      </div>

      <Field label={t('address.tole')} required error={errors.street}>
        {(id) => <Input id={id} value={form.street} onChange={(e) => set('street', e.target.value)} invalid={!!errors.street} placeholder={t('address.tolePh')} autoComplete="address-line1" />}
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('address.house')}>
          {(id) => <Input id={id} value={form.houseNumber} onChange={(e) => set('houseNumber', e.target.value)} placeholder={t('address.housePh')} autoComplete="address-line2" />}
        </Field>
        <Field label={t('address.landmark')}>
          {(id) => <Input id={id} value={form.landmark} onChange={(e) => set('landmark', e.target.value)} placeholder={t('address.landmarkHint')} />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={POSTAL_CODE_LABEL} error={errors.pinCode}>
          {(id) =>
            area?.pinCodes?.length > 1 ? (
              <Select id={id} value={form.pinCode} onChange={(e) => set('pinCode', e.target.value)}>
                {area.pinCodes.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            ) : area?.pinCodes?.length === 1 ? (
              <Input id={id} value={area.pinCodes[0]} readOnly className="bg-steel-50 tabular" />
            ) : (
              <Input id={id} value={form.pinCode} inputMode="numeric" maxLength={5} disabled={!area} onChange={(e) => set('pinCode', e.target.value.replace(/\D/g, ''))} invalid={!!errors.pinCode} autoComplete="postal-code" />
            )
          }
        </Field>
        <div>
          <div className="label">{t('address.type')}</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('address.type')}>
            {['home', 'work', 'other'].map((v) => (
              <Chip key={v} active={form.addressType === v} onClick={() => set('addressType', v)} small>
                {t(`address.${v}`)}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {!showMap ? (
        <button type="button" onClick={() => setShowMap(true)} className="inline-flex items-center gap-2 text-sm font-semibold text-rust-600 hover:text-rust-700">
          <MapPin className="w-4 h-4" aria-hidden /> {t('address.pinTitle')}
        </button>
      ) : (
      <div className="space-y-2">
        <div className="text-sm font-semibold text-steel-900">{t('address.pinTitle')}</div>
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-400" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('book.searchAddress')} className="pl-9" aria-label={t('book.searchAddress')} />
              {searching && <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-steel-400" aria-hidden />}
            </div>
            <Button variant="outline" icon={locating ? Loader2 : Crosshair} onClick={useMyLocation} disabled={locating} className="shrink-0" aria-label={t('book.useLocation')}>
              <span className="hidden sm:inline">{t('book.useLocation')}</span>
            </Button>
          </div>
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-xl border border-steel-100 bg-surface shadow-lift max-h-64 overflow-y-auto" role="listbox">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-steel-50 flex gap-2"
                    onClick={() => {
                      applyPlace(r);
                      setResults([]);
                      setQuery('');
                    }}
                  >
                    <MapPin className="w-4 h-4 text-steel-400 mt-0.5 shrink-0" aria-hidden />
                    <span className="line-clamp-2">{r.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <MapView
          key={`${form.areaId}-${Boolean(form.location)}`}
          height={220}
          center={pin ? [pin.lat, pin.lng] : mapCenter(form.city)}
          zoom={pin ? 15 : 12}
          fit={false}
          markers={pin ? [{ id: 'pin', lat: pin.lat, lng: pin.lng, color: 'rust', draggable: true, onDragEnd: (ll) => reverse(ll.lat, ll.lng) }] : []}
          onPick={(ll) => reverse(ll.lat, ll.lng)}
        />
        <p className="text-xs text-steel-500">{t('address.pinHint')}</p>
      </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
