import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';
import { useConfig } from '../context/ConfigContext';
import { useI18n } from '../i18n/I18nContext';
import { useDebounce } from '../hooks/useApi';
import { Button, Select, Input, Skeleton, cx } from './ui';
import { rupees, unitLabel } from '../utils/format';

const sid = () => Math.random().toString(36).slice(2, 9);

// Instant price estimator (no login). Prices are always computed by the API.
export default function Estimator({ compact = false, className }) {
  const { city } = useConfig();
  const { t, tr } = useI18n();
  const navigate = useNavigate();
  const [rates, setRates] = useState(null);
  const [rows, setRows] = useState([{ id: sid(), itemId: '', qty: '', condition: 'working' }]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRates(null);
    api
      .get('/scrap/rates', { params: { city } })
      .then((res) => {
        const list = res.data.data.rates;
        setRates(list);
        setRows((prev) => {
          if (prev.some((r) => r.itemId)) return prev.filter((r) => !r.itemId || list.some((x) => x.itemId === r.itemId));
          const first = list.find((r) => r.name === 'Newspaper') || list[0];
          return first ? [{ id: sid(), itemId: first.itemId, qty: first.unit === 'kg' ? '10' : '1', condition: 'working' }] : prev;
        });
      })
      .catch(() => setRates([]));
  }, [city]);

  const byId = useMemo(() => Object.fromEntries((rates || []).map((r) => [r.itemId, r])), [rates]);
  const groups = useMemo(() => {
    const g = {};
    (rates || []).forEach((r) => {
      const name = tr(r.category) || 'Other';
      (g[name] ||= []).push(r);
    });
    return g;
  }, [rates, tr]);

  const valid = rows.filter((r) => r.itemId && Number(r.qty) > 0);
  const key = useDebounce(JSON.stringify([city, valid.map((r) => [r.itemId, r.qty, r.condition])]), 350);

  useEffect(() => {
    if (!valid.length) {
      setResult(null);
      return;
    }
    setBusy(true);
    api
      .post('/scrap/estimate', {
        city,
        items: valid.map((r) => ({
          itemId: r.itemId,
          estimatedQuantity: Number(r.qty),
          ...(byId[r.itemId]?.category?.conditionGrading ? { condition: r.condition } : {}),
        })),
      })
      .then((res) => setResult(res.data.data))
      .catch(() => setResult(null))
      .finally(() => setBusy(false));
  }, [key]);

  const update = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function book() {
    const param = valid.map((r) => [r.itemId, r.qty, byId[r.itemId]?.category?.conditionGrading ? r.condition : ''].filter(Boolean).join(':')).join(',');
    navigate(`/schedule-pickup?items=${encodeURIComponent(param)}`);
  }

  if (!rates) return <Skeleton className={cx('h-72', className)} />;

  return (
    <div className={cx('bg-surface rounded-2xl border border-steel-100 shadow-lift p-5 sm:p-6', className)}>
      {!compact && (
        <div className="mb-4">
          <h2 className="font-head text-lg font-semibold text-steel-900">{t('home.estimatorTitle')}</h2>
          <p className="text-sm text-steel-500">{t('home.estimatorSub')}</p>
        </div>
      )}
      <div className="space-y-3">
        {rows.map((row, i) => {
          const rate = byId[row.itemId];
          const graded = rate?.category?.conditionGrading;
          return (
            <div key={row.id} className="grid grid-cols-[1fr_5.5rem_auto] gap-2 items-end">
              <div>
                {i === 0 && <label className="label text-xs" htmlFor={`est-item-${row.id}`}>{t('est.item')}</label>}
                <Select id={`est-item-${row.id}`} value={row.itemId} onChange={(e) => update(row.id, { itemId: e.target.value, qty: byId[e.target.value]?.unit === 'kg' ? '10' : '1' })} aria-label={t('est.item')}>
                  <option value="">Select item</option>
                  {Object.entries(groups).map(([g, items]) => (
                    <optgroup key={g} label={g}>
                      {items.map((it) => (
                        <option key={it.itemId} value={it.itemId}>
                          {tr(it)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>
              <div>
                {i === 0 && <label className="label text-xs" htmlFor={`est-qty-${row.id}`}>{t('est.qty')}</label>}
                <div className="relative">
                  <Input
                    id={`est-qty-${row.id}`}
                    type="number"
                    min="0"
                    step={rate?.unit === 'kg' ? '0.5' : '1'}
                    inputMode="decimal"
                    value={row.qty}
                    onChange={(e) => update(row.id, { qty: e.target.value })}
                    className="pr-9"
                    aria-label={t('est.qty')}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-steel-500">{unitLabel(rate?.unit || 'kg')}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== row.id) : rs))}
                disabled={rows.length === 1}
                className="h-[42px] w-10 inline-flex items-center justify-center rounded-lg text-steel-500 hover:bg-steel-100 disabled:opacity-30"
                aria-label="Remove item"
              >
                <Trash2 className="w-4 h-4" aria-hidden />
              </button>
              {rate && (
                <p className="col-span-3 -mt-1 text-xs text-steel-500 tabular">
                  Today: <span className="font-semibold text-rust-700">{rupees(rate.minPrice)} – {rupees(rate.maxPrice)}</span> / {unitLabel(rate.unit)}
                </p>
              )}
              {graded && (
                <div className="col-span-3 -mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('est.condition')}>
                  {['working', 'not_working', 'damaged'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={row.condition === c}
                      onClick={() => update(row.id, { condition: c })}
                      className={cx('text-xs px-2.5 py-1 rounded-full border', row.condition === c ? 'border-rust-600 bg-rust-50 text-rust-700' : 'border-steel-200 text-steel-600 hover:border-steel-400')}
                    >
                      {t(`cond.${c}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {rows.length < 8 && (
          <button type="button" onClick={() => setRows((rs) => [...rs, { id: sid(), itemId: '', qty: '', condition: 'working' }])} className="inline-flex items-center gap-1.5 text-sm font-medium text-rust-600 hover:text-rust-700">
            <Plus className="w-4 h-4" aria-hidden /> {t('est.addItem')}
          </button>
        )}
      </div>

      <div className={cx('mt-5 rounded-xl bg-patina-50 border border-patina-100 p-4 transition-opacity', busy && 'opacity-60')} aria-live="polite">
        {result ? (
          <>
            <div className="text-xs font-medium uppercase tracking-wide text-patina-700">{t('est.youGet')}</div>
            <div className="font-head text-3xl font-bold text-steel-900 tabular mt-0.5">
              {rupees(result.min)} – {rupees(result.max)}
            </div>
            <p className="text-xs text-steel-500 mt-1">{t('est.disclaimer')}</p>
          </>
        ) : (
          <p className="text-sm text-steel-500">{t('est.empty')}</p>
        )}
      </div>
      <Button size="lg" className="w-full mt-4" onClick={book} disabled={!valid.length}>
        {t('est.book')} <ArrowRight className="w-4 h-4" aria-hidden />
      </Button>
    </div>
  );
}
