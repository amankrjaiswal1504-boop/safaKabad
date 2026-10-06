import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Pencil, Plus } from 'lucide-react';
import useApi, { useDebounce } from '../../hooks/useApi';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, DataTable, EmptyState, ErrorState, Field, IconButton, Input, Modal, PageHeader, Pagination, Stars, Toggle } from '../../components/ui';
import { MOBILE_PLACEHOLDER, NUMBER_LOCALE, isMobile } from '../../utils/locale';
import { CityField, FilterBar, SearchField, useMutation } from './_ops/shared';
import { AreaMultiSelect, CitySelect, useAdminCities, useCityAreas } from './_geo/shared';

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  password: '',
  city: '',
  vehicleNumber: '',
  serviceAreas: [],
  commissionRate: '',
  isActive: true,
  isAvailable: true,
  start: '09:00',
  end: '19:00',
};

function validate(f, isNew) {
  const e = {};
  if (f.name.trim().length < 2) e.name = 'Enter the full name';
  if (isNew && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';
  if (!isMobile(f.phone)) e.phone = 'Enter a valid 10-digit mobile number';
  if (isNew && f.password.length < 8) e.password = 'At least 8 characters';
  if (f.city.trim().length < 2) e.city = 'Choose a city';
  if (f.commissionRate !== '' && (Number.isNaN(Number(f.commissionRate)) || Number(f.commissionRate) < 0 || Number(f.commissionRate) > 50)) e.commissionRate = 'Between 0 and 50';
  if (!isNew && f.start >= f.end) e.hours = 'End time must be after start time';
  return e;
}

function CollectorModal({ open, collector, cities, onClose, onSaved }) {
  const isNew = !collector;
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const { busy, run } = useMutation();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (collector) {
      const cp = collector.collectorProfile || {};
      setF({
        ...EMPTY,
        name: collector.name || '',
        email: collector.email || '',
        phone: collector.phone || '',
        city: cp.city || '',
        vehicleNumber: cp.vehicleNumber || '',
        serviceAreas: (cp.serviceAreas || []).map(String),
        commissionRate: cp.commissionRate ?? '',
        isActive: collector.isActive !== false,
        isAvailable: cp.isAvailable !== false,
        start: cp.workingHours?.start || '09:00',
        end: cp.workingHours?.end || '19:00',
      });
    } else setF(EMPTY);
  }, [open, collector]);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e?.target ? e.target.value : e }));
  const areasRes = useCityAreas(open ? f.city : '');
  // A collector's areas belong to one city, so switching city starts over.
  const setCity = (city) => setF((prev) => ({ ...prev, city, serviceAreas: city === prev.city ? prev.serviceAreas : [] }));

  const save = async () => {
    const e = validate(f, isNew);
    setErrors(e);
    if (Object.keys(e).length) return;
    const common = {
      name: f.name.trim(),
      phone: f.phone.trim(),
      city: f.city.trim(),
      vehicleNumber: f.vehicleNumber.trim(),
      serviceAreas: areasRes.data ? f.serviceAreas.filter((id) => areasRes.areas.some((a) => String(a._id) === id)) : f.serviceAreas,
      commissionRate: f.commissionRate === '' ? null : Number(f.commissionRate),
    };
    const res = isNew
      ? await run('save', () => api.post('/admin/collectors', { ...common, email: f.email.trim(), password: f.password }), `${common.name} added`)
      : await run(
          'save',
          () => api.put(`/admin/collectors/${collector._id}`, { ...common, isActive: f.isActive, isAvailable: f.isAvailable, workingHours: { start: f.start, end: f.end } }),
          'Collector updated'
        );
    if (res) {
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? 'Add collector' : `Edit ${collector?.name}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy === 'save'} onClick={save}>
            {isNew ? 'Create collector' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form
        className="grid sm:grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <Field label="Full name" required error={errors.name}>
          {(id) => <Input id={id} value={f.name} onChange={set('name')} invalid={Boolean(errors.name)} autoComplete="off" />}
        </Field>
        <Field label="Mobile number" required error={errors.phone}>
          {(id) => <Input id={id} type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} invalid={Boolean(errors.phone)} placeholder={MOBILE_PLACEHOLDER} />}
        </Field>
        {isNew ? (
          <>
            <Field label="Email" required error={errors.email}>
              {(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} invalid={Boolean(errors.email)} autoComplete="off" />}
            </Field>
            <Field label="Temporary password" required error={errors.password} hint="At least 8 characters. Share it securely.">
              {(id) => <Input id={id} type="password" value={f.password} onChange={set('password')} invalid={Boolean(errors.password)} autoComplete="new-password" />}
            </Field>
          </>
        ) : (
          <Field label="Email" hint="Email can't be changed here">
            {(id) => <Input id={id} value={f.email} disabled readOnly />}
          </Field>
        )}
        <CitySelect cities={cities} value={f.city} onChange={setCity} required error={errors.city} />
        <Field label="Vehicle number">{(id) => <Input id={id} value={f.vehicleNumber} onChange={set('vehicleNumber')} maxLength={20} />}</Field>
        <Field label="Commission rate (%)" error={errors.commissionRate} hint="Leave blank to use the global rate">
          {(id) => <Input id={id} type="number" min={0} max={50} step="0.5" value={f.commissionRate} onChange={set('commissionRate')} invalid={Boolean(errors.commissionRate)} />}
        </Field>
        <div className="sm:col-span-2">
          {f.city ? (
            <>
              <AreaMultiSelect
                legend={`Municipalities served in ${f.city}`}
                areas={areasRes.areas}
                loading={areasRes.loading}
                value={f.serviceAreas}
                onChange={set('serviceAreas')}
                emptyText={`${f.city} has no municipalities yet. Add them under Cities & areas.`}
              />
              <p className="text-xs text-steel-500 mt-1">Leave all unticked and the collector gets pickups anywhere in {f.city}.</p>
            </>
          ) : (
            <p className="text-sm text-steel-500">Choose a city to pick the municipalities this collector serves.</p>
          )}
        </div>
        {!isNew && (
          <>
            <Field label="Shift starts" error={errors.hours}>
              {(id) => <Input id={id} type="time" value={f.start} onChange={set('start')} />}
            </Field>
            <Field label="Shift ends">{(id) => <Input id={id} type="time" value={f.end} onChange={set('end')} />}</Field>
            <Toggle checked={f.isAvailable} onChange={set('isAvailable')} label="Available for new pickups" description="Off-duty collectors are skipped by auto-assign" />
            <Toggle checked={f.isActive} onChange={set('isActive')} label="Account active" description="Inactive collectors cannot sign in" />
          </>
        )}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function AdminCollectors() {
  const { can } = useAuth();
  const { cities } = useAdminCities();
  const allAreas = useApi('/admin/service-areas');
  const areaName = useMemo(() => Object.fromEntries((allAreas.data?.areas || []).map((a) => [String(a._id), a.name])), [allAreas.data]);
  const canEdit = can('collectors');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 350);
  const [city, setCity] = useState('');
  const [available, setAvailable] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // collector | 'new' | null

  const params = { page, limit: 20, ...(debounced.trim() ? { search: debounced.trim() } : {}), ...(city ? { city } : {}), ...(available ? { available: 'true' } : {}) };
  const { data, error, loading, reload } = useApi('/admin/collectors', { params });
  useEffect(() => setPage(1), [debounced, city, available]);

  const columns = [
    {
      key: 'name',
      header: 'Collector',
      render: (c) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          <Avatar name={c.name} size="sm" />
          <div className="min-w-0">
            <div className="font-medium text-steel-900 truncate">{c.name}</div>
            <div className="text-xs text-steel-500 truncate">{c.phone}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'city',
      header: 'City & vehicle',
      render: (c) => (
        <div className="whitespace-nowrap">
          <div className="text-steel-700">{c.collectorProfile?.city || '—'}</div>
          <div className="text-xs text-steel-500 font-mono">{c.collectorProfile?.vehicleNumber || 'No vehicle'}</div>
        </div>
      ),
    },
    {
      key: 'areas',
      header: 'Service areas',
      render: (c) => {
        const names = (c.collectorProfile?.serviceAreas || []).map((id) => areaName[String(id)]).filter(Boolean);
        return names.length ? (
          <span className="text-xs text-steel-700 block max-w-[220px]" title={names.join(', ')}>
            {names.slice(0, 3).join(', ')}
            {names.length > 3 && <span className="text-steel-500"> +{names.length - 3} more</span>}
          </span>
        ) : (
          <span className="text-xs text-steel-500">Whole city</span>
        );
      },
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (c) =>
        c.collectorProfile?.ratingCount ? (
          <div className="whitespace-nowrap">
            <Stars value={c.collectorProfile.rating} size="w-3.5 h-3.5" />
            <div className="text-xs text-steel-500 tabular">
              {Number(c.collectorProfile.rating).toFixed(1)} · {c.collectorProfile.ratingCount} reviews
            </div>
          </div>
        ) : (
          <span className="text-xs text-steel-500">No ratings yet</span>
        ),
    },
    {
      key: 'work',
      header: 'Pickups',
      render: (c) => (
        <div className="whitespace-nowrap text-sm">
          <span className="text-steel-900 tabular">{c.activePickups}</span> <span className="text-steel-500">active</span>
          <div className="text-xs text-steel-500 tabular">{c.collectorProfile?.totalPickupsCompleted || 0} completed</div>
        </div>
      ),
    },
    {
      key: 'commission',
      header: 'Commission',
      render: (c) => (c.collectorProfile?.commissionRate != null ? <span className="tabular">{c.collectorProfile.commissionRate}%</span> : <span className="text-xs text-steel-500">Global</span>),
    },
    {
      key: 'hours',
      header: 'Hours',
      render: (c) => (
        <span className="text-xs text-steel-700 tabular whitespace-nowrap">
          {c.collectorProfile?.workingHours?.start || '09:00'}–{c.collectorProfile?.workingHours?.end || '19:00'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) =>
        !c.isActive ? (
          <Badge tone="danger">Inactive</Badge>
        ) : c.collectorProfile?.isAvailable === false ? (
          <Badge tone="steel">Off duty</Badge>
        ) : (
          <Badge tone="patina" dot>
            Available
          </Badge>
        ),
    },
    ...(canEdit
      ? [{ key: 'edit', header: <span className="sr-only">Edit</span>, render: (c) => <IconButton label={`Edit ${c.name}`} icon={Pencil} onClick={() => setEditing(c)} /> }]
      : []),
  ];

  const filtered = Boolean(debounced || city || available);

  return (
    <div>
      <PageHeader
        title="Collectors"
        subtitle={data?.pagination ? `${data.pagination.total.toLocaleString(NUMBER_LOCALE)} collectors` : 'Field team, service areas and availability'}
        actions={
          canEdit && (
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Add collector
            </Button>
          )
        }
      />

      <FilterBar>
        <SearchField value={search} onChange={setSearch} placeholder="Name, email or phone" />
        <CityField value={city} onChange={setCity} cities={cities.map((c) => c.name)} />
        <div className="h-10 flex items-center">
          <Toggle checked={available} onChange={setAvailable} label="Available only" />
        </div>
      </FilterBar>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
          <DataTable
            rows={data?.collectors}
            columns={columns}
            loading={loading}
            empty={
              <EmptyState
                icon={ClipboardList}
                title={filtered ? 'No collectors match' : 'No collectors yet'}
                description={filtered ? 'Try a different search or city.' : 'Add your first collector to start assigning pickups.'}
                action={!filtered && canEdit ? <Button icon={Plus} onClick={() => setEditing('new')}>Add collector</Button> : null}
              />
            }
          />
          <Pagination pagination={data?.pagination} onPage={setPage} />
        </>
      )}

      <CollectorModal
        open={Boolean(editing)}
        collector={editing === 'new' ? null : editing}
        cities={cities}
        onClose={() => setEditing(null)}
        onSaved={() => {
          reload();
          allAreas.reload();
        }}
      />
    </div>
  );
}
