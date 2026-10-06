import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  HandHeart,
  KeyRound,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  XCircle,
} from 'lucide-react';
import api, { download } from '../services/api';
import useApi, { useDebounce } from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useI18n } from '../i18n/I18nContext';
import { Badge, Button, Card, Field, Input, Segmented, Skeleton, Textarea, cx } from '../components/ui';
import AddressForm from '../components/AddressForm';
import SlotPicker from '../components/SlotPicker';
import PhotoUploader from '../components/PhotoUploader';
import PhoneOtpForm from '../components/PhoneOtpForm';
import CategoryIcon from '../components/CategoryIcon';
import { addressLine, fmtDay, rupees, unitLabel } from '../utils/format';

const DRAFT_KEY = 'sm-booking-draft';
const STEPS = ['items', 'address', 'slot', 'review'];

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
}

function Progress({ step, t }) {
  return (
    <ol className="flex items-center gap-2 mb-8" aria-label="Booking progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex-1">
          <div className={cx('h-1.5 rounded-full transition-colors', i <= step ? 'bg-rust-600' : 'bg-steel-200')} />
          <div className={cx('mt-2 text-xs font-medium hidden sm:block', i === step ? 'text-steel-900' : 'text-steel-500')} aria-current={i === step ? 'step' : undefined}>
            {i + 1}. {t(`book.steps.${s}`)}
          </div>
        </li>
      ))}
    </ol>
  );
}

function QtyStepper({ value, unit, onChange, label }) {
  const step = 1;
  const n = Number(value) || 0;
  return (
    <div className="inline-flex items-center rounded-lg border border-steel-300 bg-surface">
      <button type="button" className="w-9 h-9 inline-flex items-center justify-center text-steel-600 hover:bg-steel-100 rounded-l-lg" onClick={() => onChange(String(Math.max(0, n - step)))} aria-label={`Decrease ${label}`}>
        <Minus className="w-4 h-4" aria-hidden />
      </button>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        inputMode="decimal"
        className="w-14 text-center bg-transparent text-sm font-semibold text-steel-900 focus:outline-none tabular"
        aria-label={`${label} quantity in ${unit}`}
      />
      <span className="text-xs text-steel-500 pr-1">{unitLabel(unit)}</span>
      <button type="button" className="w-9 h-9 inline-flex items-center justify-center text-steel-600 hover:bg-steel-100 rounded-r-lg" onClick={() => onChange(String(n + step))} aria-label={`Increase ${label}`}>
        <Plus className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

export default function SchedulePickup() {
  const { user, refreshMe } = useAuth();
  const { city: siteCity } = useConfig();
  const { t, tr } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  usePageMeta({ title: t('book.title'), description: 'Book a free doorstep scrap pickup in under a minute.' });

  const deepItems = params.get('items');
  const draft = useRef(deepItems ? null : loadDraft()).current;

  const [step, setStep] = useState(draft?.step && draft.step < 3 ? draft.step : 0);
  const [type, setType] = useState(params.get('type') === 'donation' ? 'donation' : draft?.type || 'sale');
  const [ngoId, setNgoId] = useState(draft?.ngoId || '');
  const [lines, setLines] = useState(draft?.lines || []); // [{ itemId, qty, condition }]
  const [photos, setPhotos] = useState(draft?.photos || []);
  const [notes, setNotes] = useState(draft?.notes || '');
  const [addressId, setAddressId] = useState(draft?.addressId || '');
  const [guestAddress, setGuestAddress] = useState(draft?.guestAddress || null);
  const [date, setDate] = useState(draft?.date || '');
  const [slot, setSlot] = useState(draft?.slot || '');
  const [couponCode, setCouponCode] = useState(draft?.couponCode || '');
  const [coupon, setCoupon] = useState(null);
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [addingAddress, setAddingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(null);
  const [estimate, setEstimate] = useState(null);

  const { data: addrData, reload: reloadAddresses } = useApi(user?.role === 'customer' ? '/addresses' : null);
  const addresses = addrData?.addresses || [];
  const selectedAddress = user ? addresses.find((a) => a._id === addressId) : guestAddress;
  const city = selectedAddress?.city || siteCity;
  const { data: rateData } = useApi('/scrap/rates', { params: { city } });
  const { data: catData } = useApi('/scrap/categories');
  const { data: ngoData } = useApi(type === 'donation' ? '/public/ngos' : null, { params: { city } });
  const rates = rateData?.rates;
  const byId = useMemo(() => Object.fromEntries((rates || []).map((r) => [r.itemId, r])), [rates]);

  // Booking-started funnel event + deep-linked items from the estimator/chat.
  useEffect(() => {
    api.post('/public/events', { type: 'booking_started', path: '/schedule-pickup' }).catch(() => {});
    if (deepItems) {
      setLines(
        deepItems
          .split(',')
          .map((p) => p.split(':'))
          .filter(([id, q]) => /^[a-f\d]{24}$/i.test(id) && Number(q) > 0)
          .map(([itemId, qty, condition]) => ({ itemId, qty, condition: condition || 'working' }))
      );
    }
  }, []);

  // Default address for logged-in customers.
  useEffect(() => {
    if (user && addresses.length && !addresses.some((a) => a._id === addressId)) {
      setAddressId((addresses.find((a) => a.isDefault) || addresses[0])._id);
    }
  }, [addresses, user, addressId]);

  useEffect(() => {
    if (user?.phone && !contactPhone) setContactPhone(user.phone);
  }, [user, contactPhone]);

  // Save the draft so a refresh or back-navigation never loses data.
  useEffect(() => {
    if (booked) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, type, ngoId, lines, photos, notes, addressId, guestAddress, date, slot, couponCode }));
    } catch {
      /* ignore */
    }
  }, [step, type, ngoId, lines, photos, notes, addressId, guestAddress, date, slot, couponCode, booked]);

  // Live server-side estimate.
  const validLines = lines.filter((l) => byId[l.itemId] && Number(l.qty) > 0);
  const estKey = useDebounce(JSON.stringify([city, validLines]), 350);
  useEffect(() => {
    if (!validLines.length) {
      setEstimate(null);
      return;
    }
    api
      .post('/scrap/estimate', {
        city,
        items: validLines.map((l) => ({ itemId: l.itemId, estimatedQuantity: Number(l.qty), ...(byId[l.itemId]?.category?.conditionGrading ? { condition: l.condition } : {}) })),
      })
      .then((res) => setEstimate(res.data.data))
      .catch(() => {});
  }, [estKey]);

  const filteredRates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rates || []).filter((r) => (category === 'all' || r.category?.slug === category) && (!q || r.name.toLowerCase().includes(q) || (r.nameNe || '').includes(q)));
  }, [rates, category, search]);

  const addLine = (r) => {
    if (lines.some((l) => l.itemId === r.itemId)) return;
    setLines((ls) => [...ls, { itemId: r.itemId, qty: r.unit === 'kg' ? '5' : '1', condition: 'working' }]);
  };
  const updateLine = (itemId, patch) => setLines((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));

  async function saveAddress(addr) {
    if (!user) {
      setGuestAddress(addr);
      setAddingAddress(false);
      return;
    }
    setSavingAddress(true);
    try {
      const res = await api.post('/addresses', addr);
      await reloadAddresses();
      setAddressId(res.data.data.address._id);
      setAddingAddress(false);
      toast.success('Address saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingAddress(false);
    }
  }

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    if (!user) {
      setCoupon({ code: couponCode.toUpperCase(), pending: true });
      return toast('We will apply the code when you confirm.');
    }
    try {
      const res = await api.post('/coupons/validate', { code: couponCode, weightKg: estimate?.weightKg || 0, value: estimate?.min || 0 });
      setCoupon(res.data.data);
      toast.success(`Code applied: +${rupees(res.data.data.bonus)}`);
    } catch (err) {
      setCoupon(null);
      toast.error(err.message);
    }
  }

  function canContinue() {
    if (step === 0) return validLines.length > 0 && (type === 'sale' || ngoId);
    if (step === 1) return Boolean(selectedAddress) && selectedAddress.serviceable !== false;
    if (step === 2) return Boolean(date && slot);
    return true;
  }

  function payload() {
    return {
      items: validLines.map((l) => ({ itemId: l.itemId, estimatedQuantity: Number(l.qty), ...(byId[l.itemId]?.category?.conditionGrading ? { condition: l.condition } : {}) })),
      scheduledDate: date,
      timeSlot: slot,
      notes: notes || undefined,
      photos,
      couponCode: type === 'sale' && couponCode ? couponCode : undefined,
      type,
      ngoId: type === 'donation' ? ngoId : undefined,
    };
  }

  function finish(pickup) {
    setBooked(pickup);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    window.scrollTo(0, 0);
  }

  async function confirm() {
    setSubmitting(true);
    try {
      const res = await api.post('/pickups', { ...payload(), addressId, contactPhone: contactPhone || undefined });
      finish(res.data.data.pickup);
      toast.success(t('book.successTitle'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmAsGuest({ phone, code, name }) {
    const { serviceable, serviceReason, ...address } = guestAddress;
    const res = await api.post('/pickups/guest', { ...payload(), phone, code, name: name || 'ScrapMate customer', address });
    // The API signed the guest in (cookie); load the new session.
    await refreshMe();
    finish(res.data.data.pickup);
    toast.success(t('book.successTitle'));
  }

  // ---------- Success ----------
  if (booked) {
    return (
      <div className="container-page py-12 max-w-xl text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-patina-100 text-patina-700 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9" aria-hidden />
        </div>
        <h1 className="font-head text-3xl font-bold text-steel-900 mt-5">{t('book.successTitle')}</h1>
        <p className="text-steel-500 mt-2">{t('book.successSub')}</p>
        <Card className="mt-8 text-left">
          <div className="flex justify-between gap-4 text-sm">
            <span className="text-steel-500">Pickup ID</span>
            <span className="font-semibold text-steel-900">{booked.pickupId}</span>
          </div>
          <div className="flex justify-between gap-4 text-sm mt-2">
            <span className="text-steel-500">When</span>
            <span className="font-medium text-steel-900 text-right">
              {fmtDay(booked.scheduledDate)} · {booked.timeSlot}
            </span>
          </div>
          {booked.type !== 'donation' && (
            <div className="flex justify-between gap-4 text-sm mt-2">
              <span className="text-steel-500">Estimate</span>
              <span className="font-medium text-steel-900">
                {rupees(booked.estimatedValueMin)} – {rupees(booked.estimatedValueMax)}
              </span>
            </div>
          )}
          {booked.otp && (
            <div className="mt-5 rounded-xl bg-rust-50 border border-rust-100 p-4 flex items-center gap-4">
              <KeyRound className="w-6 h-6 text-rust-600 shrink-0" aria-hidden />
              <div className="flex-1">
                <div className="text-xs text-steel-600">{t('track.code')}</div>
                <div className="font-head text-3xl font-bold tracking-[0.3em] text-steel-900 tabular">{booked.otp}</div>
              </div>
            </div>
          )}
        </Card>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={() => navigate(`/pickups/${booked.pickupId}`)}>
            {t('book.track')}
          </Button>
          <Button size="lg" variant="outline" icon={CalendarPlus} onClick={() => download(`/pickups/${booked.pickupId}/calendar.ics`, `scrapmate-${booked.pickupId}.ics`).catch((e) => toast.error(e.message))}>
            {t('book.addToCalendar')}
          </Button>
        </div>
      </div>
    );
  }

  if (user && user.role !== 'customer') {
    return (
      <div className="container-page py-16 max-w-lg text-center">
        <p className="text-steel-600">Pickups are booked from a customer account. You're signed in as {user.role}.</p>
        <Link to="/" className="btn-outline mt-4">
          Go home
        </Link>
      </div>
    );
  }

  const selectedLines = lines.map((l) => ({ ...l, rate: byId[l.itemId] })).filter((l) => l.rate);
  const estLine = (id) => estimate?.lines?.find((x) => x.itemId === id);

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="font-head text-2xl sm:text-3xl font-bold text-steel-900">{t('book.title')}</h1>
          <span className="text-xs text-steel-400 hidden sm:inline">{t('book.saveDraft')} ✓</span>
        </div>
        <Progress step={step} t={t} />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
          <div>
            {/* STEP 1: items */}
            {step === 0 && (
              <div className="space-y-5">
                <Segmented
                  value={type}
                  onChange={setType}
                  options={[
                    { value: 'sale', label: t('book.sell'), icon: ShoppingBag },
                    { value: 'donation', label: t('book.donate'), icon: HandHeart },
                  ]}
                />
                {type === 'donation' && (
                  <Card>
                    <div className="label">Choose an NGO</div>
                    {!ngoData ? (
                      <Skeleton className="h-20" />
                    ) : !ngoData.ngos.length ? (
                      <p className="text-sm text-steel-500">No NGO partners in {city} yet.</p>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="NGO">
                        {ngoData.ngos.map((n) => (
                          <button
                            key={n._id}
                            type="button"
                            role="radio"
                            aria-checked={ngoId === n._id}
                            onClick={() => setNgoId(n._id)}
                            className={cx('text-left rounded-xl border p-3', ngoId === n._id ? 'border-rust-600 bg-rust-50' : 'border-steel-200 hover:border-steel-400')}
                          >
                            <div className="font-medium text-sm text-steel-900">{n.name}</div>
                            <div className="text-xs text-steel-500 line-clamp-2">{n.description}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
                <Card>
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-400" aria-hidden />
                      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('rates.search')} className="pl-9" type="search" aria-label={t('rates.search')} />
                    </div>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
                    {[{ slug: 'all', name: t('rates.all') }, ...(catData?.categories || [])].map((c) => (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => setCategory(c.slug)}
                        className={cx('shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm', category === c.slug ? 'border-rust-600 bg-rust-50 text-rust-700' : 'border-steel-200 text-steel-700 hover:border-steel-400')}
                      >
                        {c.icon && <CategoryIcon icon={c.icon} className="w-4 h-4" />}
                        {c.slug === 'all' ? c.name : tr(c)}
                      </button>
                    ))}
                  </div>
                  {!rates ? (
                    <Skeleton className="h-48" />
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[22rem] overflow-y-auto pr-1">
                      {filteredRates.map((r) => {
                        const added = lines.some((l) => l.itemId === r.itemId);
                        return (
                          <button
                            key={r.itemId}
                            type="button"
                            onClick={() => (added ? setLines((ls) => ls.filter((l) => l.itemId !== r.itemId)) : addLine(r))}
                            aria-pressed={added}
                            className={cx('relative text-left rounded-xl border p-3 transition-colors', added ? 'border-rust-600 bg-rust-50' : 'border-steel-200 hover:border-steel-400 bg-surface')}
                          >
                            {added && (
                              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-rust-600 text-white flex items-center justify-center">
                                <Check className="w-3 h-3" aria-hidden />
                              </span>
                            )}
                            <div className="font-medium text-sm text-steel-900 pr-5">{tr(r)}</div>
                            <div className="text-xs text-steel-500 mt-0.5 tabular">
                              {rupees(r.minPrice)}–{rupees(r.maxPrice)}/{unitLabel(r.unit)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {selectedLines.length > 0 && (
                  <Card>
                    <div className="label mb-3">Your items</div>
                    <ul className="divide-y divide-steel-100">
                      {selectedLines.map((l) => (
                        <li key={l.itemId} className="py-3 flex flex-wrap items-center gap-3">
                          <div className="flex-1 min-w-[8rem]">
                            <div className="font-medium text-steel-900 text-sm">{tr(l.rate)}</div>
                            {type === 'sale' && estLine(l.itemId) && (
                              <div className="text-xs text-steel-500 tabular">
                                ≈ {rupees(estLine(l.itemId).min)} – {rupees(estLine(l.itemId).max)}
                              </div>
                            )}
                          </div>
                          <QtyStepper value={l.qty} unit={l.rate.unit} label={l.rate.name} onChange={(qty) => updateLine(l.itemId, { qty })} />
                          <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.itemId !== l.itemId))} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-steel-500 hover:bg-steel-100" aria-label={`Remove ${l.rate.name}`}>
                            <Trash2 className="w-4 h-4" aria-hidden />
                          </button>
                          {l.rate.category?.conditionGrading && (
                            <div className="w-full flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${t('est.condition')}: ${l.rate.name}`}>
                              <span className="text-xs text-steel-500 mr-1 self-center">{t('est.condition')}:</span>
                              {['working', 'not_working', 'damaged'].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  role="radio"
                                  aria-checked={l.condition === c}
                                  onClick={() => updateLine(l.itemId, { condition: c })}
                                  className={cx('text-xs px-2.5 py-1 rounded-full border', l.condition === c ? 'border-rust-600 bg-rust-50 text-rust-700' : 'border-steel-200 text-steel-600')}
                                >
                                  {t(`cond.${c}`)}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                <Card>
                  <div className="label">{t('book.photos')}</div>
                  <p className="text-xs text-steel-500 mb-3">{t('book.photosHint')}</p>
                  <PhotoUploader value={photos} onChange={setPhotos} max={6} />
                  <Field label={t('book.notes')} className="mt-4">
                    {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. 3rd floor, no lift. Call before coming." />}
                  </Field>
                </Card>
              </div>
            )}

            {/* STEP 2: address */}
            {step === 1 && (
              <Card>
                {user ? (
                  <>
                    <div className="space-y-2" role="radiogroup" aria-label="Pickup address">
                      {addresses.map((a) => (
                        <button
                          key={a._id}
                          type="button"
                          role="radio"
                          aria-checked={addressId === a._id}
                          onClick={() => setAddressId(a._id)}
                          className={cx('w-full text-left rounded-xl border p-4 flex gap-3', addressId === a._id ? 'border-rust-600 bg-rust-50' : 'border-steel-200 hover:border-steel-400')}
                        >
                          <MapPin className="w-5 h-5 text-steel-500 shrink-0 mt-0.5" aria-hidden />
                          <span className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-steel-900 capitalize">{a.addressType}</span>
                            {a.isDefault && <Badge className="ml-2">Default</Badge>}
                            <span className="block text-sm text-steel-600 mt-0.5">{addressLine(a)}</span>
                            {a.serviceable === false && (
                              <span className="flex items-center gap-1 text-xs text-danger-600 mt-1">
                                <XCircle className="w-3.5 h-3.5" aria-hidden /> {t('book.notServiceable')}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                    {addingAddress || !addresses.length ? (
                      <div className="mt-5 pt-5 border-t border-steel-100">
                        <h2 className="font-medium text-steel-900 mb-3">{t('book.newAddress')}</h2>
                        <AddressForm onSubmit={saveAddress} onCancel={addresses.length ? () => setAddingAddress(false) : undefined} busy={savingAddress} />
                      </div>
                    ) : (
                      <Button variant="ghost" icon={Plus} className="mt-3" onClick={() => setAddingAddress(true)}>
                        {t('book.newAddress')}
                      </Button>
                    )}
                  </>
                ) : guestAddress && !addingAddress ? (
                  <div className="rounded-xl border border-rust-600 bg-rust-50 p-4 flex gap-3">
                    <MapPin className="w-5 h-5 text-rust-600 shrink-0" aria-hidden />
                    <div className="flex-1 text-sm text-steel-800">{addressLine(guestAddress)}</div>
                    <button type="button" className="text-sm link" onClick={() => setAddingAddress(true)}>
                      {t('common.edit')}
                    </button>
                  </div>
                ) : (
                  <AddressForm
                    initial={guestAddress || undefined}
                    submitLabel="Use this address"
                    onSubmit={async (addr) => {
                      const s = await api.get('/public/serviceability', { params: { pin: addr.pinCode, city: addr.city } }).catch(() => null);
                      if (s && !s.data.data.serviceable) return toast.error(s.data.data.reason);
                      saveAddress(addr);
                    }}
                  />
                )}
              </Card>
            )}

            {/* STEP 3: date & slot */}
            {step === 2 && (
              <Card>
                <SlotPicker
                  pinCode={selectedAddress?.pinCode}
                  date={date}
                  slot={slot}
                  onChange={({ date: d, slot: s }) => {
                    setDate(d);
                    setSlot(s);
                  }}
                />
              </Card>
            )}

            {/* STEP 4: review */}
            {step === 3 && (
              <div className="space-y-4">
                <Card>
                  <h2 className="font-medium text-steel-900 mb-3">{type === 'donation' ? 'Donation summary' : 'Pickup summary'}</h2>
                  <dl className="text-sm space-y-2.5">
                    <div className="flex justify-between gap-4">
                      <dt className="text-steel-500">Items</dt>
                      <dd className="text-right text-steel-900">{selectedLines.map((l) => `${l.rate.name} × ${l.qty} ${unitLabel(l.rate.unit)}`).join(', ')}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-steel-500">Address</dt>
                      <dd className="text-right text-steel-900">{addressLine(selectedAddress)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-steel-500">When</dt>
                      <dd className="text-right text-steel-900">
                        {date && fmtDay(date)} · {slot}
                      </dd>
                    </div>
                    {type === 'donation' && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-steel-500">NGO</dt>
                        <dd className="text-right text-steel-900">{ngoData?.ngos.find((n) => n._id === ngoId)?.name}</dd>
                      </div>
                    )}
                    {photos.length > 0 && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-steel-500">Photos</dt>
                        <dd>{photos.length}</dd>
                      </div>
                    )}
                  </dl>
                  <button type="button" onClick={() => setStep(0)} className="text-sm link mt-4">
                    {t('common.edit')}
                  </button>
                </Card>
                {user && (
                  <Card>
                    <Field label={t('book.contact')}>{(id) => <Input id={id} inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />}</Field>
                  </Card>
                )}
                {type === 'sale' && (
                  <Card>
                    <div className="label flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-rust-600" aria-hidden /> {t('book.coupon')}
                    </div>
                    <div className="flex gap-2">
                      <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="FIRST5" aria-label={t('book.coupon')} />
                      <Button variant="outline" onClick={applyCoupon}>
                        {t('book.apply')}
                      </Button>
                    </div>
                    {coupon && !coupon.pending && <p className="text-sm text-patina-700 mt-2">+{rupees(coupon.bonus)} bonus on top of your payout{coupon.description ? ` · ${coupon.description}` : ''}</p>}
                    <p className="text-xs text-steel-500 mt-2">No code? First pickups get +5% automatically.</p>
                  </Card>
                )}
                {!user && (
                  <Card>
                    <h2 className="font-medium text-steel-900">{t('book.guestTitle')}</h2>
                    <p className="text-sm text-steel-500 mb-4">{t('book.guestSub')}</p>
                    <PhoneOtpForm purpose="booking" onVerified={confirmAsGuest} submitLabel={t('book.confirm')} />
                    <p className="text-xs text-steel-500 mt-4">
                      Have an account?{' '}
                      <Link to="/login" state={{ from: '/schedule-pickup' }} className="link">
                        Log in
                      </Link>
                    </p>
                  </Card>
                )}
              </div>
            )}

            <div className="flex justify-between mt-6 gap-3">
              <Button variant="ghost" icon={ChevronLeft} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                {t('book.back')}
              </Button>
              {step < 3 ? (
                <Button size="lg" disabled={!canContinue()} onClick={() => setStep((s) => s + 1)}>
                  {t('book.next')}
                </Button>
              ) : (
                user && (
                  <Button size="lg" loading={submitting} onClick={confirm}>
                    {t('book.confirm')}
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Summary sidebar */}
          <aside className="lg:sticky lg:top-24 order-first lg:order-none">
            <Card className="!p-0 overflow-hidden">
              <div className="p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-steel-500">{type === 'donation' ? 'Donation' : t('est.youGet')}</div>
                {type === 'donation' ? (
                  <div className="font-head text-xl font-semibold text-steel-900 mt-1">Thank you for giving 💚</div>
                ) : estimate ? (
                  <div className="font-head text-2xl font-bold text-steel-900 tabular mt-1">
                    {rupees(estimate.min)} – {rupees(estimate.max)}
                  </div>
                ) : (
                  <div className="text-sm text-steel-500 mt-1">{t('est.empty')}</div>
                )}
                {estimate && <div className="text-xs text-steel-500 mt-1">≈ {estimate.weightKg} kg · {validLines.length} items</div>}
                {coupon?.bonus > 0 && <div className="text-xs text-patina-700 mt-1">+{rupees(coupon.bonus)} coupon bonus</div>}
              </div>
              <div className="bg-surface-2 border-t border-steel-100 px-5 py-3 text-xs text-steel-500">{t('est.disclaimer')}</div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
