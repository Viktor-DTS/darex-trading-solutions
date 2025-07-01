import React, { useState, useEffect, useMemo } from 'react';
import ModalTaskForm from '../ModalTaskForm';
import { columnsSettingsAPI } from '../utils/columnsSettingsAPI';

function ColumnSettings({ allColumns, selected, onChange, onClose, onReset, user, onExport, onImport, onSave }) {
  return (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',color:'#111',padding:32,borderRadius:8,minWidth:320,maxWidth:500}}>
        <h3>Налаштування колонок</h3>
        {user && (
          <div style={{marginBottom:16,fontSize:'14px',color:'#666',padding:'8px 12px',background:'#f5f5f5',borderRadius:'4px'}}>
            <strong>Користувач:</strong> {user.name || user.login} ({user.role})
          </div>
        )}
        <div style={{marginBottom:16,fontSize:'14px',color:'#666'}}>
          Виберіть колонки для відображення та їх порядок
          <br />
          <small style={{color:'#888'}}>
            Вибрано: {selected.length} з {allColumns.length} колонок
          </small>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:400,overflowY:'auto',marginBottom:16}}>
          {allColumns.map(col => (
            <label key={col.key} style={{fontWeight:600,display:'flex',alignItems:'center',gap:8,padding:'4px 0'}}>
              <input 
                type="checkbox" 
                checked={selected.includes(col.key)} 
                onChange={e => {
                  if (e.target.checked) onChange([...selected, col.key]);
                  else onChange(selected.filter(k => k !== col.key));
                }} 
              /> 
              <span>{col.label}</span>
            </label>
          ))}
        </div>
        <div style={{display:'flex',gap:12,marginTop:24}}>
          <button onClick={onReset} style={{flex:1,background:'#ff9800',color:'#fff',border:'none',padding:'8px',borderRadius:'4px',cursor:'pointer'}}>
            Скинути до стандартних
          </button>
          <button onClick={() => { onSave(selected); onClose(); }} style={{flex:1,background:'#1976d2',color:'#fff',border:'none',padding:'8px',borderRadius:'4px',cursor:'pointer'}}>
            Зберегти
          </button>
        </div>
        <div style={{marginTop:16,padding:'12px',background:'#f9f9f9',borderRadius:'4px',fontSize:'12px',color:'#666'}}>
          <strong>💡 Порада:</strong> Ви можете експортувати свої налаштування для збереження або перенесення на інший комп'ютер.
        </div>
      </div>
    </div>
  );
}

export default function TaskTable({
  tasks = [],
  allTasks = [],
  onApprove,
  onStatusChange,
  role = 'service',
  filters,
  onFilterChange,
  columns,
  approveField,
  commentField,
  statusOptions = ['Новий', 'В роботі', 'Виконано', 'Заблоковано'],
  onEdit,
  onDelete,
  dateRange,
  setDateRange,
  user,
}) {
  console.log('[LOG] TaskTable received columns:', columns);
  console.log('[LOG] TaskTable role:', role);
  
  // Всі хуки повинні бути на початку компонента
  const [showSettings, setShowSettings] = useState(false);
  const [infoTask, setInfoTask] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [savedSettingsCount, setSavedSettingsCount] = useState(0);
  const [sortField, setSortField] = useState('requestDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filter, setFilter] = useState('');
  const [rejectModal, setRejectModal] = useState({ open: false, taskId: null, comment: '' });
  const [editDateModal, setEditDateModal] = useState({ open: false, taskId: null, month: '', year: '' });
  
  // Персоналізований ключ для кожного користувача
  const userLogin = user?.login || 'default';
  const area = role; // Використовуємо role як область
  
  const allColumns = columns;
  const defaultKeys = useMemo(() => columns.map(c => c.key), [columns]);
  
  // Змінюємо ініціалізацію стану - не встановлюємо defaultKeys одразу
  const [selected, setSelected] = useState([]);
  
  // Додаємо логування при зміні selected
  useEffect(() => {
    console.log('[LOG] Стан selected змінився:', { selected, length: selected.length });
  }, [selected]);
  
  // Завантаження налаштувань з сервера при ініціалізації
  useEffect(() => {
    let isMounted = true;
    const loadUserSettings = async () => {
      console.log('[DEBUG] Виклик loadSettings для', userLogin, area);
      if (user?.login && area && columns.length > 0) {
        setIsLoadingSettings(true);
        try {
          const settings = await columnsSettingsAPI.loadSettings(userLogin, area);
          console.log('[DEBUG] loadSettings повернув:', settings, 'для', userLogin, area);
          
          if (isMounted) {
            // Перевіряємо, чи всі ключі з налаштувань існують у поточних колонках
            if (settings.visible && 
                settings.visible.length > 0 && 
                settings.visible.every(k => columns.some(c => c.key === k))) {
              console.log('[DEBUG] Встановлюємо збережені налаштування:', settings.visible);
              setSelected(settings.visible);
            } else {
              // Якщо налаштування невалідні, встановлюємо стандартні
              console.log('[DEBUG] Скидаємо на стандартні (defaultKeys):', defaultKeys);
              setSelected(defaultKeys);
            }
          }
        } catch (error) {
          console.error('[DEBUG] Помилка завантаження налаштувань:', error);
          if (isMounted) {
            setSelected(defaultKeys);
          }
        } finally {
          if (isMounted) setIsLoadingSettings(false);
        }
      } else {
        // Якщо немає користувача, області або колонок, встановлюємо стандартні
        if (isMounted) {
          console.log('[DEBUG] Немає користувача/області/колонок, встановлюємо стандартні:', defaultKeys);
          setSelected(defaultKeys);
          setIsLoadingSettings(false);
        }
      }
    };
    loadUserSettings();
    return () => { isMounted = false; };
  }, [user?.login, area, columns]);
  
  // Завантаження кількості збережених налаштувань
  useEffect(() => {
    const loadSettingsCount = async () => {
      try {
        const users = await columnsSettingsAPI.getAllUsers();
        let count = 0;
        users.forEach(user => {
          if (user.columnsSettings) {
            count += Object.keys(user.columnsSettings).length;
          }
        });
        setSavedSettingsCount(count);
      } catch (error) {
        console.error('Помилка завантаження кількості налаштувань:', error);
      }
    };
    loadSettingsCount();
  }, []);
  
  const visibleColumns = selected
    .map(key => allColumns.find(c => c.key === key))
    .filter(Boolean);
    
  // Додаємо перевірку завантаження налаштувань
  if (isLoadingSettings || selected.length === 0) {
    return (
      <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'200px',color:'#666'}}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'24px',marginBottom:'8px'}}>⏳</div>
          <div>Завантаження налаштувань колонок...</div>
        </div>
      </div>
    );
  }
  
  const handleSettingsSave = async (cols) => {
    console.log('[DEBUG] Виклик saveSettings для', userLogin, area, cols);
    console.log('[DEBUG] user:', user);
    console.log('[DEBUG] user?.login:', user?.login);
    console.log('[DEBUG] area:', area);
    setSelected(cols);
    if (user?.login && area) {
      try {
        console.log('[DEBUG] Відправляємо запит на збереження...');
        const success = await columnsSettingsAPI.saveSettings(userLogin, area, cols, cols);
        console.log('[DEBUG] saveSettings результат:', success);
        if (!success) {
          console.error('Помилка збереження налаштувань');
          alert('Помилка збереження налаштувань. Спробуйте ще раз.');
        } else {
          console.log('[DEBUG] Налаштування успішно збережено!');
          // Оновлюємо лічильник збережених налаштувань
          const users = await columnsSettingsAPI.getAllUsers();
          let count = 0;
          users.forEach(user => {
            if (user.columnsSettings) {
              count += Object.keys(user.columnsSettings).length;
            }
          });
          setSavedSettingsCount(count);
          console.log('[DEBUG] Оновлено лічильник налаштувань:', count);
        }
      } catch (error) {
        console.error('Помилка збереження налаштувань:', error);
        alert('Помилка збереження налаштувань: ' + error.message);
      }
    } else {
      console.error('[DEBUG] Не можна зберегти - відсутні user.login або area');
      console.error('[DEBUG] user?.login:', user?.login);
      console.error('[DEBUG] area:', area);
    }
    setShowSettings(false);
  };
  
  const handleResetSettings = async () => {
    setSelected(defaultKeys);
    if (user?.login && area) {
      try {
        const success = await columnsSettingsAPI.saveSettings(userLogin, area, defaultKeys, defaultKeys);
        if (!success) {
          console.error('Помилка збереження стандартних налаштувань');
          alert('Помилка збереження стандартних налаштувань. Спробуйте ще раз.');
        }
      } catch (error) {
        console.error('Помилка збереження стандартних налаштувань:', error);
        alert('Помилка збереження стандартних налаштувань: ' + error.message);
      }
    }
    setShowSettings(false);
  };
  
  const handleExportSettings = () => {
    const settings = {
      user: user?.login || 'default',
      area: area,
      visible: selected,
      order: selected,
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `table-settings-${user?.login || 'default'}-${area}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleImportSettings = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const settings = JSON.parse(e.target.result);
        if (settings.user === (user?.login || 'default') && settings.area === area) {
          // Перевіряємо, чи всі ключі є у columns
          if (Array.isArray(settings.visible) && settings.visible.every(k => columns.some(c => c.key === k))) {
            setSelected(settings.visible);
            if (user?.login && area) {
              const success = await columnsSettingsAPI.saveSettings(userLogin, area, settings.visible, settings.order || settings.visible);
              if (success) {
                alert('Налаштування успішно імпортовано та збережено!');
              } else {
                alert('Налаштування імпортовано, але виникла помилка збереження');
              }
            } else {
              alert('Налаштування успішно імпортовано!');
            }
          } else {
            alert('Помилка: деякі колонки не знайдено в поточній конфігурації');
          }
        } else {
          alert('Помилка: файл налаштувань не відповідає поточному користувачу або області');
        }
      } catch (error) {
        alert('Помилка при імпорті налаштувань: ' + error.message);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Очищаємо input
  };
  
  const handleViewAllSettings = async () => {
    try {
      const users = await columnsSettingsAPI.getAllUsers();
      const allSettings = [];
      
      users.forEach(user => {
        if (user.columnsSettings) {
          Object.entries(user.columnsSettings).forEach(([area, settings]) => {
            allSettings.push({
              user: user.login,
              area: area,
              count: settings.visible ? settings.visible.length : 0
            });
          });
        }
      });
      
      const settingsText = allSettings.map(s => 
        `${s.user} (${s.area}): ${s.count} колонок`
      ).join('\n');
      
      alert(`Збережені налаштування:\n\n${settingsText || 'Налаштування не знайдено'}`);
    } catch (error) {
      alert('Помилка отримання налаштувань: ' + error.message);
    }
  };
  
  const handleClearAllSettings = async () => {
    if (confirm('Ви впевнені, що хочете очистити всі збережені налаштування колонок для всіх користувачів?')) {
      try {
        const users = await columnsSettingsAPI.getAllUsers();
        let clearedCount = 0;
        
        for (const user of users) {
          if (user.columnsSettings) {
            user.columnsSettings = {};
            const success = await columnsSettingsAPI.saveUser(user);
            if (success) clearedCount++;
          }
        }
        
        alert(`Очищено налаштування для ${clearedCount} користувачів`);
        
        // Скидаємо поточні налаштування до стандартних
        setSelected(defaultKeys);
      } catch (error) {
        alert('Помилка очищення налаштувань: ' + error.message);
      }
    }
  };
  
  const statusOrder = {
    'Новий': 1,
    'В роботі': 2,
    'Виконано': 3,
    'Заблоковано': 4,
  };
  const sortedTasks = [...tasks].sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));

  // Додаю функцію для визначення кольору рядка
  function getRowColor(t) {
    // Перевіряємо, чи хтось відхилив заявку
    if (t.approvedByAccountant === 'Відмова' || t.approvedByWarehouse === 'Відмова' || t.approvedByRegionalManager === 'Відмова') {
      return '#ff9999'; // Більш насичений червоний колір для відхилених заявок
    }
    
    const acc = t.approvedByAccountant === true || t.approvedByAccountant === 'Підтверджено';
    const wh = t.approvedByWarehouse === true || t.approvedByWarehouse === 'Підтверджено';
    const reg = t.approvedByRegionalManager === true || t.approvedByRegionalManager === 'Підтверджено';
    
    if (acc && wh && reg) return 'linear-gradient(90deg, #ffb6e6 33%, #ffe066 33%, #66d9ff 66%)';
    if (acc && wh) return 'linear-gradient(90deg, #ffb6e6 50%, #ffe066 50%)';
    if (acc && reg) return 'linear-gradient(90deg, #ffb6e6 50%, #66d9ff 50%)';
    if (wh && reg) return 'linear-gradient(90deg, #ffe066 50%, #66d9ff 50%)';
    if (acc) return '#ffb6e6';
    if (wh) return '#ffe066';
    if (reg) return '#66d9ff';
    return '';
  }

  // Вибір історії по замовнику
  const getClientHistory = (client) => (allTasks.length ? allTasks : tasks).filter(t => t.client === client);

  // Модалка інформації
  function InfoModal({task, onClose, history}) {
    if (!task || !task.requestDate) return null;
    return (
      <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'#fff',color:'#111',padding:48,borderRadius:0,width:'100vw',height:'100vh',overflowY:'auto',fontSize:'1.15rem',boxSizing:'border-box',display:'flex',flexDirection:'column'}}>
          <h2 style={{marginTop:0,marginBottom:24}}>Історія проведення робіт по замовнику: {task.client}</h2>
          <div style={{flex:1,overflowY:'auto',background:'#f7f7fa',padding:16,borderRadius:8}}>
            {history.length === 0 ? <div>Історія відсутня</div> :
              <ul style={{margin:0,padding:0,listStyle:'none'}}>
                {history.map(h => (
                  <li key={h.id} style={{marginBottom:16,paddingBottom:16,borderBottom:'1px solid #eee'}}>
                    <b>Дата заявки:</b> {h.requestDate} <b>Статус:</b> {h.status}<br/>
                    <b>Найменування робіт:</b> {h.work}<br/>
                    <b>Дата проведення робіт:</b> {h.date}<br/>
                    <b>Регіон сервісного відділу:</b> {h.serviceRegion}<br/>
                    <b>Сервісний інженер №1:</b> {h.engineer1}<br/>
                    <b>Сервісний інженер №2:</b> {h.engineer2}<br/>
                    <b>Загальна сума послуги:</b> {h.serviceTotal}<br/>
                    <b>Вид оплати:</b> {h.paymentType}<br/>
                    <b>Номер рахунку:</b> {h.invoice}<br/>
                    <b>Адреса:</b> {h.address}<br/>
                    <b>Заводський номер обладнання:</b> {h.equipmentSerial}<br/>
                    <b>Тип обладнання:</b> {h.equipment}<br/>
                    <b>Опис:</b> {h.requestDesc}
                  </li>
                ))}
              </ul>
            }
          </div>
          <div style={{display:'flex',gap:12,marginTop:32}}>
            <button onClick={onClose} style={{flex:1,fontSize:'1.1rem',padding:'16px 0'}}>Закрити</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Додаю функцію для підтвердження відмови ---
  const handleRejectConfirm = () => {
    if (rejectModal.taskId && onApprove) {
      onApprove(rejectModal.taskId, 'Відмова', rejectModal.comment);
    }
    setRejectModal({ open: false, taskId: null, comment: '' });
  };
  const handleRejectCancel = () => {
    setRejectModal({ open: false, taskId: null, comment: '' });
  };

  // --- Drag and drop для колонок ---
  const handleDragStart = (e, idx) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('colIdx', idx);
  };
  
  const handleDrop = async (e, idx) => {
    const fromIdx = +e.dataTransfer.getData('colIdx');
    if (fromIdx === idx) return;
    const newOrder = [...selected];
    const [removed] = newOrder.splice(fromIdx, 1);
    newOrder.splice(idx, 0, removed);
    setSelected(newOrder);
    
    // Зберігаємо новий порядок через API
    if (user?.login && area) {
      try {
        const success = await columnsSettingsAPI.saveSettings(userLogin, area, newOrder, newOrder);
        if (!success) {
          console.error('Помилка збереження порядку колонок');
        }
      } catch (error) {
        console.error('Помилка збереження порядку колонок:', error);
      }
    }
  };
  
  const handleDragOver = e => e.preventDefault();

  // --- ФУНКЦІЯ для збереження нової дати підтвердження ---
  const handleSaveBonusDate = () => {
    if (!editDateModal.taskId || !editDateModal.month || !editDateModal.year) return;
    const newDate = `${editDateModal.month.padStart(2, '0')}.${editDateModal.year}`;
    if (onEdit) {
      // Знаходимо завдання та викликаємо onEdit з оновленим полем bonusApprovalDate
      const task = tasks.find(t => t.id === editDateModal.taskId);
      if (task) {
        onEdit({ ...task, bonusApprovalDate: newDate });
      }
    }
    setEditDateModal({ open: false, taskId: null, month: '', year: '' });
  };

  // --- МАСИВИ для вибору місяця та року ---
  const months = [
    '01','02','03','04','05','06','07','08','09','10','11','12'
  ];
  const years = [];
  const now = new Date();
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) years.push(String(y));

  return (
    <>
      {/* Вкладки, фільтри, кнопки — окремий контейнер */}
      <div style={{marginBottom: 24}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12,flexWrap:'wrap'}}>
          <button 
            onClick={()=>setShowSettings(true)} 
            style={{
              background:'#1976d2',
              color:'#fff',
              border:'none',
              padding:'8px 16px',
              borderRadius:'4px',
              cursor:'pointer',
              display:'flex',
              alignItems:'center',
              gap:8
            }}
            disabled={isLoadingSettings}
          >
            <span>⚙️</span>
            <span>Налаштувати колонки</span>
            {isLoadingSettings && <span style={{fontSize:'12px'}}>⏳</span>}
            {!isLoadingSettings && selected.length !== defaultKeys.length && (
              <span style={{background:'#ff9800',color:'#fff',padding:'2px 6px',borderRadius:'10px',fontSize:'10px'}}>
                Персоналізовано
              </span>
            )}
          </button>
          
          {/* Група кнопок для персоналізованих налаштувань */}
          {selected.length !== defaultKeys.length && (
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:'12px',color:'#666'}}>|</span>
              <button 
                onClick={handleResetSettings}
                style={{
                  background:'#ff9800',
                  color:'#fff',
                  border:'none',
                  padding:'6px 12px',
                  borderRadius:'4px',
                  cursor:'pointer',
                  fontSize:'12px'
                }}
              >
                Скинути
              </button>
              <button 
                onClick={handleExportSettings}
                style={{
                  background:'#4caf50',
                  color:'#fff',
                  border:'none',
                  padding:'6px 12px',
                  borderRadius:'4px',
                  cursor:'pointer',
                  fontSize:'12px'
                }}
                title="Експортувати налаштування"
              >
                📤 Експорт
              </button>
            </div>
          )}
          
          {/* Група кнопок для імпорту та адміністративних функцій */}
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{fontSize:'12px',color:'#666'}}>|</span>
            <label style={{
              background:'#2196f3',
              color:'#fff',
              border:'none',
              padding:'6px 12px',
              borderRadius:'4px',
              cursor:'pointer',
              fontSize:'12px',
              display:'inline-block'
            }}>
              📥 Імпорт
              <input 
                type="file" 
                accept=".json" 
                onChange={handleImportSettings} 
                style={{display:'none'}}
              />
            </label>
            <button 
              onClick={handleViewAllSettings}
              style={{
                background:'#9c27b0',
                color:'#fff',
                border:'none',
                padding:'6px 12px',
                borderRadius:'4px',
                cursor:'pointer',
                fontSize:'12px'
              }}
              title="Переглянути всі збережені налаштування"
            >
              👁️ Переглянути
            </button>
            <button 
              onClick={handleClearAllSettings}
              style={{
                background:'#f44336',
                color:'#fff',
                border:'none',
                padding:'6px 12px',
                borderRadius:'4px',
                cursor:'pointer',
                fontSize:'12px'
              }}
              title="Очистити всі налаштування"
            >
              🗑️ Очистити
            </button>
          </div>
        </div>
        {user && (
          <div style={{marginBottom:12,padding:'8px 12px',background:'#e3f2fd',borderRadius:'4px',fontSize:'12px',color:'#1976d2'}}>
            <strong>👤 Персоналізація:</strong> Налаштування зберігаються окремо для користувача <strong>{user.name || user.login}</strong> 
            в області <strong>{area === 'service' ? 'Сервісний відділ' : 
                           area === 'operator' ? 'Оператор' : 
                           area === 'warehouse' ? 'Склад' : 
                           area === 'accountant' ? 'Бухгалтерія' : 
                           area === 'regionalManager' ? 'Регіональний менеджер' : 
                           area === 'admin' ? 'Адміністратор' : area}</strong>
            <br />
            <small style={{color:'#666'}}>
              💾 В системі збережено: <strong>{savedSettingsCount}</strong> налаштувань користувачів
              {isLoadingSettings && <span style={{marginLeft:8}}>⏳ Завантаження...</span>}
            </small>
          </div>
        )}
        {showSettings && (
          <ColumnSettings
            allColumns={allColumns}
            selected={selected}
            onChange={setSelected}
            onClose={()=>setShowSettings(false)}
            onReset={handleResetSettings}
            user={user}
            onExport={handleExportSettings}
            onImport={handleImportSettings}
            onSave={handleSettingsSave}
          />
        )}
        {/* СПІЛЬНИЙ КОНТЕЙНЕР для фільтрів і таблиці */}
        <div style={{width:'97vw',maxWidth:'none',margin:'0 auto'}}>
          {/* Окремий контейнер для таблиці з sticky-заголовками */}
          <style>{`
            .table-scroll {
              max-height: 60vh;
              overflow: auto;
              width: 100%;
            }
            .sticky-table {
              min-width: 2000px;
              width: 100%;
              background: #22334a;
              color: #fff;
              border-radius: 8px;
              border-spacing: 0;
              table-layout: auto;
            }
            .sticky-table thead th {
              position: sticky;
              top: 0;
              z-index: 2;
              background: #1976d2;
              white-space: nowrap;
              padding: 8px 4px;
              vertical-align: top;
              min-width: 120px;
            }
            .sticky-table thead th input {
              background: #fff;
              color: #333;
              border: 1px solid #ccc;
              border-radius: 2px;
              font-size: 10px;
              padding: 2px;
            }
            .sticky-table thead th input:focus {
              outline: none;
              border-color: #00bfff;
              box-shadow: 0 0 2px #00bfff;
            }
            .sticky-table th, .sticky-table td {
              white-space: nowrap;
            }
            .table-scroll::-webkit-scrollbar {
              height: 12px;
              background: #22334a;
            }
            .table-scroll::-webkit-scrollbar-thumb {
              background: #00bfff;
              border-radius: 6px;
            }
            .table-scroll::-webkit-scrollbar-track {
              background: #22334a;
            }
            .table-scroll {
              scrollbar-color: #00bfff #22334a;
              scrollbar-width: thin;
            }
          `}</style>
          <div className="table-scroll">
            <table className="sticky-table">
              <thead>
                <tr>
                  <th>Дія</th>
                  {(role === 'warehouse' || role === 'regional' || role === 'accountant' || role === 'regionalManager') && approveField && <th>Підтвердження</th>}
                  {visibleColumns.map((col, idx) => (
                    <th
                      key={col.key}
                      draggable
                      onDragStart={e => handleDragStart(e, idx)}
                      onDrop={e => handleDrop(e, idx)}
                      onDragOver={handleDragOver}
                      style={{cursor:'move',background:'#1976d2'}}
                    >
                      <div style={{marginBottom:4}}>{col.label}</div>
                      {col.filter && (
                        col.key === 'date' || col.key === 'requestDate' ? (
                          <div style={{display:'flex',flexDirection:'column',minWidth:120}}>
                            <input type="date" name={col.key+"From"} value={filters[col.key+"From"] || ''} onChange={onFilterChange} style={{marginBottom:2}} />
                            <input type="date" name={col.key+"To"} value={filters[col.key+"To"] || ''} onChange={onFilterChange} />
                          </div>
                        ) : (
                          <input
                            name={col.key}
                            placeholder={col.label}
                            value={filters[col.key] || ''}
                            onChange={onFilterChange}
                            style={{width:'100%'}}
                          />
                        )
                      )}
                    </th>
                  ))}
                  <th>Статус</th>
                  {role === 'admin' && <th>Дата підтвердження</th>}
                  {role !== 'warehouse' && role !== 'regional' && role !== 'accountant' && role !== 'regionalManager' && role !== 'admin' && approveField && <th>Підтвердження</th>}
                  {commentField && <th>Коментар</th>}
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map(t => (
                  <tr key={t.id} style={getRowColor(t) ? {background:getRowColor(t)} : {}}>
                    <td style={getRowColor(t) ? {color:'#111'} : {}}>
                      <button onClick={()=>{setInfoTask(t);setShowInfo(true);}} style={{marginRight:8,background:'#00bfff',color:'#fff'}}>Історія проведення робіт</button>
                      {(role === 'service' || role === 'operator' || role === 'admin') && (
                        <>
                          <button onClick={()=>onEdit && onEdit(t)} style={{marginRight:8}}>Редагувати</button>
                          {role === 'service' && (
                          <button onClick={()=>onDelete && onDelete(t.id)} style={{background:'#f66',color:'#fff'}}>Видалити</button>
                          )}
                        </>
                      )}
                      {(role === 'warehouse' || role === 'accountant' || role === 'regionalManager' || role === 'regional') && (
                        <button onClick={()=>onEdit && onEdit(t)}>Редагувати</button>
                      )}
                    </td>
                    {(role === 'warehouse' || role === 'regional' || role === 'accountant' || role === 'regionalManager') && approveField && (
                      <td style={getRowColor(t) ? {color:'#111'} : {}}>
                        {t.status === 'Виконано' ? (
                          <>
                            <button onClick={()=>{onApprove(t.id, 'Підтверджено', '');}} style={{background:'#0a0',color:'#fff',marginRight:8}}>Підтвердити</button>
                            <button onClick={()=>setRejectModal({ open: true, taskId: t.id, comment: '' })} style={{background:'#f66',color:'#fff',marginRight:8}}>Відхилити</button>
                            <button onClick={()=>{onApprove(t.id, 'На розгляді', '');}} style={{background:'#ffe066',color:'#22334a',marginRight:8}}>На розгляді</button>
                            <span style={t[approveField] === 'Підтверджено' ? {color:'#0f0', fontWeight:600} : t[approveField] === 'Відмова' ? {color:'#f00', fontWeight:600} : {color:'#aaa'}}>
                              {t[approveField] === 'Підтверджено' ? 'Підтверджено' : t[approveField] === 'Відмова' ? 'Відхилено' : 'На розгляді'}
                            </span>
                          </>
                        ) : <span style={{color:'#aaa'}}>—</span>}
                      </td>
                    )}
                    {visibleColumns.map(col => <td key={col.key} style={getRowColor(t) ? {color:'#111'} : {}}>{
                      col.key === 'approvedByWarehouse' ? (t.approvedByWarehouse === 'Підтверджено' ? 'Підтверджено' : t.approvedByWarehouse === 'Відмова' ? 'Відмова' : 'На розгляді') :
                      col.key === 'approvedByAccountant' ? (t.approvedByAccountant === 'Підтверджено' ? 'Підтверджено' : t.approvedByAccountant === 'Відмова' ? 'Відмова' : 'На розгляді') :
                      col.key === 'approvedByRegionalManager' ? (t.approvedByRegionalManager === 'Підтверджено' ? 'Підтверджено' : t.approvedByRegionalManager === 'Відмова' ? 'Відхилено' : 'На розгляді') :
                      t[col.key]
                    }</td>)}
                    <td style={getRowColor(t) ? {color:'#111'} : {}}>{t.status}</td>
                    {role === 'admin' && <td style={getRowColor(t) ? {color:'#111'} : {}}>
                      {(t.bonusApprovalDate || t.approvalDate || '')}
                      <button style={{marginLeft:8}} onClick={() => {
                        let mm = '', yyyy = '';
                        const val = t.bonusApprovalDate || t.approvalDate || '';
                        if (/^\d{2}\.\d{4}$/.test(val)) {
                          [mm, yyyy] = val.split('.');
                        } else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                          yyyy = val.slice(0,4); mm = val.slice(5,7);
                        } else {
                          mm = String(now.getMonth()+1).padStart(2,'0');
                          yyyy = String(now.getFullYear());
                        }
                        setEditDateModal({ open: true, taskId: t.id, month: mm, year: yyyy });
                      }}>Змінити</button>
                    </td>}
                    {role !== 'warehouse' && role !== 'regional' && role !== 'accountant' && role !== 'regionalManager' && role !== 'admin' && approveField && (
                      <td style={getRowColor(t) ? {color:'#111'} : {}}>
                        {t.status === 'Виконано' ? (
                          <>
                            <button onClick={()=>{onApprove(t.id, 'Підтверджено', '');}} style={{background:'#0a0',color:'#fff',marginRight:8}}>Підтвердити</button>
                            <button onClick={()=>setRejectModal({ open: true, taskId: t.id, comment: '' })} style={{background:'#f66',color:'#fff',marginRight:8}}>Відхилити</button>
                            <button onClick={()=>{onApprove(t.id, 'На розгляді', '');}} style={{background:'#ffe066',color:'#22334a',marginRight:8}}>На розгляді</button>
                            <span style={t[approveField] === 'Підтверджено' ? {color:'#0f0', fontWeight:600} : t[approveField] === 'Відмова' ? {color:'#f00', fontWeight:600} : {color:'#aaa'}}>
                              {t[approveField] === 'Підтверджено' ? 'Підтверджено' : t[approveField] === 'Відмова' ? 'Відхилено' : 'На розгляді'}
                            </span>
                          </>
                        ) : <span style={{color:'#aaa'}}>—</span>}
                      </td>
                    )}
                    {commentField && (
                      <td style={getRowColor(t) ? {color:'#111'} : {}}>
                        <input
                          value={t[commentField]||''}
                          onChange={e => {onApprove(t.id, t[approveField], e.target.value);}}
                          placeholder="Коментар"
                          style={getRowColor(t) ? {width:120, color:'#111', background:'#fff'} : {width:120}}
                          disabled={t[approveField] !== false}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Індикатор кількості рядків та кнопка "На початок" */}
          <div style={{padding:'8px 16px', background:'#22334a', color:'#fff', borderTop:'1px solid #444', fontSize:'14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <span>Всього рядків: {sortedTasks.length}</span>
            <button 
              onClick={() => {
                const container = document.querySelector('.table-scroll');
                if (container) {
                  container.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                }
              }}
              style={{
                background:'#00bfff',
                color:'#fff',
                border:'none',
                padding:'4px 12px',
                borderRadius:'4px',
                cursor:'pointer',
                fontSize:'12px'
              }}
            >
              ↑ На початок
            </button>
          </div>
          {showInfo && infoTask && (
            <InfoModal task={infoTask} onClose={()=>setShowInfo(false)} history={getClientHistory(infoTask.client).filter(h=>h.status === 'Виконано')} />
          )}
        </div>
      </div>
      {/* --- Модальне вікно для опису відмови --- */}
      {rejectModal.open && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#22334a',padding:32,borderRadius:8,minWidth:320,maxWidth:400,boxShadow:'0 4px 32px #0008',color:'#fff',display:'flex',flexDirection:'column',gap:16}}>
            <h3>Вкажіть опис відмови</h3>
            <textarea
              style={{minHeight:60,background:'#1a2636',color:'#fff',border:'1px solid #444',borderRadius:4,padding:8}}
              value={rejectModal.comment}
              onChange={e => setRejectModal({ ...rejectModal, comment: e.target.value })}
              placeholder="Введіть причину відмови..."
            />
            <div style={{display:'flex',gap:12,marginTop:8}}>
              <button type="button" style={{flex:1,background:'#d32f2f',color:'#fff'}} onClick={handleRejectConfirm} disabled={!rejectModal.comment.trim()}>Підтвердити відмову</button>
              <button type="button" style={{flex:1,background:'#888',color:'#fff'}} onClick={handleRejectCancel}>Скасувати</button>
            </div>
          </div>
        </div>
      )}
      {/* --- Модальне вікно для зміни дати підтвердження премії --- */}
      {role === 'admin' && editDateModal.open && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:4000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#22334a',padding:32,borderRadius:8,minWidth:320,maxWidth:400,boxShadow:'0 4px 32px #0008',color:'#fff',display:'flex',flexDirection:'column',gap:16}}>
            <h3>Змінити дату підтвердження премії</h3>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <label>Місяць:
                <select value={editDateModal.month} onChange={e => setEditDateModal(m => ({...m, month: e.target.value}))} style={{marginLeft:8}}>
                  <option value="">--</option>
                  {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>Рік:
                <select value={editDateModal.year} onChange={e => setEditDateModal(m => ({...m, year: e.target.value}))} style={{marginLeft:8}}>
                  <option value="">--</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            </div>
            <div style={{display:'flex',gap:12,marginTop:16}}>
              <button type="button" style={{flex:1,background:'#00bfff',color:'#fff'}} onClick={handleSaveBonusDate} disabled={!editDateModal.month || !editDateModal.year}>Зберегти</button>
              <button type="button" style={{flex:1,background:'#888',color:'#fff'}} onClick={()=>setEditDateModal({ open: false, taskId: null, month: '', year: '' })}>Відмінити</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 