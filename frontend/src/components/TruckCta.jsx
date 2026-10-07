import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cx } from './ui';

// Classic side-view pickup truck carrying a small load of scrap.
function PickupTruck({ className }) {
  return (
    <svg viewBox="0 0 64 34" className={className} aria-hidden>
      {/* Load in the bed */}
      <rect x="7" y="6" width="9" height="7" rx="1" fill="#D9B66A" />
      <rect x="8.5" y="7.5" width="6" height="1.2" rx=".6" fill="#A87A2C" />
      <path d="M17 13l3-6.5 3.5 1.5L21 13z" fill="#E9EEF0" />
      <rect x="24" y="8" width="8" height="5" rx="1.2" fill="#7FD3A8" />
      {/* Bed and cab */}
      <rect x="4" y="13" width="31" height="11" rx="2" fill="#0F6247" />
      <path d="M34 24V11.5a1.5 1.5 0 0 1 1.5-1.5H46l7.6 7.2c.9.8 1.4 2 1.4 3.2V24z" fill="#1F8A63" />
      <path d="M37 12.5h8.2l5.4 5.1H37z" fill="#FBF6E9" opacity=".92" />
      <rect x="4" y="19" width="51" height="1.6" fill="#D9B66A" />
      <rect x="53.5" y="18.6" width="2.4" height="2.4" rx="1.2" fill="#FDE68A" />
      <rect x="2" y="22.4" width="3.2" height="1.4" rx=".7" fill="#4B5563" />
      {/* Wheels */}
      {[14, 46].map((cx) => (
        <g key={cx} className="truck-wheel">
          <circle cx={cx} cy="26" r="5.2" fill="#171F1C" />
          <circle cx={cx} cy="26" r="2.4" fill="#D9B66A" />
          <path d={`M${cx} 21.6v8.8M${cx - 4.4} 26h8.8`} stroke="#3C4441" strokeWidth=".9" />
        </g>
      ))}
    </svg>
  );
}

// "Book a free pickup" button: the truck idles (rumbles) until clicked, then
// drives straight off and we open the booking page.
export default function TruckCta({ to = '/schedule-pickup', label, goingLabel = 'On our way…', className }) {
  const navigate = useNavigate();
  const ref = useRef(null);
  const [driving, setDriving] = useState(false);

  function onClick(e) {
    // Let new-tab / modified clicks behave like a normal link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (driving) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return navigate(to);
    ref.current?.style.setProperty('--drive', `${(ref.current?.offsetWidth || 260) + 40}px`);
    setDriving(true);
    setTimeout(() => navigate(to), 950);
  }

  return (
    <Link
      ref={ref}
      to={to}
      onClick={onClick}
      aria-label={label}
      className={cx(
        'truck-cta group relative inline-flex items-center gap-3 overflow-hidden rounded-full pl-3 pr-6 py-2.5 text-base font-semibold text-white',
        'bg-gradient-to-r from-[#22a35a] via-[#168045] to-[#116637] ring-1 ring-[#D9B66A]/60 shadow-[0_10px_30px_-10px_rgb(22_128_69/0.7)]',
        'transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-12px_rgb(22_128_69/0.85)] hover:ring-[#D9B66A]',
        driving && 'is-driving',
        className
      )}
    >
      {/* Sheen */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" aria-hidden />
      {/* Road line */}
      <span className="pointer-events-none absolute left-3 right-3 bottom-1.5 h-px bg-[repeating-linear-gradient(90deg,rgb(217_182_106/0.55)_0_8px,transparent_8px_14px)] truck-road" aria-hidden />

      <span className="relative z-10 w-16 h-9 shrink-0" aria-hidden>
        <span className="truck-body absolute inset-0">
          <PickupTruck className="w-full h-full drop-shadow-[0_2px_2px_rgb(0_0_0/0.35)]" />
          {/* Exhaust puffs */}
          <span className="truck-puff absolute left-[1px] bottom-[11px] w-1.5 h-1.5 rounded-full bg-white/60" />
          <span className="truck-puff absolute left-[1px] bottom-[11px] w-1.5 h-1.5 rounded-full bg-white/45 [animation-delay:.5s]" />
          {/* Speed lines while driving */}
          <span className="truck-speed absolute -left-6 top-3 w-5 h-px rounded-full bg-[#F6E3A8]/70" />
          <span className="truck-speed absolute -left-8 top-5 w-6 h-px rounded-full bg-[#F6E3A8]/70 [animation-delay:.08s]" />
        </span>
      </span>

      <span className="relative grid">
        <span className="truck-label col-start-1 row-start-1 inline-flex items-center gap-2 whitespace-nowrap">
          {label}
          <span className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
            →
          </span>
        </span>
        <span className="truck-going col-start-1 row-start-1 whitespace-nowrap text-[#F6E3A8]" aria-hidden>
          {goingLabel}
        </span>
      </span>
    </Link>
  );
}
