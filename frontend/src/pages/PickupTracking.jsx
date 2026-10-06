import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, Award, CalendarClock, CalendarPlus, FileDown, KeyRound, Navigation, Phone, Receipt as ReceiptIcon, Star, XCircle } from 'lucide-react';
import api, { download } from '../services/api';
import useApi from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { useI18n } from '../i18n/I18nContext';
import { Avatar, Badge, Button, Card, ErrorState, Field, Modal, PageHeader, Skeleton, Stars, StatusBadge, Textarea, cx } from '../components/ui';
import PickupTimeline from '../components/PickupTimeline';
import MapView from '../components/MapView';
import SlotPicker from '../components/SlotPicker';
import { addressLine, fmtDateTime, fmtDay, rupees, unitLabel } from '../utils/format';
import { payoutLabel } from '../utils/locale';

function RatingForm({ pickupId, onDone }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!rating) return toast.error('Pick a star rating');
    setBusy(true);
    try {
      await api.post(`/pickups/${pickupId}/review`, { rating, comment: comment || undefined });
      toast.success('Thanks for your feedback!');
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} star${i > 1 ? 's' : ''}`} onClick={() => setRating(i)} className="p-1">
            <Star className={cx('w-8 h-8', i <= rating ? 'fill-amber-600 text-amber-600' : 'text-steel-300')} aria-hidden />
          </button>
        ))}
      </div>
      <Textarea className="mt-3" placeholder="How was the pickup? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} aria-label="Comment" />
      <Button className="mt-3" loading={busy} onClick={submit}>
        Submit review
      </Button>
    </div>
  );
}

export default function PickupTracking() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const { connected, watchPickup, subscribe } = useRealtime();
  const { data, error, loading, reload, setData } = useApi(`/pickups/${id}`);
  const [live, setLive] = useState(null);
  const [modal, setModal] = useState(null); // 'cancel' | 'reschedule' | 'dispute'
  const [reason, setReason] = useState('');
  const [resched, setResched] = useState({ date: '', slot: '' });
  const [busy, setBusy] = useState(false);
  const pickup = data?.pickup;
  usePageMeta({ title: `Pickup ${id}`, noindex: true });

  useEffect(() => {
    if (!connected) return undefined;
    const unwatch = watchPickup(id);
    const offStatus = subscribe('pickup:status', (e) => e.pickupId === id && reload());
    const offLoc = subscribe('collector:location', (e) => e.pickupId === id && setLive(e));
    return () => {
      unwatch();
      offStatus();
      offLoc();
    };
  }, [connected, id, watchPickup, subscribe, reload]);

  useEffect(() => {
    if (pickup?.live) setLive((l) => l || pickup.live);
  }, [pickup]);

  async function act(fn, success) {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.data?.data?.pickup) setData((d) => ({ ...d, pickup: { ...d.pickup, ...res.data.data.pickup } }));
      toast.success(success);
      setModal(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="container-page py-12 max-w-2xl"><ErrorState error={error} onRetry={reload} /></div>;
  if (loading && !pickup) {
    return (
      <div className="container-page py-10 max-w-5xl space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const isCustomer = user?.role === 'customer';
  const active = !['COMPLETED', 'CANCELLED'].includes(pickup.status);
  const canChange = isCustomer && ['BOOKED', 'ASSIGNED'].includes(pickup.status);
  const canCancel = isCustomer && ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY'].includes(pickup.status);
  const awaitingDecision = isCustomer && pickup.status === 'WEIGHING' && pickup.finalAmount != null && pickup.customerDecision?.status === 'pending';
  const hasEwaste = pickup.items.some((i) => i.condition);
  const total = (pickup.finalAmount || 0) + (pickup.bonusAmount || 0);
  const markers = [];
  if (pickup.location?.lat) markers.push({ id: 'home', lat: pickup.location.lat, lng: pickup.location.lng, color: 'rust', label: '⌂', popup: 'Pickup address' });
  if (live?.lat) markers.push({ id: 'collector', lat: live.lat, lng: live.lng, color: 'blue', icon: 'dot', popup: pickup.collector?.name });

  return (
    <div className="container-page py-8 sm:py-10 max-w-5xl">
      <PageHeader
        back={isCustomer ? { to: '/pickups', label: t('dash.pickups') } : undefined}
        title={pickup.pickupId}
        subtitle={`${fmtDay(pickup.scheduledDate)} · ${pickup.timeSlot}${pickup.type === 'donation' ? ' · Donation' : ''}`}
        actions={
          <>
            <StatusBadge status={pickup.status} />
            {isCustomer && active && (
              <Button variant="outline" size="sm" icon={CalendarPlus} onClick={() => download(`/pickups/${id}/calendar.ics`, `scrapmate-${id}.ics`).catch((e) => toast.error(e.message))}>
                {t('book.addToCalendar')}
              </Button>
            )}
          </>
        }
      />

      {awaitingDecision && (
        <Card className="mb-6 border-amber-100 bg-amber-50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-steel-600">Final amount from weighing</div>
              <div className="font-head text-3xl font-bold text-steel-900 tabular">{rupees(pickup.finalAmount, { decimals: 2 })}</div>
              <div className="text-xs text-steel-500">Check the weights and photos below before you accept.</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setModal('dispute')}>
                {t('track.dispute')}
              </Button>
              <Button loading={busy} onClick={() => act(() => api.put(`/pickups/${id}/decision`, { decision: 'accepted' }), 'Amount accepted')}>
                {t('track.accept')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        <div className="space-y-6">
          {pickup.otp && isCustomer && (
            <Card className="flex items-center gap-4 bg-rust-50 border-rust-100">
              <span className="w-12 h-12 rounded-xl bg-rust-600 text-white flex items-center justify-center shrink-0">
                <KeyRound className="w-6 h-6" aria-hidden />
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium text-steel-900">{t('track.code')}</div>
                <div className="text-xs text-steel-600">{t('track.codeHint')}</div>
              </div>
              <div className="font-head text-3xl font-bold tracking-[0.25em] text-steel-900 tabular" aria-label={`Door code ${pickup.otp.split('').join(' ')}`}>
                {pickup.otp}
              </div>
            </Card>
          )}

          {pickup.status === 'COLLECTOR_ON_THE_WAY' && (
            <Card>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 font-medium text-steel-900">
                  <Navigation className="w-4 h-4 text-[rgb(var(--viz-2))]" aria-hidden />
                  {live?.etaMinutes ? t('track.eta', { min: live.etaMinutes }) : 'Your collector is on the way'}
                </div>
                {live?.km != null && <span className="text-sm text-steel-500">{live.km} km away</span>}
              </div>
              {markers.length ? <MapView markers={markers} height={260} /> : <p className="text-sm text-steel-500">Live location will appear here when the collector shares it.</p>}
              {live?.at && <p className="text-xs text-steel-400 mt-2">Updated {fmtDateTime(live.at)}</p>}
            </Card>
          )}

          <Card>
            <h2 className="font-medium text-steel-900 mb-4">Items</h2>
            <ul className="divide-y divide-steel-100">
              {pickup.items.map((it) => (
                <li key={it.itemName} className="py-3 flex gap-3 items-center">
                  {it.weighingPhoto ? (
                    <a href={it.weighingPhoto} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <img src={it.weighingPhoto} alt={`Scale reading for ${it.itemName}`} className="w-14 h-14 rounded-lg object-cover border border-steel-200" />
                    </a>
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-steel-900">
                      {it.itemName}
                      {it.condition && <Badge className="ml-2">{t(`cond.${it.condition}`)}</Badge>}
                    </div>
                    <div className="text-xs text-steel-500">
                      Estimated {it.estimatedQuantity} {unitLabel(it.unit)}
                      {it.actualWeight != null && ` · Weighed ${it.actualWeight} ${unitLabel(it.unit)} @ ${rupees(it.rateApplied, { decimals: 2 })}`}
                    </div>
                  </div>
                  {it.subtotal != null && <div className="font-medium text-steel-900 tabular">{rupees(it.subtotal, { decimals: 2 })}</div>}
                </li>
              ))}
            </ul>
            <div className="border-t border-steel-100 pt-3 mt-1 space-y-1 text-sm">
              {pickup.type !== 'donation' && pickup.finalAmount == null && (
                <div className="flex justify-between">
                  <span className="text-steel-500">Estimated value</span>
                  <span className="font-medium tabular">
                    {rupees(pickup.estimatedValueMin)} – {rupees(pickup.estimatedValueMax)}
                  </span>
                </div>
              )}
              {pickup.finalAmount != null && pickup.type !== 'donation' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-steel-500">Weighed amount</span>
                    <span className="tabular">{rupees(pickup.finalAmount, { decimals: 2 })}</span>
                  </div>
                  {pickup.bonusAmount > 0 && (
                    <div className="flex justify-between text-patina-700">
                      <span>Bonus{pickup.coupon?.code ? ` (${pickup.coupon.code})` : ''}</span>
                      <span className="tabular">+{rupees(pickup.bonusAmount)}</span>
                    </div>
                  )}
                  {pickup.status === 'COMPLETED' && (
                    <div className="flex justify-between font-semibold text-base pt-1">
                      <span>Total paid</span>
                      <span className="tabular">{rupees(total, { decimals: 2 })}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            {pickup.photos?.length > 0 && (
              <div className="flex gap-2 mt-4 flex-wrap">
                {pickup.photos.map((p) => (
                  <img key={p} src={p} alt="Scrap photo" className="w-16 h-16 rounded-lg object-cover border border-steel-200" loading="lazy" />
                ))}
              </div>
            )}
          </Card>

          {pickup.status === 'COMPLETED' && isCustomer && (
            <Card>
              <h2 className="font-medium text-steel-900 mb-3">{t('track.review')}</h2>
              {pickup.review ? (
                <div className="flex items-center gap-3">
                  <Stars value={pickup.review.rating} />
                  <span className="text-sm text-steel-600">{pickup.review.comment || 'Thanks for rating!'}</span>
                </div>
              ) : (
                <RatingForm pickupId={id} onDone={reload} />
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <PickupTimeline status={pickup.status} history={pickup.statusHistory} />
            {pickup.cancelReason && <p className="text-sm text-steel-500 mt-3">Reason: {pickup.cancelReason}</p>}
          </Card>

          {pickup.collector && (
            <Card className="flex items-center gap-3">
              <Avatar name={pickup.collector.name} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-steel-900">{pickup.collector.name}</div>
                <div className="text-xs text-steel-500 flex items-center gap-1.5">
                  {pickup.collector.collectorProfile?.rating ? (
                    <>
                      <Stars value={pickup.collector.collectorProfile.rating} size="w-3 h-3" /> {pickup.collector.collectorProfile.rating}
                    </>
                  ) : (
                    'Verified collector'
                  )}
                  {pickup.collector.collectorProfile?.vehicleNumber && ` · ${pickup.collector.collectorProfile.vehicleNumber}`}
                </div>
              </div>
              {active && (
                <a href={`tel:${pickup.collector.phone}`} className="w-10 h-10 rounded-full bg-patina-100 text-patina-700 flex items-center justify-center" aria-label={`Call ${pickup.collector.name}`}>
                  <Phone className="w-4 h-4" aria-hidden />
                </a>
              )}
            </Card>
          )}

          <Card>
            <div className="text-sm space-y-2">
              <div className="text-steel-500">Address</div>
              <div className="text-steel-900">{addressLine(pickup.addressSnapshot)}</div>
              {pickup.ngo && (
                <>
                  <div className="text-steel-500 pt-2">Donating to</div>
                  <div className="text-steel-900">{pickup.ngo.name}</div>
                </>
              )}
              {pickup.payout?.method && (
                <>
                  <div className="text-steel-500 pt-2">Payment</div>
                  <div className="text-steel-900 capitalize">
                    {payoutLabel(pickup.payout.method)} · {pickup.payout.status}
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-col gap-2 mt-4">
              {canChange && (
                <Button variant="outline" icon={CalendarClock} onClick={() => setModal('reschedule')}>
                  Reschedule
                </Button>
              )}
              {canCancel && (
                <Button variant="ghost" icon={XCircle} className="!text-danger-600" onClick={() => setModal('cancel')}>
                  Cancel pickup
                </Button>
              )}
              {pickup.status === 'COMPLETED' && (
                <>
                  <Button variant="outline" icon={ReceiptIcon} to={`/receipt/${id}`}>
                    View receipt
                  </Button>
                  <Button variant="ghost" icon={FileDown} onClick={() => download(`/pickups/${id}/receipt.pdf`, `ScrapMate-${id}.pdf`).catch((e) => toast.error(e.message))}>
                    Download PDF
                  </Button>
                  {pickup.type === 'donation' && (
                    <Button variant="ghost" icon={Award} onClick={() => download(`/pickups/${id}/certificate/donation`, `Donation-${id}.pdf`).catch((e) => toast.error(e.message))}>
                      Donation certificate
                    </Button>
                  )}
                  {hasEwaste && (
                    <Button variant="ghost" icon={Award} onClick={() => download(`/pickups/${id}/certificate/ewaste`, `EWaste-${id}.pdf`).catch((e) => toast.error(e.message))}>
                      E-waste certificate
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
          <p className="text-xs text-steel-500 px-1">
            Need help with this pickup? Use the chat or WhatsApp buttons. They already know your pickup ID.
          </p>
        </div>
      </div>

      <Modal
        open={modal === 'cancel'}
        onClose={() => setModal(null)}
        title="Cancel this pickup?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Keep pickup
            </Button>
            <Button variant="danger" loading={busy} onClick={() => act(() => api.put(`/pickups/${id}/cancel`, { reason: reason || undefined }), 'Pickup cancelled')}>
              Cancel pickup
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)">{(fid) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}</Field>
        <p className="text-xs text-steel-500 mt-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden /> Frequent cancellations can limit future bookings.
        </p>
      </Modal>

      <Modal
        open={modal === 'reschedule'}
        onClose={() => setModal(null)}
        title="Choose a new time"
        size="lg"
        footer={
          <Button
            disabled={!resched.date || !resched.slot}
            loading={busy}
            onClick={() => act(() => api.put(`/pickups/${id}/reschedule`, { date: resched.date, timeSlot: resched.slot }), 'Pickup rescheduled')}
          >
            Confirm new time
          </Button>
        }
      >
        {modal === 'reschedule' && <SlotPicker areaId={pickup.area} pinCode={pickup.pinCode} date={resched.date} slot={resched.slot} excludePickupId={pickup.pickupId} onChange={setResched} />}
      </Modal>

      <Modal
        open={modal === 'dispute'}
        onClose={() => setModal(null)}
        title="Dispute the weighed amount"
        footer={
          <Button variant="danger" loading={busy} onClick={() => act(() => api.put(`/pickups/${id}/decision`, { decision: 'disputed', note: reason }), 'Dispute raised. Our team will contact you.')}>
            Raise dispute
          </Button>
        }
      >
        <Field label="What looks wrong?" hint="e.g. the scale showed 12 kg but 10 kg was recorded">
          {(fid) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
        </Field>
      </Modal>
    </div>
  );
}
