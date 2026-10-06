// Helpers for admin screens that work with cities (price zones) and service
// areas (municipalities). Everything comes from the admin API, which includes
// inactive cities/areas (the public config only lists active ones).
import { Check } from 'lucide-react';
import useApi from '../../../hooks/useApi';
import { areaTypeLabel } from '../../../utils/locale';
import { Field, Select, cx } from '../../../components/ui';

// All cities, default first then by sort order (as returned by the API).
export function useAdminCities() {
  const res = useApi('/admin/cities');
  const cities = res.data?.cities || [];
  const defaultCity = cities.find((c) => c.isDefault)?.name || cities[0]?.name || '';
  return { ...res, cities, defaultCity };
}

// Municipalities of one city (skips the request until a city is chosen).
export function useCityAreas(city) {
  const res = useApi('/admin/service-areas', { params: { city }, enabled: Boolean(city) });
  return { ...res, areas: city ? res.data?.areas || [] : [] };
}

export const cityLabel = (c) => `${c.name}${c.isActive === false ? ' (inactive)' : ''}`;

// "All 32 wards" or "Wards 1–5, 8".
export function wardsLabel(area) {
  const served = [...(area?.servedWards || [])].sort((a, b) => a - b);
  if (!served.length || served.length >= area.wards) return `All ${area?.wards || 0} wards`;
  const parts = [];
  let start = served[0];
  let prev = served[0];
  for (const w of [...served.slice(1), null]) {
    if (w === prev + 1) {
      prev = w;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = w;
    prev = w;
  }
  return `Ward${served.length === 1 ? '' : 's'} ${parts.join(', ')}`;
}

export function CitySelect({ cities, value, onChange, label = 'City', allLabel, className, error, required, disabled }) {
  return (
    <Field label={label} className={className} error={error} required={required}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-invalid={error ? true : undefined}>
          {allLabel !== undefined ? <option value="">{allLabel}</option> : !value && <option value="">Choose a city</option>}
          {value && !cities.some((c) => c.name === value) && <option value={value}>{value}</option>}
          {cities.map((c) => (
            <option key={c._id} value={c.name}>
              {cityLabel(c)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

// Checkbox list of a city's municipalities with "select all".
export function AreaMultiSelect({ areas, value = [], onChange, loading, emptyText = 'No municipalities in this city yet.', legend = 'Service areas' }) {
  const ids = areas.map((a) => String(a._id));
  const selected = value.map(String).filter((v) => ids.includes(v));
  const all = ids.length > 0 && selected.length === ids.length;
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <fieldset>
      <div className="flex items-center justify-between gap-2 mb-2">
        <legend className="label !mb-0">{legend}</legend>
        {ids.length > 0 && (
          <button type="button" className="text-xs font-medium text-rust-700 hover:underline" onClick={() => onChange(all ? [] : ids)}>
            {all ? 'Clear all' : 'Select all'}
          </button>
        )}
      </div>
      {loading && !areas.length ? (
        <p className="text-sm text-steel-500">Loading municipalities…</p>
      ) : !areas.length ? (
        <p className="text-sm text-steel-500">{emptyText}</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
          {areas.map((a) => {
            const id = String(a._id);
            const on = selected.includes(id);
            return (
              <label
                key={id}
                className={cx(
                  'flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors',
                  on ? 'border-rust-500 bg-rust-50' : 'border-steel-200 hover:border-steel-400'
                )}
              >
                <input type="checkbox" className="accent-rust-600 mt-0.5" checked={on} onChange={() => toggle(id)} />
                <span className="min-w-0">
                  <span className="block font-medium text-steel-900">
                    {a.name}
                    {a.isActive === false && <span className="text-xs font-normal text-steel-500"> (inactive)</span>}
                  </span>
                  <span className="block text-xs text-steel-500">{[areaTypeLabel(a.type), wardsLabel(a)].filter(Boolean).join(' · ')}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      {ids.length > 0 && (
        <p className="text-xs text-steel-500 mt-2 flex items-center gap-1">
          <Check className="w-3.5 h-3.5" aria-hidden /> {selected.length} of {ids.length} selected
        </p>
      )}
    </fieldset>
  );
}
