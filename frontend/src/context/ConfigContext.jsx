import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { DEFAULT_CITY } from '../utils/locale';

const ConfigContext = createContext(null);
const CITY_KEY = 'sm-city';

function readCity() {
  try {
    return localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}

// Public site config (CMS settings, cities, feature flags) + the visitor's city.
export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [city, setCityState] = useState(readCity() || DEFAULT_CITY);

  useEffect(() => {
    api
      .get('/public/config')
      .then((res) => {
        setConfig(res.data.data);
        const cities = res.data.data.cities || [];
        if (cities.length && !cities.includes(readCity() || '')) setCityState(cities.includes(DEFAULT_CITY) ? DEFAULT_CITY : cities[0]);
      })
      .catch(() => setConfig({ cities: [DEFAULT_CITY], support: {}, home: {}, slots: { slots: [] }, features: {} }));
  }, []);

  const value = useMemo(
    () => ({
      config,
      cities: config?.cities || [],
      city,
      setCity(next) {
        setCityState(next);
        try {
          localStorage.setItem(CITY_KEY, next);
        } catch {
          /* private mode */
        }
      },
    }),
    [config, city]
  );
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  return useContext(ConfigContext);
}
