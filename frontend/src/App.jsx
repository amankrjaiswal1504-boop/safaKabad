import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardList,
  FileClock,
  Gift,
  HandHeart,
  Headphones,
  KanbanSquare,
  Leaf,
  LayoutDashboard,
  MapPin,
  MapPinned,
  Package,
  Repeat,
  Settings,
  ShieldAlert,
  Star,
  Tag,
  Tags,
  Truck,
  User,
  UserCog,
  Users,
  Wallet,
  CalendarClock,
  TrendingUp,
  Landmark,
} from 'lucide-react';
import { AuthProvider } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';
import { ThemeProvider } from './context/ThemeContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import ProtectedRoute from './routes/ProtectedRoute';
import FloatingWidgets from './components/FloatingWidgets';
import ScrollToTop from './components/ScrollToTop';
import { PageFallback } from './components/PageFallback';
import MainLayout from './layouts/MainLayout';
import DashboardLayout from './layouts/DashboardLayout';
import CollectorLayout from './layouts/CollectorLayout';

// Public pages
const Home = lazy(() => import('./pages/Home'));
const Rates = lazy(() => import('./pages/Rates'));
const SellScrapCity = lazy(() => import('./pages/SellScrapCity'));
const HowItWorks = lazy(() => import('./pages/HowItWorks'));
const Business = lazy(() => import('./pages/Business'));
const Donate = lazy(() => import('./pages/Donate'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Terms = lazy(() => import('./pages/Terms'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const SchedulePickup = lazy(() => import('./pages/SchedulePickup'));
const PickupTracking = lazy(() => import('./pages/PickupTracking'));
const Receipt = lazy(() => import('./pages/Receipt'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Customer account
const Overview = lazy(() => import('./pages/account/Overview'));
const MyPickups = lazy(() => import('./pages/account/MyPickups'));
const WalletPage = lazy(() => import('./pages/account/Wallet'));
const Impact = lazy(() => import('./pages/account/Impact'));
const Referrals = lazy(() => import('./pages/account/Referrals'));
const Recurring = lazy(() => import('./pages/account/Recurring'));
const PriceAlerts = lazy(() => import('./pages/account/PriceAlerts'));
const Addresses = lazy(() => import('./pages/account/Addresses'));
const Notifications = lazy(() => import('./pages/account/Notifications'));
const Profile = lazy(() => import('./pages/account/Profile'));

// Collector
const CollectorToday = lazy(() => import('./pages/collector/CollectorToday'));
const CollectorRoute = lazy(() => import('./pages/collector/CollectorRoute'));
const CollectorPickup = lazy(() => import('./pages/collector/CollectorPickup'));
const CollectorEarnings = lazy(() => import('./pages/collector/CollectorEarnings'));
const CollectorSettings = lazy(() => import('./pages/collector/CollectorSettings'));

// Admin
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminDispatch = lazy(() => import('./pages/admin/AdminDispatch'));
const AdminPickups = lazy(() => import('./pages/admin/AdminPickups'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminCollectors = lazy(() => import('./pages/admin/AdminCollectors'));
const AdminStaff = lazy(() => import('./pages/admin/AdminStaff'));
const AdminCatalog = lazy(() => import('./pages/admin/AdminCatalog'));
const AdminPrices = lazy(() => import('./pages/admin/AdminPrices'));
const AdminServiceAreas = lazy(() => import('./pages/admin/AdminServiceAreas'));
const AdminSlots = lazy(() => import('./pages/admin/AdminSlots'));
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons'));
const AdminReviews = lazy(() => import('./pages/admin/AdminReviews'));
const AdminNgos = lazy(() => import('./pages/admin/AdminNgos'));
const AdminBusiness = lazy(() => import('./pages/admin/AdminBusiness'));
const AdminFinance = lazy(() => import('./pages/admin/AdminFinance'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminFraud = lazy(() => import('./pages/admin/AdminFraud'));
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport'));

function CustomerShell() {
  const { t } = useI18n();
  const sections = [
    {
      links: [
        { to: '/dashboard', label: t('dash.overview'), icon: LayoutDashboard, end: true },
        { to: '/pickups', label: t('dash.pickups'), icon: Package, end: true },
        { to: '/wallet', label: t('dash.wallet'), icon: Wallet },
        { to: '/impact', label: t('dash.impact'), icon: Leaf },
        { to: '/referrals', label: t('dash.referrals'), icon: Gift },
      ],
    },
    {
      title: 'Manage',
      links: [
        { to: '/recurring', label: t('dash.recurring'), icon: Repeat },
        { to: '/price-alerts', label: t('dash.alerts'), icon: Bell },
        { to: '/addresses', label: t('dash.addresses'), icon: MapPin },
        { to: '/notifications', label: t('dash.notifications'), icon: Bell },
        { to: '/profile', label: t('dash.profile'), icon: User },
      ],
    },
  ];
  return <DashboardLayout sections={sections} />;
}

const ADMIN_SECTIONS = [
  {
    links: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, perm: ['pickups:read', 'analytics'] },
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics' },
    ],
  },
  {
    title: 'Operations',
    links: [
      { to: '/admin/dispatch', label: 'Dispatch board', icon: KanbanSquare, perm: ['dispatch', 'pickups'] },
      { to: '/admin/pickups', label: 'Pickups', icon: Truck, perm: 'pickups:read' },
      { to: '/admin/collectors', label: 'Collectors', icon: ClipboardList, perm: 'collectors' },
      { to: '/admin/service-areas', label: 'Cities & areas', icon: MapPinned, perm: 'service-areas' },
      { to: '/admin/slots', label: 'Time slots', icon: CalendarClock, perm: '*' },
    ],
  },
  {
    title: 'Catalog',
    links: [
      { to: '/admin/catalog', label: 'Categories & items', icon: Tags, perm: 'catalog' },
      { to: '/admin/prices', label: 'Prices', icon: TrendingUp, perm: 'prices' },
    ],
  },
  {
    title: 'Customers',
    links: [
      { to: '/admin/customers', label: 'Customers', icon: Users, perm: 'users:read' },
      { to: '/admin/business', label: 'Business quotes', icon: Building2, perm: ['users:read', 'payments'] },
      { to: '/admin/reviews', label: 'Reviews', icon: Star, perm: 'reviews' },
      { to: '/admin/support', label: 'Chat & support', icon: Headphones, perm: 'support' },
    ],
  },
  {
    title: 'Growth & finance',
    links: [
      { to: '/admin/coupons', label: 'Coupons', icon: Tag, perm: 'coupons' },
      { to: '/admin/finance', label: 'Payouts & wallet', icon: Landmark, perm: ['withdrawals', 'payments'] },
      { to: '/admin/ngos', label: 'NGO partners', icon: HandHeart, perm: '*' },
    ],
  },
  {
    title: 'System',
    links: [
      { to: '/admin/staff', label: 'Staff & roles', icon: UserCog, perm: '*' },
      { to: '/admin/fraud', label: 'Fraud & abuse', icon: ShieldAlert, perm: ['users', 'pickups'] },
      { to: '/admin/audit-log', label: 'Audit log', icon: FileClock, perm: '*' },
      { to: '/admin/settings', label: 'Site settings', icon: Settings, perm: '*' },
    ],
  },
];

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <I18nProvider>
          <ConfigProvider>
            <AuthProvider>
              <RealtimeProvider>
                <ScrollToTop />
                <Toaster position="top-center" toastOptions={{ className: '!bg-surface !text-steel-900 !shadow-lift !rounded-xl !text-sm', duration: 3500 }} />
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route element={<MainLayout />}>
                      <Route path="/" element={<Home />} />
                      <Route path="/rates" element={<Rates />} />
                      <Route path="/sell-scrap/:city" element={<SellScrapCity />} />
                      <Route path="/how-it-works" element={<HowItWorks />} />
                      <Route path="/business" element={<Business />} />
                      <Route path="/donate" element={<Donate />} />
                      <Route path="/referrals/leaderboard" element={<Leaderboard />} />
                      <Route path="/terms" element={<Terms />} />
                      <Route path="/login" element={<Login />} />
                      <Route path="/register" element={<Register />} />
                      <Route path="/forgot-password" element={<ForgotPassword />} />
                      <Route path="/reset-password/:token" element={<ResetPassword />} />
                      <Route path="/schedule-pickup" element={<SchedulePickup />} />
                      <Route path="/pickups/:id" element={<ProtectedRoute><PickupTracking /></ProtectedRoute>} />
                      <Route path="/receipt/:id" element={<ProtectedRoute><Receipt /></ProtectedRoute>} />
                    </Route>

                    <Route element={<ProtectedRoute roles={['customer']}><CustomerShell /></ProtectedRoute>}>
                      <Route path="/dashboard" element={<Overview />} />
                      <Route path="/pickups" element={<MyPickups />} />
                      <Route path="/wallet" element={<WalletPage />} />
                      <Route path="/impact" element={<Impact />} />
                      <Route path="/referrals" element={<Referrals />} />
                      <Route path="/recurring" element={<Recurring />} />
                      <Route path="/price-alerts" element={<PriceAlerts />} />
                      <Route path="/addresses" element={<Addresses />} />
                      <Route path="/notifications" element={<Notifications />} />
                      <Route path="/profile" element={<Profile />} />
                    </Route>

                    <Route element={<ProtectedRoute roles={['collector']}><CollectorLayout /></ProtectedRoute>}>
                      <Route path="/collector" element={<CollectorToday />} />
                      <Route path="/collector/route" element={<CollectorRoute />} />
                      <Route path="/collector/pickups/:id" element={<CollectorPickup />} />
                      <Route path="/collector/earnings" element={<CollectorEarnings />} />
                      <Route path="/collector/settings" element={<CollectorSettings />} />
                    </Route>

                    <Route element={<ProtectedRoute roles={['admin', 'staff']}><DashboardLayout sections={ADMIN_SECTIONS} wide /></ProtectedRoute>}>
                      <Route path="/admin" element={<AdminDashboard />} />
                      <Route path="/admin/analytics" element={<AdminAnalytics />} />
                      <Route path="/admin/dispatch" element={<AdminDispatch />} />
                      <Route path="/admin/pickups" element={<AdminPickups />} />
                      <Route path="/admin/customers" element={<AdminCustomers />} />
                      <Route path="/admin/users" element={<Navigate to="/admin/customers" replace />} />
                      <Route path="/admin/collectors" element={<AdminCollectors />} />
                      <Route path="/admin/staff" element={<AdminStaff />} />
                      <Route path="/admin/catalog" element={<AdminCatalog />} />
                      <Route path="/admin/prices" element={<AdminPrices />} />
                      <Route path="/admin/service-areas" element={<AdminServiceAreas />} />
                      <Route path="/admin/slots" element={<AdminSlots />} />
                      <Route path="/admin/coupons" element={<AdminCoupons />} />
                      <Route path="/admin/reviews" element={<AdminReviews />} />
                      <Route path="/admin/ngos" element={<AdminNgos />} />
                      <Route path="/admin/business" element={<AdminBusiness />} />
                      <Route path="/admin/finance" element={<AdminFinance />} />
                      <Route path="/admin/fraud" element={<AdminFraud />} />
                      <Route path="/admin/audit-log" element={<AdminAuditLog />} />
                      <Route path="/admin/settings" element={<AdminSettings />} />
                      <Route path="/admin/support" element={<AdminSupport />} />
                      <Route path="/admin/reports" element={<Navigate to="/admin/analytics" replace />} />
                    </Route>

                    <Route element={<MainLayout />}>
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </Suspense>
                {/* Outside the layouts so the widgets appear on every page */}
                <FloatingWidgets />
              </RealtimeProvider>
            </AuthProvider>
          </ConfigProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

