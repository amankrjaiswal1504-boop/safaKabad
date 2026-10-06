import { Link } from 'react-router-dom';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { useConfig } from '../context/ConfigContext';
import { useI18n } from '../i18n/I18nContext';
import Logo from './Logo';
import { slugify } from '../utils/format';

export default function Footer() {
  const { cities, config } = useConfig();
  const { t } = useI18n();
  const support = config?.support || {};
  return (
    <footer className="bg-ink text-steel-300 dark:text-[#A3B3AC] mt-20 print:hidden">
      <div className="container-page py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2 max-w-sm">
          <Logo light />
          <p className="mt-4 text-sm leading-relaxed text-[#A3B3AC]">{t('footer.tagline')}</p>
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
              <li className="inline-flex items-center gap-2 text-[#A3B3AC]">
                <Phone className="w-4 h-4" aria-hidden /> Support {support.hoursStart}:00 – {support.hoursEnd}:00, all days
              </li>
            )}
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3 text-sm">{t('footer.company')}</div>
          <ul className="space-y-2 text-sm text-[#A3B3AC]">
            <li><Link className="hover:text-white" to="/how-it-works">{t('nav.howItWorks')}</Link></li>
            <li><Link className="hover:text-white" to="/rates">{t('nav.rates')}</Link></li>
            <li><Link className="hover:text-white" to="/business">{t('nav.business')}</Link></li>
            <li><Link className="hover:text-white" to="/donate">{t('nav.donate')}</Link></li>
            <li><Link className="hover:text-white" to="/referrals/leaderboard">Referral leaderboard</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3 text-sm">{t('footer.support')}</div>
          <ul className="space-y-2 text-sm text-[#A3B3AC]">
            <li><Link className="hover:text-white" to="/how-it-works#faq">FAQ</Link></li>
            <li><Link className="hover:text-white" to="/login">{t('nav.login')}</Link></li>
            <li><Link className="hover:text-white" to="/schedule-pickup">{t('nav.book')}</Link></li>
            <li><Link className="hover:text-white" to="/terms">Terms & privacy</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3 text-sm">{t('footer.cities')}</div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-[#A3B3AC]">
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
        <div className="container-page py-5 flex flex-col sm:flex-row gap-2 justify-between text-xs text-[#8A9A93]">
          <span>© {new Date().getFullYear()} ScrapMate. {t('footer.rights')}</span>
          <span>An independent demo project, not affiliated with any other scrap service.</span>
        </div>
      </div>
    </footer>
  );
}
