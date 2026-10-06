import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, LineChart as LineIcon, Search, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import useApi, { useDebounce } from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { useConfig } from '../context/ConfigContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { Button, EmptyState, ErrorState, Field, Input, Modal, Segmented, Select, Skeleton, cx } from '../components/ui';
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
  if (loading && !rates) return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!filtered.length) return <EmptyState icon={Search} title={t('rates.none')} />;

  return (
    <div className={cx('space-y-10 transition-opacity', loading && 'opacity-60')}>
      {grouped.map(({ category: cat, items }) => (
        <section key={cat?.slug}>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-9 h-9 rounded-lg bg-rust-50 text-rust-600 flex items-center justify-center">
              <CategoryIcon icon={cat?.icon} className="w-5 h-5" />
            </span>
            <h2 className="font-head text-xl font-semibold text-steel-900">{tr(cat)}</h2>
            <span className="text-sm text-steel-400">{items.length}</span>
          </div>
          <div className={cx('grid gap-3', compactView ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
            {items.map((r) => (
              <article key={r.itemId} className="group bg-surface border border-steel-100 rounded-xl p-4 flex items-center justify-between gap-3 hover:border-steel-300 transition-colors">
                <div className="min-w-0">
                  <h3 className="font-medium text-steel-900 truncate">{tr(r)}</h3>
                  <div className="font-head text-lg font-semibold text-steel-900 tabular mt-0.5">
                    {rupees(r.minPrice)} – {rupees(r.maxPrice)}
                    <span className="text-sm font-normal text-steel-500"> / {unitLabel(r.unit)}</span>
                  </div>
                  <div className="text-[11px] text-steel-400 mt-0.5">{t('rates.updated', { date: fmtDate(r.lastUpdated, { day: 'numeric', month: 'short' }) })}</div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button type="button" onClick={() => setTrend(r)} className="inline-flex items-center gap-1 text-xs font-medium text-steel-600 hover:text-rust-700 px-2 py-1 rounded-md hover:bg-steel-100" aria-label={`${t('rates.trend')}: ${r.name}`}>
                    <LineIcon className="w-3.5 h-3.5" aria-hidden /> {t('rates.trend')}
                  </button>
                  <Link to={`/schedule-pickup?items=${r.itemId}:${r.unit === 'kg' ? 10 : 1}`} className="inline-flex items-center gap-1 text-xs font-medium text-rust-600 hover:text-rust-700 px-2 py-1 rounded-md hover:bg-rust-50">
                    <Truck className="w-3.5 h-3.5" aria-hidden /> Sell
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
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
  usePageMeta({
    title: `Scrap rates in ${city} today`,
    description: `Today's scrap prices in ${city} for newspaper, metals, e-waste, appliances and vehicles. Free doorstep pickup with digital weighing.`,
  });

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-head text-3xl sm:text-4xl font-bold text-steel-900">{t('rates.title')}</h1>
          <p className="text-steel-500 mt-2 max-w-2xl">{t('rates.subtitle', { city })}</p>
        </div>
        <div className="rounded-lg border border-steel-200 bg-surface">
          <CitySelect />
        </div>
      </div>
      <div className="sticky top-16 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-3 bg-steel-50/95 backdrop-blur flex flex-col sm:flex-row gap-3 sm:items-center mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-400" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('rates.search')} className="pl-9" aria-label={t('rates.search')} type="search" />
        </div>
        <div className="overflow-x-auto">
          <Segmented
            size="sm"
            value={category}
            onChange={(v) => setParams(v === 'all' ? {} : { category: v }, { replace: true })}
            options={[{ value: 'all', label: t('rates.all') }, ...(cats?.categories || []).map((c) => ({ value: c.slug, label: tr(c) }))]}
          />
        </div>
      </div>
      <RatesTable city={city} category={category} search={q} />
      <div className="mt-12 rounded-2xl bg-ink text-white p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-head text-xl font-semibold">Ready to sell?</h2>
          <p className="text-[#C7D2CD] text-sm mt-1">Free pickup in {city}. Weighed in front of you, paid instantly.</p>
        </div>
        <Link to="/schedule-pickup" className="btn-primary">
          {t('home.ctaBook')}
        </Link>
      </div>
    </div>
  );
}
