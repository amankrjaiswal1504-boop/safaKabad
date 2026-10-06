import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CalendarCheck, ChevronRight, CloudUpload, History, PackageCheck, RefreshCw, Star, Truck } from 'lucide-react';
import api from '../../services/api';
import useApi from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { Card, EmptyState, ErrorState, IconButton, Segmented, Skeleton, SkeletonRows, Toggle, cx } from '../../components/ui';
import { rupees } from '../../utils/format';
import { TIMEZONE } from '../../utils/locale';
import { PickupCard, useOfflineSync } from './collectorShared';

const VIEWS = [
  { value: 'active', label: 'Active', icon: Truck },
  { value: 'today', label: 'Today', icon: CalendarCheck },
  { value: 'history', label: 'History', icon: History },
];

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TIMEZONE }).format(new Date()));
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const EMPTY = {
  active: { title: 'No active pickups', description: "No pickups right now — you're available for new assignments." },
  today: { title: 'No pickups today', description: "No pickups today — you're available for new assignments." },
  history: { title: 'No past pickups yet', description: 'Completed and cancelled pickups will show up here.' },
};

export default function CollectorToday() {
  const { user, refreshMe } = useAuth();
  const realtime = useRealtime();
  const profile = user?.collectorProfile || {};
  const [view, setView] = useState('active');
  const [available, setAvailable] = useState(profile.isAvailable !== false);
  const [savingAvail, setSavingAvail] = useState(false);

  const list = useApi('/collector/pickups', { params: { view } });
  const earnings = useApi('/collector/earnings', { params: { weeks: 1 } });
  const { pending } = useOfflineSync(() => list.reload());

  useEffect(() => {
    setAvailable(profile.isAvailable !== false);
  }, [profile.isAvailable]);

  const reloadList = list.reload;
  const reloadEarnings = earnings.reload;
  const subscribe = realtime?.subscribe;
  const connected = realtime?.connected;
  useEffect(() => {
    if (!subscribe) return undefined;
    const off1 = subscribe('notification', () => {
      reloadList();
      reloadEarnings();
    });
    const off2 = subscribe('pickup:status', () => reloadList());
    return () => {
      off1();
      off2();
    };
  }, [subscribe, connected, reloadList, reloadEarnings]);

  async function toggleAvailability(next) {
    setAvailable(next);
    setSavingAvail(true);
    try {
      await api.put('/collector/availability', { isAvailable: next });
      toast.success(next ? "You're available for new pickups" : "You're off duty. No new pickups will be assigned.");
      refreshMe();
    } catch (err) {
      setAvailable(!next);
      toast.error(err.message);
    } finally {
      setSavingAvail(false);
    }
  }

  function refresh() {
    list.reload();
    earnings.reload();
  }

  const pickups = list.data?.pickups;
  const firstName = (user?.name || '').split(' ')[0];
  const wk = earnings.data?.thisWeek;
  const rules = earnings.data?.rules;
  const toNext = earnings.data?.toNextBonus;

  return (
    <div className="space-y-5">
      {/* Greeting + availability */}
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-head text-2xl font-semibold text-steel-900 leading-tight">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-steel-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-600 fill-current" aria-hidden />
              <span className="tabular">{profile.rating ? Number(profile.rating).toFixed(1) : 'New'}</span>
              <span className="sr-only">rating</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <PackageCheck className="w-4 h-4" aria-hidden />
              <span className="tabular">{profile.totalPickupsCompleted || 0}</span> pickups done
            </span>
          </p>
        </div>
        <IconButton label="Refresh" icon={RefreshCw} onClick={refresh} className={cx('!w-11 !h-11 shrink-0', (list.loading || earnings.loading) && '[&>svg]:animate-spin')} />
      </section>

      <Card className={cx('!p-4 border-2', available ? '!border-patina-200 bg-patina-50' : '!border-steel-200')}>
        <Toggle
          checked={available}
          disabled={savingAvail}
          onChange={toggleAvailability}
          label={available ? 'Available for pickups' : 'Off duty'}
          description={available ? 'New pickups in your area can be assigned to you.' : 'Switch on when you are ready to take pickups.'}
        />
      </Card>

      {pending > 0 && (
        <div role="status" className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <CloudUpload className="w-4 h-4 shrink-0" aria-hidden />
          {pending} weighing{pending > 1 ? 's' : ''} saved on this phone — will sync when you're online.
        </div>
      )}

      {/* Earnings snapshot */}
      <Link
        to="/collector/earnings"
        className="block bg-surface border border-steel-100 rounded-xl shadow-card p-4 hover:bg-steel-50 transition-colors"
        aria-label="This week's earnings, open earnings"
      >
        {earnings.loading && !earnings.data ? (
          <Skeleton className="h-14" />
        ) : earnings.error ? (
          <p className="text-sm text-steel-500">Earnings unavailable right now.</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium uppercase tracking-wide text-steel-500">This week</div>
              <div className="font-head text-2xl font-semibold text-steel-900 tabular">{rupees(wk?.total)}</div>
              <div className="text-xs text-steel-500 mt-0.5">
                {wk?.pickups || 0} pickup{wk?.pickups === 1 ? '' : 's'}
                {wk?.bonus ? ` · bonus ${rupees(wk.bonus)} earned` : toNext > 0 && rules ? ` · ${toNext} more for ${rupees(rules.weeklyBonusAmount)} bonus` : ''}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-steel-400 shrink-0" aria-hidden />
          </div>
        )}
      </Link>

      {/* Pickups */}
      <section aria-label="Pickups">
        <Segmented options={VIEWS} value={view} onChange={setView} className="w-full grid grid-cols-3 [&>button]:justify-center [&>button]:min-h-[40px]" />
        <div className="mt-4">
          {list.error && !pickups ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : !pickups ? (
            <SkeletonRows rows={3} className="[&>div]:h-36" />
          ) : pickups.length === 0 ? (
            <EmptyState icon={view === 'history' ? History : Truck} title={EMPTY[view].title} description={EMPTY[view].description} />
          ) : (
            <ul className={cx('space-y-3 transition-opacity', list.loading && 'opacity-60')}>
              {pickups.map((p) => (
                <li key={p.pickupId}>
                  <PickupCard pickup={p} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
