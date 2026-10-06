import { useState } from 'react';
import { Building2, FileCheck2, Factory, Receipt, Repeat, Store, TrendingUp, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import useApi from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { Badge, Button, Card, Field, Input, Select, Textarea, Toggle } from '../components/ui';
import { fmtDate, rupees } from '../utils/format';

const PERKS = [
  { icon: Repeat, t: 'Recurring pickups', d: 'Weekly or monthly pickups that book themselves.' },
  { icon: TrendingUp, t: 'Better rates', d: 'Volume pricing tiers: up to +6% over standard rates.' },
  { icon: Receipt, t: 'VAT bills', d: 'Bills and receipts with your PAN/VAT number for every pickup.' },
  { icon: FileCheck2, t: 'E-waste certificates', d: 'Certified disposal certificates for audits and compliance.' },
];

const TYPES = [
  { value: 'kirana', label: 'Kirana / retail shop', icon: Store },
  { value: 'office', label: 'Office', icon: Building2 },
  { value: 'society', label: 'Housing society / RWA', icon: Users },
  { value: 'factory', label: 'Factory / warehouse', icon: Factory },
  { value: 'other', label: 'Other', icon: Building2 },
];

function MyQuotes() {
  const { data } = useApi('/quotes/mine');
  if (!data?.quotes?.length) return null;
  const tone = { new: 'steel', contacted: 'blue', quoted: 'amber', won: 'patina', lost: 'danger' };
  return (
    <Card className="mt-8">
      <h2 className="font-semibold text-steel-900 mb-3">Your quote requests</h2>
      <ul className="divide-y divide-steel-100">
        {data.quotes.map((q) => (
          <li key={q._id} className="py-3 flex flex-wrap justify-between gap-2 text-sm">
            <div>
              <div className="font-medium text-steel-900">
                {q.quoteId} · {q.companyName}
              </div>
              <div className="text-steel-500">
                {fmtDate(q.createdAt)} · {q.city}
                {q.adminNote ? ` · ${q.adminNote}` : ''}
              </div>
            </div>
            <div className="text-right">
              <Badge tone={tone[q.status]}>{q.status}</Badge>
              {q.quotedAmount != null && q.quotedAmount > 0 && <div className="text-steel-900 font-medium mt-1">{rupees(q.quotedAmount)}</div>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Business() {
  const { user } = useAuth();
  const { city } = useConfig();
  usePageMeta({ title: 'Scrap pickup for businesses', description: 'Bulk scrap pickup for shops, offices, housing societies and factories. PAN/VAT bills, recurring pickups, volume pricing and certified e-waste disposal.' });
  const [form, setForm] = useState({
    contactName: user?.name || '',
    companyName: user?.business?.companyName || '',
    phone: user?.phone || '',
    email: user?.email || '',
    city,
    panVat: user?.business?.panVat || '',
    businessType: user?.business?.businessType || 'office',
    description: '',
    estimatedQuantityKg: '',
    wantsCertificate: false,
  });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    setErrors({});
    try {
      const res = await api.post('/quotes', { ...form, estimatedQuantityKg: Number(form.estimatedQuantityKg) || 0 });
      setDone(res.data.data.quote);
      toast.success('Request sent');
    } catch (err) {
      if (err.errors) setErrors(Object.fromEntries(err.errors.map((x) => [x.field, x.message])));
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <section className="bg-ink text-white">
        <div className="container-page py-12 sm:py-16">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#D9B66A]">ScrapMate for Business</span>
          <h1 className="font-head text-3xl sm:text-5xl font-bold mt-3 max-w-3xl leading-tight">Scrap pickup that works like a vendor, not a favour</h1>
          <p className="text-[#C7D2CD] mt-4 max-w-2xl text-lg">For kirana shops, offices, housing societies and factories. Scheduled pickups, transparent weighing, invoices and compliance paperwork, all in one place.</p>
        </div>
      </section>
      <div className="container-page py-12 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_28rem] gap-10 items-start">
        <div>
          <div className="grid sm:grid-cols-2 gap-4">
            {PERKS.map((p) => (
              <Card key={p.t}>
                <p.icon className="w-6 h-6 text-rust-600" aria-hidden />
                <h2 className="font-semibold text-steel-900 mt-3">{p.t}</h2>
                <p className="text-sm text-steel-600 mt-1">{p.d}</p>
              </Card>
            ))}
          </div>
          <Card className="mt-6">
            <h2 className="font-semibold text-steel-900">Pricing tiers</h2>
            <p className="text-sm text-steel-500 mt-1">Based on your average monthly volume. Applied automatically to every pickup.</p>
            <div className="grid grid-cols-3 gap-3 mt-4 text-center">
              {[
                ['Standard', 'Any volume', '+0%'],
                ['Silver', '200 kg+/month', '+3%'],
                ['Gold', '1,000 kg+/month', '+6%'],
              ].map(([n, v, b]) => (
                <div key={n} className="rounded-xl bg-surface-2 border border-steel-100 p-3">
                  <div className="font-semibold text-steel-900">{n}</div>
                  <div className="text-xs text-steel-500 mt-0.5">{v}</div>
                  <div className="font-head text-lg font-bold text-patina-700 mt-1">{b}</div>
                </div>
              ))}
            </div>
          </Card>
          {user?.role === 'customer' && <MyQuotes />}
        </div>

        <Card className="lg:sticky lg:top-24">
          {done ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 mx-auto rounded-full bg-patina-100 text-patina-700 flex items-center justify-center">
                <FileCheck2 className="w-7 h-7" aria-hidden />
              </div>
              <h2 className="font-head text-xl font-semibold mt-4">Request received</h2>
              <p className="text-steel-500 text-sm mt-1">
                Reference <span className="font-medium text-steel-900">{done.quoteId}</span>. Our business team will call you within one working day.
              </p>
              <Button variant="outline" className="mt-5" onClick={() => setDone(null)}>
                Send another
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3" noValidate>
              <h2 className="font-head text-xl font-semibold text-steel-900">Request a bulk quote</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Your name" required error={errors.contactName}>
                  {(id) => <Input id={id} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />}
                </Field>
                <Field label="Business name" required error={errors.companyName}>
                  {(id) => <Input id={id} value={form.companyName} onChange={(e) => set('companyName', e.target.value)} />}
                </Field>
                <Field label="Mobile" required error={errors.phone}>
                  {(id) => <Input id={id} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />}
                </Field>
                <Field label="Email" error={errors.email}>
                  {(id) => <Input id={id} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />}
                </Field>
                <Field label="City" required error={errors.city}>
                  {(id) => <Input id={id} value={form.city} onChange={(e) => set('city', e.target.value)} />}
                </Field>
                <Field label="PAN/VAT no." error={errors.panVat}>
                  {(id) => <Input id={id} inputMode="numeric" value={form.panVat} onChange={(e) => set('panVat', e.target.value.replace(/\D/g, ''))} maxLength={9} />}
                </Field>
              </div>
              <Field label="Type of business">
                {(id) => (
                  <Select id={id} value={form.businessType} onChange={(e) => set('businessType', e.target.value)}>
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="What do you want to sell?" required error={errors.description} hint="e.g. 200 kg cartons every week, 15 old desktops">
                {(id) => <Textarea id={id} value={form.description} onChange={(e) => set('description', e.target.value)} />}
              </Field>
              <Field label="Approx. quantity per month (kg)">
                {(id) => <Input id={id} type="number" min="0" value={form.estimatedQuantityKg} onChange={(e) => set('estimatedQuantityKg', e.target.value)} />}
              </Field>
              <Toggle checked={form.wantsCertificate} onChange={(v) => set('wantsCertificate', v)} label="I need e-waste disposal certificates" />
              <Button type="submit" className="w-full" size="lg" loading={sending}>
                Get my quote
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
