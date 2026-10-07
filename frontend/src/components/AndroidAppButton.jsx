import { cx } from './ui';

// Where the latest Android APK lives (built by .github/workflows/android.yml).
// Override with VITE_ANDROID_APP_URL, e.g. after publishing to Google Play.
export const ANDROID_APP_URL =
  import.meta.env.VITE_ANDROID_APP_URL || 'https://github.com/amankrjaiswal1504-boop/safaKabad/releases/latest/download/SafaKabad.apk';

// True inside our own Android app (Capacitor appends "SafaKabadApp" to the user agent).
export const inAndroidApp = () => typeof navigator !== 'undefined' && /SafaKabadApp/.test(navigator.userAgent);
const isIos = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

function AndroidLogo({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.86 3.22a11.4 11.4 0 0 0-9.84 0L5.22 5.92a.38.38 0 0 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"
      />
    </svg>
  );
}

// "Get the Android app" badge. Hidden inside the app itself and on iPhone.
export default function AndroidAppButton({ className, tone = 'dark' }) {
  if (inAndroidApp() || isIos()) return null;
  return (
    <a
      href={ANDROID_APP_URL}
      rel="noopener"
      className={cx(
        'group inline-flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all hover:-translate-y-0.5',
        tone === 'dark' ? 'bg-black/40 border border-white/15 text-white hover:border-[#D9B66A]/60' : 'bg-ink text-white border border-transparent hover:shadow-lift',
        className
      )}
      aria-label="Download the SafaKabad Android app (APK)"
    >
      <AndroidLogo className="w-7 h-7 text-[#7FD3A8] transition-transform group-hover:-rotate-6" />
      <span className="leading-tight text-left">
        <span className="block text-[10px] uppercase tracking-[0.14em] text-white/60">Free download</span>
        <span className="block font-semibold text-[15px]">Android app</span>
      </span>
    </a>
  );
}
