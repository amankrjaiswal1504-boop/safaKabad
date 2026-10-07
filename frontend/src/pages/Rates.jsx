import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, Clock, LineChart as LineIcon, Search, Sparkles, TrendingUp, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import useApi, { useDebounce } from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { useConfig } from '../context/ConfigContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { Button, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, cx } from '../components/ui';
import { CitySelect } from '../components/Navbar';
import { RangeChart, ChartTable } from '../components/charts';
import CategoryIcon from '../components/CategoryIcon';
import { fmtDate, rupees, unitLabel } from '../utils/format';
import { CURRENCY_SYMBOL } from '../utils/locale';

function TrendModal({ rate, city, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading } = useApi(rate ? `/scrap/trends/${rate.itemId}` : null, { params: { city } });
  const [threshold, setThreshold] = useState('');
  const [direction, setDirection] = useState('above');
  const [saving, setSaving] = useState(false);

  async function createAlert(e) {
    e.preventDefault();
    if (!user) return navigate('/login', { state: { from: '/rates' } });
    setSaving(true);
    try {
      await api.post('/price-alerts', { itemId: rate.itemId, city, direction, threshold: Number(threshold) });
      toast.success(`We'll notify you when ${rate.name} goes ${direction} ${rupees(threshold)}`);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={Boolean(rate)} onClose={onClose} title={rate ? `${rate.name} · ${city}` : ''} size="lg">
      {rate && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
            <div>
              <div className="text-sm text-steel-500">Current rate</div>
              <div className="font-head text-2xl font-semibold text-steel-900 tabular">
                {rupees(rate.minPrice)} – {rupees(rate.maxPrice)} <span className="text-base text-steel-500 font-normal">/ {unitLabel(rate.unit)}</span>
              </div>
            </div>
            <span className="text-xs text-steel-500">Min–max range over the last 6 months</span>
          </div>
          {loading && !data ? <Skeleton className="h-48" /> : <RangeChart points={data?.points || []} />}
          {data?.points?.length > 0 && (
            <ChartTable
              columns={[
                { key: 'date', label: 'Date', format: (d) => fmtDate(d) },
                { key: 'min', label: 'Min', format: (v) => rupees(v) },
                { key: 'max', label: 'Max', format: (v) => rupees(v) },
              ]}
              rows={data.points}
            />
          )}
          <form onSubmit={createAlert} className="mt-6 rounded-xl bg-surface-2 border border-steel-100 p-4">
            <div className="flex items-center gap-2 font-medium text-steel-900 mb-3">
              <Bell className="w-4 h-4 text-rust-600" aria-hidden /> Price alert
            </div>
            <div className="grid sm:grid-cols-[auto_1fr_auto] gap-3 items-end">
              <Field label="Notify me when the price goes">
                {(id) => (
                  <Select id={id} value={direction} onChange={(e) => setDirection(e.target.value)}>
                    <option value="above">above</option>
                    <option value="below">below</option>
                  </Select>
                )}
              </Field>
              <Field label={`Amount (${CURRENCY_SYMBOL} per ${unitLabel(rate.unit)})`}>
                {(id) => <Input id={id} type="number" min="1" required value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={String(rate.maxPrice + 10)} />}
              </Field>
              <Button type="submit" loading={saving} icon={Bell}>
                {user ? 'Create alert' : 'Log in to set'}
              </Button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}

// One lively accent per category section (cycled). Written out in full so
// Tailwind keeps the classes.
const ACCENTS = [
  { grad: 'from-emerald-400 to-teal-600', btn: 'from-emerald-600 to-teal-700', shadow: 'shadow-emerald-600/30', soft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', text: 'text-emerald-600 dark:text-emerald-400', line: 'from-emerald-500', hoverBorder: 'hover:border-emerald-300 dark:hover:border-emerald-700' },
  { grad: 'from-yellow-400 to-orange-500', btn: 'from-orange-600 to-orange-700', shadow: 'shadow-orange-500/30', soft: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', text: 'text-orange-600 dark:text-orange-400', line: 'from-orange-500', hoverBorder: 'hover:border-orange-300 dark:hover:border-orange-700' },
  { grad: 'from-sky-400 to-indigo-600', btn: 'from-sky-700 to-indigo-700', shadow: 'shadow-indigo-500/30', soft: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', text: 'text-indigo-600 dark:text-indigo-400', line: 'from-indigo-500', hoverBorder: 'hover:border-sky-300 dark:hover:border-sky-700' },
  { grad: 'from-pink-400 to-rose-600', btn: 'from-rose-600 to-rose-700', shadow: 'shadow-rose-500/30', soft: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', text: 'text-rose-600 dark:text-rose-400', line: 'from-rose-500', hoverBorder: 'hover:border-rose-300 dark:hover:border-rose-700' },
  { grad: 'from-violet-400 to-purple-600', btn: 'from-violet-600 to-purple-700', shadow: 'shadow-violet-500/30', soft: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', text: 'text-violet-600 dark:text-violet-400', line: 'from-violet-500', hoverBorder: 'hover:border-violet-300 dark:hover:border-violet-700' },
  { grad: 'from-lime-400 to-green-600', btn: 'from-green-600 to-green-700', shadow: 'shadow-green-500/30', soft: 'bg-lime-50 text-green-700 dark:bg-lime-500/15 dark:text-lime-300', text: 'text-green-600 dark:text-green-400', line: 'from-green-500', hoverBorder: 'hover:border-lime-300 dark:hover:border-lime-700' },
];
const accentFor = (i) => ACCENTS[i % ACCENTS.length];

export function RatesTable({ city, category, search, compactView }) {
  const { t, tr } = useI18n();
  const { data, error, loading, reload } = useApi('/scrap/rates', { params: { city } });
  const [trend, setTrend] = useState(null);
  const rates = data?.rates;
  const filtered = useMemo(() => {
    if (!rates) return [];
    const q = search.trim().toLowerCase();
    return rates.filter(
      (r) => (category === 'all' || r.category?.slug === category) && (!q || r.name.toLowerCase().includes(q) || (r.nameNe || '').includes(q))
    );
  }, [rates, category, search]);
  const grouped = useMemo(() => {
    const g = new Map();
    filtered.forEach((r) => {
      const k = r.category?.slug;
      if (!g.has(k)) g.set(k, { category: r.category, items: [] });
      g.get(k).items.push(r);
    });
    return [...g.values()];
  }, [filtered]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !rates) return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>;
  if (!filtered.length) return <EmptyState icon={Search} title={t('rates.none')} />;

  return (
    <div className={cx('space-y-12 transition-opacity', loading && 'opacity-60')}>
      {grouped.map(({ category: cat, items }, gi) => {
        const a = accentFor(gi);
        const top = Math.max(...items.map((r) => r.maxPrice || 0), 1);
        return (
          <section key={cat?.slug}>
            <div className="flex items-center gap-3 mb-5">
              <span className={cx('w-11 h-11 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center shadow-lg -rotate-6', a.grad, a.shadow)}>
                <CategoryIcon icon={cat?.icon} className="w-5 h-5" />
              </span>
              <h2 className="font-head text-2xl font-semibold text-steel-900">{tr(cat)}</h2>
              <span className={cx('text-xs font-bold rounded-full px-2.5 py-1', a.soft)}>{items.length}</span>
              <span className={cx('flex-1 h-px bg-gradient-to-r to-transparent opacity-40', a.line)} aria-hidden />
            </div>
            <div className={cx('grid gap-4', compactView ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
              {items.map((r, i) => (
                <article
                  key={r.itemId}
                  style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  className={cx(
                    'anim-rise group relative overflow-hidden bg-surface border border-steel-200/70 rounded-2xl p-5 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lift',
                    a.hoverBorder
                  )}
                >
                  <span className={cx('absolute -right-8 -top-8 w-20 h-20 rounded-full bg-gradient-to-br opacity-[0.10] group-hover:opacity-20 group-hover:scale-125 transition-all duration-500', a.grad)} aria-hidden />
                  <div className="relative flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-steel-900 leading-snug">{tr(r)}</h3>
                    <span className={cx('shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110', a.soft)}>
                      <CategoryIcon icon={cat?.icon} className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="relative mt-3 flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-head text-2xl font-bold text-steel-900 tabular">{rupees(r.minPrice)}</span>
                    <span className="text-steel-400">–</span>
                    <span className={cx('font-head text-2xl font-bold tabular', a.text)}>{rupees(r.maxPrice)}</span>
                    <span className="text-sm text-steel-500">/ {unitLabel(r.unit)}</span>
                  </div>
                  <div className="relative mt-3 h-1.5 rounded-full bg-steel-100 overflow-hidden" title="Compared with the best rate in this category" aria-hidden>
                    <div className={cx('h-full rounded-full bg-gradient-to-r transition-all duration-700', a.grad)} style={{ width: `${Math.max(8, Math.round((r.maxPrice / top) * 100))}%` }} />
                  </div>
                  <div className="relative mt-4 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-steel-400">{t('rates.updated', { date: fmtDate(r.lastUpdated, { day: 'numeric', month: 'short' }) })}</span>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setTrend(r)} className="inline-flex items-center gap-1 text-xs font-medium text-steel-600 hover:text-steel-900 px-2.5 py-1.5 rounded-full hover:bg-steel-100" aria-label={`${t('rates.trend')}: ${r.name}`}>
                        <LineIcon className="w-3.5 h-3.5" aria-hidden /> {t('rates.trend')}
                      </button>
                      <Link
                        to={`/schedule-pickup?items=${r.itemId}:${r.unit === 'kg' ? 10 : 1}`}
                        className={cx('inline-flex items-center gap-1 text-xs font-bold text-white px-3.5 py-1.5 rounded-full bg-gradient-to-r shadow-md transition-transform hover:scale-105 active:scale-95', a.btn, a.shadow)}
                        aria-label={`Sell ${r.name}`}
                      >
                        <Truck className="w-3.5 h-3.5" aria-hidden /> Sell
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
      <TrendModal rate={trend} city={city} onClose={() => setTrend(null)} />
    </div>
  );
}

export default function Rates() {
  const { t, tr } = useI18n();
  const { city } = useConfig();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 200);
  const category = params.get('category') || 'all';
  const { data: cats } = useApi('/scrap/categories');
  const { data: rateData } = useApi('/scrap/rates', { params: { city } });
  usePageMeta({
    title: `Scrap rates in ${city} today`,
    description: `Today's scrap prices in ${city} for newspaper, metals, e-waste, appliances and vehicles. Free doorstep pickup with digital weighing.`,
  });

  const stats = useMemo(() => {
    const list = rateData?.rates || [];
    if (!list.length) return null;
    const perKg = list.filter((r) => r.unit === 'kg');
    const best = (perKg.length ? perKg : list).reduce((b, r) => (r.maxPrice > b.maxPrice ? r : b));
    const latest = list.reduce((d, r) => (r.lastUpdated && new Date(r.lastUpdated) > d ? new Date(r.lastUpdated) : d), new Date(0));
    return { items: list.length, best, latest: latest.getTime() > 0 ? latest : null };
  }, [rateData]);
  const categories = cats?.categories || [];
  const setCategory = (v) => setParams(v === 'all' ? {} : { category: v }, { replace: true });

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="absolute -top-24 -left-16 w-80 h-80 rounded-full bg-emerald-500/30 blur-3xl anim-blob" aria-hidden />
        <div className="absolute -bottom-32 right-0 w-96 h-96 rounded-full bg-orange-500/20 blur-3xl anim-blob [animation-delay:-5s]" aria-hidden />
        <div className="absolute top-10 right-1/3 w-56 h-56 rounded-full bg-sky-500/20 blur-3xl anim-blob [animation-delay:-9s]" aria-hidden />
        <div className="container-page relative py-12 sm:py-16 grid lg:grid-cols-[1fr_auto] gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-semibold tracking-wide">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-emerald-400 anim-ping" />
                <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
              </span>
              LIVE RATES · {city.toUpperCase()}
            </span>
            <h1 className="font-head text-4xl sm:text-5xl font-bold mt-4 leading-tight">
              {t('rates.title')}
              <span className="block text-gradient-energy">Turn scrap into cash.</span>
            </h1>
            <p className="text-[#C7D2CD] mt-3 max-w-xl">{t('rates.subtitle', { city })}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link to="/schedule-pickup" className="btn bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-6 py-3 shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95">
                <Truck className="w-4 h-4" aria-hidden /> {t('home.ctaBook')}
              </Link>
              <div className="rounded-full bg-surface shadow-lg px-1.5 [&>label]:rounded-full">
                <CitySelect />
              </div>
            </div>
          </div>
          {stats && (
            <div className="grid grid-cols-3 lg:grid-cols-1 gap-3 lg:w-64">
              <HeroStat icon={Sparkles} label="Items priced" value={stats.items} tone="from-emerald-400 to-teal-500" style={{ '--r': '-3deg' }} />
              <HeroStat icon={TrendingUp} label={`Top rate · ${tr(stats.best)}`} value={`${rupees(stats.best.maxPrice)}/${unitLabel(stats.best.unit)}`} tone="from-yellow-400 to-orange-500" style={{ '--r': '2deg', animationDelay: '-1.5s' }} />
              <HeroStat icon={Clock} label="Last updated" value={stats.latest ? fmtDate(stats.latest, { day: 'numeric', month: 'short' }) : '—'} tone="from-sky-400 to-indigo-500" style={{ '--r': '-2deg', animationDelay: '-3s' }} />
            </div>
          )}
        </div>
      </section>

      <div className="container-page py-8">
        {/* Search + category chips */}
        <div className="sticky top-16 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-steel-50/90 backdrop-blur-md border-b border-steel-200/60 mb-8">
          <div className="relative max-w-xl">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-steel-400" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('rates.search')} className="pl-12 py-3 rounded-full shadow-card" aria-label={t('rates.search')} type="search" />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mb-1" role="group" aria-label="Filter by category">
            {[{ slug: 'all', name: t('rates.all'), icon: 'sparkles' }, ...categories].map((c, i) => {
              const active = category === c.slug;
              const a = accentFor(Math.max(0, i - 1));
              return (
                <button
                  key={c.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(c.slug)}
                  className={cx(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold border transition-all duration-200',
                    active
                      ? cx('text-white border-transparent bg-gradient-to-r shadow-md scale-105', c.slug === 'all' ? 'from-steel-800 to-steel-950 dark:from-steel-300 dark:to-steel-200 dark:text-steel-950' : cx(a.btn, a.shadow))
                      : 'bg-surface border-steel-200 text-steel-700 hover:border-steel-400 hover:-translate-y-0.5'
                  )}
                >
                  {c.slug === 'all' ? <Sparkles className="w-4 h-4" aria-hidden /> : <CategoryIcon icon={c.icon} className="w-4 h-4" />}
                  {c.slug === 'all' ? c.name : tr(c)}
                </button>
              );
            })}
          </div>
        </div>

        <RatesTable city={city} category={category} search={q} />

        {/* CTA */}
        <div className="relative overflow-hidden mt-14 rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-700 to-ink text-white p-7 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="absolute -right-10 -bottom-16 w-64 h-64 rounded-full bg-yellow-300/20 blur-2xl anim-blob" aria-hidden />
          <Truck className="absolute right-8 top-6 w-24 h-24 text-white/10 -rotate-12 anim-float hidden sm:block" aria-hidden />
          <div className="relative">
            <h2 className="font-head text-2xl sm:text-3xl font-semibold">Ready to sell?</h2>
            <p className="text-white/80 mt-1">Free pickup in {city}. Weighed in front of you, paid instantly.</p>
          </div>
          <Link to="/schedule-pickup" className="relative btn bg-white text-emerald-800 px-6 py-3 shadow-xl hover:scale-105 active:scale-95">
            {t('home.ctaBook')} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, tone, style }) {
  return (
    <div className="anim-float rounded-2xl bg-white/[0.07] border border-white/15 backdrop-blur p-3 sm:p-4 flex items-center gap-3 shadow-xl" style={style}>
      <span className={cx('hidden sm:flex shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br items-center justify-center text-white shadow-lg', tone)}>
        <Icon className="w-5 h-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="font-head text-base sm:text-lg font-bold tabular truncate">{value}</div>
        <div className="text-[11px] text-white/60 truncate">{label}</div>
      </div>
    </div>
  );
}
