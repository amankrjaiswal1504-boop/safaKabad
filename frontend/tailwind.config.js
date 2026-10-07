/** @type {import('tailwindcss').Config} */
// Colours are CSS variables (see src/index.css) so the whole app switches to
// dark mode by toggling the `dark` class on <html>. The steel scale inverts in
// dark mode: `text-steel-900` stays "strongest text", `bg-steel-50` stays "page".
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, steps) => Object.fromEntries(steps.map((s) => [s, v(`${name}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        steel: scale('steel', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        rust: scale('rust', [50, 100, 200, 500, 600, 700, 800]),
        patina: scale('patina', [50, 100, 200, 500, 600, 700, 800]),
        amber: scale('amber', [50, 100, 600, 700]),
        danger: scale('danger', [50, 100, 600, 700]),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        ink: v('ink'), // always-dark band (hero, footer) in both themes
        'ink-2': v('ink-2'),
        viz: { 1: v('viz-1'), 2: v('viz-2'), grid: v('viz-grid') },
      },
      fontFamily: {
        head: ['"Plus Jakarta Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', '"Noto Sans Devanagari"', 'Georgia', 'serif'],
        body: ['"Inter"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 28 24 / 0.04), 0 4px 16px -8px rgb(16 28 24 / 0.08)',
        lift: '0 24px 48px -20px rgb(14 31 26 / 0.30), 0 2px 6px rgb(14 31 26 / 0.05)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
      keyframes: {
        'widget-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'chat-in': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pulse2: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.45' } },
      },
      animation: {
        'widget-in': 'widget-in 300ms ease-out both',
        'chat-in': 'chat-in 200ms ease-out both',
        'fade-up': 'fade-up 300ms ease-out both',
        shimmer: 'shimmer 1.4s infinite',
        pulse2: 'pulse2 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
