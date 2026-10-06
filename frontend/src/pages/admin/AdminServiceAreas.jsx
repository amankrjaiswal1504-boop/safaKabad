import { useEffect, useMemo, useState } from 'react';
import { Building2, MapPin, MapPinned, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import api from '../../services/api';
import { useConfig } from '../../context/ConfigContext';
import { rupees } from '../../utils/format';
import { AREA_TYPES, POSTAL_CODE_RE, areaTypeLabel } from '../../utils/locale';
import MapView from '../../components/MapView';
import { Badge, Button, Card, DataTable, EmptyState, Field, IconButton, Input, PageHeader, Select, Toggle, cx } from '../../components/ui';
import { Async, Callout, ConfirmModal, FormSection, NumberInput, isBlank, useAction, Modal } from './_catalog/shared';
import { useAdminCities, useCityAreas, wardsLabel } from './_geo/shared';

const hasPoint = (c) => Number.isFinite(c?.lat) && Number.isFinite(c?.lng);
const round5 = (n) => Math.round(n * 1e5) / 1e5;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function AdminServiceAreas() {
  const res = useAdminCities();
  const { reloadConfig } = useConfig();
  const [selectedId, setSelectedId] = useState('');
  const [cityModal, setCityModal] = useState(null); // 'new' | city
  const [deletingCity, setDeletingCity] = useState(null);
  const { busy, run } = useAction();
  const cities = res.cities;
  const selected = cities.find((c) => c._id === selectedId) || null;

  // Pick the default city once the list loads (or after the selected one is deleted).
  useEffect(() => {
    if (cities.length && !cities.some((c) => c._id === selectedId)) setSelectedId((cities.find((c) => c.isDefault) || cities[0])._id);
  }, [cities, selectedId]);

  function changed() {
    res.reload();
    reloadConfig?.();
  }

  async function makeDefault(c) {
    const r = await run(`default-${c._id}`, () => api.put(`/admin/cities/${c._id}`, { isDefault: true }), { success: `${c.name} is now the default city` });
    if (r.ok) changed();
  }

  async function removeCity() {
    const c = deletingCity;
    const r = await run('delete-city', () => api.delete(`/admin/cities/${c._id}`), { success: `${c.name} deleted` });
    setDeletingCity(null);
    if (r.ok) changed();
  }

  return (
    <div>
      <PageHeader
        title="Cities & service areas"
        subtitle="Cities are price zones. Each city has municipalities (with wards and postal codes) where customers can book a pickup."
        actions={
          <Button icon={Plus} onClick={() => setCityModal('new')}>
            Add city
          </Button>
        }
      />
      <Async
        {...res}
        onRetry={res.reload}
        isEmpty={(d) => !d.cities.length}
        empty={
          <EmptyState
            icon={Building2}
            title="No cities yet"
            description="Add your first city to start. It becomes the default city; then add its municipalities and set its prices."
            action={
              <Button icon={Plus} onClick={() => setCityModal('new')}>
                Add city
              </Button>
            }
          />
        }
      >
        {() => (
          <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6 items-start">
            <nav aria-label="Cities" className="space-y-2">
              {cities.map((c) => {
                const on = c._id === selectedId;
                return (
                  <button
                    key={c._id}
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    onClick={() => setSelectedId(c._id)}
                    className={cx(
                      'w-full text-left rounded-xl border px-4 py-3 transition-colors bg-surface',
                      on ? 'border-rust-500 ring-1 ring-rust-500' : 'border-steel-100 hover:border-steel-300'
                    )}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-steel-900">{c.name}</span>
                      {c.nameNe && <span className="text-sm text-steel-500">{c.nameNe}</span>}
                      {c.isDefault && <Badge tone="rust">Default</Badge>}
                      {!c.isActive && <Badge tone="amber">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-steel-500 mt-1 tabular">
                      {c.activeAreaCount}/{c.areaCount} areas active · {c.pricedItems} priced · {plural(c.collectorCount, 'collector')}
                    </div>
                  </button>
                );
              })}
            </nav>
            {selected && (
              <CityDetail
                key={selected._id}
                city={selected}
                busy={busy}
                onEdit={() => setCityModal(selected)}
                onDelete={() => setDeletingCity(selected)}
                onMakeDefault={() => makeDefault(selected)}
                onAreasChanged={changed}
              />
            )}
          </div>
        )}
      </Async>

      {cityModal && (
        <CityForm
          city={cityModal === 'new' ? null : cityModal}
          isFirst={!cities.length}
          onClose={() => setCityModal(null)}
          onSaved={(saved) => {
            setCityModal(null);
            if (saved?._id) setSelectedId(saved._id);
            changed();
          }}
        />
      )}
      <ConfirmModal
        open={!!deletingCity}
        onClose={() => setDeletingCity(null)}
        title={`Delete ${deletingCity?.name || 'city'}?`}
        confirmLabel="Delete city"
        variant="danger"
        busy={busy === 'delete-city'}
        onConfirm={removeCity}
      >
        <p>
          This removes <strong className="text-steel-900">{deletingCity?.name}</strong> with its municipalities and price list. It is only allowed when no
          pickups, saved addresses or collectors use the city.
        </p>
        <p>To stop service but keep history, edit the city and switch it to inactive instead.</p>
      </ConfirmModal>
    </div>
  );
}

// ---------------- One city: summary + municipalities ----------------
function CityDetail({ city, busy, onEdit, onDelete, onMakeDefault, onAreasChanged }) {
  const res = useCityAreas(city.name);
  const [editing, setEditing] = useState(null); // 'new' | area
  const [deleting, setDeleting] = useState(null);
  const action = useAction();
  const areas = res.areas;
  const mapped = areas.filter((a) => hasPoint(a.center));

  function refresh() {
    res.reload();
    onAreasChanged();
  }

  async function toggle(a) {
    const r = await action.run(a._id, () => api.put(`/admin/service-areas/${a._id}`, { isActive: !a.isActive }), {
      success: a.isActive ? `${a.name} paused` : `${a.name} is taking bookings`,
    });
    if (r.ok) refresh();
  }

  async function remove() {
    const a = deleting;
    const r = await action.run('delete', () => api.delete(`/admin/service-areas/${a._id}`), { success: `${a.name} deleted` });
    setDeleting(null);
    if (r.ok) refresh();
  }

  const columns = [
    {
      key: 'name',
      header: 'Municipality',
      render: (a) => (
        <div className="min-w-[160px]">
          <div className="font-medium text-steel-900">
            {a.name}
            {a.nameNe && <span className="font-normal text-steel-500"> · {a.nameNe}</span>}
          </div>
          <div className="text-xs text-steel-500">{[areaTypeLabel(a.type), a.district].filter(Boolean).join(' · ')}</div>
        </div>
      ),
    },
    { key: 'wards', header: 'Wards', render: (a) => <span className="text-steel-700 whitespace-nowrap">{wardsLabel(a)}</span> },
    {
      key: 'pinCodes',
      header: 'Postal codes',
      render: (a) =>
        a.pinCodes?.length ? (
          <div className="flex flex-wrap gap-1 max-w-[200px]" title={a.pinCodes.join(', ')}>
            {a.pinCodes.slice(0, 3).map((p, i) => (
              <Badge key={p} tone={i === 0 ? 'rust' : 'steel'} className="tabular">
                {p}
                {i === 0 && <span className="sr-only"> (default)</span>}
              </Badge>
            ))}
            {a.pinCodes.length > 3 && (
              <Badge tone="steel">
                +{a.pinCodes.length - 3}
                <span className="sr-only"> more: {a.pinCodes.slice(3).join(', ')}</span>
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-steel-400">—</span>
        ),
    },
    {
      key: 'min',
      header: 'Minimum',
      render: (a) => (
        <span className="text-steel-700 whitespace-nowrap tabular">
          {a.minPickupWeightKg > 0 || a.minPickupValue > 0
            ? [a.minPickupWeightKg > 0 && `${a.minPickupWeightKg} kg`, a.minPickupValue > 0 && rupees(a.minPickupValue)].filter(Boolean).join(' / ')
            : 'None'}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Usage',
      render: (a) => (
        <span className="text-xs text-steel-600 whitespace-nowrap">
          {a.addressCount || 0} address{a.addressCount === 1 ? '' : 'es'}
          <br />
          {plural(a.collectorCount || 0, 'collector')}
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Bookings',
      render: (a) => <Toggle checked={a.isActive} disabled={action.busy === a._id} onChange={() => toggle(a)} label={a.isActive ? 'On' : 'Paused'} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (a) => (
        <div className="flex justify-end gap-1">
          <IconButton label={`Edit ${a.name}`} icon={Pencil} onClick={() => setEditing(a)} />
          <IconButton label={`Delete ${a.name}`} icon={Trash2} onClick={() => setDeleting(a)} className="hover:!text-danger-600" />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 min-w-0">
      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <span className={cx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', city.isActive ? 'bg-rust-100 text-rust-700' : 'bg-steel-100 text-steel-500')}>
            <Building2 className="w-5 h-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-head text-lg font-semibold text-steel-900">{city.name}</h2>
              {city.nameNe && <span className="text-steel-500">{city.nameNe}</span>}
              {city.isDefault && <Badge tone="rust">Default</Badge>}
              {!city.isActive && <Badge tone="amber">Inactive</Badge>}
            </div>
            <p className="text-sm text-steel-500">
              {[city.district && `${city.district} district`, city.province].filter(Boolean).join(' · ') || 'District and province not set'}
              {!hasPoint(city.center) && ' · no map centre'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!city.isDefault && (
              <Button variant="outline" size="sm" icon={Star} onClick={onMakeDefault} loading={busy === `default-${city._id}`} disabled={!city.isActive} title={city.isActive ? undefined : 'Activate the city first'}>
                Make default
              </Button>
            )}
            <Button variant="outline" size="sm" icon={Pencil} onClick={onEdit}>
              Edit city
            </Button>
            {!city.isDefault && <IconButton label={`Delete ${city.name}`} icon={Trash2} onClick={onDelete} className="hover:!text-danger-600" />}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-steel-100 text-center">
          {[
            ['Areas active', `${city.activeAreaCount}/${city.areaCount}`],
            ['Items priced', city.pricedItems],
            ['Collectors', city.collectorCount],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-steel-500">{k}</dt>
              <dd className="font-head text-xl font-semibold text-steel-900 tabular">{v}</dd>
            </div>
          ))}
        </dl>
        {!city.isActive && (
          <Callout tone="amber" className="mt-4">
            This city is inactive: customers can't see it or book pickups here.
          </Callout>
        )}
      </Card>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h3 className="font-head text-lg font-semibold text-steel-900">Municipalities</h3>
            <p className="text-sm text-steel-500">Where customers in {city.name} can book. The first postal code of each is its default.</p>
          </div>
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add municipality
          </Button>
        </div>
        <Async
          {...res}
          onRetry={res.reload}
          isEmpty={(d) => !d.areas.length}
          empty={
            <EmptyState
              icon={MapPinned}
              title={`No municipalities in ${city.name} yet`}
              description="Add the municipalities you serve, with their wards and postal codes. Customers can only book where an active municipality covers their ward."
              action={
                <Button icon={Plus} onClick={() => setEditing('new')}>
                  Add municipality
                </Button>
              }
            />
          }
        >
          {() => (
            <div className="space-y-4">
              {mapped.length > 0 && (
                <MapView
                  height={240}
                  markers={mapped.map((a) => ({
                    id: a._id,
                    lat: a.center.lat,
                    lng: a.center.lng,
                    color: a.isActive ? 'rust' : 'steel',
                    popup: `${a.name} · ${wardsLabel(a)}`,
                  }))}
                />
              )}
              <DataTable dense columns={columns} rows={areas} loading={res.loading} />
            </div>
          )}
        </Async>
      </div>

      {editing && (
        <AreaForm
          city={city}
          area={editing === 'new' ? null : editing}
          nextSort={areas.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} title={`Delete ${deleting?.name || 'municipality'}?`} confirmLabel="Delete" variant="danger" busy={action.busy === 'delete'} onConfirm={remove}>
        <p>
          Customers in <strong className="text-steel-900">{deleting?.name}</strong> will no longer be able to book, and collectors lose it from their areas.
          Deleting is refused if saved addresses or pickups use it.
        </p>
        <p>To stop bookings but keep history, pause it with the Bookings switch instead.</p>
      </ConfirmModal>
    </div>
  );
}

// ---------------- Map centre picker ----------------
function CenterPicker({ lat, lng, onChange, fallback, error }) {
  const has = !isBlank(lat) && !isBlank(lng);
  return (
    <FormSection title="Map centre" description="Click the map to place the centre, or type coordinates. Used for maps and dispatch.">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Latitude" error={error}>
          {(id) => <NumberInput id={id} step="0.0001" value={lat} onChange={(v) => onChange({ lat: v, lng })} invalid={!!error} />}
        </Field>
        <Field label="Longitude">
          {(id) => <NumberInput id={id} step="0.0001" value={lng} onChange={(v) => onChange({ lat, lng: v })} invalid={!!error} />}
        </Field>
      </div>
      <MapView
        center={has ? [Number(lat), Number(lng)] : fallback}
        fit={false}
        height={240}
        markers={has ? [{ id: 'center', lat: Number(lat), lng: Number(lng), color: 'rust', label: '' }] : []}
        onPick={(p) => onChange({ lat: round5(p.lat), lng: round5(p.lng) })}
      />
      {has && (
        <Button variant="ghost" size="sm" onClick={() => onChange({ lat: '', lng: '' })}>
          Clear centre
        </Button>
      )}
    </FormSection>
  );
}

function centerError(lat, lng) {
  if (isBlank(lat) !== isBlank(lng)) return 'Enter both latitude and longitude, or neither';
  if (!isBlank(lat) && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) return 'Latitude must be within ±90 and longitude within ±180';
  return null;
}
const centerBody = (lat, lng) => (isBlank(lat) || isBlank(lng) ? null : { lat: Number(lat), lng: Number(lng) });

function ProvinceSelect({ id, value, onChange }) {
  const { provinces } = useConfig();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not set</option>
      {value && !provinces.includes(value) && <option value={value}>{value}</option>}
      {provinces.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </Select>
  );
}

// ---------------- City form ----------------
function CityForm({ city, isFirst, onClose, onSaved }) {
  const { mapCenter } = useConfig();
  const [f, setF] = useState(() => ({
    name: city?.name || '',
    nameNe: city?.nameNe || '',
    district: city?.district || '',
    province: city?.province || '',
    lat: city?.center?.lat ?? '',
    lng: city?.center?.lng ?? '',
    sortOrder: city?.sortOrder ?? 0,
    isActive: city?.isActive ?? true,
  }));
  const [errors, setErrors] = useState({});
  const { busy, run } = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const renamed = city && f.name.trim() && f.name.trim() !== city.name;

  async function save(e) {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Enter the city name';
    if (isBlank(f.sortOrder) || f.sortOrder < 0 || !Number.isInteger(Number(f.sortOrder))) er.sortOrder = 'Whole number, 0 or more';
    const ce = centerError(f.lat, f.lng);
    if (ce) er.center = ce;
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {
      name: f.name.trim(),
      nameNe: f.nameNe.trim(),
      district: f.district.trim(),
      province: f.province,
      center: centerBody(f.lat, f.lng),
      sortOrder: Number(f.sortOrder),
      isActive: f.isActive,
    };
    if (city?.isDefault) delete body.isActive;
    const r = await run('save', () => (city ? api.put(`/admin/cities/${city._id}`, body) : api.post('/admin/cities', body)), {
      success: city ? `${body.name} saved` : `${body.name} added`,
    });
    if (r.ok) onSaved(r.out.data.data?.city);
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={city ? `Edit ${city.name}` : 'Add city'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="city-form" loading={busy === 'save'}>
            {city ? 'Save changes' : 'Add city'}
          </Button>
        </>
      }
    >
      <form id="city-form" onSubmit={save} className="space-y-6" noValidate>
        {isFirst && <Callout tone="rust">This is your first city, so it becomes the default city customers see.</Callout>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" required error={errors.name}>
            {(id) => <Input id={id} value={f.name} onChange={(e) => set('name')(e.target.value)} invalid={!!errors.name} maxLength={60} />}
          </Field>
          <Field label="Name in Nepali">
            {(id) => <Input id={id} value={f.nameNe} onChange={(e) => set('nameNe')(e.target.value)} maxLength={60} lang="ne" />}
          </Field>
          <Field label="District">
            {(id) => <Input id={id} value={f.district} onChange={(e) => set('district')(e.target.value)} maxLength={60} />}
          </Field>
          <Field label="Province">{(id) => <ProvinceSelect id={id} value={f.province} onChange={set('province')} />}</Field>
          <Field label="Sort order" error={errors.sortOrder} hint="Lower numbers are listed first">
            {(id) => <NumberInput id={id} min={0} step={1} value={f.sortOrder} onChange={set('sortOrder')} invalid={!!errors.sortOrder} />}
          </Field>
        </div>
        {renamed && (
          <Callout tone="amber">
            Renaming <strong>{city.name}</strong> to <strong>{f.name.trim()}</strong> also updates its prices, municipalities, saved addresses, pickups and
            collectors.
          </Callout>
        )}
        <CenterPicker
          lat={f.lat}
          lng={f.lng}
          error={errors.center}
          fallback={mapCenter()}
          onChange={({ lat, lng }) => setF((x) => ({ ...x, lat, lng }))}
        />
        <Toggle
          checked={f.isActive}
          onChange={set('isActive')}
          disabled={city?.isDefault}
          label="Active"
          description={city?.isDefault ? 'The default city is always active. Make another city the default to deactivate this one.' : 'Inactive cities are hidden from customers.'}
        />
      </form>
    </Modal>
  );
}

// ---------------- Postal codes chip input ----------------
function PostalCodes({ value, onChange, error }) {
  const [text, setText] = useState('');
  const [local, setLocal] = useState('');
  function add() {
    const codes = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!codes.length) return;
    const bad = codes.filter((c) => !POSTAL_CODE_RE.test(c));
    if (bad.length) return setLocal(`${bad.join(', ')}: postal codes are 5 digits`);
    const next = [...new Set([...value, ...codes])];
    if (next.length > 50) return setLocal('At most 50 postal codes');
    setLocal('');
    setText('');
    onChange(next);
  }
  return (
    <Field label="Postal codes" error={local || error} hint="The first one is the default for this municipality.">
      {(id) => (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              id={id}
              inputMode="numeric"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="5-digit postal code"
              className="tabular max-w-[220px]"
              invalid={!!(local || error)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={add} disabled={!text.trim()}>
              Add
            </Button>
          </div>
          {value.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Postal codes">
              {value.map((p, i) => (
                <li key={p} className={cx('inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-0.5 text-sm tabular', i === 0 ? 'border-rust-500 bg-rust-50 text-rust-700' : 'border-steel-200 text-steel-700')}>
                  {p}
                  {i === 0 ? (
                    <span className="text-xs">(default)</span>
                  ) : (
                    <button type="button" aria-label={`Make ${p} the default postal code`} title="Make default" className="p-0.5 rounded hover:bg-steel-100" onClick={() => onChange([p, ...value.filter((x) => x !== p)])}>
                      <Star className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  )}
                  <button type="button" aria-label={`Remove ${p}`} className="p-0.5 rounded hover:bg-steel-100" onClick={() => onChange(value.filter((x) => x !== p))}>
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}

// ---------------- Ward picker ----------------
function WardPicker({ wards, served, onChange }) {
  const n = Number(wards);
  const valid = Number.isInteger(n) && n >= 1 && n <= 40;
  const all = !served.length;
  if (!valid) return <p className="text-sm text-steel-500">Enter the number of wards to choose which ones you serve.</p>;
  const toggle = (w) => {
    const next = served.includes(w) ? served.filter((x) => x !== w) : [...served, w].sort((a, b) => a - b);
    onChange(next.length >= n ? [] : next);
  };
  return (
    <div className="space-y-3">
      <Toggle
        checked={all}
        onChange={(on) => onChange(on ? [] : Array.from({ length: n }, (_, i) => i + 1))}
        label="All wards"
        description={all ? `Every ward (1–${n}) is served.` : 'Only the wards selected below are served.'}
      />
      {!all && (
        <fieldset>
          <legend className="sr-only">Served wards</legend>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: n }, (_, i) => i + 1).map((w) => {
              const on = served.includes(w);
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={on}
                  aria-label={`Ward ${w}`}
                  onClick={() => toggle(w)}
                  className={cx(
                    'w-10 h-9 rounded-lg border text-sm tabular transition-colors',
                    on ? 'bg-rust-50 border-rust-500 text-rust-700 font-medium' : 'bg-surface border-steel-200 text-steel-600 hover:border-steel-400'
                  )}
                >
                  {w}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-steel-500 mt-2">
            {served.length} of {n} wards selected
          </p>
        </fieldset>
      )}
    </div>
  );
}

// ---------------- Area form ----------------
function AreaForm({ city, area, nextSort, onClose, onSaved }) {
  const { mapCenter } = useConfig();
  const [f, setF] = useState(() => ({
    name: area?.name || '',
    nameNe: area?.nameNe || '',
    type: area?.type || 'municipality',
    district: area ? area.district || '' : city.district || '',
    state: area ? area.state || '' : city.province || '',
    wards: area?.wards ?? '',
    servedWards: area?.servedWards?.length && area.servedWards.length < area.wards ? [...area.servedWards] : [],
    pinCodes: area?.pinCodes || [],
    minPickupWeightKg: area?.minPickupWeightKg ?? 0,
    minPickupValue: area?.minPickupValue ?? 0,
    lat: area?.center?.lat ?? '',
    lng: area?.center?.lng ?? '',
    isActive: area?.isActive ?? true,
    sortOrder: area?.sortOrder ?? nextSort ?? 0,
  }));
  const [errors, setErrors] = useState({});
  const { busy, run } = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const fallback = useMemo(() => (hasPoint(city.center) ? [city.center.lat, city.center.lng] : mapCenter(city.name)), [city, mapCenter]);

  // Dropping the ward count drops wards that no longer exist.
  function setWards(v) {
    setF((x) => {
      const n = Number(v);
      const served = Number.isInteger(n) && n > 0 ? x.servedWards.filter((w) => w <= n) : x.servedWards;
      return { ...x, wards: v, servedWards: served.length >= n ? [] : served };
    });
  }

  async function save(e) {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Enter the municipality name';
    const w = Number(f.wards);
    if (isBlank(f.wards) || !Number.isInteger(w) || w < 1 || w > 40) er.wards = 'Between 1 and 40';
    if (isBlank(f.minPickupWeightKg) || f.minPickupWeightKg < 0) er.minPickupWeightKg = 'Enter 0 or more';
    if (isBlank(f.minPickupValue) || f.minPickupValue < 0) er.minPickupValue = 'Enter 0 or more';
    if (isBlank(f.sortOrder) || f.sortOrder < 0 || !Number.isInteger(Number(f.sortOrder))) er.sortOrder = 'Whole number, 0 or more';
    const ce = centerError(f.lat, f.lng);
    if (ce) er.center = ce;
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {
      name: f.name.trim(),
      nameNe: f.nameNe.trim(),
      city: city.name,
      type: f.type,
      district: f.district.trim(),
      state: f.state,
      wards: w,
      servedWards: f.servedWards.filter((x) => x <= w),
      pinCodes: f.pinCodes,
      minPickupWeightKg: Number(f.minPickupWeightKg),
      minPickupValue: Number(f.minPickupValue),
      center: centerBody(f.lat, f.lng),
      isActive: f.isActive,
      sortOrder: Number(f.sortOrder),
    };
    const r = await run('save', () => (area ? api.put(`/admin/service-areas/${area._id}`, body) : api.post('/admin/service-areas', body)), {
      success: area ? `${body.name} saved` : `${body.name} added to ${city.name}`,
    });
    if (r.ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={area ? `Edit ${area.name}` : `Add municipality in ${city.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="area-form" loading={busy === 'save'}>
            {area ? 'Save changes' : 'Add municipality'}
          </Button>
        </>
      }
    >
      <form id="area-form" onSubmit={save} className="space-y-6" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" required error={errors.name}>
            {(id) => <Input id={id} value={f.name} onChange={(e) => set('name')(e.target.value)} invalid={!!errors.name} maxLength={80} />}
          </Field>
          <Field label="Name in Nepali">
            {(id) => <Input id={id} value={f.nameNe} onChange={(e) => set('nameNe')(e.target.value)} maxLength={80} lang="ne" />}
          </Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} value={f.type} onChange={(e) => set('type')(e.target.value)}>
                {AREA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Sort order" error={errors.sortOrder}>
            {(id) => <NumberInput id={id} min={0} step={1} value={f.sortOrder} onChange={set('sortOrder')} invalid={!!errors.sortOrder} />}
          </Field>
          <Field label="District" hint={city.district ? `City default: ${city.district}` : undefined}>
            {(id) => <Input id={id} value={f.district} onChange={(e) => set('district')(e.target.value)} maxLength={60} />}
          </Field>
          <Field label="Province" hint={city.province ? `City default: ${city.province}` : undefined}>
            {(id) => <ProvinceSelect id={id} value={f.state} onChange={set('state')} />}
          </Field>
        </div>
        {area && f.name.trim() && f.name.trim() !== area.name && (
          <Callout tone="amber">Renaming also updates the saved addresses in this municipality.</Callout>
        )}

        <FormSection title="Wards" description="Customers pick their ward when adding an address; only served wards can book.">
          <Field label="Number of wards" required error={errors.wards} className="max-w-[200px]">
            {(id) => <NumberInput id={id} min={1} max={40} step={1} value={f.wards} onChange={setWards} invalid={!!errors.wards} />}
          </Field>
          <WardPicker wards={f.wards} served={f.servedWards} onChange={set('servedWards')} />
        </FormSection>

        <PostalCodes value={f.pinCodes} onChange={set('pinCodes')} error={errors.pinCodes} />

        <FormSection title="Minimum order" description="Bookings below these are refused here. Use 0 for no minimum.">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min weight (kg)" error={errors.minPickupWeightKg}>
              {(id) => <NumberInput id={id} min={0} value={f.minPickupWeightKg} onChange={set('minPickupWeightKg')} invalid={!!errors.minPickupWeightKg} />}
            </Field>
            <Field label="Min value (Rs.)" error={errors.minPickupValue}>
              {(id) => <NumberInput id={id} min={0} value={f.minPickupValue} onChange={set('minPickupValue')} invalid={!!errors.minPickupValue} />}
            </Field>
          </div>
        </FormSection>

        <CenterPicker lat={f.lat} lng={f.lng} error={errors.center} fallback={fallback} onChange={({ lat, lng }) => setF((x) => ({ ...x, lat, lng }))} />

        <Toggle checked={f.isActive} onChange={set('isActive')} label="Taking bookings" description="Turn off to pause bookings without deleting the municipality." />
        {!f.isActive && (
          <Callout tone="amber" icon={MapPin}>
            Customers here will see that pickups are not available yet.
          </Callout>
        )}
      </form>
    </Modal>
  );
}
