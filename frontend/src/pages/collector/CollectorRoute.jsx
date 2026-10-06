import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Clock, LocateFixed, MapPin, Navigation, Phone, RefreshCw, Route as RouteIcon } from 'lucide-react';
import useApi from '../../hooks/useApi';
import MapView from '../../components/MapView';
import { Button, Card, EmptyState, ErrorState, IconButton, Segmented, Skeleton, SkeletonRows, StatusBadge, Toggle, cx } from '../../components/ui';
import { addressLine, fmtDay, timeAgo, todayISO } from '../../utils/format';
import { DEFAULT_CENTER } from '../../utils/locale';
import { telUrl, useLocationShare, useSharePref } from './collectorShared';

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const STOP_COLOR = { ASSIGNED: 'rust', COLLECTOR_ON_THE_WAY: 'rust', ARRIVED: 'patina', WEIGHING: 'patina' };

export default function CollectorRoute() {
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const [date, setDate] = useState(today);
  const route = useApi('/collector/route', { params: { date } });
  const [sharing, setSharing] = useSharePref();
  const { position, lastSent } = useLocationShare(sharing, { onDenied: () => setSharing(false) });

  const stops = route.data?.stops;
  // Rounded (~11 m) so the map doesn't refit on every GPS jitter.
  const here = position
    ? { lat: Math.round(position.lat * 1e4) / 1e4, lng: Math.round(position.lng * 1e4) / 1e4 }
    : route.data?.start?.lat != null
      ? route.data.start
      : null;
  const hereKey = here ? `${here.lat},${here.lng}` : '';

  const { markers, line } = useMemo(() => {
    const m = [];
    const l = [];
    if (here && Number.isFinite(here.lat)) {
      m.push({ id: 'me', lat: here.lat, lng: here.lng, color: 'blue', icon: 'dot', popup: position ? 'You are here' : 'Your last shared location' });
      l.push([here.lat, here.lng]);
    }
    (stops || []).forEach((s, i) => {
      if (!s.location || !Number.isFinite(s.location.lat)) return;
      m.push({
        id: s.pickupId,
        lat: s.location.lat,
        lng: s.location.lng,
        color: STOP_COLOR[s.status] || 'steel',
        label: String(i + 1),
        icon: 'pin',
        popup: `${i + 1}. ${s.customer?.name || s.pickupId} · ${s.timeSlot}`,
      });
      l.push([s.location.lat, s.location.lng]);
    });
    return { markers: m, line: l };
  }, [stops, hereKey, Boolean(position)]);

  const totalKm = (stops || []).reduce((sum, s) => sum + (s.legKm || 0), 0);
  const totalMin = (stops || []).reduce((sum, s) => sum + (s.legEtaMinutes || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-head text-2xl font-semibold text-steel-900 leading-tight">Route</h1>
          <p className="text-sm text-steel-500 mt-1">{fmtDay(date)} · nearest stop first</p>
        </div>
        <IconButton label="Refresh route" icon={RefreshCw} onClick={route.reload} className={cx('!w-11 !h-11 shrink-0', route.loading && '[&>svg]:animate-spin')} />
      </div>

      <Segmented
        options={[
          { value: today, label: 'Today' },
          { value: tomorrow, label: 'Tomorrow' },
        ]}
        value={date}
        onChange={setDate}
        className="w-full grid grid-cols-2 [&>button]:justify-center [&>button]:min-h-[40px]"
      />

      <Card className="!p-4">
        <Toggle
          checked={sharing}
          onChange={(v) => {
            setSharing(v);
            toast(v ? 'Sharing your live location' : 'Stopped sharing location');
          }}
          label="Share my live location"
          description={
            sharing
              ? lastSent
                ? `Customers on your route can follow you. Last update ${timeAgo(lastSent)}.`
                : 'Waiting for GPS…'
              : 'Customers see your live position while you are on the way.'
          }
        />
      </Card>

      {route.error && !route.data ? (
        <ErrorState error={route.error} onRetry={route.reload} />
      ) : !stops ? (
        <>
          <Skeleton className="h-[280px] rounded-xl" />
          <SkeletonRows rows={3} />
        </>
      ) : stops.length === 0 ? (
        <EmptyState
          icon={RouteIcon}
          title={date === today ? 'No stops today' : 'No stops tomorrow'}
          description="No pickups scheduled — you're available for new assignments."
          action={<Button variant="outline" to="/collector">Back to today</Button>}
        />
      ) : (
        <>
          <MapView markers={markers} line={line} center={DEFAULT_CENTER} height={280} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-steel-600">
            <span className="tabular">
              <strong className="text-steel-900">{stops.length}</strong> stop{stops.length > 1 ? 's' : ''}
            </span>
            {totalKm > 0 && (
              <span className="tabular">
                <strong className="text-steel-900">{Math.round(totalKm * 10) / 10}</strong> km
              </span>
            )}
            {totalMin > 0 && (
              <span className="tabular">
                ~<strong className="text-steel-900">{totalMin}</strong> min driving
              </span>
            )}
            {!here && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <LocateFixed className="w-4 h-4" aria-hidden /> Share location for distances
              </span>
            )}
          </div>

          <ol className={cx('space-y-3 transition-opacity', route.loading && 'opacity-60')}>
            {stops.map((s, i) => {
              const a = s.addressSnapshot || {};
              return (
                <li key={s.pickupId} className="bg-surface border border-steel-100 rounded-xl shadow-card overflow-hidden">
                  <div className="flex gap-3 p-4">
                    <span className="w-9 h-9 rounded-full bg-rust-600 text-white font-semibold flex items-center justify-center shrink-0 tabular" aria-label={`Stop ${i + 1}`}>
                      {i + 1}
                    </span>
                    <Link to={`/collector/pickups/${s.pickupId}`} className="min-w-0 flex-1 group">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={s.status} />
                        <span className="text-xs text-steel-500 tabular">{s.pickupId}</span>
                      </div>
                      <p className="mt-1.5 font-semibold text-steel-900 group-hover:text-rust-700">{s.customer?.name || 'Customer'}</p>
                      <p className="text-sm text-steel-600 flex items-start gap-1.5 mt-0.5">
                        <MapPin className="w-4 h-4 text-steel-500 shrink-0 mt-0.5" aria-hidden />
                        <span className="line-clamp-2">{addressLine(a)}</span>
                      </p>
                      <p className="text-sm text-steel-600 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-4 h-4 text-steel-500" aria-hidden />
                          {s.timeSlot}
                        </span>
                        {s.legKm != null && (
                          <span className="tabular text-steel-500">
                            {s.legKm} km{s.legEtaMinutes != null ? ` · ~${s.legEtaMinutes} min` : ''} {i === 0 ? 'from you' : 'from previous'}
                          </span>
                        )}
                      </p>
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 border-t border-steel-100 divide-x divide-steel-100">
                    <a
                      href={telUrl(s.customer?.phone)}
                      className={cx('min-h-[48px] flex items-center justify-center gap-2 text-sm font-medium text-steel-800 hover:bg-steel-50', !s.customer?.phone && 'pointer-events-none opacity-40')}
                      aria-label={`Call ${s.customer?.name || 'customer'}`}
                    >
                      <Phone className="w-4 h-4" aria-hidden /> Call
                    </a>
                    <a
                      href={s.navigateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[48px] flex items-center justify-center gap-2 text-sm font-semibold text-rust-700 hover:bg-steel-50"
                      aria-label={`Navigate to stop ${i + 1} in Google Maps`}
                    >
                      <Navigation className="w-4 h-4" aria-hidden /> Navigate
                    </a>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
