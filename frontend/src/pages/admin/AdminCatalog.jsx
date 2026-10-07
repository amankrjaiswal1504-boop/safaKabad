import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Car, Cpu, Package, Pencil, Plus, Power, Recycle, Refrigerator, Search, Tags } from 'lucide-react';
import api from '../../services/api';
import useApi, { useDebounce } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { rupees, unitLabel } from '../../utils/format';
import { CURRENCY_SYMBOL } from '../../utils/locale';
import { Badge, Button, Card, DataTable, EmptyState, Field, IconButton, Input, PageHeader, Pagination, Select, Tabs, Textarea, Toggle } from '../../components/ui';
import { Async, Callout, ConfirmModal, FormSection, ImageField, NumberInput, Thumb, Toolbar, isBlank, useAction, Modal } from './_catalog/shared';
import { cityLabel, useAdminCities } from './_geo/shared';

const ICONS = [
  { value: 'recycle', label: 'Recyclables', icon: Recycle },
  { value: 'ewaste', label: 'E-waste', icon: Cpu },
  { value: 'appliance', label: 'Appliances', icon: Refrigerator },
  { value: 'vehicle', label: 'Vehicles', icon: Car },
  { value: 'paper', label: 'Paper', icon: Package },
  { value: 'other', label: 'Other', icon: Boxes },
];
const iconFor = (key) => ICONS.find((i) => i.value === key)?.icon || Boxes;

export default function AdminCatalog() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'items' ? 'items' : 'categories';
  const categories = useApi('/admin/categories');
  const cats = categories.data?.categories;
  return (
    <div>
      <PageHeader title="Categories & items" subtitle="What customers can sell, how it's grouped, and the units it's priced in." />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(v) => setParams(v === 'items' ? { tab: 'items' } : {}, { replace: true })}
        tabs={[
          { value: 'categories', label: 'Categories', count: cats?.length },
          { value: 'items', label: 'Items', count: cats ? cats.reduce((s, c) => s + c.itemCount, 0) : undefined },
        ]}
      />
      {tab === 'categories' ? <Categories api={categories} /> : <Items categories={cats || []} reloadCategories={categories.reload} />}
    </div>
  );
}

// ---------------- Categories ----------------
const EMPTY_CAT = { name: '', nameNe: '', description: '', icon: 'recycle', image: '', sortOrder: 0, conditionGrading: false, isActive: true };

function Categories({ api: res }) {
  const { can } = useAuth();
  const canEdit = can('catalog');
  const [editing, setEditing] = useState(null); // null | 'new' | category
  const { busy, run } = useAction();

  async function toggle(c) {
    const r = await run(c._id, () => api.put(`/admin/categories/${c._id}`, { isActive: !c.isActive }), {
      success: c.isActive ? `${c.name} hidden from customers` : `${c.name} is live`,
    });
    if (r.ok) res.setData((d) => ({ ...d, categories: d.categories.map((x) => (x._id === c._id ? { ...x, isActive: !c.isActive } : x)) }));
  }

  return (
    <>
      <Toolbar className="justify-between">
        <p className="text-sm text-steel-500">Categories are shown in this order on the price list and booking form.</p>
        {canEdit && (
          <Button icon={Plus} onClick={() => setEditing('new')}>
            New category
          </Button>
        )}
      </Toolbar>
      <Async
        {...res}
        onRetry={res.reload}
        isEmpty={(d) => !d.categories.length}
        empty={
          <EmptyState
            icon={Tags}
            title="No categories yet"
            description="Create a category such as Paper, Metals or E-waste, then add items to it."
            action={canEdit && <Button icon={Plus} onClick={() => setEditing('new')}>New category</Button>}
          />
        }
      >
        {(d) => (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {d.categories.map((c) => (
              <Card key={c._id} className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <Thumb src={c.image} fallback={iconFor(c.icon)} className="w-12 h-12" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-steel-900 truncate">{c.name}</h3>
                      {!c.isActive && <Badge>Hidden</Badge>}
                    </div>
                    {c.nameNe && <p className="text-sm text-steel-500">{c.nameNe}</p>}
                  </div>
                  {canEdit && <IconButton label={`Edit ${c.name}`} icon={Pencil} onClick={() => setEditing(c)} />}
                </div>
                {c.description && <p className="text-sm text-steel-600 line-clamp-2">{c.description}</p>}
                <div className="flex flex-wrap gap-2 mt-auto">
                  <Badge tone="steel">
                    {c.activeItems}/{c.itemCount} items active
                  </Badge>
                  {c.conditionGrading && <Badge tone="blue">Condition graded</Badge>}
                  <Badge tone="steel">Order {c.sortOrder ?? 0}</Badge>
                </div>
                {canEdit && (
                  <div className="pt-3 border-t border-steel-100">
                    <Toggle
                      checked={c.isActive}
                      disabled={busy === c._id}
                      onChange={() => toggle(c)}
                      label={c.isActive ? 'Visible to customers' : 'Hidden from customers'}
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Async>
      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            res.reload();
          }}
        />
      )}
    </>
  );
}

function CategoryForm({ category, onClose, onSaved }) {
  const [f, setF] = useState(() => (category ? { ...EMPTY_CAT, ...category } : EMPTY_CAT));
  const [errors, setErrors] = useState({});
  const { busy, run } = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  async function save(e) {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Enter at least 2 characters';
    if (f.name.length > 60) er.name = 'Keep it under 60 characters';
    if (f.description.length > 300) er.description = 'Keep it under 300 characters';
    if (isBlank(f.sortOrder) || !Number.isInteger(Number(f.sortOrder))) er.sortOrder = 'Whole number';
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {
      name: f.name.trim(),
      nameNe: f.nameNe.trim(),
      description: f.description.trim(),
      icon: f.icon,
      image: f.image || '',
      sortOrder: Number(f.sortOrder),
      conditionGrading: f.conditionGrading,
      isActive: f.isActive,
    };
    const r = await run('save', () => (category ? api.put(`/admin/categories/${category._id}`, body) : api.post('/admin/categories', body)), {
      success: category ? 'Category updated' : 'Category created',
    });
    if (r.ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? `Edit ${category.name}` : 'New category'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={busy === 'save'}>
            {category ? 'Save changes' : 'Create category'}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={save} className="space-y-4" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" required error={errors.name}>
            {(id) => <Input id={id} value={f.name} onChange={(e) => set('name')(e.target.value)} invalid={!!errors.name} maxLength={60} />}
          </Field>
          <Field label="Nepali name" hint="Shown when the site is in Nepali">
            {(id) => <Input id={id} value={f.nameNe} onChange={(e) => set('nameNe')(e.target.value)} maxLength={60} lang="ne" />}
          </Field>
        </div>
        <Field label="Description" error={errors.description} hint={`${f.description.length}/300`}>
          {(id) => <Textarea id={id} rows={2} value={f.description} onChange={(e) => set('description')(e.target.value)} maxLength={300} />}
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Icon" hint="Used when there's no image">
            {(id) => (
              <Select id={id} value={f.icon} onChange={(e) => set('icon')(e.target.value)}>
                {ICONS.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
                {f.icon && !ICONS.some((i) => i.value === f.icon) && <option value={f.icon}>{f.icon}</option>}
              </Select>
            )}
          </Field>
          <Field label="Sort order" error={errors.sortOrder} hint="Lower numbers come first">
            {(id) => <NumberInput id={id} value={f.sortOrder} onChange={set('sortOrder')} step={1} invalid={!!errors.sortOrder} />}
          </Field>
        </div>
        <ImageField label="Image" value={f.image} onChange={set('image')} folder="categories" hint="JPEG, PNG or WebP up to 5 MB. Square images look best." />
        <div className="space-y-3 pt-1">
          <Toggle
            checked={f.conditionGrading}
            onChange={set('conditionGrading')}
            label="Ask for item condition"
            description="Customers pick working / not working / damaged and the price is adjusted (see Settings → Pricing)."
          />
          <Toggle checked={f.isActive} onChange={set('isActive')} label="Visible to customers" />
        </div>
      </form>
    </Modal>
  );
}

// ---------------- Items ----------------
function Items({ categories, reloadCategories }) {
  const { can } = useAuth();
  const canEdit = can('catalog');
  const { cities, defaultCity } = useAdminCities();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search.trim(), 300);
  useEffect(() => setPage(1), [q, category, status, city]);
  useEffect(() => {
    if (!city && defaultCity) setCity(defaultCity);
  }, [defaultCity, city]);

  const params = useMemo(() => {
    const p = { page, limit: 20 };
    if (q) p.search = q;
    if (category) p.category = category;
    if (status) p.status = status;
    if (city) p.city = city;
    return p;
  }, [page, q, category, status, city]);
  const res = useApi('/admin/scrap-items', { params });
  const [editing, setEditing] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const { busy, run } = useAction();

  async function deactivate() {
    const it = deactivating;
    const r = await run('deactivate', () => api.delete(`/admin/scrap-items/${it._id}`), { success: `${it.name} deactivated` });
    if (r.ok) {
      setDeactivating(null);
      res.reload();
      reloadCategories();
    }
  }
  async function activate(it) {
    const r = await run(it._id, () => api.put(`/admin/scrap-items/${it._id}`, { isActive: true }), { success: `${it.name} is active again` });
    if (r.ok) {
      res.reload();
      reloadCategories();
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Item',
      render: (i) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          <Thumb src={i.image} fallback={Package} />
          <div className="min-w-0">
            <div className="font-medium text-steel-900">{i.name}</div>
            {i.nameNe && <div className="text-xs text-steel-500">{i.nameNe}</div>}
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (i) => <span className="text-steel-700">{i.category?.name || '—'}</span> },
    { key: 'unit', header: 'Unit', render: (i) => <span className="text-steel-700">per {unitLabel(i.unit)}</span> },
    {
      key: 'price',
      header: city ? `Price in ${city}` : 'Price',
      render: (i) =>
        i.price ? (
          <div className="tabular whitespace-nowrap">
            <div className="text-steel-900">
              {rupees(i.price.minPrice)}–{rupees(i.price.maxPrice)}
            </div>
            {i.price.recyclerPrice != null && <div className="text-xs text-steel-500">Recycler {rupees(i.price.recyclerPrice)}</div>}
          </div>
        ) : (
          <Badge tone="amber">Not priced</Badge>
        ),
    },
    { key: 'isActive', header: 'Status', render: (i) => (i.isActive ? <Badge tone="patina" dot>Active</Badge> : <Badge dot>Inactive</Badge>) },
  ];
  if (canEdit)
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      render: (i) => (
        <div className="flex justify-end gap-1">
          <IconButton label={`Edit ${i.name}`} icon={Pencil} onClick={() => setEditing(i)} />
          {i.isActive ? (
            <IconButton label={`Deactivate ${i.name}`} icon={Power} onClick={() => setDeactivating(i)} className="hover:!text-danger-600" />
          ) : (
            <Button size="sm" variant="outline" loading={busy === i._id} onClick={() => activate(i)}>
              Activate
            </Button>
          )}
        </div>
      ),
    });

  return (
    <>
      <Toolbar>
        <Field label="Search" className="flex-1 min-w-[180px]">
          {(id) => (
            <div className="relative">
              <Search className="w-4 h-4 text-steel-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
              <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item name" className="pl-9" />
            </div>
          )}
        </Field>
        <Field label="Category" className="w-full sm:w-44">
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
        <Field label="Status" className="w-[calc(50%-6px)] sm:w-36">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          )}
        </Field>
        <Field label="Show prices for" className="w-[calc(50%-6px)] sm:w-40">
          {(id) => (
            <Select id={id} value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">No city</option>
              {cities.map((c) => (
                <option key={c._id} value={c.name}>
                  {cityLabel(c)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {canEdit && (
          <Button icon={Plus} onClick={() => setEditing('new')} disabled={!categories.length} title={!categories.length ? 'Create a category first' : undefined}>
            New item
          </Button>
        )}
      </Toolbar>
      {res.error && !res.data ? (
        <Async {...res} onRetry={res.reload}>
          {() => null}
        </Async>
      ) : (
        <DataTable
          columns={columns}
          rows={res.data?.items}
          loading={res.loading}
          empty={
            <EmptyState
              icon={Package}
              title={q || category || status ? 'No items match these filters' : 'No items yet'}
              description={q || category || status ? 'Try clearing the search or filters.' : 'Add the first item customers can sell.'}
            />
          }
        />
      )}
      <Pagination pagination={res.data?.pagination} onPage={setPage} />
      {editing && (
        <ItemForm
          item={editing === 'new' ? null : editing}
          categories={categories}
          defaultCity={city || defaultCity}
          cities={cities}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            res.reload();
            reloadCategories();
          }}
        />
      )}
      <ConfirmModal
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        title="Deactivate item?"
        confirmLabel="Deactivate"
        variant="danger"
        busy={busy === 'deactivate'}
        onConfirm={deactivate}
      >
        <p>
          <strong className="text-steel-900">{deactivating?.name}</strong> will disappear from the price list and booking form. Past pickups and price
          history are kept, and you can activate it again at any time.
        </p>
      </ConfirmModal>
    </>
  );
}

const EMPTY_ITEM = {
  categoryId: '',
  name: '',
  nameNe: '',
  description: '',
  image: '',
  unit: 'kg',
  co2PerUnit: '',
  kgPerUnit: '',
  isActive: true,
  city: '',
  minPrice: '',
  maxPrice: '',
  recyclerPrice: '',
};

function ItemForm({ item, categories, cities, defaultCity, onClose, onSaved }) {
  const [f, setF] = useState(() => {
    if (!item) return { ...EMPTY_ITEM, categoryId: categories[0]?._id || '', city: defaultCity || cities[0]?.name || '' };
    const p = item.price;
    return {
      ...EMPTY_ITEM,
      categoryId: item.category?._id || item.category || '',
      name: item.name || '',
      nameNe: item.nameNe || '',
      description: item.description || '',
      image: item.image || '',
      unit: item.unit || 'kg',
      co2PerUnit: item.co2PerUnit ?? '',
      kgPerUnit: item.kgPerUnit ?? '',
      isActive: item.isActive !== false,
      city: p?.city || defaultCity || cities[0]?.name || '',
      minPrice: p?.minPrice ?? '',
      maxPrice: p?.maxPrice ?? '',
      recyclerPrice: p?.recyclerPrice ?? '',
    };
  });
  const [errors, setErrors] = useState({});
  const { busy, run } = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const unitWord = unitLabel(f.unit);
  const priced = !isBlank(f.minPrice) || !isBlank(f.maxPrice) || !isBlank(f.recyclerPrice);

  async function save(e) {
    e.preventDefault();
    const er = {};
    if (!f.categoryId) er.categoryId = 'Choose a category';
    if (f.name.trim().length < 2) er.name = 'Enter at least 2 characters';
    if (f.description.length > 300) er.description = 'Keep it under 300 characters';
    if (!isBlank(f.co2PerUnit) && f.co2PerUnit < 0) er.co2PerUnit = 'Cannot be negative';
    if (!isBlank(f.kgPerUnit) && f.kgPerUnit < 0) er.kgPerUnit = 'Cannot be negative';
    if (priced) {
      if (!f.city || f.city.trim().length < 2) er.city = 'Choose the city these prices apply to';
      if (isBlank(f.minPrice)) er.minPrice = 'Required';
      else if (f.minPrice < 0) er.minPrice = 'Cannot be negative';
      if (isBlank(f.maxPrice)) er.maxPrice = 'Required';
      else if (f.maxPrice < 0) er.maxPrice = 'Cannot be negative';
      if (!er.minPrice && !er.maxPrice && f.minPrice > f.maxPrice) er.maxPrice = 'Must be at least the minimum price';
      if (!isBlank(f.recyclerPrice) && f.recyclerPrice < 0) er.recyclerPrice = 'Cannot be negative';
    }
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {
      categoryId: f.categoryId,
      name: f.name.trim(),
      nameNe: f.nameNe.trim(),
      description: f.description.trim(),
      image: f.image || '',
      unit: f.unit,
      isActive: f.isActive,
    };
    if (!isBlank(f.co2PerUnit)) body.co2PerUnit = Number(f.co2PerUnit);
    if (!isBlank(f.kgPerUnit)) body.kgPerUnit = Number(f.kgPerUnit);
    if (priced) {
      body.city = f.city.trim();
      body.minPrice = Number(f.minPrice);
      body.maxPrice = Number(f.maxPrice);
      body.recyclerPrice = isBlank(f.recyclerPrice) ? null : Number(f.recyclerPrice);
    }
    const r = await run('save', () => (item ? api.put(`/admin/scrap-items/${item._id}`, body) : api.post('/admin/scrap-items', body)), {
      success: item ? 'Item updated' : 'Item created',
    });
    if (r.ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'New item'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="item-form" loading={busy === 'save'}>
            {item ? 'Save changes' : 'Create item'}
          </Button>
        </>
      }
    >
      <form id="item-form" onSubmit={save} className="space-y-6" noValidate>
        <FormSection title="Details">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Name" required error={errors.name}>
              {(id) => <Input id={id} value={f.name} onChange={(e) => set('name')(e.target.value)} invalid={!!errors.name} maxLength={80} />}
            </Field>
            <Field label="Nepali name">
              {(id) => <Input id={id} value={f.nameNe} onChange={(e) => set('nameNe')(e.target.value)} maxLength={80} lang="ne" />}
            </Field>
            <Field label="Category" required error={errors.categoryId}>
              {(id) => (
                <Select id={id} value={f.categoryId} onChange={(e) => set('categoryId')(e.target.value)}>
                  <option value="">Choose…</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Priced per">
              {(id) => (
                <Select id={id} value={f.unit} onChange={(e) => set('unit')(e.target.value)}>
                  <option value="kg">Kilogram (kg)</option>
                  <option value="piece">Piece</option>
                  <option value="unit">Unit</option>
                </Select>
              )}
            </Field>
          </div>
          <Field label="Description" error={errors.description} hint={`${f.description.length}/300`}>
            {(id) => <Textarea id={id} rows={2} value={f.description} onChange={(e) => set('description')(e.target.value)} maxLength={300} />}
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={`CO₂ saved per ${unitWord} (kg)`} error={errors.co2PerUnit} hint="Used for the customer's impact stats">
              {(id) => <NumberInput id={id} min={0} step="0.01" value={f.co2PerUnit} onChange={set('co2PerUnit')} invalid={!!errors.co2PerUnit} />}
            </Field>
            <Field
              label={`Weight per ${unitWord} (kg)`}
              error={errors.kgPerUnit}
              hint={f.unit === 'kg' ? 'Not needed for items sold by weight' : 'Approximate weight, used for kg totals'}
            >
              {(id) => (
                <NumberInput id={id} min={0} step="0.01" value={f.kgPerUnit} onChange={set('kgPerUnit')} invalid={!!errors.kgPerUnit} disabled={f.unit === 'kg'} />
              )}
            </Field>
          </div>
          <ImageField value={f.image} onChange={set('image')} folder="items" />
          <Toggle checked={f.isActive} onChange={set('isActive')} label="Active" description="Inactive items are hidden from the price list and booking." />
        </FormSection>

        <div className="border-t border-steel-100 pt-5">
          <FormSection
            title="Price in a city (optional)"
            description={item ? 'Leave the prices empty to keep them unchanged.' : 'You can also set prices later on the Prices page.'}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="City" error={errors.city} className="col-span-2 sm:col-span-1">
                {(id) => (
                  <Select id={id} value={f.city} onChange={(e) => set('city')(e.target.value)}>
                    <option value="">Choose…</option>
                    {f.city && !cities.some((c) => c.name === f.city) && <option value={f.city}>{f.city}</option>}
                    {cities.map((c) => (
                      <option key={c._id} value={c.name}>
                        {cityLabel(c)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={`Min (${CURRENCY_SYMBOL}/${unitWord})`} error={errors.minPrice}>
                {(id) => <NumberInput id={id} min={0} step="0.5" value={f.minPrice} onChange={set('minPrice')} invalid={!!errors.minPrice} />}
              </Field>
              <Field label={`Max (${CURRENCY_SYMBOL}/${unitWord})`} error={errors.maxPrice}>
                {(id) => <NumberInput id={id} min={0} step="0.5" value={f.maxPrice} onChange={set('maxPrice')} invalid={!!errors.maxPrice} />}
              </Field>
              <Field label={`Recycler (${CURRENCY_SYMBOL})`} error={errors.recyclerPrice} hint="What we sell at">
                {(id) => <NumberInput id={id} min={0} step="0.5" value={f.recyclerPrice} onChange={set('recyclerPrice')} invalid={!!errors.recyclerPrice} />}
              </Field>
            </div>
            {priced && !isBlank(f.recyclerPrice) && !isBlank(f.maxPrice) && (
              <Callout tone={f.recyclerPrice - f.maxPrice >= 0 ? 'patina' : 'amber'}>
                Margin at max price: <strong className="tabular">{rupees(f.recyclerPrice - f.maxPrice, { decimals: 2 })}</strong> per {unitWord}
              </Callout>
            )}
          </FormSection>
        </div>
      </form>
    </Modal>
  );
}
