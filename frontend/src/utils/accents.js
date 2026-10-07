// One lively accent per scrap category, shared by the rates page and the
// booking item picker. The accent is picked from the category slug, so a
// category keeps its colour everywhere (and admin-added categories get one
// automatically). Classes are written out in full so Tailwind keeps them.
export const ACCENTS = [
  { grad: 'from-violet-400 to-purple-600', btn: 'from-violet-600 to-purple-700', shadow: 'shadow-violet-500/30', soft: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', text: 'text-violet-600 dark:text-violet-400', line: 'from-violet-500', hoverBorder: 'hover:border-violet-300 dark:hover:border-violet-700', selected: 'border-violet-500 ring-4 ring-violet-500/15 bg-violet-50/70 dark:bg-violet-500/10', check: 'bg-violet-600' },
  { grad: 'from-pink-400 to-rose-600', btn: 'from-rose-600 to-rose-700', shadow: 'shadow-rose-500/30', soft: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', text: 'text-rose-600 dark:text-rose-400', line: 'from-rose-500', hoverBorder: 'hover:border-rose-300 dark:hover:border-rose-700', selected: 'border-rose-500 ring-4 ring-rose-500/15 bg-rose-50/70 dark:bg-rose-500/10', check: 'bg-rose-600' },
  { grad: 'from-lime-400 to-green-600', btn: 'from-green-600 to-green-700', shadow: 'shadow-green-500/30', soft: 'bg-lime-50 text-green-700 dark:bg-lime-500/15 dark:text-lime-300', text: 'text-green-600 dark:text-green-400', line: 'from-green-500', hoverBorder: 'hover:border-lime-300 dark:hover:border-lime-700', selected: 'border-green-500 ring-4 ring-green-500/15 bg-lime-50/70 dark:bg-lime-500/10', check: 'bg-green-600' },
  { grad: 'from-sky-400 to-indigo-600', btn: 'from-sky-700 to-indigo-700', shadow: 'shadow-indigo-500/30', soft: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', text: 'text-indigo-600 dark:text-indigo-400', line: 'from-indigo-500', hoverBorder: 'hover:border-sky-300 dark:hover:border-sky-700', selected: 'border-sky-500 ring-4 ring-sky-500/15 bg-sky-50/70 dark:bg-sky-500/10', check: 'bg-sky-700' },
  { grad: 'from-emerald-400 to-teal-600', btn: 'from-emerald-600 to-teal-700', shadow: 'shadow-emerald-600/30', soft: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', text: 'text-emerald-600 dark:text-emerald-400', line: 'from-emerald-500', hoverBorder: 'hover:border-emerald-300 dark:hover:border-emerald-700', selected: 'border-emerald-500 ring-4 ring-emerald-500/15 bg-emerald-50/70 dark:bg-emerald-500/10', check: 'bg-emerald-600' },
  { grad: 'from-yellow-400 to-orange-500', btn: 'from-orange-600 to-orange-700', shadow: 'shadow-orange-500/30', soft: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', text: 'text-orange-600 dark:text-orange-400', line: 'from-orange-500', hoverBorder: 'hover:border-orange-300 dark:hover:border-orange-700', selected: 'border-orange-500 ring-4 ring-orange-500/15 bg-orange-50/70 dark:bg-orange-500/10', check: 'bg-orange-600' },
];

const hash = (s) => [...String(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// Accepts a category object or its slug.
export const accentFor = (cat) => ACCENTS[hash(typeof cat === 'string' ? cat : cat?.slug) % ACCENTS.length];
