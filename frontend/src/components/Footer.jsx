import { Link } from 'react-router-dom';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { useConfig } from '../context/ConfigContext';
import { useI18n } from '../i18n/I18nContext';
import Logo from './Logo';
import AndroidAppButton from './AndroidAppButton';
import { slugify } from '../utils/format';

export default function Footer() {
  const { cities, config } = useConfig();
  const { t } = useI18n();
  const support = config?.support || {};
  return (
    <footer className="bg-ink text-steel-300 dark:text-[#CFE3D8] mt-20 print:hidden">
      <div className="container-page py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2 max-w-sm">
          <Logo light />
          <p className="mt-4 text-sm leading-relaxed text-[#CFE3D8]">{t('footer.tagline')}</p>
          <ul className="mt-5 space-y-2 text-sm text-[#CFD9D4]">
            {support.whatsappNumber && (
              <li>
                <a className="inline-flex items-center gap-2 hover:text-white" href={`https://wa.me/${support.whatsappNumber}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="w-4 h-4" aria-hidden /> WhatsApp +{support.whatsappNumber}
                </a>
              </li>
            )}
            {support.email && (
              <li>
                <a className="inline-flex items-center gap-2 hover:text-white" href={`mailto:${support.email}`}>
                  <Mail className="w-4 h-4" aria-hidden /> {support.email}
                </a>
              </li>
            )}
            {support.hoursStart != null && (
              <li className="inline-flex items-center gap-2 text-[#CFE3D8]">
                <Phone className="w-4 h-4" aria-hidden /> Support {support.hoursStart}:00 – {support.hoursEnd}:00, all days
              </li>
            )}
          </ul>
          <AndroidAppButton className="mt-6" />
        </div>
        <div>
          <div className="text-white font-semibold mb-3 text-sm">{t('footer.company')}</div>
          <ul className="space-y-2 text-sm text-[#CFE3D8]">
            <li><Link className="hover:text-white" to="/how-it-works">{t('nav.howItWorks')}</Link></li>
            <li><Link className="hover:text-white" to="/rates">{t('nav.rates')}</Link></li>
            <li><Link className="hover:text-white" to="/business">{t('nav.business')}</Link></li>
            <li><Link className="hover:text-white" to="/donate">{t('nav.donate')}</Link></li>
            <li><Link className="hover:text-white" to="/referrals/leaderboard">Referral leaderboard</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3 text-sm">{t('footer.support')}</div>
          <ul className="space-y-2 text-sm text-[#CFE3D8]">
            <li><Link className="hover:text-white" to="/how-it-works#faq">FAQ</Link></li>
            <li><Link className="hover:text-white" to="/login">{t('nav.login')}</Link></li>
            <li><Link className="hover:text-white" to="/schedule-pickup">{t('nav.book')}</Link></li>
            <li><Link className="hover:text-white" to="/terms">Terms & privacy</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3 text-sm">{t('footer.cities')}</div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-[#CFE3D8]">
            {cities.map((c) => (
              <li key={c}>
                <Link className="hover:text-white" to={`/sell-scrap/${slugify(c)}`}>
                  {c}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page py-5 flex flex-col sm:flex-row gap-3 sm:items-center justify-between text-xs text-[#A9C9B8]">
          <span>© {new Date().getFullYear()} SafaKabad. {t('footer.rights')}</span>
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Made in Nepal · Recycling responsibly</span>
            <span className="hidden sm:inline text-white/20" aria-hidden>
              |
            </span>
            <span className="group inline-flex items-center gap-1.5 rounded-full border border-[#D9B66A]/30 bg-white/[0.06] px-3 py-1">
              <span className="text-[#CFE3D8]">Created by</span>
              <span className="font-display italic text-sm font-semibold pr-1 bg-gradient-to-r from-[#F6E3A8] via-[#E2B85A] to-[#F6E3A8] bg-[length:200%_100%] bg-clip-text text-transparent transition-[background-position] duration-700 group-hover:bg-[position:100%_0]">
                Amnn Jaiswal
              </span>
              <span className="text-[#E2B85A]" aria-hidden>
                ✦
              </span>
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
