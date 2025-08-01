import React, { useState, useEffect, useMemo, useRef } from 'react';
import ModalTaskForm from '../ModalTaskForm';
import { columnsSettingsAPI } from '../utils/columnsSettingsAPI';

function ColumnSettings({ allColumns, selected, onChange, onClose, onSave }) {
  return (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',color:'#111',padding:32,borderRadius:8,minWidth:320,maxWidth:500}}>
        <h3>Налаштування колонок</h3>
        <div style={{marginBottom:16,fontSize:'14px',color:'#666'}}>
          Виберіть колонки для відображення
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
          <button onClick={() => { onSave(selected); onClose(); }} style={{flex:1,background:'#1976d2',color:'#fff',border:'none',padding:'8px',borderRadius:'4px',cursor:'pointer'}}>
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskTableComponent({
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
  isArchive = false,
}) {
  console.log('[LOG] TaskTable received columns:', columns);
  console.log('[LOG] TaskTable role:', role);
  console.log('[LOG] TaskTable user:', user);
  console.log('[LOG] TaskTable onDelete:', onDelete);
  console.log('[LOG] TaskTable user?.role:', user?.role);
  
  // Всі хуки повинні бути на початку компонента
  const [showSettings, setShowSettings] = useState(false);
  const [infoTask, setInfoTask] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [sortField, setSortField] = useState('requestDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filter, setFilter] = useState('');
  const [rejectModal, setRejectModal] = useState({ open: false, taskId: null, comment: '' });
  const [editDateModal, setEditDateModal] = useState({ open: false, taskId: null, month: '', year: '' });
  
  // Додаю стан для сортування
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });
  
  // Персоналізований ключ для кожного користувача
  const userLogin = user?.login || 'default';
  const area = role; // Використовуємо role як область
  
  const allColumns = columns;
  
  // Використовуємо useRef для стабільних значень
  const defaultKeysRef = useRef(null);
  const userLoginRef = useRef(null);
  const areaRef = useRef(null);
  
  // Оновлюємо refs тільки коли дійсно змінюються
  if (defaultKeysRef.current === null || 
      JSON.stringify(defaultKeysRef.current) !== JSON.stringify(columns.map(c => c.key))) {
    defaultKeysRef.current = columns.map(c => c.key);
    console.log('[DEBUG] defaultKeysRef оновлено:', defaultKeysRef.current.length, 'keys');
  }
  
  if (userLoginRef.current !== userLogin) {
    userLoginRef.current = userLogin;
    console.log('[DEBUG] userLoginRef оновлено:', userLogin);
  }
  
  if (areaRef.current !== area) {
    areaRef.current = area;
    console.log('[DEBUG] areaRef оновлено:', area);
  }
  
  // Додаємо стан для завантаження налаштувань
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [selected, setSelected] = useState([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  // Додаємо логування при зміні selected
  useEffect(() => {
    console.log('[LOG] Стан selected змінився:', { selected, length: selected.length });
  }, [selected]);
  
  // Скидаємо settingsLoaded при зміні користувача або області
  useEffect(() => {
    const prevUserLogin = userLoginRef.current;
    const prevArea = areaRef.current;
    
    if (prevUserLogin !== userLogin || prevArea !== area) {
      console.log('[DEBUG] Користувач або область змінилася, скидаємо settingsLoaded');
      console.log('[DEBUG] Попередній userLogin:', prevUserLogin, 'новий:', userLogin);
      console.log('[DEBUG] Попередня area:', prevArea, 'нова:', area);
      setSettingsLoaded(false);
      setSelected([]);
      setLoadingSettings(true);
    }
  }, [userLogin, area]);
  
  // Функція для отримання кешованих налаштувань
  const getCachedSettings = () => {
    try {
      const cacheKey = `columnSettings_${userLogin}_${area}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        console.log('[DEBUG] Знайдено кешовані налаштування:', parsed);
        return parsed;
      }
    } catch (error) {
      console.log('[DEBUG] Помилка при читанні кешу:', error);
    }
    return null;
  };
  
  // Функція для збереження налаштувань в кеш
  const cacheSettings = (settings) => {
    try {
      const cacheKey = `columnSettings_${userLogin}_${area}`;
      localStorage.setItem(cacheKey, JSON.stringify(settings));
      console.log('[DEBUG] Налаштування збережено в кеш:', settings);
    } catch (error) {
      console.log('[DEBUG] Помилка при збереженні кешу:', error);
    }
  };
  
  // Завантаження налаштувань з сервера при ініціалізації
  useEffect(() => {
    // Якщо налаштування вже завантажені і ми маємо selected, не завантажуємо знову
    // Але тільки якщо не змінився користувач або область
    if (settingsLoaded && selected.length > 0 && !loadingSettings) {
      console.log('[DEBUG] Налаштування вже завантажені, пропускаємо повторне завантаження');
      return;
    }
    
    // Спочатку перевіряємо кеш
    const cachedSettings = getCachedSettings();
    if (cachedSettings && cachedSettings.visible && cachedSettings.visible.length > 0) {
      console.log('[DEBUG] Використовуємо кешовані налаштування');
      setSelected(cachedSettings.visible);
      setSettingsLoaded(true);
      setLoadingSettings(false);
      return;
    }
    
    let isMounted = true;
    const loadUserSettings = async () => {
      setLoadingSettings(true);
      console.log('[DEBUG] === ПОЧАТОК ЗАВАНТАЖЕННЯ НАЛАШТУВАНЬ ===');
      console.log('[DEBUG] userLogin:', userLoginRef.current);
      console.log('[DEBUG] area:', areaRef.current);
      console.log('[DEBUG] user:', user);
      console.log('[DEBUG] columns.length:', columns.length);
      console.log('[DEBUG] defaultKeys:', defaultKeysRef.current);
      
      if (userLoginRef.current && areaRef.current && columns.length > 0) {
        try {
          console.log('[DEBUG] Викликаємо loadSettings...');
          const settings = await columnsSettingsAPI.loadSettings(userLoginRef.current, areaRef.current);
          console.log('[DEBUG] loadSettings повернув:', settings, 'для', userLoginRef.current, areaRef.current);
          
          if (isMounted) {
            // Перевіряємо, чи всі ключі з налаштувань існують у поточних колонках
            if (settings.visible && 
                settings.visible.length > 0 && 
                settings.visible.every(k => columns.some(c => c.key === k))) {
              console.log('[DEBUG] ✅ Встановлюємо збережені налаштування:', settings.visible);
              setSelected(settings.visible);
              setSettingsLoaded(true);
              setLoadingSettings(false);
              
              // Зберігаємо в кеш
              cacheSettings(settings);
            } else {
              // Якщо налаштування невалідні, встановлюємо стандартні
              console.log('[DEBUG] ⚠️ Скидаємо на стандартні (defaultKeys):', defaultKeysRef.current);
              setSelected(defaultKeysRef.current);
              setSettingsLoaded(true);
              
              // Зберігаємо дефолтні налаштування в кеш
              cacheSettings({ visible: defaultKeysRef.current, order: defaultKeysRef.current });
            }
          }
        } catch (error) {
          console.error('[ERROR] Помилка при завантаженні налаштувань:', error);
          if (isMounted) {
            console.log('[DEBUG] ⚠️ Встановлюємо стандартні через помилку:', defaultKeysRef.current);
            setSelected(defaultKeysRef.current);
            setSettingsLoaded(true);
            
            // Зберігаємо дефолтні налаштування в кеш
            cacheSettings({ visible: defaultKeysRef.current, order: defaultKeysRef.current });
          }
        }
      } else {
        // Якщо немає користувача, області або колонок, встановлюємо стандартні
        console.log('[DEBUG] ⚠️ Немає користувача/області/колонок, встановлюємо стандартні:', defaultKeysRef.current);
        console.log('[DEBUG] userLoginRef.current:', userLoginRef.current);
        console.log('[DEBUG] areaRef.current:', areaRef.current);
        console.log('[DEBUG] columns.length:', columns.length);
        if (isMounted) {
          setSelected(defaultKeysRef.current);
          setSettingsLoaded(true);
          
          // Зберігаємо дефолтні налаштування в кеш
          cacheSettings({ visible: defaultKeysRef.current, order: defaultKeysRef.current });
        }
      }
      console.log('[DEBUG] === КІНЕЦЬ ЗАВАНТАЖЕННЯ НАЛАШТУВАНЬ ===');
      if (isMounted) setLoadingSettings(false);
    };
    loadUserSettings();
    return () => { isMounted = false; };
  }, [userLoginRef.current, areaRef.current, defaultKeysRef.current, settingsLoaded]); // Використовуємо refs як залежності
  
  const visibleColumns = selected
    .map(key => allColumns.find(c => c.key === key))
    .filter(Boolean);
    
  // Рендеримо спінер, поки налаштування не завантажено
  if (loadingSettings || selected.length === 0) {
    return (
      <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'200px',color:'#666'}}>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'24px',marginBottom:'8px'}}>⏳</div>
          <div>Завантаження налаштувань колонок...</div>
        </div>
      </div>
    );
  }
  
  const saveSettings = async (cols) => {
    console.log('[DEBUG] === ПОЧАТОК ЗБЕРЕЖЕННЯ НАЛАШТУВАНЬ ===');
    console.log('[DEBUG] Виклик saveSettings для', userLogin, area, cols);
    
    try {
      const result = await columnsSettingsAPI.saveSettings(userLogin, area, cols);
      console.log('[DEBUG] saveSettings результат:', result);
      
      if (result) {
        console.log('[DEBUG] ✅ Налаштування успішно збережено!');
        
        // Зберігаємо в кеш
        cacheSettings({ visible: cols, order: cols });
        
        console.log('[DEBUG] === КІНЕЦЬ ЗБЕРЕЖЕННЯ НАЛАШТУВАНЬ ===');
        return true;
      } else {
        console.log('[DEBUG] ❌ Помилка збереження налаштувань');
        console.log('[DEBUG] === КІНЕЦЬ ЗБЕРЕЖЕННЯ НАЛАШТУВАНЬ ===');
        return false;
      }
    } catch (error) {
      console.error('[ERROR] Помилка при збереженні налаштувань:', error);
      console.log('[DEBUG] === КІНЕЦЬ ЗБЕРЕЖЕННЯ НАЛАШТУВАНЬ ===');
      return false;
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
    if (user?.login && areaRef.current) {
      try {
        console.log('[DEBUG] Зберігаємо новий порядок колонок:', newOrder);
        const success = await columnsSettingsAPI.saveSettings(userLoginRef.current, areaRef.current, newOrder, newOrder);
        if (!success) {
          console.error('Помилка збереження порядку колонок');
        } else {
          console.log('[DEBUG] Порядок колонок успішно збережено');
        }
      } catch (error) {
        console.error('Помилка збереження порядку колонок:', error);
      }
    }
  };
  
  const handleDragOver = e => e.preventDefault();

  // Функція для обробки кліків по заголовках колонок для сортування
  const handleColumnClick = (field) => {
    console.log('[DEBUG] Клік по колонці:', field);
    setSortConfig(prevConfig => {
      if (prevConfig.field === field) {
        // Якщо клікнули на ту саму колонку, змінюємо напрямок
        return {
          field,
          direction: prevConfig.direction === 'asc' ? 'desc' : 'asc'
        };
      } else {
        // Якщо клікнули на нову колонку, встановлюємо asc за замовчуванням
        return {
          field,
          direction: 'asc'
        };
      }
    });
  };

  // Функція для обробки подвійного кліку по заголовках колонок
  const handleColumnDoubleClick = (field) => {
    console.log('[DEBUG] Подвійний клік по колонці:', field);
    setSortConfig(prevConfig => {
      if (prevConfig.field === field) {
        // Якщо подвійно клікнули на ту саму колонку, змінюємо напрямок
        return {
          field,
          direction: prevConfig.direction === 'asc' ? 'desc' : 'asc'
        };
      } else {
        // Якщо подвійно клікнули на нову колонку, встановлюємо asc за замовчуванням
        return {
          field,
          direction: 'asc'
        };
      }
    });
  };

  // Функція для визначення типу поля
  const getFieldType = (field) => {
    // Поля дат
    const dateFields = ['requestDate', 'date', 'paymentDate', 'approvalDate', 'bonusApprovalDate'];
    if (dateFields.includes(field)) return 'date';
    
    // Числові поля
    const numericFields = [
      'serviceTotal', 'oilUsed', 'oilPrice', 'oilTotal', 'filterCount', 'filterPrice', 'filterSum',
      'fuelFilterCount', 'fuelFilterPrice', 'fuelFilterSum', 'airFilterCount', 'airFilterPrice', 'airFilterSum',
      'antifreezeL', 'antifreezePrice', 'antifreezeSum', 'otherSum', 'workPrice', 'perDiem', 'living',
      'otherExp', 'transportKm', 'transportSum', 'serviceBonus'
    ];
    if (numericFields.includes(field)) return 'numeric';
    
    // Текстові поля (за замовчуванням)
    return 'text';
  };

  // Функція для сортування даних
  const sortData = (data, field, direction) => {
    if (!field) return data;
    
    console.log('[DEBUG] Сортування:', { field, direction, dataLength: data.length });
    
    const fieldType = getFieldType(field);
    
    return [...data].sort((a, b) => {
      let aValue = a[field];
      let bValue = b[field];
      
      // Обробка null/undefined значень
      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';
      
      let comparison = 0;
      
      switch (fieldType) {
        case 'date':
          // Сортування дат
          const dateA = new Date(aValue || '1900-01-01');
          const dateB = new Date(bValue || '1900-01-01');
          comparison = dateA - dateB;
          break;
          
        case 'numeric':
          // Сортування чисел
          const numA = parseFloat(aValue) || 0;
          const numB = parseFloat(bValue) || 0;
          comparison = numA - numB;
          break;
          
        case 'text':
        default:
          // Сортування тексту (українська мова)
          const ukrainianCollator = new Intl.Collator('uk', { sensitivity: 'base' });
          comparison = ukrainianCollator.compare(String(aValue), String(bValue));
          break;
      }
      
      return direction === 'asc' ? comparison : -comparison;
    });
  };

  // --- ФУНКЦІЯ для збереження нової дати підтвердження ---
  const handleSaveBonusDate = () => {
    if (!editDateModal.taskId || !editDateModal.month || !editDateModal.year) return;
    const newDate = `${editDateModal.month.padStart(2, '0')}-${editDateModal.year}`;
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
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:16}}>
          <button 
            onClick={()=>setShowSettings(true)}
            style={{
              background:'#1976d2',
              color:'#fff',
              border:'none',
              padding:'8px 16px',
              borderRadius:'4px',
              cursor:'pointer',
              fontSize:'14px'
            }}
          >
            ⚙️ Налаштувати колонки
          </button>
        </div>
        {showSettings && (
          <ColumnSettings
            allColumns={allColumns}
            selected={selected}
            onChange={setSelected}
            onClose={()=>setShowSettings(false)}
            onSave={saveSettings}
          />
        )}
        {/* СПІЛЬНИЙ КОНТЕЙНЕР для фільтрів і таблиці */}
        <div style={{width:'97vw',maxWidth:'none',margin:'0 auto'}}>
          {/* Окремий контейнер для таблиці з sticky-заголовками */}
          <style>{`
            .table-scroll {
              max-height: 60vh;
              overflow: scroll;
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
              position: sticky !important;
              top: 0 !important;
              z-index: 2;
              background: #1976d2;
              white-space: nowrap;
              padding: 8px 4px;
              vertical-align: top;
              min-width: 120px;
              transition: background-color 0.2s ease;
            }
            .sticky-table thead th:hover {
              background: #1565c0 !important;
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
                      onClick={() => handleColumnClick(col.key)}
                      onDoubleClick={() => handleColumnDoubleClick(col.key)}
                      style={{
                        cursor: 'pointer',
                        background: sortConfig.field === col.key ? '#1565c0' : '#1976d2'
                      }}
                    >
                      <div style={{marginBottom:4, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                        <span title="Подвійний клік для сортування">{col.label}</span>
                        {sortConfig.field === col.key && (
                          <span style={{fontSize:'12px', marginLeft:'4px'}} title={`Сортовано ${sortConfig.direction === 'asc' ? 'від А до Я' : 'від Я до А'}`}>
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
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
                              onChange={(e) => {
                                console.log('[DEBUG] TaskTable filter input changed:', col.key, e.target.value);
                                console.log('[DEBUG] Current filters state:', filters);
                                onFilterChange(e);
                              }}
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
                {sortData(tasks, sortConfig.field, sortConfig.direction).map(t => (
                  <tr key={t.id} style={getRowColor(t) ? {background:getRowColor(t)} : {}}>
                    <td style={getRowColor(t) ? {color:'#111'} : {}}>
                      <button onClick={()=>{setInfoTask(t);setShowInfo(true);}} style={{marginRight:8,background:'#00bfff',color:'#fff'}}>Історія проведення робіт</button>
                      {/* Кнопка редагування - в архіві тільки для адміністратора */}
                      {(!isArchive || role === 'admin') && (
                        <>
                          {(role === 'service' || role === 'operator' || role === 'admin') && (
                            <>
                              <button onClick={()=>onEdit && onEdit(t)} style={{marginRight:8}}>Редагувати</button>
                              {/* Кнопка видалення - тільки для регіональних керівників та адміністраторів */}
                              {(() => {
                                const canDelete = user?.role === 'regionalManager' || user?.role === 'admin';
                                const hasTaskId = !!t.id;
                                const hasOnDeleteFunc = !!onDelete;
                                const shouldShowButton = canDelete && hasTaskId && hasOnDeleteFunc;
                                
                                console.log('[DEBUG] Перевірка доступу до видалення:', {
                                  role,
                                  userRole: user?.role,
                                  canDelete,
                                  hasTaskId,
                                  hasOnDeleteFunc,
                                  shouldShowButton,
                                  taskId: t.id,
                                  onDeleteType: typeof onDelete
                                });
                                
                                return shouldShowButton;
                              })() && (
                                <button onClick={()=>{
                                  if (t.id && onDelete) {
                                    onDelete(t.id);
                                  } else {
                                    console.error('[ERROR] Неможливо видалити заявку: ID відсутній або onDelete не передано', { taskId: t.id, hasOnDelete: !!onDelete });
                                  }
                                }} style={{background:'#f66',color:'#fff'}}>Видалити</button>
                              )}
                              {/* Для інших користувачів показуємо інформаційну кнопку */}
                              {(() => {
                                const shouldShowInfoButton = user?.role !== 'regionalManager' && user?.role !== 'admin';
                                console.log('[DEBUG] Перевірка інформаційної кнопки:', {
                                  userRole: user?.role,
                                  shouldShowInfoButton
                                });
                                return shouldShowInfoButton;
                              })() && (
                                <button onClick={() => {
                                  alert('Для даної дії зверніться до керівника сервісного підрозділу вашого регіону або до адміністратора.');
                                }} style={{background:'#666',color:'#fff', cursor:'help'}} title="Для видалення зверніться до керівника">Видалити</button>
                              )}
                            </>
                          )}
                          {(role === 'warehouse' || role === 'accountant' || role === 'regionalManager' || role === 'regional') && (
                            <button onClick={()=>onEdit && onEdit(t)}>Редагувати</button>
                          )}
                        </>
                      )}
                      {/* Кнопка інформації - в архіві для всіх ролей крім адміністратора */}
                      {isArchive && role !== 'admin' && (
                        <button onClick={()=>onEdit && onEdit({...t, _readOnly: true})} style={{background:'#43a047',color:'#fff'}}>Інформація</button>
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
                      {(t.bonusApprovalDate || '')}
                      <button style={{marginLeft:8}} onClick={() => {
                        let mm = '', yyyy = '';
                        const val = t.bonusApprovalDate || '';
                        if (/^\d{2}-\d{4}$/.test(val)) {
                          [mm, yyyy] = val.split('-');
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

// Використовуємо React.memo для запобігання непотрібних перемонтувань
const TaskTable = React.memo(TaskTableComponent, (prevProps, nextProps) => {
  // Порівнюємо критичні пропси
  const userLoginEqual = prevProps.user?.login === nextProps.user?.login;
  const roleEqual = prevProps.role === nextProps.role;
  const columnsLengthEqual = prevProps.columns.length === nextProps.columns.length;
  const filtersEqual = JSON.stringify(prevProps.filters) === JSON.stringify(nextProps.filters);
  
  // Порівнюємо завдання тільки за ID, щоб уникнути перемонтування при фільтрації
  const tasksEqual = prevProps.tasks.length === nextProps.tasks.length && 
    prevProps.tasks.every((task, index) => task.id === nextProps.tasks[index]?.id);
  
  const criticalPropsEqual = userLoginEqual && roleEqual && columnsLengthEqual && filtersEqual && tasksEqual;
  
  console.log('[DEBUG] TaskTable memo comparison:', {
    userLoginEqual,
    roleEqual,
    columnsLengthEqual,
    filtersEqual,
    tasksEqual,
    shouldUpdate: !criticalPropsEqual
  });
  
  return criticalPropsEqual;
});

export default TaskTable; 