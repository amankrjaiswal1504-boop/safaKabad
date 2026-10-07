import { Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Truck } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { PageFallback } from '../components/PageFallback';
import { useConfig } from '../context/ConfigContext';

// Sticky "Book pickup" bar on phones (hidden on the booking/auth pages).
function MobileBookBar() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { pathname } = useLocation();
  if (user && user.role !== 'customer') return null;
  if (/^\/(schedule-pickup|login|register|forgot-password|reset-password|pickups\/)/.test(pathname)) return null;
  return (
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-steel-100 px-4 pt-3 print:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <Link to="/schedule-pickup" className="btn-primary w-[calc(100%-76px)] !py-3">
        <Truck className="w-4 h-4" aria-hidden /> {t('nav.book')}
      </Link>
    </div>
  );
}

function Banner() {
  const { config } = useConfig();
  const banner = config?.home?.banners?.find((b) => b.active);
  if (!banner) return null;
  return (
    <div className="bg-gradient-to-r from-[#0f5f35] via-[#168045] to-[#0f5f35] text-white text-center text-xs sm:text-sm py-2 px-4 print:hidden">
      {banner.link ? (
        <Link to={banner.link} className="hover:underline">
          {banner.text} →
        </Link>
      ) : (
        banner.text
      )}
    </div>
  );
}

export default function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-surface">
        Skip to content
      </a>
      <Banner />
      <Navbar />
      <main id="main" className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <MobileBookBar />
    </div>
  );
}
