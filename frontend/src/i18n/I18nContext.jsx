import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, ne } from './messages';

const DICTS = { en, ne };
const KEY = 'sm-lang';
const I18nContext = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && DICTS[saved]) return saved;
  } catch {
    /* ignore */
  }
  return navigator.language?.startsWith('ne') ? 'ne' : 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key, vars) => {
      let s = DICTS[lang]?.[key] ?? en[key] ?? key;
      if (vars) Object.entries(vars).forEach(([k, val]) => (s = s.replaceAll(`{${k}}`, String(val))));
      return s;
    },
    [lang]
  );

  const value = useMemo(
    () => ({
      lang,
      t,
      setLang(next) {
        setLangState(next);
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* ignore */
        }
      },
      // Pick the Nepali field of a record when available (e.g. item.nameNe).
      tr: (obj, field = 'name') => (lang === 'ne' && obj?.[`${field}Ne`]) || obj?.[field] || '',
    }),
    [lang, t]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
