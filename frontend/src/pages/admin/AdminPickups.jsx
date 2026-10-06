import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Truck, UserPlus, Wand2, X, XCircle } from 'lucide-react';
import useApi, { useDebounce } from '../../hooks/useApi';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Pagination, Select, StatusBadge, Textarea } from '../../components/ui';
import { STATUS_LABEL, fmtDate, rupees } from '../../utils/format';
import { CURRENCY_SYMBOL, NUMBER_LOCALE } from '../../utils/locale';
import { AssignModal, CityField, ExportButton, FilterBar, SearchField, flagLabel, qs, useMutation } from './_ops/shared';
import PickupDetailModal from './_ops/PickupDetailModal';

const FILTER_KEYS = ['search', 'status', 'city', 'collector', 'type', 'flagged', 'dateFrom', 'dateTo', 'sort'];
const STATUSES = ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING', 'COMPLETED', 'CANCELLED'];
const PICKUP_ID = /^SM-\d{4}-\d{6}$/i;
const LIMIT = 20;

export default function AdminPickups() {
  const { can } = useAuth();
  const { cities } = useConfig();
  const [sp, setSp] = useSearchParams();
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) || '']));
  const page = Number(sp.get('page')) || 1;

  const [searchText, setSearchText] = useState(f.search);
  const debounced = useDebounce(searchText, 350);
  const [selected, setSelected] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const { busy, run } = useMutation();
  const canEdit = can('pickups') || can('dispatch');

  const update = (patch, keepPage = false) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!keepPage) next.delete('page');
    setSp(next, { replace: true });
  };

  // Debounced search → URL.
  useEffect(() => {
    if (debounced !== f.search) update({ search: debounced.trim() });
  }, [debounced]);

  // Deep link from dispatch: ?search=SM-2025-000123 opens the pickup.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!autoOpened.current && PICKUP_ID.test(f.search)) {
      autoOpened.current = true;
      setOpenId(f.search.toUpperCase());
    }
  }, []);

  const params = { page, limit: LIMIT, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) };
  const { data, error, loading, reload } = useApi('/admin/pickups', { params });

  useEffect(() => setSelected([]), [sp]);

  const sortKey = f.sort.replace(/^-/, '');
  const sort = f.sort ? { key: sortKey, dir: f.sort.startsWith('-') ? -1 : 1 } : { key: 'createdAt', dir: -1 };
  const onSort = (key) => update({ sort: sort.key === key && sort.dir === -1 ? key : `-${key}` });

  const activeFilters = FILTER_KEYS.filter((k) => k !== 'sort' && f[k]).length;
  const clearAll = () => {
    setSearchText('');
    setSp(f.sort ? { sort: f.sort } : {}, { replace: true });
  };

  const bulk = async (action, extra = {}) => {
    const res = await run(`bulk:${action}`, () => api.post('/admin/pickups/bulk', { pickupIds: selected, action, ...extra }), (d) => `${d?.processed ?? 0} of ${selected.length} pickups updated`);
    if (res) {
      setSelected([]);
      setAssignOpen(false);
      setCancelOpen(false);
      setCancelReason('');
      reload();
    }
  };

  const columns = [
    {
      key: 'pickupId',
      header: 'Pickup',
      render: (p) => (
        <div>
          <span className="font-mono text-xs font-semibold text-steel-900">{p.pickupId}</span>
          {p.type === 'donation' && <Badge tone="patina" className="ml-2">Donation</Badge>}
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (p) => (
        <div className="min-w-[140px]">
          <div className="text-steel-900">{p.customer?.name || '—'}</div>
          <div className="text-xs text-steel-500">{p.contactPhone}</div>
        </div>
      ),
    },
    {
      key: 'scheduledDate',
      header: 'Scheduled',
      sortable: true,
      render: (p) => (
        <div className="whitespace-nowrap">
          <div className="text-steel-900">{fmtDate(p.scheduledDate, { day: 'numeric', month: 'short' })}</div>
          <div className="text-xs text-steel-500">{p.timeSlot}</div>
        </div>
      ),
    },
    {
      key: 'area',
      header: 'Area',
      render: (p) => (
        <div className="min-w-[120px]">
          <div className="text-steel-700">{p.addressSnapshot?.locality || '—'}</div>
          <div className="text-xs text-steel-500">
            {p.addressSnapshot?.city} {p.pinCode}
          </div>
        </div>
      ),
    },
    {
      key: 'collector',
      header: 'Collector',
      render: (p) => (p.collector ? <span className="text-steel-700 whitespace-nowrap">{p.collector.name}</span> : <Badge tone="amber">Unassigned</Badge>),
    },
    { key: 'status', header: 'Status', sortable: true, render: (p) => <StatusBadge status={p.status} /> },
    {
      key: 'finalAmount',
      header: 'Amount',
      sortable: true,
      className: 'text-right',
      render: (p) =>
        p.finalAmount != null ? (
          <span className="tabular text-steel-900">{rupees(p.finalAmount + (p.bonusAmount || 0))}</span>
        ) : (
          <span className="tabular text-steel-500 whitespace-nowrap">
            {rupees(p.estimatedValueMin)}–{rupees(p.estimatedValueMax).replace(`${CURRENCY_SYMBOL} `, '')}
          </span>
        ),
    },
    {
      key: 'flags',
      header: <span className="sr-only">Flags</span>,
      render: (p) =>
        p.flags?.length ? (
          <span title={p.flags.map(flagLabel).join(', ')} className="inline-flex items-center gap-1 text-danger-600 text-xs">
            <AlertTriangle className="w-4 h-4" aria-hidden />
            <span className="sr-only">Flagged: </span>
            {p.flags.length}
          </span>
        ) : null,
    },
    { key: 'createdAt', header: 'Booked', sortable: true, render: (p) => <span className="text-xs text-steel-500 whitespace-nowrap">{fmtDate(p.createdAt, { day: 'numeric', month: 'short' })}</span> },
  ];

  const exportQuery = qs({ ...Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'sort')), format: 'csv' });

  return (
    <div>
      <PageHeader
        title="Pickups"
        subtitle={data?.pagination ? `${data.pagination.total.toLocaleString(NUMBER_LOCALE)} matching pickups` : 'Search, filter and manage every pickup'}
        actions={<ExportButton path={`/admin/pickups?${exportQuery}`} filename="pickups.csv" />}
      />

      <FilterBar>
        <SearchField value={searchText} onChange={setSearchText} placeholder="Pickup ID, phone, locality or postal code" />
        <Field label="Status" className="w-full sm:w-44">
          {(id) => (
            <Select id={id} value={f.status} onChange={(e) => update({ status: e.target.value })}>
              <option value="">Any status</option>
              <option value="active">All active</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <CityField value={f.city} onChange={(v) => update({ city: v })} cities={cities} />
        <Field label="Collector" className="w-full sm:w-40">
          {(id) => (
            <Select id={id} value={f.collector === 'none' ? 'none' : f.collector ? 'id' : ''} onChange={(e) => update({ collector: e.target.value === 'id' ? f.collector : e.target.value })}>
              <option value="">Any</option>
              <option value="none">Unassigned</option>
              {f.collector && f.collector !== 'none' && <option value="id">Specific collector</option>}
            </Select>
          )}
        </Field>
        <Field label="Type" className="w-full sm:w-36">
          {(id) => (
            <Select id={id} value={f.type} onChange={(e) => update({ type: e.target.value })}>
              <option value="">Any type</option>
              <option value="sale">Sale</option>
              <option value="donation">Donation</option>
            </Select>
          )}
        </Field>
        <Field label="From" className="w-[calc(50%-6px)] sm:w-40">
          {(id) => <Input id={id} type="date" value={f.dateFrom} max={f.dateTo || undefined} onChange={(e) => update({ dateFrom: e.target.value })} />}
        </Field>
        <Field label="To" className="w-[calc(50%-6px)] sm:w-40">
          {(id) => <Input id={id} type="date" value={f.dateTo} min={f.dateFrom || undefined} onChange={(e) => update({ dateTo: e.target.value })} />}
        </Field>
        <label className="flex items-center gap-2 text-sm text-steel-700 h-10 cursor-pointer">
          <input type="checkbox" className="accent-rust-600 w-4 h-4" checked={f.flagged === 'true'} onChange={(e) => update({ flagged: e.target.checked ? 'true' : '' })} />
          Flagged only
        </label>
        {activeFilters > 0 && (
          <Button variant="ghost" icon={X} onClick={clearAll}>
            Clear ({activeFilters})
          </Button>
        )}
      </FilterBar>

      {selected.length > 0 && canEdit && (
        <Card className="mb-4 !p-3 flex flex-wrap items-center gap-2 border-rust-200 bg-rust-50" role="region" aria-label="Bulk actions">
          <span className="text-sm font-medium text-steel-900 mr-auto">{selected.length} selected</span>
          <Button size="sm" variant="secondary" icon={Wand2} loading={busy === 'bulk:auto-assign'} onClick={() => bulk('auto-assign')}>
            Auto-assign
          </Button>
          <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setAssignOpen(true)}>
            Assign to…
          </Button>
          <Button size="sm" variant="danger" icon={XCircle} onClick={() => setCancelOpen(true)}>
            Cancel
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </Card>
      )}

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
          {error && <ErrorState error={error} onRetry={reload} className="mb-4" />}
          <DataTable
            rows={data?.pickups}
            rowKey="pickupId"
            columns={columns}
            loading={loading}
            selectable={canEdit}
            selected={selected}
            onSelect={setSelected}
            onRowClick={(p) => setOpenId(p.pickupId)}
            sort={sort}
            onSort={onSort}
            empty={
              <EmptyState
                icon={Truck}
                title="No pickups match"
                description={activeFilters ? 'Try removing a filter or widening the date range.' : 'Pickups will appear here once customers book.'}
                action={activeFilters ? <Button variant="outline" onClick={clearAll}>Clear filters</Button> : null}
              />
            }
          />
          <Pagination pagination={data?.pagination} onPage={(n) => update({ page: String(n) }, true)} />
        </>
      )}

      <PickupDetailModal pickupId={openId} onClose={() => setOpenId(null)} onChanged={reload} />

      <AssignModal open={assignOpen} onClose={() => setAssignOpen(false)} count={selected.length} busy={busy === 'bulk:assign'} onAssign={(collectorId) => bulk('assign', { collectorId })} />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${selected.length} pickup${selected.length === 1 ? '' : 's'}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep them
            </Button>
            <Button variant="danger" loading={busy === 'bulk:cancel'} onClick={() => bulk('cancel', cancelReason.trim() ? { reason: cancelReason.trim() } : {})}>
              Cancel pickups
            </Button>
          </>
        }
      >
        <p className="text-sm text-steel-700 mb-4">Only active pickups are cancelled. Customers are notified and any coupon is released.</p>
        <Field label="Reason" hint="Shown to customers. Defaults to “Cancelled by ScrapMate”.">
          {(id) => <Textarea id={id} maxLength={300} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />}
        </Field>
      </Modal>
    </div>
  );
}
