import { Link } from 'react-router-dom';

// Original ScrapMate mark: a rounded emerald tile with a circular "loop" arrow
// suggesting reuse.
export function LogoMark({ className = 'w-9 h-9' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#0F6247" />
      <path d="M27.5 15.5a9 9 0 1 0 1.4 8.2" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M29.6 10.5v6.2h-6.2" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="3" fill="#E9D9B4" />
    </svg>
  );
}

export default function Logo({ to = '/', light = false }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 shrink-0" aria-label="ScrapMate home">
      <LogoMark />
      <span className={`font-head font-bold text-xl tracking-tight ${light ? 'text-white' : 'text-steel-900'}`}>
        Scrap<span className={light ? 'text-[#D9B66A]' : 'text-rust-600'}>Mate</span>
      </span>
    </Link>
  );
}
