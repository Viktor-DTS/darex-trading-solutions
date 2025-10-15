import { useState, useEffect, useCallback, useRef } from 'react';
import { tasksAPI } from '../utils/tasksAPI';

export const useLazyData = (user, initialTab = 'notDone') => {
  console.log(`[useLazyData] Hook initialized with user:`, user?.login, 'initialTab:', initialTab);
  
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const cacheRef = useRef({});

  const fetchDataForTab = useCallback(async (tab) => {
    if (!user || !user.region) {
      console.warn('useLazyData: User or user region is not defined. Cannot fetch data.');
      return [];
    }

    // Перевіряємо кеш
    if (cacheRef.current[tab]) {
      console.log(`[useLazyData] ✅ Loading from cache for tab: ${tab}, count: ${cacheRef.current[tab].length}`);
      return cacheRef.current[tab];
    }

    setLoading(true);
    setError(null);
    console.log(`[useLazyData] 🚀 Fetching data for tab: ${tab} from server`);

    try {
      // Завантажуємо тільки потрібні заявки з сервера через новий endpoint
      const tabData = await tasksAPI.getByStatus(tab, user.region);

      // Зберігаємо в кеш
      cacheRef.current = { ...cacheRef.current, [tab]: tabData };
      console.log(`[useLazyData] ✅ Data fetched and cached for tab: ${tab}, count: ${tabData.length}`);
      return tabData;
    } catch (err) {
      console.error(`[useLazyData] ❌ Error fetching data for tab ${tab}:`, err);
      setError(err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user?.region]);

  // Завантаження даних для активної вкладки
  useEffect(() => {
    console.log(`[useLazyData] useEffect triggered - activeTab: ${activeTab}, user: ${user?.login}`);
    if (user) {
      const loadData = async () => {
        console.log(`[useLazyData] Loading data for activeTab: ${activeTab}`);
        const tabData = await fetchDataForTab(activeTab);
        setData(prev => ({ ...prev, [activeTab]: tabData }));
      };
      loadData();
    }
  }, [activeTab, user?.region, fetchDataForTab]);

  const refreshData = useCallback(async (tabToRefresh = activeTab) => {
    console.log(`[useLazyData] 🔄 Refreshing data for tab: ${tabToRefresh}`);
    // Очищаємо кеш поточної вкладки
    delete cacheRef.current[tabToRefresh];
    const freshData = await fetchDataForTab(tabToRefresh);
    setData(prev => ({ ...prev, [tabToRefresh]: freshData }));
  }, [activeTab, fetchDataForTab]);

  return {
    data: data[activeTab] || [],
    loading,
    error,
    activeTab,
    setActiveTab,
    refreshData,
    allCachedData: data,
    getTabCount: useCallback((tabName) => (cacheRef.current[tabName] || []).length, [])
  };
};
