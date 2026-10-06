import { useState } from 'react';
import { AlertTriangle, BarChart3, FileText } from 'lucide-react';
import useApi from '../../hooks/useApi';
import { useConfig } from '../../context/ConfigContext';
import { Card, DataTable, EmptyState, ErrorState, PageHeader, Segmented, SectionTitle, Skeleton, Stars, Stat, cx } from '../../components/ui';
import { BarList, ChartTable, ColumnChart, Funnel, LineChart } from '../../components/charts';
import { compact, rupees } from '../../utils/format';
import { CURRENCY_SYMBOL, DATE_LOCALE } from '../../utils/locale';
import { CityField, ExportButton, FilterBar, pct, qs } from './_ops/shared';

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
];
const MONEY_SERIES = [
  { key: 'recyclerValue', label: 'Recycler value', color: 'viz-1', area: true },
  { key: 'payout', label: 'Paid to customers', color: 'viz-2' },
];
const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(DATE_LOCALE, { day: 'numeric', month: 'short' });
const money = (v) => `${CURRENCY_SYMBOL} ${compact(v)}`;

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading analytics">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid lg:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const { cities } = useConfig();
  const [days, setDays] = useState(30);
  const [city, setCity] = useState('');
  const params = { days, ...(city ? { city } : {}) };
  const { data, error, loading, reload } = useApi('/admin/analytics', { params });
  const query = qs(params);
  const t = data?.totals;

  const collectorColumns = [
    { key: 'name', header: 'Collector', render: (c) => <span className="font-medium text-steel-900">{c.name}</span> },
    { key: 'assigned', header: 'Assigned', className: 'text-right tabular' },
    { key: 'completed', header: 'Completed', className: 'text-right tabular' },
    { key: 'rate', header: 'Completion', className: 'text-right tabular', render: (c) => pct(c.assigned ? c.completed / c.assigned : null) },
    { key: 'cancelled', header: 'Cancelled by them', className: 'text-right tabular' },
    { key: 'value', header: 'Value', className: 'text-right tabular', render: (c) => rupees(c.value) },
    {
      key: 'rating',
      header: 'Rating',
      render: (c) =>
        c.rating ? (
          <span className="inline-flex items-center gap-1.5">
            <Stars value={c.rating} size="w-3.5 h-3.5" />
            <span className="text-xs text-steel-500 tabular">{Number(c.rating).toFixed(1)}</span>
          </span>
        ) : (
          <span className="text-steel-400">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Volumes, margins and collector performance"
        actions={
          <>
            <ExportButton path={`/admin/analytics?${query}&format=csv`} filename={`scrapmate-analytics-${days}d.csv`} label="CSV" />
            <ExportButton path={`/admin/analytics?${query}&format=pdf`} filename={`scrapmate-report-${days}d.pdf`} label="PDF report" />
          </>
        }
      />

      <FilterBar>
        <div role="group" aria-labelledby="analytics-period">
          <span id="analytics-period" className="label">
            Period
          </span>
          <Segmented options={RANGES} value={days} onChange={setDays} className="flex-wrap" />
        </div>
        <CityField value={city} onChange={setCity} cities={cities} />
      </FilterBar>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <AnalyticsSkeleton />
      ) : (
        <div className={cx('space-y-6 transition-opacity', loading && 'opacity-60')} aria-busy={loading || undefined}>
          {error && <ErrorState error={error} onRetry={reload} />}

          {t.missingRecyclerPrice > 0 && (
            <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" aria-hidden />
              <p className="text-steel-700">
                <span className="font-medium text-steel-900">Margin is understated.</span> {t.missingRecyclerPrice} completed item
                {t.missingRecyclerPrice === 1 ? '' : 's'} had no recycler price for their city, so they count as {rupees(0)} recycler value. Set recycler
                prices on the Prices page.
              </p>
            </div>
          )}

          <section aria-label="Totals" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label="Bookings" value={compact(t.bookings)} hint={`${compact(t.completed)} completed`} />
            <Stat label="Cancellation rate" value={pct(t.cancellationRate, 1)} hint={`${compact(t.cancelled)} cancelled`} tone={t.cancellationRate > 0.2 ? 'amber' : 'steel'} />
            <Stat label="Scrap collected" value={`${compact(t.weightKg)} kg`} />
            <Stat label="Paid to customers" value={rupees(t.payout)} hint={`Avg ${rupees(t.avgPickupValue)} per pickup`} />
            <Stat label="Recycler value" value={rupees(t.recyclerValue)} />
            <Stat label="Collector commission" value={rupees(t.collectorCommission)} />
            <Stat
              label="Margin"
              value={rupees(t.margin)}
              hint={t.marginPercent != null ? `${pct(t.marginPercent, 1)} of recycler value` : 'No recycler value yet'}
              tone={t.margin < 0 ? 'amber' : 'patina'}
            />
            <Stat label="Repeat customers" value={pct(t.repeatCustomerRate)} hint="Customers with 2+ completed pickups" />
          </section>

          {data.daily.length === 0 && t.bookings === 0 ? (
            <EmptyState icon={BarChart3} title="No activity in this period" description="Try a longer period or a different city." />
          ) : (
            <>
              <div className="grid lg:grid-cols-2 gap-4">
                <Card className="min-w-0">
                  <SectionTitle title="Recycler value vs payouts" subtitle="Per day, completed pickups" />
                  <LineChart title="Recycler value and customer payouts per day" data={data.daily} x="date" series={MONEY_SERIES} format={money} xFormat={shortDay} />
                  <ChartTable
                    columns={[
                      { key: 'date', label: 'Date', format: shortDay },
                      { key: 'recyclerValue', label: 'Recycler value', format: (v) => rupees(v) },
                      { key: 'payout', label: 'Paid', format: (v) => rupees(v) },
                      { key: 'margin', label: 'Margin', format: (v) => rupees(v) },
                    ]}
                    rows={data.daily}
                  />
                </Card>
                <Card className="min-w-0">
                  <SectionTitle title="Completed pickups" subtitle="Per day" />
                  <ColumnChart data={data.daily} label="date" value="completed" labelFormat={shortDay} />
                  <ChartTable
                    columns={[
                      { key: 'date', label: 'Date', format: shortDay },
                      { key: 'completed', label: 'Completed' },
                    ]}
                    rows={data.daily}
                  />
                </Card>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <Card className="min-w-0">
                  <SectionTitle title="Conversion funnel" subtitle="Site visits through completed pickups" />
                  <Funnel steps={data.funnel} />
                  <ChartTable
                    columns={[
                      { key: 'step', label: 'Step' },
                      { key: 'count', label: 'Count' },
                    ]}
                    rows={data.funnel}
                  />
                </Card>
                <Card className="min-w-0">
                  <SectionTitle title="Top items" subtitle="By weight collected" />
                  <BarList data={data.topItems} label="item" value="weight" format={(v) => `${compact(v)} kg`} />
                  <ChartTable
                    columns={[
                      { key: 'item', label: 'Item' },
                      { key: 'weight', label: 'kg' },
                      { key: 'value', label: 'Paid', format: (v) => rupees(v) },
                      { key: 'pickups', label: 'Pickups' },
                    ]}
                    rows={data.topItems}
                  />
                </Card>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <Card className="min-w-0">
                  <SectionTitle title="Busiest areas" subtitle="Bookings by city and postal code" />
                  <BarList data={data.byArea.map((a) => ({ area: `${a.city || '—'} · ${a.pinCode || '—'}`, pickups: a.pickups }))} label="area" value="pickups" />
                  <ChartTable
                    columns={[
                      { key: 'city', label: 'City' },
                      { key: 'pinCode', label: 'Postal code' },
                      { key: 'pickups', label: 'Bookings' },
                    ]}
                    rows={data.byArea}
                  />
                </Card>
                <Card className="min-w-0">
                  <SectionTitle title="Bookings by time slot" />
                  <ColumnChart data={data.bySlot.map((s) => ({ slot: s.slot || '—', pickups: s.pickups }))} label="slot" value="pickups" />
                  <ChartTable
                    columns={[
                      { key: 'slot', label: 'Slot' },
                      { key: 'pickups', label: 'Bookings' },
                    ]}
                    rows={data.bySlot}
                  />
                </Card>
              </div>
            </>
          )}

          <section>
            <SectionTitle title="Collector performance" subtitle="Pickups assigned in this period" />
            <DataTable
              rows={data.collectors}
              columns={collectorColumns}
              dense
              empty={<EmptyState icon={FileText} title="No collector activity" description="No pickups were assigned to collectors in this period." />}
            />
          </section>
        </div>
      )}
    </div>
  );
}
