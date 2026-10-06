import { useEffect, useState } from 'react';
import { CheckCircle2, Crosshair, Loader2, MapPin, Search, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useDebounce } from '../hooks/useApi';
import { Button, Field, Input, Select, cx } from './ui';
import MapView from './MapView';
import { useI18n } from '../i18n/I18nContext';
import { POSTAL_CODE_LABEL, POSTAL_CODE_RE, PROVINCES } from '../utils/locale';

const EMPTY = { houseNumber: '', street: '', locality: '', city: '', state: '', pinCode: '', landmark: '', addressType: 'home', location: null };

// Address entry with search autocomplete (Google / OpenStreetMap via the API),
// "use my location", a draggable map pin, and a live serviceability check.
export default function AddressForm({ initial, onSubmit, onCancel, submitLabel = 'Save address', busy }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [service, setService] = useState(null);
  const [errors, setErrors] = useState({});
  const q = useDebounce(query, 400);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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

  useEffect(() => {
    if (!POSTAL_CODE_RE.test(form.pinCode)) {
      setService(null);
      return;
    }
    api
      .get('/public/serviceability', { params: { pin: form.pinCode, city: form.city } })
      .then((res) => setService(res.data.data))
      .catch(() => setService(null));
  }, [form.pinCode, form.city]);

  function applyGeo(g) {
    setForm((f) => ({
      ...f,
      houseNumber: g.houseNumber || f.houseNumber,
      street: g.street || f.street,
      locality: g.locality || f.locality,
      city: g.city || f.city,
      state: g.state || f.state,
      pinCode: g.pinCode || f.pinCode,
      location: g.lat != null ? { lat: g.lat, lng: g.lng } : f.location,
    }));
  }

  async function reverse(lat, lng) {
    set('location', { lat, lng });
    try {
      const res = await api.get('/public/geo/reverse', { params: { lat, lng } });
      if (res.data.data.result) applyGeo({ ...res.data.data.result, lat, lng });
    } catch {
      /* keep the pin even if lookup fails */
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error('Location is not available on this device');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await reverse(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error('Allow location access, or search for your address instead');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function validate() {
    const e = {};
    if (!form.houseNumber.trim()) e.houseNumber = 'Required';
    if (!form.street.trim()) e.street = 'Required';
    if (!form.locality.trim()) e.locality = 'Required';
    if (!form.city.trim()) e.city = 'Required';
    if (!form.state.trim()) e.state = 'Choose your province';
    if (!POSTAL_CODE_RE.test(form.pinCode)) e.pinCode = 'Enter a 5-digit postal code';
    setErrors(e);
    return !Object.keys(e).length;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (validate()) onSubmit({ ...form, location: form.location || undefined });
      }}
      className="space-y-4"
      noValidate
    >
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
                    applyGeo(r);
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
        height={200}
        markers={form.location ? [{ id: 'pin', lat: form.location.lat, lng: form.location.lng, color: 'rust', draggable: true, onDragEnd: (ll) => reverse(ll.lat, ll.lng) }] : []}
        onPick={(ll) => reverse(ll.lat, ll.lng)}
      />
      <p className="text-xs text-steel-500 -mt-2">Tap the map or drag the pin to your exact gate. It helps the collector find you.</p>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="House / flat no." required error={errors.houseNumber}>
          {(id) => <Input id={id} value={form.houseNumber} onChange={(e) => set('houseNumber', e.target.value)} invalid={!!errors.houseNumber} autoComplete="address-line1" />}
        </Field>
        <Field label="Street / building" required error={errors.street}>
          {(id) => <Input id={id} value={form.street} onChange={(e) => set('street', e.target.value)} invalid={!!errors.street} autoComplete="address-line2" />}
        </Field>
        <Field label="Locality / area" required error={errors.locality}>
          {(id) => <Input id={id} value={form.locality} onChange={(e) => set('locality', e.target.value)} invalid={!!errors.locality} />}
        </Field>
        <Field label="Landmark">{(id) => <Input id={id} value={form.landmark} onChange={(e) => set('landmark', e.target.value)} />}</Field>
        <Field label="City" required error={errors.city}>
          {(id) => <Input id={id} value={form.city} onChange={(e) => set('city', e.target.value)} invalid={!!errors.city} autoComplete="address-level2" />}
        </Field>
        <Field label="Province" required error={errors.state}>
          {(id) => (
            <Select id={id} value={form.state} onChange={(e) => set('state', e.target.value)} invalid={!!errors.state} autoComplete="address-level1">
              <option value="">Select province</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={POSTAL_CODE_LABEL} required error={errors.pinCode}>
          {(id) => (
            <Input id={id} value={form.pinCode} inputMode="numeric" maxLength={5} onChange={(e) => set('pinCode', e.target.value.replace(/\D/g, ''))} invalid={!!errors.pinCode} autoComplete="postal-code" />
          )}
        </Field>
        <Field label="Address type">
          {(id) => (
            <Select id={id} value={form.addressType} onChange={(e) => set('addressType', e.target.value)}>
              <option value="home">Home</option>
              <option value="work">Work / shop</option>
              <option value="other">Other</option>
            </Select>
          )}
        </Field>
      </div>

      {service && (
        <div className={cx('flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm', service.serviceable ? 'bg-patina-50 text-patina-700' : 'bg-danger-50 text-danger-700')} role="status">
          {service.serviceable ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
          <span>
            {service.serviceable
              ? `Great, we pick up here${service.area?.minPickupWeightKg ? ` (minimum ${service.area.minPickupWeightKg} kg)` : ''}.`
              : `${service.reason} You can still save the address; we're expanding fast.`}
          </span>
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
