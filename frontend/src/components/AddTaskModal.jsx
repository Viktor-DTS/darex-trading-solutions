import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import API_BASE_URL from '../config';
import { getPdfUniqueKey } from '../utils/pdfUtils';
import { getEdrpouList, getEquipmentTypes, getEquipmentData } from '../utils/edrpouAPI';
import FileUpload from './FileUpload';
import InvoiceRequestBlock from './InvoiceRequestBlock';
import ClientDataSelectionModal from './ClientDataSelectionModal';
import EquipmentDataSelectionModal from './EquipmentDataSelectionModal';
import './AddTaskModal.css';

// Функція для отримання коду регіону
const getRegionCode = (region) => {
  const regionMap = {
    'Київський': 'KV',
    'Дніпровський': 'DP', 
    'Львівський': 'LV',
    'Хмельницький': 'HY'
  };
  const result = regionMap[region] || 'UA';
  return result;
};

// Нормалізація значення для порівняння (дати, числа, порожні)
const normalizeForCompare = (val) => {
  if (val === null || val === undefined) return '';
  if (val === '') return '';
  if (typeof val === 'number' && !Number.isNaN(val)) return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    return trimmed;
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

// Порівняння відправлених даних з тим, що повернув сервер (перевірка при нестабільному інтернеті)
const taskDataMatchesSaved = (sent, saved) => {
  const mismatched = [];
  for (const key of Object.keys(sent)) {
    if (key === '_id' || key === 'id' || key === '__v') continue;
    const a = normalizeForCompare(sent[key]);
    const b = normalizeForCompare(saved[key]);
    if (a !== b) mismatched.push(key);
  }
  return { match: mismatched.length === 0, mismatchedFields: mismatched };
};

// Функція для перевірки унікальності номера заявки
const checkRequestNumberUnique = async (requestNumber) => {
  try {
    if (!requestNumber || !requestNumber.trim()) {
      return true; // Порожній номер вважаємо унікальним (буде згенеровано новий)
    }
    
    const token = localStorage.getItem('token');
    const trimmedNumber = requestNumber.trim();
    
    // Використовуємо глобальний пошук для перевірки унікальності (точний пошук)
    const response = await fetch(`${API_BASE_URL}/tasks/global-search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requestNumber: trimmedNumber })
    });
    
    if (!response.ok) {
      console.warn('[WARNING] Помилка перевірки унікальності номера, вважаємо унікальним');
      return true; // У разі помилки вважаємо унікальним
    }
    
    const tasks = await response.json();
    // Перевіряємо точну відповідність (не regex match)
    const exactMatch = tasks && tasks.some(task => task.requestNumber && task.requestNumber.trim() === trimmedNumber);
    const isUnique = !exactMatch;
    console.log(`[DEBUG] checkRequestNumberUnique: ${trimmedNumber} - ${isUnique ? 'унікальний' : 'дублікат'}`);
    return isUnique;
  } catch (error) {
    console.error('Помилка при перевірці унікальності номера заявки:', error);
    return true; // У разі помилки вважаємо унікальним
  }
};

// Функція для генерації наступного номера заявки
const generateNextRequestNumber = async (region) => {
  try {
    const token = localStorage.getItem('token');
    // Завантажуємо всі заявки для пошуку максимального номера
    const response = await fetch(`${API_BASE_URL}/tasks?limit=10000`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Помилка завантаження заявок');
    }
    
    const allTasks = await response.json();
    const regionCode = getRegionCode(region);
    const pattern = new RegExp(`^${regionCode}-(\\d+)$`);
    
    // Знаходимо всі номери заявок для цього регіону
    const regionNumbers = allTasks
      .map(task => task.requestNumber)
      .filter(number => number && pattern.test(number))
      .map(number => parseInt(number.match(pattern)[1]))
      .sort((a, b) => a - b);
    
    console.log('[DEBUG] generateNextRequestNumber:', {
      region,
      regionCode,
      totalTasks: allTasks.length,
      regionNumbers: regionNumbers,
      maxNumber: regionNumbers.length > 0 ? Math.max(...regionNumbers) : 0
    });
    
    // Знаходимо наступний номер
    let nextNumber = 1;
    if (regionNumbers.length > 0) {
      nextNumber = Math.max(...regionNumbers) + 1;
    }
    const result = `${regionCode}-${String(nextNumber).padStart(7, '0')}`;
    console.log('[DEBUG] generateNextRequestNumber - згенеровано:', result);
    return result;
  } catch (error) {
    console.error('Помилка при генерації номера заявки:', error);
    const regionCode = getRegionCode(region);
    return `${regionCode}-0000001`;
  }
};

// Функція для парсингу чисел
const parseNumber = (val) => {
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return 0;
  const cleaned = val.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

// Форматування числа
const formatNumber = (num) => {
  if (num === 0) return '';
  return num.toFixed(2).replace(/\.?0+$/, '');
};

// Форматування дати для datetime-local input (YYYY-MM-DDTHH:mm)
const formatDateForInput = (dateValue) => {
  if (!dateValue) return '';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    // Формат: YYYY-MM-DDTHH:mm
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
};

// Форматування дати для date input (YYYY-MM-DD)
const formatDateOnly = (dateValue) => {
  if (!dateValue) return '';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch {
    return '';
  }
};

function AddTaskModal({ open, onClose, user, onSave, initialData = {}, panelType = 'service', debtOnly = false, readOnly = false, hideDebtFields = false, allowDebtEditInArchive = false }) {
  const initialFormData = {
    status: 'Заявка',
    requestDate: new Date().toISOString().split('T')[0],
    serviceRegion: user?.region || '',
    company: '',
    edrpou: '',
    client: '',
    requestNumber: '',
    requestAuthor: '', // Автор заявки (ПІБ користувача)
    address: '',
    requestDesc: '',
    plannedDate: '',
    contactPerson: '',
    contactPhone: '',
    invoice: '',
    paymentDate: '',
    paymentType: 'не вибрано',
    invoiceRecipientDetails: '',
    contractFile: '', // Файл договору
    equipment: '',
    equipmentSerial: '',
    engineModel: '',
    engineSerial: '',
    customerEquipmentNumber: '',
    equipmentOperatingHours: '', // Напрацювання мотогодин обладнання
    work: '',
    date: '',
    engineer1: '',
    engineer2: '',
    engineer3: '',
    engineer4: '',
    engineer5: '',
    engineer6: '',
    serviceTotal: '',
    oilType: '',
    oilUsed: '',
    oilPrice: '',
    oilTotal: '',
    filterName: '',
    filterCount: '',
    filterPrice: '',
    filterSum: '',
    fuelFilterName: '',
    fuelFilterCount: '',
    fuelFilterPrice: '',
    fuelFilterSum: '',
    airFilterName: '',
    airFilterCount: '',
    airFilterPrice: '',
    airFilterSum: '',
    antifreezeType: '',
    antifreezeL: '',
    antifreezePrice: '',
    antifreezeSum: '',
    otherMaterials: '',
    otherSum: '',
    workPrice: '',
    perDiem: '',
    living: '',
    otherExp: '',
    bonusApprovalDate: '',
    carNumber: '',
    transportKm: '',
    transportSum: '',
    comments: '',
    urgentRequest: false,
    internalWork: false,
    // Поля підтвердження
    approvedByWarehouse: 'На розгляді',
    warehouseComment: '',
    approvedByAccountant: 'На розгляді',
    accountantComment: '',
    // Автоматичні поля (тільки для читання)
    autoCreatedAt: '',
    autoCompletedAt: '',
    autoWarehouseApprovedAt: '',
    autoAccountantApprovedAt: '',
    invoiceRequestDate: '',
    invoiceUploadDate: '',
    // Заборгованість по документам
    debtStatus: 'Заборгованість', // За замовчуванням є заборгованість
    debtStatusCheckbox: false
  };

  const [formData, setFormData] = useState(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [regions, setRegions] = useState([]);
  const [users, setUsers] = useState([]);
  // Режим оптимізації для панелей бухгалтерів
  const isAccountantMode = panelType === 'accountant';
  // Режим тільки для читання (всі поля заблоковані)
  const isReadOnly = readOnly === true;
  
  const [showSections, setShowSections] = useState({
    basic: isAccountantMode ? true : true,
    client: isAccountantMode ? true : true,
    equipment: isAccountantMode ? true : true,
    work: isAccountantMode ? true : false,
    materials: isAccountantMode ? true : false,
    expenses: isAccountantMode ? true : true, // Розгорнута для всіх панелей
    other: isAccountantMode ? true : false,
    files: isAccountantMode ? true : true
  });
  
  // Стан для файлу договору
  const [contractFileUploading, setContractFileUploading] = useState(false);
  const contractFileInputRef = useRef(null);
  const [showContractSelector, setShowContractSelector] = useState(false);
  const [existingContracts, setExistingContracts] = useState([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  
  // Refs для Google Places Autocomplete
  const addressInputRef = useRef(null);
  const addressTextareaRef = useRef(null);
  const autocompleteRef = useRef(null);
  
  // Зберігаємо останні координати з Google Places для нових заявок
  const [lastPlaceCoordinates, setLastPlaceCoordinates] = useState(null);
  
  // Функція для збереження координат в базу даних
  const saveCoordinatesToDatabase = async (taskId, lat, lng, isApproximate = false) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/coordinates`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lat, lng, isApproximate })
      });
      
      if (!response.ok) {
        console.error('Помилка збереження координат в базу');
        return false;
      }
      return true;
    } catch (err) {
      console.error('Помилка збереження координат:', err);
      return false;
    }
  };
  
  // Кеш для ключів PDF (як у вкладці Договори)
  const [pdfKeysCache, setPdfKeysCache] = useState(new Map());
  const [pdfKeysLoading, setPdfKeysLoading] = useState(new Set());
  const [keysLoadingProgress, setKeysLoadingProgress] = useState({ loaded: 0, total: 0 });
  
  // ========== АВТОЗАПОВНЕННЯ ==========
  // Стан для автозаповнення ЄДРПОУ
  const [edrpouList, setEdrpouList] = useState([]);
  const [showEdrpouDropdown, setShowEdrpouDropdown] = useState(false);
  const [filteredEdrpouList, setFilteredEdrpouList] = useState([]);
  const [clientDataModal, setClientDataModal] = useState({ open: false, edrpou: '' });
  
  // Стан для автозаповнення типу обладнання
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [filteredEquipmentTypes, setFilteredEquipmentTypes] = useState([]);
  const [equipmentDataModal, setEquipmentDataModal] = useState({ open: false, equipment: '' });

  // Стан для модального вікна відхилення бухгалтером
  const [accountantRejectModal, setAccountantRejectModal] = useState({
    open: false,
    comment: '',
    returnTo: 'service' // 'service' або 'warehouse'
  });

  // Стан для модального вікна з не заповненими полями
  const [missingFieldsModal, setMissingFieldsModal] = useState({
    open: false,
    fields: []
  });

  // Заборгованість по оплаті для поточного замовника (для банеру)
  const [clientPaymentDebt, setClientPaymentDebt] = useState(null);

  // Завантаження регіонів та користувачів
  useEffect(() => {
    if (open) {
      const token = localStorage.getItem('token');
      
      // Завантажуємо регіони
      fetch(`${API_BASE_URL}/regions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          console.log('[DEBUG] Завантажено регіони:', data);
          setRegions(data || []);
        })
        .catch(err => {
          console.error('Помилка завантаження регіонів:', err);
          // Fallback регіони
          setRegions([
            { name: 'Київський' },
            { name: 'Дніпровський' },
            { name: 'Львівський' },
            { name: 'Хмельницький' }
          ]);
        });

      // Завантажуємо користувачів для вибору інженерів (включно зі звільненими для редагування заявок)
      fetch(`${API_BASE_URL}/users?includeDismissed=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          console.log('[DEBUG] Завантажено користувачів:', data?.length);
          setUsers(data || []);
        })
        .catch(err => console.error('Помилка завантаження користувачів:', err));
      
      // Завантажуємо список ЄДРПОУ для автозаповнення
      getEdrpouList()
        .then(data => {
          console.log('[DEBUG] Завантажено ЄДРПОУ для автозаповнення:', data?.length);
          setEdrpouList(data || []);
        })
        .catch(err => console.error('Помилка завантаження ЄДРПОУ:', err));
      
      // Завантажуємо типи обладнання для автозаповнення
      getEquipmentTypes()
        .then(data => {
          console.log('[DEBUG] Завантажено типів обладнання для автозаповнення:', data?.length);
          setEquipmentTypes(data || []);
        })
        .catch(err => console.error('Помилка завантаження типів обладнання:', err));
    }
  }, [open]);

  // Перевірка боргу по оплаті для замовника (банер при заповненні Замовник або ЄДРПОУ — і для нової заявки, і при редагуванні)
  useEffect(() => {
    if (!open) {
      setClientPaymentDebt(null);
      return;
    }
    const edrpou = (formData.edrpou || '').toString().trim();
    const client = (formData.client || '').toString().trim();
    if (!edrpou && !client) {
      setClientPaymentDebt(null);
      return;
    }
    const DEBOUNCE_MS = 500;
    const timer = setTimeout(() => {
      const token = localStorage.getItem('token');
      fetch(`${API_BASE_URL}/tasks/filter?status=paymentDebt&region=`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(tasks => {
          const match = (t) => {
            const tEdrpou = (t.edrpou || '').toString().trim();
            const tClient = (t.client || '').toString().trim();
            if (edrpou && tEdrpou && tEdrpou.toLowerCase() === edrpou.toLowerCase()) return true;
            if (client && tClient && tClient.toLowerCase().includes(client.toLowerCase())) return true;
            return false;
          };
          const list = Array.isArray(tasks) ? tasks.filter(match) : [];
          if (list.length === 0) {
            setClientPaymentDebt(null);
            return;
          }
          const sum = list.reduce((acc, t) => acc + parseNumber(t.serviceTotal), 0);
          setClientPaymentDebt({ count: list.length, sum });
        })
        .catch(() => setClientPaymentDebt(null));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, formData.edrpou, formData.client]);

  // Визначаємо чи це нова заявка (немає id)
  const isNewTask = !initialData.id && !initialData._id;

  // Відстежуємо попередній регіон для виявлення змін
  const prevServiceRegionRef = useRef('');
  // Флаг для запобігання повторної генерації
  const isGeneratingRef = useRef(false);

  // Функція для перезавантаження даних завдання з сервера
  const reloadTaskData = useCallback(async () => {
    const taskId = initialData?._id || initialData?.id;
    if (!taskId) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const updatedTask = await response.json();
        
        // Оновлюємо formData з новими даними, зберігаючи поточні зміни користувача
        setFormData(prevFormData => ({
          ...prevFormData,
          // Оновлюємо тільки поля, які могли змінитися на сервері
          invoiceRequestDate: formatDateForInput(updatedTask.invoiceRequestDate),
          invoiceUploadDate: formatDateForInput(updatedTask.invoiceUploadDate),
          invoiceRequestId: updatedTask.invoiceRequestId,
          invoiceFile: updatedTask.invoiceFile || prevFormData.invoiceFile,
          invoiceFileName: updatedTask.invoiceFileName || prevFormData.invoiceFileName,
          invoice: updatedTask.invoice || prevFormData.invoice,
          needInvoice: updatedTask.needInvoice !== undefined ? updatedTask.needInvoice : prevFormData.needInvoice,
          needAct: updatedTask.needAct !== undefined ? updatedTask.needAct : prevFormData.needAct
        }));

        // Викликаємо onSave для оновлення батьківського компонента
        if (onSave) {
          onSave(updatedTask);
        }
      }
    } catch (error) {
      console.error('Помилка перезавантаження даних завдання:', error);
    }
  }, [initialData?._id, initialData?.id, onSave]);

  useEffect(() => {
    if (open) {
      // Скидаємо флаги
      isGeneratingRef.current = false;
      
      // Якщо це редагування - використовуємо дані з initialData
      if (!isNewTask && initialData) {
        // Форматуємо дати для коректного відображення в input полях
        setFormData({
          ...initialFormData,
          ...initialData,
          serviceRegion: initialData.serviceRegion || (user?.region && user.region !== 'Україна' ? user.region : ''),
          requestNumber: initialData.requestNumber || '',
          // Файл договору
          contractFile: initialData.contractFile || '',
          // Форматуємо дати для date inputs
          requestDate: formatDateOnly(initialData.requestDate),
          date: formatDateOnly(initialData.date),
          paymentDate: formatDateOnly(initialData.paymentDate),
          plannedDate: formatDateOnly(initialData.plannedDate),
          // Контактна особа
          contactPerson: initialData.contactPerson || '',
          contactPhone: initialData.contactPhone || '',
          // Поля підтвердження
          approvedByWarehouse: initialData.approvedByWarehouse || 'На розгляді',
          warehouseComment: initialData.warehouseComment || '',
          approvedByAccountant: initialData.approvedByAccountant || 'На розгляді',
          accountantComment: initialData.accountantComment || '',
          // Форматуємо дати для datetime-local inputs
          autoCreatedAt: formatDateForInput(initialData.autoCreatedAt),
          autoCompletedAt: formatDateForInput(initialData.autoCompletedAt),
          autoWarehouseApprovedAt: formatDateForInput(initialData.autoWarehouseApprovedAt),
          autoAccountantApprovedAt: formatDateForInput(initialData.autoAccountantApprovedAt),
          invoiceRequestDate: formatDateForInput(initialData.invoiceRequestDate),
          invoiceUploadDate: formatDateForInput(initialData.invoiceUploadDate)
        });
        prevServiceRegionRef.current = initialData.serviceRegion || '';
      } else {
        // Нова заявка або нова заявка на основі даної (шаблон без id/_id)
        const hasTemplateData = initialData && Object.keys(initialData).filter(k => k !== 'id' && k !== '_id').length > 0;
        if (hasTemplateData) {
          setFormData({
            ...initialFormData,
            ...initialData,
            serviceRegion: initialData.serviceRegion || (user?.region && user.region !== 'Україна' ? user.region : ''),
            requestNumber: '',
            requestAuthor: user?.name || user?.login || '',
            contractFile: initialData.contractFile || '',
            requestDate: formatDateOnly(initialData.requestDate) || initialFormData.requestDate,
            plannedDate: '',
            date: '',
            paymentDate: '',
            paymentType: 'не вибрано',
            invoice: '',
            work: '',
            bonusApprovalDate: '',
            approvedByWarehouse: 'На розгляді',
            warehouseComment: '',
            approvedByAccountant: 'На розгляді',
            accountantComment: '',
            autoCreatedAt: '',
            autoCompletedAt: '',
            autoWarehouseApprovedAt: '',
            autoAccountantApprovedAt: '',
            invoiceRequestDate: '',
            invoiceUploadDate: '',
            needInvoice: initialData.needInvoice ?? initialFormData.needInvoice,
            needAct: initialData.needAct ?? initialFormData.needAct
          });
          // Не оновлюємо prevServiceRegionRef, щоб ефект автогенерації номера побачив зміну регіону і згенерував номер
          prevServiceRegionRef.current = '';
        } else {
          const initRegion = user?.region && user.region !== 'Україна' ? user.region : '';
          setFormData({
            ...initialFormData,
            serviceRegion: initRegion,
            requestNumber: '',
            requestAuthor: user?.name || user?.login || ''
          });
          prevServiceRegionRef.current = '';
        }
      }
      setError(null);
    }
  }, [open, user, isNewTask, initialData]);

  // Ініціалізація Google Places Autocomplete для поля адреси
  useEffect(() => {
    if (!open) return;
    
    let timeoutId;
    
    // Очікуємо, поки Google Maps API завантажиться
    const initAutocomplete = () => {
      if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        // Якщо API ще не завантажено, спробуємо через 100мс
        timeoutId = setTimeout(initAutocomplete, 100);
        return;
      }

      // Ініціалізуємо для input (режим бухгалтера)
      if (addressInputRef.current && isAccountantMode) {
        const autocomplete = new google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            componentRestrictions: { country: 'ua' },
            fields: ['formatted_address', 'address_components', 'geometry'],
            types: ['address']
          }
        );

        autocomplete.addListener('place_changed', async () => {
          const place = autocomplete.getPlace();
          if (place.formatted_address) {
            setFormData(prev => ({ ...prev, address: place.formatted_address }));
            
            // Отримуємо координати з Google Places
            if (place.geometry && place.geometry.location) {
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              const locationType = place.geometry.location_type;
              const isApproximate = locationType !== 'ROOFTOP'; // ROOFTOP = точна, інші = приблизна
              
              // Зберігаємо координати для подальшого використання (для нових заявок)
              setLastPlaceCoordinates({ lat, lng, isApproximate });
              
              // Якщо це редагування існуючої заявки - зберігаємо координати одразу
              const taskId = initialData?._id || initialData?.id;
              if (taskId) {
                try {
                  await saveCoordinatesToDatabase(taskId, lat, lng, isApproximate);
                  console.log('Координати збережено для заявки:', taskId);
                } catch (err) {
                  console.error('Помилка збереження координат:', err);
                }
              }
            }
          }
        });

        autocompleteRef.current = autocomplete;
      }

      // Ініціалізуємо для input (звичайний режим)
      if (addressTextareaRef.current && !isAccountantMode) {
        const autocomplete = new google.maps.places.Autocomplete(
          addressTextareaRef.current,
          {
            componentRestrictions: { country: 'ua' },
            fields: ['formatted_address', 'address_components', 'geometry'],
            types: ['address']
          }
        );

        autocomplete.addListener('place_changed', async () => {
          const place = autocomplete.getPlace();
          if (place.formatted_address) {
            setFormData(prev => ({ ...prev, address: place.formatted_address }));
            
            // Отримуємо координати з Google Places
            if (place.geometry && place.geometry.location) {
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              const locationType = place.geometry.location_type;
              const isApproximate = locationType !== 'ROOFTOP'; // ROOFTOP = точна, інші = приблизна
              
              // Зберігаємо координати для подальшого використання (для нових заявок)
              setLastPlaceCoordinates({ lat, lng, isApproximate });
              
              // Якщо це редагування існуючої заявки - зберігаємо координати одразу
              const taskId = initialData?._id || initialData?.id;
              if (taskId) {
                try {
                  await saveCoordinatesToDatabase(taskId, lat, lng, isApproximate);
                  console.log('Координати збережено для заявки:', taskId);
                } catch (err) {
                  console.error('Помилка збереження координат:', err);
                }
              }
            }
          }
        });

        if (!autocompleteRef.current) {
          autocompleteRef.current = autocomplete;
        }
      }
    };

    initAutocomplete();

    // Очищення при закритті
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (autocompleteRef.current && typeof google !== 'undefined' && google.maps) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [open, isAccountantMode]);

  // Автогенерація номера заявки тільки якщо номера ще немає: у будь-якому випадку спочатку перевіряємо — якщо є номер, новий не генеруємо
  useEffect(() => {
    const autoFillRequestNumber = async () => {
      if (isGeneratingRef.current) return;
      if (!open) return;

      const hasNumber = (initialData?.requestNumber && String(initialData.requestNumber).trim()) ||
        (formData.requestNumber && String(formData.requestNumber).trim());
      if (hasNumber) return;

      const currentRegion = formData.serviceRegion;
      const regionSelected = currentRegion && currentRegion.trim() !== '' && currentRegion !== 'Україна';
      if (!regionSelected) return;

      try {
        isGeneratingRef.current = true;
        console.log('[DEBUG] AddTaskModal - генеруємо номер заявки для регіону:', currentRegion);
        const nextNumber = await generateNextRequestNumber(currentRegion);
        console.log('[DEBUG] AddTaskModal - згенеровано номер заявки:', nextNumber);
        setFormData(prev => ({ ...prev, requestNumber: nextNumber }));
        prevServiceRegionRef.current = currentRegion;
      } catch (error) {
        console.error('Помилка при автозаповненні номера заявки:', error);
      } finally {
        isGeneratingRef.current = false;
      }
    };

    autoFillRequestNumber();
  }, [open, initialData?._id, initialData?.id, initialData?.requestNumber, formData.serviceRegion, formData.requestNumber]);

  // Список сервісних інженерів для вибраного регіону
  const serviceEngineers = useMemo(() => {
    // Збираємо імена інженерів, вже призначених на цю заявку (для режиму редагування)
    const assignedEngineers = [
      formData.engineer1,
      formData.engineer2,
      formData.engineer3,
      formData.engineer4,
      formData.engineer5,
      formData.engineer6
    ].filter(Boolean);

    return users
      .filter(u => {
        if (u.role !== 'service') return false;
        
        // Якщо інженер вже призначений на заявку — показуємо його (навіть якщо звільнений)
        const isAssigned = assignedEngineers.includes(u.name);
        if (isAssigned) return true;
        
        // Для нових призначень — прибираємо звільнених
        if (u.dismissed === true || u.dismissed === 'true') return false;
        
        // Якщо регіон не вибрано або "Україна" - показуємо всіх інженерів
        if (!formData.serviceRegion || formData.serviceRegion === 'Україна') return true;
        
        // Перевіряємо збіг регіону
        // Якщо у інженера мультирегіон (містить кому) - перевіряємо чи входить вибраний регіон
        if (u.region && u.region.includes(',')) {
          const engineerRegions = u.region.split(',').map(r => r.trim());
          return engineerRegions.includes(formData.serviceRegion);
        }
        
        // Звичайна перевірка регіону
        return u.region === formData.serviceRegion;
      })
      .map(u => ({
        ...u,
        // Додаємо позначку для звільнених
        displayName: (u.dismissed === true || u.dismissed === 'true') ? `${u.name} (звільнений)` : u.name
      }));
  }, [users, formData.serviceRegion, formData.engineer1, formData.engineer2, formData.engineer3, formData.engineer4, formData.engineer5, formData.engineer6]);

  // Авторозрахунок сум
  const calculations = useMemo(() => {
    const oilTotal = parseNumber(formData.oilUsed) * parseNumber(formData.oilPrice);
    const filterSum = parseNumber(formData.filterCount) * parseNumber(formData.filterPrice);
    const fuelFilterSum = parseNumber(formData.fuelFilterCount) * parseNumber(formData.fuelFilterPrice);
    const airFilterSum = parseNumber(formData.airFilterCount) * parseNumber(formData.airFilterPrice);
    const antifreezeSum = parseNumber(formData.antifreezeL) * parseNumber(formData.antifreezePrice);
    
    const serviceTotal = parseNumber(formData.serviceTotal);
    
    // Вартість робіт
    let workPrice;
    if (formData.internalWork) {
      workPrice = serviceTotal;
    } else {
      workPrice = serviceTotal - (
        oilTotal +
        filterSum +
        fuelFilterSum +
        airFilterSum +
        antifreezeSum +
        parseNumber(formData.otherSum) +
        parseNumber(formData.perDiem) +
        parseNumber(formData.living) +
        parseNumber(formData.otherExp) +
        parseNumber(formData.transportSum)
      );
    }
    
    // Автоматичне обчислення дати затвердження премії
    let autoBonusApprovalDate = '';
    if (
      !formData.bonusApprovalDate &&
      formData.status === 'Виконано' &&
      formData.approvedByWarehouse === 'Підтверджено' &&
      formData.approvedByAccountant === 'Підтверджено'
    ) {
      const d = new Date();
      const currentDay = d.getDate();
      const currentMonth = d.getMonth() + 1;
      const currentYear = d.getFullYear();
      
      // Перевіряємо дату виконання робіт
      const workDate = new Date(formData.date);
      const workMonth = workDate.getMonth() + 1;
      const workYear = workDate.getFullYear();
      
      // Логіка: якщо день >= 16 і місяць затвердження != місяць виконання
      if (currentDay >= 16 && (workMonth !== currentMonth || workYear !== currentYear)) {
        // Встановлюємо поточний місяць + 1
        if (currentMonth === 12) {
          autoBonusApprovalDate = `01-${currentYear + 1}`;
        } else {
          autoBonusApprovalDate = `${String(currentMonth + 1).padStart(2, '0')}-${currentYear}`;
        }
      } else {
        // Поточний місяць
        autoBonusApprovalDate = `${String(currentMonth).padStart(2, '0')}-${currentYear}`;
      }
    }

    return {
      oilTotal,
      filterSum,
      fuelFilterSum,
      airFilterSum,
      antifreezeSum,
      workPrice: workPrice > 0 ? workPrice : 0,
      autoBonusApprovalDate
    };
  }, [formData]);

  const handleChange = (e) => {
    if (isReadOnly) return;
    const { name, value, type, checked } = e.target;
    
    // Спеціальна обробка для ЄДРПОУ (автозаповнення)
    if (name === 'edrpou') {
      setFormData(prev => ({ ...prev, [name]: value }));
      // Фільтруємо ЄДРПОУ для автодоповнення
      if (value.trim()) {
        const filtered = edrpouList.filter(edrpou => 
          edrpou.toLowerCase().includes(value.toLowerCase())
        );
        setFilteredEdrpouList(filtered);
        setShowEdrpouDropdown(filtered.length > 0);
      } else {
        setShowEdrpouDropdown(false);
        setFilteredEdrpouList([]);
      }
      return;
    }
    
    // Спеціальна обробка для типу обладнання (автозаповнення)
    if (name === 'equipment') {
      setFormData(prev => ({ ...prev, [name]: value }));
      // Фільтруємо типи обладнання для автодоповнення
      if (value.trim()) {
        const filtered = equipmentTypes.filter(type => 
          type.toLowerCase().includes(value.toLowerCase())
        );
        setFilteredEquipmentTypes(filtered);
        setShowEquipmentDropdown(filtered.length > 0);
      } else {
        setShowEquipmentDropdown(false);
        setFilteredEquipmentTypes([]);
      }
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Обробник вибору ЄДРПОУ з автодоповнення
  const handleEdrpouSelect = (edrpou) => {
    if (isReadOnly) return;
    console.log('[DEBUG] handleEdrpouSelect - вибрано ЄДРПОУ:', edrpou);
    setFormData(prev => ({ ...prev, edrpou: edrpou }));
    setShowEdrpouDropdown(false);
    setFilteredEdrpouList([]);
    
    // Відкриваємо модальне вікно для вибору даних клієнта
    setClientDataModal({ open: true, edrpou: edrpou });
  };

  // Обробник вибору типу обладнання з автодоповнення
  const handleEquipmentSelect = (equipment) => {
    console.log('[DEBUG] handleEquipmentSelect - вибрано обладнання:', equipment);
    setFormData(prev => ({ ...prev, equipment: equipment }));
    setShowEquipmentDropdown(false);
    setFilteredEquipmentTypes([]);
    
    // Завжди відкриваємо модальне вікно для вибору даних обладнання
    setEquipmentDataModal({ open: true, equipment: equipment });
  };

  // Обробник застосування даних клієнта з модального вікна
  const handleClientDataApply = (updates) => {
    console.log('[DEBUG] handleClientDataApply - оновлення форми:', updates);
    setFormData(prev => ({ ...prev, ...updates }));
  };

  // Обробник застосування даних обладнання з модального вікна
  const handleEquipmentDataApply = (updates) => {
    if (isReadOnly) return;
    console.log('[DEBUG] handleEquipmentDataApply - оновлення форми:', updates);
    setFormData(prev => ({ ...prev, ...updates }));
  };

  // Обробник завантаження файлу договору
  const handleContractFileChange = async (e) => {
    if (isReadOnly) return;
    const file = e.target.files[0];
    if (!file) return;

    // Перевірка типу файлу
    if (file.type !== 'application/pdf') {
      alert('Дозволено лише PDF файли');
      return;
    }

    // Перевірка розміру (максимум 20MB)
    if (file.size > 20 * 1024 * 1024) {
      alert('Файл занадто великий. Максимальний розмір: 20MB');
      return;
    }

    setContractFileUploading(true);
    
    try {
      console.log('[DEBUG] Завантаження файлу договору:', file.name);
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('type', 'contract');

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/files/upload-contract`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: uploadFormData
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[DEBUG] Файл договору завантажено:', result);
        setFormData(prev => ({
          ...prev,
          contractFile: result.url || result.fileUrl || result.path
        }));
      } else {
        const errorText = await response.text();
        console.error('[ERROR] Помилка завантаження файлу:', errorText);
        alert('Помилка завантаження файлу договору');
      }
    } catch (error) {
      console.error('[ERROR] Помилка завантаження файлу договору:', error);
      alert('Помилка завантаження файлу договору: ' + error.message);
    } finally {
      setContractFileUploading(false);
    }
  };

  // Видалення файлу договору
  const handleRemoveContractFile = () => {
    if (isReadOnly) return;
    setFormData(prev => ({
      ...prev,
      contractFile: ''
    }));
    if (contractFileInputRef.current) {
      contractFileInputRef.current.value = '';
    }
  };

  // Завантажити ключ PDF для договору
  const loadPdfKey = useCallback(async (url) => {
    if (!url || pdfKeysCache.has(url) || pdfKeysLoading.has(url)) {
      return pdfKeysCache.get(url) || url;
    }

    setPdfKeysLoading(prev => new Set(prev).add(url));

    try {
      const key = await getPdfUniqueKey(url);
      setPdfKeysCache(prev => {
        const newMap = new Map(prev);
        newMap.set(url, key);
        return newMap;
      });
      return key;
    } catch (error) {
      console.error('[PDF] Помилка завантаження ключа:', error);
      setPdfKeysCache(prev => {
        const newMap = new Map(prev);
        newMap.set(url, url);
        return newMap;
      });
      return url;
    } finally {
      setPdfKeysLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(url);
        return newSet;
      });
    }
  }, [pdfKeysCache, pdfKeysLoading]);

  // Завантаження списку існуючих договорів з групуванням по вмісту PDF
  const loadExistingContracts = async (showAll = false) => {
    setContractsLoading(true);
    try {
      const token = localStorage.getItem('token');
      console.log('[DEBUG] Завантаження списку договорів...');
      const response = await fetch(`${API_BASE_URL}/contract-files`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[DEBUG] Отримано договорів:', data.length);
        
        // Фільтруємо по ЄДРПОУ якщо він вказаний (і не показуємо всі)
        let filteredData = data;
        if (!showAll && formData.edrpou && formData.edrpou.trim()) {
          filteredData = data.filter(contract => contract.edrpou === formData.edrpou.trim());
          console.log('[DEBUG] Після фільтрації по ЄДРПОУ:', filteredData.length);
        }
        
        // Завантажуємо ключі PDF для всіх договорів
        const uniqueUrls = [...new Set(filteredData.map(c => c.url).filter(Boolean))];
        setKeysLoadingProgress({ loaded: 0, total: uniqueUrls.length });
        
        console.log('[DEBUG] Завантаження ключів PDF для', uniqueUrls.length, 'файлів...');
        
        let loadedCount = 0;
        const keysMap = new Map(pdfKeysCache);
        
        // Завантажуємо ключі паралельно (по 5 одночасно)
        for (let i = 0; i < uniqueUrls.length; i += 5) {
          const batch = uniqueUrls.slice(i, i + 5);
          await Promise.all(batch.map(async (url) => {
            if (!keysMap.has(url)) {
              try {
                const key = await getPdfUniqueKey(url);
                keysMap.set(url, key);
              } catch (e) {
                keysMap.set(url, url);
              }
            }
            loadedCount++;
            setKeysLoadingProgress({ loaded: loadedCount, total: uniqueUrls.length });
          }));
        }
        
        setPdfKeysCache(keysMap);
        
        // Групуємо договори по унікальному ключу PDF (як у вкладці Договори)
        const contractsMap = new Map();
        
        for (const contract of filteredData) {
          if (!contract.url) continue;
          
          const pdfKey = keysMap.get(contract.url) || contract.url;
          
          if (!contractsMap.has(pdfKey)) {
            contractsMap.set(pdfKey, {
              ...contract,
              pdfKey,
              urls: [contract.url],
              filesCount: 1
            });
          } else {
            const existing = contractsMap.get(pdfKey);
            if (!existing.urls.includes(contract.url)) {
              existing.urls.push(contract.url);
              existing.filesCount++;
            }
          }
        }
        
        const uniqueContracts = Array.from(contractsMap.values());
        console.log('[DEBUG] Унікальних договорів (по вмісту PDF):', uniqueContracts.length);
        
        setExistingContracts(uniqueContracts);
      } else {
        console.error('[ERROR] Помилка завантаження списку договорів:', response.status);
        setExistingContracts([]);
      }
    } catch (error) {
      console.error('[ERROR] Помилка завантаження списку договорів:', error);
      setExistingContracts([]);
    } finally {
      setContractsLoading(false);
      setKeysLoadingProgress({ loaded: 0, total: 0 });
    }
  };

  // Вибір існуючого договору
  const handleSelectExistingContract = (contract) => {
    if (isReadOnly) return;
    setFormData(prev => ({
      ...prev,
      contractFile: contract.url
    }));
    setShowContractSelector(false);
  };

  // Відкриття вибору існуючих договорів
  const openContractSelector = () => {
    if (isReadOnly) return;
    loadExistingContracts();
    setShowContractSelector(true);
  };

  const toggleSection = (section) => {
    // В режимі бухгалтера не дозволяємо згортати секції
    if (isAccountantMode) {
      return;
    }
    setShowSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Дозволяємо збереження в режимі read-only тільки якщо дозволено редагування заборгованості в архіві
    if (isReadOnly && !allowDebtEditInArchive) return;
    setLoading(true);
    setError(null);

    // В режимі редагування заборгованості в архіві пропускаємо валідацію обов'язкових полів
    // оскільки ми зберігаємо тільки поле debtStatus
    if (!allowDebtEditInArchive) {
      // Валідація обов'язкових полів
      const missingFields = [];
      
      if (!formData.company) {
        missingFields.push('Компанія виконавець');
      }
      if (!formData.status) {
        missingFields.push('Статус заявки');
      }
      if (!formData.serviceRegion) {
        missingFields.push('Регіон сервісного відділу');
      }
      if (!formData.client) {
        missingFields.push('Замовник');
      }
      if (!formData.requestDesc) {
        missingFields.push('Опис заявки');
      }
      if (!formData.contactPhone) {
        missingFields.push('Тел. контактної особи');
      }
      
      // Якщо статус "Виконано", додаткові обов'язкові поля
      if (formData.status === 'Виконано') {
        if (!formData.date) {
          missingFields.push('Дата проведення робіт');
        }
        if (!formData.paymentType || formData.paymentType === 'не вибрано') {
          missingFields.push('Вид оплати');
        }
        // Для сервісної служби - обов'язкове поле "Сервісний інженер №1"
        if (panelType === 'service' && !formData.engineer1) {
          missingFields.push('Сервісний інженер №1');
        }
      }
      
      // Для панелі оператора - обов'язкові поля
      if (panelType === 'operator') {
        if (!formData.plannedDate) {
          missingFields.push('Запланована дата робіт');
        }
        if (!formData.work) {
          missingFields.push('Найменування робіт');
        }
        if (!formData.equipment) {
          missingFields.push('Тип обладнання');
        }
        if (!formData.equipmentSerial) {
          missingFields.push('Заводський номер обладнання');
        }
      }
      
      if (missingFields.length > 0) {
        setMissingFieldsModal({
          open: true,
          fields: missingFields
        });
        setLoading(false);
        return;
      }
    }

    // Перевірка: якщо бухгалтер встановив "Відмова" - показуємо модальне вікно
    const taskId = initialData?._id || initialData?.id;
    const wasNotRejected = initialData?.approvedByAccountant !== 'Відмова';
    const isNowRejected = formData.approvedByAccountant === 'Відмова';
    
    if (taskId && wasNotRejected && isNowRejected && !accountantRejectModal.confirmed) {
      setAccountantRejectModal({
        open: true,
        comment: formData.accountantComment || '',
        returnTo: 'service'
      });
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      // Автоматичне встановлення bonusApprovalDate якщо не задано
      let bonusApprovalDate = formData.bonusApprovalDate;
      if (
        !bonusApprovalDate &&
        formData.status === 'Виконано' &&
        formData.approvedByWarehouse === 'Підтверджено' &&
        formData.approvedByAccountant === 'Підтверджено'
      ) {
        bonusApprovalDate = calculations.autoBonusApprovalDate;
      }

      // Формуємо дані для збереження з авторозрахунками
      const taskData = {
        ...formData,
        oilTotal: calculations.oilTotal,
        filterSum: calculations.filterSum,
        fuelFilterSum: calculations.fuelFilterSum,
        airFilterSum: calculations.airFilterSum,
        antifreezeSum: calculations.antifreezeSum,
        workPrice: calculations.workPrice,
        bonusApprovalDate: bonusApprovalDate
      };

      // Визначаємо URL і метод в залежності від режиму (створення або редагування)
      const taskId = initialData?._id || initialData?.id;

      // Логіка для завскладу
      if (taskId) {
        const wasWarehouseNotApproved = initialData?.approvedByWarehouse !== 'Підтверджено';
        const isWarehouseNowApproved = formData.approvedByWarehouse === 'Підтверджено';
        const wasAccountantRejected = initialData?.approvedByAccountant === 'Відмова';
        
        // Якщо завсклад підтверджує, а бухгалтер раніше відхилив - скидаємо на "На розгляді"
        if (wasWarehouseNotApproved && isWarehouseNowApproved && wasAccountantRejected) {
          taskData.approvedByAccountant = 'На розгляді';
          console.log('[DEBUG] Завсклад підтвердив - скидаємо відмову бухгалтера на "На розгляді"');
        }
        
        // Якщо завсклад відхиляє - змінюємо статус на "В роботі"
        const wasWarehouseNotRejected = initialData?.approvedByWarehouse !== 'Відмова';
        const isWarehouseNowRejected = formData.approvedByWarehouse === 'Відмова';
        
        if (wasWarehouseNotRejected && isWarehouseNowRejected) {
          taskData.status = 'В роботі';
          console.log('[DEBUG] Завсклад відхилив - змінюємо статус на "В роботі"');
        }
      }
      
      // Логіка для сервісної служби: при зміні статусу на "Виконано" скидаємо "Відмова" на "На розгляді"
      if (taskId) {
        const wasInWork = initialData?.status === 'В роботі';
        const isNowCompleted = formData.status === 'Виконано';
        
        if (wasInWork && isNowCompleted) {
          // Скидаємо відмову завсклада на "На розгляді" (тільки якщо була "Відмова")
          if (initialData?.approvedByWarehouse === 'Відмова') {
            taskData.approvedByWarehouse = 'На розгляді';
            console.log('[DEBUG] Сервісна служба виконала - скидаємо відмову завсклада на "На розгляді"');
          }
          
          // Скидаємо відмову бухгалтера на "На розгляді" (тільки якщо була "Відмова")
          if (initialData?.approvedByAccountant === 'Відмова') {
            taskData.approvedByAccountant = 'На розгляді';
            console.log('[DEBUG] Сервісна служба виконала - скидаємо відмову бухгалтера на "На розгляді"');
          }
        }
      }
      const url = taskId 
        ? `${API_BASE_URL}/tasks/${taskId}` 
        : `${API_BASE_URL}/tasks`;
      const method = taskId ? 'PUT' : 'POST';

      // Для нових заявок додаємо час автостворення
      if (!taskId) {
        taskData.autoCreatedAt = new Date().toISOString();
      }

      // При редагуванні завжди використовуємо оригінальний номер заявки (або з форми, якщо адмін змінив)
      if (taskId) {
        const editNumber = (taskData.requestNumber && String(taskData.requestNumber).trim()) || initialData?.requestNumber || '';
        if (editNumber) {
          taskData.requestNumber = editNumber;
          console.log(`[DEBUG] Редагування заявки - номер: ${taskData.requestNumber}`);
        }
      }

      // Для нової заявки: якщо номер порожній, але є регіон — генеруємо перед збереженням
      if (!taskId && (!taskData.requestNumber || !String(taskData.requestNumber).trim()) && taskData.serviceRegion && taskData.serviceRegion !== 'Україна') {
        try {
          const generated = await generateNextRequestNumber(taskData.serviceRegion);
          taskData.requestNumber = generated;
          setFormData(prev => ({ ...prev, requestNumber: generated }));
          console.log(`[DEBUG] Згенеровано номер заявки перед збереженням: ${generated}`);
        } catch (err) {
          console.error('Помилка генерації номера перед збереженням:', err);
        }
      }

      // Для нових заявок: перевірка унікальності номера заявки з повторною генерацією при дублікаті
      let savedTask = null;
      let currentTaskData = { ...taskData };
      const maxRetries = 5; // Максимальна кількість спроб
      let retryCount = 0;
      let isSaved = false;

      while (!isSaved && retryCount < maxRetries) {
        // Для нових заявок перевіряємо унікальність номера (при редагуванні номер не змінюється)
        if (!taskId && currentTaskData.requestNumber) {
          const isUnique = await checkRequestNumberUnique(currentTaskData.requestNumber);
          
          if (!isUnique) {
            console.warn(`[WARNING] Номер заявки ${currentTaskData.requestNumber} вже існує. Генеруємо новий номер...`);
            
            // Перевіряємо наявність регіону для генерації нового номера
            if (!currentTaskData.serviceRegion) {
              throw new Error('Неможливо згенерувати новий номер заявки: не вказано регіон сервісного відділу');
            }
            
            // Очищаємо номер заявки
            currentTaskData.requestNumber = '';
            setFormData(prev => ({ ...prev, requestNumber: '' }));
            
            // Генеруємо новий номер
            const newNumber = await generateNextRequestNumber(currentTaskData.serviceRegion);
            currentTaskData.requestNumber = newNumber;
            setFormData(prev => ({ ...prev, requestNumber: newNumber }));
            console.log(`[DEBUG] Згенеровано новий номер заявки: ${newNumber}`);
            
            retryCount++;
            // Невелика затримка перед повторною спробою
            await new Promise(resolve => setTimeout(resolve, 100));
            continue; // Повторюємо перевірку з новим номером
          }
        }

        // Спроба збереження
        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(currentTaskData)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Помилка збереження' }));
          throw new Error(errorData.error || 'Помилка збереження заявки');
        }

        savedTask = await response.json();
        isSaved = true;
        console.log(`[DEBUG] Заявка успішно збережена з номером: ${savedTask.requestNumber || currentTaskData.requestNumber}`);
      }

      // Якщо не вдалося зберегти після всіх спроб
      if (!isSaved || !savedTask) {
        throw new Error('Не вдалося зберегти заявку після кількох спроб генерації унікального номера. Спробуйте ще раз.');
      }
      console.log(`[DEBUG] Заявка ${taskId ? 'оновлена' : 'створена'}:`, savedTask);
      
      // Зберігаємо координати для нової заявки, якщо адреса була вибрана з Google Places
      if (!taskId && savedTask._id && lastPlaceCoordinates) {
        try {
          await saveCoordinatesToDatabase(
            savedTask._id, 
            lastPlaceCoordinates.lat, 
            lastPlaceCoordinates.lng, 
            lastPlaceCoordinates.isApproximate
          );
          console.log('Координати збережено для нової заявки:', savedTask._id);
          // Очищаємо збережені координати
          setLastPlaceCoordinates(null);
        } catch (err) {
          console.error('Помилка збереження координат для нової заявки:', err);
        }
      }
      
      // Логування події
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const requestNumber = savedTask.requestNumber || taskData.requestNumber || savedTask._id || savedTask.id || taskId || 'Невідомий номер';
      const logEventData = {
        userId: currentUser._id || currentUser.id,
        userName: currentUser.name || currentUser.login,
        userRole: currentUser.role,
        action: taskId ? 'update' : 'create',
        entityType: 'task',
        entityId: savedTask._id || savedTask.id || taskId,
        description: taskId 
          ? `Редагування заявки ${requestNumber}` 
          : `Створення заявки ${requestNumber}`,
        details: {
          requestNumber: requestNumber,
          client: taskData.client || '',
          address: taskData.address || '',
          status: taskData.status || ''
        }
      };
      
      console.log('[DEBUG] Логування події:', logEventData);
      
      // Якщо це редагування - знаходимо що змінилося
      if (taskId && initialData) {
        const changes = [];
        const importantFields = {
          status: 'Статус',
          client: 'Замовник',
          address: 'Адреса',
          requestDesc: 'Опис заявки',
          work: 'Найменування робіт',
          approvedByWarehouse: 'Підтвердження завсклада',
          approvedByAccountant: 'Підтвердження бухгалтера',
          warehouseComment: 'Коментар завсклада',
          accountantComment: 'Коментар бухгалтера',
          engineer1: 'Інженер 1',
          engineer2: 'Інженер 2',
          serviceRegion: 'Регіон',
          serviceTotal: 'Вартість робіт',
          equipment: 'Обладнання',
          paymentType: 'Вид оплати',
          bonusApprovalDate: 'Дата затвердження премії',
          debtStatus: 'Статус заборгованості'
        };
        
        Object.keys(importantFields).forEach(field => {
          const oldVal = initialData[field];
          const newVal = taskData[field];
          if (String(oldVal || '') !== String(newVal || '')) {
            changes.push({
              field: importantFields[field],
              oldValue: oldVal || '(порожньо)',
              newValue: newVal || '(порожньо)'
            });
          }
        });
        
        if (changes.length > 0) {
          logEventData.details = { changes };
          logEventData.description = `Редагування заявки ${savedTask.requestNumber || taskId}: ${changes.map(c => c.field).join(', ')}`;
        }
      }
      
      // Відправляємо лог
      try {
        const token = localStorage.getItem('token');
        const logResponse = await fetch(`${API_BASE_URL}/event-log`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(logEventData)
        });
        
        if (logResponse.ok) {
          const logResult = await logResponse.json();
          console.log('[DEBUG] Лог успішно збережено:', logResult);
        } else {
          const errorText = await logResponse.text();
          console.error('[ERROR] Помилка збереження логу:', logResponse.status, errorText);
        }
      } catch (logErr) {
        console.error('[ERROR] Помилка логування:', logErr);
      }

      // Перевірка: чи всі відправлені дані збереглися (актуальні при нестабільному інтернеті)
      const verification = taskDataMatchesSaved(currentTaskData, savedTask);
      if (!verification.match) {
        console.warn('[DEBUG] Не всі поля збереглися. Розбіжності:', verification.mismatchedFields);
        setError('Нестабільний інтернет. Не всі дані збереглися. Спробуйте ще раз натиснути «Зберегти».');
        if (onSave) onSave(savedTask, { keepModalOpen: true });
        alert('⚠️ Нестабільний інтернет. Не всі дані збереглися. Спробуйте ще раз зберегти.\n\nФорма залишається відкритою.');
        return;
      }

      if (onSave) {
        onSave(savedTask);
      }
      onClose();
      alert(taskId ? 'Заявку успішно оновлено!' : 'Заявку успішно створено!');
    } catch (err) {
      console.error('Помилка створення заявки:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Обробка підтвердження відхилення бухгалтером з модального вікна
  const handleAccountantRejectConfirm = async () => {
    if (!accountantRejectModal.comment.trim()) {
      alert('Введіть причину відмови');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const taskId = initialData?._id || initialData?.id;

      const updateData = {
        approvedByAccountant: 'Відмова',
        accountantComment: accountantRejectModal.comment
      };

      if (accountantRejectModal.returnTo === 'service') {
        // Повернути в роботу сервісному відділу
        updateData.status = 'В роботі';
      } else if (accountantRejectModal.returnTo === 'warehouse') {
        // Повернути в роботу завскладу
        updateData.approvedByWarehouse = 'На розгляді';
      }

      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        const savedTask = await response.json();
        
        // Логування події
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'reject',
              entityType: 'task',
              entityId: taskId,
              description: `Відмова заявки ${initialData?.requestNumber || taskId} бухгалтером: ${accountantRejectModal.comment}`,
              details: {
                field: 'approvedByAccountant',
                oldValue: initialData?.approvedByAccountant || 'На розгляді',
                newValue: 'Відмова',
                comment: accountantRejectModal.comment,
                returnTo: accountantRejectModal.returnTo
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        setAccountantRejectModal({ open: false, comment: '', returnTo: 'service' });
        if (onSave) onSave(savedTask);
        onClose();
        alert('Заявку відхилено!');
      } else {
        alert('Помилка оновлення заявки');
      }
    } catch (error) {
      console.error('Помилка відхилення:', error);
      alert('Помилка відхилення заявки');
    } finally {
      setLoading(false);
    }
  };

  // Регіон заблокований тільки для користувачів з одним конкретним регіоном (не "Україна" і не мультирегіон)
  // Мультирегіонні користувачі (з регіоном "Україна" або admin/administrator) можуть вибирати регіон
  const isRegionReadOnly = user?.region && 
                           user.region !== 'Україна' && 
                           !['admin', 'administrator'].includes(user?.role) &&
                           !user?.region.includes(','); // Якщо регіон містить кому - це мультирегіон

  if (!open) return null;

  // Визначаємо чи потрібно блокувати всі поля крім debtStatus
  const isApprovedTask = formData.approvedByAccountant === 'Підтверджено' || formData.approvedByAccountant === true;
  const isDebtOnlyMode = debtOnly && isApprovedTask;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${isDebtOnlyMode ? 'debt-only-mode' : ''} ${isReadOnly ? 'read-only-mode' : ''} ${isAccountantMode ? 'accountant-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {isNewTask ? 'Додати нову заявку' : isReadOnly ? 'Перегляд заявки' : 'Редагувати заявку'}
            {isDebtOnlyMode && <span className="debt-mode-badge">💰 Режим заборгованості</span>}
            {isReadOnly && <span className="readonly-badge">👁️ Тільки перегляд</span>}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          {/* Банер: у замовника є заборгованість по оплаті */}
          {clientPaymentDebt && clientPaymentDebt.count > 0 && (
            <div className="client-payment-debt-banner">
              💳 У цього замовника є заборгованість по оплаті: <strong>{clientPaymentDebt.count}</strong> заявок на суму <strong>{clientPaymentDebt.sum.toFixed(2)} грн</strong>
            </div>
          )}

          {/* Блок інформації про відмову */}
          {!isNewTask && (initialData?.approvedByWarehouse === 'Відмова' || initialData?.approvedByAccountant === 'Відмова') && (
            <div className="rejection-info-block">
              <div className="rejection-header-alert">⚠️ ВІДМОВА!</div>
              
              {/* Відмова завсклада */}
              {initialData?.approvedByWarehouse === 'Відмова' && (
                <div className="rejection-details-block">
                  <div className="rejection-who">
                    <strong>Відхилено:</strong> Зав. складом
                  </div>
                  {initialData?.warehouseComment && (
                    <div className="rejection-reason-text">
                      <strong>Причина відмови:</strong> {initialData.warehouseComment}
                    </div>
                  )}
                  <div className="rejection-action">
                    <strong>🔧 Дії для виправлення:</strong>
                    <ol>
                      <li>Виправте зауваження, вказані в причині відмови</li>
                      <li>Змініть статус заявки з "В роботі" на "Виконано"</li>
                      <li>Натисніть "Зберегти"</li>
                    </ol>
                  </div>
                </div>
              )}
              
              {/* Відмова бухгалтера */}
              {initialData?.approvedByAccountant === 'Відмова' && (
                <div className="rejection-details-block">
                  <div className="rejection-who">
                    <strong>Відхилено:</strong> Бухгалтером
                  </div>
                  {initialData?.accountantComment && (
                    <div className="rejection-reason-text">
                      <strong>Причина відмови:</strong> {initialData.accountantComment}
                    </div>
                  )}
                  <div className="rejection-action">
                    {initialData?.status === 'В роботі' ? (
                      <>
                        <strong>🔧 Дії для виправлення (Сервісна служба):</strong>
                        <ol>
                          <li>Виправте зауваження, вказані в причині відмови</li>
                          <li>Змініть статус заявки з "В роботі" на "Виконано"</li>
                          <li>Натисніть "Зберегти"</li>
                        </ol>
                      </>
                    ) : (
                      <>
                        <strong>📦 Дії для виправлення (Зав. склад):</strong>
                        <ol>
                          <li>Перевірте та виправте зауваження</li>
                          <li>Змініть "Підтвердження зав. складу" на "Підтверджено"</li>
                          <li>Натисніть "Зберегти"</li>
                        </ol>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Номер заявки/наряду та Автор заявки - в одному рядку */}
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, textAlign: 'center' }}>
              <label style={{ fontSize: '14px', fontWeight: '600' }}>Номер заявки/наряду {isNewTask && '(автогенерація)'}</label>
              <input 
                type="text" 
                name="requestNumber" 
                value={formData.requestNumber} 
                onChange={handleChange}
                placeholder={isNewTask ? "Буде згенеровано автоматично після вибору регіону" : ""}
                readOnly={!isNewTask && !(user?.role === 'administrator' || user?.role === 'admin')}
                style={{
                  width: '100%',
                  textAlign: 'center',
                  ...(!isNewTask && !(user?.role === 'administrator' || user?.role === 'admin') ? { backgroundColor: 'var(--surface)', opacity: 0.7, cursor: 'not-allowed', color: '#ff0000', fontWeight: 'bold' } : { color: '#ff0000', fontWeight: 'bold' })
                }}
              />
            </div>
            <div className="form-group" style={{ flex: 1, textAlign: 'center' }}>
              <label style={{ fontSize: '14px', fontWeight: '600' }}>Автор заявки</label>
              <input 
                type="text" 
                name="requestAuthor" 
                value={formData.requestAuthor || ''} 
                readOnly={true}
                placeholder="ПІБ користувача"
                style={{
                  width: '100%',
                  textAlign: 'center',
                  backgroundColor: 'var(--surface)',
                  opacity: 0.7,
                  cursor: 'not-allowed',
                  color: 'var(--text-primary)'
                }}
              />
            </div>
          </div>

          {/* Основна інформація */}
          <div className="form-section section-basic">
            {!isAccountantMode && (
            <div className="section-header" onClick={() => toggleSection('basic')}>
              <h3>Основна інформація</h3>
              <span className="section-toggle">{showSections.basic ? '▼' : '▶'}</span>
            </div>
            )}
            {showSections.basic && (
              <div className="section-content">
                {/* Перший рядок: Статус заявки, Дата заявки, Компанія виконавець, Регіон сервісного відділу, Запланована дата робіт */}
                <div className="form-row five-cols">
                  <div className="form-group">
                    <label>Статус заявки <span className="required">*</span></label>
                    <select name="status" value={formData.status} onChange={handleChange} required>
                      <option value="">Виберіть...</option>
                      <option value="Заявка">Заявка</option>
                      <option value="В роботі">В роботі</option>
                      <option value="Виконано">Виконано</option>
                      <option value="Заблоковано">Заблоковано</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Дата заявки</label>
                    <input type="date" name="requestDate" value={formData.requestDate} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Компанія виконавець <span className="required">*</span></label>
                    <select name="company" value={formData.company} onChange={handleChange} required>
                      <option value="">Виберіть...</option>
                      <option value="ДТС">ДТС</option>
                      <option value="Дарекс Енерго">Дарекс Енерго</option>
                      <option value="інша">інша</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Регіон сервісного відділу <span className="required">*</span></label>
                    <select 
                      name="serviceRegion" 
                      value={formData.serviceRegion} 
                      onChange={handleChange} 
                      required
                      disabled={isRegionReadOnly}
                    >
                      <option value="">Виберіть регіон</option>
                      {regions
                        .filter(r => {
                          const regionName = r.name || r;
                          return !regionName.includes(',');
                        })
                        .map(r => (
                          <option key={r.name || r} value={r.name || r}>{r.name || r}</option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Запланована дата робіт {panelType === 'operator' && <span className="required">*</span>}</label>
                    <input 
                      type="date" 
                      name="plannedDate" 
                      value={formData.plannedDate || ''} 
                      onChange={handleChange}
                      required={panelType === 'operator'}
                    />
                  </div>
                </div>
                {/* Другий рядок: Контактна особа, Тел. контактної особи */}
                <div className="form-row two-cols">
                  <div className="form-group">
                    <label>Контактна особа</label>
                    <input 
                      type="text" 
                      name="contactPerson" 
                      value={formData.contactPerson || ''} 
                      onChange={handleChange}
                      placeholder="ПІБ контактної особи"
                    />
                  </div>
                  <div className="form-group">
                    <label>Тел. контактної особи <span className="required">*</span></label>
                    <input 
                      type="tel" 
                      name="contactPhone" 
                      value={formData.contactPhone || ''} 
                      onChange={handleChange}
                      placeholder="+380..."
                      required
                    />
                  </div>
                </div>
                {/* Рядок: Опис заявки (збільшено в 3 рази) */}
                <div className="form-row">
                  <div className="form-group request-desc-full-width">
                    <label>Опис заявки <span className="required">*</span></label>
                    <textarea name="requestDesc" value={formData.requestDesc} onChange={handleChange} rows="3" required />
                  </div>
                </div>
                {/* Третій рядок: Термінова заявка, Внутрішні роботи */}
                <div className="form-row two-cols">
                  <div className="form-group checkbox-group">
                    <label>
                      <input 
                        type="checkbox" 
                        name="urgentRequest" 
                        checked={formData.urgentRequest} 
                        onChange={handleChange}
                        disabled={!['admin', 'administrator', 'operator'].includes(user?.role)}
                      />
                      <span className={`urgent-label ${!['admin', 'administrator', 'operator'].includes(user?.role) ? 'disabled' : ''}`}>
                        🔥 Термінова заявка
                      </span>
                    </label>
                  </div>
                  <div className="form-group checkbox-group">
                    <label>
                      <input type="checkbox" name="internalWork" checked={formData.internalWork} onChange={handleChange} />
                      Внутрішні роботи
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Клієнт та адреса */}
          <div className="form-section section-client">
            {!isAccountantMode && (
            <div className="section-header" onClick={() => toggleSection('client')}>
              <h3>Клієнт та адреса</h3>
              <span className="section-toggle">{showSections.client ? '▼' : '▶'}</span>
            </div>
            )}
            {showSections.client && (
              <div className="section-content">
                {/* Банер заборгованості по оплаті — перший рядок секції Клієнт та адреса */}
                {clientPaymentDebt && clientPaymentDebt.count > 0 && (
                  <div className="client-payment-debt-banner">
                    💳 У цього замовника є заборгованість по оплаті: <strong>{clientPaymentDebt.count}</strong> заявок на суму <strong>{clientPaymentDebt.sum.toFixed(2)} грн</strong>
                  </div>
                )}
                {/* Рядок: Замовник, ЄДРПОУ */}
                <div className="form-row two-cols">
                  <div className="form-group">
                    <label>Замовник <span className="required">*</span></label>
                    <input type="text" name="client" value={formData.client} onChange={handleChange} required />
                  </div>
                  <div className="form-group autocomplete-wrapper">
                    <label>ЄДРПОУ</label>
                    <input 
                      type="text" 
                      name="edrpou" 
                      value={formData.edrpou} 
                      onChange={handleChange}
                      placeholder="Введіть ЄДРПОУ..."
                      autoComplete="off"
                    />
                    {/* Dropdown з автодоповненням для ЄДРПОУ */}
                    {showEdrpouDropdown && filteredEdrpouList.length > 0 && (
                      <div className="autocomplete-dropdown">
                        <div className="autocomplete-hint">
                          💡 Виберіть ЄДРПОУ для автозаповнення даних клієнта
                        </div>
                        {filteredEdrpouList.slice(0, 10).map((edrpou, index) => (
                          <div
                            key={index}
                            className="autocomplete-item"
                            onClick={() => handleEdrpouSelect(edrpou)}
                          >
                            {edrpou}
                          </div>
                        ))}
                        {filteredEdrpouList.length > 10 && (
                          <div className="autocomplete-more">
                            ... та ще {filteredEdrpouList.length - 10}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Рядок: Адреса (збільшено в 3 рази) */}
                <div className="form-row">
                  <div className="form-group autocomplete-wrapper address-full-width">
                    <label>Адреса</label>
                    <input 
                      ref={isAccountantMode ? addressInputRef : addressTextareaRef}
                      type="text" 
                      name="address" 
                      value={formData.address} 
                      onChange={handleChange}
                      placeholder="Почніть вводити адресу..."
                      autoComplete="off"
                      style={!isAccountantMode ? { width: '100%', padding: '0.5rem', minHeight: '60px', resize: 'vertical' } : {}}
                    />
                  </div>
                </div>
                {/* Рядок: Номер рахунку, Дата оплати, Вид оплати, Реквізити отримувача рахунку */}
                <div className="form-row four-cols">
                  <div className="form-group">
                    <label>Номер рахунку</label>
                    <input type="text" name="invoice" value={formData.invoice} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Дата оплати</label>
                    <input type="date" name="paymentDate" value={formData.paymentDate} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Вид оплати {formData.status === 'Виконано' && <span className="required">*</span>}</label>
                    <select name="paymentType" value={formData.paymentType} onChange={handleChange}>
                      <option value="не вибрано">не вибрано</option>
                      <option value="Безготівка">Безготівка</option>
                      <option value="Готівка">Готівка</option>
                      <option value="На карту">На карту</option>
                      <option value="Інше">Інше</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Реквізити отримувача рахунку в паперовому вигляді</label>
                    <textarea name="invoiceRecipientDetails" value={formData.invoiceRecipientDetails} onChange={handleChange} rows="2" />
                  </div>
                </div>
                
                {/* Файл договору */}
                <div className="contract-file-block">
                  <label>Файл договору</label>
                  <div className="contract-file-content">
                    {formData.contractFile ? (
                      <div className="contract-file-uploaded">
                        <div className="contract-file-info">
                          <span className="contract-file-icon">📄</span>
                          <span className="contract-file-name">
                            {typeof formData.contractFile === 'string' 
                              ? formData.contractFile.split('/').pop() 
                              : 'Файл договору'}
                          </span>
                        </div>
                        <div className="contract-file-actions">
                          <button
                            type="button"
                            className="btn-contract-view"
                            onClick={() => window.open(formData.contractFile, '_blank')}
                            title="Переглянути договір"
                          >
                            👁️ Переглянути
                          </button>
                          <button
                            type="button"
                            className="btn-contract-remove"
                            onClick={handleRemoveContractFile}
                            title="Видалити договір"
                          >
                            🗑️ Видалити
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="contract-file-upload">
                        <input
                          type="file"
                          ref={contractFileInputRef}
                          onChange={handleContractFileChange}
                          accept=".pdf"
                          style={{ display: 'none' }}
                        />
                        <div className="contract-upload-buttons">
                          <button
                            type="button"
                            className="btn-contract-upload"
                            onClick={() => contractFileInputRef.current?.click()}
                            disabled={contractFileUploading}
                          >
                            {contractFileUploading ? (
                              <>⏳ Завантаження...</>
                            ) : (
                              <>📤 Завантажити новий</>
                            )}
                          </button>
                          <button
                            type="button"
                            className="btn-contract-select"
                            onClick={openContractSelector}
                          >
                            📋 Вибрати з існуючих
                          </button>
                        </div>
                        <span className="contract-file-hint">Максимум 20MB, тільки PDF</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Модальне вікно вибору існуючого договору */}
                {showContractSelector && (
                  <div className="contract-selector-overlay" onClick={() => setShowContractSelector(false)}>
                    <div className="contract-selector-modal" onClick={(e) => e.stopPropagation()}>
                      <div className="contract-selector-header">
                        <h4>Вибрати договір {formData.edrpou && `(ЄДРПОУ: ${formData.edrpou})`}</h4>
                        <button type="button" className="contract-selector-close" onClick={() => setShowContractSelector(false)}>×</button>
                      </div>
                      <div className="contract-selector-body">
                        {contractsLoading ? (
                          <div className="contract-selector-loading">
                            <p>Аналіз договорів...</p>
                            {keysLoadingProgress.total > 0 && (
                              <div className="contract-progress">
                                <div className="contract-progress-text">
                                  {keysLoadingProgress.loaded} / {keysLoadingProgress.total}
                                </div>
                                <div className="contract-progress-bar">
                                  <div 
                                    className="contract-progress-fill" 
                                    style={{ width: `${(keysLoadingProgress.loaded / keysLoadingProgress.total) * 100}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : existingContracts.length === 0 ? (
                          <div className="contract-selector-empty">
                            {formData.edrpou 
                              ? (
                                <>
                                  <p>Немає договорів для ЄДРПОУ {formData.edrpou}</p>
                                  <button 
                                    type="button" 
                                    className="btn-show-all-contracts"
                                    onClick={() => loadExistingContracts(true)}
                                  >
                                    Показати всі договори
                                  </button>
                                </>
                              )
                              : 'Немає доступних договорів'
                            }
                          </div>
                        ) : (
                          <div className="contract-selector-list">
                            {existingContracts.map((contract, idx) => (
                              <div
                                key={contract.pdfKey || contract.url || idx}
                                className="contract-selector-item"
                                onClick={() => handleSelectExistingContract(contract)}
                              >
                                <span className="contract-selector-icon">📄</span>
                                <div className="contract-selector-info">
                                  <div className="contract-selector-filename">
                                    {contract.fileName || 'Договір'}
                                    {contract.filesCount > 1 && (
                                      <span className="contract-files-count">
                                        ({contract.filesCount} однакових)
                                      </span>
                                    )}
                                  </div>
                                  <div className="contract-selector-client">
                                    {contract.client} {contract.edrpou && `(${contract.edrpou})`}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="contract-selector-preview"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(contract.url, '_blank');
                                  }}
                                >
                                  👁️
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Запит на рахунок - показуємо тільки при редагуванні */}
                {(initialData?._id || initialData?.id) && (
                  <InvoiceRequestBlock
                    task={{
                      ...formData,
                      id: initialData?._id || initialData?.id,
                      _id: initialData?._id || initialData?.id
                    }}
                    user={user}
                    readOnly={isReadOnly}
                    onRequest={async () => {
                      console.log('[DEBUG] Запит на рахунок створено');
                      // Перезавантажуємо дані завдання, щоб отримати оновлену дату заявки на рахунок
                      await reloadTaskData();
                    }}
                  />
                )}

                {/* Заборгованість по документам - приховуємо якщо hideDebtFields */}
                {!hideDebtFields && (
                <div className={`form-group debt-status-group ${allowDebtEditInArchive ? 'debt-editable-in-archive' : ''}`}>
                  <label>Заборгованість по актам виконаних робіт (оригінали)</label>
                  <div className="debt-controls">
                    <select
                      name="debtStatus"
                      value={formData.debtStatus || 'Заборгованість'}
                      onChange={(e) => {
                        if (isReadOnly && !allowDebtEditInArchive) return;
                        const newValue = e.target.value;
                        setFormData({
                          ...formData,
                          debtStatus: newValue,
                          debtStatusCheckbox: newValue === 'Документи в наявності'
                        });
                      }}
                      disabled={isDebtOnlyMode ? false : (allowDebtEditInArchive ? false : !['admin', 'administrator', 'buhgalteria'].includes(user?.role))}
                      style={allowDebtEditInArchive ? { pointerEvents: 'auto', opacity: 1, cursor: 'pointer' } : {}}
                    >
                      <option value="Заборгованість">Заборгованість</option>
                      <option value="Документи в наявності">Документи в наявності</option>
                    </select>
                    <label className="checkbox-label-debt">
                      <input 
                        type="checkbox" 
                        name="debtStatusCheckbox"
                        checked={formData.debtStatusCheckbox || false}
                        onChange={(e) => {
                          if (isReadOnly && !allowDebtEditInArchive) return;
                          const checked = e.target.checked;
                          setFormData({
                            ...formData,
                            debtStatusCheckbox: checked,
                            debtStatus: checked ? 'Документи в наявності' : 'Заборгованість'
                          });
                        }}
                        disabled={isDebtOnlyMode ? false : (allowDebtEditInArchive ? false : !['admin', 'administrator', 'buhgalteria'].includes(user?.role))}
                        style={allowDebtEditInArchive ? { pointerEvents: 'auto', opacity: 1, cursor: 'pointer' } : {}}
                      />
                      <span className="debt-checkbox-text">Документи в наявності</span>
                    </label>
                  </div>
                  <p className="debt-hint">
                    {formData.debtStatus === 'Документи в наявності' 
                      ? '📗 Документи в наявності - заборгованості немає' 
                      : '📕 Є заборгованість - заявка відображається у вкладці "Заборгованість по документам"'}
                  </p>
                </div>
                )}
              </div>
            )}
          </div>

          {/* Роботи, обладнання та матеріали */}
          <div className="form-section section-equipment">
            {!isAccountantMode && (
            <div className="section-header" onClick={() => toggleSection('equipment')}>
                <h3>Роботи, обладнання та матеріали</h3>
              <span className="section-toggle">{showSections.equipment ? '▼' : '▶'}</span>
            </div>
            )}
            {showSections.equipment && (
              <div className="section-content">
                {/* Рядок: Загальна сума послуги, Дата проведення робіт, Найменування робіт */}
                <div className="form-row three-cols">
                  <div className="form-group">
                    <label>Загальна сума послуги, грн</label>
                    <input type="text" name="serviceTotal" value={formData.serviceTotal} onChange={handleChange} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label>Дата проведення робіт {formData.status === 'Виконано' && <span className="required">*</span>}</label>
                    <input type="date" name="date" value={formData.date} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Найменування робіт {panelType === 'operator' && <span className="required">*</span>}</label>
                    <select name="work" value={formData.work} onChange={handleChange} required={panelType === 'operator'}>
                      <option value="">Виберіть...</option>
                      <option value="ТО">ТО</option>
                      <option value="ТО-1">ТО-1</option>
                      <option value="ТО-2">ТО-2</option>
                      <option value="ТО-3">ТО-3</option>
                      <option value="ТО-4">ТО-4</option>
                      <option value="ПНР">ПНР</option>
                      <option value="Ремонт в цеху">Ремонт в цеху</option>
                      <option value="Ремонт на місті">Ремонт на місті</option>
                      <option value="Діагностика">Діагностика</option>
                      <option value="Діагностика+ремонт">Діагностика+ремонт</option>
                      <option value="Ремонт в цеху (волонтерство)">Ремонт в цеху (волонтерство)</option>
                      <option value="Гарантійний ремонт в цеху">Гарантійний ремонт в цеху</option>
                      <option value="Гарантійний ремонт на місті">Гарантійний ремонт на місті</option>
                      <option value="Предпродажна підготовка">Предпродажна підготовка</option>
                      <option value="Продаж ЗІП">Продаж ЗІП</option>
                      <option value="Перекомутація">Перекомутація</option>
                      <option value="Внутрішні роботи (завантаження)">Внутрішні роботи (завантаження)</option>
                      <option value="Внутрішні роботи (розвантаження)">Внутрішні роботи (розвантаження)</option>
                      {/* Додаємо поточне значення до опцій, якщо його там немає (для сумісності зі старими даними) */}
                      {formData.work && !['', 'ТО', 'ТО-1', 'ТО-2', 'ТО-3', 'ТО-4', 'ПНР', 'Ремонт в цеху', 'Ремонт на місті', 'Діагностика', 'Діагностика+ремонт', 'Ремонт в цеху (волонтерство)', 'Гарантійний ремонт в цеху', 'Гарантійний ремонт на місті', 'Предпродажна підготовка', 'Продаж ЗІП', 'Перекомутація', 'Внутрішні роботи (завантаження)', 'Внутрішні роботи (розвантаження)'].includes(formData.work) && (
                        <option value={formData.work}>{formData.work}</option>
                      )}
                    </select>
                  </div>
                </div>
                {/* Рядок: Тип обладнання, Заводський номер обладнання, Модель двигуна, Зав. № двигуна, Інвент. № обладнання від замовника */}
                <div className="form-row five-cols">
                  <div className="form-group autocomplete-wrapper">
                    <label>Тип обладнання {panelType === 'operator' && <span className="required">*</span>}</label>
                    <input 
                      type="text" 
                      name="equipment" 
                      value={formData.equipment} 
                      onChange={handleChange}
                      placeholder="Введіть тип обладнання..."
                      autoComplete="off"
                      required={panelType === 'operator'}
                    />
                    {/* Dropdown з автодоповненням для типу обладнання */}
                    {showEquipmentDropdown && filteredEquipmentTypes.length > 0 && (
                      <div className="autocomplete-dropdown">
                        <div className="autocomplete-hint">
                          💡 Виберіть тип для автозаповнення матеріалів
                        </div>
                        {filteredEquipmentTypes.slice(0, 10).map((type, index) => (
                          <div
                            key={index}
                            className="autocomplete-item"
                            onClick={() => handleEquipmentSelect(type)}
                          >
                            {type}
                          </div>
                        ))}
                        {filteredEquipmentTypes.length > 10 && (
                          <div className="autocomplete-more">
                            ... та ще {filteredEquipmentTypes.length - 10}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Заводський номер обладнання {panelType === 'operator' && <span className="required">*</span>}</label>
                    <input 
                      type="text" 
                      name="equipmentSerial" 
                      value={formData.equipmentSerial} 
                      onChange={handleChange}
                      required={panelType === 'operator'}
                    />
                  </div>
                  <div className="form-group">
                    <label>Модель двигуна</label>
                    <input type="text" name="engineModel" value={formData.engineModel} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Зав. № двигуна</label>
                    <input type="text" name="engineSerial" value={formData.engineSerial} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Інвент. № обладнання від замовника</label>
                    <input type="text" name="customerEquipmentNumber" value={formData.customerEquipmentNumber} onChange={handleChange} />
                  </div>
                </div>

                {/* Напрацювання мотогодин обладнання */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Напрацювання мотогодин обладнання</label>
                    <input 
                      type="text" 
                      name="equipmentOperatingHours" 
                      value={formData.equipmentOperatingHours || ''} 
                      onChange={handleChange}
                      placeholder="Введіть напрацювання мотогодин"
                    />
                  </div>
                </div>

                {/* Матеріали */}
                {/* Рядок: Тип оливи, Використано л, Ціна за 1 л грн, Сума грн */}
                <div className="form-row four-cols">
                  <div className="form-group">
                    <label>Тип оливи</label>
                    <input type="text" name="oilType" value={formData.oilType} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Використано, л</label>
                    <input type="text" name="oilUsed" value={formData.oilUsed} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Ціна за 1 л, грн</label>
                    <input type="text" name="oilPrice" value={formData.oilPrice} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group calculated">
                    <label>Сума, грн</label>
                    <input type="text" value={formatNumber(calculations.oilTotal)} readOnly className="calculated-field" />
                  </div>
                </div>
                {/* Рядок: Масляний фільтр - Назва, Штук, Ціна одного грн, Сума грн */}
                <div className="form-row four-cols">
                  <div className="form-group">
                    <label>Масляний фільтр: Назва</label>
                    <input type="text" name="filterName" value={formData.filterName} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Штук</label>
                    <input type="text" name="filterCount" value={formData.filterCount} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Ціна одного, грн</label>
                    <input type="text" name="filterPrice" value={formData.filterPrice} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group calculated">
                    <label>Сума, грн</label>
                    <input type="text" value={formatNumber(calculations.filterSum)} readOnly className="calculated-field" />
                  </div>
                </div>
                {/* Рядок: Паливний фільтр - Назва, Штук, Ціна одного грн, Сума грн */}
                <div className="form-row four-cols">
                  <div className="form-group">
                    <label>Паливний фільтр: Назва</label>
                    <input type="text" name="fuelFilterName" value={formData.fuelFilterName} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Штук</label>
                    <input type="text" name="fuelFilterCount" value={formData.fuelFilterCount} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Ціна одного, грн</label>
                    <input type="text" name="fuelFilterPrice" value={formData.fuelFilterPrice} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group calculated">
                    <label>Сума, грн</label>
                    <input type="text" value={formatNumber(calculations.fuelFilterSum)} readOnly className="calculated-field" />
                  </div>
                </div>
                {/* Рядок: Повітряний фільтр - Назва, Штук, Ціна одного грн, Сума грн */}
                <div className="form-row four-cols">
                  <div className="form-group">
                    <label>Повітряний фільтр: Назва</label>
                    <input type="text" name="airFilterName" value={formData.airFilterName} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Штук</label>
                    <input type="text" name="airFilterCount" value={formData.airFilterCount} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Ціна одного, грн</label>
                    <input type="text" name="airFilterPrice" value={formData.airFilterPrice} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group calculated">
                    <label>Сума, грн</label>
                    <input type="text" value={formatNumber(calculations.airFilterSum)} readOnly className="calculated-field" />
                  </div>
                </div>
                {/* Рядок: Антифриз - Тип, Літри, Ціна грн, Сума грн */}
                <div className="form-row four-cols">
                  <div className="form-group">
                    <label>Антифриз: Тип</label>
                    <input type="text" name="antifreezeType" value={formData.antifreezeType} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Літри</label>
                    <input type="text" name="antifreezeL" value={formData.antifreezeL} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Ціна, грн</label>
                    <input type="text" name="antifreezePrice" value={formData.antifreezePrice} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group calculated">
                    <label>Сума, грн</label>
                    <input type="text" value={formatNumber(calculations.antifreezeSum)} readOnly className="calculated-field" />
                  </div>
                </div>
                {/* Рядок: Інші матеріали - Опис інших матеріалів, Загальна ціна грн */}
                <div className="form-row two-cols">
                  <div className="form-group" style={{flex: 2}}>
                    <label>Інші матеріали: Опис інших матеріалів</label>
                    <input type="text" name="otherMaterials" value={formData.otherMaterials} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Загальна ціна, грн</label>
                    <input type="text" name="otherSum" value={formData.otherSum} onChange={handleChange} placeholder="0" />
                  </div>
                </div>
                {/* Рядок: Вартість робіт грн (авторозрахунок) */}
                <div className="form-group calculated">
                  <label>Вартість робіт, грн (авторозрахунок)</label>
                  <input type="text" value={formatNumber(calculations.workPrice)} readOnly className="calculated-field" />
                </div>
              </div>
            )}
          </div>

          {/* Інженери */}
          <div className="form-section section-engineers">
            {!isAccountantMode && (
            <div className="section-header" onClick={() => toggleSection('work')}>
                <h3>Інженери</h3>
              <span className="section-toggle">{showSections.work ? '▼' : '▶'}</span>
            </div>
            )}
            {showSections.work && (
              <div className="section-content">
                {isAccountantMode ? (
                  <div className="form-row six-cols">
                    <div className="form-group">
                      <label>Інж. №1</label>
                      <select name="engineer1" value={formData.engineer1} onChange={handleChange}>
                        <option value="">...</option>
                        {serviceEngineers.map(eng => (
                          <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Інж. №2</label>
                      <select name="engineer2" value={formData.engineer2} onChange={handleChange}>
                        <option value="">...</option>
                        {serviceEngineers.map(eng => (
                          <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Інж. №3</label>
                      <select name="engineer3" value={formData.engineer3} onChange={handleChange}>
                        <option value="">...</option>
                        {serviceEngineers.map(eng => (
                          <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Інж. №4</label>
                      <select name="engineer4" value={formData.engineer4} onChange={handleChange}>
                        <option value="">...</option>
                        {serviceEngineers.map(eng => (
                          <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Інж. №5</label>
                      <select name="engineer5" value={formData.engineer5} onChange={handleChange}>
                        <option value="">...</option>
                        {serviceEngineers.map(eng => (
                          <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Інж. №6</label>
                      <select name="engineer6" value={formData.engineer6} onChange={handleChange}>
                        <option value="">...</option>
                        {serviceEngineers.map(eng => (
                          <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Сервісний інженер №1 {formData.status === 'Виконано' && panelType === 'service' && <span className="required">*</span>}</label>
                        <select name="engineer1" value={formData.engineer1} onChange={handleChange} required={formData.status === 'Виконано' && panelType === 'service'}>
                          <option value="">Виберіть...</option>
                          {serviceEngineers.map(eng => (
                            <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Сервісний інженер №2</label>
                        <select name="engineer2" value={formData.engineer2} onChange={handleChange}>
                          <option value="">Виберіть...</option>
                          {serviceEngineers.map(eng => (
                            <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Сервісний інженер №3</label>
                        <select name="engineer3" value={formData.engineer3} onChange={handleChange}>
                          <option value="">Виберіть...</option>
                          {serviceEngineers.map(eng => (
                            <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Сервісний інженер №4</label>
                        <select name="engineer4" value={formData.engineer4} onChange={handleChange}>
                          <option value="">Виберіть...</option>
                          {serviceEngineers.map(eng => (
                            <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Сервісний інженер №5</label>
                        <select name="engineer5" value={formData.engineer5} onChange={handleChange}>
                          <option value="">Виберіть...</option>
                          {serviceEngineers.map(eng => (
                            <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Сервісний інженер №6</label>
                        <select name="engineer6" value={formData.engineer6} onChange={handleChange}>
                          <option value="">Виберіть...</option>
                          {serviceEngineers.map(eng => (
                            <option key={eng.login} value={eng.name}>{eng.displayName}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Витрати та транспорт */}
          <div className="form-section section-expenses">
            {!isAccountantMode && (
            <div className="section-header" onClick={() => toggleSection('expenses')}>
              <h3>Витрати та транспорт</h3>
              <span className="section-toggle">{showSections.expenses ? '▼' : '▶'}</span>
            </div>
            )}
            {showSections.expenses && (
              <div className="section-content">
                {/* Рядок: Добові грн, Проживання грн, Інші витрати грн */}
                <div className="form-row three-cols">
                  <div className="form-group">
                    <label>Добові, грн</label>
                    <input type="text" name="perDiem" value={formData.perDiem} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Проживання, грн</label>
                    <input type="text" name="living" value={formData.living} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Інші витрати, грн</label>
                    <input type="text" name="otherExp" value={formData.otherExp} onChange={handleChange} placeholder="0" />
                  </div>
                </div>
                {/* Рядок: Держномер автотранспорту, Транспортні витрати км, Загальна вартість тр. витрат грн */}
                <div className="form-row three-cols">
                  <div className="form-group">
                    <label>Держномер автотранспорту</label>
                    <input type="text" name="carNumber" value={formData.carNumber} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Транспортні витрати, км</label>
                    <input type="text" name="transportKm" value={formData.transportKm} onChange={handleChange} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label>Загальна вартість тр. витрат, грн</label>
                    <input type="text" name="transportSum" value={formData.transportSum} onChange={handleChange} placeholder="0" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Підтвердження завскладом та бухгалтером */}
          <div className="form-section section-approval">
            {!isAccountantMode && (
            <div className="section-header" onClick={() => toggleSection('other')}>
              <h3>Підтвердження завскладом та бухгалтером</h3>
              <span className="section-toggle">{showSections.other ? '▼' : '▶'}</span>
            </div>
            )}
            {showSections.other && (
              <div className="section-content">
                {/* Рядок: Коментарі, Дата затвердження премії */}
                <div className="form-row two-cols">
                  <div className="form-group">
                    <label>Коментарі</label>
                    <textarea name="comments" value={formData.comments} onChange={handleChange} rows="3" />
                  </div>
                  <div className="form-group">
                    <label>Дата затвердження премії</label>
                    {(user?.role === 'administrator' || user?.role === 'admin') ? (
                      <input 
                        type="date" 
                        name="bonusApprovalDate" 
                        value={formData.bonusApprovalDate ? 
                          (/^\d{2}-\d{4}$/.test(formData.bonusApprovalDate) ? 
                            `${formData.bonusApprovalDate.split('-')[1]}-${formData.bonusApprovalDate.split('-')[0]}-01` : 
                            formData.bonusApprovalDate) : 
                          ''
                        } 
                        onChange={(e) => {
                          // Конвертуємо YYYY-MM-DD в MM-YYYY
                          if (e.target.value) {
                            const [year, month] = e.target.value.split('-');
                            setFormData(prev => ({ ...prev, bonusApprovalDate: `${month}-${year}` }));
                          } else {
                            setFormData(prev => ({ ...prev, bonusApprovalDate: '' }));
                          }
                        }}
                      />
                    ) : (
                      <input 
                        type="text" 
                        name="bonusApprovalDate" 
                        value={formData.bonusApprovalDate || calculations.autoBonusApprovalDate || ''} 
                        readOnly 
                        style={{ backgroundColor: 'var(--surface)', opacity: 0.7, cursor: 'not-allowed' }}
                        placeholder="Автоматично (MM-YYYY)"
                      />
                    )}
                  </div>
                </div>
                {/* Рядок: Підтвердження зав. складу - Підтвердження зав. складу, Опис відмови (зав. склад) */}
                <div className="form-row two-cols">
                  <div className="form-group">
                    <label>Підтвердження зав. складу</label>
                    <select 
                      name="approvedByWarehouse" 
                      value={formData.approvedByWarehouse || 'На розгляді'} 
                      onChange={handleChange}
                      disabled={!['admin', 'administrator', 'zavsklad'].includes(user?.role)}
                    >
                      <option value="На розгляді">На розгляді</option>
                      <option value="Підтверджено">Підтверджено</option>
                      <option value="Відмова">Відмова</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Опис відмови (зав. склад)</label>
                    <textarea 
                      name="warehouseComment" 
                      value={formData.warehouseComment || ''} 
                      onChange={handleChange}
                      placeholder="Опис причини відмови..."
                      rows="2"
                      disabled={!['admin', 'administrator', 'zavsklad'].includes(user?.role)}
                    />
                  </div>
                </div>
                {/* Рядок: Підтвердження бухгалтера - Підтвердження бухгалтера, Опис відмови (бухгалтер) */}
                <div className="form-row two-cols">
                  <div className="form-group">
                    <label>Підтвердження бухгалтера</label>
                    <select 
                      name="approvedByAccountant" 
                      value={formData.approvedByAccountant || 'На розгляді'} 
                      onChange={handleChange}
                      disabled={!['admin', 'administrator', 'buhgalteria'].includes(user?.role)}
                    >
                      <option value="На розгляді">На розгляді</option>
                      <option value="Підтверджено">Підтверджено</option>
                      <option value="Відмова">Відмова</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Опис відмови (бухгалтер)</label>
                    <textarea 
                      name="accountantComment" 
                      value={formData.accountantComment || ''} 
                      onChange={handleChange}
                      placeholder="Опис причини відмови..."
                      rows="2"
                      disabled={!['admin', 'administrator', 'buhgalteria'].includes(user?.role)}
                    />
                  </div>
                </div>
                {/* Рядок: Системна інформація - всі поля в один рядок */}
                <div className="form-row six-cols">
                  <div className="form-group">
                    <label>Авт. створення заявки</label>
                    <input 
                      type="datetime-local" 
                      name="autoCreatedAt" 
                      value={formData.autoCreatedAt || ''} 
                      readOnly 
                      style={{ backgroundColor: 'var(--surface)', opacity: 0.7, cursor: 'not-allowed', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Авт. виконанно</label>
                    <input 
                      type="datetime-local" 
                      name="autoCompletedAt" 
                      value={formData.autoCompletedAt || ''} 
                      readOnly 
                      style={{ backgroundColor: 'var(--surface)', opacity: 0.7, cursor: 'not-allowed', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Авт. затвердження завскладом</label>
                    <input 
                      type="datetime-local" 
                      name="autoWarehouseApprovedAt" 
                      value={formData.autoWarehouseApprovedAt || ''} 
                      readOnly 
                      style={{ backgroundColor: 'var(--surface)', opacity: 0.7, cursor: 'not-allowed', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Авт. затвердження бухгалтером</label>
                    <input 
                      type="datetime-local" 
                      name="autoAccountantApprovedAt" 
                      value={formData.autoAccountantApprovedAt || ''} 
                      readOnly 
                      style={{ backgroundColor: 'var(--surface)', opacity: 0.7, cursor: 'not-allowed', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Дата заявки на рахунок</label>
                    <input 
                      type="datetime-local" 
                      name="invoiceRequestDate" 
                      value={formData.invoiceRequestDate || ''} 
                      readOnly 
                      style={{ backgroundColor: 'var(--surface)', opacity: 0.7, cursor: 'not-allowed', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Дата завантаження рахунку</label>
                    <input 
                      type="datetime-local" 
                      name="invoiceUploadDate" 
                      value={formData.invoiceUploadDate || ''} 
                      readOnly 
                      style={{ backgroundColor: 'var(--surface)', opacity: 0.7, cursor: 'not-allowed', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Секція файлів виконаних робіт */}
            <div className="form-section">
              {!isAccountantMode && (
              <div className="section-header" onClick={() => toggleSection('files')}>
                <h3>📁 Файли виконаних робіт</h3>
                <span className="section-toggle">{showSections.files ? '▼' : '▶'}</span>
              </div>
              )}
              {showSections.files && (
                <div className="section-content">
                  <FileUpload 
                    taskId={initialData?._id || initialData?.id} 
                    readOnly={isReadOnly}
                    onFilesUploaded={(files) => {
                      console.log('[DEBUG] Завантажено файли:', files);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Скасувати
            </button>
            {(!isReadOnly || allowDebtEditInArchive) && (
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Збереження...' : 'Зберегти'}
              </button>
            )}
          </div>
        </form>
      </div>
      
      {/* Модальне вікно автозаповнення даних клієнта */}
      <ClientDataSelectionModal
        open={clientDataModal.open}
        onClose={() => setClientDataModal({ open: false, edrpou: '' })}
        onApply={handleClientDataApply}
        edrpou={clientDataModal.edrpou}
        currentFormData={formData}
      />
      
      {/* Модальне вікно автозаповнення даних обладнання */}
      <EquipmentDataSelectionModal
        open={equipmentDataModal.open}
        onClose={() => setEquipmentDataModal({ open: false, equipment: '' })}
        onApply={handleEquipmentDataApply}
        equipmentType={equipmentDataModal.equipment}
        currentFormData={formData}
      />

      {/* Модальне вікно відхилення бухгалтером */}
      {accountantRejectModal.open && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setAccountantRejectModal({ ...accountantRejectModal, open: false })}>
          <div className="reject-modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Відхилення заявки бухгалтером</h3>
            
            <div className="reject-form">
              <label>Причина відмови (опис відмови бухгалтера):</label>
              <textarea
                value={accountantRejectModal.comment}
                onChange={(e) => setAccountantRejectModal({ ...accountantRejectModal, comment: e.target.value })}
                placeholder="Введіть причину відмови..."
                rows={4}
              />
              
              <div className="return-options">
                <label className="return-option">
                  <input
                    type="radio"
                    name="returnToAccountant"
                    checked={accountantRejectModal.returnTo === 'service'}
                    onChange={() => setAccountantRejectModal({ ...accountantRejectModal, returnTo: 'service' })}
                  />
                  <span>🔧 Повернути в роботу сервісному відділу</span>
                  <small>Статус заявки зміниться на "В роботі"</small>
                </label>
                
                <label className="return-option">
                  <input
                    type="radio"
                    name="returnToAccountant"
                    checked={accountantRejectModal.returnTo === 'warehouse'}
                    onChange={() => setAccountantRejectModal({ ...accountantRejectModal, returnTo: 'warehouse' })}
                  />
                  <span>📦 Повернути в роботу завскладу</span>
                  <small>Завсклад повинен перепідтвердити заявку</small>
                </label>
              </div>
              
              <div className="modal-buttons">
                <button 
                  type="button"
                  className="btn-cancel"
                  onClick={() => setAccountantRejectModal({ open: false, comment: '', returnTo: 'service' })}
                >
                  Скасувати
                </button>
                <button 
                  type="button"
                  className="btn-reject-confirm"
                  onClick={handleAccountantRejectConfirm}
                  disabled={!accountantRejectModal.comment.trim() || loading}
                >
                  {loading ? 'Збереження...' : 'Відхилити заявку'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальне вікно з не заповненими полями */}
      {missingFieldsModal.open && (
        <div className="modal-overlay" onClick={() => setMissingFieldsModal({ open: false, fields: [] })}>
          <div className="missing-fields-modal" onClick={(e) => e.stopPropagation()}>
            <div className="missing-fields-header">
              <h3>⚠️ Не заповнені обов'язкові поля</h3>
              <button 
                className="modal-close" 
                onClick={() => setMissingFieldsModal({ open: false, fields: [] })}
              >
                ×
              </button>
            </div>
            <div className="missing-fields-content">
              <p className="missing-fields-message">
                Будь ласка, заповніть наступні обов'язкові поля перед збереженням:
              </p>
              <ul className="missing-fields-list">
                {missingFieldsModal.fields.map((field, index) => (
                  <li key={index}>• {field}</li>
                ))}
              </ul>
            </div>
            <div className="modal-buttons">
              <button 
                type="button"
                className="btn-primary"
                onClick={() => setMissingFieldsModal({ open: false, fields: [] })}
              >
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AddTaskModal;
