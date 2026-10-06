import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Plus, Settings, ShieldCheck, ShieldOff, Trash2, UserX } from 'lucide-react';
import useApi from '../../hooks/useApi';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, IconButton, Input, Modal, PageHeader, Select, SkeletonRows, StatusBadge, Tabs, Textarea } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../utils/format';
import { MOBILE_PLACEHOLDER, POSTAL_CODE_LABEL, POSTAL_CODE_RE } from '../../utils/locale';
import { flagLabel, useMutation } from './_ops/shared';

const TYPES = [
  { value: 'phone', label: 'Phone number', placeholder: MOBILE_PLACEHOLDER },
  { value: 'email', label: 'Email address', placeholder: 'someone@example.com' },
  { value: 'ip', label: 'IP address', placeholder: '203.0.113.7' },
  { value: 'pincode', label: POSTAL_CODE_LABEL, placeholder: '44600' },
];
const typeLabel = (t) => TYPES.find((x) => x.value === t)?.label || t;

function BlockModal({ initial, onClose, onSaved }) {
  const [f, setF] = useState(initial || { type: 'phone', value: '', reason: '' });
  const [error, setError] = useState('');
  const { busy, run } = useMutation();
  const t = TYPES.find((x) => x.value === f.type);

  const save = async () => {
    const value = f.value.trim();
    if (value.length < 3) return setError('Enter at least 3 characters');
    if (f.type === 'pincode' && !POSTAL_CODE_RE.test(value)) return setError('Postal code must be 5 digits');
    if (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(value)) return setError('Enter a valid email');
    setError('');
    const res = await run('add', () => api.post('/admin/fraud/blocklist', { type: f.type, value, ...(f.reason.trim() ? { reason: f.reason.trim() } : {}) }), `${typeLabel(f.type)} blocked`);
    if (res) {
      onSaved();
      onClose();
    }
    return null;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add to blocklist"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" icon={Ban} loading={busy === 'add'} onClick={save}>
            Block
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Type">
          {(id) => (
            <Select id={id} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {TYPES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Value" required error={error}>
          {(id) => <Input id={id} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={t?.placeholder} invalid={Boolean(error)} maxLength={120} />}
        </Field>
        <Field label="Reason" hint="Visible to admins only">
          {(id) => <Textarea id={id} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} rows={2} />}
        </Field>
        {(f.type === 'phone' || f.type === 'email') && (
          <p className="text-xs text-steel-500 rounded-lg bg-steel-50 p-3">Blocking a {f.type === 'phone' ? 'phone number' : 'email'} also deactivates any customer account that uses it.</p>
        )}
      </div>
    </Modal>
  );
}

export default function AdminFraud() {
  const { can } = useAuth();
  const isAdmin = can('*');
  const canClear = can('pickups');
  const { data, error, loading, reload, setData } = useApi('/admin/fraud');
  const [tab, setTab] = useState('flagged');
  const [blocking, setBlocking] = useState(null);
  const [removing, setRemoving] = useState(null);
  const { busy, run } = useMutation();

  const clearFlags = async (p) => {
    const res = await run(`clear:${p.pickupId}`, () => api.put(`/admin/pickups/${p.pickupId}/clear-flags`), `Flags cleared on ${p.pickupId}`);
    if (res) setData((d) => ({ ...d, flagged: d.flagged.filter((x) => x._id !== p._id) }));
  };
  const remove = async () => {
    const res = await run('remove', () => api.delete(`/admin/fraud/blocklist/${removing._id}`), `${removing.value} unblocked`);
    if (res) {
      setData((d) => ({ ...d, entries: d.entries.filter((x) => x._id !== removing._id) }));
      setRemoving(null);
    }
  };
  const blockedPhones = new Set((data?.entries || []).filter((e) => e.type === 'phone').map((e) => e.value));

  const flaggedCols = [
    { key: 'pickupId', header: 'Pickup', render: (p) => <Link to={`/admin/pickups?search=${p.pickupId}`} className="font-mono text-xs font-semibold text-steel-900 hover:text-rust-700">{p.pickupId}</Link> },
    {
      key: 'customer',
      header: 'Customer',
      render: (p) => (
        <div className="min-w-[140px]">
          <div className="text-steel-900">{p.customer?.name || '—'}</div>
          <div className="text-xs text-steel-500">{p.customer?.phone || p.contactPhone}</div>
        </div>
      ),
    },
    {
      key: 'flags',
      header: 'Signals',
      render: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.flags.map((f) => (
            <Badge key={f} tone="danger">
              {flagLabel(f)}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    { key: 'createdAt', header: 'Booked', render: (p) => <span className="text-steel-500 whitespace-nowrap">{fmtDateTime(p.createdAt)}</span> },
    ...(canClear
      ? [
          {
            key: 'act',
            header: <span className="sr-only">Actions</span>,
            render: (p) => (
              <Button size="sm" variant="outline" icon={ShieldCheck} loading={busy === `clear:${p.pickupId}`} onClick={() => clearFlags(p)}>
                Clear
              </Button>
            ),
          },
        ]
      : []),
  ];

  const cancellerCols = [
    { key: 'name', header: 'Customer', render: (c) => <span className="text-steel-900">{c.name}</span> },
    { key: 'phone', header: 'Phone', render: (c) => <span className="tabular text-steel-700">{c.phone}</span> },
    { key: 'cancellations', header: 'Cancellations (30 days)', className: 'tabular', render: (c) => <Badge tone={c.cancellations >= 5 ? 'danger' : 'amber'}>{c.cancellations}</Badge> },
    {
      key: 'act',
      header: <span className="sr-only">Actions</span>,
      render: (c) =>
        blockedPhones.has(String(c.phone).toLowerCase()) ? (
          <Badge>Blocked</Badge>
        ) : isAdmin ? (
          <Button size="sm" variant="outline" icon={Ban} onClick={() => setBlocking({ type: 'phone', value: c.phone, reason: `${c.cancellations} cancellations in 30 days` })}>
            Block phone
          </Button>
        ) : null,
    },
  ];

  const entryCols = [
    { key: 'type', header: 'Type', render: (e) => <Badge>{typeLabel(e.type)}</Badge> },
    { key: 'value', header: 'Value', render: (e) => <span className="font-mono text-xs text-steel-900 break-all">{e.value}</span> },
    { key: 'reason', header: 'Reason', render: (e) => <span className="text-steel-700">{e.reason || '—'}</span> },
    { key: 'addedBy', header: 'Added', render: (e) => <span className="text-xs text-steel-500 whitespace-nowrap">{e.addedBy?.name || 'System'} · {fmtDate(e.createdAt)}</span> },
    ...(isAdmin ? [{ key: 'act', header: <span className="sr-only">Actions</span>, render: (e) => <IconButton label={`Unblock ${e.value}`} icon={Trash2} onClick={() => setRemoving(e)} /> }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Fraud & abuse"
        subtitle="Review flagged bookings, repeat cancellers and blocked contacts"
        actions={
          <>
            {isAdmin && (
              <Button variant="outline" icon={Settings} to="/admin/settings">
                Limits & rules
              </Button>
            )}
            {isAdmin && (
              <Button icon={Plus} onClick={() => setBlocking({ type: 'phone', value: '', reason: '' })}>
                Block
              </Button>
            )}
          </>
        }
      />

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <Tabs
            className="mb-5"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'flagged', label: 'Flagged pickups', count: data.flagged.length },
              { value: 'cancellers', label: 'Frequent cancellers', count: data.frequentCancellers.length },
              { value: 'blocklist', label: 'Blocklist', count: data.entries.length },
            ]}
          />
          <div role="tabpanel" className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {tab === 'flagged' && (
              <DataTable
                rows={data.flagged}
                columns={flaggedCols}
                empty={<EmptyState icon={ShieldCheck} title="No flagged pickups" description="Bookings that trip a fraud rule (e.g. duplicate bookings) show up here." />}
              />
            )}
            {tab === 'cancellers' && (
              <>
                <p className="text-sm text-steel-500 mb-3">Customers who cancelled 2 or more pickups in the last 30 days.</p>
                <DataTable rows={data.frequentCancellers} columns={cancellerCols} empty={<EmptyState icon={UserX} title="No repeat cancellers" description="Nobody has cancelled more than once in the last 30 days." />} />
              </>
            )}
            {tab === 'blocklist' && (
              <DataTable
                rows={data.entries}
                columns={entryCols}
                empty={
                  <EmptyState
                    icon={ShieldOff}
                    title="Blocklist is empty"
                    description="Blocked phones, emails, IPs and postal codes can't sign up or book."
                    action={isAdmin ? <Button icon={Plus} onClick={() => setBlocking({ type: 'phone', value: '', reason: '' })}>Add entry</Button> : null}
                  />
                }
              />
            )}
          </div>
          <Card className="mt-6 !p-4 flex flex-wrap items-center gap-3 text-sm">
            <Settings className="w-4 h-4 text-steel-500" aria-hidden />
            <span className="text-steel-700 flex-1 min-w-[200px]">Limits on active bookings and cancellations, and the duplicate-booking window, are configured in Site settings.</span>
            {isAdmin && (
              <Link to="/admin/settings" className="font-medium text-rust-700 hover:text-rust-800">
                Open settings
              </Link>
            )}
          </Card>
        </>
      )}

      {blocking && <BlockModal initial={blocking} onClose={() => setBlocking(null)} onSaved={reload} />}

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove from blocklist?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep blocked
            </Button>
            <Button loading={busy === 'remove'} onClick={remove}>
              Unblock
            </Button>
          </>
        }
      >
        {removing && (
          <p className="text-sm text-steel-700">
            <span className="font-mono text-steel-900">{removing.value}</span> ({typeLabel(removing.type).toLowerCase()}) will be able to sign up and book again. Accounts deactivated by this
            block stay inactive until you reactivate them on the Customers page.
          </p>
        )}
      </Modal>
    </div>
  );
}
