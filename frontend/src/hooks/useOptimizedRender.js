import { useState, useEffect, useRef, useCallback } from 'react';

// Хук для оптимізації рендерингу з дебаунсингом
export function useOptimizedRender(renderFunction, dependencies = [], delay = 16) {
  const [shouldRender, setShouldRender] = useState(true);
  const timeoutRef = useRef(null);
  const lastRenderRef = useRef(0);

  const scheduleRender = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const now = Date.now();
      if (now - lastRenderRef.current >= delay) {
        setShouldRender(true);
        lastRenderRef.current = now;
      }
    }, delay);
  }, [delay]);

  useEffect(() => {
    setShouldRender(false);
    scheduleRender();
  }, dependencies);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return shouldRender ? renderFunction() : null;
}

// Хук для мемоізації складних обчислень
export function useMemoizedValue(computeFunction, dependencies = []) {
  const [value, setValue] = useState(() => computeFunction());
  const prevDepsRef = useRef(dependencies);

  useEffect(() => {
    const depsChanged = dependencies.some((dep, index) => 
      dep !== prevDepsRef.current[index]
    );

    if (depsChanged) {
      setValue(computeFunction());
      prevDepsRef.current = dependencies;
    }
  }, dependencies);

  return value;
}

// Хук для оптимізації скролу
export function useOptimizedScroll(threshold = 100) {
  const [isScrolling, setIsScrolling] = useState(false);
  const timeoutRef = useRef(null);

  const handleScroll = useCallback(() => {
    setIsScrolling(true);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, threshold);
  }, [threshold]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { isScrolling, handleScroll };
}
