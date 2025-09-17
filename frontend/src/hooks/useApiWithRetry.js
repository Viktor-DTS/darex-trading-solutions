import { useState, useCallback, useRef } from 'react';

// Хук для API викликів з retry логікою та кешуванням
export function useApiWithRetry(apiFunction, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    cacheTime = 5 * 60 * 1000, // 5 хвилин
    enableCache = true
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const cacheRef = useRef({});
  const retryCountRef = useRef(0);

  const executeWithRetry = useCallback(async (...args) => {
    const cacheKey = enableCache ? JSON.stringify(args) : null;
    const now = Date.now();

    // Перевіряємо кеш
    if (enableCache && cacheKey && cacheRef.current[cacheKey]) {
      const cached = cacheRef.current[cacheKey];
      if (now - cached.timestamp < cacheTime) {
        setData(cached.data);
        return cached.data;
      }
    }

    setLoading(true);
    setError(null);

    const attempt = async (retryCount = 0) => {
      try {
        const result = await apiFunction(...args);
        
        // Зберігаємо в кеш
        if (enableCache && cacheKey) {
          cacheRef.current[cacheKey] = {
            data: result,
            timestamp: now
          };
        }

        setData(result);
        retryCountRef.current = 0;
        return result;
      } catch (err) {
        if (retryCount < maxRetries) {
          // Експоненційна затримка
          const delay = retryDelay * Math.pow(2, retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));
          return attempt(retryCount + 1);
        } else {
          setError(err);
          retryCountRef.current = retryCount;
          throw err;
        }
      } finally {
        setLoading(false);
      }
    };

    return attempt();
  }, [apiFunction, maxRetries, retryDelay, cacheTime, enableCache]);

  const clearCache = useCallback(() => {
    cacheRef.current = {};
  }, []);

  const getCacheSize = useCallback(() => {
    return Object.keys(cacheRef.current).length;
  }, []);

  return {
    data,
    loading,
    error,
    execute: executeWithRetry,
    clearCache,
    getCacheSize,
    retryCount: retryCountRef.current
  };
}

// Хук для batch API викликів
export function useBatchApi(apiFunction, batchSize = 10, delay = 100) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const queueRef = useRef([]);
  const timeoutRef = useRef(null);

  const addToQueue = useCallback((item) => {
    queueRef.current.push(item);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      if (queueRef.current.length === 0) return;

      const batch = queueRef.current.splice(0, batchSize);
      setLoading(true);
      setError(null);

      try {
        const results = await Promise.all(
          batch.map(item => apiFunction(item))
        );
        
        setData(prev => [...prev, ...results]);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }

      // Обробляємо наступний batch якщо є
      if (queueRef.current.length > 0) {
        setTimeout(() => addToQueue(null), delay);
      }
    }, delay);
  }, [apiFunction, batchSize, delay]);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    addToQueue,
    clearQueue,
    queueSize: queueRef.current.length
  };
}
