import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Camera,
  CheckCircle2,
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
import CategoryIcon from '../components/CategoryIcon';
import { Skeleton, Stars } from '../components/ui';
import { compact } from '../utils/format';

// Product-style collage instead of stock photography: an original, on-brand hero visual.
function HeroVisual() {
  return (
    <div className="relative h-[360px] hidden lg:block" aria-hidden>
      <div className="absolute right-6 top-2 w-72 rounded-2xl bg-surface shadow-lift border border-steel-100 p-4 rotate-[2deg]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-steel-500">Today's rates · Kathmandu</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-patina-100 text-patina-700">Live</span>
        </div>
        {[
          ['Copper', 'Rs. 780–900', 'kg'],
          ['Newspaper', 'Rs. 15–20', 'kg'],
          ['Laptop', 'Rs. 300–1,000', 'pc'],
          ['Refrigerator', 'Rs. 800–2,000', 'pc'],
        ].map(([n, p, u]) => (
          <div key={n} className="flex justify-between text-sm py-2 border-b border-steel-100 last:border-0">
            <span className="text-steel-700">{n}</span>
            <span className="font-semibold text-steel-900 tabular">
              {p}
              <span className="text-steel-500 font-normal">/{u}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="absolute left-0 top-44 w-64 rounded-2xl bg-surface shadow-lift border border-steel-100 p-4 -rotate-[2deg]">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-steel-900">Ramesh is on the way</div>
            <div className="text-xs text-steel-500">Arriving in ~12 min · 4.9 ★</div>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-steel-100">
          <div className="h-1.5 w-2/3 rounded-full bg-amber-600" />
        </div>
      </div>
      <div className="absolute right-0 bottom-0 w-60 rounded-2xl bg-surface shadow-lift border border-steel-100 p-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-patina-100 text-patina-700 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </span>
          <div>
            <div className="text-xs text-steel-500">Paid via eSewa</div>
            <div className="font-head text-xl font-bold text-steel-900">Rs. 3,690</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsBand() {
  const { t } = useI18n();
  const { data } = useApi('/scrap/stats');
  const items = [
    { v: data ? `${compact(data.kgRecycled)}+` : null, l: t('home.statKg') },
    { v: data ? `${compact(data.pickups)}+` : null, l: t('home.statPickups') },
    { v: data ? String(data.cities) : null, l: t('home.statCities') },
    { v: data ? (data.rating ? `${data.rating}/5` : 'New') : null, l: t('home.statRating') },
  ];
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10 rounded-2xl overflow-hidden mt-12 ring-1 ring-white/10">
      {items.map((s) => (
        <div key={s.l} className="bg-ink/95 px-5 py-5">
          <dd className="font-display text-3xl sm:text-4xl text-white tabular">{s.v ?? <span className="inline-block w-16 h-7 rounded bg-white/10 animate-pulse2" />}</dd>
          <dt className="text-xs sm:text-sm text-[#A3B3AC] mt-0.5">{s.l}</dt>
        </div>
      ))}
    </dl>
  );
}

export default function Home() {
  const { t, tr, lang } = useI18n();
  const { cities, config } = useConfig();
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
      <section className="bg-ink text-white relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(60rem 30rem at 85% -10%, rgb(34 150 108 / 0.28), transparent 60%), radial-gradient(40rem 24rem at -10% 110%, rgb(217 182 106 / 0.14), transparent 60%)',
          }}
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#D9B66A]/40 to-transparent" aria-hidden />
        <div className="container-page relative py-12 sm:py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-10 items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#D9B66A]/30 bg-white/[0.04] px-3.5 py-1 text-xs font-medium tracking-wide text-[#E9D9B4]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7FD3A8]" aria-hidden /> {t('home.badge', { count: cities.length || 10 })}
              </span>
              <h1 className="font-head text-[2.3rem] sm:text-5xl lg:text-[3.6rem] font-bold leading-[1.05] mt-5 tracking-tight">
                {lang === 'en' && home.heroTitle ? home.heroTitle : t('home.title')}
              </h1>
              <p className="mt-4 text-[#C7D2CD] text-base sm:text-lg max-w-xl">{lang === 'en' && home.heroSubtitle ? home.heroSubtitle : t('home.subtitle')}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/schedule-pickup" className="btn-primary !px-6 !py-3 text-base">
                  {t('home.ctaBook')} <ArrowRight className="w-4 h-4" aria-hidden />
                </Link>
                <Link to="/rates" className="btn border border-white/20 text-white !px-6 !py-3 text-base hover:bg-white/10 hover:border-white/40">
                  {t('home.ctaRates')}
                </Link>
              </div>
              <ul className="mt-7 grid grid-cols-2 gap-x-4 gap-y-2.5 max-w-lg">
                {trust.map((x) => (
                  <li key={x.text} className="flex items-center gap-2 text-sm text-[#DDE5E1]">
                    <x.icon className="w-4 h-4 text-[#D9B66A] shrink-0" aria-hidden /> {x.text}
                  </li>
                ))}
              </ul>
            </div>
            <HeroVisual />
          </div>
          <StatsBand />
        </div>
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
          {why.map((w) => (
            <div key={w.t}>
              <span className="w-11 h-11 rounded-xl bg-patina-50 text-patina-700 flex items-center justify-center">
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
          <p className="text-[#C7D2CD] mt-2 max-w-md">{t('home.businessSub')}</p>
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
