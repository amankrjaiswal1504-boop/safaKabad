import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { COUNTRY_CENTER, PAYOUT_METHODS } from '../utils/locale';

const ConfigContext = createContext(null);
const CITY_KEY = 'sm-city';

function readCity() {
  try {
    return localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}

const EMPTY = { cities: [], cityList: [], serviceAreas: [], defaultCity: null, support: {}, home: {}, slots: { slots: [] }, features: {}, payments: {}, wallet: {} };
const methodOptions = (values = []) => values.map((v) => PAYOUT_METHODS.find((m) => m.value === v) || { value: v, label: v });

// Public site config from the API: settings, the cities and municipalities we
// serve (admin-managed), payment options and feature flags, plus the visitor's
// chosen city. Nothing about where we operate is hard-coded in the app.
export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [city, setCityState] = useState(readCity() || '');

  const load = useCallback(
    () =>
      api
        .get('/public/config')
        .then((res) => {
          const data = res.data.data;
          setConfig(data);
          const cities = data.cities || [];
          const saved = readCity();
          if (!saved || !cities.includes(saved)) setCityState(data.defaultCity || cities[0] || '');
        })
        .catch(() => setConfig({ ...EMPTY, offline: true })),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(() => {
    const cfg = config || EMPTY;
    const cityList = cfg.cityList || [];
    const serviceAreas = cfg.serviceAreas || [];
    const cityInfo = (name) => cityList.find((c) => c.name === name) || null;
    return {
      config,
      loading: config === null,
      reloadConfig: load,
      cities: cfg.cities || [],
      cityList,
      defaultCity: cfg.defaultCity || null,
      city,
      setCity(next) {
        setCityState(next);
        try {
          localStorage.setItem(CITY_KEY, next);
        } catch {
          /* private mode */
        }
      },
      cityInfo,
      serviceAreas,
      areasFor: (name) => serviceAreas.filter((a) => a.city === name),
      areaById: (id) => serviceAreas.find((a) => String(a._id) === String(id)) || null,
      // Map centre for a city (falls back to the default city, then the country).
      mapCenter(name) {
        const c = cityInfo(name || city) || cityInfo(cfg.defaultCity);
        return c?.center ? [c.center.lat, c.center.lng] : COUNTRY_CENTER;
      },
      provinces: cfg.provinces || [],
      payoutMethods: methodOptions(cfg.payments?.payoutMethods),
      withdrawalMethods: methodOptions(cfg.payments?.withdrawalMethods),
      wallet: cfg.wallet || {},
    };
  }, [config, city, load]);
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  return useContext(ConfigContext);
}
