import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Ban, BellRing, Building2, CheckCircle2, Copy, History, Percent, RotateCcw, Save, Search, Tags, TrendingDown, TrendingUp } from 'lucide-react';
import api from '../../services/api';
import useApi, { useDebounce } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { fmtDateTime, rupees, unitLabel } from '../../utils/format';
import { Badge, Button, DataTable, EmptyState, Field, IconButton, Input, PageHeader, Pagination, Select, Tabs, Toggle, cx } from '../../components/ui';
import { Async, Callout, ConfirmModal, NumberInput, Toolbar, isBlank, useAction, Modal } from './_catalog/shared';
import { CitySelect, cityLabel, useAdminCities } from './_geo/shared';

export default function AdminPrices() {
  const { can } = useAuth();
  const citiesRes = useAdminCities();
  const { cities, defaultCity } = citiesRes;
  const [tab, setTab] = useState('list');
  const [city, setCity] = useState('');
  const [historyItem, setHistoryItem] = useState(null);
  const [modal, setModal] = useState(null); // 'bulk' | 'copy'
  const [listKey, setListKey] = useState(0);
  const categories = useApi('/admin/categories');
  const canEdit = can('prices');
  useEffect(() => {
    if (defaultCity && !cities.some((c) => c.name === city)) setCity(defaultCity);
  }, [cities, defaultCity, city]);
  const noCities = citiesRes.data && !cities.length;

  return (
    <div>
      <PageHeader
        title="Prices"
        subtitle="Buy prices customers see, per city. Recycler prices stay internal and drive your margin."
        actions={
          canEdit && (
            <>
              <Button variant="outline" icon={Percent} onClick={() => setModal('bulk')} disabled={!city}>
                Bulk % change
              </Button>
              <Button variant="outline" icon={Copy} onClick={() => setModal('copy')} disabled={cities.length < 2}>
                Copy prices
              </Button>
            </>
          )
        }
      />
      <Callout icon={BellRing} tone="rust" className="mb-6">
        Customers with a price alert on an item in that city are notified automatically when you change its min or max price. Every change is recorded in
        the History tab.
      </Callout>
      {citiesRes.error && !citiesRes.data ? (
        <Async {...citiesRes} onRetry={citiesRes.reload}>
          {() => null}
        </Async>
      ) : noCities ? (
        <EmptyState
          icon={Building2}
          title="No cities yet"
          description="Prices are set per city. Add your first city under Cities & service areas, then come back to price its items."
          action={<Button to="/admin/service-areas">Go to service areas</Button>}
        />
      ) : (
        <>
          <Tabs
            className="mb-5"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'list', label: 'City price list' },
              { value: 'history', label: 'History' },
            ]}
          />
          {tab === 'list' ? (
            <>
              <Toolbar>
                <CitySelect cities={cities} value={city} onChange={setCity} className="w-full sm:w-56" />
                <p className="text-xs text-steel-500 pb-2.5">
                  Need another city?{' '}
                  <Link to="/admin/service-areas" className="text-rust-700 font-medium hover:underline">
                    Add it in Cities & areas
                  </Link>
                </p>
              </Toolbar>
              {city ? (
                <PriceGrid
                  key={`${city}-${listKey}`}
                  city={city}
                  categories={categories.data?.categories || []}
                  canEdit={canEdit}
                  onChanged={citiesRes.reload}
                  onHistory={(item) => {
                    setHistoryItem(item);
                    setTab('history');
                  }}
                />
              ) : (
                <Async {...citiesRes} rows={6}>
                  {() => <EmptyState title="Choose a city" description="Pick a city to see and edit its price list." />}
                </Async>
              )}
            </>
          ) : (
            <PriceHistory cities={cities} defaultCity={city} item={historyItem} onClearItem={() => setHistoryItem(null)} />
          )}
        </>
      )}
      {modal === 'bulk' && (
        <BulkModal
          city={city}
          categories={categories.data?.categories || []}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            setListKey((k) => k + 1);
          }}
        />
      )}
      {modal === 'copy' && (
        <CopyModal
          cities={cities}
          toDefault={city}
          onClose={() => setModal(null)}
          onDone={(toCity) => {
            setModal(null);
            if (toCity) setCity(toCity);
            setListKey((k) => k + 1);
            citiesRes.reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------- City price grid ----------------
const fmt = (v) => (v === null || v === undefined ? '' : v);

function rowError(d) {
  if (!d) return null;
  if (isBlank(d.minPrice) || isBlank(d.maxPrice)) return 'Enter both min and max';
  if (d.minPrice < 0 || d.maxPrice < 0 || (!isBlank(d.recyclerPrice) && d.recyclerPrice < 0)) return 'Prices cannot be negative';
  if (d.minPrice > d.maxPrice) return 'Min is more than max';
  return null;
}

function PriceGrid({ city, categories, canEdit, onHistory, onChanged }) {
  const res = useApi('/admin/prices', { params: { city } });
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [stopping, setStopping] = useState(null);
  const q = useDebounce(search.trim().toLowerCase(), 200);
  const [drafts, setDrafts] = useState({}); // itemId -> { minPrice, maxPrice, recyclerPrice }
  const { busy, run } = useAction();

  const items = res.data?.items;
  const dirtyIds = Object.keys(drafts);
  const errorsById = Object.fromEntries(dirtyIds.map((id) => [id, rowError(drafts[id])]));
  const invalidCount = Object.values(errorsById).filter(Boolean).length;

  // Filter on the client (the grid is every active item, one city).
  const groups = useMemo(() => {
    const rows = (items || []).filter(
      (i) =>
        (!category || String(i.category?._id) === category) &&
        (!unpricedOnly || !i.price) &&
        (!q || i.name.toLowerCase().includes(q) || (i.nameNe || '').includes(q))
    );
    const map = new Map();
    for (const r of rows) {
      const k = String(r.category?._id);
      if (!map.has(k)) map.set(k, { category: r.category, rows: [] });
      map.get(k).rows.push(r);
    }
    return [...map.values()];
  }, [items, category, unpricedOnly, q]);

  function edit(item, key, value) {
    const id = String(item.itemId);
    setDrafts((ds) => {
      const base = ds[id] || { minPrice: fmt(item.price?.minPrice), maxPrice: fmt(item.price?.maxPrice), recyclerPrice: fmt(item.price?.recyclerPrice) };
      const next = { ...base, [key]: value };
      const orig = item.price;
      const same =
        String(next.minPrice) === String(fmt(orig?.minPrice)) &&
        String(next.maxPrice) === String(fmt(orig?.maxPrice)) &&
        String(next.recyclerPrice) === String(fmt(orig?.recyclerPrice));
      const copy = { ...ds };
      if (same) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }
  const undo = (id) =>
    setDrafts((ds) => {
      const c = { ...ds };
      delete c[id];
      return c;
    });

  async function save() {
    if (invalidCount) return;
    const updates = dirtyIds.map((itemId) => {
      const d = drafts[itemId];
      return { itemId, minPrice: Number(d.minPrice), maxPrice: Number(d.maxPrice), recyclerPrice: isBlank(d.recyclerPrice) ? null : Number(d.recyclerPrice) };
    });
    const r = await run('save', () => api.post('/admin/prices/bulk', { city, updates }), {
      success: (out) => `Saved ${out.data.data.updated} price${out.data.data.updated === 1 ? '' : 's'} for ${city}`,
    });
    if (r.ok) {
      setDrafts({});
      res.reload();
      onChanged?.();
    }
  }

  async function stopBuying() {
    const it = stopping;
    const r = await run('stop', () => api.delete(`/admin/prices/${it.itemId}`, { params: { city } }), { success: `${it.name} is no longer bought in ${city}` });
    setStopping(null);
    if (r.ok) {
      undo(String(it.itemId));
      res.reload();
      onChanged?.();
    }
  }

  const val = (item, k) => {
    const d = drafts[String(item.itemId)];
    return d ? d[k] : fmt(item.price?.[k]);
  };

  const columns = [
    {
      key: 'name',
      header: 'Item',
      render: (i) => (
        <div className="min-w-[150px]">
          <div className="font-medium text-steel-900">{i.name}</div>
          <div className="text-xs text-steel-500">
            per {unitLabel(i.unit)}
            {i.price?.updatedAt && ` · updated ${fmtDateTime(i.price.updatedAt)}${i.price.updatedBy ? ` by ${i.price.updatedBy}` : ''}`}
          </div>
          {!i.price && (
            <Badge tone="amber" className="mt-1">
              Not bought in {city}
            </Badge>
          )}
        </div>
      ),
    },
    ...['minPrice', 'maxPrice', 'recyclerPrice'].map((k) => ({
      key: k,
      header: { minPrice: 'Min (Rs.)', maxPrice: 'Max (Rs.)', recyclerPrice: 'Recycler (Rs.)' }[k],
      render: (i) => {
        const err = errorsById[String(i.itemId)];
        const invalid = !!err && (k !== 'recyclerPrice' || (!isBlank(val(i, k)) && val(i, k) < 0));
        return canEdit ? (
          <NumberInput
            aria-label={`${{ minPrice: 'Minimum', maxPrice: 'Maximum', recyclerPrice: 'Recycler' }[k]} price for ${i.name}`}
            className="!w-24 !py-1.5 tabular"
            min={0}
            step="0.5"
            value={val(i, k)}
            onChange={(v) => edit(i, k, v)}
            invalid={invalid}
            placeholder={k === 'recyclerPrice' ? 'Optional' : i.price ? '' : 'Add'}
          />
        ) : (
          <span className="tabular">{isBlank(val(i, k)) ? '—' : rupees(val(i, k), { decimals: 2 })}</span>
        );
      },
    })),
    {
      key: 'margin',
      header: 'Margin',
      render: (i) => {
        const rp = val(i, 'recyclerPrice');
        const mx = val(i, 'maxPrice');
        const err = errorsById[String(i.itemId)];
        if (err) return <span className="text-xs text-danger-600 whitespace-nowrap" role="alert">{err}</span>;
        if (isBlank(rp) || isBlank(mx)) return <span className="text-steel-400">—</span>;
        const m = Number(rp) - Number(mx);
        const pct = Number(rp) > 0 ? Math.round((m / Number(rp)) * 100) : 0;
        return (
          <span className={cx('tabular whitespace-nowrap font-medium', m >= 0 ? 'text-patina-700' : 'text-danger-600')}>
            {m >= 0 ? '+' : ''}
            {rupees(m, { decimals: 2 })} <span className="text-xs font-normal text-steel-500">({pct}%)</span>
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (i) => (
        <div className="flex justify-end gap-1">
          {drafts[String(i.itemId)] && <IconButton label={`Undo changes to ${i.name}`} icon={RotateCcw} onClick={() => undo(String(i.itemId))} />}
          <IconButton label={`Price history for ${i.name}`} icon={History} onClick={() => onHistory({ _id: i.itemId, name: i.name })} />
          {canEdit && i.price && (
            <IconButton label={`Stop buying ${i.name} in ${city}`} icon={Ban} onClick={() => setStopping(i)} className="hover:!text-danger-600" />
          )}
        </div>
      ),
    },
  ];

  if (res.error && !res.data)
    return (
      <Async {...res} onRetry={res.reload}>
        {() => null}
      </Async>
    );

  const d = res.data;
  return (
    <>
      {d && (
        <p className="text-sm text-steel-700 mb-3">
          <strong className="tabular">{d.priced}</strong> of <strong className="tabular">{d.total}</strong> items priced in {d.city}
          {d.total > d.priced && <span className="text-steel-500"> · {d.total - d.priced} not bought here yet</span>}
        </p>
      )}
      <Toolbar>
        <Field label="Search items" className="flex-1 min-w-[180px]">
          {(id) => (
            <div className="relative">
              <Search className="w-4 h-4 text-steel-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
              <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item name" className="pl-9" />
            </div>
          )}
        </Field>
        <Field label="Category" className="w-full sm:w-48">
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="pb-2">
          <Toggle checked={unpricedOnly} onChange={setUnpricedOnly} label="Not priced only" />
        </div>
      </Toolbar>

      {canEdit && dirtyIds.length > 0 && (
        <div className="sticky top-2 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rust-200 bg-rust-50 px-4 py-3 shadow-card">
          <p className="text-sm text-steel-900">
            <strong>{dirtyIds.length}</strong> unsaved change{dirtyIds.length === 1 ? '' : 's'} in {city}
            {invalidCount > 0 && <span className="text-danger-600"> · fix {invalidCount} row{invalidCount === 1 ? '' : 's'} first</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrafts({})} disabled={busy === 'save'}>
              Discard
            </Button>
            <Button size="sm" icon={Save} onClick={save} loading={busy === 'save'} disabled={invalidCount > 0}>
              Save changes
            </Button>
          </div>
        </div>
      )}

      {!d ? (
        <Async {...res} rows={8}>
          {() => null}
        </Async>
      ) : !d.items.length ? (
        <EmptyState icon={Tags} title="No items in the catalog" description="Add items on the Catalog page first, then price them here." action={<Button to="/admin/catalog" variant="outline">Open catalog</Button>} />
      ) : !groups.length ? (
        <EmptyState
          title={unpricedOnly && !q && !category ? `Every item is priced in ${city}` : 'No items match these filters'}
          description={unpricedOnly && !q && !category ? 'Nothing left to fill in.' : 'Try a different search or category.'}
        />
      ) : (
        <div className={cx('space-y-6 transition-opacity', res.loading && 'opacity-60')}>
          {groups.map((g) => (
            <section key={String(g.category?._id)} aria-label={g.category?.name}>
              <h3 className="text-sm font-semibold text-steel-900 mb-2">
                {g.category?.name || 'Uncategorised'}{' '}
                <span className="font-normal text-steel-500">
                  · {g.rows.filter((r) => r.price).length}/{g.rows.length} priced
                </span>
              </h3>
              <DataTable dense rowKey="itemId" columns={columns} rows={g.rows} />
            </section>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!stopping}
        onClose={() => setStopping(null)}
        title={`Stop buying ${stopping?.name || 'this item'}?`}
        confirmLabel="Stop buying"
        variant="danger"
        busy={busy === 'stop'}
        onConfirm={stopBuying}
      >
        <p>
          Customers in <strong className="text-steel-900">{city}</strong> will no longer see <strong className="text-steel-900">{stopping?.name}</strong> on
          the price list or booking form. Price history is kept, and you can add a price again at any time.
        </p>
      </ConfirmModal>
    </>
  );
}

// ---------------- Bulk % ----------------
function BulkModal({ city, categories, onClose, onDone }) {
  const [percent, setPercent] = useState(5);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');
  const { busy, run } = useAction();
  const catName = categories.find((c) => c._id === categoryId)?.name;

  async function apply() {
    if (isBlank(percent) || percent === 0) return setError('Enter a non-zero percentage');
    if (percent < -90 || percent > 500) return setError('Between -90% and +500%');
    setError('');
    const body = { city, percentChange: Number(percent), updates: [] };
    if (categoryId) body.categoryId = categoryId;
    const r = await run('bulk', () => api.post('/admin/prices/bulk', body), {
      success: (out) => `Updated ${out.data.data.updated} prices in ${city}`,
    });
    if (r.ok) onDone();
  }

  const up = Number(percent) >= 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Bulk change · ${city}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} loading={busy === 'bulk'}>
            Apply change
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Change (%)" error={error} hint="Use a minus sign to lower prices">
            {(id) => <NumberInput id={id} value={percent} onChange={setPercent} step={0.5} min={-90} max={500} invalid={!!error} />}
          </Field>
          <Field label="Apply to">
            {(id) => (
              <Select id={id} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {!isBlank(percent) && percent !== 0 && (
          <Callout icon={up ? TrendingUp : TrendingDown} tone={up ? 'patina' : 'amber'}>
            {up ? 'Raise' : 'Lower'} min, max and recycler prices of {catName ? <strong>{catName}</strong> : 'every priced item'} in <strong>{city}</strong> by{' '}
            <strong>{Math.abs(percent)}%</strong>. {rupees(100)} becomes {rupees(100 * (1 + percent / 100), { decimals: 2 })}.
          </Callout>
        )}
        <p className="text-xs text-steel-500">Only items that already have a price in this city change. Customers with price alerts are notified.</p>
      </div>
    </Modal>
  );
}

// ---------------- Copy prices between cities ----------------
function CopyModal({ cities, toDefault, onClose, onDone }) {
  const [fromCity, setFrom] = useState(() => cities.find((c) => c.name !== toDefault && c.pricedItems > 0)?.name || '');
  const [toCity, setTo] = useState(toDefault || '');
  const [percent, setPercent] = useState(0);
  const [overwrite, setOverwrite] = useState(false);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const { busy, run } = useAction();
  const from = cities.find((c) => c.name === fromCity);

  async function apply() {
    const er = {};
    if (!fromCity) er.fromCity = 'Choose a source city';
    if (!toCity) er.toCity = 'Choose the city to copy into';
    else if (toCity === fromCity) er.toCity = 'Pick a different city';
    if (isBlank(percent) || percent < -90 || percent > 200) er.percent = 'Between -90% and +200%';
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = await run('copy', () => api.post('/admin/prices/copy-city', { fromCity, toCity, percentChange: Number(percent), overwrite }));
    if (r.ok) setResult(r.out.data.data);
  }

  if (result)
    return (
      <Modal
        open
        onClose={() => onDone(toCity)}
        title="Prices copied"
        footer={
          <Button onClick={() => onDone(toCity)} icon={ArrowRight}>
            View {toCity} prices
          </Button>
        }
      >
        <Callout icon={CheckCircle2} tone="patina">
          From <strong>{fromCity}</strong> to <strong>{toCity}</strong>: <strong className="tabular">{result.created}</strong> new price
          {result.created === 1 ? '' : 's'} added, <strong className="tabular">{result.updated}</strong> existing price{result.updated === 1 ? '' : 's'} updated.
        </Callout>
        {result.created + result.updated === 0 && (
          <p className="text-sm text-steel-600 mt-3">Nothing changed: every item was already priced in {toCity}. Tick “Overwrite existing prices” to replace them.</p>
        )}
      </Modal>
    );

  return (
    <Modal
      open
      onClose={onClose}
      title="Copy prices between cities"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Copy} onClick={apply} loading={busy === 'copy'}>
            Copy prices
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-steel-600">Start a city's price list from another city's, then adjust for local rates.</p>
        <div className="grid sm:grid-cols-[1fr_auto_1fr] items-start gap-3">
          <CitySelect label="From" cities={cities} value={fromCity} onChange={setFrom} error={errors.fromCity} />
          <ArrowRight className="hidden sm:block w-4 h-4 text-steel-400 mt-10" aria-hidden />
          <CitySelect label="To" cities={cities} value={toCity} onChange={setTo} error={errors.toCity} />
        </div>
        {from && <p className="text-xs text-steel-500">{from.name} has {from.pricedItems} priced item{from.pricedItems === 1 ? '' : 's'}.</p>}
        <Field label="Adjust by (%)" error={errors.percent} hint="0 copies prices as they are" className="max-w-[180px]">
          {(id) => <NumberInput id={id} value={percent} onChange={setPercent} min={-90} max={200} step={0.5} invalid={!!errors.percent} />}
        </Field>
        <label className="flex items-start gap-2.5 text-sm text-steel-800 cursor-pointer">
          <input type="checkbox" className="accent-rust-600 mt-0.5" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          <span>
            Overwrite existing prices
            <span className="block text-xs text-steel-500">
              {overwrite ? `Items already priced in ${toCity || 'the target city'} get the copied price.` : 'Items already priced in the target city are skipped.'}
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

// ---------------- History ----------------
function Range({ min, max }) {
  if (min == null && max == null) return <span className="text-steel-400">New</span>;
  return (
    <span className="tabular">
      {rupees(min, { decimals: 2 })}–{rupees(max, { decimals: 2 })}
    </span>
  );
}

function PriceHistory({ cities, defaultCity, item, onClearItem }) {
  const [city, setCity] = useState(defaultCity && cities.some((c) => c.name === defaultCity) ? defaultCity : '');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [city, item?._id]);
  const params = useMemo(() => {
    const p = { page, limit: 25 };
    if (city) p.city = city;
    if (item) p.item = item._id;
    return p;
  }, [page, city, item]);
  const res = useApi('/admin/prices/history', { params });

  const columns = [
    { key: 'createdAt', header: 'When', render: (h) => <span className="whitespace-nowrap text-steel-700">{fmtDateTime(h.createdAt)}</span> },
    {
      key: 'item',
      header: 'Item',
      render: (h) => (
        <div>
          <div className="font-medium text-steel-900">{h.item?.name || 'Deleted item'}</div>
          <div className="text-xs text-steel-500">
            {h.city}
            {h.item?.unit && ` · per ${unitLabel(h.item.unit)}`}
          </div>
        </div>
      ),
    },
    {
      key: 'change',
      header: 'Change',
      render: (h) => {
        const pct = h.oldMaxPrice ? Math.round(((h.newMaxPrice - h.oldMaxPrice) / h.oldMaxPrice) * 1000) / 10 : null;
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-steel-500">
              <Range min={h.oldMinPrice} max={h.oldMaxPrice} />
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-steel-400" aria-label="to" />
            <span className="text-steel-900 font-medium">
              <Range min={h.newMinPrice} max={h.newMaxPrice} />
            </span>
            {pct != null && pct !== 0 && (
              <Badge tone={pct > 0 ? 'patina' : 'danger'}>
                {pct > 0 ? '+' : ''}
                {pct}%
              </Badge>
            )}
          </div>
        );
      },
    },
    { key: 'changedBy', header: 'By', render: (h) => <span className="text-steel-700">{h.changedBy?.name || 'System'}</span> },
  ];

  return (
    <>
      <Toolbar>
        <Field label="City" className="w-full sm:w-48">
          {(id) => (
            <Select id={id} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c._id} value={c.name}>
                  {cityLabel(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {item && (
          <div className="flex items-center gap-2 pb-2">
            <Badge tone="rust">Item: {item.name}</Badge>
            <Button variant="ghost" size="sm" onClick={onClearItem}>
              Show all items
            </Button>
          </div>
        )}
      </Toolbar>
      {res.error && !res.data ? (
        <Async {...res} onRetry={res.reload}>
          {() => null}
        </Async>
      ) : (
        <DataTable
          columns={columns}
          rows={res.data?.history}
          loading={res.loading}
          empty={<EmptyState icon={History} title="No price changes yet" description="Changes to min/max prices show up here." />}
        />
      )}
      <Pagination pagination={res.data?.pagination} onPage={setPage} />
    </>
  );
}
