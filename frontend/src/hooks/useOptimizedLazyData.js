import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { accountantDataAPI } from '../utils/accountantDataAPI';

export const useOptimizedLazyData = (user, initialTab = 'notDone') => {
  console.log(`[useOptimizedLazyData] Hook initialized with user:`, user?.login, 'initialTab:', initialTab);
  
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [columnSettings, setColumnSettings] = useState({});
  const [invoiceColumnSettings, setInvoiceColumnSettings] = useState({});
  const [accessRules, setAccessRules] = useState([]);
  const [roles, setRoles] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const cacheRef = useRef({});
  const initializationRef = useRef(false);

  // Завантаження всіх даних одним запитом при ініціалізації
  const initializeData = useCallback(async () => {
    if (!user || !user.login || !user.region || isInitialized || initializationRef.current) {
      console.warn('useOptimizedLazyData: User, login or region not defined or already initialized. Cannot fetch data.');
      return;
    }

    initializationRef.current = true;
    setLoading(true);
    setError(null);
    console.log(`[useOptimizedLazyData] 🚀 Initializing all data in single request...`);

    try {
      // Завантажуємо всі дані одним запитом
      const allData = await accountantDataAPI.getAllAccountantData(user, user.region);
      
      // Оновлюємо стан одним викликом для мінімізації ре-рендерів
      setData(prevData => {
        const newData = { ...prevData };
        if (allData.tasks) {
          Object.keys(allData.tasks).forEach(tab => {
            cacheRef.current[tab] = allData.tasks[tab];
            newData[tab] = allData.tasks[tab];
          });
        }
        return newData;
      });

      // Оновлюємо всі інші стани одночасно
      setColumnSettings(allData.columnSettings || {});
      setInvoiceColumnSettings(allData.invoiceColumnSettings || {});
      setAccessRules(allData.accessRules || []);
      setRoles(allData.roles || []);
      setIsInitialized(true);
      
      console.log(`[useOptimizedLazyData] ✅ All data initialized successfully`);
    } catch (err) {
      console.error(`[useOptimizedLazyData] ❌ Error initializing data:`, err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user?.login, user?.region, isInitialized]);

  // Завантаження даних для конкретної вкладки (fallback)
  const fetchDataForTab = useCallback(async (tab) => {
    if (!user || !user.region) {
      console.warn('useOptimizedLazyData: User or user region is not defined. Cannot fetch data.');
      return [];
    }

    // Перевіряємо кеш
    if (cacheRef.current[tab]) {
      console.log(`[useOptimizedLazyData] ✅ Loading from cache for tab: ${tab}, count: ${cacheRef.current[tab].length}`);
      return cacheRef.current[tab];
    }

    setLoading(true);
    setError(null);
    console.log(`[useOptimizedLazyData] 🚀 Fetching data for tab: ${tab} from server`);

    try {
      // Завантажуємо дані для конкретної вкладки
      const tabData = await accountantDataAPI.getTabData(tab, user.region);

      // Зберігаємо в кеш
      cacheRef.current = { ...cacheRef.current, [tab]: tabData };
      console.log(`[useOptimizedLazyData] ✅ Data fetched and cached for tab: ${tab}, count: ${tabData.length}`);
      return tabData;
    } catch (err) {
      console.error(`[useOptimizedLazyData] ❌ Error fetching data for tab ${tab}:`, err);
      setError(err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user?.region]);

  // Ініціалізація при зміні користувача
  useEffect(() => {
    if (user && user.login && user.region && !isInitialized && !initializationRef.current) {
      initializeData();
    }
  }, [user?.login, user?.region, isInitialized]);

  // Завантаження даних для активної вкладки (якщо не ініціалізовано)
  useEffect(() => {
    if (user && isInitialized && !data[activeTab]) {
      const loadData = async () => {
        console.log(`[useOptimizedLazyData] Loading data for activeTab: ${activeTab}`);
        const tabData = await fetchDataForTab(activeTab);
        setData(prev => ({ ...prev, [activeTab]: tabData }));
      };
      loadData();
    }
  }, [activeTab, user?.region, isInitialized]);

  const refreshData = useCallback(async (tabToRefresh = activeTab) => {
    console.log(`[useOptimizedLazyData] 🔄 Refreshing data for tab: ${tabToRefresh}`);
    // Очищаємо кеш поточної вкладки
    delete cacheRef.current[tabToRefresh];
    const freshData = await fetchDataForTab(tabToRefresh);
    setData(prev => ({ ...prev, [tabToRefresh]: freshData }));
  }, [activeTab, fetchDataForTab]);

  // Функція для поповнення кешу зовнішніми даними
  const preloadCache = useCallback((tab, data) => {
    console.log(`[useOptimizedLazyData] 📦 Preloading cache for tab: ${tab}, count: ${data.length}`);
    cacheRef.current = { ...cacheRef.current, [tab]: data };
    setData(prev => ({ ...prev, [tab]: data }));
  }, []);

  // Функція для оновлення налаштувань колонок
  const updateColumnSettings = useCallback((settings) => {
    setColumnSettings(settings);
  }, []);

  const updateInvoiceColumnSettings = useCallback((settings) => {
    setInvoiceColumnSettings(settings);
  }, []);

  // Мемоізуємо дані для активної вкладки
  const currentTabData = useMemo(() => data[activeTab] || [], [data, activeTab]);
  
  // Мемоізуємо функцію підрахунку завдань
  const getTabCount = useCallback((tabName) => (cacheRef.current[tabName] || []).length, []);

  return {
    data: currentTabData,
    loading,
    error,
    activeTab,
    setActiveTab,
    refreshData,
    preloadCache,
    allCachedData: data,
    getTabCount,
    // Нові властивості
    columnSettings,
    invoiceColumnSettings,
    accessRules,
    roles,
    isInitialized,
    updateColumnSettings,
    updateInvoiceColumnSettings
  };
};
