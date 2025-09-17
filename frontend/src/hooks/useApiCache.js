import { useState, useEffect, useRef } from 'react';

// Хук для кешування API викликів
export function useApiCache(apiFunction, dependencies = [], cacheTime = 5 * 60 * 1000) { // 5 хвилин за замовчуванням
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cacheRef = useRef({});
  const lastFetchRef = useRef(0);

  useEffect(() => {
    const cacheKey = JSON.stringify(dependencies);
    const now = Date.now();
    
    // Перевіряємо чи є валідний кеш
    if (cacheRef.current[cacheKey] && 
        (now - lastFetchRef.current) < cacheTime) {
      setData(cacheRef.current[cacheKey]);
      return;
    }

    // Виконуємо API виклик
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await apiFunction();
        setData(result);
        cacheRef.current[cacheKey] = result;
        lastFetchRef.current = now;
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, dependencies);

  // Функція для примусового оновлення кешу
  const refetch = async () => {
    const cacheKey = JSON.stringify(dependencies);
    setLoading(true);
    setError(null);
    
    try {
      const result = await apiFunction();
      setData(result);
      cacheRef.current[cacheKey] = result;
      lastFetchRef.current = Date.now();
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, refetch };
}

// Хук для дебаунсингу API викликів
export function useDebouncedApi(apiFunction, delay = 300) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);

  const debouncedCall = async (...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await apiFunction(...args);
        setData(result);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }, delay);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { data, loading, error, debouncedCall };
}
