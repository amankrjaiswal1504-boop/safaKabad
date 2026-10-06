// Helpers shared by the collector (partner) pages: offline sync, live
// location sharing, navigation/call links and the pickup card.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronRight, Clock, MapPin, Navigation, Phone, User } from 'lucide-react';
import api from '../../services/api';
import { StatusBadge, cx } from '../../components/ui';
import { addressLine, fmtDay, rupees, unitLabel } from '../../utils/format';
import { DIAL_CODE } from '../../utils/locale';
import { flushQueue, readQueue } from './offlineQueue';

// ---------- Links ----------
export function navigateUrl(p) {
  const l = p?.location;
  const dest = l && Number.isFinite(l.lat) && Number.isFinite(l.lng) ? `${l.lat},${l.lng}` : encodeURIComponent(addressLine(p?.addressSnapshot));
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export function telUrl(phone) {
  return phone ? `tel:${String(phone).replace(/[^\d+]/g, '')}` : undefined;
}

export function whatsappUrl(phone, text = '') {
  if (!phone) return undefined;
  let d = String(phone).replace(/\D/g, '');
  if (d.length === 10) d = `${DIAL_CODE}${d}`;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function customerPhone(p) {
  return p?.contactPhone || p?.customer?.phone || '';
}

export function itemsSummary(items = []) {
  if (!items.length) return '';
  const parts = items.map((i) => `${i.itemName} ${i.estimatedQuantity ?? ''}${i.estimatedQuantity != null ? ` ${unitLabel(i.unit)}` : ''}`.trim());
  return parts.length > 3 ? `${parts.slice(0, 3).join(', ')} +${parts.length - 3} more` : parts.join(', ');
}

// ---------- Offline weighing sync ----------
// Flushes the queue on mount and whenever the phone comes back online.
export function useOfflineSync(onSynced) {
  const cb = useRef(onSynced);
  cb.current = onSynced;
  const [pending, setPending] = useState(() => readQueue().length);

  const sync = useCallback(async ({ quiet } = {}) => {
    if (!readQueue().length) return;
    try {
      const { synced, failed, results } = await flushQueue(api);
      if (synced) toast.success(`${synced} offline weighing${synced > 1 ? 's' : ''} synced`);
      if (failed) {
        const msg = results.find((r) => !r.ok)?.message;
        toast.error(`${failed} offline weighing${failed > 1 ? 's' : ''} couldn't sync${msg ? `: ${msg}` : ''}`);
      }
      if (synced || failed) cb.current?.(results);
    } catch (err) {
      if (!quiet) toast.error(err.message || 'Sync failed, will retry');
    } finally {
      setPending(readQueue().length);
    }
  }, []);

  useEffect(() => {
    sync({ quiet: true });
    const onOnline = () => sync();
    const onChange = () => setPending(readQueue().length);
    window.addEventListener('online', onOnline);
    window.addEventListener('sm-weighing-queue', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('sm-weighing-queue', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [sync]);

  return { pending, sync };
}

// ---------- Live location ----------
const SHARE_KEY = 'sm-share-location';

export function readSharePref() {
  try {
    return localStorage.getItem(SHARE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSharePref(on) {
  try {
    localStorage.setItem(SHARE_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked */
  }
}

export function useSharePref() {
  const [on, setOn] = useState(readSharePref);
  const set = useCallback((v) => {
    writeSharePref(v);
    setOn(v);
  }, []);
  return [on, set];
}

const PUSH_EVERY_MS = 15000;

// Watches the GPS while `enabled` and PUTs /collector/location at most every
// 15 s. Calls onDenied when the browser refuses permission.
export function useLocationShare(enabled, { onDenied } = {}) {
  const [position, setPosition] = useState(null);
  const [lastSent, setLastSent] = useState(null);
  const denied = useRef(onDenied);
  denied.current = onDenied;

  useEffect(() => {
    if (!enabled) return undefined;
    if (!('geolocation' in navigator)) {
      toast.error("This phone can't share location");
      denied.current?.();
      return undefined;
    }
    let last = 0;
    let stopped = false;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (stopped) return;
        const c = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPosition(c);
        const now = Date.now();
        if (now - last >= PUSH_EVERY_MS && navigator.onLine !== false) {
          last = now;
          api
            .put('/collector/location', c)
            .then(() => !stopped && setLastSent(new Date()))
            .catch(() => {
              last = 0; // retry on the next fix
            });
        }
      },
      (err) => {
        if (err.code === 1) {
          toast.error('Location permission is blocked. Allow it in your browser settings to share live location.', { id: 'geo-denied' });
          denied.current?.();
        } else {
          toast.error("Couldn't get your location. Check that GPS is on.", { id: 'geo-error' });
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    );
    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(id);
    };
  }, [enabled]);

  return { position, lastSent };
}

// ---------- Pickup card ----------
export function PickupCard({ pickup }) {
  const a = pickup.addressSnapshot || {};
  const phone = customerPhone(pickup);
  const finished = ['COMPLETED', 'CANCELLED'].includes(pickup.status);
  const amount = pickup.status === 'COMPLETED' && pickup.finalAmount != null
    ? rupees((pickup.finalAmount || 0) + (pickup.bonusAmount || 0))
    : pickup.type === 'donation'
      ? 'Donation'
      : `${rupees(pickup.estimatedValueMin)}–${rupees(pickup.estimatedValueMax)}`;
  return (
    <article className="bg-surface border border-steel-100 rounded-xl shadow-card overflow-hidden">
      <Link to={`/collector/pickups/${pickup.pickupId}`} className="block p-4 hover:bg-steel-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust-500/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={pickup.status} />
              <span className="text-xs text-steel-500 tabular">{pickup.pickupId}</span>
            </div>
            <p className="mt-2 font-head font-semibold text-steel-900 text-lg leading-snug flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-steel-500 shrink-0" aria-hidden />
              <span className="truncate">{pickup.timeSlot}</span>
              <span className="text-sm font-normal text-steel-500 whitespace-nowrap">· {fmtDay(pickup.scheduledDate)}</span>
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-semibold text-steel-900 tabular">{amount}</div>
            <div className="text-[11px] text-steel-500">{pickup.status === 'COMPLETED' ? 'paid' : pickup.type === 'donation' ? '' : 'estimate'}</div>
          </div>
        </div>
        <div className="mt-2 space-y-1 text-sm">
          <p className="flex items-center gap-1.5 text-steel-700">
            <MapPin className="w-4 h-4 text-steel-500 shrink-0" aria-hidden />
            <span className="truncate">{[a.locality, a.city].filter(Boolean).join(', ') || addressLine(a)}</span>
          </p>
          <p className="flex items-center gap-1.5 text-steel-700">
            <User className="w-4 h-4 text-steel-500 shrink-0" aria-hidden />
            <span className="truncate">{pickup.customer?.name || 'Customer'}</span>
          </p>
          {pickup.items?.length > 0 && <p className="text-steel-500 line-clamp-2">{itemsSummary(pickup.items)}</p>}
        </div>
        <span className="mt-2 inline-flex items-center gap-0.5 text-xs font-medium text-rust-700">
          Open job <ChevronRight className="w-3.5 h-3.5" aria-hidden />
        </span>
      </Link>
      {!finished && (
        <div className="grid grid-cols-2 border-t border-steel-100 divide-x divide-steel-100">
          <a
            href={telUrl(phone)}
            className={cx('min-h-[48px] flex items-center justify-center gap-2 text-sm font-medium text-steel-800 hover:bg-steel-50', !phone && 'pointer-events-none opacity-40')}
            aria-label={`Call ${pickup.customer?.name || 'customer'}`}
          >
            <Phone className="w-4 h-4" aria-hidden /> Call
          </a>
          <a
            href={navigateUrl(pickup)}
            target="_blank"
            rel="noreferrer"
            className="min-h-[48px] flex items-center justify-center gap-2 text-sm font-medium text-rust-700 hover:bg-steel-50"
            aria-label={`Navigate to ${a.locality || 'pickup'} in Google Maps`}
          >
            <Navigation className="w-4 h-4" aria-hidden /> Navigate
          </a>
        </div>
      )}
    </article>
  );
}
