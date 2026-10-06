import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CircleCheckBig,
  ClipboardList,
  Banknote,
  KanbanSquare,
  ShieldAlert,
  Truck,
  UserX,
  Users,
} from 'lucide-react';
import useApi from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { Card, ErrorState, PageHeader, SectionTitle, Skeleton, Stat, Button, cx } from '../../components/ui';
import { BarList, ChartTable, LineChart } from '../../components/charts';
import { STATUS_LABEL, compact, fmtDay, rupees, todayISO } from '../../utils/format';
import { DATE_LOCALE } from '../../utils/locale';

const STATUS_ORDER = ['BOOKED', 'ASSIGNED', 'COLLECTOR_ON_THE_WAY', 'ARRIVED', 'WEIGHING', 'COMPLETED', 'CANCELLED'];
const SERIES = [
  { key: 'bookings', label: 'Bookings', color: 'viz-1', area: true },
  { key: 'completed', label: 'Completed', color: 'viz-2' },
];
const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(DATE_LOCALE, { day: 'numeric', month: 'short' });

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

function AttentionItem({ to, icon: Icon, count, label, tone }) {
  const active = count > 0;
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg px-3 py-3 -mx-3 hover:bg-steel-50 focus-visible:bg-steel-50 transition-colors group"
    >
      <span
        className={cx(
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
          !active ? 'bg-steel-100 text-steel-500' : tone === 'danger' ? 'bg-danger-100 text-danger-700' : 'bg-amber-100 text-amber-700'
        )}
      >
        <Icon className="w-[18px] h-[18px]" aria-hidden />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-steel-900">{label}</span>
        <span className="block text-xs text-steel-500">{active ? 'Needs attention' : 'All clear'}</span>
      </span>
      <span className="font-head text-lg font-semibold text-steel-900 tabular">{count}</span>
      <ArrowRight className="w-4 h-4 text-steel-400 group-hover:text-steel-900" aria-hidden />
    </Link>
  );
}

const QUICK_LINKS = [
  { to: '/admin/dispatch', label: 'Dispatch board', desc: "Assign and track today's pickups", icon: KanbanSquare, perm: ['dispatch', 'pickups'] },
  { to: '/admin/pickups', label: 'All pickups', desc: 'Search, filter and export', icon: Truck, perm: ['pickups:read'] },
  { to: '/admin/collectors', label: 'Collectors', desc: 'Availability, areas and ratings', icon: ClipboardList, perm: ['collectors'] },
  { to: '/admin/analytics', label: 'Analytics', desc: 'Margins, funnel and reports', icon: BarChart3, perm: ['analytics'] },
];

export default function AdminDashboard() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi('/admin/dashboard');

  const daily = (data?.daily || []).map((d) => ({ date: d._id || d.date, bookings: d.bookings || 0, completed: d.completed || 0, value: d.value || 0 }));
  const byStatus = STATUS_ORDER.map((s) => ({ status: STATUS_LABEL[s], count: data?.pickupsByStatus?.[s] || 0 })).filter((r) => r.count > 0);
  const active = data ? data.pendingPickups - data.unassigned : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Operations overview · ${fmtDay(todayISO())}`}
        actions={
          (can('dispatch') || can('pickups')) && (
            <Button to="/admin/dispatch" icon={KanbanSquare}>
              Open dispatch
            </Button>
          )
        }
      />

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <div className={cx('space-y-6 transition-opacity', loading && 'opacity-60')}>
          <section aria-label="Key numbers" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Stat label="Pickups today" value={compact(data.pickupsToday)} icon={CalendarCheck} tone="rust" hint="Scheduled, not cancelled" />
            <Stat label="Unassigned" value={compact(data.unassigned)} icon={UserX} tone={data.unassigned ? 'amber' : 'steel'} hint="Booked, waiting for a collector" />
            <Stat label="In progress" value={compact(Math.max(0, active))} icon={Truck} hint="Assigned through weighing" />
            <Stat label="Completed" value={compact(data.completedPickups)} icon={CircleCheckBig} tone="patina" hint={`${compact(data.cancelledPickups)} cancelled all-time`} />
            <Stat label="Customers" value={compact(data.totalCustomers)} icon={Users} />
            <Stat label="Collectors" value={compact(data.totalCollectors)} icon={ClipboardList} />
            <Stat label="Paid out" value={rupees(data.totalAmountPaid)} icon={Banknote} tone="patina" hint="Successful payouts, all-time" />
            <Stat label="Flagged (active)" value={compact(data.flaggedActive)} icon={ShieldAlert} tone={data.flaggedActive ? 'amber' : 'steel'} hint="Fraud or abuse signals" />
          </section>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 min-w-0">
              <SectionTitle title="Bookings vs completed" subtitle="Last 30 days, by booking date" />
              <LineChart title="Bookings and completed pickups per day" data={daily} x="date" series={SERIES} xFormat={shortDay} />
              <ChartTable
                columns={[
                  { key: 'date', label: 'Date', format: shortDay },
                  { key: 'bookings', label: 'Bookings' },
                  { key: 'completed', label: 'Completed' },
                  { key: 'value', label: 'Value paid', format: (v) => rupees(v) },
                ]}
                rows={daily}
              />
            </Card>

            <Card className="min-w-0">
              <SectionTitle title="Needs attention" />
              <div className="divide-y divide-steel-100">
                <AttentionItem to="/admin/pickups?collector=none&status=BOOKED" icon={UserX} count={data.unassigned} label="Unassigned pickups" />
                <AttentionItem to="/admin/pickups?flagged=true&status=active" icon={AlertTriangle} count={data.flaggedActive} label="Flagged active pickups" tone="danger" />
                <AttentionItem to={`/admin/pickups?dateFrom=${todayISO()}&dateTo=${todayISO()}`} icon={CalendarCheck} count={data.pickupsToday} label="Scheduled today" />
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="min-w-0">
              <SectionTitle title="Pickups by status" subtitle={`${compact(data.totalPickups)} all-time`} />
              <BarList data={byStatus} label="status" value="count" />
              <ChartTable
                columns={[
                  { key: 'status', label: 'Status' },
                  { key: 'count', label: 'Pickups' },
                ]}
                rows={byStatus}
              />
            </Card>

            <Card className="lg:col-span-2 min-w-0">
              <SectionTitle title="Quick links" />
              <div className="grid sm:grid-cols-2 gap-3">
                {QUICK_LINKS.filter((l) => l.perm.some((p) => can(p))).map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="flex items-start gap-3 rounded-xl border border-steel-100 p-4 hover:border-steel-200 hover:bg-steel-50 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-lg bg-rust-100 text-rust-700 flex items-center justify-center shrink-0">
                      <l.icon className="w-[18px] h-[18px]" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-steel-900">{l.label}</span>
                      <span className="block text-xs text-steel-500 mt-0.5">{l.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
