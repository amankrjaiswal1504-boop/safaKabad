import { useId } from 'react';

// Classic emblem for the AI assistant: an emerald medallion with a fine brass
// ring, an ivory speech bubble and a small gold star. Used on the floating
// chat button and in the chat header.
export default function AssistantMark({ className = 'w-10 h-10' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <radialGradient id={`${id}-g`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#1F8A63" />
          <stop offset="0.55" stopColor="#0F6247" />
          <stop offset="1" stopColor="#083826" />
        </radialGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F6E3A8" />
          <stop offset="0.5" stopColor="#D9B66A" />
          <stop offset="1" stopColor="#A87A2C" />
        </linearGradient>
      </defs>
      {/* Medallion */}
      <circle cx="24" cy="24" r="24" fill={`url(#${id}-g)`} />
      <circle cx="24" cy="24" r="21" fill="none" stroke={`url(#${id}-b)`} strokeWidth="1.4" />
      <circle cx="24" cy="24" r="18.6" fill="none" stroke="#D9B66A" strokeOpacity="0.28" strokeWidth="0.6" />
      {/* Ivory speech bubble */}
      <path d="M15 17.5a3.5 3.5 0 0 1 3.5-3.5h11a3.5 3.5 0 0 1 3.5 3.5v7.5a3.5 3.5 0 0 1-3.5 3.5h-6.2l-4.6 3.9c-.5.4-1.2 0-1.2-.6v-3.3H18.5A3.5 3.5 0 0 1 15 25z" fill="#FBF6E9" />
      {/* Gold four-point star */}
      <path d="M24 16.6c.35 2.1 1.15 2.9 3.25 3.25-2.1.35-2.9 1.15-3.25 3.25-.35-2.1-1.15-2.9-3.25-3.25 2.1-.35 2.9-1.15 3.25-3.25z" fill={`url(#${id}-b)`} />
      <circle cx="27.6" cy="24.7" r="0.9" fill="#C9973F" />
      <circle cx="20.4" cy="24.7" r="0.9" fill="#C9973F" />
      {/* Small sparkle on the rim */}
      <path d="M35.5 10.2c.2 1.1.6 1.5 1.7 1.7-1.1.2-1.5.6-1.7 1.7-.2-1.1-.6-1.5-1.7-1.7 1.1-.2 1.5-.6 1.7-1.7z" fill="#F6E3A8" />
    </svg>
  );
}
