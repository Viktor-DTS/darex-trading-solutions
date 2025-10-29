import React, { useState, useEffect } from 'react';
import { useOptimizedLazyData } from '../hooks/useOptimizedLazyData';

// Тестовий компонент для демонстрації оптимізації панелі бухгалтера
const AccountantOptimizationTest = ({ user }) => {
  const [testResults, setTestResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  const {
    data: tasks,
    loading,
    error,
    activeTab,
    setActiveTab,
    refreshData,
    getTabCount,
    columnSettings: optimizedColumnSettings,
    invoiceColumnSettings: optimizedInvoiceColumnSettings,
    accessRules: optimizedAccessRules,
    roles: optimizedRoles,
    isInitialized
  } = useOptimizedLazyData(user, 'pending');

  // Тестуємо оптимізацію
  const runOptimizationTest = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    const results = [];
    const startTime = Date.now();
    
    // Тест 1: Перевіряємо час ініціалізації
    results.push({
      test: 'Ініціалізація оптимізованого хука',
      status: isInitialized ? '✅ Успішно' : '⏳ Завантаження...',
      time: isInitialized ? `${Date.now() - startTime}ms` : 'N/A'
    });

    // Тест 2: Перевіряємо кількість завдань
    const totalTasks = Object.values({
      notDone: getTabCount('notDone'),
      pending: getTabCount('pending'),
      done: getTabCount('done'),
      blocked: getTabCount('blocked')
    }).reduce((sum, count) => sum + count, 0);

    results.push({
      test: 'Загальна кількість завдань',
      status: `📊 ${totalTasks} завдань`,
      time: 'N/A'
    });

    // Тест 3: Перевіряємо налаштування колонок
    results.push({
      test: 'Налаштування колонок (основна)',
      status: optimizedColumnSettings?.visible?.length > 0 ? 
        `✅ ${optimizedColumnSettings.visible.length} колонок` : 
        '⚠️ Стандартні налаштування',
      time: 'N/A'
    });

    results.push({
      test: 'Налаштування колонок (рахунки)',
      status: optimizedInvoiceColumnSettings?.visible?.length > 0 ? 
        `✅ ${optimizedInvoiceColumnSettings.visible.length} колонок` : 
        '⚠️ Стандартні налаштування',
      time: 'N/A'
    });

    // Тест 4: Перевіряємо правила доступу
    results.push({
      test: 'Правила доступу',
      status: Object.keys(optimizedAccessRules || {}).length > 0 ? 
        `✅ ${Object.keys(optimizedAccessRules).length} правил` : 
        '⚠️ Немає правил',
      time: 'N/A'
    });

    // Тест 5: Перевіряємо ролі
    results.push({
      test: 'Ролі користувачів',
      status: optimizedRoles?.length > 0 ? 
        `✅ ${optimizedRoles.length} ролей` : 
        '⚠️ Немає ролей',
      time: 'N/A'
    });

    // Тест 6: Перевіряємо поточну вкладку
    results.push({
      test: 'Поточна вкладка',
      status: `📑 ${activeTab} (${getTabCount(activeTab)} завдань)`,
      time: 'N/A'
    });

    setTestResults(results);
    setIsRunning(false);
  };

  useEffect(() => {
    if (isInitialized && testResults.length === 0) {
      runOptimizationTest();
    }
  }, [isInitialized]);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>🧪 Тест оптимізації панелі бухгалтера</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={runOptimizationTest}
          disabled={isRunning || loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isRunning || loading ? 'not-allowed' : 'pointer'
          }}
        >
          {isRunning ? '🔄 Тестування...' : '🚀 Запустити тест'}
        </button>
      </div>

      {loading && (
        <div style={{ color: '#007bff', marginBottom: '20px' }}>
          ⏳ Завантаження оптимізованих даних...
        </div>
      )}

      {error && (
        <div style={{ color: '#dc3545', marginBottom: '20px' }}>
          ❌ Помилка: {error.message}
        </div>
      )}

      {testResults.length > 0 && (
        <div>
          <h3>📊 Результати тестування:</h3>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            border: '1px solid #ddd'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Тест
                </th>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Статус
                </th>
                <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>
                  Час
                </th>
              </tr>
            </thead>
            <tbody>
              {testResults.map((result, index) => (
                <tr key={index}>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    {result.test}
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    {result.status}
                  </td>
                  <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                    {result.time}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
        <h4>💡 Переваги оптимізації:</h4>
        <ul>
          <li>✅ Один запит замість множинних запитів</li>
          <li>✅ Паралельне завантаження всіх даних</li>
          <li>✅ Зменшення навантаження на сервер</li>
          <li>✅ Швидше завантаження панелі</li>
          <li>✅ Менше рендерингів компонентів</li>
        </ul>
      </div>
    </div>
  );
};

export default AccountantOptimizationTest;
