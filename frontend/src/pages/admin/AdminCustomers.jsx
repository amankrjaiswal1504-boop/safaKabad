import { useEffect, useMemo, useState } from 'react';
import { Building2, UserCheck, UserX, Users } from 'lucide-react';
import useApi, { useDebounce } from '../../hooks/useApi';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { Avatar, Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, Select, Toggle } from '../../components/ui';
import { fmtDate, rupees, timeAgo } from '../../utils/format';
import { NUMBER_LOCALE } from '../../utils/locale';
import { ExportButton, FilterBar, SearchField, qs, useMutation } from './_ops/shared';

const TIER_TONES = ['steel', 'blue', 'amber', 'patina', 'rust'];
const tierTitle = (name) => String(name || '').replace(/^./, (c) => c.toUpperCase());
const tierDesc = (t) =>
  `${t.bonusPercent > 0 ? `+${t.bonusPercent}% bonus on completed pickups` : 'No extra bonus'}${t.minMonthlyKg > 0 ? ` · from ${Number(t.minMonthlyKg).toLocaleString(NUMBER_LOCALE)} kg/month` : ''}`;

// Business tiers come from Site settings (admin API, else the public config).
function useTiers() {
  const { can } = useAuth();
  const { config } = useConfig();
  const res = useApi('/admin/settings', { enabled: can('*') });
  const tiers = res.data?.settings?.business?.tiers || config?.business?.tiers;
  return useMemo(() => [...(tiers || [])].sort((a, b) => (a.minMonthlyKg || 0) - (b.minMonthlyKg || 0)), [tiers]);
}
const SORTS = [
  { value: '-createdAt', label: 'Newest first' },
  { value: 'createdAt', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: '-walletBalance', label: 'Wallet balance' },
  { value: '-lastLoginAt', label: 'Recently active' },
];

function TierModal({ user, tiers, onClose, onSaved }) {
  const [tier, setTier] = useState('');
  const { busy, run } = useMutation();
  useEffect(() => {
    if (user) setTier(user.business?.pricingTier || tiers[0]?.name || '');
  }, [user, tiers]);
  const save = async () => {
    const res = await run('tier', () => api.put(`/admin/users/${user._id}/business-tier`, { pricingTier: tier }), `${user.name} moved to ${tier}`);
    if (res) {
      onSaved();
      onClose();
    }
  };
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title="Business pricing tier"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy === 'tier'} onClick={save} disabled={!tier}>
            Save tier
          </Button>
        </>
      }
    >
      {user && (
        <>
          <p className="text-sm text-steel-700 mb-4">
            {user.business?.companyName || user.name}
            {user.accountType !== 'business' && <span className="text-steel-500"> · will be converted to a business account</span>}
          </p>
          <fieldset>
            <legend className="label">Tier</legend>
            <div className="space-y-2">
              {!tiers.length && <p className="text-sm text-steel-500">No business tiers are configured. Add them under Site settings → Business tiers.</p>}
              {tiers.map((t) => (
                <label key={t.name} className="flex items-start gap-3 rounded-lg border border-steel-100 p-3 cursor-pointer has-[:checked]:border-rust-600 has-[:checked]:bg-rust-50">
                  <input type="radio" name="tier" value={t.name} checked={tier === t.name} onChange={() => setTier(t.name)} className="accent-rust-600 mt-1" />
                  <span>
                    <span className="block text-sm font-medium text-steel-900">{tierTitle(t.name)}</span>
                    <span className="block text-xs text-steel-500">{tierDesc(t)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-steel-500 mt-3">Bonus percentages are set under Site settings → Business tiers.</p>
        </>
      )}
    </Modal>
  );
}

export default function AdminCustomers() {
  const { can } = useAuth();
  const canEdit = can('users');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 350);
  const [status, setStatus] = useState('');
  const [accountType, setAccountType] = useState('');
  const [sort, setSort] = useState('-createdAt');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [tierUser, setTierUser] = useState(null);
  const tiers = useTiers();
  const tierTone = (name) => TIER_TONES[Math.max(0, tiers.findIndex((t) => t.name === name)) % TIER_TONES.length];
  const { busy, run } = useMutation();

  const filters = { search: debounced.trim(), status, accountType };
  const params = { page, limit: 20, sort, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
  const { data, error, loading, reload, setData } = useApi('/admin/users', { params });

  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [debounced, status, accountType, sort]);

  const toggle = async (u) => {
    const res = await run(`toggle:${u._id}`, () => api.put(`/admin/users/${u._id}/toggle-active`), u.isActive ? `${u.name} deactivated` : `${u.name} reactivated`);
    if (res?.user) setData((d) => ({ ...d, users: d.users.map((x) => (x._id === u._id ? { ...x, isActive: res.user.isActive } : x)) }));
  };
  const bulk = async (action) => {
    const res = await run(`bulk:${action}`, () => api.post('/admin/users/bulk', { ids: selected, action }), (d) => `${d?.modified ?? 0} customer${d?.modified === 1 ? '' : 's'} ${action}d`);
    if (res) {
      setSelected([]);
      reload();
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Customer',
      render: (u) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <div className="font-medium text-steel-900 truncate">{u.name}</div>
            <div className="text-xs text-steel-500 truncate">{u.email || 'No email'}</div>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (u) => <span className="tabular text-steel-700 whitespace-nowrap">{u.phone}</span> },
    {
      key: 'accountType',
      header: 'Account',
      render: (u) =>
        u.accountType === 'business' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="blue">Business</Badge>
            {u.business?.pricingTier && <Badge tone={tierTone(u.business.pricingTier)}>{tierTitle(u.business.pricingTier)}</Badge>}
          </div>
        ) : (
          <span className="text-steel-500">Individual</span>
        ),
    },
    { key: 'walletBalance', header: 'Wallet', className: 'text-right', render: (u) => <span className="tabular text-steel-900">{rupees(u.walletBalance)}</span> },
    { key: 'createdAt', header: 'Joined', render: (u) => <span className="text-steel-500 whitespace-nowrap">{fmtDate(u.createdAt)}</span> },
    { key: 'lastLoginAt', header: 'Last seen', render: (u) => <span className="text-steel-500 whitespace-nowrap">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</span> },
    {
      key: 'isActive',
      header: 'Active',
      render: (u) =>
        canEdit ? (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <Toggle checked={u.isActive} disabled={busy === `toggle:${u._id}`} onChange={() => toggle(u)} label={<span className="sr-only">{u.name} active</span>} />
          </div>
        ) : (
          <Badge tone={u.isActive ? 'patina' : 'danger'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
        ),
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            render: (u) => (
              <Button size="sm" variant="ghost" icon={Building2} onClick={() => setTierUser(u)} aria-label={`Set pricing tier for ${u.name}`}>
                Tier
              </Button>
            ),
          },
        ]
      : []),
  ];

  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={data?.pagination ? `${data.pagination.total.toLocaleString(NUMBER_LOCALE)} customers` : 'Households and businesses selling scrap'}
        actions={<ExportButton path={`/admin/users?${qs({ ...filters, format: 'csv' })}`} filename="customers.csv" />}
      />

      <FilterBar>
        <SearchField value={search} onChange={setSearch} placeholder="Name, email or phone" />
        <Field label="Status" className="w-full sm:w-36">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          )}
        </Field>
        <Field label="Account type" className="w-full sm:w-40">
          {(id) => (
            <Select id={id} value={accountType} onChange={(e) => setAccountType(e.target.value)}>
              <option value="">All</option>
              <option value="individual">Individual</option>
              <option value="business">Business</option>
            </Select>
          )}
        </Field>
        <Field label="Sort by" className="w-full sm:w-44">
          {(id) => (
            <Select id={id} value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </FilterBar>

      {selected.length > 0 && canEdit && (
        <Card className="mb-4 !p-3 flex flex-wrap items-center gap-2 border-rust-200 bg-rust-50" role="region" aria-label="Bulk actions">
          <span className="text-sm font-medium text-steel-900 mr-auto">{selected.length} selected</span>
          <Button size="sm" variant="secondary" icon={UserCheck} loading={busy === 'bulk:activate'} onClick={() => bulk('activate')}>
            Activate
          </Button>
          <Button size="sm" variant="danger" icon={UserX} loading={busy === 'bulk:deactivate'} onClick={() => bulk('deactivate')}>
            Deactivate
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
          <DataTable
            rows={data?.users}
            columns={columns}
            loading={loading}
            selectable={canEdit}
            selected={selected}
            onSelect={setSelected}
            empty={
              <EmptyState
                icon={Users}
                title={activeFilters ? 'No customers match' : 'No customers yet'}
                description={activeFilters ? 'Try a different search or filter.' : 'Customers appear here after they sign up or book a pickup.'}
              />
            }
          />
          <Pagination pagination={data?.pagination} onPage={setPage} />
        </>
      )}

      <TierModal user={tierUser} tiers={tiers} onClose={() => setTierUser(null)} onSaved={reload} />
    </div>
  );
}
