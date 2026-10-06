import { useMemo, useState } from 'react';
import { MapPin, MapPinned, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import useApi from '../../hooks/useApi';
import { rupees } from '../../utils/format';
import { DEFAULT_CENTER, POSTAL_CODE_RE, PROVINCES } from '../../utils/locale';
import MapView from '../../components/MapView';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, PageHeader, Select, Textarea, Toggle, cx } from '../../components/ui';
import { Async, Callout, ConfirmModal, FormSection, NumberInput, isBlank, useAction, Modal } from './_catalog/shared';

const parsePins = (text) =>
  [...new Set(String(text).split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];

export default function AdminServiceAreas() {
  const res = useApi('/admin/service-areas');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { busy, run } = useAction();
  const areas = res.data?.areas;
  const mapped = (areas || []).filter((a) => Number.isFinite(a.center?.lat) && Number.isFinite(a.center?.lng));

  async function toggle(a) {
    const r = await run(a._id, () => api.put(`/admin/service-areas/${a._id}`, { isActive: !a.isActive }), {
      success: a.isActive ? `${a.city} paused` : `${a.city} is live`,
    });
    if (r.ok) res.setData((d) => ({ ...d, areas: d.areas.map((x) => (x._id === a._id ? { ...x, isActive: !a.isActive } : x)) }));
  }
  async function remove() {
    const r = await run('delete', () => api.delete(`/admin/service-areas/${deleting._id}`), { success: `${deleting.city} removed` });
    if (r.ok) {
      setDeleting(null);
      res.reload();
    }
  }

  return (
    <div>
      <PageHeader
        title="Service areas"
        subtitle="Cities and postal codes where customers can book a pickup, with minimum order rules."
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add area
          </Button>
        }
      />
      <Async
        {...res}
        onRetry={res.reload}
        isEmpty={(d) => !d.areas.length}
        empty={
          <EmptyState
            icon={MapPinned}
            title="No service areas yet"
            description="Add a city to start taking bookings there. Leave its postal code list empty to serve the whole city."
            action={<Button icon={Plus} onClick={() => setEditing('new')}>Add area</Button>}
          />
        }
      >
        {(d) => (
          <div className="space-y-6">
            {mapped.length > 0 && (
              <MapView
                center={DEFAULT_CENTER}
                height={260}
                markers={mapped.map((a) => ({
                  id: a._id,
                  lat: a.center.lat,
                  lng: a.center.lng,
                  color: a.isActive ? 'rust' : 'steel',
                  popup: `${a.city}${a.pinCodes.length ? ` · ${a.pinCodes.length} postal codes` : ' · whole city'}`,
                }))}
              />
            )}
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {d.areas.map((a) => (
                <Card key={a._id} className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className={cx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', a.isActive ? 'bg-rust-100 text-rust-700' : 'bg-steel-100 text-steel-500')}>
                      <MapPin className="w-5 h-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-steel-900">{a.city}</h3>
                      <p className="text-sm text-steel-500">{a.state ? `${a.state} Province` : 'Province not set'}</p>
                    </div>
                    <IconButton label={`Edit ${a.city}`} icon={Pencil} onClick={() => setEditing(a)} />
                    <IconButton label={`Delete ${a.city}`} icon={Trash2} onClick={() => setDeleting(a)} className="hover:!text-danger-600" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.pinCodes.length ? <Badge tone="blue">{a.pinCodes.length} postal codes</Badge> : <Badge tone="patina">Whole city</Badge>}
                    {a.minPickupWeightKg > 0 && <Badge>Min {a.minPickupWeightKg} kg</Badge>}
                    {a.minPickupValue > 0 && <Badge>Min {rupees(a.minPickupValue)}</Badge>}
                    {!a.center?.lat && <Badge tone="amber">No map center</Badge>}
                  </div>
                  {a.pinCodes.length > 0 && (
                    <p className="text-xs text-steel-500 tabular line-clamp-2">
                      {a.pinCodes.slice(0, 12).join(', ')}
                      {a.pinCodes.length > 12 && ` +${a.pinCodes.length - 12} more`}
                    </p>
                  )}
                  <div className="pt-3 mt-auto border-t border-steel-100">
                    <Toggle checked={a.isActive} disabled={busy === a._id} onChange={() => toggle(a)} label={a.isActive ? 'Taking bookings' : 'Paused'} />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </Async>
      {editing && (
        <AreaForm
          area={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            res.reload();
          }}
        />
      )}
      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} title="Delete service area?" confirmLabel="Delete" variant="danger" busy={busy === 'delete'} onConfirm={remove}>
        <p>
          Customers in <strong className="text-steel-900">{deleting?.city}</strong> will no longer be able to book. Existing pickups are not affected. To stop
          bookings temporarily, pause the area instead.
        </p>
      </ConfirmModal>
    </div>
  );
}

function AreaForm({ area, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    city: area?.city || '',
    state: area?.state || '',
    pins: (area?.pinCodes || []).join(', '),
    minPickupWeightKg: area?.minPickupWeightKg ?? 0,
    minPickupValue: area?.minPickupValue ?? 0,
    lat: area?.center?.lat ?? '',
    lng: area?.center?.lng ?? '',
    isActive: area?.isActive ?? true,
  }));
  const [errors, setErrors] = useState({});
  const { busy, run } = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const tokens = useMemo(() => parsePins(f.pins), [f.pins]);
  const invalid = tokens.filter((t) => !POSTAL_CODE_RE.test(t));
  const hasCenter = !isBlank(f.lat) && !isBlank(f.lng);

  async function save(e) {
    e.preventDefault();
    const er = {};
    if (f.city.trim().length < 2) er.city = 'Enter the city name';
    if (invalid.length) er.pins = `${invalid.length} invalid postal code${invalid.length > 1 ? 's' : ''}: each must be 5 digits`;
    if (tokens.length > 2000) er.pins = 'At most 2000 postal codes per area';
    if (isBlank(f.minPickupWeightKg) || f.minPickupWeightKg < 0) er.minPickupWeightKg = 'Enter 0 or more';
    if (isBlank(f.minPickupValue) || f.minPickupValue < 0) er.minPickupValue = 'Enter 0 or more';
    if (isBlank(f.lat) !== isBlank(f.lng)) er.center = 'Enter both latitude and longitude, or neither';
    else if (hasCenter && (Math.abs(f.lat) > 90 || Math.abs(f.lng) > 180)) er.center = 'Latitude must be within ±90 and longitude within ±180';
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {
      city: f.city.trim(),
      state: f.state.trim(),
      pinCodes: tokens,
      minPickupWeightKg: Number(f.minPickupWeightKg),
      minPickupValue: Number(f.minPickupValue),
      isActive: f.isActive,
    };
    if (hasCenter) body.center = { lat: Number(f.lat), lng: Number(f.lng) };
    const r = await run('save', () => (area ? api.put(`/admin/service-areas/${area._id}`, body) : api.post('/admin/service-areas', body)), {
      success: area ? 'Service area updated' : 'Service area added',
    });
    if (r.ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={area ? `Edit ${area.city}` : 'Add service area'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="area-form" loading={busy === 'save'}>
            {area ? 'Save changes' : 'Add area'}
          </Button>
        </>
      }
    >
      <form id="area-form" onSubmit={save} className="space-y-6" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="City" required error={errors.city}>
            {(id) => <Input id={id} value={f.city} onChange={(e) => set('city')(e.target.value)} invalid={!!errors.city} maxLength={60} placeholder="e.g. Kathmandu" />}
          </Field>
          <Field label="Province">
            {(id) => (
              <Select id={id} value={f.state} onChange={(e) => set('state')(e.target.value)}>
                <option value="">Select province</option>
                {f.state && !PROVINCES.includes(f.state) && <option value={f.state}>{f.state}</option>}
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <FormSection title="Postal codes" description="Separate with commas, spaces or new lines. Leave empty to serve the whole city.">
          <Field label="Served postal codes" error={errors.pins} hint={tokens.length ? `${tokens.length} unique postal code${tokens.length > 1 ? 's' : ''}` : 'Whole city is served'}>
            {(id) => (
              <Textarea id={id} rows={3} value={f.pins} onChange={(e) => set('pins')(e.target.value)} placeholder="44600, 44700, 44800" className="tabular" />
            )}
          </Field>
          {tokens.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto" aria-label="Postal code preview">
              {tokens.slice(0, 200).map((t) => (
                <Badge key={t} tone={POSTAL_CODE_RE.test(t) ? 'steel' : 'danger'} className="tabular">
                  {t}
                </Badge>
              ))}
              {tokens.length > 200 && <Badge>+{tokens.length - 200} more</Badge>}
            </div>
          )}
        </FormSection>

        <FormSection title="Minimum order" description="Bookings below these are refused in this area. Use 0 for no minimum.">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min weight (kg)" error={errors.minPickupWeightKg}>
              {(id) => <NumberInput id={id} min={0} value={f.minPickupWeightKg} onChange={set('minPickupWeightKg')} invalid={!!errors.minPickupWeightKg} />}
            </Field>
            <Field label="Min value (Rs.)" error={errors.minPickupValue}>
              {(id) => <NumberInput id={id} min={0} value={f.minPickupValue} onChange={set('minPickupValue')} invalid={!!errors.minPickupValue} />}
            </Field>
          </div>
        </FormSection>

        <FormSection title="Map center (optional)" description="Click the map to place the center, or type coordinates. Used for dispatch and the coverage map.">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude" error={errors.center}>
              {(id) => <NumberInput id={id} step="0.0001" value={f.lat} onChange={set('lat')} invalid={!!errors.center} />}
            </Field>
            <Field label="Longitude">
              {(id) => <NumberInput id={id} step="0.0001" value={f.lng} onChange={set('lng')} invalid={!!errors.center} />}
            </Field>
          </div>
          <MapView
            center={DEFAULT_CENTER}
            height={240}
            markers={hasCenter ? [{ id: 'center', lat: Number(f.lat), lng: Number(f.lng), color: 'rust', label: '' }] : []}
            onPick={({ lat, lng }) => setF((x) => ({ ...x, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 }))}
          />
          {hasCenter && (
            <Button variant="ghost" size="sm" onClick={() => setF((x) => ({ ...x, lat: '', lng: '' }))}>
              Clear center
            </Button>
          )}
        </FormSection>

        <Toggle checked={f.isActive} onChange={set('isActive')} label="Taking bookings" description="Turn off to pause bookings without deleting the area." />
        {!f.isActive && <Callout tone="amber">Customers in this area will see that pickups are not available yet.</Callout>}
      </form>
    </Modal>
  );
}
