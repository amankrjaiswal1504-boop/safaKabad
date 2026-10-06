import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ExternalLink, KanbanSquare, Map as MapIcon, RefreshCw, UserPlus, Wand2 } from 'lucide-react';
import useApi from '../../hooks/useApi';
import api from '../../services/api';
import { useConfig } from '../../context/ConfigContext';
import { useRealtime } from '../../context/RealtimeContext';
import MapView from '../../components/MapView';
import { Badge, Button, Card, EmptyState, ErrorState, Field, IconButton, Input, PageHeader, Segmented, Skeleton, cx } from '../../components/ui';
import { STATUS_LABEL, STATUS_TONE, fmtDay, timeAgo, todayISO } from '../../utils/format';
import { DEFAULT_CENTER } from '../../utils/locale';
import { AssignModal, CityField, FilterBar, flagLabel, useMutation } from './_ops/shared';

const COLUMNS = ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING'];
const PIN_COLOR = { BOOKED: 'rust', ASSIGNED: 'blue', COLLECTOR_ON_THE_WAY: 'amber', ARRIVED: 'amber', WEIGHING: 'amber' };
const ACCENT = { steel: 'bg-steel-400', blue: 'bg-[rgb(var(--viz-2))]', amber: 'bg-amber-600', rust: 'bg-rust-600', patina: 'bg-patina-600' };

function PickupCard({ p, busy, onAuto, onAssign }) {
  const loc = [p.addressSnapshot?.locality, p.addressSnapshot?.city].filter(Boolean).join(', ');
  return (
    <li className="rounded-lg border border-steel-100 bg-surface p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/admin/pickups?search=${encodeURIComponent(p.pickupId)}`} className="font-mono text-xs font-semibold text-steel-900 hover:text-rust-700">
          {p.pickupId}
        </Link>
        <span className="text-xs text-steel-500 whitespace-nowrap">{p.timeSlot}</span>
      </div>
      <p className="mt-1.5 text-sm font-medium text-steel-900 truncate">{p.customer?.name || 'Customer'}</p>
      <p className="text-xs text-steel-500 truncate">{loc || p.pinCode || '—'}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {p.collector ? <Badge tone="blue">{p.collector.name}</Badge> : <Badge tone="amber">Unassigned</Badge>}
        {p.type === 'donation' && <Badge tone="patina">Donation</Badge>}
        {p.flags?.length > 0 && (
          <Badge tone="danger">
            <AlertTriangle className="w-3 h-3" aria-hidden />
            {p.flags.map(flagLabel).join(', ')}
          </Badge>
        )}
      </div>
      <div className="mt-3 flex items-center gap-1 border-t border-steel-100 pt-2 -mb-1">
        <Button variant="ghost" size="sm" icon={Wand2} loading={busy === `auto:${p.pickupId}`} onClick={() => onAuto(p)} className="!px-2">
          Auto
        </Button>
        <Button variant="ghost" size="sm" icon={UserPlus} onClick={() => onAssign(p)} className="!px-2">
          {p.collector ? 'Reassign' : 'Assign'}
        </Button>
        <Link
          to={`/admin/pickups?search=${encodeURIComponent(p.pickupId)}`}
          aria-label={`Open ${p.pickupId} details`}
          title="Open details"
          className="ml-auto w-8 h-8 inline-flex items-center justify-center rounded-lg text-steel-600 hover:bg-steel-100 hover:text-steel-900"
        >
          <ExternalLink className="w-4 h-4" aria-hidden />
        </Link>
      </div>
    </li>
  );
}

function Board({ date, city }) {
  const { subscribe, connected } = useRealtime() || {};
  const params = { ...(date ? { date } : {}), ...(city ? { city } : {}) };
  const { data, error, loading, reload } = useApi('/admin/dispatch', { params });
  const { busy, run } = useMutation();
  const [assigning, setAssigning] = useState(null);

  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe('pickup:updated', () => reload());
  }, [subscribe, connected, reload]);

  const autoAssign = async (p) => {
    const res = await run(`auto:${p.pickupId}`, () => api.post(`/admin/pickups/${p.pickupId}/auto-assign`), (d) => `Assigned to ${d?.collector?.name || 'collector'}`);
    if (res) reload();
  };
  const assign = async (collectorId) => {
    const res = await run('assign', () => api.post('/admin/assign-collector', { pickupId: assigning.pickupId, collectorId }), 'Collector assigned');
    if (res) {
      setAssigning(null);
      reload();
    }
  };

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data)
    return (
      <div className="flex gap-4 overflow-hidden" role="status" aria-label="Loading board">
        {COLUMNS.map((c) => (
          <Skeleton key={c} className="h-96 w-[272px] shrink-0 rounded-xl" />
        ))}
      </div>
    );

  const total = COLUMNS.reduce((n, c) => n + (data.columns?.[c]?.length || 0), 0);

  return (
    <>
      {total === 0 ? (
        <EmptyState icon={KanbanSquare} title="No active pickups" description={date ? `Nothing scheduled for ${fmtDay(date)}${city ? ` in ${city}` : ''}.` : 'There are no active pickups right now.'} />
      ) : (
        <div className={cx('-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto pb-2 transition-opacity', loading && 'opacity-60')}>
          <div className="flex gap-4 min-w-max xl:min-w-0">
            {COLUMNS.map((status) => {
              const items = data.columns?.[status] || [];
              return (
                <section key={status} aria-label={`${STATUS_LABEL[status]} column`} className="w-[272px] xl:w-auto xl:flex-1 xl:min-w-[220px] shrink-0 rounded-xl bg-steel-50 border border-steel-100 flex flex-col max-h-[70vh]">
                  <header className="flex items-center gap-2 px-3 py-2.5 border-b border-steel-100">
                    <span className={cx('w-2 h-2 rounded-full', ACCENT[STATUS_TONE[status]] || 'bg-steel-400')} aria-hidden />
                    <h2 className="text-sm font-semibold text-steel-900 flex-1">{STATUS_LABEL[status]}</h2>
                    <span className="text-xs text-steel-500 tabular">{items.length}</span>
                  </header>
                  {items.length ? (
                    <ul className="p-2 space-y-2 overflow-y-auto">
                      {items.map((p) => (
                        <PickupCard key={p._id} p={p} busy={busy} onAuto={autoAssign} onAssign={setAssigning} />
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-6 text-center text-xs text-steel-400">Nothing here</p>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
      <AssignModal
        open={Boolean(assigning)}
        onClose={() => setAssigning(null)}
        title={assigning ? `Assign ${assigning.pickupId}` : 'Assign collector'}
        busy={busy === 'assign'}
        onAssign={assign}
      />
    </>
  );
}

function LiveMap() {
  const { subscribe, connected } = useRealtime() || {};
  const { data, error, loading, reload } = useApi('/admin/live-map');
  const [live, setLive] = useState({});

  useEffect(() => {
    if (!subscribe) return undefined;
    const offLoc = subscribe('collector:location', (m) => {
      if (!m?.collectorId || !Number.isFinite(m.lat)) return;
      setLive((prev) => ({ ...prev, [m.collectorId]: m }));
    });
    const offPickup = subscribe('pickup:updated', () => reload());
    return () => {
      offLoc();
      offPickup();
    };
  }, [subscribe, connected, reload]);

  const { markers, collectorCount, pickupCount } = useMemo(() => {
    if (!data) return { markers: [], collectorCount: 0, pickupCount: 0 };
    const seen = new Set();
    const cm = (data.collectors || []).map((c) => {
      const l = live[c._id];
      seen.add(String(c._id));
      const loc = l ? { lat: l.lat, lng: l.lng, updatedAt: l.at } : c.collectorProfile?.location || {};
      return {
        id: `c-${c._id}`,
        lat: loc.lat,
        lng: loc.lng,
        icon: 'dot',
        color: c.collectorProfile?.isAvailable === false ? 'steel' : 'blue',
        popup: (
          <div>
            <strong>{c.name}</strong>
            <div>{c.collectorProfile?.isAvailable === false ? 'Off duty' : 'Available'}</div>
            {loc.updatedAt && <div>Seen {timeAgo(loc.updatedAt)}</div>}
          </div>
        ),
      };
    });
    // Collectors who came online since the map loaded.
    Object.values(live)
      .filter((l) => !seen.has(String(l.collectorId)))
      .forEach((l) =>
        cm.push({
          id: `c-${l.collectorId}`,
          lat: l.lat,
          lng: l.lng,
          icon: 'dot',
          color: 'blue',
          popup: (
            <div>
              <strong>{l.name || 'Collector'}</strong>
              <div>Seen {timeAgo(l.at || Date.now())}</div>
            </div>
          ),
        })
      );
    const pm = (data.pickups || []).map((p) => ({
      id: `p-${p._id}`,
      lat: p.location?.lat,
      lng: p.location?.lng,
      color: p.collector ? PIN_COLOR[p.status] || 'rust' : 'rust',
      popup: (
        <div>
          <strong>{p.pickupId}</strong>
          <div>{STATUS_LABEL[p.status]}</div>
          {p.addressSnapshot?.locality && <div>{p.addressSnapshot.locality}</div>}
          {p.timeSlot && <div>{p.timeSlot}</div>}
          <div>{p.collector?.name || 'Unassigned'}</div>
        </div>
      ),
    }));
    return { markers: [...pm, ...cm], collectorCount: cm.length, pickupCount: pm.length };
  }, [data, live]);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-[480px] rounded-xl" />;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-b border-steel-100 text-xs text-steel-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[rgb(var(--viz-2))]" aria-hidden /> Collectors ({collectorCount})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rust-600" aria-hidden /> Unassigned pickup
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-600" aria-hidden /> In progress
        </span>
        <span className="text-steel-500">{pickupCount} active pickups with a location</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span className={cx('w-2 h-2 rounded-full', connected ? 'bg-patina-600 animate-pulse2' : 'bg-steel-400')} aria-hidden />
          {connected ? 'Live' : 'Offline – showing last known positions'}
        </span>
        <IconButton label="Refresh map" icon={RefreshCw} onClick={reload} className={cx('!w-8 !h-8', loading && 'animate-spin')} />
      </div>
      {markers.length ? (
        <MapView markers={markers} center={DEFAULT_CENTER} height={480} className="!rounded-none !border-0" />
      ) : (
        <div className="p-5">
          <EmptyState icon={MapIcon} title="Nothing to show yet" description="Collector locations appear once they share their location from the collector app." />
        </div>
      )}
    </Card>
  );
}

export default function AdminDispatch() {
  const { cities } = useConfig();
  const [view, setView] = useState('board');
  const [date, setDate] = useState(todayISO());
  const [city, setCity] = useState('');

  return (
    <div>
      <PageHeader
        title="Dispatch"
        subtitle="Assign collectors and follow active pickups in real time"
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'board', label: 'Board', icon: KanbanSquare },
              { value: 'map', label: 'Live map', icon: MapIcon },
            ]}
          />
        }
      />

      {view === 'board' ? (
        <>
          <FilterBar>
            <Field label="Scheduled date" className="w-full sm:w-48">
              {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
            <CityField value={city} onChange={setCity} cities={cities} />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDate(todayISO())} disabled={date === todayISO()}>
                Today
              </Button>
              <Button variant="ghost" onClick={() => setDate('')} disabled={!date}>
                All dates
              </Button>
            </div>
            <p className="text-xs text-steel-500 sm:ml-auto self-center max-w-xs">
              Auto picks an available collector serving the postal code (else the city) with the fewest pickups that day, then the nearest.
            </p>
          </FilterBar>
          <Board date={date} city={city} />
        </>
      ) : (
        <LiveMap />
      )}
    </div>
  );
}
