import { useEffect, useState } from 'react';
import { AlertTriangle, MapPin, Phone, ShieldCheck, UserPlus, Wand2 } from 'lucide-react';
import useApi from '../../../hooks/useApi';
import api from '../../../services/api';
import PickupTimeline from '../../../components/PickupTimeline';
import { Badge, Button, ErrorState, Field, Modal, Select, SkeletonRows, StatusBadge, Textarea, cx } from '../../../components/ui';
import { STATUS_LABEL, addressLine, fmtDate, fmtDateTime, rupees, unitLabel } from '../../../utils/format';
import { payoutLabel } from '../../../utils/locale';
import { flagLabel, useCollectorOptions, useMutation } from './shared';

const ACTIVE = ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING'];
const SETTABLE = [...ACTIVE, 'CANCELLED'];

function Section({ title, children, className, action }) {
  return (
    <section className={cx('py-4 border-t border-steel-100 first:border-0 first:pt-0', className)}>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-steel-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-steel-500">{label}</dt>
      <dd className="text-steel-900 text-right tabular">{children ?? '—'}</dd>
    </div>
  );
}

function Thumbs({ urls, label }) {
  if (!urls?.length) return <p className="text-sm text-steel-400">None</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <li key={u}>
          <a href={u} target="_blank" rel="noreferrer" className="block w-20 h-20 rounded-lg overflow-hidden border border-steel-100 bg-steel-100 hover:opacity-90">
            <img src={u} alt={`${label} ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}

const DECISION_TONE = { accepted: 'patina', disputed: 'danger', pending: 'amber' };
const PAYOUT_TONE = { paid: 'patina', failed: 'danger', pending: 'amber', processing: 'blue' };

export default function PickupDetailModal({ pickupId, onClose, onChanged }) {
  const open = Boolean(pickupId);
  const { data, error, loading, reload } = useApi(pickupId ? `/admin/pickups/${pickupId}` : null, { enabled: open });
  const { busy, run } = useMutation();
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [otherId, setOtherId] = useState('');
  const { collectors } = useCollectorOptions(assignOpen);

  const p = data?.pickup?.pickupId === pickupId ? data.pickup : null;
  const candidates = p ? data.candidates || [] : [];

  useEffect(() => {
    setStatus('');
    setReason('');
    setAssignOpen(false);
    setOtherId('');
  }, [pickupId]);

  const after = async (res) => {
    if (res) {
      await reload();
      onChanged?.();
    }
    return res;
  };

  const assign = (collectorId, name) =>
    run(`assign:${collectorId}`, () => api.post('/admin/assign-collector', { pickupId: p.pickupId, collectorId }), `Assigned to ${name || 'collector'}`).then(after);
  const autoAssign = () =>
    run('auto', () => api.post(`/admin/pickups/${p.pickupId}/auto-assign`), (d) => `Assigned to ${d?.collector?.name || 'collector'}`).then(after);
  const clearFlags = () => run('flags', () => api.put(`/admin/pickups/${p.pickupId}/clear-flags`), 'Flags cleared').then(after);
  const saveStatus = async () => {
    const res = await run('status', () => api.put(`/admin/pickups/${p.pickupId}/status`, { status, ...(reason.trim() ? { reason: reason.trim() } : {}) }), `Status set to ${STATUS_LABEL[status]}`).then(after);
    if (res) {
      setStatus('');
      setReason('');
    }
  };

  const isActive = p && ACTIVE.includes(p.status);
  const estimate = p ? `${rupees(p.estimatedValueMin)} – ${rupees(p.estimatedValueMax)}` : '';

  return (
    <Modal open={open} onClose={onClose} title={pickupId ? `Pickup ${pickupId}` : 'Pickup'} size="xl">
      {error && !p ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !p ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className={cx('grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-6 transition-opacity', loading && 'opacity-60')}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <StatusBadge status={p.status} />
              <Badge tone={p.type === 'donation' ? 'patina' : 'steel'}>{p.type === 'donation' ? `Donation${p.ngo?.name ? ` · ${p.ngo.name}` : ''}` : 'Sale'}</Badge>
              <Badge>Source: {p.source}</Badge>
              {p.rescheduleCount > 0 && <Badge tone="amber">Rescheduled {p.rescheduleCount}×</Badge>}
              <span className="text-xs text-steel-500 ml-auto">Booked {fmtDateTime(p.createdAt)}</span>
            </div>

            {p.flags?.length > 0 && (
              <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-danger-100 bg-danger-50 p-3">
                <AlertTriangle className="w-5 h-5 text-danger-600 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0 text-sm">
                  <span className="font-medium text-danger-700">Flagged: </span>
                  <span className="text-steel-700">{p.flags.map(flagLabel).join(', ')}</span>
                </div>
                <Button size="sm" variant="outline" icon={ShieldCheck} loading={busy === 'flags'} onClick={clearFlags}>
                  Clear flags
                </Button>
              </div>
            )}

            <Section title="Customer & address">
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-steel-900">{p.customer?.name || '—'}</p>
                  {p.customer?.email && <p className="text-steel-500">{p.customer.email}</p>}
                  <p className="text-steel-700 inline-flex items-center gap-1.5 mt-1">
                    <Phone className="w-3.5 h-3.5" aria-hidden />
                    <a href={`tel:${p.contactPhone}`} className="hover:text-rust-700">
                      {p.contactPhone}
                    </a>
                  </p>
                  {p.customer?.accountType === 'business' && <Badge tone="blue" className="mt-1">Business</Badge>}
                </div>
                <div>
                  <p className="text-steel-700 inline-flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
                    {addressLine(p.addressSnapshot) || p.pinCode}
                  </p>
                  <p className="text-steel-500 mt-1">
                    {fmtDate(p.scheduledDate)} · {p.timeSlot}
                  </p>
                </div>
              </div>
              {p.notes && <p className="mt-3 text-sm text-steel-700 rounded-lg bg-steel-50 p-3">“{p.notes}”</p>}
            </Section>

            <Section title="Items">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left text-steel-500 text-xs">
                      <th className="px-1 py-1.5 font-medium">Item</th>
                      <th className="px-1 py-1.5 font-medium text-right">Estimated</th>
                      <th className="px-1 py-1.5 font-medium text-right">Actual</th>
                      <th className="px-1 py-1.5 font-medium text-right">Rate</th>
                      <th className="px-1 py-1.5 font-medium text-right">Subtotal</th>
                      <th className="px-1 py-1.5 font-medium">
                        <span className="sr-only">Scale photo</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.items.map((i, idx) => {
                      const u = unitLabel(i.unit);
                      return (
                        <tr key={`${i.item}-${idx}`} className="border-t border-steel-100">
                          <td className="px-1 py-2 text-steel-900">
                            {i.itemName}
                            {i.condition && <span className="block text-xs text-steel-500">{i.condition.replace('_', ' ')}</span>}
                          </td>
                          <td className="px-1 py-2 text-right tabular text-steel-700">
                            {i.estimatedQuantity} {u}
                          </td>
                          <td className="px-1 py-2 text-right tabular text-steel-900">{i.actualWeight != null ? `${i.actualWeight} ${u}` : '—'}</td>
                          <td className="px-1 py-2 text-right tabular text-steel-700">{i.rateApplied != null ? `${rupees(i.rateApplied, { decimals: 2 })}/${u}` : '—'}</td>
                          <td className="px-1 py-2 text-right tabular text-steel-900">{i.subtotal != null ? rupees(i.subtotal) : '—'}</td>
                          <td className="px-1 py-2 w-12">
                            {i.weighingPhoto && (
                              <a href={i.weighingPhoto} target="_blank" rel="noreferrer" className="block w-10 h-10 rounded-md overflow-hidden border border-steel-100">
                                <img src={i.weighingPhoto} alt={`Scale reading for ${i.itemName}`} loading="lazy" className="w-full h-full object-cover" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Money">
              <dl className="grid sm:grid-cols-2 gap-x-8">
                <div>
                  <Row label="Estimate">{estimate}</Row>
                  <Row label="Final amount">{p.finalAmount != null ? rupees(p.finalAmount) : '—'}</Row>
                  <Row label="Bonus">{p.bonusAmount ? rupees(p.bonusAmount) : '—'}</Row>
                  <Row label="Coupon">{p.coupon?.code ? `${p.coupon.code}${p.coupon.bonusAmount ? ` (+${rupees(p.coupon.bonusAmount)})` : ''}` : '—'}</Row>
                </div>
                <div>
                  <Row label="Payout method">{p.payout?.method ? payoutLabel(p.payout.method) : '—'}</Row>
                  <Row label="Payout status">{p.payout?.status ? <Badge tone={PAYOUT_TONE[p.payout.status] || 'steel'}>{p.payout.status}</Badge> : '—'}</Row>
                  {p.payout?.walletId && <Row label={`${payoutLabel(p.payout.method)} ID`}>{p.payout.walletId}</Row>}
                  {p.payout?.reference && <Row label="Reference">{p.payout.reference}</Row>}
                  {p.payout?.paidAt && <Row label="Paid at">{fmtDateTime(p.payout.paidAt)}</Row>}
                  <Row label="Customer decision">
                    {p.customerDecision?.status ? <Badge tone={DECISION_TONE[p.customerDecision.status] || 'steel'}>{p.customerDecision.status}</Badge> : '—'}
                  </Row>
                </div>
              </dl>
              {p.customerDecision?.note && (
                <p className="mt-2 text-sm text-steel-700 rounded-lg bg-steel-50 p-3">
                  <span className="text-steel-500">Customer note{p.customerDecision.at ? ` (${fmtDateTime(p.customerDecision.at)})` : ''}: </span>
                  {p.customerDecision.note}
                </p>
              )}
            </Section>

            <Section title="Photos">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-steel-500 mb-1.5">From customer</p>
                  <Thumbs urls={p.photos} label="Customer photo" />
                </div>
                <div>
                  <p className="text-xs text-steel-500 mb-1.5">Collector evidence</p>
                  <Thumbs urls={p.evidencePhotos} label="Evidence photo" />
                </div>
              </div>
            </Section>

            {p.status === 'CANCELLED' && (
              <Section title="Cancellation">
                <p className="text-sm text-steel-700">
                  {p.cancelReason || 'No reason given'}
                  {p.cancelledBy && <span className="text-steel-500"> · by {p.cancelledBy}</span>}
                </p>
              </Section>
            )}
          </div>

          <aside className="space-y-5 min-w-0">
            <div className="rounded-xl border border-steel-100 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-steel-500 mb-2">Collector</h3>
              {p.collector ? (
                <div className="text-sm">
                  <p className="font-medium text-steel-900">{p.collector.name}</p>
                  {p.collector.phone && <p className="text-steel-500">{p.collector.phone}</p>}
                </div>
              ) : (
                <Badge tone="amber">Unassigned</Badge>
              )}
              {isActive && (
                <div className="mt-3 space-y-2">
                  {candidates.length > 0 && (
                    <>
                      <p className="text-xs text-steel-500">Suggested</p>
                      <ul className="space-y-1.5">
                        {candidates.map((c) => (
                          <li key={c.id} className="flex items-center gap-2 text-sm">
                            <span className="flex-1 min-w-0">
                              <span className="block truncate text-steel-900">{c.name}</span>
                              <span className="block text-xs text-steel-500">
                                {c.load} today{c.km != null ? ` · ${c.km} km` : ''}
                                {c.servesArea ? ' · serves this area' : c.servesPin ? ' · serves postal code' : ''}
                              </span>
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              loading={busy === `assign:${c.id}`}
                              disabled={String(p.collector?._id) === String(c.id)}
                              onClick={() => assign(c.id, c.name)}
                              aria-label={`Assign to ${c.name}`}
                            >
                              Assign
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="secondary" icon={Wand2} loading={busy === 'auto'} onClick={autoAssign}>
                      Auto-assign
                    </Button>
                    <Button size="sm" variant="ghost" icon={UserPlus} onClick={() => setAssignOpen((v) => !v)} aria-expanded={assignOpen}>
                      Other…
                    </Button>
                  </div>
                  {assignOpen && (
                    <div className="space-y-2 pt-1">
                      <Field label="Any available collector">
                        {(id) => (
                          <Select id={id} value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                            <option value="">Choose…</option>
                            {collectors.map((c) => (
                              <option key={c._id} value={c._id}>
                                {c.name} · {c.collectorProfile?.city || '—'} · {c.activePickups} active
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!otherId}
                        loading={busy === `assign:${otherId}`}
                        onClick={async () => {
                          const c = collectors.find((x) => x._id === otherId);
                          const res = await assign(otherId, c?.name);
                          if (res) {
                            setAssignOpen(false);
                            setOtherId('');
                          }
                        }}
                      >
                        Assign
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {isActive && (
              <div className="rounded-xl border border-steel-100 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-steel-500">Change status</h3>
                <Field label="New status">
                  {(id) => (
                    <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="">Choose…</option>
                      {SETTABLE.filter((s) => s !== p.status).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Reason" hint={status === 'CANCELLED' ? 'Shown to the customer' : 'Saved to the audit log'}>
                  {(id) => <Textarea id={id} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className="!min-h-[64px]" />}
                </Field>
                <Button size="sm" variant={status === 'CANCELLED' ? 'danger' : 'primary'} disabled={!status} loading={busy === 'status'} onClick={saveStatus} className="w-full">
                  {status === 'CANCELLED' ? 'Cancel pickup' : 'Update status'}
                </Button>
              </div>
            )}

            <div className="rounded-xl border border-steel-100 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-steel-500 mb-3">Timeline</h3>
              <PickupTimeline status={p.status} history={p.statusHistory} />
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}
