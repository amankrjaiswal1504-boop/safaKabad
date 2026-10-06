import { useEffect, useState } from 'react';
import { Headphones, Landmark, Plus, ShieldCheck, Truck, UserCog } from 'lucide-react';
import useApi from '../../hooks/useApi';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Avatar, Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, SectionTitle, Select, Toggle } from '../../components/ui';
import { timeAgo } from '../../utils/format';
import { MOBILE_PLACEHOLDER, isMobile } from '../../utils/locale';
import { useMutation } from './_ops/shared';

const ROLE_INFO = {
  support: {
    label: 'Support',
    icon: Headphones,
    tone: 'blue',
    can: ['Chat & support tickets', 'Moderate reviews', 'View customers and pickups (read-only)'],
  },
  operations: {
    label: 'Operations',
    icon: Truck,
    tone: 'amber',
    can: ['Manage pickups and the dispatch board', 'Collectors, service areas and time slots', 'Catalog and scrap prices', 'View customers (read-only)'],
  },
  finance: {
    label: 'Finance',
    icon: Landmark,
    tone: 'patina',
    can: ['Payouts, payments and withdrawals', 'Analytics and reports', 'Coupons', 'View customers and pickups (read-only)'],
  },
};
const roleLabel = (r) => ROLE_INFO[r]?.label || r;

const EMPTY = { name: '', email: '', phone: '', password: '', staffRole: 'support' };

function CreateStaffModal({ open, roles, onClose, onSaved }) {
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const { busy, run } = useMutation();
  useEffect(() => {
    if (open) {
      setF(EMPTY);
      setErrors({});
    }
  }, [open]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = 'Enter the full name';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';
    if (!isMobile(f.phone)) e.phone = 'Enter a valid 10-digit mobile number';
    if (f.password.length < 8) e.password = 'At least 8 characters';
    setErrors(e);
    if (Object.keys(e).length) return;
    const res = await run('create', () => api.post('/admin/staff', { ...f, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() }), `${f.name.trim()} added as ${roleLabel(f.staffRole)}`);
    if (res) {
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add staff member"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy === 'create'} onClick={save}>
            Create account
          </Button>
        </>
      }
    >
      <form
        className="grid sm:grid-cols-2 gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Full name" required error={errors.name}>
          {(id) => <Input id={id} value={f.name} onChange={set('name')} invalid={Boolean(errors.name)} autoComplete="off" />}
        </Field>
        <Field label="Mobile number" required error={errors.phone}>
          {(id) => <Input id={id} type="tel" value={f.phone} onChange={set('phone')} invalid={Boolean(errors.phone)} placeholder={MOBILE_PLACEHOLDER} />}
        </Field>
        <Field label="Work email" required error={errors.email}>
          {(id) => <Input id={id} type="email" value={f.email} onChange={set('email')} invalid={Boolean(errors.email)} autoComplete="off" />}
        </Field>
        <Field label="Temporary password" required error={errors.password} hint="At least 8 characters">
          {(id) => <Input id={id} type="password" value={f.password} onChange={set('password')} invalid={Boolean(errors.password)} autoComplete="new-password" />}
        </Field>
        <Field label="Role" className="sm:col-span-2" hint={ROLE_INFO[f.staffRole]?.can.join(' · ')}>
          {(id) => (
            <Select id={id} value={f.staffRole} onChange={set('staffRole')}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function AdminStaff() {
  const { user } = useAuth();
  const { data, error, loading, reload, setData } = useApi('/admin/staff');
  const [creating, setCreating] = useState(false);
  const { busy, run } = useMutation();
  const roles = data?.roles || Object.keys(ROLE_INFO);

  const update = async (s, patch, msg) => {
    const res = await run(`u:${s._id}`, () => api.put(`/admin/staff/${s._id}`, patch), msg);
    if (res?.user) setData((d) => ({ ...d, staff: d.staff.map((x) => (x._id === s._id ? { ...x, ...res.user } : x)) }));
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (s) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          <Avatar name={s.name} size="sm" />
          <div className="min-w-0">
            <div className="font-medium text-steel-900 truncate">
              {s.name}
              {s._id === user?._id && <span className="text-xs text-steel-500 font-normal"> (you)</span>}
            </div>
            <div className="text-xs text-steel-500 truncate">{s.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (s) =>
        s.role === 'admin' ? (
          <Badge tone="rust">
            <ShieldCheck className="w-3 h-3" aria-hidden /> Admin
          </Badge>
        ) : (
          <Select
            aria-label={`Role for ${s.name}`}
            value={s.staffRole || ''}
            disabled={busy === `u:${s._id}`}
            onChange={(e) => update(s, { staffRole: e.target.value }, `${s.name} is now ${roleLabel(e.target.value)}`)}
            className="!py-1.5 min-w-[140px]"
          >
            {!s.staffRole && <option value="">No role</option>}
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
        ),
    },
    { key: 'lastLoginAt', header: 'Last sign-in', render: (s) => <span className="text-steel-500 whitespace-nowrap">{s.lastLoginAt ? timeAgo(s.lastLoginAt) : 'Never'}</span> },
    {
      key: 'isActive',
      header: 'Active',
      render: (s) =>
        s.role === 'admin' ? (
          <span className="text-xs text-steel-500">Always</span>
        ) : (
          <Toggle
            checked={s.isActive}
            disabled={busy === `u:${s._id}`}
            onChange={(v) => update(s, { isActive: v }, v ? `${s.name} reactivated` : `${s.name} deactivated`)}
            label={<span className="sr-only">{s.name} active</span>}
          />
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Staff & roles"
        subtitle="Give teammates only the access they need"
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)} disabled={!data}>
            Add staff
          </Button>
        }
      />

      <section aria-label="Role permissions" className="grid md:grid-cols-3 gap-4 mb-6">
        {Object.entries(ROLE_INFO).map(([key, r]) => (
          <Card key={key}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-lg bg-steel-100 text-steel-700 flex items-center justify-center">
                <r.icon className="w-4 h-4" aria-hidden />
              </span>
              <h2 className="font-head font-semibold text-steel-900">{r.label}</h2>
              <span className="ml-auto text-xs text-steel-500 tabular">{data?.staff?.filter((s) => s.staffRole === key && s.role === 'staff').length ?? '–'} people</span>
            </div>
            <ul className="space-y-1.5 text-sm text-steel-700">
              {r.can.map((c) => (
                <li key={c} className="flex gap-2">
                  <span className="mt-2 w-1 h-1 rounded-full bg-steel-400 shrink-0" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      <SectionTitle title="Team" subtitle="Admins have full access, including settings, staff and the audit log." />
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <DataTable
          rows={data?.staff}
          columns={columns}
          loading={loading}
          empty={<EmptyState icon={UserCog} title="No staff yet" description="Add teammates for support, operations or finance." />}
        />
      )}

      <CreateStaffModal open={creating} roles={roles} onClose={() => setCreating(false)} onSaved={reload} />
    </div>
  );
}
