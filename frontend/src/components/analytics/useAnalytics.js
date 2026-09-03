/**
 * Завантаження зрізів аналітики.
 *
 * Кожна вкладка тягне лише свій ендпоінт і лише коли її відкрили. Плюс кеш у
 * пам'яті на час сеансу: перемикання між уже відкритими вкладками не робить
 * жодного запиту, а «Оновити» скидає кеш і просить сервер порахувати заново.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import API_BASE_URL from '../../config.js';

const cache = new Map();

function buildQuery(filters, force) {
  const params = new URLSearchParams();
  if (filters.year) params.set('year', String(filters.year));
  if (filters.period) params.set('period', filters.period);
  if (filters.period === 'month' && filters.month) params.set('month', String(filters.month));
  if (filters.period === 'quarter' && filters.quarter) params.set('quarter', String(filters.quarter));
  if (filters.region) params.set('region', filters.region);
  if (filters.company) params.set('company', filters.company);
  if (filters.basis) params.set('basis', filters.basis);
  if (force) params.set('force', '1');
  return params.toString();
}

/** Ключ кешу не залежить від force — інакше оновлення плодило б окремі записи. */
export function analyticsKey(section, filters) {
  return `${section}?${buildQuery(filters, false)}`;
}

export function clearAnalyticsCache() {
  cache.clear();
}

async function request(section, filters, { force, signal }) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE_URL}/analytics/${section}?${buildQuery(filters, force)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!res.ok) {
    let message = `Сервер відповів ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* тіло не JSON — залишаємо код статусу */
    }
    throw new Error(message);
  }
  return res.json();
}

/**
 * @param section  назва ендпоінта аналітики
 * @param filters  поточні фільтри періоду/регіону
 * @param enabled  false, поки вкладку не відкрито — тоді запиту не буде
 */
export function useAnalytics(section, filters, { enabled = true, reloadToken = 0 } = {}) {
  const key = analyticsKey(section, filters);
  const [state, setState] = useState(() => {
    const hit = cache.get(key);
    return hit ? { data: hit, loading: false, error: null } : { data: null, loading: enabled, error: null };
  });
  const abortRef = useRef(null);

  const load = useCallback(async ({ force = false } = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!force) {
      const hit = cache.get(key);
      if (hit) {
        setState({ data: hit, loading: false, error: null });
        return;
      }
    }

    setState((prev) => ({ data: force ? prev.data : null, loading: true, error: null }));
    try {
      const json = await request(section, filters, { force, signal: controller.signal });
      cache.set(key, json);
      setState({ data: json, loading: false, error: null });
    } catch (error) {
      if (error.name === 'AbortError') return;
      setState({ data: null, loading: false, error: error.message || 'Не вдалося завантажити дані' });
    }
    // filters розкладені в key, тому окремо в залежності не йдуть
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, section]);

  const seenTokenRef = useRef(reloadToken);

  useEffect(() => {
    if (!enabled) return undefined;
    // Зміна reloadToken — це натиснуте «Оновити»: тягнемо в обхід кешу.
    const force = reloadToken !== seenTokenRef.current;
    seenTokenRef.current = reloadToken;
    load({ force });
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, reloadToken]);

  return { ...state, reload: () => load({ force: true }) };
}

/** Довідники фільтрів живуть довго — тягнемо один раз на сеанс. */
export function useAnalyticsOptions() {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await request('options', {}, {});
        if (alive) setOptions(json.options || null);
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { options, error };
}
