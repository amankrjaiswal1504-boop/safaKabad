import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, Globe, LayoutDashboard, LogOut, MapPin, Menu, Moon, Sun, User, X } from 'lucide-react';
import { useAuth, homePathFor } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../i18n/I18nContext';
import { useRealtime } from '../context/RealtimeContext';
import Logo from './Logo';
import { Avatar, cx } from './ui';
import { timeAgo } from '../utils/format';

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOutside();
    const k = (e) => e.key === 'Escape' && onOutside();
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [ref, onOutside]);
}

function Dropdown({ button, children, align = 'right', label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      {button({ open, toggle: () => setOpen((o) => !o), label })}
      {open && (
        <div
          className={cx('absolute top-full mt-2 z-50 min-w-[14rem] rounded-xl border border-steel-100 bg-surface shadow-lift py-1.5 animate-fade-up', align === 'right' ? 'right-0' : 'left-0')}
          onClick={(e) => e.target.closest('[data-close]') && setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function CitySelect({ compact }) {
  const { cityList, city, setCity } = useConfig();
  const { t, lang } = useI18n();
  // Cities come from Admin > Service areas; nothing to choose until one exists.
  if (!cityList.length) return null;
  return (
    <label className={cx('relative inline-flex items-center gap-1.5 text-sm text-steel-700 rounded-lg hover:bg-steel-100 cursor-pointer', compact ? 'px-2 py-1.5' : 'px-2.5 py-2')}>
      <MapPin className="w-4 h-4 text-rust-600" aria-hidden />
      <span className="sr-only">{t('nav.city')}</span>
      <select
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className="appearance-none bg-transparent pr-4 font-medium text-steel-900 cursor-pointer focus:outline-none"
      >
        {cityList.map((c) => (
          <option key={c.name} value={c.name}>
            {(lang === 'ne' && c.nameNe) || c.name}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 absolute right-2 pointer-events-none text-steel-500" aria-hidden />
    </label>
  );
}

function NotificationBell() {
  const { notifications, unread, markRead } = useRealtime();
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <Dropdown
      label={t('nav.notifications')}
      button={({ toggle }) => (
        <button type="button" onClick={toggle} className="relative w-9 h-9 inline-flex items-center justify-center rounded-lg text-steel-600 hover:bg-steel-100" aria-label={`${t('nav.notifications')}${unread ? ` (${unread} unread)` : ''}`}>
          <Bell className="w-[18px] h-[18px]" aria-hidden />
          {unread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rust-600 text-white text-[10px] font-semibold leading-4 text-center">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
    >
      <div className="w-80 max-w-[90vw]">
        <div className="flex justify-between items-center px-4 py-2 border-b border-steel-100">
          <span className="font-medium text-sm">{t('nav.notifications')}</span>
          {unread > 0 && (
            <button className="text-xs link" onClick={() => markRead('all')}>
              {t('nav.markAllRead')}
            </button>
          )}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {!notifications.length && <li className="px-4 py-8 text-center text-sm text-steel-500">{t('nav.noNotifications')}</li>}
          {notifications.slice(0, 15).map((n) => (
            <li key={n._id}>
              <button
                data-close
                className={cx('w-full text-left px-4 py-3 hover:bg-steel-50 flex gap-3', !n.read && 'bg-rust-50/60')}
                onClick={() => {
                  if (!n.read) markRead(n._id);
                  if (n.link) navigate(n.link);
                }}
              >
                <span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', n.read ? 'bg-transparent' : 'bg-rust-600')} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-steel-900">{n.title}</span>
                  <span className="block text-xs text-steel-500 line-clamp-2">{n.body}</span>
                  <span className="block text-[11px] text-steel-400 mt-0.5">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dropdown>
  );
}

export function PreferenceButtons() {
  const { dark, toggle } = useTheme();
  const { lang, setLang, t } = useI18n();
  return (
    <>
      <button
        type="button"
        onClick={() => setLang(lang === 'en' ? 'ne' : 'en')}
        className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-steel-700 hover:bg-steel-100"
        aria-label={`${t('nav.language')}: ${lang === 'en' ? 'English' : 'नेपाली'}`}
        title={t('nav.language')}
      >
        <Globe className="w-4 h-4" aria-hidden />
        {lang === 'en' ? 'ने' : 'EN'}
      </button>
      <button type="button" onClick={toggle} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-steel-600 hover:bg-steel-100" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={t('nav.theme')}>
        {dark ? <Sun className="w-[18px] h-[18px]" aria-hidden /> : <Moon className="w-[18px] h-[18px]" aria-hidden />}
      </button>
    </>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <Dropdown
      button={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 sm:gap-2 rounded-lg pl-1 pr-1.5 sm:pr-2 py-1 hover:bg-steel-100 focus:outline-none"
          aria-label="Account menu"
        >
          <Avatar name={user.name} size="sm" />
          <span className="hidden lg:block text-sm font-medium text-steel-900 max-w-[8rem] truncate">{user.name.split(' ')[0]}</span>
          <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-steel-500" aria-hidden />
        </button>
      )}
    >
      <div className="px-4 py-2 border-b border-steel-100">
        <div className="text-sm font-medium text-steel-900 truncate">{user.name}</div>
        <div className="text-xs text-steel-500 truncate">{user.email || user.phone}</div>
      </div>
      <Link data-close to={homePathFor(user)} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-steel-50">
        <LayoutDashboard className="w-4 h-4 text-steel-500" aria-hidden /> {t('nav.dashboard')}
      </Link>
      {user.role === 'customer' ? (
        <Link data-close to="/profile" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-steel-50">
          <User className="w-4 h-4 text-steel-500" aria-hidden /> {t('dash.profile')}
        </Link>
      ) : user.role === 'collector' ? (
        <Link data-close to="/collector/settings" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-steel-50">
          <User className="w-4 h-4 text-steel-500" aria-hidden /> {t('dash.profile')}
        </Link>
      ) : (
        <Link data-close to="/admin/settings" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-steel-50">
          <User className="w-4 h-4 text-steel-500" aria-hidden /> {t('dash.profile')}
        </Link>
      )}
      <button
        data-close
        className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-steel-50 text-danger-600"
        onClick={async () => {
          await logout();
          navigate('/');
        }}
      >
        <LogOut className="w-4 h-4" aria-hidden /> {t('nav.logout')}
      </button>
    </Dropdown>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [location.pathname]);

  const links = [
    { to: '/rates', label: t('nav.rates') },
    { to: '/how-it-works', label: t('nav.howItWorks') },
    { to: '/business', label: t('nav.business') },
    { to: '/donate', label: t('nav.donate') },
  ];
  const navCls = ({ isActive }) => cx('px-3 py-2 rounded-lg text-sm font-medium transition-colors', isActive ? 'text-rust-700 bg-rust-50' : 'text-steel-700 hover:text-steel-900 hover:bg-steel-100');

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-steel-100 print:hidden">
      <div className="container-page h-16 flex items-center gap-3">
        <Logo />
        <div className="hidden md:block ml-1">
          <CitySelect />
        </div>
        <nav className="hidden lg:flex items-center gap-0.5 ml-2" aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={navCls}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-1">
            <PreferenceButtons />
          </div>
          {user && <NotificationBell />}
          {user ? (
            <UserMenu />
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-steel-700 hover:text-steel-900 hover:bg-steel-100 transition-colors"
            >
              <User className="w-4 h-4 text-steel-600" aria-hidden />
              <span>{t('nav.login')}</span>
            </Link>
          )}
          {(!user || user.role === 'customer') && (
            <Link to="/schedule-pickup" className="hidden md:inline-flex btn-primary text-sm !py-2">
              {t('nav.book')}
            </Link>
          )}
          <button type="button" className="lg:hidden w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-steel-100" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
            {open ? <X className="w-5 h-5" aria-hidden /> : <Menu className="w-5 h-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-steel-100 bg-surface animate-fade-up">
          <div className="container-page py-4 space-y-2">
            <div className="flex items-center justify-between pb-3 mb-1 border-b border-steel-100">
              <CitySelect compact />
              <div className="flex items-center gap-1">
                <PreferenceButtons />
              </div>
            </div>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cx('block px-3 py-2.5 rounded-lg font-medium', isActive ? 'bg-rust-50 text-rust-700' : 'text-steel-800 hover:bg-steel-100')}>
                {l.label}
              </NavLink>
            ))}
            {user ? (
              <div className="pt-3 mt-2 border-t border-steel-100 space-y-2.5">
                <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-steel-50">
                  <Avatar name={user.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-steel-900 truncate">{user.name}</div>
                    <div className="text-xs text-steel-500 truncate">{user.email || user.phone}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link to={homePathFor(user)} className="btn-outline text-sm text-center py-2 flex items-center justify-center gap-1.5">
                    <LayoutDashboard className="w-4 h-4 text-steel-500" aria-hidden />
                    {t('nav.dashboard')}
                  </Link>
                  <Link
                    to={user.role === 'customer' ? '/profile' : user.role === 'collector' ? '/collector/settings' : '/admin/settings'}
                    className="btn-outline text-sm text-center py-2 flex items-center justify-center gap-1.5"
                  >
                    <User className="w-4 h-4 text-steel-500" aria-hidden />
                    {t('dash.profile')}
                  </Link>
                </div>
                <button
                  type="button"
                  className="w-full btn-ghost text-sm text-danger-600 hover:bg-danger-50 flex items-center justify-center gap-2 py-2"
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                >
                  <LogOut className="w-4 h-4" aria-hidden />
                  {t('nav.logout')}
                </button>
              </div>
            ) : (
              <div className="pt-3 mt-2 border-t border-steel-100 flex gap-2">
                <Link to="/login" className="btn-outline flex-1 text-sm text-center">
                  {t('nav.login')}
                </Link>
                <Link to="/register" className="btn-secondary flex-1 text-sm text-center">
                  {t('nav.signup')}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
