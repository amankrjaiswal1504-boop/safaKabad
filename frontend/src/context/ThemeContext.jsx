import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const KEY = 'sm-theme';

function read() {
  try {
    return localStorage.getItem(KEY) || 'light';
  } catch {
    return 'light';
  }
}

// 'light' | 'dark' | 'system'. Light by default; dark only when chosen.
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(read);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0C1110' : '#168045');
  }, [dark]);

  const set = (m) => {
    setMode(m);
    try {
      if (m === 'light') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, m);
    } catch {
      /* ignore */
    }
  };

  return <ThemeContext.Provider value={{ mode, dark, setMode: set, toggle: () => set(dark ? 'light' : 'dark') }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
