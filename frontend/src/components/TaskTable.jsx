import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ModalTaskForm from '../ModalTaskForm';
import NewDocumentUploadModal from './NewDocumentUploadModal';
import { columnsSettingsAPI } from '../utils/columnsSettingsAPI';
import { regionsAPI } from '../utils/regionsAPI';
import { logUserAction, EVENT_ACTIONS, ENTITY_TYPES } from '../utils/eventLogAPI';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, PageBreak, SectionType } from 'docx';
import { saveAs } from 'file-saver';

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
  onFixRejected,
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
  onInvoiceUpload = () => {},
  onActUpload = () => {},
  onInvoiceDelete = () => {},
  onActDelete = () => {},
  uploadingFiles = new Set(),
  accessRules = {},
  currentArea = null,
}) {
  // console.log('[LOG] TaskTable received columns:', columns);
  // console.log('[LOG] TaskTable role:', role);
  // console.log('[LOG] TaskTable user:', user);
  // console.log('[LOG] TaskTable user?.region:', user?.region);
  // console.log('[LOG] TaskTable filters:', filters);
  // console.log('[LOG] TaskTable onDelete:', onDelete);
  // console.log('[LOG] TaskTable user?.role:', user?.role);
  // console.log('[LOG] TaskTable onFilterChange:', onFilterChange);
  // console.log('[LOG] TaskTable onInvoiceUpload:', typeof onInvoiceUpload, onInvoiceUpload);
  // console.log('[LOG] TaskTable onActUpload:', typeof onActUpload, onActUpload);
  // console.log('[LOG] TaskTable uploadingFiles:', uploadingFiles);
  
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
  const [modalKey, setModalKey] = useState(0);
  const [regions, setRegions] = useState([]);
  
  // Перевіряємо права доступу для поточної області
  const hasFullAccess = accessRules && user && accessRules[user.role] && accessRules[user.role][currentArea] === 'full';
  const isReadOnly = accessRules && user && accessRules[user.role] && accessRules[user.role][currentArea] === 'read';
  
  // Ref для збереження фокусу в фільтрах
  const filterInputRefs = useRef({});
  
  // Оптимізована функція обробки змін фільтрів
  const handleFilterChange = useCallback((e) => {
    const { name, value } = e.target;
    
    // Оновлюємо локальний стан фільтрів
    setLocalFilters(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Викликаємо onFilterChange
    if (typeof onFilterChange === 'function') {
      onFilterChange(e);
    }
  }, [onFilterChange]);
  const getFilterType = useMemo(() => {
    const selectFields = {
      'status': ['', 'Заявка', 'В роботі', 'Виконано', 'Заблоковано'],
      'company': ['', 'ДТС', 'Дарекс Енерго', 'інша'],
      'paymentType': ['не вибрано', 'Безготівка', 'Готівка', 'На карту', 'Інше'],
      'approvedByWarehouse': ['На розгляді', 'Підтверджено', 'Відмова'],
      'approvedByAccountant': ['На розгляді', 'Підтверджено', 'Відмова'],
      'approvedByRegionalManager': ['На розгляді', 'Підтверджено', 'Відмова'],
      'serviceRegion': (() => {
        if (regions.length === 0) return [];
        
        // Якщо користувач має множинні регіони, показуємо тільки їх регіони (без "Загальний")
        if (user?.region && user.region.includes(',')) {
          const userRegions = user.region.split(',').map(r => r.trim());
          return ['', ...userRegions];
        }
        
        // Якщо користувач має доступ до всіх регіонів або один регіон
        return ['', ...regions.map(r => r.name)];
      })()
    };
    
    return (colKey) => selectFields[colKey] || null;
  }, [regions, user?.region]);

  const isFieldDisabled = useMemo(() => {
    return (colKey) => {
      if (colKey === 'serviceRegion') {
        // Розблоковуємо для користувачів з множинними регіонами або з регіоном "Україна"
        if (user?.region === 'Україна') return false;
        if (user?.region && user.region.includes(',')) return false;
        // Блокуємо для користувачів з одним регіоном
        return true;
      }
      return false;
    };
  }, [user?.region]);

  const getClientHistory = useMemo(() => {
    return (client) => (allTasks.length ? allTasks : tasks).filter(t => t.client === client);
  }, [allTasks, tasks]);
  
  // Форматує дату з часом у формат 12.11.2025 12:51
  function formatDateTime(value) {
    if (!value) return '';
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (_) {
      return value;
    }
  }
  
  // Функція для перевірки відмови
  function isRejected(value) {
    return value === false || value === 'Відмова';
  }
  
  // Форматує значення клітинки, щоб уникнути передачі об'єктів у JSX
  function formatCellValue(value, fieldKey) {
    if (value === null || value === undefined) return '';
    
    // Поля з датами та часом
    const dateTimeFields = ['autoCreatedAt', 'autoCompletedAt', 'autoWarehouseApprovedAt', 
                            'autoAccountantApprovedAt', 'invoiceRequestDate', 'invoiceUploadDate'];
    if (dateTimeFields.includes(fieldKey)) {
      return formatDateTime(value);
    }
    
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
  // Використовуємо currentArea якщо передано (для правильного збереження налаштувань),
  // інакше використовуємо role як fallback
  const area = currentArea || role;
  
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
  const [localFilters, setLocalFilters] = useState(filters || {});
  
  // Синхронізуємо локальний стан з пропсом
  useEffect(() => {
    setLocalFilters(filters || {});
  }, [filters]);
  
  // Додаємо логування для відстеження фокусу
  useEffect(() => {
    const handleFocusIn = (e) => {
      if (e.target.tagName === 'INPUT' && e.target.name) {
        console.log('[DEBUG] Focus gained on input:', e.target.name, e.target.value);
        // Зберігаємо поточний активний елемент
        filterInputRefs.current.activeElement = e.target;
      }
    };
    
    const handleFocusOut = (e) => {
      if (e.target.tagName === 'INPUT' && e.target.name) {
        console.log('[DEBUG] Focus lost on input:', e.target.name, e.target.value);
      }
    };
    
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);
  
  // Відновлюємо фокус після перерендеру
  useEffect(() => {
    const activeElement = filterInputRefs.current.activeElement;
    if (activeElement && document.activeElement !== activeElement) {
      // Невелика затримка для відновлення фокусу
      setTimeout(() => {
        if (activeElement && activeElement.offsetParent !== null) {
          activeElement.focus();
        }
      }, 10);
    }
  });
  
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
  }, [userLogin, area, columns.length]); // Використовуємо userLogin, area, columns.length замість refs для правильного спрацювання useEffect
  
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
  if (loadingSettings || !settingsLoaded || selected.length === 0) {
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

  // Додаю функцію для визначення кольору рядка
  function getRowColor(t) {
    // Перевіряємо, чи хтось відхилив заявку
    if (t.approvedByAccountant === 'Відмова' || t.approvedByWarehouse === 'Відмова' || t.approvedByRegionalManager === 'Відмова') {
      return '#ff9999'; // Більш насичений червоний колір для відхилених заявок
    }
    
    // Підсвічування термінових заявок (тільки для статусів "Заявка" та "В роботі")
    if (t.urgentRequest && (t.status === 'Заявка' || t.status === 'В роботі')) {
      // Блакитний колір для термінових заявок
      if (t.status === 'Заявка') {
        return '#87ceeb'; // Блакитний для термінових заявок зі статусом "Заявка"
      } else if (t.status === 'В роботі') {
        return '#87ceeb'; // Блакитний для термінових заявок зі статусом "В роботі"
      }
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

  // Функція для фільтрації завдань за фільтрами
  const filterTasks = (data, filters) => {
    if (!filters || Object.keys(filters).length === 0) return data;
    
    console.log('[DEBUG] Фільтрація завдань:', { filters, dataLength: data.length });
    
    return data.filter(task => {
      // Перевіряємо кожен фільтр
      for (const [key, value] of Object.entries(filters)) {
        if (!value || value === '') continue; // Пропускаємо порожні фільтри
        
        // Обробка фільтрів дат з From/To
        if (key.endsWith('From')) {
          const field = key.replace('From', '');
          if (!task[field]) return false;
          const taskDate = new Date(task[field]);
          const filterDate = new Date(value);
          if (isNaN(taskDate.getTime()) || isNaN(filterDate.getTime())) return false;
          if (taskDate < filterDate) return false;
          continue;
        }
        
        if (key.endsWith('To')) {
          const field = key.replace('To', '');
          if (!task[field]) return false;
          const taskDate = new Date(task[field]);
          const filterDate = new Date(value);
          if (isNaN(taskDate.getTime()) || isNaN(filterDate.getTime())) return false;
          if (taskDate > filterDate) return false;
          continue;
        }
        
        let taskValue = task[key];
        
        // Обробка null/undefined значень
        if (taskValue === null || taskValue === undefined) taskValue = '';
        
        // Перетворюємо в рядок для порівняння
        const filterValue = String(value).toLowerCase();
        const taskValueStr = String(taskValue).toLowerCase();
        
        // Перевіряємо чи містить значення завдання фільтр
        if (!taskValueStr.includes(filterValue)) {
          return false;
        }
      }
      return true;
    });
  };

  // Створюємо відсортовані завдання після оголошення filterTasks
  const sortedTasks = [...filterTasks(tasks, filters)].sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));

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
    
    // Форматуємо дату для шаблону
    let formattedDate = { day: '___', month: '________', year: '202____' };
    if (hasWorkDate) {
      try {
        // Парсимо дату - спробуємо різні формати
        let dateObj;
        const dateStr = task.date.trim();
        // Якщо формат YYYY-MM-DD
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = dateStr.split('-').map(Number);
          dateObj = new Date(year, month - 1, day);
        } else {
          dateObj = new Date(dateStr);
        }
        
        if (!isNaN(dateObj.getTime())) {
          const day = dateObj.getDate().toString().padStart(2, '0');
          const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 
                         'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
          const month = months[dateObj.getMonth()];
          const year = dateObj.getFullYear();
          formattedDate = { day, month, year };
        }
      } catch (e) {
        console.error('Помилка форматування дати:', e);
      }
    }
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

    // Використовуємо HTML шаблони, які вже правильно налаштовані
    // Word може відкривати HTML файли і зберігати їх як .docx
    if (company === 'ДТС' || company === 'Дарекс Трейдінг Солюшнс') {
      const htmlContent = generateDTSTemplate(workOrderData, workOrderNumber, workOrderDate, formattedDate, engineers, task);
      downloadHTMLAsWord(htmlContent, company, workOrderNumber);
    } else {
      const htmlContent = generateDarexEnergyTemplate(workOrderData, workOrderNumber, workOrderDate, formattedDate, engineers);
      downloadHTMLAsWord(htmlContent, company, workOrderNumber);
    }
  };

  // Функція для завантаження HTML як Word документа
  const downloadHTMLAsWord = async (htmlContent, company, workOrderNumber) => {
    try {
      // Конвертуємо зображення в base64 для Word
      const convertImageToBase64 = async (imagePath) => {
        try {
          const response = await fetch(imagePath);
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.warn('Не вдалося завантажити зображення:', imagePath, error);
          return null;
        }
      };

      // Конвертуємо зображення в base64
      let htmlWithImages = htmlContent;
      
      // Для ДТС шаблону
      if (company === 'ДТС' || company === 'Дарекс Трейдінг Солюшнс') {
        const img1Base64 = await convertImageToBase64('/images/Зображення1.png');
        const img2Base64 = await convertImageToBase64('/images/Зображення2.png');
        
        if (img1Base64) {
          htmlWithImages = htmlWithImages.replace(
            'src="/images/Зображення1.png"',
            `src="${img1Base64}"`
          );
        }
        if (img2Base64) {
          htmlWithImages = htmlWithImages.replace(
            'src="/images/Зображення2.png"',
            `src="${img2Base64}"`
          );
        }
      } else {
        // Для Дарекс Енерго
        const headerBase64 = await convertImageToBase64('/header.png');
        if (headerBase64) {
          htmlWithImages = htmlWithImages.replace(
            'src="/header.png"',
            `src="${headerBase64}"`
          );
        }
      }
      
      // Видаляємо блок з кнопками (.no-print) з HTML для Word
      const processedHtml = htmlWithImages.replace(/<div class="no-print">[\s\S]*?<\/div>/gi, '');
      
      // Створюємо HTML з правильним MIME типом для Word
      const htmlBlob = new Blob([processedHtml], { 
        type: 'application/msword;charset=utf-8' 
      });
      
      // Формуємо назву файлу з розширенням .doc (Word відкриє і зможе зберегти як .docx)
      const fileName = company === 'ДТС' || company === 'Дарекс Трейдінг Солюшнс' 
        ? `Наряд_ДТС_${workOrderNumber}_${new Date().toISOString().slice(0,10)}.doc`
        : `Наряд_Дарекс_Енерго_${workOrderNumber}_${new Date().toISOString().slice(0,10)}.doc`;
      
      // Завантажуємо файл
      saveAs(htmlBlob, fileName);
      
      // Відкриваємо в новому вікні для перегляду (з кнопками та base64 зображеннями)
      const newWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes,resizable=yes');
      if (newWindow) {
        // В браузері показуємо HTML з кнопками та base64 зображеннями
        newWindow.document.write(htmlWithImages);
        newWindow.document.close();
      }
      
    } catch (error) {
      console.error('Помилка створення Word документа:', error);
      alert('Помилка створення документа. Перевірте консоль для деталей.');
    }
  };

  // Функція для створення Word документа
  const createWorkOrderWordDocument = async (workOrderData, workOrderNumber, workOrderDate, formattedDate, engineers, task, company) => {
    try {
      const children = [];
      
      // Шапка компанії
      if (company === 'ДТС' || company === 'Дарекс Трейдінг Солюшнс') {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "ТОВ \"ДАРЕКС ТРЕЙДІНГ СОЛЮШНС\"", bold: true, size: 24 })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          })
        );
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "СЕРВІСНА СЛУЖБА", bold: true, size: 22, color: "008000" })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          })
        );
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "ТОВ «ДАРЕКС ТРЕЙДІНГ СОЛЮШНС»", size: 20 })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          })
        );
      } else {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "ТОВ \"ДАРЕКС ЕНЕРГО\"", bold: true, size: 24 })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          })
        );
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "СЕРВІСНА СЛУЖБА", bold: true, size: 22, color: "008000" })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          })
        );
      }
      
      // Заголовок
      children.push(
        new Paragraph({
          text: "НАРЯД НА ВИКОНАННЯ РОБІТ",
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 }
        })
      );

      // Номер наряду та дата
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "№ наряду: ", bold: true }),
            new TextRun({ text: workOrderNumber })
          ],
          spacing: { after: 100 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `від «${formattedDate.day}» ${formattedDate.month} ${formattedDate.year} р.):` })
          ],
          spacing: { after: 100 }
        })
      );

      // Роботи виконує
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "1. Роботи виконує: ", bold: true }),
            new TextRun({ text: engineers })
          ],
          spacing: { after: 100 }
        })
      );

      // Замовник
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "2. Замовник: ", bold: true }),
            new TextRun({ text: workOrderData.client })
          ],
          spacing: { after: 100 }
        })
      );

      // Адреса
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "3. Адреса об'єкта: ", bold: true }),
            new TextRun({ text: workOrderData.address })
          ],
          spacing: { after: 100 }
        })
      );

      // Обладнання
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "4. Найменування обладнання: ", bold: true }),
            new TextRun({ text: workOrderData.equipment })
          ],
          spacing: { after: 100 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Зав. №: ", bold: true }),
            new TextRun({ text: workOrderData.serialNumber })
          ],
          spacing: { after: 100 }
        })
      );

      // Тип двигуна (якщо є)
      if (workOrderData.engineModel) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "5. Тип двигуна: ", bold: true }),
              new TextRun({ text: workOrderData.engineModel })
            ],
            spacing: { after: 100 }
          })
        );
      }

      if (workOrderData.engineSerial) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Зав. №: ", bold: true }),
              new TextRun({ text: workOrderData.engineSerial })
            ],
            spacing: { after: 100 }
          })
        );
      }

      // Тип панелі керування
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "6. Тип панелі керування: ", bold: true }),
            new TextRun({ text: "" })
          ],
          spacing: { after: 100 }
        })
      );

      // Вид робіт
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "7. Вид робіт: ", bold: true }),
            new TextRun({ text: workOrderData.workType })
          ],
          spacing: { after: 100 }
        })
      );

      // Технічний стан
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "8. Технічний стан обладнання перед проведенням робіт: ", bold: true })
          ],
          spacing: { after: 100 }
        })
      );

      // Перелік виконаних робіт
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "9. Перелік виконаних робіт/послуг: ", bold: true }),
            new TextRun({ text: workOrderData.performedWork || "" })
          ],
          spacing: { after: 100 }
        })
      );

      children.push(
        new Paragraph({
          text: "",
          spacing: { after: 50 }
        })
      );

      children.push(
        new Paragraph({
          text: "",
          spacing: { after: 50 }
        })
      );

      // Після проведення робіт
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "10. Після проведення робіт та випробувань, ДГУ знаходиться в робочому / неробочому стані, в режимі ручне авто, напрацювання становить ____ мотогодин." })
          ],
          spacing: { after: 100 }
        })
      );

      // Навантаження
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "11. Навантаження: L1 ____, L2 ____, L3 ____, U1 ____, U2 ____, U3 ____, V." })
          ],
          spacing: { after: 200 }
        })
      );

      // Таблиця матеріалів
      const materialsRows = [
        new TableRow({
          children: [
            new TableCell({ 
              children: [new Paragraph({ 
                children: [new TextRun({ text: "№", bold: true })], 
                alignment: AlignmentType.CENTER 
              })], 
              width: { size: 8, type: WidthType.PERCENTAGE },
              shading: { fill: "E0E0E0" }
            }),
            new TableCell({ 
              children: [new Paragraph({ 
                children: [new TextRun({ text: "Найменування", bold: true })] 
              })], 
              width: { size: 32, type: WidthType.PERCENTAGE },
              shading: { fill: "E0E0E0" }
            }),
            new TableCell({ 
              children: [new Paragraph({ 
                children: [new TextRun({ text: "Один. виміру", bold: true })], 
                alignment: AlignmentType.CENTER 
              })], 
              width: { size: 12, type: WidthType.PERCENTAGE },
              shading: { fill: "E0E0E0" }
            }),
            new TableCell({ 
              children: [new Paragraph({ 
                children: [new TextRun({ text: "Кількість", bold: true })], 
                alignment: AlignmentType.CENTER 
              })], 
              width: { size: 12, type: WidthType.PERCENTAGE },
              shading: { fill: "E0E0E0" }
            }),
            new TableCell({ 
              children: [new Paragraph({ 
                children: [new TextRun({ text: "Ціна з ПДВ, грн", bold: true })], 
                alignment: AlignmentType.CENTER 
              })], 
              width: { size: 18, type: WidthType.PERCENTAGE },
              shading: { fill: "E0E0E0" }
            }),
            new TableCell({ 
              children: [new Paragraph({ 
                children: [new TextRun({ text: "Вартість з ПДВ, грн", bold: true })], 
                alignment: AlignmentType.CENTER 
              })], 
              width: { size: 18, type: WidthType.PERCENTAGE },
              shading: { fill: "E0E0E0" }
            })
          ]
        })
      ];

      // Додаємо 8 порожніх рядків
      for (let i = 1; i <= 8; i++) {
        materialsRows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: i.toString(), alignment: AlignmentType.CENTER })] }),
              new TableCell({ children: [new Paragraph({ text: "" })] }),
              new TableCell({ children: [new Paragraph({ text: "" })] }),
              new TableCell({ children: [new Paragraph({ text: "" })] }),
              new TableCell({ children: [new Paragraph({ text: "" })] }),
              new TableCell({ children: [new Paragraph({ text: "" })] })
            ]
          })
        );
      }

      children.push(
        new Paragraph({
          text: "6.1. ПЕРЕЛІК МАТЕРІАЛІВ ТА ЗАПЧАСТИН, ВИКОРИСТАНИХ ПІД ЧАС РОБІТ:",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Загальна вартість матеріалів та запчастин: ", bold: true }),
            new TextRun({ text: "____ грн." })
          ],
          spacing: { after: 200 }
        })
      );

      children.push(
        new Table({
          rows: materialsRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [500, 3000, 1500, 1500, 2000, 2000]
        })
      );

      // Вартість
      children.push(
        new Paragraph({
          text: "6.2. Вартість ремонту/робіт:",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Коефіцієнт складності: _____" })
          ],
          spacing: { after: 50 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Діагностика: _____ грн." })
          ],
          spacing: { after: 50 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Вартість технічного обслуговування: _____ грн." })
          ],
          spacing: { after: 50 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Вартість ремонту (1людино-година*1200 грн.): _____ грн." })
          ],
          spacing: { after: 50 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Вартість пусконалагоджувальних робіт: _____ грн." })
          ],
          spacing: { after: 50 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Загальна вартість з урахуванням коефіцієнта складності: _____ грн." })
          ],
          spacing: { after: 200 }
        })
      );

      // Виїзд
      children.push(
        new Paragraph({
          text: "6.3. Виїзд на об'єкт Замовника: тариф: по місту 600.00 грн.",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Виїзд за місто ____ км * 15,00 грн/км; разом ____ грн." })
          ],
          spacing: { after: 200 }
        })
      );

      // Добові
      children.push(
        new Paragraph({
          text: "6.4. Добові у відрядженні: 600.00 грн. ____ діб ____ люд. разом ____ грн.",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        })
      );

      // Проживання
      children.push(
        new Paragraph({
          text: "6.5. Проживання: ____ грн. разом ____ грн.",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 200 }
        })
      );

      // Загальна вартість
      children.push(
        new Paragraph({
          children: [
            new TextRun({ 
              text: "ЗАГАЛЬНА ВАРТІСТЬ РОБІТ з ПДВ (усього по пп.6.1-6.5) ____ грн.",
              bold: true,
              size: 24
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 }
        })
      );

      // Роботи виконав
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Роботи виконав: ", bold: true }),
            new TextRun({ text: engineers })
          ],
          spacing: { after: 100 }
        })
      );

      // Замовник повторно
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Замовник: ", bold: true }),
            new TextRun({ text: workOrderData.client })
          ],
          spacing: { after: 100 }
        })
      );

      // Адреса повторно
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Адреса об'єкта: ", bold: true }),
            new TextRun({ text: workOrderData.address })
          ],
          spacing: { after: 100 }
        })
      );

      // Відмітка про оплату
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Відмітка про оплату: ", bold: true }),
            new TextRun({ text: workOrderData.paymentMethod || "" })
          ],
          spacing: { after: 200 }
        })
      );

      // Наступне технічне обслуговування
      children.push(
        new Paragraph({
          children: [
            new TextRun({ 
              text: "НАСТУПНЕ ТЕХНІЧНЕ ОБСЛУГОВУВАННЯ ПРОВЕСТИ ПРИ НАПРАЦЮВАННІ",
              bold: true,
              size: 22
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "МОТОГОДИН, АБО «___» ___ 20___ РОКУ." })
          ],
          spacing: { after: 200 }
        })
      );

      // Дата та час робіт
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Дата та час початку робіт: ", bold: true }),
            new TextRun({ text: "_________________" })
          ],
          spacing: { after: 100 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Дата та час закінчення робіт: ", bold: true }),
            new TextRun({ text: "_________________" })
          ],
          spacing: { after: 100 }
        })
      );

      // Авто та переробка
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Авто №: ", bold: true }),
            new TextRun({ text: "_________________" }),
            new TextRun({ text: "  Переробка, год.: ", bold: true }),
            new TextRun({ text: "_________________" })
          ],
          spacing: { after: 100 }
        })
      );

      // Фото
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Фото зроблені, не зроблені: ", bold: true }),
            new TextRun({ text: "_________________" })
          ],
          spacing: { after: 100 }
        })
      );

      // Рекомендації
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Рекомендації виконувача робіт: ", bold: true }),
            new TextRun({ text: workOrderData.recommendations || "" })
          ],
          spacing: { after: 100 }
        })
      );

      children.push(
        new Paragraph({
          text: "",
          spacing: { after: 50 }
        })
      );

      children.push(
        new Paragraph({
          text: "",
          spacing: { after: 50 }
        })
      );

      // Коефіцієнт складності
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Коефіцієнт складності робіт: ", bold: true })
          ],
          spacing: { after: 100 }
        })
      );

      const complexityFactors = [
        "Робота за комфортних умов, доброзичливість замовника - 1.0",
        "Робота на відкритому повітрі, при температурі нижче 0 град, (вище 27) сухо - 1.1",
        "Робота в дощ, сніг, сильний вітер - 1.2",
        "Робота в підвальних приміщеннях, на дахах - 1.3",
        "Робота в агресивному середовищі - 1.4",
        "Робота в нічний час (з 22:00 до 06:00) - 1.5",
        "Робота у вихідні та святкові дні - 1.6",
        "Терміновий виклик - 2.0"
      ];

      complexityFactors.forEach(factor => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "☐ " }),
              new TextRun({ text: factor })
            ],
            spacing: { after: 50 }
          })
        );
      });

      children.push(
        new Paragraph({
          children: [
            new TextRun({ 
              text: "*Коефіцієнт складності робіт це величина, що збільшує вартість робіт через специфічні, що не залежать від виконавця умов і не дозволяють якісно провести роботи без спеціальних навичок, обладнання через погодні умови, і т.д.",
              italics: true,
              size: 20
            })
          ],
          spacing: { before: 200, after: 50 }
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ 
              text: "*коефіцієнт може бути сумований.",
              italics: true,
              size: 20
            })
          ],
          spacing: { after: 200 }
        })
      );

      // Підписи в двох колонках
      const signatureRows = [
        new TableRow({
          children: [
            new TableCell({ 
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: "РОБОТУ ПРИЙНЯВ", bold: true })
                  ],
                  alignment: AlignmentType.CENTER
                }),
                new Paragraph({
                  text: "претензій не маю",
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 100 }
                }),
                new Paragraph({
                  text: "(ПІБ Замовника або його представника)",
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 50 }
                }),
                new Paragraph({
                  text: "(дата, підпис)",
                  alignment: AlignmentType.CENTER
                })
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: "top"
            }),
            new TableCell({ 
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: "РОБОТУ ЗДАВ", bold: true })
                  ],
                  alignment: AlignmentType.CENTER
                }),
                new Paragraph({
                  text: "",
                  spacing: { after: 100 }
                }),
                new Paragraph({
                  text: "(ПІБ Виконавця або його представника)",
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 50 }
                }),
                new Paragraph({
                  text: "(дата, підпис)",
                  alignment: AlignmentType.CENTER
                })
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: "top"
            })
          ]
        })
      ];

      children.push(
        new Table({
          rows: signatureRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [5000, 5000]
        })
      );

      // Створюємо документ з правильними налаштуваннями сторінки
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              size: {
                orientation: SectionType.PORTRAIT,
                width: 12240, // A4 width in TWIP (1/20 point)
                height: 15840  // A4 height in TWIP
              },
              margin: {
                top: 1440,    // 2.5cm = 1440 TWIP
                right: 1440,  // 2.5cm
                bottom: 1440, // 2.5cm
                left: 1440    // 2.5cm
              }
            }
          },
          children: children
        }]
      });

      // Генеруємо та завантажуємо файл
      const blob = await Packer.toBlob(doc);
      const fileName = company === 'ДТС' || company === 'Дарекс Трейдінг Солюшнс' 
        ? `Наряд_ДТС_${workOrderNumber}_${new Date().toISOString().slice(0,10)}.docx`
        : `Наряд_Дарекс_Енерго_${workOrderNumber}_${new Date().toISOString().slice(0,10)}.docx`;
      
      saveAs(blob, fileName);
      
      // Відкриваємо файл автоматично (якщо браузер підтримує)
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      
    } catch (error) {
      console.error('Помилка створення Word документа:', error);
      alert('Помилка створення Word документа. Перевірте консоль для деталей.');
    }
  };

  // Функція для генерації шаблону ДТС
  const generateDTSTemplate = (workOrderData, workOrderNumber, workOrderDate, formattedDate, engineers, task) => {
    return `
      <!DOCTYPE html>
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40" lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="ProgId" content="Word.Document">
        <meta name="Generator" content="Microsoft Word">
        <meta name="Originator" content="Microsoft Word">
        <title>Наряд ДТС-2</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page {
            size: A4;
            margin: 1.27cm 1.27cm 1.27cm 1.27cm;
            mso-page-orientation: portrait;
          }
          
          body {
            font-family: 'Times New Roman', serif;
            font-size: 11pt;
            line-height: 1.2;
            margin: 0;
            padding: 0;
            color: #000;
            mso-margin-top-alt: 720;
            mso-margin-bottom-alt: 720;
            mso-margin-left-alt: 720;
            mso-margin-right-alt: 720;
          }
          
          .page {
            width: 21cm;
            min-height: 29.7cm;
            margin: 0 auto;
            padding: 1.27cm;
            box-sizing: border-box;
            position: relative;
          }
          
          div.Section1 {
            mso-margin-top-alt: 720;
            mso-margin-bottom-alt: 720;
            mso-margin-left-alt: 720;
            mso-margin-right-alt: 720;
            page: Section1;
          }
          
          @page Section1 {
            size: 21.0cm 29.7cm;
            margin: 1.27cm 1.27cm 1.27cm 1.27cm;
            mso-header-margin: 1.27cm;
            mso-footer-margin: 1.27cm;
            mso-paper-source: 0;
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
            gap: 10px;
            margin: 8px 0;
            flex-wrap: nowrap;
          }
          
          .checkbox-item {
            display: flex;
            align-items: center;
            gap: 3px;
            font-size: 11pt;
            white-space: nowrap;
          }
          
          .checkbox-group-inline {
            display: inline;
            font-size: 11pt;
            margin-left: 10px;
          }
          
          .checkbox-group-inline .checkbox-unicode {
            margin-right: 3px;
            margin-left: 10px;
          }
          
          .checkbox-group-inline .checkbox-unicode:first-child {
            margin-left: 0;
          }
          
          .checkbox {
            width: 12px;
            height: 12px;
            border: 1px solid #000;
            display: inline-block;
            vertical-align: middle;
          }
          
          .checkbox-unicode {
            font-size: 14pt;
            margin-right: 5px;
            display: inline-block;
            vertical-align: middle;
          }
          
          .materials-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 9pt;
            table-layout: fixed;
          }
          
          .materials-table th,
          .materials-table td {
            border: 1px solid #000;
            padding: 0;
            text-align: center;
            vertical-align: middle;
            height: 0.5cm;
            line-height: 0.5cm;
          }
          
          .materials-table th {
            background-color: #f8f8f8;
            font-weight: bold;
            padding: 0;
            height: 0.5cm;
            line-height: 0.5cm;
          }
          
          .materials-table td {
            padding: 0;
            height: 0.5cm;
            line-height: 0.5cm;
          }
          
          .materials-table tr {
            height: 0.5cm;
            mso-height-source: userset;
            mso-height-rule: exactly;
          }
          
          .materials-table tbody tr {
            height: 0.5cm;
            mso-height-source: userset;
            mso-height-rule: exactly;
          }
          
          .materials-table thead tr {
            height: 0.5cm;
            mso-height-source: userset;
            mso-height-rule: exactly;
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
            height: 18px;
            display: block;
            width: 100%;
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
          
          .recommendation-line {
            border-bottom: 1px solid #000;
            min-height: 20px;
            height: 20px;
            margin: 5px 0;
            padding: 2px 0;
            width: 100%;
            display: block;
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
          
          .checkbox-unicode {
            font-size: 14pt;
            margin-right: 5px;
            display: inline-block;
            vertical-align: middle;
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
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
            <w:ValidateAgainstSchemas/>
            <w:SaveIfXMLInvalid>false</w:SaveIfXMLInvalid>
            <w:IgnoreMixedContent>false</w:IgnoreMixedContent>
            <w:AlwaysShowPlaceholderText>false</w:AlwaysShowPlaceholderText>
            <w:Compatibility>
              <w:BreakWrappedTables/>
              <w:SnapToGridInCell/>
              <w:WrapTextWithPunct/>
              <w:UseAsianBreakRules/>
              <w:DontGrowAutofit/>
            </w:Compatibility>
            <w:BrowserLevel>MicrosoftInternetExplorer4</w:BrowserLevel>
          </w:WordDocument>
        </xml>
        <xml>
          <w:LatentStyles DefLockedState="false" DefUnhideWhenUsed="false"
            DefSemiHidden="false" DefQFormat="false" DefPriority="99"
            LatentStyleCount="376">
          </w:LatentStyles>
        </xml>
        <![endif]-->
        <!--[if gte mso 9]>
        <xml>
          <o:shapedefaults v:ext="edit" spidmax="1026"/>
        </xml>
        <![endif]-->
        <!-- Перша сторінка -->
        <div class="Section1">
        <div class="page">
          <div class="header">
            <!-- Верхня секція шапки - перше зображення -->
            <div style="width: 100%; margin-bottom: 15px;">
              <img src="/images/Зображення1.png" alt="Шапка компанії" class="header-image" style="width: 100%; height: auto; max-width: 100%;" />
            </div>
            
            <!-- Нижня секція шапки - друге зображення -->
            <div style="width: 100%;">
              <img src="/images/Зображення2.png" alt="Юридична адреса" class="header-image" style="width: 100%; height: auto; max-width: 100%;" />
            </div>
          </div>
          
          <div class="title">НАРЯД НА ВИКОНАННЯ РОБІТ</div>
          
          <div class="field">
            <span class="field-label">№ наряду:</span>
            <span class="field-value">${workOrderNumber}</span>
          </div>
          
          <div class="field">
            <span class="field-label">від «${formattedDate.day}» ${formattedDate.month} ${formattedDate.year} р.):</span>
            <span class="field-value"></span>
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
            <span class="checkbox-group-inline">
              <span class="checkbox-unicode">☐</span> гарантійний ремонт
              <span class="checkbox-unicode">☐</span> ремонт
              <span class="checkbox-unicode">☐</span> технічне обслуговування
              <span class="checkbox-unicode">☐</span> інше
              <span class="checkbox-unicode">☐</span> ПНР
            </span>
          </div>
          
          <div class="field">
            <span class="field-label">8. Технічний стан обладнання перед проведенням робіт:</span>
            <span class="checkbox-group-inline">
              <span class="checkbox-unicode">☐</span> працездатне
              <span class="checkbox-unicode">☐</span> непрацездатне
            </span>
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
              <tr style="height: 0.5cm; mso-height-source: userset; mso-height-rule: exactly;">
                <th style="height: 0.5cm; mso-height-rule: exactly;">№</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Найменування</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Один. виміру</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Кількість</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Ціна з ПДВ, грн</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Вартість з ПДВ, грн</th>
              </tr>
            </thead>
            <tbody>
              ${Array.from({length: 8}, (_, i) => `
                <tr style="height: 0.5cm; mso-height-source: userset; mso-height-rule: exactly;">
                  <td style="height: 0.5cm; mso-height-rule: exactly;">${i + 1}</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
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
          <div class="recommendation-line" style="border-bottom: 1px solid #000; min-height: 20px; height: 20px; margin: 5px 0; width: 100%; display: block;">&nbsp;</div>
          <div class="recommendation-line" style="border-bottom: 1px solid #000; min-height: 20px; height: 20px; margin: 5px 0; width: 100%; display: block;">&nbsp;</div>
          <div class="recommendation-line" style="border-bottom: 1px solid #000; min-height: 20px; height: 20px; margin: 5px 0; width: 100%; display: block;">&nbsp;</div>
          <div class="recommendation-line" style="border-bottom: 1px solid #000; min-height: 20px; height: 20px; margin: 5px 0; width: 100%; display: block;">&nbsp;</div>
          
          <div class="field">
            <span class="field-label">Коефіцієнт складності робіт:</span>
          </div>
          
          <div class="checkbox-section">
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота за комфортних умов, доброзичливість замовника - 1.0</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота на відкритому повітрі, при температурі нижче 0 град, (вище 27) сухо - 1.1</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота в дощ, сніг, сильний вітер - 1.2</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота в підвальних приміщеннях, на дахах - 1.3</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота в агресивному середовищі - 1.4</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота в нічний час (з 22:00 до 06:00) - 1.5</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота у вихідні та святкові дні - 1.6</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
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
              <div class="signature-line">&nbsp;</div>
              <div class="signature-line">&nbsp;</div>
            </div>
            
            <div class="signature-block">
              <div><strong>РОБОТУ ЗДАВ</strong></div>
              <div class="signature-line">${engineers || '&nbsp;'}</div>
              <div class="signature-line">&nbsp;</div>
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
            link.download = 'Наряд_ДТС_' + new Date().toISOString().slice(0,10) + '.html';
            
            // Додаємо посилання до DOM, клікаємо і видаляємо
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Очищуємо URL
            URL.revokeObjectURL(url);
          }
        </script>
        </div>
      </body>
      </html>
    `;
  };

  // Функція для генерації шаблону Дарекс Енерго (2-сторінковий)
  const generateDarexEnergyTemplate = (workOrderData, workOrderNumber, workOrderDate, formattedDate, engineers) => {
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
            margin: 1.27cm 1.27cm 1.27cm 1.27cm;
            mso-page-orientation: portrait;
          }
          
          body {
            font-family: 'Times New Roman', serif;
            font-size: 11pt;
            line-height: 1.2;
            margin: 0;
            padding: 0;
            color: #000;
            mso-margin-top-alt: 720;
            mso-margin-bottom-alt: 720;
            mso-margin-left-alt: 720;
            mso-margin-right-alt: 720;
          }
          
          .page {
            width: 21cm;
            min-height: 29.7cm;
            margin: 0 auto;
            padding: 1.27cm;
            box-sizing: border-box;
            position: relative;
          }
          
          div.Section1 {
            mso-margin-top-alt: 720;
            mso-margin-bottom-alt: 720;
            mso-margin-left-alt: 720;
            mso-margin-right-alt: 720;
            page: Section1;
          }
          
          @page Section1 {
            size: 21.0cm 29.7cm;
            margin: 1.27cm 1.27cm 1.27cm 1.27cm;
            mso-header-margin: 1.27cm;
            mso-footer-margin: 1.27cm;
            mso-paper-source: 0;
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
            gap: 10px;
            margin: 8px 0;
            flex-wrap: nowrap;
          }
          
          .checkbox-item {
            display: flex;
            align-items: center;
            gap: 3px;
            font-size: 11pt;
            white-space: nowrap;
          }
          
          .checkbox-group-inline {
            display: inline;
            font-size: 11pt;
            margin-left: 10px;
          }
          
          .checkbox-group-inline .checkbox-unicode {
            margin-right: 3px;
            margin-left: 10px;
          }
          
          .checkbox-group-inline .checkbox-unicode:first-child {
            margin-left: 0;
          }
          
          .checkbox {
            width: 12px;
            height: 12px;
            border: 1px solid #000;
            display: inline-block;
            vertical-align: middle;
          }
          
          .checkbox-unicode {
            font-size: 14pt;
            margin-right: 5px;
            display: inline-block;
            vertical-align: middle;
          }
          
          .materials-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 9pt;
            table-layout: fixed;
          }
          
          .materials-table th,
          .materials-table td {
            border: 1px solid #000;
            padding: 0;
            text-align: center;
            vertical-align: middle;
            height: 0.5cm;
            line-height: 0.5cm;
          }
          
          .materials-table th {
            background-color: #f8f8f8;
            font-weight: bold;
            padding: 0;
            height: 0.5cm;
            line-height: 0.5cm;
          }
          
          .materials-table td {
            padding: 0;
            height: 0.5cm;
            line-height: 0.5cm;
          }
          
          .materials-table tr {
            height: 0.5cm;
            mso-height-source: userset;
            mso-height-rule: exactly;
          }
          
          .materials-table tbody tr {
            height: 0.5cm;
            mso-height-source: userset;
            mso-height-rule: exactly;
          }
          
          .materials-table thead tr {
            height: 0.5cm;
            mso-height-source: userset;
            mso-height-rule: exactly;
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
            height: 18px;
            display: block;
            width: 100%;
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
          
          .recommendation-line {
            border-bottom: 1px solid #000;
            min-height: 20px;
            height: 20px;
            margin: 5px 0;
            padding: 2px 0;
            width: 100%;
            display: block;
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
          
          .checkbox-unicode {
            font-size: 14pt;
            margin-right: 5px;
            display: inline-block;
            vertical-align: middle;
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
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
            <w:ValidateAgainstSchemas/>
            <w:SaveIfXMLInvalid>false</w:SaveIfXMLInvalid>
            <w:IgnoreMixedContent>false</w:IgnoreMixedContent>
            <w:AlwaysShowPlaceholderText>false</w:AlwaysShowPlaceholderText>
            <w:Compatibility>
              <w:BreakWrappedTables/>
              <w:SnapToGridInCell/>
              <w:WrapTextWithPunct/>
              <w:UseAsianBreakRules/>
              <w:DontGrowAutofit/>
            </w:Compatibility>
            <w:BrowserLevel>MicrosoftInternetExplorer4</w:BrowserLevel>
          </w:WordDocument>
        </xml>
        <xml>
          <w:LatentStyles DefLockedState="false" DefUnhideWhenUsed="false"
            DefSemiHidden="false" DefQFormat="false" DefPriority="99"
            LatentStyleCount="376">
          </w:LatentStyles>
        </xml>
        <![endif]-->
        <!--[if gte mso 9]>
        <xml>
          <o:shapedefaults v:ext="edit" spidmax="1026"/>
        </xml>
        <![endif]-->
        <!-- Перша сторінка -->
        <div class="Section1">
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
            <span class="field-label">від «${formattedDate.day}» ${formattedDate.month} ${formattedDate.year} р.):</span>
            <span class="field-value"></span>
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
            <span class="checkbox-group-inline">
              <span class="checkbox-unicode">☐</span> гарантійний ремонт
              <span class="checkbox-unicode">☐</span> ремонт
              <span class="checkbox-unicode">☐</span> технічне обслуговування
              <span class="checkbox-unicode">☐</span> інше
              <span class="checkbox-unicode">☐</span> ПНР
            </span>
          </div>
          
          <div class="field">
            <span class="field-label">8. Технічний стан обладнання перед проведенням робіт:</span>
            <span class="checkbox-group-inline">
              <span class="checkbox-unicode">☐</span> працездатне
              <span class="checkbox-unicode">☐</span> непрацездатне
            </span>
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
              <tr style="height: 0.5cm; mso-height-source: userset; mso-height-rule: exactly;">
                <th style="height: 0.5cm; mso-height-rule: exactly;">№</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Найменування</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Один. виміру</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Кількість</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Ціна з ПДВ, грн</th>
                <th style="height: 0.5cm; mso-height-rule: exactly;">Вартість з ПДВ, грн</th>
              </tr>
            </thead>
            <tbody>
              ${Array.from({length: 8}, (_, i) => `
                <tr style="height: 0.5cm; mso-height-source: userset; mso-height-rule: exactly;">
                  <td style="height: 0.5cm; mso-height-rule: exactly;">${i + 1}</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
                  <td style="height: 0.5cm; mso-height-rule: exactly;">&nbsp;</td>
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
          <div class="recommendation-line" style="border-bottom: 1px solid #000; min-height: 20px; height: 20px; margin: 5px 0; width: 100%; display: block;">&nbsp;</div>
          <div class="recommendation-line" style="border-bottom: 1px solid #000; min-height: 20px; height: 20px; margin: 5px 0; width: 100%; display: block;">&nbsp;</div>
          <div class="recommendation-line" style="border-bottom: 1px solid #000; min-height: 20px; height: 20px; margin: 5px 0; width: 100%; display: block;">&nbsp;</div>
          <div class="recommendation-line" style="border-bottom: 1px solid #000; min-height: 20px; height: 20px; margin: 5px 0; width: 100%; display: block;">&nbsp;</div>
          
          <div class="field">
            <span class="field-label">Коефіцієнт складності робіт:</span>
          </div>
          
          <div class="checkbox-section">
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота за комфортних умов, доброзичливість замовника - 1.0</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота на відкритому повітрі, при температурі нижче 0 град, (вище 27) сухо - 1.1</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота в дощ, сніг, сильний вітер - 1.2</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота в підвальних приміщеннях, на дахах - 1.3</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота в агресивному середовищі - 1.4</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота в нічний час (з 22:00 до 06:00) - 1.5</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
              <span class="checkbox-label">Робота у вихідні та святкові дні - 1.6</span>
            </div>
            <div class="checkbox-row">
              <span class="checkbox-unicode">☐</span>
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
              <div class="signature-line">&nbsp;</div>
              <div class="signature-line">&nbsp;</div>
            </div>
            
            <div class="signature-block">
              <div><strong>РОБОТУ ЗДАВ</strong></div>
              <div class="signature-line">${engineers || '&nbsp;'}</div>
              <div class="signature-line">&nbsp;</div>
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
        </div>
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
              fontSize:'1rem'
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
            
            .action-buttons.vertical-buttons {
              flex-direction: column !important;
              align-items: flex-start !important;
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
                          col.key === 'date' || col.key === 'requestDate' || col.key === 'paymentDate' || 
                          col.key === 'autoCreatedAt' || col.key === 'autoCompletedAt' || 
                          col.key === 'autoWarehouseApprovedAt' || col.key === 'autoAccountantApprovedAt' ||
                          col.key === 'invoiceRequestDate' || col.key === 'invoiceUploadDate' ? (
                            <div style={{display:'flex',flexDirection:'column',minWidth:120, background:'#fff'}}>
                              <input type="date" name={col.key+"From"} value={localFilters[col.key+"From"] || ''} onChange={handleFilterChange} style={{marginBottom:2, background:'#fff'}} />
                              <input type="date" name={col.key+"To"} value={localFilters[col.key+"To"] || ''} onChange={handleFilterChange} style={{background:'#fff'}} />
                            </div>
                          ) : getFilterType(col.key) ? (
                            <select
                              name={col.key}
                              value={localFilters[col.key] || ''}
                              onChange={handleFilterChange}
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
                              ref={(el) => { filterInputRefs.current[col.key] = el; }}
                              name={col.key}
                              placeholder={col.label}
                              value={localFilters[col.key] || ''}
                              onChange={handleFilterChange}
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
                {sortData(filterTasks(tasks, filters), sortConfig.field, sortConfig.direction).map(t => (
                  <tr key={t.id} className={getRowClass(t)} style={getRowColor(t) ? {background:getRowColor(t)} : {}}>
                    <td className={`action-buttons ${role === 'regional' && onFixRejected ? 'vertical-buttons' : ''}`} style={getRowColor(t) ? {color:'#111'} : {}}>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '4px' }}>
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
                      {/* Контейнер для інформації про відмову та кнопок для regional керівника */}
                      {(() => {
                        const isRegionalRole = role === 'regional' || user?.role === 'regionalManager' || user?.role === 'regkerivn' || (role === 'regional' && user?.role === 'admin');
                        const hasRejection = isRejected(t.approvedByWarehouse) || isRejected(t.approvedByAccountant);
                        const hasFixHandler = !!onFixRejected;
                        
                        // Дебаг логування
                        if (isRegionalRole && !hasRejection) {
                          console.log('[DEBUG] TaskTable - Regional role but no rejection:', {
                            taskId: t.id,
                            role,
                            userRole: user?.role,
                            approvedByWarehouse: t.approvedByWarehouse,
                            approvedByAccountant: t.approvedByAccountant,
                            isWarehouseRejected: isRejected(t.approvedByWarehouse),
                            isAccountantRejected: isRejected(t.approvedByAccountant)
                          });
                        }
                        if (isRegionalRole && hasRejection && !hasFixHandler) {
                          console.log('[DEBUG] TaskTable - Regional role with rejection but no handler:', {
                            taskId: t.id,
                            role,
                            userRole: user?.role,
                            onFixRejected: typeof onFixRejected
                          });
                        }
                        if (isRegionalRole && hasRejection && hasFixHandler) {
                          console.log('[DEBUG] TaskTable - Should show fix button:', {
                            taskId: t.id,
                            role,
                            userRole: user?.role,
                            hasRejection,
                            hasFixHandler
                          });
                        }
                        
                        return isRegionalRole && hasRejection;
                      })() && (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'row',
                          gap: '8px',
                          marginTop: '8px',
                          marginBottom: '8px',
                          alignItems: 'flex-start'
                        }}>
                          {/* Кнопка "Заявка виправлена" */}
                          {onFixRejected && (
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                              <button 
                                onClick={() => onFixRejected(t.id)}
                                style={{
                                  background: '#28a745',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '6px 12px',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  fontWeight: '600',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                ✅ Заявка виправлена
                              </button>
                            </div>
                          )}
                          {/* Інформація про відмову */}
                          <div style={{
                            flex: '1',
                            padding: '8px',
                            backgroundColor: '#fff3cd',
                            borderRadius: '4px',
                            border: '1px solid #ffc107',
                            fontSize: '11px',
                            minWidth: '200px'
                          }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#856404' }}>
                              ⚠️ Заявка відхилена:
                            </div>
                            {isRejected(t.approvedByWarehouse) && (
                              <div style={{ color: '#856404', marginBottom: '2px' }}>
                                Зав. склад: {t.warehouseRejectionDate ? formatDateTime(t.warehouseRejectionDate) : (t.warehouseApprovalDate ? t.warehouseApprovalDate : 'Дата не вказана')} {t.warehouseRejectionUser ? `(${t.warehouseRejectionUser})` : ''}
                                {t.warehouseComment && (
                                  <div style={{ fontSize: '10px', marginTop: '2px', fontStyle: 'italic' }}>
                                    Коментар: {t.warehouseComment}
                                  </div>
                                )}
                              </div>
                            )}
                            {isRejected(t.approvedByAccountant) && (
                              <div style={{ color: '#856404' }}>
                                Бухгалтер: {t.accountantRejectionDate ? formatDateTime(t.accountantRejectionDate) : 'Дата не вказана'} {t.accountantRejectionUser ? `(${t.accountantRejectionUser})` : ''}
                                {t.accountantComment && (
                                  <div style={{ fontSize: '10px', marginTop: '2px', fontStyle: 'italic' }}>
                                    Коментар: {t.accountantComment}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Другий ряд кнопок */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button 
                              onClick={() => {
                                if (hasFullAccess) {
                                  onEdit && onEdit(t);
                                } else {
                                  onEdit && onEdit({...t, _readOnly: true});
                                }
                              }}
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
                                console.log('DEBUG TaskTable: Відкриваємо модальне вікно завантаження для завдання:', {
                                  taskId: t.id,
                                  _id: t._id,
                                  invoiceRequestId: t.invoiceRequestId,
                                  requestNumber: t.requestNumber,
                                  needInvoice: t.needInvoice,
                                  needAct: t.needAct,
                                  invoiceFile: t.invoiceFile,
                                  actFile: t.actFile
                                });
                                
                                // Force modal to re-render with fresh data
                                setModalKey(prev => prev + 1);
                                
                                // Отримуємо найсвіжіші дані завдання з allTasks
                                const latestTask = allTasks.find(task => task.id === t.id || task._id === t._id);
                                const taskToPass = latestTask || t;
                                
                                console.log('DEBUG TaskTable: Використовуємо найсвіжіші дані завдання:', {
                                  originalTask: t,
                                  latestTask: latestTask,
                                  taskToPass: taskToPass,
                                  hasLatestData: latestTask ? 'YES' : 'NO',
                                  modalKey: modalKey + 1
                                });
                                
                                setDocumentUploadModal({ 
                                  open: true, 
                                  task: taskToPass,
                                  key: modalKey + 1 // Add key to force re-render
                                });
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
                                // Перевіряємо наявність файлів в правильних полях
                                const hasInvoiceFile = t.invoiceFile && t.invoiceFileName;
                                const hasActFile = t.actFile && t.actFileName;
                                const hasFiles = hasInvoiceFile || hasActFile;
                                
                                let filesInfo = '';
                                if (hasFiles) {
                                  filesInfo = '\n\nПрикріплені файли:';
                                  if (hasInvoiceFile) {
                                    filesInfo += `\n- Рахунок: ${t.invoiceFileName}`;
                                  }
                                  if (hasActFile) {
                                    filesInfo += `\n- Акт: ${t.actFileName}`;
                                  }
                                } else {
                                  filesInfo = '\n\nФайли не прикріплені.';
                                }
                                
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
                                hasFullAccess ? (
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
                                ) : (
                                  <button onClick={()=>{
                                    // Логуємо перегляд інформації заявки (read-only)
                                    logUserAction(user, EVENT_ACTIONS.VIEW, ENTITY_TYPES.TASK, t.id, 
                                      `Перегляд інформації заявки: ${t.requestNumber || 'Без номера'} - ${t.client || 'Без клієнта'}`, {
                                        requestNumber: t.requestNumber,
                                        client: t.client,
                                        work: t.work,
                                        status: t.status
                                      });
                                    onEdit && onEdit({...t, _readOnly: true});
                                  }} style={{background:'#43a047',color:'#fff'}}>Інформація</button>
                                )
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
                            <>
                              {hasFullAccess ? (
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
                              ) : (
                                <button onClick={()=>{
                                  // Логуємо перегляд інформації заявки (read-only)
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
                            </>
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
                      {((role === 'warehouse' || role === 'regional' || role === 'accountant' || role === 'buhgalteria' || role === 'regionalManager' || role === 'admin' || role === 'administrator' || user?.role === 'admin' || user?.role === 'administrator') && (!isArchive || user?.role === 'admin' || user?.role === 'administrator')) && !(role === 'regional' && t._debtTab) && onApprove && hasFullAccess && (
                        <>
                          {/* Кнопки підтвердження в другому рядку */}
                          <div style={{marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px'}}>
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
                      formatCellValue(t[col.key], col.key)
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
      <NewDocumentUploadModal
        key={documentUploadModal.key || modalKey} // Force re-render with fresh data
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

export default React.memo(TaskTable, (prevProps, nextProps) => {
  // Порівнюємо тільки критичні пропси для запобігання перерендеру
  const criticalPropsEqual = (
    prevProps.tasks === nextProps.tasks &&
    prevProps.filters === nextProps.filters &&
    prevProps.columns === nextProps.columns &&
    prevProps.role === nextProps.role &&
    prevProps.user === nextProps.user &&
    prevProps.onFilterChange === nextProps.onFilterChange
  );
  
  // Якщо критичні пропси не змінилися, не перерендерюємо
  if (criticalPropsEqual) {
    return true; // Не перерендерювати
  }
  
  // Перерендерюємо тільки якщо змінилися критичні пропси
  return false;
}); 