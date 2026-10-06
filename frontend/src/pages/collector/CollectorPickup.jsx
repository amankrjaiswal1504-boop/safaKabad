import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Camera,
  CheckCircle2,
  CircleCheckBig,
  Clock,
  CloudOff,
  HandHeart,
  KeyRound,
  Landmark,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  RefreshCw,
  Scale,
  Smartphone,
  StickyNote,
  Timer,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react';
import api from '../../services/api';
import useApi, { useOnline } from '../../hooks/useApi';
import { useRealtime } from '../../context/RealtimeContext';
import MapView from '../../components/MapView';
import OtpInput from '../../components/OtpInput';
import PhotoUploader from '../../components/PhotoUploader';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  IconButton,
  Input,
  Modal,
  Segmented,
  Skeleton,
  StatusBadge,
  Textarea,
  Toggle,
  cx,
} from '../../components/ui';
import { fmtDateTime, fmtDay, rupees, timeAgo, unitLabel } from '../../utils/format';
import { useConfig } from '../../context/ConfigContext';
import { MOBILE_PLACEHOLDER, cleanPhone, isMobile, payoutLabel } from '../../utils/locale';
import { enqueue, queuedFor } from './offlineQueue';
import { customerPhone, navigateUrl, pickupAddress, telUrl, useLocationShare, useOfflineSync, whatsappUrl, writeSharePref } from './collectorShared';

const STEPS = [
  { key: 'ASSIGNED', label: 'Start' },
  { key: 'COLLECTOR_ON_THE_WAY', label: 'Travel' },
  { key: 'ARRIVED', label: 'Door code' },
  { key: 'WEIGHING', label: 'Weigh' },
  { key: 'PAY', label: 'Pay' },
];

const CANCEL_REASONS = ['Customer not available', 'Customer cancelled at the door', 'Address not found', 'Items not as described', 'Vehicle issue'];

const PAYOUT_ICON = { cash: Banknote, esewa: Smartphone, khalti: Smartphone, bank_transfer: Landmark, wallet: Wallet };
// Short labels so the options fit on a phone; which methods exist comes from settings.
const PAYOUT_SHORT = { bank_transfer: 'Bank', wallet: 'Wallet' };
const PAYOUT_HINT = {
  cash: 'Hand over the cash now. It is recorded as paid.',
  esewa: 'Sent to the customer’s eSewa wallet (their mobile number).',
  khalti: 'Sent to the customer’s Khalti wallet (their mobile number).',
  bank_transfer: 'Sent to the customer’s bank account by our finance team.',
  wallet: 'Credited to the customer’s ScrapMate wallet.',
};
const isWalletMethod = (m) => m === 'esewa' || m === 'khalti';
const RATE_OPTIONS = [
  { value: 'min', label: 'Low' },
  { value: 'avg', label: 'Average' },
  { value: 'max', label: 'High' },
];


function readShareRaw() {
  try {
    return localStorage.getItem('sm-share-location');
  } catch {
    return null;
  }
}

// Status/weighing responses come back without populated customer/ngo, so keep
// the populated versions we already have.
function mergePickup(prev, next) {
  if (!prev) return next;
  const out = { ...prev, ...next };
  if (next.customer && typeof next.customer !== 'object') out.customer = prev.customer;
  if (next.ngo && typeof next.ngo !== 'object') out.ngo = prev.ngo;
  if (next.collector && typeof next.collector !== 'object') out.collector = prev.collector;
  return out;
}

function stepIndex(p) {
  if (p.status === 'COMPLETED') return STEPS.length;
  if (p.status === 'WEIGHING' && p.finalAmount != null) return 4;
  return Math.max(0, STEPS.findIndex((s) => s.key === p.status));
}

function StepBar({ pickup }) {
  const idx = stepIndex(pickup);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Job progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className="min-w-0" aria-current={i === idx ? 'step' : undefined}>
          <div className={cx('h-1.5 rounded-full', i < idx ? 'bg-patina-600' : i === idx ? 'bg-rust-600' : 'bg-steel-200')} />
          <div className={cx('mt-1 text-[11px] truncate', i === idx ? 'text-steel-900 font-semibold' : 'text-steel-500')}>{s.label}</div>
        </li>
      ))}
    </ol>
  );
}

function StepCard({ icon: Icon, title, subtitle, tone = 'rust', children }) {
  const iconTone = { rust: 'bg-rust-100 text-rust-700', patina: 'bg-patina-100 text-patina-700', amber: 'bg-amber-100 text-amber-700', danger: 'bg-danger-100 text-danger-700' }[tone];
  return (
    <Card className="!p-4 sm:!p-5 border-2 !border-steel-200">
      <div className="flex items-start gap-3 mb-4">
        <span className={cx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', iconTone)}>
          <Icon className="w-6 h-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-head text-lg font-semibold text-steel-900 leading-tight">{title}</h2>
          {subtitle && <p className="text-sm text-steel-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

// ---------- Weighing form ----------
function WeighingForm({ pickup, online, onSubmitted, onQueued, onCancelEdit }) {
  const [weights, setWeights] = useState(() =>
    Object.fromEntries(pickup.items.map((i) => [i.itemName, i.actualWeight != null ? String(i.actualWeight) : '']))
  );
  const [photos, setPhotos] = useState(() => Object.fromEntries(pickup.items.map((i) => [i.itemName, i.weighingPhoto ? [i.weighingPhoto] : []])));
  const [rateChoice, setRateChoice] = useState('avg');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  function validate() {
    const e = {};
    pickup.items.forEach((i) => {
      const raw = weights[i.itemName];
      const n = Number(raw);
      if (raw === '' || raw == null) e[i.itemName] = `Enter the ${i.unit === 'kg' ? 'weight' : 'count'}`;
      else if (!Number.isFinite(n) || n < 0) e[i.itemName] = 'Enter a valid number';
      else if (n > 100000) e[i.itemName] = 'That looks too high';
      else if (i.unit !== 'kg' && !Number.isInteger(n)) e[i.itemName] = 'Enter whole pieces';
      else if (online && i.unit === 'kg' && n > 0 && !photos[i.itemName]?.length) e[i.itemName] = 'Take a photo of the scale display';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function buildItems() {
    return pickup.items.map((i) => ({
      itemName: i.itemName,
      actualWeight: Number(weights[i.itemName]) || 0,
      ...(photos[i.itemName]?.[0] ? { weighingPhoto: photos[i.itemName][0] } : {}),
    }));
  }

  function saveOffline(weighedItems) {
    enqueue({ pickupId: pickup.pickupId, weighedItems, rateChoice });
    toast('Saved offline — will sync when you are back online', { icon: '📶' });
    onQueued();
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) {
      toast.error('Check the highlighted items');
      return;
    }
    const weighedItems = buildItems();
    if (!navigator.onLine) {
      saveOffline(weighedItems);
      return;
    }
    setBusy(true);
    try {
      const res = await api.put(`/collector/pickups/${pickup.pickupId}/weighing`, { weighedItems, rateChoice });
      toast.success('Weighing saved. Customer has been asked to confirm.');
      onSubmitted(res.data.data.pickup);
    } catch (err) {
      if (!err.status) saveOffline(weighedItems);
      else toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {!online && (
        <p className="rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-sm px-3 py-2 flex items-start gap-2">
          <CloudOff className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          You're offline. Enter weights now — scale photos can't upload offline, so they're optional. The weighing syncs automatically.
        </p>
      )}
      <ul className="space-y-3">
        {pickup.items.map((i) => {
          const isKg = i.unit === 'kg';
          return (
            <li key={i.itemName} className="rounded-xl border border-steel-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-steel-900">{i.itemName}</p>
                  <p className="text-xs text-steel-500">
                    Booked ~{i.estimatedQuantity} {unitLabel(i.unit)}
                    {i.condition ? ` · ${i.condition.replace('_', ' ')}` : ''}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-end gap-3">
                <Field label={isKg ? 'Actual weight' : 'Pieces counted'} error={errors[i.itemName]} className="flex-1 min-w-0">
                  {(id) => (
                    <div className="relative">
                      <Input
                        id={id}
                        type="number"
                        inputMode={isKg ? 'decimal' : 'numeric'}
                        step={isKg ? '0.1' : '1'}
                        min="0"
                        value={weights[i.itemName]}
                        onChange={(ev) => {
                          setWeights((w) => ({ ...w, [i.itemName]: ev.target.value }));
                          setErrors((er) => ({ ...er, [i.itemName]: undefined }));
                        }}
                        invalid={Boolean(errors[i.itemName])}
                        className="!text-lg !py-3 pr-12 tabular"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-steel-500 pointer-events-none">{unitLabel(i.unit)}</span>
                    </div>
                  )}
                </Field>
                <div className="shrink-0">
                  {online ? (
                    <PhotoUploader
                      value={photos[i.itemName] || []}
                      onChange={(v) => {
                        setPhotos((p) => ({ ...p, [i.itemName]: v }));
                        setErrors((er) => ({ ...er, [i.itemName]: undefined }));
                      }}
                      max={1}
                      folder="weighing"
                      capture="environment"
                      label="Scale"
                      compact
                    />
                  ) : (
                    <span className="w-14 h-14 rounded-lg border-2 border-dashed border-steel-200 text-steel-400 flex items-center justify-center" title="Photos need a connection">
                      <Camera className="w-5 h-5" aria-hidden />
                      <span className="sr-only">Scale photo unavailable offline</span>
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div>
        <p className="label">Rate</p>
        <Segmented options={RATE_OPTIONS} value={rateChoice} onChange={setRateChoice} className="w-full grid grid-cols-3 [&>button]:justify-center [&>button]:min-h-[40px]" />
        <p className="text-xs text-steel-500 mt-1.5">The rate always comes from ScrapMate's price list for {pickup.city || pickup.addressSnapshot?.city || 'this city'} — you only pick where in the range this material falls.</p>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
        {onCancelEdit && (
          <Button variant="outline" size="lg" onClick={onCancelEdit} className="w-full sm:w-auto min-h-[52px]">
            Keep previous weighing
          </Button>
        )}
        <Button type="submit" size="lg" icon={online ? Scale : CloudOff} loading={busy} className="w-full min-h-[52px]">
          {online ? 'Save weighing' : 'Save offline'}
        </Button>
      </div>
    </form>
  );
}

// ---------- Weighed result lines ----------
function WeighedLines({ pickup }) {
  return (
    <div className="rounded-xl border border-steel-200 overflow-hidden">
      <table className="w-full text-sm">
        <caption className="sr-only">Weighed items</caption>
        <thead>
          <tr className="text-left text-xs text-steel-500 bg-steel-50">
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium text-right">Rate</th>
            <th className="px-3 py-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {pickup.items.map((i) => (
            <tr key={i.itemName} className="border-t border-steel-100">
              <td className="px-3 py-2.5">
                <div className="font-medium text-steel-900">{i.itemName}</div>
                <div className="text-xs text-steel-500 tabular">
                  {i.actualWeight ?? 0} {unitLabel(i.unit)}
                  {i.weighingPhoto && (
                    <>
                      {' · '}
                      <a href={i.weighingPhoto} target="_blank" rel="noreferrer" className="text-rust-700 underline">
                        scale photo
                      </a>
                    </>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular text-steel-700 whitespace-nowrap">
                {rupees(i.rateApplied, { decimals: i.rateApplied % 1 ? 2 : 0 })}/{unitLabel(i.unit)}
              </td>
              <td className="px-3 py-2.5 text-right tabular font-medium text-steel-900 whitespace-nowrap">{rupees(i.subtotal, { decimals: i.subtotal % 1 ? 2 : 0 })}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-steel-200">
            <td className="px-3 py-3 font-semibold text-steel-900" colSpan={2}>
              {pickup.type === 'donation' ? 'Donation (no payout)' : 'Pay customer'}
            </td>
            <td className="px-3 py-3 text-right font-head text-xl font-semibold text-steel-900 tabular">{rupees(pickup.finalAmount, { decimals: pickup.finalAmount % 1 ? 2 : 0 })}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------- Main ----------
export default function CollectorPickup() {
  const { id } = useParams();
  const pickupId = String(id || '').toUpperCase();
  const online = useOnline();
  const { data, error, loading, reload, setData } = useApi(`/collector/pickups/${pickupId}`);
  const realtime = useRealtime();
  const pickup = data?.pickup;
  const { payoutMethods, mapCenter } = useConfig();
  const payoutOptions = useMemo(
    () => payoutMethods.map((m) => ({ value: m.value, label: PAYOUT_SHORT[m.value] || m.label, icon: PAYOUT_ICON[m.value] })),
    [payoutMethods]
  );

  const [busy, setBusy] = useState(null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [reweigh, setReweigh] = useState(false);
  const [queued, setQueued] = useState(() => queuedFor(pickupId));
  const [lateOpen, setLateOpen] = useState(false);
  const [lateMinutes, setLateMinutes] = useState(15);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('');
  const [walletId, setWalletId] = useState('');
  const [bank, setBank] = useState({ accountNumber: '', bankName: '', branch: '', holderName: '' });
  const [payErrors, setPayErrors] = useState({});
  const [evidence, setEvidence] = useState([]);
  const [sharing, setSharing] = useState(() => readShareRaw() === '1');

  const onTheWay = pickup?.status === 'COLLECTOR_ON_THE_WAY';
  const { position } = useLocationShare(sharing && onTheWay, {
    onDenied: () => {
      writeSharePref(false);
      setSharing(false);
    },
  });

  const refreshQueued = useCallback(() => setQueued(queuedFor(pickupId)), [pickupId]);
  useOfflineSync(() => {
    refreshQueued();
    reload();
  });
  useEffect(() => {
    window.addEventListener('sm-weighing-queue', refreshQueued);
    return () => window.removeEventListener('sm-weighing-queue', refreshQueued);
  }, [refreshQueued]);

  // Live updates: customer decision and status changes for this pickup.
  const subscribe = realtime?.subscribe;
  const watchPickup = realtime?.watchPickup;
  const connected = realtime?.connected;
  useEffect(() => {
    if (!connected || !watchPickup || !subscribe) return undefined;
    const unwatch = watchPickup(pickupId);
    const offDecision = subscribe('pickup:decision', (e) => {
      if (e?.pickupId && e.pickupId !== pickupId) return;
      if (e?.decision === 'accepted') toast.success('Customer accepted the amount');
      if (e?.decision === 'disputed') toast.error('Customer disputed the amount', { duration: 6000 });
      reload();
    });
    const offStatus = subscribe('pickup:status', (e) => {
      if (e?.pickupId && e.pickupId !== pickupId) return;
      reload();
    });
    return () => {
      unwatch();
      offDecision();
      offStatus();
    };
  }, [connected, watchPickup, subscribe, pickupId, reload]);

  // Pre-fill payout from what the customer chose at booking when that method is
  // still switched on; otherwise default to the first enabled method.
  const enabledKey = payoutOptions.map((o) => o.value).join(',');
  useEffect(() => {
    const enabled = enabledKey ? enabledKey.split(',') : [];
    const booked = pickup?.payout?.method;
    if (booked && enabled.includes(booked)) setPayoutMethod(booked);
    else setPayoutMethod((cur) => (enabled.includes(cur) ? cur : enabled[0] || ''));
    if (pickup?.payout?.walletId) setWalletId((v) => v || pickup.payout.walletId);
  }, [pickup?.payout?.method, pickup?.payout?.walletId, enabledKey]);

  const update = useCallback((next) => setData((d) => ({ ...d, pickup: mergePickup(d?.pickup, next) })), [setData]);

  async function run(key, fn) {
    if (!navigator.onLine) {
      toast.error("You're offline. Try again when you have signal.");
      return;
    }
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const startTrip = () =>
    run('start', async () => {
      const res = await api.put(`/collector/pickups/${pickupId}/status`, { status: 'COLLECTOR_ON_THE_WAY' });
      update(res.data.data.pickup);
      toast.success('Trip started. Customer has been notified.');
      if (readShareRaw() !== '0') {
        writeSharePref(true);
        setSharing(true);
      }
    });

  const arrived = () =>
    run('arrive', async () => {
      const res = await api.put(`/collector/pickups/${pickupId}/status`, { status: 'ARRIVED' });
      update(res.data.data.pickup);
      toast.success("Marked as arrived. Ask the customer for their 4-digit code.");
    });

  const verifyOtp = () => {
    if (!/^\d{4}$/.test(otp)) {
      setOtpError('Enter the 4-digit code');
      return;
    }
    setOtpError('');
    run('otp', async () => {
      try {
        const res = await api.post(`/collector/pickups/${pickupId}/verify-otp`, { otp });
        update(res.data.data.pickup);
        setOtp('');
        toast.success('Code verified. Start weighing.');
      } catch (err) {
        setOtpError(err.message);
        throw err;
      }
    });
  };

  const sendLate = () =>
    run('late', async () => {
      await api.post(`/collector/pickups/${pickupId}/late`, { minutes: lateMinutes });
      setLateOpen(false);
      toast.success(`Customer told you're ~${lateMinutes} min late`);
    });

  const cancel = () => {
    const reason = [cancelReason, cancelNote.trim()].filter(Boolean).join(' — ').slice(0, 300);
    if (!reason) {
      toast.error('Choose or type a reason');
      return;
    }
    run('cancel', async () => {
      const res = await api.put(`/collector/pickups/${pickupId}/status`, { status: 'CANCELLED', reason });
      update(res.data.data.pickup);
      setCancelOpen(false);
      toast.success('Pickup cancelled. Our team will follow up with the customer.');
    });
  };

  const complete = () => {
    const isDonation = pickup.type === 'donation';
    const e = {};
    if (!isDonation && !payoutMethod) e.method = 'Choose how the customer is paid';
    if (!isDonation && isWalletMethod(payoutMethod) && !isMobile(walletId)) e.walletId = `Enter the customer's ${payoutLabel(payoutMethod)} mobile number (10 digits)`;
    if (!isDonation && payoutMethod === 'bank_transfer') {
      if (!/^\d{8,20}$/.test(bank.accountNumber.trim())) e.accountNumber = '8–20 digits';
      if (!bank.bankName.trim()) e.bankName = 'Enter the bank name';
      if (!bank.branch.trim()) e.branch = 'Enter the branch';
      if (!bank.holderName.trim()) e.holderName = 'Enter the account holder name';
    }
    setPayErrors(e);
    if (Object.keys(e).length) {
      toast.error('Check the payout details');
      return;
    }
    const body = isDonation ? {} : { payoutMethod };
    if (!isDonation && isWalletMethod(payoutMethod)) body.walletId = cleanPhone(walletId);
    if (!isDonation && payoutMethod === 'bank_transfer') {
      body.bankAccount = {
        accountNumber: bank.accountNumber.trim(),
        bankName: bank.bankName.trim(),
        branch: bank.branch.trim(),
        holderName: bank.holderName.trim(),
      };
    }
    if (evidence.length) body.evidencePhotos = evidence;
    run('complete', async () => {
      const res = await api.put(`/collector/pickups/${pickupId}/complete`, body);
      update(res.data.data.pickup);
      toast.success(isDonation ? 'Donation collected. Thank you!' : 'Pickup completed and payout recorded');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const markers = useMemo(() => {
    if (!pickup) return [];
    const m = [];
    if (pickup.location && Number.isFinite(pickup.location.lat)) {
      m.push({ id: 'dest', lat: pickup.location.lat, lng: pickup.location.lng, color: 'rust', icon: 'pin', popup: pickupAddress(pickup.addressSnapshot) });
    }
    if (position) m.push({ id: 'me', lat: Math.round(position.lat * 1e4) / 1e4, lng: Math.round(position.lng * 1e4) / 1e4, color: 'blue', icon: 'dot', popup: 'You' });
    return m;
  }, [pickup, position]);

  // ---------- Render ----------
  if (error && !pickup) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} />
      </div>
    );
  }
  if (!pickup) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading pickup">
        <BackLink />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const a = pickup.addressSnapshot || {};
  const phone = customerPhone(pickup);
  const isDonation = pickup.type === 'donation';
  const status = pickup.status;
  const active = ['ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING'].includes(status);
  const decision = pickup.customerDecision?.status;
  const weighed = status === 'WEIGHING' && pickup.finalAmount != null;
  const showWeighForm = status === 'WEIGHING' && !queued && (!weighed || reweigh);
  const paid = (pickup.finalAmount || 0) + (pickup.bonusAmount || 0);
  const waText = `Hi ${pickup.customer?.name?.split(' ')[0] || ''}, this is your ScrapMate partner for pickup ${pickup.pickupId}.`;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <BackLink />
          <h1 className="font-head text-2xl font-semibold text-steel-900 leading-tight tabular mt-1">{pickup.pickupId}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {isDonation && (
              <Badge tone="patina">
                <HandHeart className="w-3.5 h-3.5" aria-hidden /> Donation{pickup.ngo?.name ? ` · ${pickup.ngo.name}` : ''}
              </Badge>
            )}
          </div>
        </div>
        <IconButton label="Refresh" icon={RefreshCw} onClick={reload} className={cx('!w-11 !h-11 shrink-0', loading && '[&>svg]:animate-spin')} />
      </div>

      {status !== 'CANCELLED' && <StepBar pickup={pickup} />}

      {/* ---------- Current step ---------- */}
      {status === 'ASSIGNED' && (
        <StepCard icon={Truck} title="Ready to go?" subtitle={`${pickup.timeSlot} · ${fmtDay(pickup.scheduledDate)}. Starting the trip tells the customer you're on the way.`}>
          <div className="grid gap-2">
            <Button size="lg" icon={Truck} loading={busy === 'start'} onClick={startTrip} className="w-full min-h-[52px]">
              Start trip
            </Button>
            <Button variant="outline" icon={Timer} onClick={() => setLateOpen(true)} className="w-full min-h-[48px]">
              Running late
            </Button>
          </div>
        </StepCard>
      )}

      {status === 'COLLECTOR_ON_THE_WAY' && (
        <StepCard icon={Navigation} title="On the way" subtitle={pickupAddress(a)}>
          <div className="space-y-4">
            <Toggle
              checked={sharing}
              onChange={(v) => {
                writeSharePref(v);
                setSharing(v);
                toast(v ? 'Sharing your live location with the customer' : 'Stopped sharing location');
              }}
              label="Share live location"
              description={sharing ? (position ? 'Customer can see you on the map.' : 'Waiting for GPS…') : 'Customer sees an ETA when this is on.'}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" icon={Navigation} href={navigateUrl(pickup)} target="_blank" rel="noreferrer" className="min-h-[48px]">
                Navigate
              </Button>
              <Button variant="outline" icon={Timer} onClick={() => setLateOpen(true)} className="min-h-[48px]">
                Running late
              </Button>
            </div>
            <Button size="lg" icon={MapPin} loading={busy === 'arrive'} onClick={arrived} className="w-full min-h-[52px]">
              I've arrived
            </Button>
            <details className="text-sm">
              <summary className="cursor-pointer text-steel-600 hover:text-steel-900 min-h-[44px] flex items-center">Already at the door? Enter the code</summary>
              <div className="pt-2">
                <DoorCode otp={otp} setOtp={setOtp} error={otpError} busy={busy === 'otp'} onVerify={verifyOtp} />
              </div>
            </details>
          </div>
        </StepCard>
      )}

      {status === 'ARRIVED' && (
        <StepCard icon={KeyRound} title="Enter the door code" subtitle="Ask the customer for the 4-digit code in their ScrapMate app or SMS.">
          <DoorCode otp={otp} setOtp={setOtp} error={otpError} busy={busy === 'otp'} onVerify={verifyOtp} autoFocus />
        </StepCard>
      )}

      {status === 'WEIGHING' && queued && (
        <StepCard icon={CloudOff} tone="amber" title="Saved offline — will sync" subtitle={`Saved ${timeAgo(queued.savedAt)}. It uploads automatically when you're back online.`}>
          <ul className="text-sm divide-y divide-steel-100 mb-4">
            {queued.weighedItems.map((w) => {
              const item = pickup.items.find((i) => i.itemName === w.itemName);
              return (
                <li key={w.itemName} className="flex justify-between py-2">
                  <span className="text-steel-700">{w.itemName}</span>
                  <span className="tabular font-medium text-steel-900">
                    {w.actualWeight} {unitLabel(item?.unit || 'kg')}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-steel-500 mb-3">Rate: {RATE_OPTIONS.find((r) => r.value === queued.rateChoice)?.label || 'Average'} of ScrapMate's price range.</p>
          <Button
            variant="outline"
            icon={Scale}
            onClick={() => {
              setQueued(null);
              setReweigh(true);
            }}
            className="w-full min-h-[48px]"
          >
            Edit weights
          </Button>
        </StepCard>
      )}

      {showWeighForm && (
        <StepCard
          icon={Scale}
          title={weighed ? 'Re-weigh items' : 'Weigh the items'}
          subtitle={weighed ? 'Enter the corrected weights. The customer will be asked to confirm again.' : 'Weigh each item on your scale and snap the display.'}
        >
          {decision === 'disputed' && pickup.customerDecision?.note && (
            <p className="mb-4 rounded-lg bg-danger-50 border border-danger-100 text-danger-700 text-sm px-3 py-2">Customer's note: “{pickup.customerDecision.note}”</p>
          )}
          <WeighingForm
            pickup={pickup}
            online={online}
            onSubmitted={(p) => {
              update(p);
              setReweigh(false);
            }}
            onQueued={() => {
              refreshQueued();
              setReweigh(false);
            }}
            onCancelEdit={weighed ? () => setReweigh(false) : undefined}
          />
        </StepCard>
      )}

      {weighed && !reweigh && !queued && (
        <>
          <StepCard icon={Scale} tone="patina" title={isDonation ? 'Weighed' : `Pay ${rupees(pickup.finalAmount)}`} subtitle="Final amount from ScrapMate's rates for these weights.">
            <WeighedLines pickup={pickup} />
            <DecisionBanner decision={decision} note={pickup.customerDecision?.note} />
            <Button
              variant={decision === 'disputed' ? 'primary' : 'ghost'}
              icon={Scale}
              onClick={() => setReweigh(true)}
              className={cx('w-full mt-3', decision === 'disputed' ? 'min-h-[52px]' : 'min-h-[44px]')}
            >
              Re-weigh
            </Button>
          </StepCard>

          {decision !== 'disputed' && (
            <StepCard icon={CircleCheckBig} title={isDonation ? 'Finish donation' : 'Pay & complete'} subtitle={isDonation ? 'No payout — the material goes to the NGO.' : 'Choose how the customer is paid.'}>
              <div className="space-y-4">
                {!isDonation && (
                  <>
                    <div>
                      <p className="label">Payout method</p>
                      {payoutOptions.length ? (
                        <>
                          <Segmented
                            options={payoutOptions}
                            value={payoutMethod}
                            onChange={(v) => {
                              setPayoutMethod(v);
                              setPayErrors({});
                            }}
                            className={cx(
                              'w-full grid [&>button]:justify-center [&>button]:min-h-[44px] [&>button]:!px-1',
                              { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[payoutOptions.length] || 'grid-cols-3 sm:grid-cols-5'
                            )}
                          />
                          {PAYOUT_HINT[payoutMethod] && <p className="text-xs text-steel-500 mt-1.5">{PAYOUT_HINT[payoutMethod]}</p>}
                        </>
                      ) : (
                        <p className="rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-sm px-3 py-2" role="alert">
                          No payout methods are switched on right now. Call the office before completing this pickup.
                        </p>
                      )}
                      {payErrors.method && (
                        <p className="text-danger-600 text-xs mt-1.5" role="alert">
                          {payErrors.method}
                        </p>
                      )}
                    </div>
                    {isWalletMethod(payoutMethod) && (
                      <Field label={`Customer's ${payoutLabel(payoutMethod)} ID`} hint="Their 10-digit mobile number" error={payErrors.walletId} required>
                        {(fid) => (
                          <Input
                            id={fid}
                            type="tel"
                            inputMode="numeric"
                            autoComplete="off"
                            value={walletId}
                            onChange={(e) => setWalletId(e.target.value)}
                            placeholder={MOBILE_PLACEHOLDER}
                            maxLength={14}
                            invalid={Boolean(payErrors.walletId)}
                            className="tabular"
                          />
                        )}
                      </Field>
                    )}
                    {payoutMethod === 'bank_transfer' && (
                      <div className="grid gap-3">
                        <Field label="Account number" error={payErrors.accountNumber} required>
                          {(fid) => (
                            <Input
                              id={fid}
                              inputMode="numeric"
                              value={bank.accountNumber}
                              maxLength={20}
                              onChange={(e) => setBank((b) => ({ ...b, accountNumber: e.target.value.replace(/\D/g, '') }))}
                              invalid={Boolean(payErrors.accountNumber)}
                              className="tabular"
                            />
                          )}
                        </Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <Field label="Bank name" error={payErrors.bankName} required>
                            {(fid) => (
                              <Input id={fid} value={bank.bankName} onChange={(e) => setBank((b) => ({ ...b, bankName: e.target.value }))} maxLength={80} placeholder="e.g. Nabil Bank" invalid={Boolean(payErrors.bankName)} />
                            )}
                          </Field>
                          <Field label="Branch" error={payErrors.branch} required>
                            {(fid) => (
                              <Input id={fid} value={bank.branch} onChange={(e) => setBank((b) => ({ ...b, branch: e.target.value }))} maxLength={80} placeholder="Branch" invalid={Boolean(payErrors.branch)} />
                            )}
                          </Field>
                        </div>
                        <Field label="Account holder" error={payErrors.holderName} required>
                          {(fid) => <Input id={fid} value={bank.holderName} onChange={(e) => setBank((b) => ({ ...b, holderName: e.target.value }))} maxLength={80} invalid={Boolean(payErrors.holderName)} />}
                        </Field>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <p className="label">Before / after photos (optional)</p>
                  {online ? (
                    <PhotoUploader value={evidence} onChange={setEvidence} max={4} folder="evidence" capture="environment" label="Add photo" />
                  ) : (
                    <p className="text-sm text-steel-500">Photos need a connection.</p>
                  )}
                </div>
                {decision === 'pending' && (
                  <p className="text-xs text-steel-500">The customer hasn't confirmed the amount in their app yet. Make sure they agree before completing.</p>
                )}
                <Button size="lg" icon={CheckCircle2} loading={busy === 'complete'} disabled={!online} onClick={complete} className="w-full min-h-[52px]">
                  {isDonation ? 'Complete donation' : `Complete & pay ${rupees(pickup.finalAmount)}`}
                </Button>
                {!online && <p className="text-xs text-amber-700 text-center">Completing needs a connection.</p>}
              </div>
            </StepCard>
          )}
        </>
      )}

      {status === 'COMPLETED' && (
        <Card className="!p-6 text-center border-2 !border-patina-200 bg-patina-50">
          <span className="w-14 h-14 mx-auto rounded-full bg-patina-600 text-white flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" aria-hidden />
          </span>
          <h2 className="font-head text-xl font-semibold text-steel-900 mt-3">{isDonation ? 'Donation collected' : 'Pickup complete'}</h2>
          {!isDonation ? (
            <>
              <p className="font-head text-3xl font-semibold text-steel-900 tabular mt-2">{rupees(paid, { decimals: paid % 1 ? 2 : 0 })}</p>
              <p className="text-sm text-steel-600 mt-1">
                {pickup.bonusAmount ? `${rupees(pickup.finalAmount)} + ${rupees(pickup.bonusAmount)} bonus · ` : ''}
                {pickup.payout?.method ? payoutLabel(pickup.payout.method) : ''}
                {pickup.payout?.status ? ` · ${pickup.payout.status}` : ''}
              </p>
            </>
          ) : (
            <p className="text-sm text-steel-600 mt-1">Thank you for helping {pickup.ngo?.name || 'our NGO partner'}.</p>
          )}
          <div className="grid gap-2 mt-5">
            <Button size="lg" to="/collector" className="w-full min-h-[52px]">
              Back to today
            </Button>
            <Button variant="ghost" to="/collector/route" className="w-full min-h-[44px]">
              Next stop on route
            </Button>
          </div>
        </Card>
      )}

      {status === 'CANCELLED' && (
        <Card className="!p-5 border-2 !border-danger-100">
          <div className="flex items-start gap-3">
            <XCircle className="w-6 h-6 text-danger-600 shrink-0" aria-hidden />
            <div>
              <h2 className="font-semibold text-steel-900">This pickup was cancelled</h2>
              {pickup.cancelReason && <p className="text-sm text-steel-600 mt-1">{pickup.cancelReason}</p>}
              <Button variant="outline" to="/collector" className="mt-4 min-h-[44px]">
                Back to today
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ---------- Customer & address ---------- */}
      <Card className="!p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-steel-500 font-medium">Customer</p>
            <p className="font-semibold text-steel-900 text-lg">{pickup.customer?.name || 'Customer'}</p>
            {phone && <p className="text-sm text-steel-600 tabular">{phone}</p>}
          </div>
        </div>
        <p className="mt-3 text-sm text-steel-700 flex items-start gap-1.5">
          <MapPin className="w-4 h-4 text-steel-500 shrink-0 mt-0.5" aria-hidden />
          <span>
            {pickupAddress(a)}
            {a.landmark ? <span className="block text-steel-500">{/^near\s/i.test(a.landmark) ? a.landmark : `Near ${a.landmark}`}</span> : null}
          </span>
        </p>
        <p className="mt-1.5 text-sm text-steel-700 flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-steel-500 shrink-0" aria-hidden />
          {pickup.timeSlot} · {fmtDay(pickup.scheduledDate)}
        </p>
        {active && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <Button variant="outline" icon={Phone} href={telUrl(phone)} className="min-h-[48px] !px-2" aria-label={`Call ${pickup.customer?.name || 'customer'}`}>
              Call
            </Button>
            <Button variant="outline" icon={MessageCircle} href={whatsappUrl(phone, waText)} target="_blank" rel="noreferrer" className="min-h-[48px] !px-2" aria-label="WhatsApp customer">
              WhatsApp
            </Button>
            <Button variant="outline" icon={Navigation} href={navigateUrl(pickup)} target="_blank" rel="noreferrer" className="min-h-[48px] !px-2" aria-label="Navigate with Google Maps">
              Navigate
            </Button>
          </div>
        )}
        {markers.length > 0 && (
          <div className="mt-4">
            <MapView markers={markers} center={mapCenter(pickup.city || a.city)} height={180} />
          </div>
        )}
      </Card>

      {/* ---------- Items ---------- */}
      <Card className="!p-4">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="font-semibold text-steel-900">Items</h2>
          {!isDonation && (
            <span className="text-sm text-steel-500 tabular">
              est. {rupees(pickup.estimatedValueMin)}–{rupees(pickup.estimatedValueMax)}
            </span>
          )}
        </div>
        <ul className="divide-y divide-steel-100 text-sm">
          {pickup.items.map((i) => (
            <li key={i.itemName} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="text-steel-900 font-medium">{i.itemName}</span>
                {i.condition && <span className="text-xs text-steel-500 ml-1.5">{i.condition.replace('_', ' ')}</span>}
              </span>
              <span className="tabular text-steel-600 whitespace-nowrap">
                {i.actualWeight != null ? (
                  <>
                    <span className="text-steel-900 font-medium">
                      {i.actualWeight} {unitLabel(i.unit)}
                    </span>{' '}
                    <span className="text-xs">(booked {i.estimatedQuantity})</span>
                  </>
                ) : (
                  `~${i.estimatedQuantity} ${unitLabel(i.unit)}`
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {pickup.notes && (
        <Card className="!p-4">
          <h2 className="font-semibold text-steel-900 flex items-center gap-1.5 mb-1">
            <StickyNote className="w-4 h-4 text-steel-500" aria-hidden /> Customer notes
          </h2>
          <p className="text-sm text-steel-700 whitespace-pre-line">{pickup.notes}</p>
        </Card>
      )}

      {(pickup.photos?.length > 0 || pickup.evidencePhotos?.length > 0) && (
        <Card className="!p-4">
          {pickup.photos?.length > 0 && <Gallery title="Customer photos" urls={pickup.photos} />}
          {pickup.evidencePhotos?.length > 0 && <Gallery title="Before / after" urls={pickup.evidencePhotos} className={pickup.photos?.length ? 'mt-4' : ''} />}
        </Card>
      )}

      {pickup.otpVerifiedAt && (
        <p className="text-xs text-steel-500 flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" aria-hidden /> Door code verified {fmtDateTime(pickup.otpVerifiedAt)}
        </p>
      )}

      {active && (
        <div className="pt-2 border-t border-steel-200">
          <Button variant="ghost" icon={XCircle} onClick={() => setCancelOpen(true)} className="w-full min-h-[48px] !text-danger-700">
            Cancel this pickup
          </Button>
        </div>
      )}

      {/* ---------- Modals ---------- */}
      <Modal
        open={lateOpen}
        onClose={() => setLateOpen(false)}
        title="Running late"
        footer={
          <>
            <Button variant="outline" onClick={() => setLateOpen(false)}>
              Close
            </Button>
            <Button icon={Timer} loading={busy === 'late'} onClick={sendLate}>
              Notify customer
            </Button>
          </>
        }
      >
        <p className="text-sm text-steel-600 mb-3">We'll message {pickup.customer?.name || 'the customer'} with your new arrival time.</p>
        <Segmented
          options={[10, 15, 30, 45].map((m) => ({ value: m, label: `${m} min` }))}
          value={lateMinutes}
          onChange={setLateMinutes}
          className="w-full grid grid-cols-4 [&>button]:justify-center [&>button]:min-h-[44px]"
        />
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this pickup?"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep pickup
            </Button>
            <Button variant="danger" icon={XCircle} loading={busy === 'cancel'} onClick={cancel}>
              Cancel pickup
            </Button>
          </>
        }
      >
        <p className="text-sm text-steel-600 mb-3">The customer will be told and our team may reassign it. Pick a reason:</p>
        <div className="grid gap-2" role="radiogroup" aria-label="Cancel reason">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={cancelReason === r}
              onClick={() => setCancelReason(cancelReason === r ? '' : r)}
              className={cx(
                'min-h-[44px] text-left px-3 rounded-lg border text-sm transition-colors',
                cancelReason === r ? 'border-rust-600 bg-rust-50 text-steel-900 font-medium' : 'border-steel-200 text-steel-700 hover:bg-steel-50'
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Field label="Details (optional)" className="mt-3">
          {(fid) => <Textarea id={fid} value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={250} placeholder="Anything our team should know" />}
        </Field>
      </Modal>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/collector" className="inline-flex items-center gap-1 text-sm text-steel-500 hover:text-steel-900 min-h-[32px]">
      <ArrowLeft className="w-4 h-4" aria-hidden /> Today
    </Link>
  );
}

function DoorCode({ otp, setOtp, error, busy, onVerify, autoFocus }) {
  return (
    <div className="space-y-3">
      <OtpInput length={4} value={otp} onChange={setOtp} autoFocus={autoFocus} label="Customer's 4-digit door code" />
      {error && (
        <p className="text-sm text-danger-600" role="alert">
          {error}
        </p>
      )}
      <Button size="lg" icon={KeyRound} loading={busy} disabled={otp.length !== 4} onClick={onVerify} className="w-full min-h-[52px]">
        Verify code
      </Button>
    </div>
  );
}

function DecisionBanner({ decision, note }) {
  if (decision === 'accepted') {
    return (
      <p className="mt-3 rounded-lg bg-patina-50 border border-patina-100 text-patina-700 text-sm px-3 py-2.5 flex items-center gap-2" role="status">
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden /> Customer accepted this amount.
      </p>
    );
  }
  if (decision === 'disputed') {
    return (
      <div className="mt-3 rounded-lg bg-danger-50 border border-danger-100 text-danger-700 text-sm px-3 py-2.5" role="alert">
        <p className="font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden /> Customer disputed this amount
        </p>
        {note && <p className="mt-1 text-steel-700">“{note}”</p>}
        <p className="mt-1 text-steel-600">Re-weigh together with the customer, or contact support. You can't complete until it's resolved.</p>
      </div>
    );
  }
  return (
    <p className="mt-3 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-sm px-3 py-2.5 flex items-center gap-2" role="status">
      <Clock className="w-4 h-4 shrink-0" aria-hidden /> Waiting for the customer to confirm in their app…
    </p>
  );
}

function Gallery({ title, urls, className }) {
  return (
    <div className={className}>
      <h2 className="font-semibold text-steel-900 mb-2 flex items-center gap-1.5">
        <Camera className="w-4 h-4 text-steel-500" aria-hidden /> {title}
      </h2>
      <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {urls.map((u, i) => (
          <li key={u}>
            <a href={u} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-steel-100 bg-steel-100">
              <img src={u} alt={`${title} ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
