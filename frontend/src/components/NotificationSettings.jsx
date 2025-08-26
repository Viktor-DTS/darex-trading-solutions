import React, { useState, useEffect } from 'react';

const NotificationSettings = ({ user }) => {
  const [settings, setSettings] = useState({
    telegramChatId: '',
    enabledNotifications: []
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState(null);

  const notificationTypes = [
    { key: 'task_created', label: 'Нові заявки', description: 'Коли оператор створює нову заявку' },
    { key: 'task_completed', label: 'Виконані заявки', description: 'Коли заявка позначена як виконана' },
    { key: 'task_approval', label: 'Потребують підтвердження', description: 'Коли заявка потребує підтвердження' },
    { key: 'task_approved', label: 'Підтверджені заявки', description: 'Коли заявка підтверджена' },
    { key: 'task_rejected', label: 'Відхилені заявки', description: 'Коли заявка відхилена' }
  ];

  // Завантаження налаштувань
  useEffect(() => {
    if (user?.login) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/notification-settings?userId=${user.login}`);
      if (response.ok) {
        const data = await response.json();
        setSettings({
          telegramChatId: data.telegramChatId || '',
          enabledNotifications: data.enabledNotifications || []
        });
      }
    } catch (error) {
      console.error('Помилка завантаження налаштувань:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.login,
          role: user.role,
          telegramChatId: settings.telegramChatId,
          enabledNotifications: settings.enabledNotifications
        })
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert('Помилка збереження налаштувань');
      }
    } catch (error) {
      console.error('Помилка збереження:', error);
      alert('Помилка збереження налаштувань');
    } finally {
      setLoading(false);
    }
  };

  const sendTestMessage = async () => {
    if (!settings.telegramChatId || !testMessage.trim()) {
      alert('Введіть Chat ID та тестове повідомлення');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: settings.telegramChatId,
          message: testMessage
        })
      });

      const result = await response.json();
      setTestResult(result.success ? 'success' : 'error');
      setTimeout(() => setTestResult(null), 5000);
    } catch (error) {
      console.error('Помилка тестування:', error);
      setTestResult('error');
      setTimeout(() => setTestResult(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationToggle = (type) => {
    setSettings(prev => ({
      ...prev,
      enabledNotifications: prev.enabledNotifications.includes(type)
        ? prev.enabledNotifications.filter(t => t !== type)
        : [...prev.enabledNotifications, type]
    }));
  };

  if (!user) {
    return <div>Будь ласка, увійдіть в систему</div>;
  }

  return (
    <div style={{
      padding: '24px',
      background: '#1a2636',
      borderRadius: '12px',
      margin: '32px auto',
      maxWidth: '800px',
      color: '#fff'
    }}>
      <h2 style={{ marginBottom: '24px', color: '#fff' }}>
        🔔 Налаштування Telegram сповіщень
      </h2>

      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Telegram Chat ID або @username:
        </label>
        <input
          type="text"
          placeholder="Наприклад: 123456789 або @username"
          value={settings.telegramChatId}
          onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid #29506a',
            background: '#22334a',
            color: '#fff',
            fontSize: '14px'
          }}
        />
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#ccc' }}>
          💡 Щоб отримати Chat ID, напишіть боту @userinfobot в Telegram
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px', color: '#fff' }}>Типи сповіщень:</h3>
        {notificationTypes.map(type => (
          <div key={type.key} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px',
            marginBottom: '8px',
            background: '#22334a',
            borderRadius: '6px',
            border: '1px solid #29506a'
          }}>
            <input
              type="checkbox"
              id={type.key}
              checked={settings.enabledNotifications.includes(type.key)}
              onChange={() => handleNotificationToggle(type.key)}
              style={{ marginRight: '12px' }}
            />
            <div>
              <label htmlFor={type.key} style={{ fontWeight: 'bold', cursor: 'pointer' }}>
                {type.label}
              </label>
              <div style={{ fontSize: '12px', color: '#ccc', marginTop: '4px' }}>
                {type.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '16px', color: '#fff' }}>Тестування:</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
              Тестове повідомлення:
            </label>
            <input
              type="text"
              placeholder="Введіть тестове повідомлення"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #29506a',
                background: '#22334a',
                color: '#fff',
                fontSize: '14px'
              }}
            />
          </div>
          <button
            onClick={sendTestMessage}
            disabled={loading || !settings.telegramChatId || !testMessage.trim()}
            style={{
              padding: '12px 24px',
              background: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Відправка...' : 'Тестувати'}
          </button>
        </div>
        {testResult && (
          <div style={{
            marginTop: '8px',
            padding: '8px 12px',
            borderRadius: '4px',
            background: testResult === 'success' ? '#28a745' : '#dc3545',
            color: '#fff',
            fontSize: '14px'
          }}>
            {testResult === 'success' ? '✅ Повідомлення відправлено успішно!' : '❌ Помилка відправки повідомлення'}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={saveSettings}
          disabled={loading}
          style={{
            padding: '12px 24px',
            background: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Збереження...' : 'Зберегти налаштування'}
        </button>
        
        {saved && (
          <div style={{
            padding: '12px 24px',
            background: '#28a745',
            color: '#fff',
            borderRadius: '6px',
            fontSize: '14px'
          }}>
            ✅ Налаштування збережено!
          </div>
        )}
      </div>

      <div style={{ marginTop: '24px', padding: '16px', background: '#22334a', borderRadius: '6px' }}>
        <h4 style={{ marginBottom: '12px', color: '#fff' }}>📋 Інструкція:</h4>
        <ol style={{ fontSize: '14px', color: '#ccc', lineHeight: '1.6' }}>
          <li>Створіть бота в Telegram через @BotFather</li>
          <li>Отримайте Chat ID через @userinfobot</li>
          <li>Введіть Chat ID у поле вище</li>
          <li>Виберіть типи сповіщень</li>
          <li>Протестуйте відправку</li>
          <li>Збережіть налаштування</li>
        </ol>
      </div>
    </div>
  );
};

export default NotificationSettings;
