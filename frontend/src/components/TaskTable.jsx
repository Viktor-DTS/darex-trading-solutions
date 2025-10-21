import React, { useState, useEffect, useMemo, useRef } from 'react';
import ModalTaskForm from '../ModalTaskForm';
import DocumentUploadModal from './DocumentUploadModal';
import { columnsSettingsAPI } from '../utils/columnsSettingsAPI';
import { regionsAPI } from '../utils/regionsAPI';
import { logUserAction, EVENT_ACTIONS, ENTITY_TYPES } from '../utils/eventLogAPI';

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
  onSaveBonusDate,
  dateRange,
  setDateRange,
  user,
  isArchive = false,
  isImported = false, // Новий параметр для імпортованих заявок
  onHistoryClick,
  showInvoiceActions = false,
  onCompleteInvoiceRequest,
}) {
  console.log('[LOG] TaskTable received columns:', columns);
  console.log('[LOG] TaskTable role:', role);
  console.log('[LOG] TaskTable user:', user);
  console.log('[LOG] TaskTable user?.region:', user?.region);
  console.log('[LOG] TaskTable filters:', filters);
  console.log('[LOG] TaskTable onDelete:', onDelete);
  console.log('[LOG] TaskTable user?.role:', user?.role);
  console.log('[LOG] TaskTable onFilterChange:', onFilterChange);
  
  // Всі хуки повинні бути на початку компонента
  const [showSettings, setShowSettings] = useState(false);
  const [infoTask, setInfoTask] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [sortField, setSortField] = useState('requestDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filter, setFilter] = useState('');
  const [rejectModal, setRejectModal] = useState({ open: false, taskId: null, comment: '' });
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ open: false, taskId: null, taskInfo: null });
  const [editDateModal, setEditDateModal] = useState({ open: false, taskId: null, month: '', year: '' });
  const [documentUploadModal, setDocumentUploadModal] = useState({ open: false, task: null });
  const [regions, setRegions] = useState([]);
  
  // Форматує значення клітинки, щоб уникнути передачі об'єктів у JSX
  function formatCellValue(value) {
    if (value === null || value === undefined) return '';
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') return value;
    if (Array.isArray(value)) return value.join(', ');
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    try {
      const json = JSON.stringify(value);
      return json && json.length <= 80 ? json : '';
    } catch (_) {
      return '';
    }
  }
  
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
  const [columnWidths, setColumnWidths] = useState({});
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
      console.log('[DEBUG] 🔍 Кешована ширина колонок:', cachedSettings.widths);
      
      setSelected(cachedSettings.visible);
      
      // Встановлюємо порядок з кешу
      if (cachedSettings.order && cachedSettings.order.length > 0) {
        setSelected(cachedSettings.order);
      }
      
      // Встановлюємо ширину з кешу
      if (cachedSettings.widths && typeof cachedSettings.widths === 'object' && Object.keys(cachedSettings.widths).length > 0) {
        console.log('[DEBUG] ✅ Встановлюємо ширину з кешу:', cachedSettings.widths);
        setColumnWidths(cachedSettings.widths);
      } else {
        console.log('[DEBUG] ⚠️ Ширина в кеші відсутня, встановлюємо за замовчуванням');
        const defaultWidths = {};
        columns.forEach(col => {
          defaultWidths[col.key] = 120;
        });
        setColumnWidths(defaultWidths);
      }
      
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
              console.log('[DEBUG] ✅ Порядок колонок з сервера:', settings.order);
              
              // Встановлюємо видимі колонки
              setSelected(settings.visible);
              
              // Якщо є збережений порядок і він валідний, використовуємо його
              if (settings.order && 
                  settings.order.length > 0 && 
                  settings.order.every(k => columns.some(c => c.key === k))) {
                console.log('[DEBUG] ✅ Встановлюємо збережений порядок колонок:', settings.order);
                setSelected(settings.order);
              } else {
                console.log('[DEBUG] ⚠️ Порядок колонок невалідний, використовуємо visible:', settings.visible);
              }
              
              // Завантажуємо ширину колонок
              console.log('[DEBUG] 🔍 Перевіряємо settings.widths:', settings.widths);
              console.log('[DEBUG] 🔍 Тип settings.widths:', typeof settings.widths);
              console.log('[DEBUG] 🔍 settings.widths є об\'єктом:', settings.widths && typeof settings.widths === 'object');
              console.log('[DEBUG] 🔍 Ключі в settings.widths:', settings.widths ? Object.keys(settings.widths) : 'немає');
              
              if (settings.widths && typeof settings.widths === 'object' && Object.keys(settings.widths).length > 0) {
                console.log('[DEBUG] ✅ Встановлюємо збережену ширину колонок:', settings.widths);
                setColumnWidths(settings.widths);
              } else {
                console.log('[DEBUG] ⚠️ Ширина колонок не знайдена або порожня, встановлюємо за замовчуванням');
                const defaultWidths = {};
                columns.forEach(col => {
                  defaultWidths[col.key] = 120;
                });
                console.log('[DEBUG] 🔧 Встановлюємо ширину за замовчуванням:', defaultWidths);
                setColumnWidths(defaultWidths);
              }
              
              setSettingsLoaded(true);
              setLoadingSettings(false);
              
              // Зберігаємо в кеш
              cacheSettings(settings);
            } else {
              // Якщо налаштування невалідні, встановлюємо стандартні
              console.log('[DEBUG] ⚠️ Скидаємо на стандартні (defaultKeys):', defaultKeysRef.current);
              setSelected(defaultKeysRef.current);
              
              // Встановлюємо ширину за замовчуванням
              const defaultWidths = {};
              columns.forEach(col => {
                defaultWidths[col.key] = 120;
              });
              setColumnWidths(defaultWidths);
              
              setSettingsLoaded(true);
              
              // Зберігаємо дефолтні налаштування в кеш
              cacheSettings({ visible: defaultKeysRef.current, order: defaultKeysRef.current, widths: defaultWidths });
            }
          }
        } catch (error) {
          console.error('[ERROR] Помилка при завантаженні налаштувань:', error);
          if (isMounted) {
            console.log('[DEBUG] ⚠️ Встановлюємо стандартні через помилку:', defaultKeysRef.current);
            setSelected(defaultKeysRef.current);
            
            // Встановлюємо ширину за замовчуванням
            const defaultWidths = {};
            columns.forEach(col => {
              defaultWidths[col.key] = 120;
            });
            setColumnWidths(defaultWidths);
            
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
  
  // Завантаження регіонів
  useEffect(() => {
    regionsAPI.getAll().then(setRegions).catch(() => setRegions([]));
  }, []);

  // Автоматичне встановлення регіону користувача для поля serviceRegion
  useEffect(() => {
    if (user?.region && user.region !== 'Україна' && filters.serviceRegion === '') {
      // Автоматично встановлюємо регіон користувача тільки якщо у нього один регіон
      if (!user.region.includes(',')) {
        onFilterChange({
          target: {
            name: 'serviceRegion',
            value: user.region
          }
        });
      }
    }
  }, [user?.region, filters.serviceRegion, onFilterChange]);
  
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

  // Функція для визначення CSS класу рядка
  function getRowClass(t) {
    // Перевіряємо, чи хтось відхилив заявку
    if (t.approvedByAccountant === 'Відмова' || t.approvedByWarehouse === 'Відмова' || t.approvedByRegionalManager === 'Відмова') {
      return 'rejected';
    }
    
    const acc = t.approvedByAccountant === true || t.approvedByAccountant === 'Підтверджено';
    const wh = t.approvedByWarehouse === true || t.approvedByWarehouse === 'Підтверджено';
    const reg = t.approvedByRegionalManager === true || t.approvedByRegionalManager === 'Підтверджено';
    
    if (acc && wh && reg) return 'all-approved';
    if (acc && wh) return 'accountant-warehouse';
    if (acc && reg) return 'accountant-regional';
    if (wh && reg) return 'warehouse-regional';
    if (acc) return 'accountant-approved';
    if (wh) return 'warehouse-approved';
    if (reg) return 'regional-approved';
    return '';
  }

  // Функція для визначення типу фільтра
  function getFilterType(colKey) {
    const selectFields = {
      'status': ['', 'Заявка', 'В роботі', 'Виконано', 'Заблоковано'],
      'company': ['', 'ДТС', 'Дарекс Енерго', 'інша'],
      'paymentType': ['не вибрано', 'Безготівка', 'Готівка', 'На карту', 'Інше'],
      'approvedByWarehouse': ['На розгляді', 'Підтверджено', 'Відмова'],
      'approvedByAccountant': ['На розгляді', 'Підтверджено', 'Відмова'],
      'approvedByRegionalManager': ['На розгляді', 'Підтверджено', 'Відмова'],
      'serviceRegion': (() => {
        if (regions.length === 0) return [];
        
        console.log('DEBUG getFilterType: user.region =', user?.region);
        console.log('DEBUG getFilterType: user.region type =', typeof user?.region);
        console.log('DEBUG getFilterType: user.region includes comma =', user?.region?.includes(','));
        console.log('DEBUG getFilterType: regions =', regions.map(r => r.name));
        
        // Якщо користувач має множинні регіони, показуємо тільки їх регіони (без "Загальний")
        if (user?.region && user.region.includes(',')) {
          const userRegions = user.region.split(',').map(r => r.trim());
          console.log('DEBUG getFilterType: userRegions =', userRegions);
          const result = ['', ...userRegions];
          console.log('DEBUG getFilterType: result for multi-region user (without Загальний) =', result);
          return result;
        }
        
        // Якщо користувач має доступ до всіх регіонів або один регіон
        const result = ['', ...regions.map(r => r.name)];
        console.log('DEBUG getFilterType: result for single-region user =', result);
        return result;
      })()
    };
    
    return selectFields[colKey] || null;
  }

  // Функція для визначення, чи поле заблоковане
  function isFieldDisabled(colKey) {
    if (colKey === 'serviceRegion') {
      // Розблоковуємо для користувачів з множинними регіонами або з регіоном "Україна"
      if (user?.region === 'Україна') return false;
      if (user?.region && user.region.includes(',')) return false;
      // Блокуємо для користувачів з одним регіоном
      return true;
    }
    return false;
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
      // Логуємо відхилення заявки
      const task = tasks.find(t => t.id === rejectModal.taskId);
      if (task) {
        const action = rejectModal.comment ? EVENT_ACTIONS.REJECT : EVENT_ACTIONS.APPROVE;
        const description = rejectModal.comment ? 
          `Відхилено заявку: ${task.requestNumber || 'Без номера'} - ${task.client || 'Без клієнта'}` :
          `Затверджено заявку: ${task.requestNumber || 'Без номера'} - ${task.client || 'Без клієнта'}`;
        
        logUserAction(user, action, ENTITY_TYPES.TASK, rejectModal.taskId, description, {
          requestNumber: task.requestNumber,
          client: task.client,
          work: task.work,
          comment: rejectModal.comment,
          status: task.status
        });
      }
      
      onApprove(rejectModal.taskId, 'Відмова', rejectModal.comment);
    }
    setRejectModal({ open: false, taskId: null, comment: '' });
  };

  const handleRejectCancel = () => {
    setRejectModal({ open: false, taskId: null, comment: '' });
  };

  // --- Додаю функції для підтвердження видалення ---
  const handleDeleteConfirm = () => {
    if (deleteConfirmModal.taskId && onDelete) {
      // Логуємо видалення заявки
      const taskInfo = deleteConfirmModal.taskInfo;
      logUserAction(user, EVENT_ACTIONS.DELETE, ENTITY_TYPES.TASK, deleteConfirmModal.taskId, 
        `Видалено заявку: ${taskInfo?.requestNumber || 'Без номера'} - ${taskInfo?.client || 'Без клієнта'} - ${taskInfo?.work || 'Без робіт'}`, {
          requestNumber: taskInfo?.requestNumber,
          client: taskInfo?.client,
          work: taskInfo?.work,
          date: taskInfo?.date,
          status: taskInfo?.status
        });
      
      onDelete(deleteConfirmModal.taskId);
    }
    setDeleteConfirmModal({ open: false, taskId: null, taskInfo: null });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmModal({ open: false, taskId: null, taskInfo: null });
  };

  const showDeleteConfirmation = (task) => {
    setDeleteConfirmModal({ 
      open: true, 
      taskId: task.id, 
      taskInfo: {
        requestNumber: task.requestNumber,
        client: task.client,
        work: task.work,
        date: task.date,
        status: task.status
      }
    });
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
        // Зберігаємо новий порядок як і visible, і як order
        const success = await columnsSettingsAPI.saveSettings(userLoginRef.current, areaRef.current, newOrder, newOrder, columnWidths);
        if (!success) {
          console.error('Помилка збереження порядку колонок');
        } else {
          console.log('[DEBUG] Порядок колонок успішно збережено');
          // Оновлюємо кеш з новим порядком
          cacheSettings({ visible: newOrder, order: newOrder, widths: columnWidths });
        }
      } catch (error) {
        console.error('Помилка збереження порядку колонок:', error);
      }
    }
  };
  
  const handleDragOver = e => e.preventDefault();

  // --- Функція для зміни ширини колонки ---
  const handleColumnResize = (columnKey, newWidth) => {
    console.log('[DEBUG] Зміна ширини колонки:', { columnKey, newWidth });
    const clampedWidth = Math.max(80, Math.min(500, newWidth)); // Мінімум 80px, максимум 500px
    setColumnWidths(prev => ({
      ...prev,
      [columnKey]: clampedWidth
    }));
    
    // Зберігаємо з debounce
    clearTimeout(window.columnResizeTimeout);
    window.columnResizeTimeout = setTimeout(() => {
      // Отримуємо актуальний стан columnWidths
      setColumnWidths(currentWidths => {
        const newWidths = { ...currentWidths, [columnKey]: clampedWidth };
        saveColumnWidths(newWidths);
        return currentWidths; // Не змінюємо стан тут, він вже оновлений вище
      });
    }, 500);
  };

  // --- Збереження ширини колонок ---
  const saveColumnWidths = async (widths) => {
    if (user?.login && areaRef.current) {
      try {
        console.log('[DEBUG] 💾 Зберігаємо ширину колонок:', widths);
        console.log('[DEBUG] 💾 Користувач:', userLoginRef.current);
        console.log('[DEBUG] 💾 Область:', areaRef.current);
        console.log('[DEBUG] 💾 Видимі колонки:', selected);
        
        const success = await columnsSettingsAPI.saveSettings(userLoginRef.current, areaRef.current, selected, selected, widths);
        if (!success) {
          console.error('❌ Помилка збереження ширини колонок');
        } else {
          console.log('[DEBUG] ✅ Ширина колонок успішно збережена в базі');
          // Оновлюємо кеш з новою шириною
          cacheSettings({ visible: selected, order: selected, widths: widths });
          console.log('[DEBUG] ✅ Кеш оновлено з новою шириною');
        }
      } catch (error) {
        console.error('❌ Помилка збереження ширини колонок:', error);
      }
    } else {
      console.log('[DEBUG] ⚠️ Не можу зберегти ширину - немає user.login або areaRef.current');
      console.log('[DEBUG] ⚠️ user?.login:', user?.login);
      console.log('[DEBUG] ⚠️ areaRef.current:', areaRef.current);
    }
  };

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

  // Функція для визначення статусу рахунку
  const getInvoiceStatus = (task) => {
    // Логуємо тільки для перших 3 заявок для діагностики
    if (task.id && (task.id.includes('0000173') || task.id.includes('0000174') || task.id.includes('0000175'))) {
      console.log('[DEBUG] getInvoiceStatus - поля заявки:', {
        id: task.id,
        requestNumber: task.requestNumber,
        invoiceRequested: task.invoiceRequested,
        invoiceRequestId: task.invoiceRequestId,
        invoiceStatus: task.invoiceStatus,
        invoiceFile: task.invoiceFile,
        invoiceFileName: task.invoiceFileName,
        allFields: Object.keys(task).filter(key => 
          key.toLowerCase().includes('invoice') || 
          key.toLowerCase().includes('рахунок') ||
          key.toLowerCase().includes('request')
        )
      });
    }
    
    // Перевіряємо, чи створений запит на рахунок
    const hasInvoiceRequest = task.invoiceRequested === true || 
                             task.invoiceRequestId || 
                             task.invoiceStatus;
    
    // Якщо немає запиту на рахунок
    if (!hasInvoiceRequest) {
      return { status: 'not_requested', color: '#dc3545', label: 'Не подана' }; // Червоний
    }
    
    // ДОДАТКОВА ЛОГІКА: Якщо є файл рахунку, показуємо "Виконано"
    if (task.invoiceFile && task.invoiceFile.trim() !== '') {
      console.log('[DEBUG] getInvoiceStatus - знайдено файл рахунку для заявки:', task.id, 'файл:', task.invoiceFile);
      return { status: 'completed', color: '#28a745', label: 'Виконано' }; // Зелений
    }
    
    // Перевіряємо статус запиту на рахунок
    if (task.invoiceStatus) {
      switch (task.invoiceStatus) {
        case 'completed':
          return { status: 'completed', color: '#28a745', label: 'Виконано' }; // Зелений
        case 'rejected':
          return { status: 'rejected', color: '#dc3545', label: 'Відхилена' }; // Червоний
        case 'processing':
          return { status: 'processing', color: '#ffc107', label: 'В обробці' }; // Жовтий
        case 'pending':
        default:
          return { status: 'pending', color: '#ffc107', label: 'Очікує' }; // Жовтий
      }
    }
    
    // Якщо є запит, але немає статусу - вважаємо очікуючим
    return { status: 'pending', color: '#ffc107', label: 'Очікує' }; // Жовтий
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

  // Функція для обробки подвійного кліку на заголовок колонки
  const handleSort = (field) => {
    console.log('[DEBUG] Подвійний клік на заголовок:', field);
    
    setSortConfig(prevConfig => {
      // Якщо клікаємо на ту ж колонку, змінюємо напрямок
      if (prevConfig.field === field) {
        return {
          field: field,
          direction: prevConfig.direction === 'asc' ? 'desc' : 'asc'
        };
      } else {
        // Якщо клікаємо на нову колонку, встановлюємо asc
        return {
          field: field,
          direction: 'asc'
        };
      }
    });
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
    if (onSaveBonusDate) {
      // Викликаємо onSaveBonusDate з taskId та новою датою
      onSaveBonusDate(editDateModal.taskId, newDate);
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

  // Функція для генерації наряду
  const generateWorkOrder = (task) => {
    // Формуємо дані для наряду
    const workOrderData = {
      client: task.client || '',
      address: task.address || '',
      equipment: task.equipment || task.equipmentType || '',
      serialNumber: task.equipmentSerial || task.serialNumber || '',
      engineer1: task.engineer1 || '',
      engineer2: task.engineer2 || '',
      engineer3: task.engineer3 || '',
      engineer4: task.engineer4 || '',
      engineer5: task.engineer5 || '',
      engineer6: task.engineer6 || '',
      requestDate: task.requestDate || '',
      workDescription: task.requestDesc || task.work || '',
      workType: task.workType || 'ремонт',
      technicalCondition: task.technicalCondition || '',
      operatingHours: task.operatingHours || '',
      performedWork: task.performedWork || '',
      testResults: task.testResults || 'Відновлення роботи дизель генератора з робочими параметрами без навантаження та під час навантаження',
      materialsCost: task.materialsCost || '0',
      defectCost: task.defectCost || '0',
      repairCost: task.repairCost || '0',
      travelCost: task.travelCost || '0',
      totalCost: task.totalCost || '0',
      paymentMethod: task.paymentType || 'безготівковий розрахунок',
      recommendations: task.recommendations || '',
      // Додаткові поля для нових шаблонів
      requestNumber: task.requestNumber || '',
      workDate: task.date || '',
      engineModel: task.engineModel || '',
      engineSerial: task.engineSerial || ''
    };

    // Перевіряємо умову для номера наряду
    const hasRequestNumber = task.requestNumber && task.requestNumber.trim() !== '';
    const hasWorkDate = task.date && task.date.trim() !== '';
    const workOrderNumber = hasRequestNumber ? task.requestNumber : '____';
    const workOrderDate = hasWorkDate ? task.date : '____';

    // Формуємо список інженерів
    const engineers = [
      workOrderData.engineer1,
      workOrderData.engineer2,
      workOrderData.engineer3,
      workOrderData.engineer4,
      workOrderData.engineer5,
      workOrderData.engineer6
    ].filter(eng => eng && eng.trim() !== '').join(', ');

    // Визначаємо компанію та вибираємо відповідний шаблон
    const company = task.company || '';
    let workOrderHTML = '';

    if (company === 'ДТС' || company === 'Дарекс Трейдінг Солюшнс') {
      // Шаблон для компанії ДТС
      workOrderHTML = generateDTSTemplate(workOrderData, workOrderNumber, workOrderDate, engineers);
    } else {
      // Шаблон для компанії Дарекс Енерго (за замовчуванням)
      workOrderHTML = generateDarexEnergyTemplate(workOrderData, workOrderNumber, workOrderDate, engineers);
    }

    // Відкриваємо нове вікно з нарядом
    const newWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes,resizable=yes');
    newWindow.document.write(workOrderHTML);
    newWindow.document.close();
  };

  // Функція для генерації шаблону ДТС
  const generateDTSTemplate = (workOrderData, workOrderNumber, workOrderDate, engineers) => {
    return `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Наряд ДТС-2</title>
        <style>
          body {
            font-family: 'Times New Roman', serif;
            margin: 0;
            padding: 20px;
            background: white;
            color: black;
            line-height: 1.4;
            font-size: 12px;
          }
          .header {
            margin-bottom: 20px;
            border-bottom: 2px solid #000;
            padding-bottom: 15px;
          }
          .qr-code {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            background: #f0f0f0;
            border: 1px solid #ccc;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8px;
          }
          .page {
            width: 100%;
            max-width: 800px;
            margin: 0 auto 30px auto;
            border: 1px solid #000;
            padding: 20px;
            min-height: 1000px;
            page-break-after: always;
          }
          .page:last-child {
            page-break-after: avoid;
          }
          .work-order-title {
            text-align: center;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 20px;
            border-bottom: 1px solid #000;
            padding-bottom: 10px;
          }
          .form-row {
            margin-bottom: 12px;
            display: flex;
            align-items: flex-start;
          }
          .form-label {
            font-weight: bold;
            min-width: 120px;
            flex-shrink: 0;
            font-size: 11px;
          }
          .form-value {
            flex: 1;
            border-bottom: 1px dotted #000;
            min-height: 16px;
            padding-left: 5px;
          }
          .form-value:empty::after {
            content: "_________________";
            color: #999;
          }
          .section-title {
            font-weight: bold;
            margin: 15px 0 8px 0;
            font-size: 11px;
          }
          .materials-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 9px;
          }
          .materials-table th,
          .materials-table td {
            border: 1px solid #000;
            padding: 3px;
            text-align: center;
          }
          .materials-table th {
            background: #f0f0f0;
            font-weight: bold;
            font-size: 10px;
          }
          .signature-section {
            margin-top: 30px;
            display: flex;
            justify-content: space-between;
          }
          .signature-box {
            text-align: center;
            width: 150px;
          }
          .signature-line {
            border-bottom: 1px solid #000;
            height: 25px;
            margin-bottom: 5px;
          }
          .signature-text {
            font-size: 9px;
            color: #666;
          }
          .footer {
            margin-top: 20px;
            text-align: center;
            font-size: 10px;
            color: #666;
          }
          .no-print {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none;
            }
            .page {
              max-width: none;
              margin: 0;
              border: none;
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <!-- Верхня секція шапки - перше зображення -->
          <div style="width: 100%; margin-bottom: 15px;">
            <img src="/images/Зображення1.png" alt="Шапка компанії" style="width: 100%; height: auto; max-width: 100%;" />
          </div>
          
          <!-- Нижня секція шапки - друге зображення -->
          <div style="width: 100%;">
            <img src="/images/Зображення2.png" alt="Юридична адреса" style="width: 100%; height: auto; max-width: 100%;" />
          </div>
        </div>

        <div class="work-order-container">
          <div class="work-order-title">
            Наряд на виконання робіт № ${workOrderNumber} від ${workOrderDate} р.)
          </div>
          
          <div class="form-row">
            <div class="form-label">ЗАМОВНИК:</div>
            <div class="form-value">${workOrderData.client}</div>
          </div>
          
          <div class="form-row">
            <div class="form-label">Адреса:</div>
            <div class="form-value">${workOrderData.address}</div>
          </div>
          
          <div class="form-row">
            <div class="form-label">Найменування обладнання:</div>
            <div class="form-value">${workOrderData.equipment}</div>
          </div>
          
          <div class="form-row">
            <div class="form-label">Зав. №</div>
            <div class="form-value">${workOrderData.serialNumber}</div>
          </div>
          
          <div class="section-title">1. Вид робіт (вибрати необхідне) гарантійний ремонт, ремонт, технічне обслуговування, інше.</div>
          <div class="form-row">
            <div class="form-value">${workOrderData.workType}</div>
          </div>
          
          <div class="section-title">2. Технічний стан обладнання:</div>
          <div class="form-row">
            <div class="form-label">Напрацювання м/г:</div>
            <div class="form-value">${workOrderData.operatingHours}</div>
          </div>
          <div class="form-row">
            <div class="form-label">Згідно із заявкою:</div>
            <div class="form-value">${workOrderData.technicalCondition}</div>
          </div>
          <div class="form-row">
            <div class="form-label">Після технічного огляду (проведення робіт/послуг)</div>
            <div class="form-value"></div>
          </div>
          
          <div class="section-title">3. Перелік виконаних робіт/послуг:</div>
          <div class="form-row">
            <div class="form-value">${workOrderData.performedWork}</div>
          </div>
          
          <div class="section-title">4. Результати випробувань: Відновлення роботи дизель генератора з робочими параметрами без навантаження та під час навантаження.</div>
          <div class="form-row">
            <div class="form-value"></div>
          </div>
          
          <div class="section-title">5. Розрахункова вартість робіт:</div>
          <div class="section-title">7.1. ПЕРЕЛІК МАТЕРІАЛІВ ТА ЗАПЧАСТИН, ВИКОРИСТАНИХ ПІД ЧАС РОБІТ</div>
          <table class="materials-table">
            <thead>
              <tr>
                <th style="width: 8%;">№ п/п</th>
                <th style="width: 45%;">Найменування</th>
                <th style="width: 12%;">Одиниця виміру</th>
                <th style="width: 12%;">Кількість</th>
                <th style="width: 12%;">Ціна з ПДВ, грн</th>
                <th style="width: 11%;">Сума з ПДВ, грн</th>
              </tr>
            </thead>
            <tbody>
              ${(() => {
                const materials = [];
                let rowNumber = 1;
                
                // Додаємо оливу
                if (task.oilType && task.oilUsed) {
                  materials.push({
                    number: rowNumber++,
                    name: `Олива ${task.oilType}`,
                    unit: 'л',
                    quantity: task.oilUsed,
                    price: task.oilPrice || 0,
                    sum: (parseFloat(task.oilUsed) || 0) * (parseFloat(task.oilPrice) || 0)
                  });
                }
                
                // Додаємо масляний фільтр
                if (task.filterName && task.filterCount) {
                  materials.push({
                    number: rowNumber++,
                    name: `Масляний фільтр ${task.filterName}`,
                    unit: 'шт',
                    quantity: task.filterCount,
                    price: task.filterPrice || 0,
                    sum: (parseFloat(task.filterCount) || 0) * (parseFloat(task.filterPrice) || 0)
                  });
                }
                
                // Додаємо паливний фільтр
                if (task.fuelFilterName && task.fuelFilterCount) {
                  materials.push({
                    number: rowNumber++,
                    name: `Паливний фільтр ${task.fuelFilterName}`,
                    unit: 'шт',
                    quantity: task.fuelFilterCount,
                    price: task.fuelFilterPrice || 0,
                    sum: (parseFloat(task.fuelFilterCount) || 0) * (parseFloat(task.fuelFilterPrice) || 0)
                  });
                }
                
                // Додаємо повітряний фільтр
                if (task.airFilterName && task.airFilterCount) {
                  materials.push({
                    number: rowNumber++,
                    name: `Повітряний фільтр ${task.airFilterName}`,
                    unit: 'шт',
                    quantity: task.airFilterCount,
                    price: task.airFilterPrice || 0,
                    sum: (parseFloat(task.airFilterCount) || 0) * (parseFloat(task.airFilterPrice) || 0)
                  });
                }
                
                // Додаємо антифриз
                if (task.antifreezeType && task.antifreezeL) {
                  materials.push({
                    number: rowNumber++,
                    name: `Антифриз ${task.antifreezeType}`,
                    unit: 'л',
                    quantity: task.antifreezeL,
                    price: task.antifreezePrice || 0,
                    sum: (parseFloat(task.antifreezeL) || 0) * (parseFloat(task.antifreezePrice) || 0)
                  });
                }
                
                // Додаємо інші матеріали
                if (task.otherMaterials && task.otherSum) {
                  materials.push({
                    number: rowNumber++,
                    name: task.otherMaterials,
                    unit: 'шт',
                    quantity: '',
                    price: '',
                    sum: task.otherSum
                  });
                }
                
                // Генеруємо HTML для заповнених рядків
                const filledRows = materials.map(material => `
                  <tr style="height: 30px;">
                    <td style="font-size: 10px;">${material.number}</td>
                    <td style="font-size: 10px;">${material.name}</td>
                    <td style="font-size: 10px;">${material.unit}</td>
                    <td style="font-size: 10px;">${material.quantity}</td>
                    <td style="font-size: 10px;">${material.price}</td>
                    <td style="font-size: 10px;">${material.sum}</td>
                  </tr>
                `).join('');
                
                // Додаємо 5 порожніх рядків з збільшеною висотою
                const emptyRows = Array(5).fill().map(() => `
                  <tr style="height: 30px;">
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                `).join('');
                
                return filledRows + emptyRows;
              })()}
            </tbody>
          </table>
          
          <div class="form-row">
            <div class="form-label">Загальна вартість матеріалів та запчастин:</div>
            <div class="form-value"></div>
          </div>
          
          <div class="form-row">
            <div class="form-label">7.2 Вартість дефектації:</div>
            <div class="form-value">кількість люд/годин ____ ; тариф ____ грн; разом ${workOrderData.defectCost} грн.</div>
          </div>
          
          <div class="form-row">
            <div class="form-label">7.3 Вартість ремонту:</div>
            <div class="form-value">кількість люд/годин ____ ; тариф: ____ грн; разом ${workOrderData.repairCost} грн.</div>
          </div>
          
          <div class="form-row">
            <div class="form-label">7.4 Виїзд на об'єкт Замовника:</div>
            <div class="form-value">тариф: по місту ____ грн. Виїзд за місто ____ км ____ грн/км; разом ${workOrderData.travelCost} грн.</div>
          </div>
          
          <div class="form-row">
            <div class="form-label">ЗАГАЛЬНА ВАРТІСТЬ РОБІТ з ПДВ (усього по п.7.1; 7.2; 7.3; 7.4)</div>
            <div class="form-value">${workOrderData.totalCost} грн.</div>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-label">Сума прописом:</div>
          <div class="form-value"></div>
        </div>
        
        <div class="form-row">
          <div class="form-label">Відмітка про оплату (вибрати необхідне), безготівковий розрахунок, на банківську картку, готівкові кошти, інше (зазначити):</div>
          <div class="form-value">${(() => {
            const paymentMethod = task.paymentType || '';
            if (paymentMethod && paymentMethod.trim() !== '' && paymentMethod !== 'не вибрано') {
              return paymentMethod;
            }
            return '';
          })()}</div>
        </div>
        
        <div class="form-row">
          <div class="form-label">Рекомендації виконувача робіт:</div>
          <div class="form-value">${workOrderData.recommendations}</div>
        </div>
        
        <div class="form-row">
          <div class="form-label">Роботу виконав: (ПІБ), (посада)</div>
          <div class="form-value">${workOrderData.engineer1}${workOrderData.engineer2 ? ', ' + workOrderData.engineer2 : ''}</div>
        </div>
        
        <div class="form-row">
          <div class="form-label">Роботу прийняв: (ПІБ), (посада)</div>
          <div class="form-value"></div>
        </div>

        <div class="no-print">
          <button onclick="window.print()" style="
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
          ">🖨️ Друкувати</button>
          <button onclick="window.close()" style="
            background: #f44336;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 10px;
          ">✕ Закрити</button>
        </div>
      </body>
      </html>
    `;
  };

  // Функція для генерації шаблону Дарекс Енерго (2-сторінковий)
  const generateDarexEnergyTemplate = (workOrderData, workOrderNumber, workOrderDate, engineers) => {
    return `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Наряд Дарекс Енерго</title>
        <style>
          @page {
            size: A4;
            margin: 1.5cm;
          }
          
          body {
            font-family: 'Times New Roman', serif;
            font-size: 11pt;
            line-height: 1.2;
            margin: 0;
            padding: 0;
            color: #000;
          }
          
          .page {
            width: 21cm;
            min-height: 29.7cm;
            margin: 0 auto;
            padding: 1.5cm;
            box-sizing: border-box;
            position: relative;
          }
          
          .page:last-child {
            page-break-after: avoid;
          }
          
          .header {
            margin-bottom: 15px;
            text-align: center;
          }
          
          .header-image {
            max-width: 100%;
            height: auto;
            margin-bottom: 10px;
            display: block;
            margin-left: auto;
            margin-right: auto;
          }
          
          .title {
            text-align: center;
            font-size: 14pt;
            font-weight: bold;
            margin: 15px 0;
            text-transform: uppercase;
          }
          
          .field {
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            font-size: 11pt;
          }
          
          .field-label {
            font-weight: normal;
            min-width: 180px;
            margin-right: 8px;
          }
          
          .field-value {
            flex: 1;
            border-bottom: 1px solid #000;
            min-height: 18px;
            padding: 1px 3px;
          }
          
          .checkbox-group {
            display: flex;
            gap: 15px;
            margin: 8px 0;
            flex-wrap: wrap;
          }
          
          .checkbox-item {
            display: flex;
            align-items: center;
            gap: 3px;
            font-size: 11pt;
          }
          
          .checkbox {
            width: 12px;
            height: 12px;
            border: 1px solid #000;
            display: inline-block;
          }
          
          .materials-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 9pt;
          }
          
          .materials-table th,
          .materials-table td {
            border: 1px solid #000;
            padding: 3px;
            text-align: center;
            vertical-align: middle;
          }
          
          .materials-table th {
            background-color: #f8f8f8;
            font-weight: bold;
          }
          
          .cost-section {
            margin: 10px 0;
          }
          
          .cost-item {
            display: flex;
            justify-content: space-between;
            margin: 3px 0;
            padding: 2px 0;
            font-size: 11pt;
          }
          
          .signature-section {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
          }
          
          .signature-block {
            width: 45%;
            text-align: center;
            font-size: 10pt;
          }
          
          .signature-line {
            border-bottom: 1px solid #000;
            margin: 15px 0 3px 0;
            min-height: 18px;
          }
          
          .text-area {
            border: 1px solid #000;
            min-height: 50px;
            padding: 3px;
            margin: 3px 0;
            font-size: 11pt;
          }
          
          .text-line {
            border-bottom: 1px solid #000;
            min-height: 18px;
            margin: 3px 0;
            padding: 1px 3px;
          }
          
          .checkbox-section {
            margin: 8px 0;
          }
          
          .checkbox-row {
            display: flex;
            align-items: center;
            margin: 3px 0;
            font-size: 10pt;
          }
          
          .checkbox-label {
            margin-left: 8px;
          }
          
          .total-cost {
            font-weight: bold;
            font-size: 12pt;
            text-align: center;
            margin: 15px 0;
            padding: 8px;
            border: 1px solid #000;
          }
          
          .coefficient-note {
            font-style: italic;
            font-size: 9pt;
            margin: 8px 0;
            line-height: 1.1;
          }
          
          .section-title {
            font-weight: bold;
            font-size: 11pt;
            margin: 10px 0 5px 0;
          }
          
          .two-column {
            display: flex;
            gap: 20px;
          }
          
          .column {
            flex: 1;
          }
          
          .no-print {
            display: block;
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 1000;
            background: rgba(255, 255, 255, 0.9);
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          
          .print-button, .save-button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            margin: 0 5px;
            transition: background 0.3s;
          }
          
          .print-button:hover, .save-button:hover {
            background: #45a049;
          }
          
          .save-button {
            background: #2196F3;
          }
          
          .save-button:hover {
            background: #1976D2;
          }
          
          @media print {
            .no-print {
              display: none !important;
            }
            body {
              margin: 0;
              padding: 0;
            }
            .page {
              margin: 0;
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <!-- Перша сторінка -->
        <div class="page">
          <div class="header">
            <img src="/header.png" alt="Шапка Дарекс Енерго" class="header-image" style="width: 100%; max-width: 680px; height: auto;" />
          </div>
          
          <div class="title">НАРЯД НА ВИКОНАННЯ РОБІТ</div>
          
          <div class="field">
            <span class="field-label">№ наряду:</span>
            <span class="field-value">${workOrderNumber}</span>
          </div>
          
          <div class="field">
            <span class="field-label">від «___» ________ 202____ р.):</span>
            <span class="field-value">${workOrderDate}</span>
          </div>
          
          <div class="field">
            <span class="field-label">1. Роботи виконує:</span>
            <span class="field-value">${engineers}</span>
          </div>
          
          <div class="field">
            <span class="field-label">2. Замовник:</span>
            <span class="field-value">${workOrderData.client}</span>
          </div>
          
          <div class="field">
            <span class="field-label">3. Адреса об'єкта:</span>
            <span class="field-value">${workOrderData.address}</span>
          </div>
          
          <div class="field">
            <span class="field-label">4. Найменування обладнання:</span>
            <span class="field-value">${workOrderData.equipment}</span>
          </div>
          
          <div class="field">
            <span class="field-label">Зав. №:</span>
            <span class="field-value">${workOrderData.serialNumber}</span>
          </div>
          
          <div class="field">
            <span class="field-label">5. Тип двигуна:</span>
            <span class="field-value">${workOrderData.engineModel}</span>
          </div>
          
          <div class="field">
            <span class="field-label">Зав. №:</span>
            <span class="field-value">${workOrderData.engineSerial}</span>
          </div>
          
          <div class="field">
            <span class="field-label">6. Тип панелі керування:</span>
            <span class="field-value"></span>
          </div>
          
          <div class="field">
            <span class="field-label">7. Вид робіт:</span>
            <div class="checkbox-group">
              <div class="checkbox-item">
                <div class="checkbox"></div>
                <span>гарантійний ремонт</span>
              </div>
              <div class="checkbox-item">
                <div class="checkbox"></div>
                <span>ремонт</span>
              </div>
              <div class="checkbox-item">
                <div class="checkbox"></div>
                <span>технічне обслуговування</span>
              </div>
              <div class="checkbox-item">
                <div class="checkbox"></div>
                <span>інше</span>
              </div>
              <div class="checkbox-item">
                <div class="checkbox"></div>
                <span>ПНР</span>
              </div>
            </div>
          </div>
          
          <div class="field">
            <span class="field-label">8. Технічний стан обладнання перед проведенням робіт:</span>
            <div class="checkbox-group">
              <div class="checkbox-item">
                <div class="checkbox"></div>
                <span>працездатне</span>
              </div>
              <div class="checkbox-item">
                <div class="checkbox"></div>
                <span>непрацездатне</span>
              </div>
            </div>
          </div>
          
          <div class="field">
            <span class="field-label">9. Перелік виконаних робіт/послуг:</span>
            <span class="field-value"></span>
          </div>
          
          <div class="field">
            <span class="field-label"></span>
            <span class="field-value"></span>
          </div>
          
          <div class="field">
            <span class="field-label"></span>
            <span class="field-value"></span>
          </div>
          
          <div class="field">
            <span class="field-label">10. Після проведення робіт та випробувань, ДГУ знаходиться в робочому / неробочому стані, в режимі ручне авто, напрацювання становить ____ мотогодин.</span>
          </div>
          
          <div class="field">
            <span class="field-label">11. Навантаження: L1 ____, L2 ____, L3 ____, U1 ____, U2 ____, U3 ____, V.</span>
          </div>
          
          <div class="section-title">6.1. ПЕРЕЛІК МАТЕРІАЛІВ ТА ЗАПЧАСТИН, ВИКОРИСТАНИХ ПІД ЧАС РОБІТ:</div>
          
          <table class="materials-table">
            <thead>
              <tr>
                <th>№</th>
                <th>Найменування</th>
                <th>Один. виміру</th>
                <th>Кількість</th>
                <th>Ціна з ПДВ, грн</th>
                <th>Вартість з ПДВ, грн</th>
              </tr>
            </thead>
            <tbody>
              ${Array.from({length: 10}, (_, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="field">
            <span class="field-label">Загальна вартість матеріалів та запчастин:</span>
            <span class="field-value">____ грн.</span>
          </div>
          
          <div class="section-title">6.2. Вартість ремонту/робіт:</div>
          
          <div class="cost-item">
            <span>Коефіцієнт складності</span>
            <span>_____</span>
          </div>
          
          <div class="cost-item">
            <span>Діагностика</span>
            <span>_____ грн.</span>
          </div>
          
          <div class="cost-item">
            <span>Вартість технічного обслуговування</span>
            <span>_____ грн.</span>
          </div>
          
          <div class="cost-item">
            <span>Вартість ремонту (1людино-година*1200 грн.)</span>
            <span>_____ грн.</span>
          </div>
          
          <div class="cost-item">
            <span>Вартість пусконалагоджувальних робіт</span>
            <span>_____ грн.</span>
          </div>
          
          <div class="cost-item">
            <span>Загальна вартість з урахуванням коефіцієнта складності</span>
            <span>_____ грн.</span>
          </div>
          
          <div class="section-title">6.3. Виїзд на об'єкт Замовника: тариф: по місту 600.00 грн.</div>
          <div class="field">
            <span class="field-label">Виїзд за місто ____ км * 15,00 грн/км; разом ____ грн.</span>
          </div>
          
          <div class="section-title">6.4. Добові у відрядженні: 600.00 грн. ____ діб ____ люд. разом ____ грн.</div>
          
          <div class="section-title">6.5. Проживання: ____ грн. разом ____ грн.</div>
          
          <div class="total-cost">
            ЗАГАЛЬНА ВАРТІСТЬ РОБІТ з ПДВ (усього по пп.6.1-6.5) ____ грн.
          </div>
          
          <div class="field">
            <span class="field-label">Роботи виконав:</span>
            <span class="field-value">${engineers}</span>
          </div>
          
          <div class="field">
            <span class="field-label">Замовник:</span>
            <span class="field-value">${workOrderData.client}</span>
          </div>
          
          <div class="field">
            <span class="field-label">Адреса об'єкта:</span>
            <span class="field-value">${workOrderData.address}</span>
          </div>
          
          <div class="field">
            <span class="field-label">Відмітка про оплату:</span>
            <span class="field-value"></span>
          </div>
          
          <div class="title" style="font-size: 12pt; margin: 20px 0;">
            НАСТУПНЕ ТЕХНІЧНЕ ОБСЛУГОВУВАННЯ ПРОВЕСТИ ПРИ НАПРАЦЮВАННІ
          </div>
          
          <div class="field">
            <span class="field-label">МОТОГОДИН, АБО «___» ___ 20___ РОКУ.</span>
          </div>
          
          <div class="two-column">
            <div class="column">
              <div class="field">
                <span class="field-label">Дата та час початку робіт:</span>
                <span class="field-value"></span>
              </div>
            </div>
            <div class="column">
              <div class="field">
                <span class="field-label">Дата та час закінчення робіт:</span>
                <span class="field-value"></span>
              </div>
            </div>
          </div>
          
          <div class="two-column">
            <div class="column">
              <div class="field">
                <span class="field-label">Авто №:</span>
                <span class="field-value"></span>
              </div>
            </div>
            <div class="column">
              <div class="field">
                <span class="field-label">Переробка, год.:</span>
                <span class="field-value"></span>
              </div>
            </div>
          </div>
          
          <div class="field">
            <span class="field-label">Фото зроблені, не зроблені:</span>
            <span class="field-value"></span>
          </div>
          
          <div class="field">
            <span class="field-label">Рекомендації виконувача робіт:</span>
            <span class="field-value"></span>
          </div>
          
          <div class="field">
            <span class="field-label"></span>
            <span class="field-value"></span>
          </div>
          
          <div class="field">
            <span class="field-label"></span>
            <span class="field-value"></span>
          </div>
          
          <div class="field">
            <span class="field-label">Коефіцієнт складності робіт:</span>
          </div>
          
          <div class="checkbox-section">
            <div class="checkbox-row">
              <div class="checkbox"></div>
              <span class="checkbox-label">Робота за комфортних умов, доброзичливість замовника - 1.0</span>
            </div>
            <div class="checkbox-row">
              <div class="checkbox"></div>
              <span class="checkbox-label">Робота на відкритому повітрі, при температурі нижче 0 град, (вище 27) сухо - 1.1</span>
            </div>
            <div class="checkbox-row">
              <div class="checkbox"></div>
              <span class="checkbox-label">Робота в дощ, сніг, сильний вітер - 1.2</span>
            </div>
            <div class="checkbox-row">
              <div class="checkbox"></div>
              <span class="checkbox-label">Робота в підвальних приміщеннях, на дахах - 1.3</span>
            </div>
            <div class="checkbox-row">
              <div class="checkbox"></div>
              <span class="checkbox-label">Робота в агресивному середовищі - 1.4</span>
            </div>
            <div class="checkbox-row">
              <div class="checkbox"></div>
              <span class="checkbox-label">Робота в нічний час (з 22:00 до 06:00) - 1.5</span>
            </div>
            <div class="checkbox-row">
              <div class="checkbox"></div>
              <span class="checkbox-label">Робота у вихідні та святкові дні - 1.6</span>
            </div>
            <div class="checkbox-row">
              <div class="checkbox"></div>
              <span class="checkbox-label">Терміновий виклик - 2.0</span>
            </div>
          </div>
          
          <div class="coefficient-note">
            *Коефіцієнт складності робіт це величина, що збільшує вартість робіт через специфічні, що не залежать від виконавця умов і не дозволяють якісно провести роботи без спеціальних навичок, обладнання через погодні умови, і т.д.
          </div>
          
          <div class="coefficient-note">
            *коефіцієнт може бути сумований.
          </div>
          
          <div class="signature-section">
            <div class="signature-block">
              <div><strong>РОБОТУ ПРИЙНЯВ</strong></div>
              <div>претензій не маю</div>
              <div class="signature-line">(ПІБ Замовника або його представника)</div>
              <div class="signature-line">(дата, підпис)</div>
            </div>
            
            <div class="signature-block">
              <div><strong>РОБОТУ ЗДАВ</strong></div>
              <div class="signature-line">(ПІБ Виконавця або його представника)</div>
              <div class="signature-line">(дата, підпис)</div>
            </div>
          </div>
        </div>
        
        <div class="no-print">
          <button class="print-button" onclick="printDocument()">🖨️ Друкувати</button>
          <button class="save-button" onclick="saveDocument()">💾 Зберегти</button>
          <button onclick="window.close()" style="
            background: #f44336;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 5px;
            transition: background 0.3s;
          " onmouseover="this.style.background='#d32f2f'" onmouseout="this.style.background='#f44336'">✕ Закрити</button>
        </div>
        
        <script>
          function printDocument() {
            window.print();
          }
          
          function saveDocument() {
            // Створюємо HTML контент для збереження
            const htmlContent = document.documentElement.outerHTML;
            
            // Створюємо Blob з HTML контентом
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            
            // Створюємо URL для blob
            const url = URL.createObjectURL(blob);
            
            // Створюємо посилання для завантаження
            const link = document.createElement('a');
            link.href = url;
            link.download = 'Наряд_Дарекс_Енерго_' + new Date().toISOString().slice(0,10) + '.html';
            
            // Додаємо посилання до DOM, клікаємо і видаляємо
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Очищуємо URL
            URL.revokeObjectURL(url);
          }
        </script>
      </body>
      </html>
    `;
  };

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
        <div style={{width:'97vw',maxWidth:'none',margin:'0 auto', background:'#fff', borderRadius:'8px', padding:'16px', position:'relative', zIndex:10}}>
          {/* Окремий контейнер для таблиці з sticky-заголовками */}
          <style>{`
            .table-scroll {
              max-height: 70vh;
              min-height: 400px;
              overflow: scroll;
              width: 100%;
              background: #fff !important;
              border-radius: 8px;
              position: relative;
              z-index: 5;
            }
            .sticky-table {
              min-width: 2000px;
              width: 100%;
              background: transparent;
              color: #333;
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
              white-space: normal;
              border: 1px solid #000 !important;
              border-collapse: collapse;
            }
            .sticky-table {
              border-collapse: collapse !important;
            }
            .sticky-table tbody tr {
              background: #fff;
              color: #333;
            }
            .sticky-table tbody tr:nth-child(even) {
              background: #f8f9fa;
            }
            .sticky-table tbody tr:hover {
              background: #e3f2fd;
            }
            /* Спеціальні кольори для завдань з різними статусами */
            .sticky-table tbody tr.rejected {
              background: #ff9999 !important;
              color: #111 !important;
            }
            .sticky-table tbody tr.rejected:hover {
              background: #ff7777 !important;
            }
            .sticky-table tbody tr.accountant-approved {
              background: #ffb6e6 !important;
              color: #111 !important;
            }
            .sticky-table tbody tr.warehouse-approved {
              background: #ffe066 !important;
              color: #111 !important;
            }
            .sticky-table tbody tr.regional-approved {
              background: #66d9ff !important;
              color: #111 !important;
            }
            .sticky-table tbody tr.accountant-warehouse {
              background: linear-gradient(90deg, #ffb6e6 50%, #ffe066 50%) !important;
              color: #111 !important;
            }
            .sticky-table tbody tr.accountant-regional {
              background: linear-gradient(90deg, #ffb6e6 50%, #66d9ff 50%) !important;
              color: #111 !important;
            }
            .sticky-table tbody tr.warehouse-regional {
              background: linear-gradient(90deg, #ffe066 50%, #66d9ff 50%) !important;
              color: #111 !important;
            }
            .sticky-table tbody tr.all-approved {
              background: linear-gradient(90deg, #ffb6e6 33%, #ffe066 33%, #66d9ff 66%) !important;
              color: #111 !important;
            }
            .table-scroll::-webkit-scrollbar {
              height: 12px;
              background: #f0f0f0;
            }
            .table-scroll::-webkit-scrollbar-thumb {
              background: #00bfff;
              border-radius: 6px;
            }
            .table-scroll::-webkit-scrollbar-track {
              background: #f0f0f0;
            }
            .table-scroll {
              scrollbar-color: #00bfff #f0f0f0;
              scrollbar-width: thin;
            }
            
            .resize-handle {
              position: absolute;
              top: 0;
              right: 0;
              width: 4px;
              height: 100%;
              background: transparent;
              cursor: col-resize;
              z-index: 10;
            }
            
            .resize-handle:hover {
              background: #00bfff;
            }
            
            .th-resizable {
              position: relative;
            }
            
            
            .td-auto-height {
              height: auto !important;
              min-height: 40px !important;
              max-height: 120px !important; /* Максимум в 3 рази більше стандартної висоти (40px) */
              overflow: hidden !important;
              word-wrap: break-word !important;
              white-space: normal !important;
              line-height: 1.2 !important;
              padding: 8px 4px !important;
              vertical-align: top !important;
            }
            
            .th-auto-height {
              height: auto !important;
              min-height: 40px !important;
              max-height: 120px !important;
              overflow: hidden !important;
              word-wrap: break-word !important;
              white-space: normal !important;
              line-height: 1.2 !important;
              vertical-align: top !important;
            }
            
            .action-buttons {
              display: flex !important;
              flex-wrap: nowrap !important;
              gap: 4px !important;
              align-items: center !important;
              justify-content: flex-start !important;
            }
            
            .action-buttons button {
              font-size: 10px !important;
              padding: 4px 6px !important;
              border-radius: 3px !important;
              border: none !important;
              cursor: pointer !important;
              white-space: nowrap !important;
              min-width: auto !important;
              height: 24px !important;
              line-height: 1 !important;
              margin-right: 0 !important;
            }
          `}</style>
          <div className="table-scroll">
            <table className="sticky-table">
              <thead>
                <tr>
                  <th>Дія</th>
                  {visibleColumns.map((col, idx) => {
                    // Знаходимо індекс цієї колонки в selected масиві
                    const selectedIdx = selected.findIndex(key => key === col.key);
                    return (
                    <th
                      key={col.key}
                      className="th-resizable th-auto-height"
                      draggable
                      onDragStart={e => handleDragStart(e, selectedIdx)}
                      onDrop={e => handleDrop(e, selectedIdx)}
                      onDragOver={handleDragOver}
                      onDoubleClick={() => handleSort(col.key)}
                      style={{
                        width: columnWidths[col.key] || 120,
                        minWidth: columnWidths[col.key] || 120,
                        maxWidth: columnWidths[col.key] || 120,
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
                          col.key === 'date' || col.key === 'requestDate' || col.key === 'paymentDate' ? (
                            <div style={{display:'flex',flexDirection:'column',minWidth:120, background:'#fff'}}>
                              <input type="date" name={col.key+"From"} value={filters[col.key+"From"] || ''} onChange={onFilterChange} style={{marginBottom:2, background:'#fff'}} />
                              <input type="date" name={col.key+"To"} value={filters[col.key+"To"] || ''} onChange={onFilterChange} style={{background:'#fff'}} />
                            </div>
                          ) : getFilterType(col.key) ? (
                            <select
                              name={col.key}
                              value={filters[col.key] || ''}
                              onChange={(e) => {
                                console.log('[DEBUG] TaskTable filter select changed:', col.key, e.target.value);
                                console.log('[DEBUG] Current filters state:', filters);
                                console.log('[DEBUG] TaskTable calling onFilterChange with:', e.target.name, e.target.value);
                                console.log('[DEBUG] TaskTable onFilterChange function:', onFilterChange);
                                console.log('[DEBUG] TaskTable onFilterChange type:', typeof onFilterChange);
                                if (typeof onFilterChange === 'function') {
                                  console.log('[DEBUG] TaskTable calling onFilterChange function');
                                  onFilterChange(e);
                                } else {
                                  console.error('[ERROR] TaskTable onFilterChange is not a function!');
                                }
                              }}
                              disabled={isFieldDisabled(col.key)}
                              style={{
                                width:'100%', 
                                background:'#fff',
                                border:'1px solid #ccc',
                                borderRadius:'2px',
                                padding:'2px',
                                fontSize:'10px'
                              }}
                            >
                              {getFilterType(col.key).map(option => (
                                <option key={option} value={option}>
                                  {option || 'Всі'}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              name={col.key}
                              placeholder={col.label}
                              value={filters[col.key] || ''}
                              onChange={(e) => {
                                console.log('[DEBUG] TaskTable filter input changed:', col.key, e.target.value);
                                console.log('[DEBUG] Current filters state:', filters);
                                console.log('[DEBUG] TaskTable calling onFilterChange with:', e.target.name, e.target.value);
                                console.log('[DEBUG] TaskTable onFilterChange function:', onFilterChange);
                                console.log('[DEBUG] TaskTable onFilterChange type:', typeof onFilterChange);
                                if (typeof onFilterChange === 'function') {
                                  console.log('[DEBUG] TaskTable calling onFilterChange function');
                                  onFilterChange(e);
                                } else {
                                  console.error('[ERROR] TaskTable onFilterChange is not a function!');
                                }
                              }}
                              style={{width:'100%', background:'#fff'}}
                            />
                          )
                      )}
                      <div
                        className="resize-handle"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const startX = e.clientX;
                          const startWidth = columnWidths[col.key] || 120;
                          
                          const handleMouseMove = (e) => {
                            const newWidth = startWidth + (e.clientX - startX);
                            handleColumnResize(col.key, newWidth);
                          };
                          
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };
                          
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                      />
                      </th>
                    );
                  })}
                  <th>Статус</th>
                  {role === 'admin' && <th>Дата підтвердження</th>}
                  {commentField && <th>Коментар</th>}
                </tr>
              </thead>
              <tbody>
                {sortData(tasks, sortConfig.field, sortConfig.direction).map(t => (
                  <tr key={t.id} className={getRowClass(t)} style={getRowColor(t) ? {background:getRowColor(t)} : {}}>
                    <td className="action-buttons" style={getRowColor(t) ? {color:'#111'} : {}}>
                      {/* Індикатор стану рахунку */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        marginBottom: '8px'
                      }}>
                        <div style={{
                          fontSize: '10px',
                          fontWeight: 'bold',
                          color: '#666',
                          marginBottom: '2px'
                        }}>
                          Статус рахунку
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: getInvoiceStatus(t).color,
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          minWidth: '100px',
                          justifyContent: 'center'
                        }}>
                          📄 {getInvoiceStatus(t).label}
                        </div>
                      </div>
                      {/* Перший ряд кнопок */}
                      <div style={{ display: 'flex', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <button onClick={()=>{
                        if (onHistoryClick && role === 'materials') {
                          // Для вкладки аналізу матеріалів - відкриваємо звіт по обладнанню
                          onHistoryClick(t.equipment);
                        } else if (onHistoryClick) {
                          // Для всіх інших вкладок - відкриваємо звіт по замовнику
                          onHistoryClick(t.client);
                        } else {
                          // Стандартна поведінка - відкриваємо модалку з історією по замовнику
                          setInfoTask(t);
                          setShowInfo(true);
                        }
                      }} style={{background:'#00bfff',color:'#fff'}}>Історія проведення робіт</button>
                      </div>
                      {/* Другий ряд кнопок */}
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {/* Спеціальна логіка для вкладки "Заявка на рахунок" */}
                      {showInvoiceActions ? (
                        <>
                          {/* Інформація про тип документів */}
                          <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '4px', 
                            marginBottom: '8px',
                            padding: '8px',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '4px',
                            border: '1px solid #dee2e6'
                          }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#495057' }}>
                              Тип документів:
                            </div>
                            {t.needInvoice && (
                              <div style={{ fontSize: '11px', color: '#28a745' }}>
                                📄 Потрібен рахунок
                              </div>
                            )}
                            {t.needAct && (
                              <div style={{ fontSize: '11px', color: '#17a2b8' }}>
                                📋 Потрібен акт виконаних робіт
                              </div>
                            )}
                          </div>
                          
                          {/* Кнопки дій для заявки на рахунок */}
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <button 
                              onClick={() => onEdit && onEdit(t)}
                              style={{
                                background: '#007bff',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              ✏️ Редагувати
                            </button>
                            
                            <button 
                              onClick={() => {
                                setDocumentUploadModal({ open: true, task: t });
                              }}
                              style={{
                                background: '#28a745',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              📤 Завантажити документи
                            </button>
                            
                            <button 
                              onClick={() => {
                                const hasFiles = t.invoiceFiles && t.invoiceFiles.length > 0;
                                const filesInfo = hasFiles ? 
                                  `\n\nПрикріплені файли:\n${t.invoiceFiles.map(f => `- ${f.name}`).join('\n')}` : 
                                  '\n\nФайли не прикріплені.';
                                
                                if (confirm(`Ви дійсно хочете закрити заявку?\n\nЗаявка: ${t.requestNumber || 'Без номера'}\nКлієнт: ${t.client || 'Без клієнта'}${filesInfo}`)) {
                                  if (onCompleteInvoiceRequest) {
                                    onCompleteInvoiceRequest(t.id);
                                  } else {
                                    console.error('[ERROR] TaskTable - onCompleteInvoiceRequest не передано');
                                    alert('Помилка: функція завершення завдання не налаштована');
                                  }
                                }
                              }}
                              style={{
                                background: '#ffc107',
                                color: '#000',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              ✅ Завершити завдання
                            </button>
                            
                            <button 
                              onClick={() => {
                                if (confirm(`Ви дійсно хочете видалити заявку?\n\nЗаявка: ${t.requestNumber || 'Без номера'}\nКлієнт: ${t.client || 'Без клієнта'}`)) {
                                  onDelete && onDelete(t.id);
                                }
                              }}
                              style={{
                                background: '#dc3545',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              🗑️ Видалити завдання
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                      {/* Кнопка редагування - в архіві тільки для адміністратора */}
                      {(!isArchive || role === 'admin' || user?.role === 'admin' || user?.role === 'administrator') && (
                        <>
                          {(role === 'service' || role === 'operator' || role === 'admin') && (
                            <>
                              {/* Спеціальна логіка для імпортованих заявок */}
                              {isImported ? (
                                <button onClick={()=>{
                                  // Логуємо редагування імпортованої заявки
                                  logUserAction(user, EVENT_ACTIONS.UPDATE, ENTITY_TYPES.TASK, t.id, 
                                    `Редагування імпортованої заявки: ${t.requestNumber || 'Без номера'} - ${t.client || 'Без клієнта'}`, {
                                      requestNumber: t.requestNumber,
                                      client: t.client,
                                      work: t.work,
                                      status: t.status,
                                      isImported: true
                                    });
                                  onEdit && onEdit(t);
                                }} style={{background:'#ff9800',color:'#fff'}}>
                                  Перевірити та зберегти
                                </button>
                              ) : (
                                <button onClick={()=>{
                                  // Логуємо редагування заявки
                                  logUserAction(user, EVENT_ACTIONS.UPDATE, ENTITY_TYPES.TASK, t.id, 
                                    `Редагування заявки: ${t.requestNumber || 'Без номера'} - ${t.client || 'Без клієнта'}`, {
                                      requestNumber: t.requestNumber,
                                      client: t.client,
                                      work: t.work,
                                      status: t.status
                                    });
                                  onEdit && onEdit(t);
                                }}>Редагувати</button>
                              )}
                              {/* Кнопка видалення - тільки для регіональних керівників та адміністраторів */}
                              {(() => {
                                const canDelete = user?.role === 'regionalManager' || user?.role === 'admin' || user?.role === 'administrator' || user?.role === 'regkerivn' || user?.role === 'regkerzavskl';
                                const hasTaskId = !!t.id;
                                const hasOnDeleteFunc = !!onDelete;
                                // Для імпортованих заявок завжди показуємо кнопку видалення
                                const shouldShowButton = isImported || (canDelete && hasTaskId && hasOnDeleteFunc);
                                
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
                                    showDeleteConfirmation(t);
                                  } else {
                                    console.error('[ERROR] Неможливо видалити заявку: ID відсутній або onDelete не передано', { taskId: t.id, hasOnDelete: !!onDelete });
                                  }
                                }} style={{background:'#f66',color:'#fff'}}>Видалити</button>
                              )}
                              {/* Кнопка наряду - тільки для сервісної служби */}
                              {role === 'service' && (
                                <button onClick={() => {
                                  generateWorkOrder(t);
                                }} style={{background:'#4CAF50',color:'#fff'}}>Наряд</button>
                              )}
                              {/* Для інших користувачів показуємо інформаційну кнопку */}
                              {(() => {
                                const shouldShowInfoButton = user?.role !== 'regionalManager' && user?.role !== 'admin' && user?.role !== 'administrator' && user?.role !== 'regkerivn' && user?.role !== 'regkerzavskl';
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
                          {(role === 'warehouse' || role === 'accountant' || role === 'buhgalteria' || role === 'regionalManager' || role === 'regional') && !(role === 'regional' && t._debtTab) && (
                            <button onClick={()=>{
                              // Логуємо редагування заявки
                              logUserAction(user, EVENT_ACTIONS.UPDATE, ENTITY_TYPES.TASK, t.id, 
                                `Редагування заявки: ${t.requestNumber || 'Без номера'} - ${t.client || 'Без клієнта'}`, {
                                  requestNumber: t.requestNumber,
                                  client: t.client,
                                  work: t.work,
                                  status: t.status
                                });
                              onEdit && onEdit(t);
                            }}>Редагувати</button>
                          )}
                        </>
                      )}
                      {/* Кнопка інформації - в архіві для всіх ролей крім адміністратора */}
                      {isArchive && role !== 'admin' && user?.role !== 'admin' && user?.role !== 'administrator' && (
                        <button onClick={()=>{
                          // Логуємо перегляд інформації заявки
                          logUserAction(user, EVENT_ACTIONS.VIEW, ENTITY_TYPES.TASK, t.id, 
                            `Перегляд інформації заявки: ${t.requestNumber || 'Без номера'} - ${t.client || 'Без клієнта'}`, {
                              requestNumber: t.requestNumber,
                              client: t.client,
                              work: t.work,
                              status: t.status
                            });
                          onEdit && onEdit({...t, _readOnly: true});
                        }} style={{background:'#43a047',color:'#fff'}}>Інформація</button>
                      )}
                      {/* Спеціальна логіка для вкладки "debt" регіонального керівника - тільки Історія та Інформація */}
                      {role === 'regional' && t._debtTab && (
                        <button onClick={()=>{
                          // Логуємо перегляд інформації заявки
                          logUserAction(user, EVENT_ACTIONS.VIEW, ENTITY_TYPES.TASK, t.id, 
                            `Перегляд інформації заявки: ${t.requestNumber || 'Без номера'} - ${t.client || 'Без клієнта'}`, {
                              requestNumber: t.requestNumber,
                              client: t.client,
                              work: t.work,
                              status: t.status
                            });
                          onEdit && onEdit({...t, _readOnly: true});
                        }} style={{background:'#43a047',color:'#fff'}}>Інформація</button>
                      )}
                      {/* Кнопки підтвердження для відповідних ролей - в архіві тільки для адміністратора */}
                      {((role === 'warehouse' || role === 'regional' || role === 'accountant' || role === 'buhgalteria' || role === 'regionalManager' || role === 'admin' || role === 'administrator' || user?.role === 'admin' || user?.role === 'administrator') && (!isArchive || user?.role === 'admin' || user?.role === 'administrator')) && !(role === 'regional' && t._debtTab) && onApprove && (
                        <>
                          {/* Кнопки підтвердження в другому рядку */}
                          <div style={{marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center'}}>
                            <button onClick={()=>{
                              // Логуємо затвердження заявки
                              logUserAction(user, EVENT_ACTIONS.APPROVE, ENTITY_TYPES.TASK, t.id, 
                                `Затверджено заявку: ${t.requestNumber || 'Без номера'} - ${t.client || 'Без клієнта'}`, {
                                  requestNumber: t.requestNumber,
                                  client: t.client,
                                  work: t.work,
                                  status: t.status
                                });
                              onApprove && onApprove(t.id, 'Підтверджено', '');
                            }} style={{background:'#0a0',color:'#fff', fontSize: '10px', padding: '4px 6px', borderRadius: '3px', border: 'none', cursor: 'pointer'}}>Підтвердити</button>
                            <button onClick={()=>setRejectModal({ open: true, taskId: t.id, comment: '' })} style={{background:'#f66',color:'#fff', fontSize: '10px', padding: '4px 6px', borderRadius: '3px', border: 'none', cursor: 'pointer'}}>Відхилити</button>
                            <button onClick={()=>{
                              // Логуємо відправку на розгляд
                              logUserAction(user, EVENT_ACTIONS.UPDATE, ENTITY_TYPES.TASK, t.id, 
                                `Відправлено на розгляд: ${t.requestNumber || 'Без номера'} - ${t.client || 'Без клієнта'}`, {
                                  requestNumber: t.requestNumber,
                                  client: t.client,
                                  work: t.work,
                                  status: t.status
                                });
                              onApprove && onApprove(t.id, 'На розгляді', '');
                            }} style={{background:'#ffe066',color:'#22334a', fontSize: '10px', padding: '4px 6px', borderRadius: '3px', border: 'none', cursor: 'pointer'}}>На розгляді</button>
                            {/* Показуємо поточний статус */}
                            {approveField && t[approveField] && (
                              <span style={{color:'#666', fontSize: '11px'}}>
                                (Поточний: {t[approveField] === 'Підтверджено' ? 'Підтверджено' : t[approveField] === 'Відмова' ? 'Відхилено' : t[approveField]})
                              </span>
                            )}
                          </div>
                        </>
                      )}
                      </>
                      )}
                      </div>
                    </td>
                    {visibleColumns.map(col => <td key={col.key} className="td-auto-height" style={{
                      ...(getRowColor(t) ? {color:'#111'} : {}),
                      width: columnWidths[col.key] || 120,
                      minWidth: columnWidths[col.key] || 120,
                      maxWidth: columnWidths[col.key] || 120
                    }}>{
                      col.key === 'approvedByWarehouse' ? (t.approvedByWarehouse === 'Підтверджено' ? 'Підтверджено' : t.approvedByWarehouse === 'Відмова' ? 'Відмова' : 'На розгляді') :
                      col.key === 'approvedByAccountant' ? (t.approvedByAccountant === 'Підтверджено' ? 'Підтверджено' : t.approvedByAccountant === 'Відмова' ? 'Відмова' : 'На розгляді') :
                      col.key === 'approvedByRegionalManager' ? (t.approvedByRegionalManager === 'Підтверджено' ? 'Підтверджено' : t.approvedByRegionalManager === 'Відмова' ? 'Відхилено' : 'На розгляді') :
                      col.key === 'debtStatus' ? (t.debtStatus === 'Документи в наявності' ? 'В наявності' : 'Заборгованість') :
                      col.key === 'debtStatusCheckbox' ? (t.debtStatusCheckbox ? 'В наявності' : 'Ні') :
                      col.key === 'documentType' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {t.needInvoice && (
                            <span style={{ 
                              fontSize: '10px', 
                              color: '#28a745', 
                              fontWeight: 'bold',
                              background: '#d4edda',
                              padding: '2px 4px',
                              borderRadius: '3px',
                              display: 'inline-block'
                            }}>
                              📄 Потрібен рахунок
                            </span>
                          )}
                          {t.needAct && (
                            <span style={{ 
                              fontSize: '10px', 
                              color: '#17a2b8', 
                              fontWeight: 'bold',
                              background: '#d1ecf1',
                              padding: '2px 4px',
                              borderRadius: '3px',
                              display: 'inline-block'
                            }}>
                              📋 Потрібен акт
                            </span>
                          )}
                          {!t.needInvoice && !t.needAct && (
                            <span style={{ 
                              fontSize: '10px', 
                              color: '#dc3545', 
                              fontWeight: 'bold',
                              background: '#f8d7da',
                              padding: '2px 4px',
                              borderRadius: '3px',
                              display: 'inline-block'
                            }}>
                              ⚠️ Не вказано
                            </span>
                          )}
                        </div>
                      ) :
                      formatCellValue(t[col.key])
                    }</td>)}
                    <td style={getRowColor(t) ? {color:'#111'} : {}}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span>{t.status}</span>
                        {t.needInvoice && (
                          <span style={{ 
                            fontSize: '10px', 
                            color: '#28a745', 
                            fontWeight: 'bold',
                            background: '#d4edda',
                            padding: '2px 4px',
                            borderRadius: '3px',
                            display: 'inline-block'
                          }}>
                            📄 Потрібен рахунок
                          </span>
                        )}
                        {t.needAct && (
                          <span style={{ 
                            fontSize: '10px', 
                            color: '#17a2b8', 
                            fontWeight: 'bold',
                            background: '#d1ecf1',
                            padding: '2px 4px',
                            borderRadius: '3px',
                            display: 'inline-block'
                          }}>
                            📋 Потрібен акт
                          </span>
                        )}
                      </div>
                    </td>
                    {(role === 'admin' || user?.role === 'administrator') && <td style={getRowColor(t) ? {color:'#111'} : {}}>
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
                    {commentField && (
                      <td style={getRowColor(t) ? {color:'#111'} : {}}>
                        <input
                          value={typeof t[commentField] === 'string' ? t[commentField] : ''}
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
          <div style={{padding:'8px 16px', background:'#f8f9fa', color:'#333', borderTop:'1px solid #ddd', fontSize:'14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
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
      {(role === 'admin' || user?.role === 'administrator') && editDateModal.open && (
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
      {/* --- Модальне вікно для підтвердження видалення заявки --- */}
      {deleteConfirmModal.open && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#22334a',padding:32,borderRadius:8,minWidth:400,maxWidth:500,boxShadow:'0 4px 32px #0008',color:'#fff',display:'flex',flexDirection:'column',gap:16}}>
            <h3 style={{color:'#ff6666',margin:0}}>⚠️ Підтвердження видалення заявки</h3>
            
            <div style={{background:'#1a2636',padding:16,borderRadius:6,border:'1px solid #444'}}>
              <p style={{margin:'0 0 12px 0',fontWeight:600}}>Ви дійсно хочете видалити цю заявку?</p>
              
              {deleteConfirmModal.taskInfo && (
                <div style={{fontSize:14,lineHeight:1.5}}>
                  <p><strong>Номер заявки:</strong> {deleteConfirmModal.taskInfo.requestNumber || 'Не вказано'}</p>
                  <p><strong>Замовник:</strong> {deleteConfirmModal.taskInfo.client || 'Не вказано'}</p>
                  <p><strong>Найменування робіт:</strong> {deleteConfirmModal.taskInfo.work || 'Не вказано'}</p>
                  <p><strong>Дата проведення робіт:</strong> {deleteConfirmModal.taskInfo.date || 'Не вказано'}</p>
                  <p><strong>Статус:</strong> {deleteConfirmModal.taskInfo.status || 'Не вказано'}</p>
                </div>
              )}
              
              <div style={{background:'#ff4444',color:'#fff',padding:12,borderRadius:4,marginTop:12,fontSize:14}}>
                <strong>⚠️ Увага!</strong> Ця дія є незворотною. Всі дані заявки, включаючи файли та історію, будуть повністю видалені з системи.
              </div>
            </div>
            
            <div style={{display:'flex',gap:12,marginTop:8}}>
              <button 
                type="button" 
                style={{flex:1,background:'#d32f2f',color:'#fff',padding:'12px 16px',border:'none',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer'}} 
                onClick={handleDeleteConfirm}
              >
                🗑️ Видалити заявку
              </button>
              <button 
                type="button" 
                style={{flex:1,background:'#666',color:'#fff',padding:'12px 16px',border:'none',borderRadius:6,fontSize:14,fontWeight:600,cursor:'pointer'}} 
                onClick={handleDeleteCancel}
              >
                ✕ Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Модальне вікно для завантаження документів - тільки якщо функції передані */}
      <DocumentUploadModal
        isOpen={documentUploadModal.open}
        onClose={() => setDocumentUploadModal({ open: false, task: null })}
        task={documentUploadModal.task}
        onInvoiceUpload={onInvoiceUpload}
        onActUpload={onActUpload}
        onInvoiceDelete={onInvoiceDelete}
        onActDelete={onActDelete}
        uploadingFiles={uploadingFiles}
      />
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