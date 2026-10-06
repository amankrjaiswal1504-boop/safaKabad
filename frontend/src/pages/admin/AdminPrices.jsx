import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BellRing, Copy, History, Percent, RotateCcw, Save, Search, TrendingDown, TrendingUp } from 'lucide-react';
import api from '../../services/api';
import useApi, { useDebounce } from '../../hooks/useApi';
import { useConfig } from '../../context/ConfigContext';
import { useAuth } from '../../context/AuthContext';
import { fmtDateTime, rupees, unitLabel } from '../../utils/format';
import { Badge, Button, DataTable, EmptyState, Field, IconButton, Input, PageHeader, Pagination, Select, Tabs, cx } from '../../components/ui';
import { Async, Callout, NumberInput, Toolbar, isBlank, useAction, Modal } from './_catalog/shared';

export default function AdminPrices() {
  const { cities } = useConfig();
  const { can } = useAuth();
  const [tab, setTab] = useState('list');
  const [cityText, setCityText] = useState('');
  const [historyItem, setHistoryItem] = useState(null);
  const [modal, setModal] = useState(null); // 'bulk' | 'copy'
  useEffect(() => {
    if (!cityText && cities.length) setCityText(cities[0]);
  }, [cities, cityText]);
  const debounced = useDebounce(cityText.trim(), 400);
  const city = debounced.length >= 2 ? debounced : '';
  const isNewCity = city && cities.length > 0 && !cities.some((c) => c.toLowerCase() === city.toLowerCase());
  const [listKey, setListKey] = useState(0);
  const categories = useApi('/admin/categories');
  const canEdit = can('prices');

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
              <Button variant="outline" icon={Copy} onClick={() => setModal('copy')}>
                Copy city
              </Button>
            </>
          )
        }
      />
      <Callout icon={BellRing} tone="rust" className="mb-6">
        Customers with a price alert on an item in that city are notified automatically when you change its min or max price. Every change is recorded in
        the History tab.
      </Callout>
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
            <Field label="City" hint={isNewCity ? 'New city: saving a price launches it on the price list.' : undefined} className="w-full sm:w-56">
              {(id) => (
                <>
                  <Input id={id} list="price-cities" value={cityText} onChange={(e) => setCityText(e.target.value)} placeholder="Type or pick a city" autoComplete="off" />
                  <datalist id="price-cities">
                    {cities.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </Toolbar>
          {city ? (
            <PriceList
              key={`${city}-${listKey}`}
              city={city}
              categories={categories.data?.categories || []}
              canEdit={canEdit}
              onHistory={(item) => {
                setHistoryItem(item);
                setTab('history');
              }}
            />
          ) : (
            <EmptyState title="Choose a city" description="Pick a city to see and edit its price list." />
          )}
        </>
      ) : (
        <PriceHistory cities={cities} defaultCity={city} item={historyItem} onClearItem={() => setHistoryItem(null)} />
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
          toDefault={isNewCity ? city : ''}
          onClose={() => setModal(null)}
          onDone={(toCity) => {
            setModal(null);
            setCityText(toCity);
            setListKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// ---------------- Inline editor ----------------
const fmt = (v) => (v === null || v === undefined ? '' : v);

function rowError(d) {
  if (!d) return null;
  if (isBlank(d.minPrice) || isBlank(d.maxPrice)) return 'Enter both min and max';
  if (d.minPrice < 0 || d.maxPrice < 0 || (!isBlank(d.recyclerPrice) && d.recyclerPrice < 0)) return 'Prices cannot be negative';
  if (d.minPrice > d.maxPrice) return 'Min is more than max';
  return null;
}

function PriceList({ city, categories, canEdit, onHistory }) {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  useEffect(() => setPage(1), [q, category]);
  const params = useMemo(() => {
    const p = { city, limit: 100, page, status: 'active' };
    if (category) p.category = category;
    if (q) p.search = q;
    return p;
  }, [city, page, category, q]);
  const res = useApi('/admin/scrap-items', { params });
  const [drafts, setDrafts] = useState({}); // itemId -> { minPrice, maxPrice, recyclerPrice, name }
  const { busy, run } = useAction();

  const dirtyIds = Object.keys(drafts);
  const errorsById = Object.fromEntries(dirtyIds.map((id) => [id, rowError(drafts[id])]));
  const invalidCount = Object.values(errorsById).filter(Boolean).length;

  function edit(item, key, value) {
    setDrafts((ds) => {
      const base = ds[item._id] || {
        name: item.name,
        minPrice: fmt(item.price?.minPrice),
        maxPrice: fmt(item.price?.maxPrice),
        recyclerPrice: fmt(item.price?.recyclerPrice),
      };
      const next = { ...base, [key]: value };
      const orig = item.price;
      const same =
        String(next.minPrice) === String(fmt(orig?.minPrice)) &&
        String(next.maxPrice) === String(fmt(orig?.maxPrice)) &&
        String(next.recyclerPrice) === String(fmt(orig?.recyclerPrice));
      const copy = { ...ds };
      if (same) delete copy[item._id];
      else copy[item._id] = next;
      return copy;
    });
  }

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
    }
  }

  const val = (item, k) => (drafts[item._id] ? drafts[item._id][k] : fmt(item.price?.[k]));

  const columns = [
    {
      key: 'name',
      header: 'Item',
      render: (i) => (
        <div className="min-w-[150px]">
          <div className="font-medium text-steel-900 flex items-center gap-2">
            {i.name}
            {!i.price && <Badge tone="amber">Not priced</Badge>}
          </div>
          <div className="text-xs text-steel-500">
            {i.category?.name} · per {unitLabel(i.unit)}
          </div>
        </div>
      ),
    },
    ...['minPrice', 'maxPrice', 'recyclerPrice'].map((k) => ({
      key: k,
      header: { minPrice: 'Min (Rs.)', maxPrice: 'Max (Rs.)', recyclerPrice: 'Recycler (Rs.)' }[k],
      render: (i) => {
        const err = errorsById[i._id];
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
            placeholder={k === 'recyclerPrice' ? 'Optional' : ''}
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
        const err = errorsById[i._id];
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
          {drafts[i._id] && (
            <IconButton
              label={`Undo changes to ${i.name}`}
              icon={RotateCcw}
              onClick={() =>
                setDrafts((ds) => {
                  const c = { ...ds };
                  delete c[i._id];
                  return c;
                })
              }
            />
          )}
          <IconButton label={`Price history for ${i.name}`} icon={History} onClick={() => onHistory({ _id: i._id, name: i.name })} />
        </div>
      ),
    },
  ];

  return (
    <>
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

      {res.error && !res.data ? (
        <Async {...res} onRetry={res.reload}>
          {() => null}
        </Async>
      ) : (
        <DataTable
          dense
          columns={columns}
          rows={res.data?.items}
          loading={res.loading}
          empty={<EmptyState title="No items found" description={q || category ? 'Try a different search or category.' : 'Add items on the Catalog page first.'} />}
        />
      )}
      <Pagination pagination={res.data?.pagination} onPage={setPage} />
      {dirtyIds.length > 0 && res.data?.pagination?.pages > 1 && (
        <p className="text-xs text-steel-500 mt-2">Unsaved edits are kept when you change page and saved together.</p>
      )}
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
            {up ? 'Raise' : 'Lower'} min and max prices of {catName ? <strong>{catName}</strong> : 'every priced item'} in <strong>{city}</strong> by{' '}
            <strong>{Math.abs(percent)}%</strong>. {rupees(100)} becomes {rupees(100 * (1 + percent / 100), { decimals: 2 })}.
          </Callout>
        )}
        <p className="text-xs text-steel-500">
          Only items that already have a price in this city change. Recycler prices are not touched. Customers with price alerts are notified.
        </p>
      </div>
    </Modal>
  );
}

// ---------------- Copy city ----------------
function CopyModal({ cities, toDefault, onClose, onDone }) {
  const [fromCity, setFrom] = useState(cities[0] || '');
  const [toCity, setTo] = useState(toDefault || '');
  const [percent, setPercent] = useState(0);
  const [errors, setErrors] = useState({});
  const { busy, run } = useAction();

  async function apply() {
    const er = {};
    if (!fromCity) er.fromCity = 'Choose a source city';
    if (toCity.trim().length < 2) er.toCity = 'Enter the city to copy into';
    else if (toCity.trim().toLowerCase() === fromCity.toLowerCase()) er.toCity = 'Pick a different city';
    if (isBlank(percent) || percent < -90 || percent > 200) er.percent = 'Between -90% and +200%';
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = await run('copy', () => api.post('/admin/prices/copy-city', { fromCity, toCity: toCity.trim(), percentChange: Number(percent) }), {
      success: (out) => `Copied ${out.data.data.created} prices into ${toCity.trim()}`,
    });
    if (r.ok) onDone(toCity.trim());
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Copy a city's prices"
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
        <p className="text-sm text-steel-600">Launching a new city? Start from an existing price list and adjust it for local rates.</p>
        <div className="grid sm:grid-cols-[1fr_auto_1fr] items-start gap-3">
          <Field label="From" error={errors.fromCity}>
            {(id) => (
              <Select id={id} value={fromCity} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Choose…</option>
                {cities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <ArrowRight className="hidden sm:block w-4 h-4 text-steel-400 mt-10" aria-hidden />
          <Field label="To" error={errors.toCity}>
            {(id) => (
              <>
                <Input id={id} list="copy-cities" value={toCity} onChange={(e) => setTo(e.target.value)} placeholder="e.g. Mysuru" invalid={!!errors.toCity} />
                <datalist id="copy-cities">
                  {cities.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>
        <Field label="Adjust by (%)" error={errors.percent} hint="0 copies prices as they are" className="max-w-[180px]">
          {(id) => <NumberInput id={id} value={percent} onChange={setPercent} min={-90} max={200} step={0.5} invalid={!!errors.percent} />}
        </Field>
        <p className="text-xs text-steel-500">Items that already have a price in the target city are skipped, so nothing is overwritten.</p>
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
  const [city, setCity] = useState(defaultCity && cities.includes(defaultCity) ? defaultCity : '');
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
                <option key={c}>{c}</option>
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
