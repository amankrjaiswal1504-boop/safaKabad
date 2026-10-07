import { CheckCircle2, Leaf, ShieldCheck, Truck } from 'lucide-react';
import useApi from '../hooks/useApi';
import { useConfig } from '../context/ConfigContext';
import { compact } from '../utils/format';
import { useI18n } from '../i18n/I18nContext';

// Split layout for auth pages: brand panel (desktop) + form card.
export default function AuthShell({ title, subtitle, children, footer }) {
  const { serviceAreas, payoutMethods } = useConfig();
  const { t } = useI18n();
  const { data: stats } = useApi('/scrap/stats');
  const points = [
    serviceAreas.length ? t('auth.pitch1', { n: serviceAreas.length }) : null,
    'Rates you can see before you book',
    'Weighed in front of you, with photos',
    payoutMethods.length ? `Paid instantly: ${payoutMethods.map((m) => m.label).join(', ')}` : null,
  ].filter(Boolean);
  return (
    <div className="container-page py-10 sm:py-16">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-2 rounded-3xl overflow-hidden border border-steel-200/70 shadow-lift bg-surface">
        <div className="hidden lg:flex flex-col justify-between gap-10 bg-gradient-to-br from-[#22a35a] via-[#168045] to-[#0f5f35] text-white p-10 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} aria-hidden />
          <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/10 blur-2xl anim-blob" aria-hidden />
          <div className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-yellow-300/20 blur-3xl anim-blob [animation-delay:-6s]" aria-hidden />
          <div className="relative">
            <h2 className="font-head text-3xl font-bold leading-tight">Turn clutter into cash, without leaving home.</h2>
            <ul className="mt-8 space-y-3 text-white/90">
              {points.map((x) => (
                <li key={x} className="flex items-center gap-2.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-yellow-200 shrink-0" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative space-y-4">
            {stats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4">
                  <Leaf className="w-5 h-5 text-yellow-200" aria-hidden />
                  <div className="font-display text-3xl mt-2 tabular">{compact(stats.kgRecycled)}+</div>
                  <div className="text-xs text-white/75">{t('home.statKg')}</div>
                </div>
                <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur p-4">
                  <Truck className="w-5 h-5 text-yellow-200" aria-hidden />
                  <div className="font-display text-3xl mt-2 tabular">{compact(stats.pickups)}+</div>
                  <div className="text-xs text-white/75">{t('home.statPickups')}</div>
                </div>
              </div>
            )}
            <p className="flex items-center gap-2 text-xs text-white/75">
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden /> Your number is only used for pickup updates. We never share it.
            </p>
          </div>
        </div>
        <div className="p-6 sm:p-10">
          <h1 className="font-head text-2xl sm:text-3xl font-semibold text-steel-900">{title}</h1>
          {subtitle && <p className="text-steel-500 mt-1.5">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-sm text-steel-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
