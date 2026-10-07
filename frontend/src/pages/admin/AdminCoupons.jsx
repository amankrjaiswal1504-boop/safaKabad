import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Ticket } from 'lucide-react';
import api from '../../services/api';
import useApi from '../../hooks/useApi';
import { fmtDate, rupees } from '../../utils/format';
import { CURRENCY_SYMBOL } from '../../utils/locale';
import { Badge, Button, DataTable, EmptyState, Field, IconButton, Input, PageHeader, Segmented, Textarea, Toggle, cx } from '../../components/ui';
import { Async, Callout, FormSection, NumberInput, Toolbar, isBlank, toNumOrNull, useAction, Modal } from './_catalog/shared';

function couponStatus(c, now = Date.now()) {
  if (!c.isActive) return { key: 'inactive', label: 'Inactive', tone: 'steel' };
  if (c.validTo && new Date(c.validTo).getTime() < now) return { key: 'expired', label: 'Expired', tone: 'danger' };
  if (c.validFrom && new Date(c.validFrom).getTime() > now) return { key: 'scheduled', label: 'Scheduled', tone: 'blue' };
  if (c.usageLimit && c.usedCount >= c.usageLimit) return { key: 'expired', label: 'Used up', tone: 'amber' };
  return { key: 'active', label: 'Active', tone: 'patina' };
}

function couponSummary(c) {
  const v = Number(c.value) || 0;
  let s = c.type === 'percent' ? `+${v}%` : `+${rupees(v)}`;
  if (c.type === 'percent' && !isBlank(c.maxBonus)) s += ` (max ${rupees(c.maxBonus)})`;
  s += c.firstPickupOnly ? ' on first pickup' : ' on any pickup';
  if (Number(c.minWeightKg) > 0) s += ` · min ${c.minWeightKg} kg`;
  if (Number(c.minOrderValue) > 0) s += ` · orders over ${rupees(c.minOrderValue)}`;
  return s.replace(/\s+/g, ' ');
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'expired', label: 'Expired' },
  { value: 'inactive', label: 'Inactive' },
];

export default function AdminCoupons() {
  const res = useApi('/admin/coupons');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const { busy, run } = useAction();

  const rows = useMemo(() => {
    const list = res.data?.coupons;
    if (!list) return undefined;
    const q = search.trim().toUpperCase();
    return list.filter((c) => (filter === 'all' || couponStatus(c).key === filter) && (!q || c.code.includes(q) || (c.description || '').toUpperCase().includes(q)));
  }, [res.data, filter, search]);

  async function toggle(c) {
    const r = await run(c._id, () => api.put(`/admin/coupons/${c._id}`, { isActive: !c.isActive }), {
      success: `${c.code} ${c.isActive ? 'switched off' : 'switched on'}`,
    });
    if (r.ok) res.setData((d) => ({ ...d, coupons: d.coupons.map((x) => (x._id === c._id ? { ...x, isActive: !c.isActive } : x)) }));
  }

  const columns = [
    {
      key: 'code',
      header: 'Code',
      render: (c) => (
        <div className="min-w-[160px]">
          <span className="font-mono font-semibold text-steel-900 tracking-wide">{c.code}</span>
          {c.description && <div className="text-xs text-steel-500 line-clamp-1">{c.description}</div>}
        </div>
      ),
    },
    { key: 'summary', header: 'Reward', render: (c) => <span className="text-steel-700 min-w-[200px] inline-block">{couponSummary(c)}</span> },
    {
      key: 'usage',
      header: 'Usage',
      render: (c) => {
        const pct = c.usageLimit ? Math.min(100, (c.usedCount / c.usageLimit) * 100) : null;
        return (
          <div className="w-28">
            <div className="text-sm tabular text-steel-900">
              {c.usedCount || 0}
              <span className="text-steel-500"> / {c.usageLimit || '∞'}</span>
            </div>
            {pct != null && (
              <div className="h-1.5 rounded-full bg-steel-100 mt-1" aria-hidden>
                <div className={cx('h-1.5 rounded-full', pct >= 100 ? 'bg-amber-600' : 'bg-rust-600')} style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="text-xs text-steel-500 mt-0.5">{c.perUserLimit || 1} per customer</div>
          </div>
        );
      },
    },
    {
      key: 'valid',
      header: 'Valid',
      render: (c) => (
        <span className="text-sm text-steel-700 whitespace-nowrap">
          {fmtDate(c.validFrom)} – {c.validTo ? fmtDate(c.validTo) : 'no end'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const s = couponStatus(c);
        return (
          <Badge tone={s.tone} dot>
            {s.label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (c) => (
        <div className="flex items-center justify-end gap-2">
          <Toggle checked={c.isActive} disabled={busy === c._id} onChange={() => toggle(c)} label={<span className="sr-only">{`${c.code} active`}</span>} />
          <IconButton label={`Edit ${c.code}`} icon={Pencil} onClick={() => setEditing(c)} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Coupons"
        subtitle="Bonus codes customers enter at booking. The bonus is added on top of the scrap value after weighing."
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            New coupon
          </Button>
        }
      />
      <Toolbar className="justify-between">
        <div className="overflow-x-auto max-w-full">
          <Segmented options={FILTERS} value={filter} onChange={setFilter} size="sm" />
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-steel-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code" aria-label="Search coupons" className="pl-9" />
        </div>
      </Toolbar>
      {res.error && !res.data ? (
        <Async {...res} onRetry={res.reload}>
          {() => null}
        </Async>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          loading={res.loading}
          empty={
            <EmptyState
              icon={Ticket}
              title={res.data?.coupons?.length ? 'No coupons match' : 'No coupons yet'}
              description={res.data?.coupons?.length ? 'Try another filter or search.' : 'Create a code like FIRST5 to reward new customers.'}
              action={!res.data?.coupons?.length && <Button icon={Plus} onClick={() => setEditing('new')}>New coupon</Button>}
            />
          }
        />
      )}
      {editing && (
        <CouponForm
          coupon={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            res.reload();
          }}
        />
      )}
    </div>
  );
}

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function CouponForm({ coupon, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    code: coupon?.code || '',
    description: coupon?.description || '',
    type: coupon?.type || 'percent',
    value: coupon?.value ?? 5,
    maxBonus: coupon?.maxBonus ?? '',
    minWeightKg: coupon?.minWeightKg ?? 0,
    minOrderValue: coupon?.minOrderValue ?? 0,
    firstPickupOnly: coupon?.firstPickupOnly ?? false,
    usageLimit: coupon?.usageLimit ?? '',
    perUserLimit: coupon?.perUserLimit ?? 1,
    validFrom: toDateInput(coupon?.validFrom) || toDateInput(new Date()),
    validTo: toDateInput(coupon?.validTo),
    isActive: coupon?.isActive ?? true,
  }));
  const [errors, setErrors] = useState({});
  const { busy, run } = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    const er = {};
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) er.code = '3–20 letters, numbers, - or _';
    if (isBlank(f.value) || f.value <= 0) er.value = 'Must be more than 0';
    else if (f.type === 'percent' && f.value > 100) er.value = 'At most 100%';
    else if (f.value > 100000) er.value = 'Too large';
    if (!isBlank(f.maxBonus) && f.maxBonus < 0) er.maxBonus = 'Cannot be negative';
    if (isBlank(f.minWeightKg) || f.minWeightKg < 0) er.minWeightKg = 'Enter 0 or more';
    if (isBlank(f.minOrderValue) || f.minOrderValue < 0) er.minOrderValue = 'Enter 0 or more';
    if (!isBlank(f.usageLimit) && (!Number.isInteger(Number(f.usageLimit)) || f.usageLimit < 1)) er.usageLimit = 'Whole number, 1 or more';
    if (isBlank(f.perUserLimit) || !Number.isInteger(Number(f.perUserLimit)) || f.perUserLimit < 1) er.perUserLimit = 'Whole number, 1 or more';
    if (f.validTo && f.validFrom && f.validTo < f.validFrom) er.validTo = 'Must be after the start date';
    if (f.description.length > 200) er.description = 'Keep it under 200 characters';
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {
      code,
      description: f.description.trim(),
      type: f.type,
      value: Number(f.value),
      maxBonus: f.type === 'percent' ? toNumOrNull(f.maxBonus) : null,
      minWeightKg: Number(f.minWeightKg),
      minOrderValue: Number(f.minOrderValue),
      firstPickupOnly: f.firstPickupOnly,
      usageLimit: toNumOrNull(f.usageLimit),
      perUserLimit: Number(f.perUserLimit),
      validFrom: f.validFrom ? new Date(`${f.validFrom}T00:00:00`).toISOString() : undefined,
      validTo: f.validTo ? new Date(`${f.validTo}T23:59:59`).toISOString() : null,
      isActive: f.isActive,
    };
    const r = await run('save', () => (coupon ? api.put(`/admin/coupons/${coupon._id}`, body) : api.post('/admin/coupons', body)), {
      success: coupon ? 'Coupon updated' : `Coupon ${code} created`,
    });
    if (r.ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={coupon ? `Edit ${coupon.code}` : 'New coupon'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="coupon-form" loading={busy === 'save'}>
            {coupon ? 'Save changes' : 'Create coupon'}
          </Button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={save} className="space-y-6" noValidate>
        <Callout tone="rust" icon={Ticket}>
          <span className="font-mono font-semibold mr-1.5">{f.code.trim().toUpperCase() || 'CODE'}</span>
          {couponSummary(f)}
        </Callout>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Code" required error={errors.code} hint="Customers type this. Letters, numbers, - and _">
            {(id) => (
              <Input
                id={id}
                value={f.code}
                onChange={(e) => set('code')(e.target.value.toUpperCase().replace(/\s/g, ''))}
                maxLength={20}
                className="font-mono uppercase"
                invalid={!!errors.code}
                placeholder="FIRST5"
              />
            )}
          </Field>
          <div>
            <span className="label">Bonus type</span>
            <Segmented
              options={[
                { value: 'percent', label: '% of value' },
                { value: 'flat', label: `Flat ${CURRENCY_SYMBOL}` },
              ]}
              value={f.type}
              onChange={set('type')}
            />
          </div>
        </div>
        <Field label="Description" error={errors.description} hint="Internal note or the text shown with the offer">
          {(id) => <Textarea id={id} rows={2} value={f.description} onChange={(e) => set('description')(e.target.value)} maxLength={200} />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={f.type === 'percent' ? 'Bonus (%)' : `Bonus (${CURRENCY_SYMBOL})`} required error={errors.value}>
            {(id) => <NumberInput id={id} min={0} step={f.type === 'percent' ? 0.5 : 1} value={f.value} onChange={set('value')} invalid={!!errors.value} />}
          </Field>
          {f.type === 'percent' && (
            <Field label={`Max bonus (${CURRENCY_SYMBOL})`} error={errors.maxBonus} hint="Leave empty for no cap">
              {(id) => <NumberInput id={id} min={0} value={f.maxBonus} onChange={set('maxBonus')} invalid={!!errors.maxBonus} />}
            </Field>
          )}
        </div>

        <FormSection title="Who can use it">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min weight (kg)" error={errors.minWeightKg}>
              {(id) => <NumberInput id={id} min={0} value={f.minWeightKg} onChange={set('minWeightKg')} invalid={!!errors.minWeightKg} />}
            </Field>
            <Field label={`Min order value (${CURRENCY_SYMBOL})`} error={errors.minOrderValue}>
              {(id) => <NumberInput id={id} min={0} value={f.minOrderValue} onChange={set('minOrderValue')} invalid={!!errors.minOrderValue} />}
            </Field>
            <Field label="Total uses" error={errors.usageLimit} hint={coupon ? `Used ${coupon.usedCount || 0} times. Empty = unlimited` : 'Empty = unlimited'}>
              {(id) => <NumberInput id={id} min={1} step={1} value={f.usageLimit} onChange={set('usageLimit')} invalid={!!errors.usageLimit} />}
            </Field>
            <Field label="Uses per customer" error={errors.perUserLimit}>
              {(id) => <NumberInput id={id} min={1} step={1} value={f.perUserLimit} onChange={set('perUserLimit')} invalid={!!errors.perUserLimit} />}
            </Field>
          </div>
          <Toggle checked={f.firstPickupOnly} onChange={set('firstPickupOnly')} label="First pickup only" description="Only customers who haven't completed a pickup yet." />
        </FormSection>

        <FormSection title="When">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts">{(id) => <Input id={id} type="date" value={f.validFrom} onChange={(e) => set('validFrom')(e.target.value)} />}</Field>
            <Field label="Ends" error={errors.validTo} hint="Empty = never expires">
              {(id) => <Input id={id} type="date" value={f.validTo} min={f.validFrom || undefined} onChange={(e) => set('validTo')(e.target.value)} invalid={!!errors.validTo} />}
            </Field>
          </div>
          <Toggle checked={f.isActive} onChange={set('isActive')} label="Active" description="Switch off to stop new redemptions immediately." />
        </FormSection>
      </form>
    </Modal>
  );
}
