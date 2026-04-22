import { useCallback, useEffect, useState } from 'react';
import API_BASE_URL from '../config';
import { tryHandleUnauthorizedResponse } from '../utils/authSession';

const FALLBACK_UNITS = ['шт.', 'уп.', 'комплект', 'метр', 'літр', 'км', 'кв.м'];

export function normalizeUomLabel(value, units) {
  const list = Array.isArray(units) && units.length ? units : FALLBACK_UNITS;
  const s = String(value == null ? '' : value).trim();
  if (list.includes(s)) return s;
  return list[0] || 'шт.';
}

export function useUnitsOfMeasure() {
  const [items, setItems] = useState(FALLBACK_UNITS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/units-of-measure`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (tryHandleUnauthorizedResponse(res)) {
        setLoading(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length) {
          setItems(data.items);
        } else {
          setItems(FALLBACK_UNITS);
        }
      } else {
        setError('Не вдалося завантажити одиниці виміру');
        setItems(FALLBACK_UNITS);
      }
    } catch (e) {
      setError(e.message || 'Помилка');
      setItems(FALLBACK_UNITS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return { units: items, loading, error, reload: load };
}
