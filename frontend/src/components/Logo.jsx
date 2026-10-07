import { Link } from 'react-router-dom';

// Professional, classy SafaKabad mark:
// An interlocking circular reuse Möbius loop with emerald and gold gradients,
// representing sustainability, clean circular economy, and value creation.
export function LogoMark({ className = 'w-9 h-9' }) {
  return (
    <svg
      viewBox="0 0 44 44"
      className={`${className} shrink-0 transition-transform duration-300 group-hover:scale-105`}
      aria-hidden
    >
      <defs>
        {/* Deep emerald tile background */}
        <linearGradient id="sk-tile-grad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22a35a" />
          <stop offset="45%" stopColor="#168045" />
          <stop offset="100%" stopColor="#0d522c" />
        </linearGradient>

        {/* Specular hairline top highlight */}
        <linearGradient id="sk-tile-rim" x1="0" y1="0" x2="0" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
        </linearGradient>

        {/* Gold scrap value gradient */}
        <linearGradient id="sk-gold-grad" x1="8" y1="8" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF2D1" />
          <stop offset="50%" stopColor="#E2B85A" />
          <stop offset="100%" stopColor="#B38626" />
        </linearGradient>

        {/* Crisp white pearl ribbon gradient */}
        <linearGradient id="sk-white-grad" x1="12" y1="10" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E2EDE7" />
        </linearGradient>

        {/* Drop shadow for 3D ribbon depth */}
        <filter id="sk-ribbon-shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#082b17" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Rounded tile with subtle drop elevation */}
      <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#sk-tile-grad)" />
      <rect x="2.5" y="2.5" width="39" height="39" rx="10.5" fill="none" stroke="url(#sk-tile-rim)" strokeWidth="1" />

      {/* Inner ambient vignette */}
      <rect x="2" y="2" width="40" height="40" rx="11" fill="none" stroke="#062916" strokeOpacity="0.25" strokeWidth="1.5" />

      {/* Gold Rebirth Ribbon (Lower-Right loop) */}
      <g filter="url(#sk-ribbon-shadow)">
        <path
          d="M22 32.5c5.8 0 10.5-4.7 10.5-10.5 0-3.2-1.4-6-3.7-8l-2.4 2.4c1.6 1.4 2.6 3.4 2.6 5.6 0 4.1-3.4 7.5-7.5 7.5-3 0-5.6-1.8-6.8-4.4l-2.8 1.4c1.7 3.6 5.4 6 10.1 6z"
          fill="url(#sk-gold-grad)"
        />
      </g>

      {/* White Clean Orbit Ribbon with Arrow (Upper-Left loop) */}
      <g filter="url(#sk-ribbon-shadow)">
        {/* Sweeping circular arc */}
        <path
          d="M22 11.5c-5.8 0-10.5 4.7-10.5 10.5 0 3.2 1.4 6 3.7 8l2.4-2.4c-1.6-1.4-2.6-3.4-2.6-5.6 0-4.1 3.4-7.5 7.5-7.5 3 0 5.6 1.8 6.8 4.4l2.8-1.4c-1.7-3.6-5.4-6-10.1-6z"
          fill="url(#sk-white-grad)"
        />
        {/* Dynamic precision arrow heads */}
        <path
          d="M32.5 12.5l-6-2.5v5.5z"
          fill="url(#sk-gold-grad)"
        />
        <path
          d="M11.5 31.5l6 2.5v-5.5z"
          fill="url(#sk-white-grad)"
        />
      </g>

      {/* Center jewel node representing value & pure recycling */}
      <circle cx="22" cy="22" r="3.2" fill="url(#sk-gold-grad)" />
      <circle cx="22" cy="22" r="1.5" fill="#FFFFFF" opacity="0.9" />
    </svg>
  );
}

export default function Logo({ to = '/', light = false }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5 shrink-0 select-none" aria-label="SafaKabad home">
      <LogoMark />
      <span className="font-head font-extrabold text-xl sm:text-[1.35rem] tracking-tight flex items-baseline">
        <span className={light ? 'text-white' : 'text-steel-950 dark:text-white'}>Safa</span>
        <span
          className={`ml-0.5 ${
            light
              ? 'bg-gradient-to-r from-[#F7E7B4] via-[#E2BC63] to-[#F7E7B4] bg-clip-text text-transparent font-bold'
              : 'bg-gradient-to-r from-[#168045] via-[#22a35a] to-[#126b38] bg-clip-text text-transparent'
          }`}
        >
          Kabad
        </span>
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ml-1 mb-1 transition-transform group-hover:scale-125 ${
            light ? 'bg-[#E2BC63]' : 'bg-rust-600'
          }`}
          aria-hidden
        />
      </span>
    </Link>
  );
}
