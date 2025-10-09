import React, { useState, useEffect } from 'react';
// API URL налаштування
const API_BASE_URL = process.env.REACT_APP_API_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
const UserNotificationManager = ({ user }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notificationSettings, setNotificationSettings] = useState({});
  const [saved, setSaved] = useState(false);
  const [systemMessage, setSystemMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const notificationTypes = [
    { key: 'new_requests', label: 'Нові заявки', description: 'Коли оператор створює нову заявку' },
    { key: 'pending_approval', label: 'Потребує підтвердження Завсклада', description: 'Коли заявка виконана потребує підтвердження Завсклада' },
    { key: 'accountant_approval', label: 'Затвердження Бухгалтера', description: 'Коли заявка затверджена потребує затвердження Бухгалтера' },
    { key: 'approved_requests', label: 'Підтверджені заявки', description: 'Коли заявка підтверджена' },
    { key: 'rejected_requests', label: 'Відхилені заявки', description: 'Коли заявка відхилена' },
    { key: 'invoice_requested', label: 'Запити на рахунки', description: 'Коли користувач подає запит на отримання рахунку' },
    { key: 'invoice_completed', label: 'Виконані рахунки', description: 'Коли бухгалтер завантажив рахунок' },
    { key: 'system_notifications', label: 'Системні сповіщення', description: 'Отримувати системні повідомлення від адміністратора' }
  ];
  // Завантаження користувачів
  useEffect(() => {
    loadUsers();
    loadNotificationSettings();
  }, []);
  const loadUsers = async () => {
    try {
      setLoading(true);
      console.log('[DEBUG] Завантаження користувачів з Telegram...');
      console.log('[DEBUG] API_BASE_URL:', API_BASE_URL);
      
      // Отримуємо всіх користувачів
      const response = await fetch(`${API_BASE_URL}/users`);
      
      if (response.ok) {
        const usersData = await response.json();
        // Фільтруємо тільки користувачів з налаштованим Telegram Chat ID
        const usersWithTelegram = usersData.filter(u => 
          u.telegramChatId && 
          u.telegramChatId.trim() && 
          u.telegramChatId !== 'Chat ID'
        );
        setUsers(usersWithTelegram);
        console.log('[DEBUG] Знайдено користувачів з Telegram:', usersWithTelegram.length);
      }
    } catch (error) {
      console.error('Помилка завантаження користувачів:', error);
    } finally {
      setLoading(false);
    }
  };
  const loadNotificationSettings = async () => {
    try {
      console.log('[DEBUG] Завантаження налаштувань сповіщень...');
      
      // Завантажуємо користувачів з їх налаштуваннями
      const response = await fetch(`${API_BASE_URL}/users`);
      if (response.ok) {
        const usersData = await response.json();
        console.log('[DEBUG] Отримано користувачів:', usersData.length);
        
        // Створюємо об'єкт налаштувань на основі користувачів
        const settings = {};
        
        // Створюємо об'єкт де ключ - login користувача, значення - налаштування
        usersData.forEach(user => {
          settings[user.login] = user.notificationSettings || {
            newRequests: false,
            pendingApproval: false,
            accountantApproval: false,
            approvedRequests: false,
            rejectedRequests: false,
            invoiceRequests: false,
            completedInvoices: false,
            systemNotifications: false
          };
        });
        
        console.log('[DEBUG] Налаштування завантажено:', settings);
        setNotificationSettings(settings);
      } else {
        console.error('Помилка завантаження користувачів:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Помилка завантаження налаштувань сповіщень:', error);
    }
  };

  const initializeNotificationSettings = async () => {
    try {
      console.log('[DEBUG] Ініціалізація налаштувань сповіщень...');
      
      const response = await fetch(`${API_BASE_URL}/notification-settings/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('[DEBUG] Ініціалізація успішна:', result);
        alert(`Ініціалізовано налаштувань для ${result.initializedCount} користувачів`);
        
        // Перезавантажуємо налаштування
        await loadNotificationSettings();
      } else {
        console.error('Помилка ініціалізації:', response.status, response.statusText);
        alert('Помилка ініціалізації налаштувань');
      }
    } catch (error) {
      console.error('Помилка ініціалізації налаштувань:', error);
      alert('Помилка ініціалізації налаштувань');
    }
  };

  const handleNotificationToggle = (notificationType, userId) => {
    setNotificationSettings(prev => {
      const newSettings = { ...prev };
      
      // Ініціалізуємо налаштування користувача, якщо їх немає
      if (!newSettings[userId]) {
        newSettings[userId] = {
          newRequests: false,
          pendingApproval: false,
          accountantApproval: false,
          approvedRequests: false,
          rejectedRequests: false,
          invoiceRequests: false,
          completedInvoices: false,
          systemNotifications: false
        };
      }
      
      // Перемикаємо налаштування для конкретного користувача
      newSettings[userId][notificationType] = !newSettings[userId][notificationType];
      
      return newSettings;
    });
  };
  const saveNotificationSettings = async () => {
    try {
      setLoading(true);
      console.log('[DEBUG] Збереження налаштувань сповіщень...');
      
      // Отримуємо поточних користувачів
      const usersResponse = await fetch(`${API_BASE_URL}/users`);
      if (!usersResponse.ok) {
        throw new Error('Помилка завантаження користувачів');
      }
      
      const usersData = await usersResponse.json();
      console.log('[DEBUG] Отримано користувачів для оновлення:', usersData.length);
      
      // Оновлюємо налаштування для кожного користувача
      const updatePromises = usersData.map(async (user) => {
        // Отримуємо налаштування для конкретного користувача
        const userSettings = notificationSettings[user.login] || {
          newRequests: false,
          pendingApproval: false,
          accountantApproval: false,
          approvedRequests: false,
          rejectedRequests: false,
          invoiceRequests: false,
          completedInvoices: false,
          systemNotifications: false
        };
        
        console.log(`[DEBUG] Оновлення налаштувань для ${user.login}:`, userSettings);
        
        // Відправляємо PUT запит для оновлення користувача
        const response = await fetch(`${API_BASE_URL}/notification-settings/user/${user.login}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationSettings: userSettings })
        });
        
        if (!response.ok) {
          console.error(`[ERROR] Помилка оновлення налаштувань для ${user.login}:`, response.status, response.statusText);
        }
        
        return response.ok;
      });
      
      const results = await Promise.all(updatePromises);
      const successCount = results.filter(Boolean).length;
      
      console.log(`[DEBUG] Оновлено налаштування для ${successCount} з ${usersData.length} користувачів`);
      
      if (successCount > 0) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert('Помилка збереження налаштувань сповіщень');
      }
    } catch (error) {
      console.error('Помилка збереження:', error);
      alert('Помилка збереження налаштувань сповіщень: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  const isUserSelected = (notificationType, userId) => {
    return notificationSettings[userId]?.[notificationType] || false;
  };
  const getSelectedUsersCount = (notificationType) => {
    return Object.values(notificationSettings).filter(userSettings => 
      userSettings[notificationType]
    ).length;
  };

  const sendSystemMessage = async () => {
    if (!systemMessage.trim()) {
      alert('Будь ласка, введіть текст повідомлення');
      return;
    }

    try {
      setSendingMessage(true);
      console.log('[DEBUG] Відправка системного повідомлення...');
      
      const response = await fetch(`${API_BASE_URL}/notifications/send-system-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: systemMessage,
          type: 'system_notifications'
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[DEBUG] Системне повідомлення відправлено:', result);
        setMessageSent(true);
        setSystemMessage('');
        setTimeout(() => setMessageSent(false), 3000);
      } else {
        const errorText = await response.text();
        console.error('[ERROR] Помилка відправки повідомлення:', response.status, errorText);
        alert('Помилка відправки повідомлення: ' + response.status);
      }
    } catch (error) {
      console.error('Помилка відправки системного повідомлення:', error);
      alert('Помилка відправки повідомлення: ' + error.message);
    } finally {
      setSendingMessage(false);
    }
  };
  if (loading) {
    return (
      <div style={{ padding: '20px', color: '#fff', textAlign: 'center' }}>
        Завантаження налаштувань сповіщень...
      </div>
    );
  }
  return (
    <div style={{ padding: '20px', color: '#fff' }}>
      <h2 style={{ marginBottom: '20px', color: '#fff' }}>
        Управління сповіщеннями користувачів
      </h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={initializeNotificationSettings}
          style={{
            padding: '10px 20px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            marginRight: '10px'
          }}
        >
          Ініціалізувати налаштування
        </button>
        <span style={{ fontSize: '12px', color: '#ccc' }}>
          Натисніть, якщо чекбокси не відображаються
        </span>
      </div>
      
      <div style={{ marginBottom: '20px', padding: '12px', background: '#2a3a4a', borderRadius: '8px' }}>
        <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
          <strong>Інструкція:</strong> Виберіть користувачів, які будуть отримувати сповіщення для кожного типу подій.
        </p>
        <p style={{ margin: '0', fontSize: '12px', color: '#ccc' }}>
          Показуються тільки користувачі з налаштованим Telegram Chat ID.
        </p>
      </div>
      {users.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', background: '#2a3a4a', borderRadius: '8px' }}>
          <p>Немає користувачів з налаштованим Telegram Chat ID.</p>
          <p style={{ fontSize: '12px', color: '#ccc' }}>
            Спочатку додайте Chat ID користувачам в розділі "Адміністратор" → "Додавання працівника"
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#22334a', borderRadius: '8px', overflow: 'hidden' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left', background: '#1a2636', borderBottom: '1px solid #29506a' }}>
                  Користувач
                </th>
                <th style={{ padding: '12px', textAlign: 'left', background: '#1a2636', borderBottom: '1px solid #29506a' }}>
                  Роль
                </th>
                <th style={{ padding: '12px', textAlign: 'left', background: '#1a2636', borderBottom: '1px solid #29506a' }}>
                  Telegram Chat ID
                </th>
                {notificationTypes.map(type => (
                  <th key={type.key} style={{ padding: '12px', textAlign: 'center', background: '#1a2636', borderBottom: '1px solid #29506a', minWidth: '120px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{type.label}</div>
                    <div style={{ fontSize: '10px', color: '#ccc', marginTop: '4px' }}>
                      {getSelectedUsersCount(type.key)} користувачів
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid #29506a' }}>
                  <td style={{ padding: '12px', borderBottom: '1px solid #29506a' }}>
                    <div style={{ fontWeight: 'bold' }}>{user.name}</div>
                    <div style={{ fontSize: '12px', color: '#ccc' }}>{user.login}</div>
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #29506a' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      fontSize: '12px',
                      background: '#4a5a6a',
                      color: '#fff'
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px', borderBottom: '1px solid #29506a' }}>
                    <code style={{ 
                      background: '#1a2636', 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      fontSize: '12px',
                      color: '#4CAF50'
                    }}>
                      {user.telegramChatId}
                    </code>
                  </td>
                  {notificationTypes.map(type => (
                    <td key={type.key} style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #29506a' }}>
                      <input
                        type="checkbox"
                        checked={isUserSelected(type.key, user.login)}
                        onChange={() => handleNotificationToggle(type.key, user.login)}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer'
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          onClick={saveNotificationSettings}
          disabled={loading}
          style={{
            background: '#4CAF50',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '12px 24px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Збереження...' : 'Зберегти налаштування'}
        </button>
        {saved && (
          <span style={{ color: '#4CAF50', fontSize: '14px' }}>
            ✅ Налаштування збережено!
          </span>
        )}
      </div>

      {/* Системне повідомлення */}
      <div style={{ marginTop: '30px', padding: '20px', background: '#2a3a4a', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#fff' }}>Відправка системного повідомлення</h3>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: '#fff', fontWeight: 'bold' }}>
            Текст повідомлення:
          </label>
          <textarea
            value={systemMessage}
            onChange={(e) => setSystemMessage(e.target.value)}
            placeholder="Введіть текст системного повідомлення..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #29506a',
              background: '#1a2636',
              color: '#fff',
              fontSize: '14px',
              resize: 'vertical'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={sendSystemMessage}
            disabled={sendingMessage || !systemMessage.trim()}
            style={{
              background: sendingMessage ? '#666' : '#FF6B35',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '12px 24px',
              cursor: sendingMessage || !systemMessage.trim() ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              opacity: sendingMessage || !systemMessage.trim() ? 0.6 : 1
            }}
          >
            {sendingMessage ? 'Відправка...' : 'Відправити повідомлення'}
          </button>
          {messageSent && (
            <span style={{ color: '#4CAF50', fontSize: '14px' }}>
              ✅ Повідомлення відправлено!
            </span>
          )}
        </div>
        <div style={{ marginTop: '12px', fontSize: '12px', color: '#ccc' }}>
          Повідомлення буде відправлено всім користувачам, у яких увімкнено "Системні сповіщення"
        </div>
      </div>
      <div style={{ marginTop: '20px', padding: '16px', background: '#2a3a4a', borderRadius: '8px' }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#fff' }}>Типи сповіщень:</h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {notificationTypes.map(type => (
            <div key={type.key} style={{ fontSize: '14px' }}>
              <strong>{type.label}:</strong> {type.description}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default UserNotificationManager;
