import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Info, PackageCheck, Percent, RefreshCw, Star, Wallet } from 'lucide-react';
import useApi from '../../hooks/useApi';
import { ColumnChart, ChartTable } from '../../components/charts';
import { Card, EmptyState, ErrorState, IconButton, SectionTitle, Skeleton, SkeletonRows, Stars, cx } from '../../components/ui';
import { fmtDate, fmtDateTime, rupees } from '../../utils/format';
import { DATE_LOCALE } from '../../utils/locale';

const weekLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(DATE_LOCALE, { day: 'numeric', month: 'short' });

// Fill weeks with no completed pickups so the chart shows a steady timeline.
function lastWeeks(statements, n) {
  const byWeek = new Map(statements.map((s) => [s.weekOf, s]));
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    const iso = d.toISOString().slice(0, 10);
    out.push(byWeek.get(iso) || { weekOf: iso, pickups: 0, commission: 0, bonus: 0, total: 0, collected: 0 });
  }
  return out;
}

export default function CollectorEarnings() {
  const { data, error, loading, reload } = useApi('/collector/earnings', { params: { weeks: 6 } });
  const chartData = useMemo(() => (data ? lastWeeks(data.statements || [], 6) : []), [data]);

  if (error && !data) {
    return (
      <div className="space-y-4">
        <h1 className="font-head text-2xl font-semibold text-steel-900">Earnings</h1>
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading earnings">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
        <SkeletonRows rows={3} />
      </div>
    );
  }

  const { rules, thisWeek, toNextBonus, statements = [], lines = [], rating, ratingCount } = data;
  const threshold = rules?.weeklyBonusThreshold || 0;
  const progress = threshold ? Math.min(1, (thisWeek.pickups || 0) / threshold) : 0;
  const bonusEarned = thisWeek.bonus > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-head text-2xl font-semibold text-steel-900 leading-tight">Earnings</h1>
          <p className="text-sm text-steel-500 mt-1">Weeks run Monday to Sunday</p>
        </div>
        <IconButton label="Refresh earnings" icon={RefreshCw} onClick={reload} className={cx('!w-11 !h-11 shrink-0', loading && '[&>svg]:animate-spin')} />
      </div>

      {/* Hero */}
      <Card className="!p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-steel-500">This week</p>
        <p className="font-head text-4xl font-semibold text-steel-900 tabular mt-1">{rupees(thisWeek.total)}</p>
        <p className="text-sm text-steel-600 mt-1 tabular">
          {thisWeek.pickups} pickup{thisWeek.pickups === 1 ? '' : 's'} · commission {rupees(thisWeek.commission)}
          {bonusEarned ? ` · bonus ${rupees(thisWeek.bonus)}` : ''}
        </p>

        {threshold > 0 && (
          <div className="mt-5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-steel-900 inline-flex items-center gap-1.5">
                <Gift className={cx('w-4 h-4', bonusEarned ? 'text-patina-600' : 'text-rust-600')} aria-hidden />
                Weekly bonus {rupees(rules.weeklyBonusAmount)}
              </span>
              <span className="text-steel-500 tabular">
                {Math.min(thisWeek.pickups, threshold)}/{threshold}
              </span>
            </div>
            <div
              className="mt-2 h-3 rounded-full bg-steel-100 overflow-hidden"
              role="meter"
              aria-label="Progress to weekly bonus"
              aria-valuemin={0}
              aria-valuemax={threshold}
              aria-valuenow={Math.min(thisWeek.pickups, threshold)}
            >
              <div className={cx('h-full rounded-full transition-[width] duration-500', bonusEarned ? 'bg-patina-600' : 'bg-rust-600')} style={{ width: `${progress * 100}%` }} />
            </div>
            <p className={cx('text-sm mt-2', bonusEarned ? 'text-patina-700 font-medium' : 'text-steel-600')}>
              {bonusEarned ? 'Bonus unlocked this week. Nice work!' : `${toNextBonus} more pickup${toNextBonus === 1 ? '' : 's'} to unlock the bonus.`}
            </p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="!p-4">
          <p className="text-xs text-steel-500 flex items-center gap-1">
            <Star className="w-3.5 h-3.5" aria-hidden /> Rating
          </p>
          <p className="font-head text-2xl font-semibold text-steel-900 tabular mt-0.5">{rating ? Number(rating).toFixed(1) : '—'}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Stars value={rating} size="w-3.5 h-3.5" />
            <span className="text-xs text-steel-500 tabular">({ratingCount})</span>
          </div>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-steel-500 flex items-center gap-1">
            <PackageCheck className="w-3.5 h-3.5" aria-hidden /> Last 6 weeks
          </p>
          <p className="font-head text-2xl font-semibold text-steel-900 tabular mt-0.5">{rupees(statements.reduce((s, w) => s + (w.total || 0), 0))}</p>
          <p className="text-xs text-steel-500 mt-0.5 tabular">{statements.reduce((s, w) => s + (w.pickups || 0), 0)} pickups</p>
        </Card>
      </div>

      {/* Chart */}
      <Card className="!p-4">
        <SectionTitle title="Weekly earnings" subtitle="Commission + bonus per week" className="!mb-2" />
        <ColumnChart data={chartData} label="weekOf" value="total" format={(v) => rupees(v)} labelFormat={weekLabel} />
        <ChartTable
          columns={[
            { key: 'weekOf', label: 'Week of', format: weekLabel },
            { key: 'pickups', label: 'Pickups' },
            { key: 'commission', label: 'Commission', format: (v) => rupees(v) },
            { key: 'bonus', label: 'Bonus', format: (v) => rupees(v) },
            { key: 'total', label: 'Total', format: (v) => rupees(v) },
          ]}
          rows={chartData}
        />
      </Card>

      {/* Statements */}
      <section>
        <SectionTitle title="Weekly statements" />
        {statements.length === 0 ? (
          <EmptyState icon={Wallet} title="No earnings yet" description="Complete your first pickup to start earning." />
        ) : (
          <ul className="space-y-2">
            {statements.map((w) => (
              <li key={w.weekOf} className="bg-surface border border-steel-100 rounded-xl shadow-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-steel-900">Week of {fmtDate(`${w.weekOf}T00:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    <p className="text-xs text-steel-500 mt-0.5 tabular">
                      {w.pickups} pickup{w.pickups === 1 ? '' : 's'} · {rupees(w.collected)} paid to customers
                    </p>
                  </div>
                  <p className="font-head text-lg font-semibold text-steel-900 tabular shrink-0">{rupees(w.total)}</p>
                </div>
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel-600 tabular">
                  <div className="flex gap-1">
                    <dt>Commission</dt>
                    <dd className="font-medium text-steel-800">{rupees(w.commission)}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Bonus</dt>
                    <dd className={cx('font-medium', w.bonus ? 'text-patina-700' : 'text-steel-800')}>{rupees(w.bonus)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent pickups */}
      {lines.length > 0 && (
        <section>
          <SectionTitle title="Recent pickups" subtitle="What you earned on each job" />
          <Card padded={false}>
            <ul className="divide-y divide-steel-100">
              {lines.slice(0, 20).map((l) => (
                <li key={l.pickupId}>
                  <Link to={`/collector/pickups/${l.pickupId}`} className="flex items-center justify-between gap-3 px-4 py-3 min-h-[56px] hover:bg-steel-50">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-steel-900 truncate">{l.locality || l.pickupId}</span>
                      <span className="block text-xs text-steel-500 tabular">
                        {l.pickupId} · {fmtDateTime(l.completedAt)}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-semibold text-patina-700 tabular">+{rupees(l.commission)}</span>
                      <span className="block text-xs text-steel-500 tabular">of {rupees(l.finalAmount)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* Rules */}
      {rules && (
        <Card className="!p-4 bg-steel-50">
          <h2 className="font-semibold text-steel-900 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-steel-500" aria-hidden /> How earnings are calculated
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm text-steel-700">
            <li className="flex gap-2">
              <Wallet className="w-4 h-4 text-steel-500 shrink-0 mt-0.5" aria-hidden />
              <span>
                <strong className="text-steel-900">{rupees(rules.baseFeePerPickup)}</strong> base fee for every completed pickup.
              </span>
            </li>
            <li className="flex gap-2">
              <Percent className="w-4 h-4 text-steel-500 shrink-0 mt-0.5" aria-hidden />
              <span>
                Plus <strong className="text-steel-900">{rules.commissionPercent}%</strong> of the amount paid to the customer (donations earn the base fee).
              </span>
            </li>
            <li className="flex gap-2">
              <Gift className="w-4 h-4 text-steel-500 shrink-0 mt-0.5" aria-hidden />
              <span>
                Complete <strong className="text-steel-900">{rules.weeklyBonusThreshold}</strong> pickups in a week to earn a <strong className="text-steel-900">{rupees(rules.weeklyBonusAmount)}</strong> bonus.
              </span>
            </li>
          </ul>
          <p className="text-xs text-steel-500 mt-3">Example: a {rupees(500)} pickup earns {rupees(Math.round(rules.baseFeePerPickup + (500 * rules.commissionPercent) / 100))}.</p>
        </Card>
      )}
    </div>
  );
}
