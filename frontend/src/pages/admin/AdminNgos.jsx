import { useState } from 'react';
import { HandHeart, Pencil, Plus } from 'lucide-react';
import api from '../../services/api';
import useApi from '../../hooks/useApi';
import { useConfig } from '../../context/ConfigContext';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, PageHeader, Textarea, Toggle, cx } from '../../components/ui';
import { Async, ChipToggles, ImageField, Thumb, useAction, Modal } from './_catalog/shared';

const ACCEPTS = [
  { value: 'normal-recyclables', label: 'Recyclables' },
  { value: 'e-waste', label: 'E-waste' },
  { value: 'appliances', label: 'Appliances' },
  { value: 'vehicle-scrap', label: 'Vehicle scrap' },
];
const acceptLabel = (v) => ACCEPTS.find((a) => a.value === v)?.label || v;

export default function AdminNgos() {
  const res = useApi('/admin/ngos');
  const [editing, setEditing] = useState(null);
  const { busy, run } = useAction();

  async function toggle(n) {
    const r = await run(n._id, () => api.put(`/admin/ngos/${n._id}`, { isActive: !n.isActive }), {
      success: n.isActive ? `${n.name} hidden` : `${n.name} is listed`,
    });
    if (r.ok) res.setData((d) => ({ ...d, ngos: d.ngos.map((x) => (x._id === n._id ? { ...x, isActive: !n.isActive } : x)) }));
  }

  return (
    <div>
      <PageHeader
        title="NGO partners"
        subtitle="Customers can donate their scrap value to these organisations instead of taking payment."
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add NGO
          </Button>
        }
      />
      <Async
        {...res}
        onRetry={res.reload}
        isEmpty={(d) => !d.ngos.length}
        empty={
          <EmptyState
            icon={HandHeart}
            title="No NGO partners yet"
            description="Add a partner so customers can donate pickups to a cause."
            action={<Button icon={Plus} onClick={() => setEditing('new')}>Add NGO</Button>}
          />
        }
      >
        {(d) => (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {d.ngos.map((n) => (
              <Card key={n._id} className={cx('flex flex-col gap-4', !n.isActive && 'opacity-75')}>
                <div className="flex items-start gap-3">
                  <Thumb src={n.logo} fallback={HandHeart} className="w-12 h-12" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-steel-900">{n.name}</h3>
                    {n.registrationNumber && <p className="text-xs text-steel-500">Reg. {n.registrationNumber}</p>}
                  </div>
                  <IconButton label={`Edit ${n.name}`} icon={Pencil} onClick={() => setEditing(n)} />
                </div>
                {n.description && <p className="text-sm text-steel-600 line-clamp-3">{n.description}</p>}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {n.cities?.length ? n.cities.map((c) => <Badge key={c}>{c}</Badge>) : <Badge tone="patina">All cities</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {n.accepts?.length ? (
                      n.accepts.map((a) => (
                        <Badge key={a} tone="blue">
                          {acceptLabel(a)}
                        </Badge>
                      ))
                    ) : (
                      <Badge tone="blue">Accepts everything</Badge>
                    )}
                  </div>
                </div>
                <div className="pt-3 mt-auto border-t border-steel-100">
                  <Toggle checked={n.isActive} disabled={busy === n._id} onChange={() => toggle(n)} label={n.isActive ? 'Shown to customers' : 'Hidden'} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>
      {editing && (
        <NgoForm
          ngo={editing === 'new' ? null : editing}
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

function NgoForm({ ngo, onClose, onSaved }) {
  const { cities } = useConfig();
  const [f, setF] = useState(() => ({
    name: ngo?.name || '',
    description: ngo?.description || '',
    registrationNumber: ngo?.registrationNumber || '',
    cities: ngo?.cities || [],
    accepts: ngo?.accepts || [],
    logo: ngo?.logo || '',
    isActive: ngo?.isActive ?? true,
  }));
  const [errors, setErrors] = useState({});
  const { busy, run } = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Enter the organisation name';
    if (f.description.length > 500) er.description = 'Keep it under 500 characters';
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {
      name: f.name.trim(),
      description: f.description.trim(),
      registrationNumber: f.registrationNumber.trim(),
      cities: f.cities,
      accepts: f.accepts,
      logo: f.logo || '',
      isActive: f.isActive,
    };
    const r = await run('save', () => (ngo ? api.put(`/admin/ngos/${ngo._id}`, body) : api.post('/admin/ngos', body)), {
      success: ngo ? 'NGO updated' : 'NGO added',
    });
    if (r.ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={ngo ? `Edit ${ngo.name}` : 'Add NGO partner'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="ngo-form" loading={busy === 'save'}>
            {ngo ? 'Save changes' : 'Add NGO'}
          </Button>
        </>
      }
    >
      <form id="ngo-form" onSubmit={save} className="space-y-5" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" required error={errors.name}>
            {(id) => <Input id={id} value={f.name} onChange={(e) => set('name')(e.target.value)} maxLength={120} invalid={!!errors.name} />}
          </Field>
          <Field label="Registration number" hint="e.g. Social Welfare Council (SWC) or District Administration Office registration">
            {(id) => <Input id={id} value={f.registrationNumber} onChange={(e) => set('registrationNumber')(e.target.value)} maxLength={60} />}
          </Field>
        </div>
        <Field label="Description" error={errors.description} hint={`${f.description.length}/500 · shown to customers when donating`}>
          {(id) => <Textarea id={id} rows={3} value={f.description} onChange={(e) => set('description')(e.target.value)} maxLength={500} />}
        </Field>
        <ImageField label="Logo" value={f.logo} onChange={set('logo')} folder="ngos" />
        <div>
          <ChipToggles label="Cities" options={cities} value={f.cities} onChange={set('cities')} allowCustom customPlaceholder="Add a city" />
          <p className="text-xs text-steel-500 mt-1.5">Select none to show this NGO in every city.</p>
        </div>
        <fieldset>
          <legend className="label">Accepts donations from</legend>
          <div className="grid grid-cols-2 gap-2">
            {ACCEPTS.map((a) => {
              const on = f.accepts.includes(a.value);
              return (
                <label
                  key={a.value}
                  className={cx(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors',
                    on ? 'border-rust-500 bg-rust-50 text-steel-900' : 'border-steel-200 text-steel-700 hover:border-steel-400'
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-rust-600"
                    checked={on}
                    onChange={() => set('accepts')(on ? f.accepts.filter((x) => x !== a.value) : [...f.accepts, a.value])}
                  />
                  {a.label}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-steel-500 mt-1.5">Select none to accept every category.</p>
        </fieldset>
        <Toggle checked={f.isActive} onChange={set('isActive')} label="Shown to customers" />
      </form>
    </Modal>
  );
}
