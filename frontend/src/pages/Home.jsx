import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Camera,
  CalendarCheck,
  Clock,
  Banknote,
  Leaf,
  MapPin,
  Scale,
  ShieldCheck,
  Truck,
  Wallet,
} from 'lucide-react';
import useApi from '../hooks/useApi';
import usePageMeta from '../hooks/usePageMeta';
import { useConfig } from '../context/ConfigContext';
import { useI18n } from '../i18n/I18nContext';
import Estimator from '../components/Estimator';
import TruckCta from '../components/TruckCta';
import CallCta from '../components/CallCta';
import AndroidAppButton from '../components/AndroidAppButton';
import CategoryIcon from '../components/CategoryIcon';
import { Skeleton, Stars } from '../components/ui';
import { compact, fmtDay, rupees, unitLabel } from '../utils/format';

const compactRs = (n) => Number(n).toLocaleString('en-IN');

// Live product collage (no stock photos, no made-up numbers): today's rates for
// the visitor's city, the next free pickup day, and the municipalities we serve.
function HeroVisual() {
  const { t, tr, lang } = useI18n();
  const { city, areasFor, cityInfo } = useConfig();
  const { data: rateData } = useApi(city ? '/scrap/rates' : null, { params: { city } });
  const { data: cal } = useApi('/public/slots/calendar');
  // One item per category, up to four.
  const sample = [];
  const seen = new Set();
  for (const r of rateData?.rates || []) {
    if (sample.length === 4) break;
    if (seen.has(r.category?.slug)) continue;
    seen.add(r.category?.slug);
    sample.push(r);
  }
  const nextDay = cal?.days?.find((d) => d.open);
  const areas = areasFor(city);
  const cityName = (lang === 'ne' && cityInfo(city)?.nameNe) || city;
  if (!city) return null;
  return (
    <div className="relative h-[360px] hidden lg:block" aria-hidden>
      {sample.length > 0 && (
        <div className="absolute right-6 top-2 w-72 rounded-2xl bg-surface shadow-lift border border-steel-100 p-4 rotate-[2deg]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-steel-500">{t('home.todaysRates', { city: cityName })}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-patina-100 text-patina-700">{t('home.live')}</span>
          </div>
          {sample.map((r) => (
            <div key={r.itemId} className="flex justify-between gap-3 text-sm py-2 border-b border-steel-100 last:border-0">
              <span className="text-steel-700 truncate">{tr(r)}</span>
              <span className="font-semibold text-steel-900 tabular whitespace-nowrap">
                {rupees(r.minPrice)}–{compactRs(r.maxPrice)}
                <span className="text-steel-500 font-normal">/{unitLabel(r.unit)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {nextDay && (
        <div className="absolute left-0 top-44 w-64 rounded-2xl bg-surface shadow-lift border border-steel-100 p-4 -rotate-[2deg]">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs text-steel-500">{t('home.nextFree')}</div>
              <div className="text-sm font-semibold text-steel-900">{fmtDay(nextDay.date)}</div>
              <div className="text-xs text-steel-500">{t('home.slotsOpen', { n: nextDay.freeSlots })}</div>
            </div>
          </div>
        </div>
      )}
      {areas.length > 0 && (
        <div className="absolute right-0 bottom-0 w-64 rounded-2xl bg-surface shadow-lift border border-steel-100 p-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-patina-100 text-patina-700 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-steel-500">{t('home.weServeIn', { city: cityName })}</div>
              <div className="text-sm font-semibold text-steel-900">{t('home.areaCount', { n: areas.length })}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {areas.slice(0, 3).map((a) => (
              <span key={a._id} className="text-[11px] px-2 py-0.5 rounded-full bg-steel-100 text-steel-700 truncate max-w-full">
                {(lang === 'ne' && a.nameNe) || a.name}
              </span>
            ))}
            {areas.length > 3 && <span className="text-[11px] px-2 py-0.5 rounded-full bg-steel-100 text-steel-500">+{areas.length - 3}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function StatsBand() {
  const { t } = useI18n();
  const { data } = useApi('/scrap/stats');
  const items = [
    { v: data ? `${compact(data.kgRecycled)}+` : null, l: t('home.statKg') },
    { v: data ? `${compact(data.pickups)}+` : null, l: t('home.statPickups') },
    { v: data ? String(data.areas ?? data.cities) : null, l: t('home.statCities') },
    { v: data ? (data.rating ? `${data.rating}/5` : 'New') : null, l: t('home.statRating') },
  ];
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-12">
      {items.map((s, i) => (
        <div key={s.l} className="anim-rise rounded-2xl bg-surface/90 backdrop-blur border border-steel-200/70 shadow-card px-5 py-5 hover:-translate-y-1 hover:shadow-lift transition-all" style={{ animationDelay: `${i * 80}ms` }}>
          <dd className="font-display text-3xl sm:text-4xl text-rust-600 tabular">{s.v ?? <span className="inline-block w-16 h-7 rounded bg-steel-100 animate-pulse2" />}</dd>
          <dt className="text-xs sm:text-sm text-steel-500 mt-0.5">{s.l}</dt>
        </div>
      ))}
    </dl>
  );
}

export default function Home() {
  const { t, tr, lang } = useI18n();
  const { config, serviceAreas } = useConfig();
  const { data: cats } = useApi('/scrap/categories');
  const { data: tst } = useApi('/public/testimonials');
  const { data: faq } = useApi('/public/faqs');
  const home = config?.home || {};
  usePageMeta({
    title: 'Sell scrap online with free doorstep pickup',
    description: 'Check live scrap rates, get an instant estimate and book a free pickup. Digital weighing in front of you and instant eSewa / Khalti payment.',
  });

  const trust = [
    { icon: Truck, text: t('home.trust1') },
    { icon: Camera, text: t('home.trust2') },
    { icon: Wallet, text: t('home.trust3') },
    { icon: BadgeCheck, text: t('home.trust4') },
  ];
  const steps = [
    { icon: Banknote, t: t('home.how1t'), d: t('home.how1d') },
    { icon: MapPin, t: t('home.how2t'), d: t('home.how2d') },
    { icon: Scale, t: t('home.how3t'), d: t('home.how3d') },
    { icon: Wallet, t: t('home.how4t'), d: t('home.how4d') },
  ];
  const why = [
    { icon: ShieldCheck, t: 'Door code safety', d: 'Weighing only starts after the collector enters your 4-digit code. No fake pickups.' },
    { icon: Camera, t: 'Photo proof of every weight', d: 'Each scale reading is photographed and printed on your receipt. Accept or dispute before you are paid.' },
    { icon: Clock, t: 'Slots that fit your day', d: 'Same-day and next-day pickups, reschedule from your phone, live tracking with ETA.' },
    { icon: Leaf, t: 'Recycled responsibly', d: 'Everything goes to authorised recyclers. Track the CO₂ you have saved on your impact dashboard.' },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#E9FBEF] via-[#F4FDF7] to-steel-50 dark:from-steel-50 dark:via-steel-50 dark:to-steel-50 text-steel-900">
        <div className="absolute -top-32 right-[-6rem] w-[38rem] h-[38rem] rounded-full bg-[#86EFAC]/45 dark:bg-rust-500/15 blur-3xl anim-blob pointer-events-none" aria-hidden />
        <div className="absolute -bottom-40 -left-24 w-[30rem] h-[30rem] rounded-full bg-[#FDE68A]/45 dark:bg-amber-600/10 blur-3xl anim-blob [animation-delay:-6s] pointer-events-none" aria-hidden />
        <div className="absolute top-1/3 left-1/3 w-72 h-72 rounded-full bg-[#BAE6FD]/35 dark:bg-transparent blur-3xl anim-blob [animation-delay:-10s] pointer-events-none" aria-hidden />
        <div className="container-page relative z-10 py-12 sm:py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-10 items-center">
            <div>
              {serviceAreas.length > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full border border-rust-200 bg-surface/80 shadow-card px-3.5 py-1 text-xs font-semibold tracking-wide text-rust-700">
                  <span className="relative flex w-2 h-2" aria-hidden>
                    <span className="absolute inset-0 rounded-full bg-patina-500 anim-ping" />
                    <span className="relative w-2 h-2 rounded-full bg-patina-500" />
                  </span> {t('home.badge', { count: serviceAreas.length })}
                </span>
              )}
              <h1 className="font-head text-[2.3rem] sm:text-5xl lg:text-[3.6rem] font-bold leading-[1.05] mt-5 tracking-tight">
                {lang === 'en' && home.heroTitle ? home.heroTitle : t('home.title')}
              </h1>
              <p className="mt-4 text-steel-600 text-base sm:text-lg max-w-xl">{lang === 'en' && home.heroSubtitle ? home.heroSubtitle : t('home.subtitle')}</p>
              <div className="mt-7 flex flex-col sm:flex-row sm:flex-wrap gap-3 [&>a]:justify-center">
                <TruckCta label={t('home.ctaBook')} goingLabel={t('home.onTheWay')} />
                <CallCta />
              </div>
              <ul className="mt-7 grid grid-cols-2 gap-x-4 gap-y-2.5 max-w-lg">
                {trust.map((x) => (
                  <li key={x.text} className="flex items-center gap-2 text-sm text-steel-700">
                    <span className="w-6 h-6 rounded-full bg-patina-100 text-patina-700 flex items-center justify-center shrink-0" aria-hidden>
                      <x.icon className="w-3.5 h-3.5" />
                    </span> {x.text}
                  </li>
                ))}
              </ul>
              <AndroidAppButton className="mt-7" tone="light" />
            </div>
            <HeroVisual />
          </div>
          <StatsBand />
        </div>
        {/* Soft fade into the page so the glow has no hard edge. */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-steel-50 pointer-events-none" aria-hidden />
      </section>

      {/* Estimator + how it works */}
      <section className="container-page -mt-6 sm:mt-0 sm:py-16 py-10 grid grid-cols-1 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-10 items-start">
        <Estimator className="relative z-10" />
        <div>
          <h2 className="font-head text-2xl sm:text-3xl font-semibold text-steel-900">{t('home.howTitle')}</h2>
          <ol className="mt-6 grid sm:grid-cols-2 gap-4">
            {steps.map((s, i) => (
              <li key={s.t} className="card !p-5 flex gap-4">
                <span className="w-11 h-11 rounded-xl bg-rust-50 text-rust-600 flex items-center justify-center shrink-0 relative">
                  <s.icon className="w-5 h-5" aria-hidden />
                  <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-rust-600 text-white text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
                </span>
                <div>
                  <h3 className="font-semibold text-steel-900">{s.t}</h3>
                  <p className="text-sm text-steel-500 mt-1">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link to="/how-it-works" className="link inline-flex items-center gap-1 mt-5 text-sm">
            {t('nav.howItWorks')} <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section className="bg-surface-2 border-y border-steel-100">
        <div className="container-page py-14">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
            <h2 className="font-head text-2xl sm:text-3xl font-semibold text-steel-900">{t('home.categoriesTitle')}</h2>
            <Link to="/rates" className="link text-sm inline-flex items-center gap-1">
              {t('home.viewRates')} <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {!cats && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
            {cats?.categories.map((c) => (
              <Link key={c._id} to={`/rates?category=${c.slug}`} className="group card !p-6 hover:border-rust-200 hover:shadow-lift transition-all">
                <span className="w-12 h-12 rounded-xl bg-rust-50 text-rust-600 flex items-center justify-center group-hover:bg-rust-600 group-hover:text-white transition-colors">
                  <CategoryIcon icon={c.icon} />
                </span>
                <h3 className="font-semibold text-steel-900 mt-4">{tr(c)}</h3>
                <p className="text-sm text-steel-500 mt-1 line-clamp-2">{c.description}</p>
                <span className="text-xs text-steel-400 mt-3 block">{c.itemCount} items</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="container-page py-14">
        <h2 className="font-head text-2xl sm:text-3xl font-semibold text-steel-900 mb-8">{t('home.whyTitle')}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {why.map((w, i) => (
            <div key={w.t} className="group">
              <span
                className={`w-12 h-12 rounded-2xl bg-gradient-to-br text-white flex items-center justify-center shadow-md transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-6 ${['from-green-500 to-emerald-700 shadow-green-600/25', 'from-sky-400 to-indigo-600 shadow-indigo-500/25', 'from-yellow-400 to-orange-500 shadow-orange-500/25', 'from-lime-400 to-green-600 shadow-green-500/25'][i % 4]}`}
              >
                <w.icon className="w-5 h-5" aria-hidden />
              </span>
              <h3 className="font-semibold text-steel-900 mt-3">{w.t}</h3>
              <p className="text-sm text-steel-500 mt-1">{w.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      {tst?.testimonials?.length > 0 && (
        <section className="bg-surface-2 border-y border-steel-100">
          <div className="container-page py-14">
            <h2 className="font-head text-2xl sm:text-3xl font-semibold text-steel-900 mb-8">{t('home.testimonialsTitle')}</h2>
            <div className="grid md:grid-cols-3 gap-5">
              {tst.testimonials.slice(0, 6).map((r) => (
                <figure key={r.id} className="card !p-6 flex flex-col">
                  <Stars value={r.rating} />
                  <blockquote className="text-steel-700 mt-3 flex-1">“{r.comment}”</blockquote>
                  <figcaption className="mt-4 text-sm">
                    <span className="font-semibold text-steel-900">{r.name}</span>
                    {r.city && <span className="text-steel-500"> · {r.city}</span>}
                    <span className="block text-xs text-steel-400 mt-0.5">Verified pickup</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Business + impact */}
      <section className="container-page py-14 grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-ink text-white p-8 relative overflow-hidden">
          <Building2 className="w-10 h-10 text-[#D9B66A]" aria-hidden />
          <h2 className="font-head text-2xl font-semibold mt-4">{t('home.businessTitle')}</h2>
          <p className="text-white/85 mt-2 max-w-md">{t('home.businessSub')}</p>
          <Link to="/business" className="btn-primary mt-6">
            {t('home.businessCta')} <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>
        <div className="rounded-2xl bg-patina-50 border border-patina-100 p-8">
          <Leaf className="w-10 h-10 text-patina-600" aria-hidden />
          <h2 className="font-head text-2xl font-semibold text-steel-900 mt-4">{t('home.impactTitle')}</h2>
          <p className="text-steel-600 mt-2 max-w-md">{t('home.impactSub')}</p>
          <Link to="/donate" className="btn-outline mt-6">
            {t('nav.donate')}
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-page pb-6" id="faq">
        <h2 className="font-head text-2xl sm:text-3xl font-semibold text-steel-900 mb-6">{t('home.faqTitle')}</h2>
        <div className="divide-y divide-steel-100 border-y border-steel-100 bg-surface rounded-xl px-5">
          {!faq && <Skeleton className="h-40 my-4" />}
          {faq?.faqs.slice(0, 8).map((f) => (
            <details key={f._id} className="group py-4">
              <summary className="cursor-pointer list-none flex justify-between items-center gap-4 font-medium text-steel-900">
                {f.question}
                <span className="w-7 h-7 rounded-full bg-steel-100 text-steel-600 flex items-center justify-center shrink-0 group-open:rotate-45 transition-transform" aria-hidden>
                  +
                </span>
              </summary>
              <p className="text-steel-600 text-sm mt-2 pr-10">{f.answer}</p>
            </details>
          ))}
        </div>
        <p className="text-sm text-steel-500 mt-4">
          Still have a question? Tap the chat button, or see <Link to="/how-it-works#faq" className="link">all FAQs</Link>.
        </p>
      </section>
    </div>
  );
}
