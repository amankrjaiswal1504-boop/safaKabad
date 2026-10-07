import { useState } from 'react';
import { CheckCircle2, Clock, Headphones, Phone, PhoneCall, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useConfig } from '../context/ConfigContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import api from '../services/api';
import { cx } from './ui';

function toNepaliDigits(str) {
  return String(str).replace(/\d/g, (d) => '०१२३४५६७८९'[d]);
}

function formatPhoneDisplay(raw, lang) {
  if (!raw) return lang === 'ne' ? '९८०१२३४५६७' : '9801234567';
  const clean = String(raw).replace(/\D/g, '');
  let formatted = clean;
  if (clean.length === 10) {
    formatted = `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return lang === 'ne' ? toNepaliDigits(formatted) : formatted;
}

export default function CallCta({ className }) {
  const { config, city } = useConfig();
  const { user } = useAuth();
  const { t, lang } = useI18n();

  const [modalOpen, setModalOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const support = config?.support || {};
  const rawPhone = support.phone || support.whatsappNumber || '9801234567';
  const cleanPhone = String(rawPhone).replace(/[^\d+]/g, '');
  const displayPhone = formatPhoneDisplay(rawPhone, lang);

  const startHour = support.hoursStart ?? 9;
  const endHour = support.hoursEnd ?? 20;
  const currentHour = new Date().getHours();
  const isOnline = currentHour >= startHour && currentHour < endHour;

  function handleButtonClick(e) {
    try {
      api.post('/public/call-click', { city, phone: cleanPhone });
    } catch {}

    // On mobile devices, allow direct tel: dialer invocation
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isMobile) {
      return;
    }

    // On desktop, show classy direct call & instant callback modal
    e.preventDefault();
    setSubmitted(false);
    setErrorMsg('');
    setModalOpen(true);
  }

  async function handleCallbackSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    const clean = phoneInput.replace(/\D/g, '');
    if (!clean || clean.length < 7 || clean.length > 15) {
      setErrorMsg(lang === 'ne' ? 'कृपया मान्य फोन नम्बर राख्नुहोस्' : 'Please enter a valid phone number (e.g. 98XXXXXXXX)');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/public/call-request', {
        phone: clean,
        name: nameInput.trim() || undefined,
        city: city || undefined,
        note: 'Direct callback request from home hero CTA',
      });
      setSubmitted(true);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to submit request. Please try calling directly.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <a
        href={`tel:${cleanPhone}`}
        onClick={handleButtonClick}
        aria-label={`Call SafaKabad at ${displayPhone}`}
        className={cx(
          'call-cta group relative inline-flex items-center gap-3 overflow-hidden rounded-full pl-2.5 pr-5 sm:pr-6 py-2 transition-all duration-300',
          'bg-gradient-to-r from-surface via-[#FAFCFA] to-surface dark:from-steel-900 dark:via-steel-900 dark:to-steel-950',
          'border border-patina-600/30 dark:border-steel-700/80 hover:border-patina-600/80',
          'shadow-[0_6px_20px_-6px_rgba(22,128,69,0.18)] hover:shadow-[0_12px_28px_-6px_rgba(22,128,69,0.3)]',
          'hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-patina-500',
          className
        )}
      >
        {/* Animated Classy Call Logo Emblem */}
        <span className="relative flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-[#22a35a] via-[#168045] to-[#0c4d29] shadow-md ring-1 ring-[#D9B66A]/70 shrink-0">
          {/* Subtle acoustic sound wave pulse */}
          <span className="absolute -inset-1 rounded-full bg-patina-400/25 animate-ping opacity-60 pointer-events-none" aria-hidden />

          {/* Golden metallic handset icon */}
          <PhoneCall
            className="w-4 h-4 text-white drop-shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12"
            aria-hidden
          />

          {/* Live indicator dot */}
          {isOnline && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-patina-500 border-2 border-white dark:border-steel-900 shadow-sm"
              title="Support lines open"
            />
          )}
        </span>

        {/* Text Content */}
        <span className="flex flex-col text-left leading-tight min-w-0">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-patina-700 dark:text-patina-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-patina-500" />
            <span>{lang === 'ne' ? 'सिधै कल गर्नुहोस्' : 'Instant Hotline'}</span>
          </span>
          <span className="font-head font-extrabold text-sm sm:text-base text-steel-900 dark:text-white tracking-tight truncate group-hover:text-rust-700 transition-colors">
            {displayPhone}
          </span>
        </span>
      </a>

      {/* Classy Desktop / Call Request Dialog */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md rounded-3xl bg-surface border border-steel-200/90 dark:border-steel-700 shadow-2xl p-6 sm:p-7 overflow-hidden animate-scale-in">
            {/* Background luxury gradient accents */}
            <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-patina-500/10 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full bg-rust-500/10 blur-2xl pointer-events-none" />

            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full text-steel-400 hover:text-steel-800 hover:bg-steel-100 dark:hover:bg-steel-800 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3.5 mb-5">
              <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#22a35a] to-[#0c4d29] text-white flex items-center justify-center shadow-md ring-2 ring-[#D9B66A]/40 shrink-0">
                <Headphones className="w-6 h-6" />
              </span>
              <div>
                <h3 className="font-head text-lg font-bold text-steel-950 dark:text-white leading-tight">
                  {t('home.callbackTitle')}
                </h3>
                <p className="text-xs text-steel-500 dark:text-steel-400 mt-0.5">
                  {t('home.callbackSubtitle')}
                </p>
              </div>
            </div>

            {/* Direct Call Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-[#EBF8F1]/70 to-[#F5FCF8]/40 dark:from-steel-800/60 dark:to-steel-800/20 border border-patina-200/60 dark:border-steel-700 mb-5 text-center shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-patina-700 dark:text-patina-400 mb-1 flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-patina-500" />
                <span>{t('home.directCall')}</span>
              </div>
              <a
                href={`tel:${cleanPhone}`}
                className="font-head text-2xl sm:text-3xl font-extrabold text-[#116637] dark:text-patina-300 tracking-tight hover:underline inline-flex items-center justify-center gap-2.5 my-1"
              >
                <PhoneCall className="w-6 h-6 text-patina-600 dark:text-patina-400" />
                {displayPhone}
              </a>
              <div className="flex items-center justify-center gap-1.5 text-xs text-steel-500 dark:text-steel-400 mt-1">
                <Clock className="w-3.5 h-3.5 text-steel-400" />
                <span>{t('home.supportHoursLabel', { start: startHour, end: endHour })}</span>
                {isOnline && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-patina-100 text-patina-700">
                    Online
                  </span>
                )}
              </div>
              <div className="mt-3.5">
                <a
                  href={`tel:${cleanPhone}`}
                  className="btn-primary w-full py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-shadow"
                >
                  <Phone className="w-4 h-4" />
                  {t('home.callNow')}
                </a>
              </div>
            </div>

            {/* Callback Request Form */}
            <div className="pt-3 border-t border-steel-100 dark:border-steel-800">
              <div className="text-sm font-bold text-steel-900 dark:text-white mb-1 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>{t('home.requestCallback')}</span>
              </div>
              <p className="text-xs text-steel-500 dark:text-steel-400 mb-3.5">
                {t('home.callbackHint')}
              </p>

              {submitted ? (
                <div className="p-4 rounded-2xl bg-patina-50 dark:bg-patina-950/40 border border-patina-200 dark:border-patina-800 text-patina-800 dark:text-patina-300 text-sm flex items-center gap-3 animate-fade-up">
                  <CheckCircle2 className="w-6 h-6 text-patina-600 dark:text-patina-400 shrink-0" />
                  <div>
                    <div className="font-semibold">{t('home.callbackSuccess')}</div>
                    <div className="text-xs text-patina-700/80 dark:text-patina-400 mt-0.5">
                      {lang === 'ne'
                        ? 'हाम्रा सङ्कलन प्रबन्धकले केही मिनेटमै सम्पर्क गर्नेछन्।'
                        : 'Our pickup manager will connect with you in a few minutes.'}
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCallbackSubmit} className="space-y-3">
                  {errorMsg && (
                    <div className="p-2.5 rounded-xl bg-danger-50 text-danger-700 text-xs font-medium">
                      {errorMsg}
                    </div>
                  )}
                  <div>
                    <input
                      type="tel"
                      required
                      placeholder={t('home.yourPhone') + (lang === 'ne' ? ' (जस्तै: ९८XXXXXXXX)' : ' (e.g. 98XXXXXXXX)')}
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      className="input w-full text-sm py-2.5 rounded-xl"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder={t('home.yourName')}
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="input w-full text-sm py-2.5 rounded-xl"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-secondary w-full py-2.5 text-sm font-semibold rounded-xl disabled:opacity-60 transition-all shadow-sm"
                  >
                    {submitting
                      ? lang === 'ne'
                        ? 'पठाउँदैछ...'
                        : 'Submitting request...'
                      : t('home.submitCallback')}
                  </button>
                </form>
              )}

              {/* Trust badges */}
              <div className="mt-4 pt-3 border-t border-steel-100 dark:border-steel-800 flex items-center justify-around text-[11px] text-steel-500 dark:text-steel-400">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-patina-600" />
                  {lang === 'ne' ? 'निःशुल्क परामर्श' : '100% Free Consultation'}
                </span>
                <span>•</span>
                <span>{lang === 'ne' ? 'तुरुन्त दर जानकारी' : 'Live Scrap Rates'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
