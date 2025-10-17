import React, { useState, useEffect } from 'react';

// API URL налаштування
const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');

const NotificationDebugPanel = ({ user }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(false);
  const [userAnalysis, setUserAnalysis] = useState(null);
  const [logAnalysis, setLogAnalysis] = useState(null);
  const [systemReport, setSystemReport] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [testResult, setTestResult] = useState(null);
  
  // Форми для тестування
  const [simulationForm, setSimulationForm] = useState({
    type: 'new_requests',
    data: JSON.stringify({
      task: {
        serviceRegion: 'Київський',
        requestNumber: 'TEST-001',
        createdBy: 'test_user'
      },
      authorLogin: 'test_user'
    }, null, 2)
  });
  
  const [testForm, setTestForm] = useState({
    userLogin: '',
    message: '🧪 Тестове сповіщення з панелі дебагу'
  });

  // Завантаження аналізу користувачів
  const loadUserAnalysis = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/notifications/debug/analyze-users`);
      const result = await response.json();
      
      if (result.success) {
        setUserAnalysis(result.data);
      } else {
        alert('Помилка завантаження аналізу користувачів: ' + result.error);
      }
    } catch (error) {
      console.error('Помилка завантаження аналізу користувачів:', error);
      alert('Помилка завантаження аналізу користувачів: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Завантаження аналізу логів
  const loadLogAnalysis = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/notifications/debug/logs?limit=100`);
      const result = await response.json();
      
      if (result.success) {
        setLogAnalysis(result.data);
      } else {
        alert('Помилка завантаження аналізу логів: ' + result.error);
      }
    } catch (error) {
      console.error('Помилка завантаження аналізу логів:', error);
      alert('Помилка завантаження аналізу логів: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Генерація повного звіту
  const generateSystemReport = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/notifications/debug/report`);
      const result = await response.json();
      
      if (result.success) {
        setSystemReport(result.data);
      } else {
        alert('Помилка генерації звіту: ' + result.error);
      }
    } catch (error) {
      console.error('Помилка генерації звіту:', error);
      alert('Помилка генерації звіту: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Симуляція сповіщення
  const simulateNotification = async () => {
    try {
      setLoading(true);
      const data = JSON.parse(simulationForm.data);
      
      const response = await fetch(`${API_BASE_URL}/notifications/debug/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: simulationForm.type,
          data: data
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSimulationResult(result.data);
      } else {
        alert('Помилка симуляції: ' + result.error);
      }
    } catch (error) {
      console.error('Помилка симуляції:', error);
      alert('Помилка симуляції: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Тест сповіщення для користувача
  const testUserNotification = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE_URL}/notifications/debug/test-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userLogin: testForm.userLogin,
          message: testForm.message
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setTestResult(result.data);
      } else {
        alert('Помилка тестування: ' + result.error);
      }
    } catch (error) {
      console.error('Помилка тестування:', error);
      alert('Помилка тестування: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Автоматичне завантаження при зміні табу
  useEffect(() => {
    if (activeTab === 'users' && !userAnalysis) {
      loadUserAnalysis();
    } else if (activeTab === 'logs' && !logAnalysis) {
      loadLogAnalysis();
    } else if (activeTab === 'report' && !systemReport) {
      generateSystemReport();
    }
  }, [activeTab]);

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ padding: '20px', color: '#fff', textAlign: 'center' }}>
        ❌ Доступ заборонено. Потрібні права адміністратора.
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h2 style={{ marginBottom: '20px', color: '#fff' }}>
        🔧 Панель дебагу сповіщень
      </h2>
      
      {/* Навігація по табах */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #444' }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'users' ? '#007bff' : 'transparent',
            color: '#fff',
            border: 'none',
            borderBottom: activeTab === 'users' ? '2px solid #007bff' : '2px solid transparent',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          👥 Аналіз користувачів
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'logs' ? '#007bff' : 'transparent',
            color: '#fff',
            border: 'none',
            borderBottom: activeTab === 'logs' ? '2px solid #007bff' : '2px solid transparent',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          📊 Аналіз логів
        </button>
        <button
          onClick={() => setActiveTab('simulate')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'simulate' ? '#007bff' : 'transparent',
            color: '#fff',
            border: 'none',
            borderBottom: activeTab === 'simulate' ? '2px solid #007bff' : '2px solid transparent',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          🧪 Симуляція
        </button>
        <button
          onClick={() => setActiveTab('test')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'test' ? '#007bff' : 'transparent',
            color: '#fff',
            border: 'none',
            borderBottom: activeTab === 'test' ? '2px solid #007bff' : '2px solid transparent',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          🎯 Тест користувача
        </button>
        <button
          onClick={() => setActiveTab('report')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'report' ? '#007bff' : 'transparent',
            color: '#fff',
            border: 'none',
            borderBottom: activeTab === 'report' ? '2px solid #007bff' : '2px solid transparent',
            cursor: 'pointer'
          }}
        >
          📋 Повний звіт
        </button>
      </div>

      {/* Контент табів */}
      {activeTab === 'users' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <button
              onClick={loadUserAnalysis}
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Завантаження...' : '🔄 Оновити аналіз'}
            </button>
          </div>
          
          {userAnalysis && (
            <div style={{ background: '#2a3a4a', padding: '20px', borderRadius: '8px' }}>
              <h3>📊 Статистика користувачів</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: '#1a2636', padding: '15px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                    {userAnalysis.totalUsers}
                  </div>
                  <div>Загальна кількість користувачів</div>
                </div>
                <div style={{ background: '#1a2636', padding: '15px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                    {userAnalysis.usersWithTelegram}
                  </div>
                  <div>З Telegram Chat ID</div>
                </div>
                <div style={{ background: '#1a2636', padding: '15px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
                    {userAnalysis.usersWithoutTelegram}
                  </div>
                  <div>Без Telegram Chat ID</div>
                </div>
              </div>
              
              <h4>📋 Налаштування сповіщень</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px' }}>
                {userAnalysis.notificationSettings && Object.entries(userAnalysis.notificationSettings).map(([type, count]) => (
                  <div key={type} style={{ 
                    background: '#1a2636', 
                    padding: '10px', 
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>{type}</span>
                    <span style={{ 
                      color: count > 0 ? '#28a745' : '#dc3545',
                      fontWeight: 'bold'
                    }}>
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <button
              onClick={loadLogAnalysis}
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Завантаження...' : '🔄 Оновити логи'}
            </button>
          </div>
          
          {logAnalysis && (
            <div style={{ background: '#2a3a4a', padding: '20px', borderRadius: '8px' }}>
              <h3>📊 Статистика логів</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: '#1a2636', padding: '15px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                    {logAnalysis.totalLogs}
                  </div>
                  <div>Загальна кількість логів</div>
                </div>
                <div style={{ background: '#1a2636', padding: '15px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
                    {logAnalysis.failedLogs}
                  </div>
                  <div>Невдалих сповіщень</div>
                </div>
              </div>
              
              <h4>📈 Статистика по статусах</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                {logAnalysis.statusStats && Object.entries(logAnalysis.statusStats).map(([status, count]) => (
                  <div key={status} style={{ 
                    background: '#1a2636', 
                    padding: '10px', 
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>{status}</span>
                    <span style={{ 
                      color: status === 'sent' ? '#28a745' : status === 'failed' ? '#dc3545' : '#ffc107',
                      fontWeight: 'bold'
                    }}>
                      {count}
                    </span>
                  </div>
                ))}
              </div>
              
              <h4>📈 Статистика по типах</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {logAnalysis.typeStats && Object.entries(logAnalysis.typeStats).map(([type, count]) => (
                  <div key={type} style={{ 
                    background: '#1a2636', 
                    padding: '10px', 
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>{type}</span>
                    <span style={{ color: '#007bff', fontWeight: 'bold' }}>
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'simulate' && (
        <div>
          <div style={{ background: '#2a3a4a', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3>🧪 Симуляція сповіщення</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Тип сповіщення:</label>
              <select
                value={simulationForm.type}
                onChange={(e) => setSimulationForm({ ...simulationForm, type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#1a2636',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px'
                }}
              >
                <option value="new_requests">Нові заявки</option>
                <option value="pending_approval">Потребує підтвердження Завсклада</option>
                <option value="accountant_approval">Затвердження Бухгалтера</option>
                <option value="approved_requests">Підтверджені заявки</option>
                <option value="rejected_requests">Відхилені заявки</option>
                <option value="invoice_requested">Запити на рахунки</option>
                <option value="invoice_completed">Виконані рахунки</option>
                <option value="system_notifications">Системні сповіщення</option>
              </select>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Дані для симуляції (JSON):</label>
              <textarea
                value={simulationForm.data}
                onChange={(e) => setSimulationForm({ ...simulationForm, data: e.target.value })}
                rows={8}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#1a2636',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '12px'
                }}
              />
            </div>
            
            <button
              onClick={simulateNotification}
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Симуляція...' : '🚀 Запустити симуляцію'}
            </button>
          </div>
          
          {simulationResult && (
            <div style={{ background: '#2a3a4a', padding: '20px', borderRadius: '8px' }}>
              <h3>📊 Результат симуляції</h3>
              <div style={{ background: '#1a2636', padding: '15px', borderRadius: '6px' }}>
                <pre style={{ color: '#fff', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(simulationResult, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'test' && (
        <div>
          <div style={{ background: '#2a3a4a', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <h3>🎯 Тест сповіщення для користувача</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Логін користувача:</label>
              <input
                type="text"
                value={testForm.userLogin}
                onChange={(e) => setTestForm({ ...testForm, userLogin: e.target.value })}
                placeholder="Введіть логін користувача"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#1a2636',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Тестове повідомлення:</label>
              <input
                type="text"
                value={testForm.message}
                onChange={(e) => setTestForm({ ...testForm, message: e.target.value })}
                placeholder="Введіть тестове повідомлення"
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#1a2636',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: '4px'
                }}
              />
            </div>
            
            <button
              onClick={testUserNotification}
              disabled={loading || !testForm.userLogin}
              style={{
                padding: '10px 20px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Тестування...' : '🧪 Тестувати користувача'}
            </button>
          </div>
          
          {testResult && (
            <div style={{ background: '#2a3a4a', padding: '20px', borderRadius: '8px' }}>
              <h3>📊 Результат тестування</h3>
              <div style={{ background: '#1a2636', padding: '15px', borderRadius: '6px' }}>
                <pre style={{ color: '#fff', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'report' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <button
              onClick={generateSystemReport}
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6f42c1',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Генерація...' : '📋 Згенерувати повний звіт'}
            </button>
          </div>
          
          {systemReport && (
            <div style={{ background: '#2a3a4a', padding: '20px', borderRadius: '8px' }}>
              <h3>📋 Повний звіт системи сповіщень</h3>
              <div style={{ background: '#1a2636', padding: '15px', borderRadius: '6px' }}>
                <pre style={{ color: '#fff', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(systemReport, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationDebugPanel;
