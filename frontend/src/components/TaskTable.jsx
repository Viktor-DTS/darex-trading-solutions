import React, { useState, useEffect, useMemo, useRef } from 'react';
import API_BASE_URL from '../config';
import { authFetch } from '../utils/authFetch';
import { generateWorkOrder } from '../utils/workOrderGenerator';
import { getWarehouseApprovedAt } from '../utils/taskStuckRules';
import { taskRequiresOnecWriteoff } from './onec/taskOnecMaterials';
import { parseNumber } from '../utils/estimate/estimatePrefill';
import './TaskTable.css';

// Кеш списку заявок на клієнті (TTL 90 с) — менше запитів при перемиканні вкладок
const tasksCache = {};
const TASKS_CACHE_TTL_MS = 90 * 1000;

function getCachedTasks(cacheKey) {
  const entry = tasksCache[cacheKey];
  if (!entry || Date.now() - entry.timestamp > TASKS_CACHE_TTL_MS) return null;
  return entry.data;
}

function setCachedTasks(cacheKey, data) {
  tasksCache[cacheKey] = { data, timestamp: Date.now() };
}

export function clearTasksCache() {
  Object.keys(tasksCache).forEach((k) => delete tasksCache[k]);
}

// Всі можливі колонки (всі поля з оригінального проекту)
const ALL_COLUMNS = [
  // Основна інформація
  { key: 'requestNumber', label: '№ Заявки', width: 120 },
  { key: 'requestDate', label: 'Дата заявки', width: 120 },
  { key: 'status', label: 'Статус заявки', width: 120 },
  { key: 'company', label: 'Компанія виконавець', width: 150 },
  { key: 'serviceRegion', label: 'Регіон сервісного відділу', width: 150 },
  
  // Клієнт та адреса
  { key: 'edrpou', label: 'ЄДРПОУ', width: 120 },
  { key: 'client', label: 'Замовник', width: 200 },
  { key: 'address', label: 'Адреса', width: 250 },
  { key: 'requestDesc', label: 'Опис заявки', width: 200 },
  { key: 'plannedDate', label: 'Запланована дата робіт', width: 150 },
  { key: 'contactPerson', label: 'Контактна особа', width: 150 },
  { key: 'contactPhone', label: 'Тел. контактної особи', width: 140 },
  
  // Обладнання
  { key: 'equipment', label: 'Тип обладнання', width: 150 },
  { key: 'equipmentSerial', label: 'Заводський номер обладнання', width: 150 },
  { key: 'engineModel', label: 'Модель двигуна', width: 150 },
  { key: 'engineSerial', label: 'Зав. № двигуна', width: 150 },
  { key: 'customerEquipmentNumber', label: 'інвент. № обладнання від замовника', width: 180 },
  
  // Роботи та інженери
  { key: 'work', label: 'Найменування робіт', width: 200 },
  { key: 'date', label: 'Дата проведення робіт', width: 150 },
  { key: 'engineer1', label: 'Сервісний інженер №1', width: 150 },
  { key: 'engineer2', label: 'Сервісний інженер №2', width: 150 },
  { key: 'engineer3', label: 'Сервісний інженер №3', width: 150 },
  { key: 'engineer4', label: 'Сервісний інженер №4', width: 150 },
  { key: 'engineer5', label: 'Сервісний інженер №5', width: 150 },
  { key: 'engineer6', label: 'Сервісний інженер №6', width: 150 },
  
  // Фінанси
  { key: 'serviceTotal', label: 'Загальна сума послуги', width: 150 },
  { key: 'workPrice', label: 'Вартість робіт, грн', width: 150 },
  { key: 'paymentType', label: 'Вид оплати', width: 120 },
  { key: 'paymentDate', label: 'Дата оплати', width: 120 },
  { key: 'invoice', label: 'Номер рахунку', width: 120 },
  { key: 'invoiceRecipientDetails', label: 'Реквізити отримувача рахунку', width: 200 },
  
  // Оливи
  { key: 'oilType', label: 'Тип оливи', width: 120 },
  { key: 'oilUsed', label: 'Використано оливи, л', width: 150 },
  { key: 'oilPrice', label: 'Ціна оливи за 1 л, грн', width: 150 },
  { key: 'oilTotal', label: 'Загальна сума за оливу, грн', width: 180 },
  
  // Фільтри масляні
  { key: 'filterName', label: 'Фільтр масл. назва', width: 150 },
  { key: 'filterCount', label: 'Фільтр масл. штук', width: 130 },
  { key: 'filterPrice', label: 'Ціна одного масляного фільтра', width: 200 },
  { key: 'filterSum', label: 'Загальна сума за фільтри масляні', width: 220 },
  
  // Фільтри паливні
  { key: 'fuelFilterName', label: 'Фільтр палив. назва', width: 150 },
  { key: 'fuelFilterCount', label: 'Фільтр палив. штук', width: 130 },
  { key: 'fuelFilterPrice', label: 'Ціна одного паливного фільтра', width: 200 },
  { key: 'fuelFilterSum', label: 'Загальна сума за паливні фільтри', width: 220 },
  
  // Фільтри повітряні
  { key: 'airFilterName', label: 'Фільтр повітряний назва', width: 150 },
  { key: 'airFilterCount', label: 'Фільтр повітряний штук', width: 150 },
  { key: 'airFilterPrice', label: 'Ціна одного повітряного фільтра', width: 200 },
  { key: 'airFilterSum', label: 'Загальна сума за повітряні фільтри', width: 220 },
  
  // Антифриз
  { key: 'antifreezeType', label: 'Антифриз тип', width: 120 },
  { key: 'antifreezeL', label: 'Антифриз, л', width: 100 },
  { key: 'antifreezePrice', label: 'Ціна антифризу', width: 150 },
  { key: 'antifreezeSum', label: 'Загальна сума за антифриз', width: 180 },
  
  // Інші матеріали
  { key: 'otherMaterials', label: 'Опис інших матеріалів', width: 200 },
  { key: 'otherSum', label: 'Загальна ціна інших матеріалів', width: 200 },
  
  // Транспорт
  { key: 'carNumber', label: 'Держномер автотранспорту', width: 150 },
  { key: 'transportKm', label: 'Транспортні витрати, км', width: 150 },
  { key: 'transportSum', label: 'Загальна вартість тр. витрат', width: 200 },
  
  // Витрати
  { key: 'perDiem', label: 'Добові, грн', width: 120 },
  { key: 'living', label: 'Проживання, грн', width: 120 },
  { key: 'otherExp', label: 'Інші витрати, грн', width: 120 },
  { key: 'serviceBonus', label: 'Премія за виконання сервісних робіт, грн', width: 250 },
  
  // Підтвердження зав. складу
  { key: 'approvedByWarehouse', label: 'Підтвердження зав. складу', width: 180 },
  { key: 'warehouseApprovalDate', label: 'Дата підтвердження зав. складу', width: 200 },
  { key: 'warehouseComment', label: 'Опис відмови (зав. склад)', width: 200 },
  
  // Підтвердження бухгалтера
  { key: 'approvedByAccountant', label: 'Підтвердження бухгалтера', width: 180 },
  { key: 'accountantComment', label: 'Опис відмови (бухгалтер)', width: 200 },
  { key: 'accountantComments', label: 'Коментарії бухгалтера', width: 200 },
  
  // Підтвердження регіонального керівника
  { key: 'approvedByRegionalManager', label: 'Підтвердження регіонального керівника', width: 250 },
  { key: 'regionalManagerComment', label: 'Опис відмови (регіональний керівник)', width: 250 },
  
  // Інші поля
  { key: 'comments', label: 'Коментарі', width: 200 },
  { key: 'approvalDate', label: 'Дата затвердження', width: 150 },
  { key: 'bonusApprovalDate', label: 'Дата затвердження премії', width: 180 },
  { key: 'reportMonthYear', label: 'Місяць/рік для звіту', width: 150 },
  { key: 'blockDetail', label: 'Детальний опис блокування заявки', width: 250 },
  { key: 'deletionMarkedByName', label: 'Хто позначив на видалення', width: 180 },
  { key: 'deletionMarkedAt', label: 'Дата помітки видалення', width: 180 },
  
  // Чекбокси
  { key: 'needInvoice', label: 'Потрібен рахунок', width: 120 },
  { key: 'needAct', label: 'Потрібен акт виконаних робіт', width: 200 },
  { key: 'debtStatus', label: 'Заборгованість по Акти виконаних робіт', width: 250 },
  { key: 'debtStatusCheckbox', label: 'Документи в наявності', width: 180 },
  
  // Автоматичні дати
  { key: 'autoCreatedAt', label: 'Авт. створення заявки', width: 180 },
  { key: 'autoCompletedAt', label: 'Авт. виконанно', width: 150 },
  { key: 'autoWarehouseApprovedAt', label: 'Авт. затвердження завскладом', width: 220 },
  { key: 'autoAccountantApprovedAt', label: 'Авт. затвердження бухгалтером', width: 220 },
  { key: 'invoiceRequestDate', label: 'Дата заявки на рахунок', width: 180 },
  { key: 'invoiceUploadDate', label: 'Дата завантаження рахунку', width: 200 },
  
  // Файли
  { key: 'contractFile', label: 'Файл договору', width: 150 },
];

// Колонки за замовчуванням (якщо налаштувань з сервера немає або вони невалідні)
const DEFAULT_VISIBLE_COLUMNS = [
  'requestNumber',
  'requestDate',
  'client',
  'address',
  'equipment',
  'equipmentSerial',
  'work',
  'date',
  'engineer1',
  'engineer2',
  'serviceRegion',
  'status',
  'serviceTotal',
  'paymentDate',
  'invoice',
  'approvedByWarehouse',
  'approvedByAccountant',
  'approvedByRegionalManager'
];

// Функція для перевірки відмови (як в оригінальному проекті)
function isRejected(value) {
  return value === false || value === 'Відмова';
}

// Парсинг дати з фільтра: YYYY-MM-DD (input type="date") та DD.MM.YYYY
const getTaskDateFieldValue = (task, field) => {
  if (field === 'warehouseApprovalDate') {
    return getWarehouseApprovedAt(task);
  }
  return task[field];
};

const getTaskColumnValue = (task, colKey) => {
  if (colKey === 'warehouseApprovalDate') {
    return getWarehouseApprovedAt(task);
  }
  return task[colKey];
};

const getTaskColumnFormatKey = (task, colKey) => {
  if (colKey === 'warehouseApprovalDate' && task.autoWarehouseApprovedAt) {
    return 'autoWarehouseApprovedAt';
  }
  return colKey;
};

function parseFilterDate(val, endOfDay = false) {
  if (!val || typeof val !== 'string') return null;
  const s = val.trim();
  let year, month, day;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmyMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (isoMatch) {
    [, year, month, day] = isoMatch.map(Number);
  } else if (dmyMatch) {
    [, day, month, year] = dmyMatch.map(Number);
  } else {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return endOfDay ? new Date(d.setHours(23, 59, 59, 999)) : d;
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  return endOfDay ? new Date(year, month - 1, day, 23, 59, 59, 999) : date;
}

const ENGINEER_FILTER_KEYS = ['engineer1', 'engineer2', 'engineer3', 'engineer4', 'engineer5', 'engineer6'];

const DATE_FILTER_KEYS = ['requestDate', 'plannedDate', 'date', 'paymentDate', 'autoCreatedAt', 'autoCompletedAt',
  'autoWarehouseApprovedAt', 'autoAccountantApprovedAt', 'invoiceRequestDate',
  'invoiceUploadDate', 'warehouseApprovalDate', 'approvalDate', 'bonusApprovalDate', 'deletionMarkedAt'];

const SELECT_FILTER_KEYS = ['status', 'company', 'paymentType', 'serviceRegion', 'work', 'debtStatus',
  'approvedByWarehouse', 'approvedByAccountant', 'approvedByRegionalManager',
  ...ENGINEER_FILTER_KEYS];

const BOOLEAN_FILTER_KEYS = ['needInvoice', 'needAct', 'debtStatusCheckbox', 'urgentRequest', 'internalWork', 'worksWithoutContract'];

const WORK_FILTER_OPTIONS = [
  '',
  'ТО', 'ТО-1', 'ТО-2', 'ТО-3', 'ТО-4', 'ПНР',
  'Ремонт в цеху', 'Ремонт на місті', 'Діагностика', 'Діагностика+ремонт',
  'Ремонт в цеху (волонтерство)', 'Гарантійний ремонт в цеху', 'Гарантійний ремонт на місті',
  'Предпродажна підготовка', 'Продаж ЗІП', 'Перекомутація',
  'Внутрішні роботи (завантаження)', 'Внутрішні роботи (розвантаження)',
];

const NUMERIC_FILTER_KEYS = new Set([
  'serviceTotal', 'workPrice', 'oilUsed', 'oilPrice', 'oilTotal',
  'filterCount', 'filterPrice', 'filterSum',
  'fuelFilterCount', 'fuelFilterPrice', 'fuelFilterSum',
  'airFilterCount', 'airFilterPrice', 'airFilterSum',
  'antifreezeL', 'antifreezePrice', 'antifreezeSum',
  'otherSum', 'transportKm', 'transportSum',
  'perDiem', 'living', 'otherExp', 'serviceBonus',
]);

function normalizeNumericForFilter(value) {
  return String(value ?? '').replace(/\s/g, '').replace(',', '.').toLowerCase();
}

// Тип фільтра для колонки (чиста функція — поза компонентом, щоб не ламати меморизацію)
function getFilterType(columnKey) {
  if (DATE_FILTER_KEYS.includes(columnKey)) return 'date';
  if (SELECT_FILTER_KEYS.includes(columnKey) || BOOLEAN_FILTER_KEYS.includes(columnKey)) return 'select';
  return 'text';
}

// Опції для select-фільтра (чиста функція)
function getFilterOptions(columnKey) {
  switch (columnKey) {
    case 'status':
      return ['', 'Заявка', 'В роботі', 'Виконано', 'Заблоковано'];
    case 'company':
      return ['', 'ДТС', 'Дарекс Енерго', 'інша'];
    case 'paymentType':
      return ['', 'не вибрано', 'Безготівка', 'Готівка', 'На карту', 'Інше'];
    case 'serviceRegion':
      return ['', 'Київський', 'Одеський', 'Львівський', 'Дніпровський', 'Хмельницький', 'Кропивницький', 'Україна'];
    case 'work':
      return WORK_FILTER_OPTIONS;
    case 'debtStatus':
      return ['', 'Заборгованість', 'Документи в наявності'];
    case 'approvedByWarehouse':
    case 'approvedByAccountant':
    case 'approvedByRegionalManager':
      return ['', 'На розгляді', 'Підтверджено', 'Відмова'];
    default:
      if (BOOLEAN_FILTER_KEYS.includes(columnKey)) return ['', 'Так', 'Ні'];
      return [];
  }
}

function taskMatchesBooleanFilter(taskValue, filterValue) {
  const truthy = taskValue === true || taskValue === 'true' || taskValue === 'Так' || taskValue === 1 || taskValue === '1';
  if (filterValue === 'так') return truthy;
  if (filterValue === 'ні') return !truthy;
  return String(taskValue ?? '').toLowerCase() === filterValue;
}

/** Кожен заповнений фільтр по колонках інженера №1…№6: збіг шукається в будь-якому з полів engineer1…engineer6; кілька фільтрів поєднуються через AND. */
function taskMatchesEngineerColumnFilters(task, engineerEntries, getFilterTypeForKey) {
  for (const [key, rawValue] of engineerEntries) {
    const filterValue = String(rawValue).toLowerCase().trim();
    const filterType = getFilterTypeForKey(key);
    const ok = ENGINEER_FILTER_KEYS.some((slotKey) => {
      let taskValue = task[slotKey];
      if (taskValue === null || taskValue === undefined) taskValue = '';
      if (filterType === 'select') {
        return String(taskValue).toLowerCase() === filterValue;
      }
      return String(taskValue).toLowerCase().includes(filterValue);
    });
    if (!ok) return false;
  }
  return true;
}

function formatServiceTotalSum(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function sumServiceTotals(tasks) {
  return (tasks || []).reduce((acc, task) => acc + parseNumber(task?.serviceTotal), 0);
}

const BOARD_STATUS_ORDER = ['Заявка', 'В роботі', 'Виконано', 'Заблоковано'];

function statusSlug(status) {
  return String(status || 'none').toLowerCase().replace(/\s+/g, '-');
}

function loadFilterPresets(area, login) {
  try {
    const scoped = login ? localStorage.getItem(`taskTable_filterPresets_${login}_${area}`) : null;
    const raw = scoped || localStorage.getItem(`taskTable_filterPresets_${area}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistFilterPresets(area, presets, login) {
  const payload = JSON.stringify(presets);
  if (login) localStorage.setItem(`taskTable_filterPresets_${login}_${area}`, payload);
  localStorage.setItem(`taskTable_filterPresets_${area}`, payload);
}

async function persistFilterPresetsRemote(area, presets, login) {
  persistFilterPresets(area, presets, login);
  const token = localStorage.getItem('token');
  const res = await authFetch(`${API_BASE_URL}/users/me/filter-presets/${encodeURIComponent(area)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ presets }),
  });
  if (!res.ok) throw new Error('Не вдалося зберегти вигляд на сервері');
  return res.json();
}

function getColumnFilterChipLabel(key) {
  if (key.endsWith('From')) {
    const base = ALL_COLUMNS.find((col) => col.key === key.slice(0, -4));
    return base ? `${base.label} від` : key;
  }
  if (key.endsWith('To')) {
    const base = ALL_COLUMNS.find((col) => col.key === key.slice(0, -2));
    return base ? `${base.label} до` : key;
  }
  return ALL_COLUMNS.find((col) => col.key === key)?.label || key;
}

function collectTaskEngineers(task) {
  return [task?.engineer1, task?.engineer2, task?.engineer3, task?.engineer4, task?.engineer5, task?.engineer6]
    .map((name) => String(name || '').trim())
    .filter(Boolean);
}

function TaskTable({ user, status, onColumnSettingsClick, showRejectedApprovals = false, showRejectedInvoices = false, showAllInvoices = false, onRowClick, onApprove, showApproveButtons = false, approveRole = '', onUploadClick = null, onRejectInvoice = null, columnsArea = 'service', onViewClick = null, onCreateFromTask = null, onTasksLoaded = null, refreshTrigger = undefined, compactVariant = false }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [onecStatusByRequest, setOnecStatusByRequest] = useState({});
  const [sortField, setSortField] = useState('requestDate');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Зберігаємо фільтри в localStorage з ключем на основі columnsArea
  const filtersStorageKey = useMemo(() => `taskTable_filters_${columnsArea}`, [columnsArea]);
  const filterStorageKey = useMemo(() => `taskTable_filter_${columnsArea}`, [columnsArea]);
  
  // Завантажуємо збережені фільтри при ініціалізації
  const [columnFilters, setColumnFilters] = useState(() => {
    try {
      const key = `taskTable_filters_${columnsArea}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  
  // Завантажуємо збережений глобальний фільтр при ініціалізації
  const [filter, setFilter] = useState(() => {
    try {
      const key = `taskTable_filter_${columnsArea}`;
      const savedFilter = localStorage.getItem(key);
      return savedFilter || '';
    } catch {
      return '';
    }
  });
  
  const [columnSettings, setColumnSettings] = useState({ visible: [], order: [], widths: {} });
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [restoringTaskId, setRestoringTaskId] = useState(null);
  const [takingTaskId, setTakingTaskId] = useState(null);
  const abortControllerRef = useRef(null);
  const fetchIdRef = useRef(0);
  
  // Пагінація для оператора та панелей бухгалтера (швидше завантаження)
  const enablePagination = ['operator', 'accountant-invoice', 'accountant-approval'].includes(columnsArea);
  const showServiceTotalSum = columnsArea === 'accountant-invoice' || columnsArea === 'accountant-approval';
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [serviceTotalSum, setServiceTotalSum] = useState(null);
  const PAGE_SIZE = 30;

  // Дебаунс фільтрації: 2 с для серверних запитів (пагінація), 300 мс для клієнтської
  // фільтрації (щоб не перераховувати весь список і не перемальовувати таблицю на кожен символ).
  const [debouncedFilter, setDebouncedFilter] = useState(filter);
  const [debouncedColumnFilters, setDebouncedColumnFilters] = useState(columnFilters);
  const debounceFirstRun = useRef(true);
  useEffect(() => {
    // Перший запуск (і зміна панелі) — застосовуємо одразу, щоб збережені фільтри не «мигали»
    if (debounceFirstRun.current) {
      debounceFirstRun.current = false;
      setDebouncedFilter(filter);
      setDebouncedColumnFilters(columnFilters);
      return;
    }
    const delay = enablePagination ? 2000 : 300;
    const tid = setTimeout(() => {
      setDebouncedFilter(filter);
      setDebouncedColumnFilters(columnFilters);
    }, delay);
    return () => clearTimeout(tid);
  }, [filter, columnFilters, enablePagination]);

  const [showFilters, setShowFilters] = useState(!compactVariant);
  const [filterPresets, setFilterPresets] = useState(() => loadFilterPresets(columnsArea, user?.login));
  const [presetName, setPresetName] = useState('');
  const [activePresetId, setActivePresetId] = useState('');
  const [listViewMode, setListViewMode] = useState(() => {
    if (!compactVariant) return 'table';
    try {
      return localStorage.getItem(`taskTable_viewMode_${columnsArea}`) === 'table' ? 'table' : 'board';
    } catch {
      return 'board';
    }
  });
  const canShowViewButton = typeof onViewClick === 'function';

  // Зберігаємо фільтри в localStorage при зміні
  useEffect(() => {
    try {
      localStorage.setItem(filtersStorageKey, JSON.stringify(columnFilters));
    } catch (error) {
      console.error('Помилка збереження фільтрів:', error);
    }
  }, [columnFilters, filtersStorageKey]);
  
  // Зберігаємо глобальний фільтр в localStorage при зміні
  useEffect(() => {
    try {
      localStorage.setItem(filterStorageKey, filter);
    } catch (error) {
      console.error('Помилка збереження глобального фільтра:', error);
    }
  }, [filter, filterStorageKey]);
  
  // Оновлюємо фільтри при зміні columnsArea (коли користувач переходить між панелями)
  useEffect(() => {
    // Нова панель — застосувати її збережені фільтри одразу, без дебаунсу
    debounceFirstRun.current = true;
    try {
      const newFiltersKey = `taskTable_filters_${columnsArea}`;
      const newFilterKey = `taskTable_filter_${columnsArea}`;
      const savedFilters = localStorage.getItem(newFiltersKey);
      const savedFilter = localStorage.getItem(newFilterKey);
      
      if (savedFilters) {
        setColumnFilters(JSON.parse(savedFilters));
      } else {
        setColumnFilters({});
      }
      
      if (savedFilter) {
        setFilter(savedFilter);
      } else {
        setFilter('');
      }
      setFilterPresets(loadFilterPresets(columnsArea, user?.login));
      setActivePresetId('');
      setPresetName('');
    } catch (error) {
      console.error('Помилка завантаження фільтрів при зміні панелі:', error);
    }
  }, [columnsArea, user?.login]);

  useEffect(() => {
    if (!compactVariant || !user?.login) return undefined;
    let cancelled = false;
    const token = localStorage.getItem('token');
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/users/me/filter-presets/${encodeURIComponent(columnsArea)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const remote = await res.json();
        if (cancelled) return;
        if (Array.isArray(remote) && remote.length > 0) {
          setFilterPresets(remote);
          persistFilterPresets(columnsArea, remote, user.login);
          return;
        }
        const local = loadFilterPresets(columnsArea, user.login);
        if (local.length) {
          setFilterPresets(local);
          await persistFilterPresetsRemote(columnsArea, local, user.login);
        } else if (!cancelled) {
          setFilterPresets([]);
        }
      } catch {
        if (!cancelled) setFilterPresets(loadFilterPresets(columnsArea, user.login));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compactVariant, user?.login, columnsArea]);

  useEffect(() => {
    if (!compactVariant) {
      setShowFilters(true);
      setListViewMode('table');
      return;
    }
    setShowFilters(false);
    try {
      setListViewMode(localStorage.getItem(`taskTable_viewMode_${columnsArea}`) === 'table' ? 'table' : 'board');
    } catch {
      setListViewMode('board');
    }
  }, [compactVariant]);

  useEffect(() => {
    if (!compactVariant) return;
    try {
      localStorage.setItem(`taskTable_viewMode_${columnsArea}`, listViewMode);
    } catch (error) {
      console.error('Помилка збереження виду списку:', error);
    }
  }, [listViewMode, columnsArea, compactVariant]);

  // При зміні фільтрів або статусу (вкладки) — скидаємо сторінку на 1 (для пагінації)
  useEffect(() => {
    if (enablePagination) setPage(1);
  }, [debouncedFilter, debouncedColumnFilters, enablePagination, status]);

  // Обробник зміни фільтра колонки
  const handleColumnFilterChange = (columnKey, value) => {
    setColumnFilters(prev => {
      const newFilters = {
        ...prev,
        [columnKey]: value
      };
      return newFilters;
    });
  };

  // Очистити всі фільтри
  const clearAllFilters = () => {
    setColumnFilters({});
    setFilter('');
    setActivePresetId('');
    try {
      localStorage.removeItem(filtersStorageKey);
      localStorage.removeItem(filterStorageKey);
    } catch (error) {
      console.error('Помилка видалення фільтрів:', error);
    }
  };

  const saveCurrentFilterPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = [
      ...filterPresets.filter((preset) => preset.name !== name),
      {
        id: `p_${Date.now()}`,
        name,
        filter,
        columnFilters: Object.fromEntries(
          Object.entries(columnFilters).filter(([, value]) => value && String(value).trim() !== '')
        ),
      },
    ].slice(-12);
    setFilterPresets(next);
    setActivePresetId(next[next.length - 1].id);
    setPresetName('');
    persistFilterPresetsRemote(columnsArea, next, user?.login).catch((error) => {
      console.error('Помилка збереження вигляду фільтра:', error);
      alert('Не вдалося зберегти вигляд на сервері. Спробуйте ще раз.');
    });
  };

  const applyFilterPreset = (id) => {
    const preset = filterPresets.find((item) => item.id === id);
    if (!preset) {
      setActivePresetId('');
      return;
    }
    setFilter(preset.filter || '');
    setColumnFilters(preset.columnFilters && typeof preset.columnFilters === 'object' ? preset.columnFilters : {});
    setActivePresetId(id);
  };

  const deleteActiveFilterPreset = () => {
    if (!activePresetId) return;
    const next = filterPresets.filter((preset) => preset.id !== activePresetId);
    setFilterPresets(next);
    setActivePresetId('');
    persistFilterPresetsRemote(columnsArea, next, user?.login).catch((error) => {
      console.error('Помилка видалення вигляду фільтра:', error);
      alert('Не вдалося видалити вигляд на сервері. Спробуйте ще раз.');
    });
  };

  const removeFilterChip = (key) => {
    if (key === '__search') {
      setFilter('');
      return;
    }
    handleColumnFilterChange(key, '');
  };

  // Перевірка чи є активні фільтри
  const hasActiveFilters = Object.values(columnFilters).some(v => v && v.trim() !== '') || filter.trim() !== '';
  const activeFilterChips = [
    ...(filter.trim() ? [{ key: '__search', label: `Пошук: ${filter.trim()}` }] : []),
    ...Object.entries(columnFilters)
      .filter(([, value]) => value && String(value).trim() !== '')
      .map(([key, value]) => ({ key, label: `${getColumnFilterChipLabel(key)}: ${value}` })),
  ];

  const isAdminUser = ['admin', 'administrator'].includes(user?.role || '');

  const isTaskMarkedForDeletion = (task) =>
    !!(task && (task.markedForDeletion === true || task.markedForDeletion === 'true' || task.markedForDeletion === 1));

  // Функція перевірки права на видалення заявки
  const canDeleteTask = () => {
    const userRole = user?.role || '';
    
    // Для вкладок "Невиконані" та "Очікують підтвердження"
    if (status === 'notDone' || status === 'newRequests' || status === 'inWork' || status === 'pending') {
      return ['regkerivn', 'admin', 'administrator'].includes(userRole);
    }
    
    // Для вкладок "Підтверджені бухгалтером" та "Заблоковані"
    if (status === 'done' || status === 'blocked') {
      return ['admin', 'administrator'].includes(userRole);
    }
    
    return false;
  };

  const canRestoreDeletedTask = (task) => isAdminUser && isTaskMarkedForDeletion(task);

  const postTaskEventLog = async (token, payload) => {
    try {
      await fetch(`${API_BASE_URL}/event-log`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (logErr) {
      console.error('Помилка логування:', logErr);
    }
  };

  // Видалення: адміністратор — з системи; інші — у «Заблоковані» з поміткою видалення
  const handleDeleteTask = async (task, e) => {
    e.stopPropagation();
    
    const taskId = task._id || task.id;
    const taskNumber = task.requestNumber || taskId;
    const confirmMessage = isAdminUser
      ? `Ви впевнені, що хочете остаточно видалити заявку ${taskNumber} з системи?\n\nЦю дію неможливо відмінити!`
      : `Заявку ${taskNumber} буде переведено в «Заблоковані» з поміткою видалення.\nОстаточно видалити з системи може лише адміністратор.\n\nПродовжити?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setDeletingTaskId(taskId);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const wasBlocked = result.action === 'blocked';
        await postTaskEventLog(token, {
          userId: currentUser._id || currentUser.id,
          userName: currentUser.name || currentUser.login,
          userRole: currentUser.role,
          action: wasBlocked ? 'soft_delete' : 'delete',
          entityType: 'task',
          entityId: taskId,
          description: wasBlocked
            ? `Помітка видалення заявки ${taskNumber} (переведено в Заблоковані)`
            : `Видалення заявки ${taskNumber}`,
          details: {
            requestNumber: taskNumber,
            status: task.status,
            client: task.client,
            action: result.action || 'deleted'
          }
        });
        
        setTasks(prev => prev.filter(t => (t._id || t.id) !== taskId));
        clearTasksCache();
      } else {
        const errorData = await response.json();
        alert(`Помилка видалення: ${errorData.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      console.error('Помилка видалення заявки:', error);
      alert('Помилка видалення заявки');
    } finally {
      setDeletingTaskId(null);
    }
  };

  const handleTakeIntoWork = async (task, e) => {
    e.stopPropagation();
    if (task.status !== 'Заявка') return;

    const taskId = task._id || task.id;
    const taskNumber = task.requestNumber || taskId;
    setTakingTaskId(taskId);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'В роботі' })
      });

      if (response.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        await postTaskEventLog(token, {
          userId: currentUser._id || currentUser.id,
          userName: currentUser.name || currentUser.login,
          userRole: currentUser.role,
          action: 'status_change',
          entityType: 'task',
          entityId: taskId,
          description: `Заявку ${taskNumber} взято в роботу`,
          details: {
            requestNumber: taskNumber,
            fromStatus: task.status,
            toStatus: 'В роботі',
            client: task.client
          }
        });
        setTasks((prev) => prev.filter((t) => (t._id || t.id) !== taskId));
        clearTasksCache();
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Не вдалося взяти заявку в роботу: ${errorData.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      console.error('Помилка взяття заявки в роботу:', error);
      alert('Не вдалося взяти заявку в роботу');
    } finally {
      setTakingTaskId(null);
    }
  };

  const handleRestoreDeletedTask = async (task, e) => {
    e.stopPropagation();

    const taskId = task._id || task.id;
    const taskNumber = task.requestNumber || taskId;
    if (!window.confirm(`Відновити заявку ${taskNumber} в роботу?`)) {
      return;
    }

    setRestoringTaskId(taskId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/restore-from-deletion`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        await postTaskEventLog(token, {
          userId: currentUser._id || currentUser.id,
          userName: currentUser.name || currentUser.login,
          userRole: currentUser.role,
          action: 'restore',
          entityType: 'task',
          entityId: taskId,
          description: `Відновлення заявки ${taskNumber} в роботу`,
          details: {
            requestNumber: taskNumber,
            restoredStatus: result.task?.status,
            client: task.client
          }
        });
        setTasks(prev => prev.filter(t => (t._id || t.id) !== taskId));
        clearTasksCache();
      } else {
        const errorData = await response.json();
        alert(`Помилка відновлення: ${errorData.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      console.error('Помилка відновлення заявки:', error);
      alert('Помилка відновлення заявки');
    } finally {
      setRestoringTaskId(null);
    }
  };

  // Завантаження налаштувань колонок (як в оригінальному проекті)
  useEffect(() => {
    const loadColumnSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        // Використовуємо columnsArea для завантаження налаштувань для конкретної панелі
        const response = await fetch(
          `${API_BASE_URL}/users/${user.login}/columns-settings/${columnsArea}`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );
        
        if (response.ok) {
          const settings = await response.json();

          // Перевіряємо, чи всі ключі з налаштувань існують у поточних колонках
          // Як в оригінальному проекті
          if (settings.visible && 
              settings.visible.length > 0 && 
              settings.visible.every(k => ALL_COLUMNS.some(c => c.key === k))) {
            // Встановлюємо налаштування
            // Переконуємося, що ширини - це числа
            const normalizedWidths = {};
            if (settings.widths && typeof settings.widths === 'object') {
              Object.keys(settings.widths).forEach(key => {
                const width = settings.widths[key];
                normalizedWidths[key] = typeof width === 'number' ? width : parseInt(width) || 150;
              });
            }

            setColumnSettings({
              visible: settings.visible,
              order: settings.order && settings.order.length > 0 
                ? settings.order 
                : settings.visible,
              widths: normalizedWidths
            });
          } else {
            // Якщо налаштування невалідні або порожні, встановлюємо стандартні
            setColumnSettings({
              visible: DEFAULT_VISIBLE_COLUMNS,
              order: DEFAULT_VISIBLE_COLUMNS,
              widths: {}
            });
          }
        } else {
          // Використовуємо основні колонки за замовчуванням
          setColumnSettings({
            visible: DEFAULT_VISIBLE_COLUMNS,
            order: DEFAULT_VISIBLE_COLUMNS,
            widths: {}
          });
        }
      } catch (err) {
        console.error('Помилка завантаження налаштувань колонок:', err);
        setColumnSettings({
          visible: DEFAULT_VISIBLE_COLUMNS,
          order: DEFAULT_VISIBLE_COLUMNS,
          widths: {}
        });
      }
    };

    if (user?.login) {
      loadColumnSettings();
    }
  }, [user, columnsArea]);

  // Завантаження завдань (з кешем 90 с — менше навантаження на сервер при перемиканні вкладок)
  // Для оператора та бухгалтера: пагінація (page, limit), фільтри та пошук на сервері
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    const currentFetchId = ++fetchIdRef.current;

    const loadTasks = async () => {
      setError(null);

      const token = localStorage.getItem('token');
      let url;

      if (showRejectedApprovals || showRejectedInvoices) {
        url = `${API_BASE_URL}/tasks/filter?statuses=notDone,pending&region=${user?.region || ''}`;
      } else if (status) {
        url = `${API_BASE_URL}/tasks/filter?status=${status}&region=${user?.region || ''}`;
        if (status === 'accountantInvoiceRequests') {
          url += `&showAllInvoices=${showAllInvoices}`;
        }
        // Пагінація тільки для оператора (з затримкою debouncedFilter)
        if (enablePagination) {
          url += `&page=${page}&limit=${PAGE_SIZE}&sortField=${sortField}&sortDirection=${sortDirection}`;
          if (debouncedFilter?.trim()) url += `&filter=${encodeURIComponent(debouncedFilter.trim())}`;
          if (Object.keys(debouncedColumnFilters).some(k => debouncedColumnFilters[k]?.trim?.())) {
            url += `&columnFilters=${encodeURIComponent(JSON.stringify(debouncedColumnFilters))}`;
          }
        }
      } else {
        url = `${API_BASE_URL}/tasks?region=${user?.region || ''}`;
      }

      const useCache = !enablePagination && refreshTrigger === undefined;
      const cached = useCache ? getCachedTasks(url) : null;
      if (cached) {
        if (currentFetchId !== fetchIdRef.current) return;
        setTasks(cached);
        setLoading(false);
        if (onTasksLoaded) onTasksLoaded(cached);
        try {
          const response = await authFetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal
          });
          if (currentFetchId !== fetchIdRef.current) return;
          if (response.status === 401) return;
          if (response.ok) {
            const data = await response.json();
            setTasks(data);
            setCachedTasks(url, data);
            if (onTasksLoaded) onTasksLoaded(data);
          }
        } catch (e) {
          if (e?.name === 'AbortError') return;
        }
        return;
      }

      setLoading(true);
      try {
        const response = await authFetch(url, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal
        });

        if (currentFetchId !== fetchIdRef.current) return;

        if (response.status === 401) {
          return;
        }

        if (!response.ok) {
          throw new Error('Помилка завантаження завдань');
        }

        const data = await response.json();
        if (currentFetchId !== fetchIdRef.current) return;

        if (enablePagination && data && typeof data === 'object' && Array.isArray(data.tasks)) {
          setTasks(data.tasks);
          const loadedTotal = data.total ?? 0;
          setTotal(loadedTotal);
          if (showServiceTotalSum) {
            const hasAllFilteredTasks = loadedTotal > 0 && data.tasks.length >= loadedTotal;
            setServiceTotalSum(
              hasAllFilteredTasks
                ? sumServiceTotals(data.tasks)
                : (data.serviceTotalSum ?? 0)
            );
          } else {
            setServiceTotalSum(null);
          }
          if (onTasksLoaded) onTasksLoaded(data.tasks);
        } else {
          setTasks(Array.isArray(data) ? data : []);
          setTotal(Array.isArray(data) ? data.length : 0);
          setServiceTotalSum(null);
          setCachedTasks(url, Array.isArray(data) ? data : []);
          if (onTasksLoaded) onTasksLoaded(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setError(err.message);
        console.error('Помилка завантаження завдань:', err);
      } finally {
        if (currentFetchId === fetchIdRef.current) {
          setLoading(false);
        }
      }
    };

    if (user) {
      loadTasks();
    }
    return () => abortControllerRef.current?.abort();
  }, [user, status, showRejectedApprovals, showRejectedInvoices, showAllInvoices, onTasksLoaded, enablePagination, page, debouncedFilter, debouncedColumnFilters, sortField, sortDirection, refreshTrigger]);

  useEffect(() => {
    if (columnsArea !== 'warehouse' && columnsArea !== 'accountant-approval') {
      setOnecStatusByRequest({});
      return;
    }
    const numbers = [...new Set(tasks.map((t) => String(t.requestNumber || '').trim()).filter(Boolean))];
    if (!numbers.length) {
      setOnecStatusByRequest({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const r = await fetch(`${API_BASE_URL}/onec/movements/status-by-requests`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requestNumbers: numbers }),
        });
        const data = await r.json().catch(() => ({}));
        if (!cancelled && r.ok && data.statuses) setOnecStatusByRequest(data.statuses);
      } catch (_) {
        if (!cancelled) setOnecStatusByRequest({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tasks, columnsArea]);

  // Відсортовані та відфільтровані завдання
  // Для оператора з пагінацією: сервер вже відфільтрував і відсортував — використовуємо tasks як є
  const filteredAndSortedTasks = useMemo(() => {
    if (enablePagination) return [...tasks];
    let result = [...tasks];

    // Фільтрація по глобальному тексту
    if (debouncedFilter) {
      const lowerFilter = debouncedFilter.toLowerCase();
      result = result.filter(task => {
        return Object.values(task).some(value => 
          value && value.toString().toLowerCase().includes(lowerFilter)
        );
      });
    }

    // Фільтрація по колонках
    const engineerFilterEntries = Object.entries(debouncedColumnFilters).filter(
      ([k, v]) => ENGINEER_FILTER_KEYS.includes(k) && v && String(v).trim() !== ''
    );

    Object.entries(debouncedColumnFilters).forEach(([key, value]) => {
      if (!value || value.trim() === '') return;
      if (ENGINEER_FILTER_KEYS.includes(key)) return;

      const filterValue = value.toLowerCase().trim();
      
      // Обробка дат з діапазоном
      if (key.endsWith('From')) {
        const field = key.replace('From', '');
        const filterDate = parseFilterDate(value);
        if (filterDate) {
          result = result.filter(task => {
            const fieldValue = getTaskDateFieldValue(task, field);
            if (!fieldValue) return false;
            const taskDate = new Date(fieldValue);
            return !isNaN(taskDate.getTime()) && taskDate >= filterDate;
          });
        }
        return;
      }
      
      if (key.endsWith('To')) {
        const field = key.replace('To', '');
        const filterDate = parseFilterDate(value, true);
        if (filterDate) {
          result = result.filter(task => {
            const fieldValue = getTaskDateFieldValue(task, field);
            if (!fieldValue) return false;
            const taskDate = new Date(fieldValue);
            return !isNaN(taskDate.getTime()) && taskDate <= filterDate;
          });
        }
        return;
      }
      
      // Звичайна фільтрація для інших полів
      // Для select полів використовуємо точне порівняння, для текстових - includes
      const filterType = getFilterType(key);
      result = result.filter(task => {
        let taskValue = task[key];
        if (taskValue === null || taskValue === undefined) taskValue = '';

        if (BOOLEAN_FILTER_KEYS.includes(key)) {
          return taskMatchesBooleanFilter(taskValue, filterValue);
        }

        if (filterType === 'select') {
          return String(taskValue).toLowerCase() === filterValue;
        }

        if (NUMERIC_FILTER_KEYS.has(key)) {
          const taskValueStr = normalizeNumericForFilter(taskValue);
          const filterNorm = normalizeNumericForFilter(filterValue);
          return taskValueStr.includes(filterNorm);
        }

        const taskValueStr = String(taskValue).toLowerCase();
        return taskValueStr.includes(filterValue);
      });
    });

    if (engineerFilterEntries.length > 0) {
      result = result.filter((task) => taskMatchesEngineerColumnFilters(task, engineerFilterEntries, getFilterType));
    }

    // Фільтрація відхилених заявок та рахунків (як в оригінальному проекті)
    if (showRejectedApprovals || showRejectedInvoices) {
      result = result.filter(task => {
        // Перевірка відхилених заявок на затвердженні
        // Показувати тільки ті, що ще в статусі "В роботі" (не надіслані повторно)
        const isRejectedApproval = showRejectedApprovals && 
          task.status === 'В роботі' && (
            isRejected(task.approvedByWarehouse) ||
            isRejected(task.approvedByAccountant) ||
            isRejected(task.approvedByRegionalManager)
          );
        
        // Перевірка відхилених рахунків
        // Тільки якщо НЕМАЄ активного запиту (тобто не подано повторно)
        const isRejectedInvoice = showRejectedInvoices && task.invoiceRejectionReason && !task.invoiceRequestId;
        
        // Якщо обидва чекбокси увімкнені - показуємо або відхилені заявки, або відхилені рахунки
        if (showRejectedApprovals && showRejectedInvoices) {
          return isRejectedApproval || isRejectedInvoice;
        }
        // Якщо тільки відхилені заявки - показуємо тільки їх
        else if (showRejectedApprovals) {
          return isRejectedApproval;
        }
        // Якщо тільки відхилені рахунки - показуємо тільки їх
        else if (showRejectedInvoices) {
          return isRejectedInvoice;
        }
        
        return true;
      });
    }

    // Сортування: спочатку термінові заявки, потім решта (як в оригінальному проекті)
    result.sort((a, b) => {
      // Для панелі бухгалтера на затвердженні - заявки з відмовою бухгалтера першими
      if (approveRole === 'accountant') {
        const aIsRejectedByAccountant = a.approvedByAccountant === 'Відмова';
        const bIsRejectedByAccountant = b.approvedByAccountant === 'Відмова';
        
        if (aIsRejectedByAccountant && !bIsRejectedByAccountant) return -1;
        if (!aIsRejectedByAccountant && bIsRejectedByAccountant) return 1;
      }
      
      // Термінові заявки завжди перші (тільки для статусів "Заявка" та "В роботі")
      const aIsUrgent = a.urgentRequest && (a.status === 'Заявка' || a.status === 'В роботі');
      const bIsUrgent = b.urgentRequest && (b.status === 'Заявка' || b.status === 'В роботі');
      
      if (aIsUrgent && !bIsUrgent) return -1;
      if (!aIsUrgent && bIsUrgent) return 1;
      
      // Якщо обидві термінові або обидві не термінові - сортуємо по вибраному полю
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (NUMERIC_FILTER_KEYS.has(sortField)) {
        const aNum = parseNumber(aVal);
        const bNum = parseNumber(bVal);
        const comparison = aNum > bNum ? 1 : -1;
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      const comparison = aVal > bVal ? 1 : -1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [tasks, debouncedFilter, debouncedColumnFilters, sortField, sortDirection, showRejectedApprovals, showRejectedInvoices, approveRole, enablePagination]);

  const taskBoards = useMemo(() => {
    const groups = new Map();
    for (const task of filteredAndSortedTasks) {
      const key = task.status || 'Без статусу';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    }
    const keys = [
      ...BOARD_STATUS_ORDER.filter((statusName) => groups.has(statusName)),
      ...[...groups.keys()].filter((statusName) => !BOARD_STATUS_ORDER.includes(statusName)),
    ];
    return keys.map((statusName) => ({ status: statusName, tasks: groups.get(statusName) || [] }));
  }, [filteredAndSortedTasks]);

  // Відображені колонки в правильному порядку
  const displayedColumns = useMemo(() => {
    if (!columnSettings.visible || columnSettings.visible.length === 0) {
      return ALL_COLUMNS;
    }

    // Використовуємо порядок з налаштувань, якщо він є
    const order = columnSettings.order && columnSettings.order.length > 0
      ? columnSettings.order
      : columnSettings.visible;

    return order
      .filter(key => columnSettings.visible.includes(key))
      .map(key => {
        const col = ALL_COLUMNS.find(c => c.key === key);
        return col || { key, label: key, width: 150 };
      });
  }, [columnSettings]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    if (enablePagination) setPage(1);
  };

  // Функція для визначення статусу рахунку (як в оригінальному проекті)
  const getInvoiceStatus = (task) => {
    // Перевіряємо, чи створений запит на рахунок
    const hasInvoiceRequest = task.invoiceRequested === true || 
                             task.invoiceRequestId || 
                             task.invoiceStatus;
    
    // Якщо немає запиту на рахунок
    if (!hasInvoiceRequest) {
      return { status: 'not_requested', color: '#dc3545', label: 'Не подана' };
    }
    
    // Якщо є файл рахунку, показуємо "Виконано"
    if (task.invoiceFile && task.invoiceFile.trim() !== '') {
      return { status: 'completed', color: '#28a745', label: 'Виконано' };
    }
    
    // Перевіряємо статус запиту на рахунок
    if (task.invoiceStatus) {
      switch (task.invoiceStatus) {
        case 'completed':
          return { status: 'completed', color: '#28a745', label: 'Виконано' };
        case 'rejected':
          return { status: 'rejected', color: '#dc3545', label: 'Відхилена' };
        case 'processing':
          return { status: 'processing', color: '#ffc107', label: 'В обробці' };
        case 'pending':
        default:
          return { status: 'pending', color: '#ffc107', label: 'Очікує' };
      }
    }
    
    // Якщо є запит, але немає статусу - вважаємо очікуючим
    return { status: 'pending', color: '#ffc107', label: 'Очікує' };
  };

  // Функція для визначення CSS класу рядка (як в оригінальному проекті)
  const getRowClass = (task) => {
    // Для панелі бухгалтера на затвердженні - підсвічуємо відхилені бухгалтером
    if (approveRole === 'accountant' && task.approvedByAccountant === 'Відмова') {
      return 'accountant-rejected';
    }
    
    // Перевірка відхилених рахунків (фіолетовий) - найвищий пріоритет
    // Але тільки якщо НЕМАЄ активного запиту на рахунок (invoiceRequestId)
    // Якщо є invoiceRequestId - значить подано новий запит після відхилення
    if (task.invoiceRejectionReason && !task.invoiceRequestId) {
      return 'invoice-rejected';
    }
    
    // Перевірка термінових заявок (градієнт веселки) - перед відхиленими заявками
    if (task.urgentRequest && (task.status === 'Заявка' || task.status === 'В роботі')) {
      return 'urgent-request';
    }
    
    // Перевірка відхилених заявок (червоний)
    if (isRejected(task.approvedByWarehouse) || 
        isRejected(task.approvedByAccountant) || 
        isRejected(task.approvedByRegionalManager)) {
      return 'rejected';
    }
    
    return '';
  };

  const formatValue = (value, key) => {
    if (value == null || value === '') return '-';
    
    // Чекбокси
    if (typeof value === 'boolean') {
      return value ? 'Так' : 'Ні';
    }
    
    // Дата з часом (поля *At та datetime — перевіряємо раніше за date-only)
    if (key && (key.endsWith('At') || key === 'invoiceRequestDate' || key === 'invoiceUploadDate')) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${day}.${month}.${year} ${hours}:${minutes}`;
        }
      } catch (e) {
        // Якщо не вдалося розпарсити, повертаємо як є
      }
    }

    // Дати без часу
    if (key && (key.includes('Date') || key === 'date' || key === 'requestDate' || key === 'paymentDate')) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('uk-UA');
        }
      } catch (e) {
        // Якщо не вдалося розпарсити як дату, повертаємо як є
      }
    }
    
    // Масиви
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    // Об'єкти (наприклад, companyDetails)
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return String(value);
      }
    }
    
    return value.toString();
  };

  // Функція для експорту в Excel (при пагінації — завантажує всі відфільтровані дані)
  const handleExportToExcel = async () => {
    let tasksToExport = filteredAndSortedTasks;
    if (enablePagination && total > filteredAndSortedTasks.length) {
      try {
        const token = localStorage.getItem('token');
        let url;
        if (showRejectedApprovals || showRejectedInvoices) {
          url = `${API_BASE_URL}/tasks/filter?statuses=notDone,pending&region=${user?.region || ''}&sortField=${sortField}&sortDirection=${sortDirection}`;
          if (debouncedFilter?.trim()) url += `&filter=${encodeURIComponent(debouncedFilter.trim())}`;
          if (Object.keys(debouncedColumnFilters).some(k => debouncedColumnFilters[k]?.trim?.())) {
            url += `&columnFilters=${encodeURIComponent(JSON.stringify(debouncedColumnFilters))}`;
          }
        } else if (status) {
          url = `${API_BASE_URL}/tasks/filter?status=${status}&region=${user?.region || ''}`;
          if (status === 'accountantInvoiceRequests') url += `&showAllInvoices=${showAllInvoices}`;
          url += `&sortField=${sortField}&sortDirection=${sortDirection}`;
          if (debouncedFilter?.trim()) url += `&filter=${encodeURIComponent(debouncedFilter.trim())}`;
          if (Object.keys(debouncedColumnFilters).some(k => debouncedColumnFilters[k]?.trim?.())) {
            url += `&columnFilters=${encodeURIComponent(JSON.stringify(debouncedColumnFilters))}`;
          }
        } else {
          url = `${API_BASE_URL}/tasks?region=${user?.region || ''}`;
        }
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('Помилка завантаження');
        const data = await res.json();
        tasksToExport = Array.isArray(data) ? data : (data?.tasks || []);
      } catch (e) {
        console.error('Помилка завантаження для експорту:', e);
        alert('Не вдалося завантажити всі дані для експорту. Експортуються поточні ' + filteredAndSortedTasks.length + ' записів.');
      }
    }
    if (tasksToExport.length === 0) {
      alert('Немає даних для експорту');
      return;
    }

    try {
      // Лінива загрузка ExcelJS — важка бібліотека вантажиться лише при експорті
      const ExcelJS = (await import('exceljs')).default;
      // Створення нової робочої книги
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Дані');

      // Додавання заголовків
      const headers = displayedColumns.map(col => col.label);
      worksheet.addRow(headers);

      // Стилізація заголовків
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, size: 12 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      headerRow.alignment = { 
        vertical: 'middle', 
        horizontal: 'center',
        wrapText: true 
      };
      headerRow.height = 25;

      // Додавання даних
      tasksToExport.forEach(task => {
        const row = displayedColumns.map(col => {
          const value = getTaskColumnValue(task, col.key);
          return formatValue(value, getTaskColumnFormatKey(task, col.key));
        });
        worksheet.addRow(row);
      });

      // Налаштування колонок: автоширина та перенос тексту
      displayedColumns.forEach((col, index) => {
        const column = worksheet.getColumn(index + 1);
        
        // Знаходимо максимальну довжину тексту в колонці
        let maxLength = col.label.length;
        tasksToExport.forEach(task => {
          const value = formatValue(getTaskColumnValue(task, col.key), getTaskColumnFormatKey(task, col.key));
          if (value) {
            const strValue = String(value);
            const lines = strValue.split('\n');
            const maxLineLength = Math.max(...lines.map(line => line.length));
            maxLength = Math.max(maxLength, maxLineLength);
          }
        });
        
        // Встановлюємо ширину з запасом (мінімум 10, максимум 100)
        column.width = Math.min(Math.max(maxLength + 2, 10), 100);
      });

      // Налаштування всіх комірок: перенос тексту та вирівнювання
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.alignment = {
            vertical: 'top',
            horizontal: 'left',
            wrapText: true
          };
        });
        
        // Автовисота рядка на основі кількості рядків тексту
        let maxLines = 1;
        row.eachCell((cell) => {
          if (cell.value) {
            const strValue = String(cell.value);
            const lines = strValue.split('\n').length;
            maxLines = Math.max(maxLines, lines);
          }
        });
        // Висота рядка (приблизно 15 пунктів на рядок, мінімум 20)
        row.height = Math.max(maxLines * 15, 20);
      });

      // Генерація імені файлу з поточною датою
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      const defaultFileName = `Експорт_${dateStr}_${timeStr}.xlsx`;

      // Генерація буфера
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });

      // Перевірка підтримки File System Access API (Chrome, Edge)
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: defaultFileName,
            types: [{
              description: 'Excel файли',
              accept: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
              }
            }]
          });

          // Запис файлу
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          // Користувач скасував діалог
          if (error.name !== 'AbortError') {
            console.error('Помилка збереження файлу:', error);
            // Fallback - створюємо посилання для завантаження
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = defaultFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        }
      } else {
        // Fallback для браузерів без підтримки File System Access API
        // Створюємо посилання для завантаження
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = defaultFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Очищаємо URL через невеликий час
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
    } catch (error) {
      console.error('Помилка експорту в Excel:', error);
      alert('Помилка експорту в Excel: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="task-table-loading">
        <div className="spinner"></div>
        <p>Завантаження завдань...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="task-table-error">
        <p>❌ {error}</p>
        <button onClick={() => window.location.reload()}>Спробувати знову</button>
      </div>
    );
  }

  // Рендер фільтра для колонки
  const renderColumnFilter = (col) => {
    const filterType = getFilterType(col.key);
    
    if (filterType === 'date') {
      return (
        <div className="filter-date-range">
          <input
            type="date"
            className="filter-input filter-date"
            value={columnFilters[col.key + 'From'] || ''}
            onChange={(e) => handleColumnFilterChange(col.key + 'From', e.target.value)}
            title={`${col.label} від`}
          />
          <input
            type="date"
            className="filter-input filter-date"
            value={columnFilters[col.key + 'To'] || ''}
            onChange={(e) => handleColumnFilterChange(col.key + 'To', e.target.value)}
            title={`${col.label} до`}
          />
        </div>
      );
    }
    
    if (filterType === 'select') {
      let options = getFilterOptions(col.key);
      if (col.key === 'work' || ENGINEER_FILTER_KEYS.includes(col.key)) {
        const sourceKeys = col.key === 'work' ? ['work'] : ENGINEER_FILTER_KEYS;
        const seen = new Set(options);
        const extras = [];
        tasks.forEach((task) => {
          sourceKeys.forEach((key) => {
            const value = String(task[key] || '').trim();
            if (value && !seen.has(value)) {
              seen.add(value);
              extras.push(value);
            }
          });
        });
        extras.sort((a, b) => a.localeCompare(b, 'uk'));
        options = col.key === 'work' ? [...options, ...extras] : ['', ...extras];
      }
      return (
        <select
          className="filter-input filter-select"
          value={columnFilters[col.key] || ''}
          onChange={(e) => handleColumnFilterChange(col.key, e.target.value)}
        >
          {options.map(opt => (
            <option key={opt} value={opt}>{opt || 'Всі'}</option>
          ))}
        </select>
      );
    }
    
    // Текстовий фільтр
    return (
      <input
        type="text"
        className="filter-input"
        placeholder="Фільтр..."
        value={columnFilters[col.key] || ''}
        onChange={(e) => handleColumnFilterChange(col.key, e.target.value)}
      />
    );
  };

  const renderModernTaskCard = (task) => {
    const invoiceStatus = getInvoiceStatus(task);
    const engineers = collectTaskEngineers(task);
    const cardClass = [
      'task-board-card',
      getRowClass(task),
      task.urgentRequest ? 'is-urgent' : '',
      isTaskMarkedForDeletion(task) ? 'is-deletion' : '',
    ].filter(Boolean).join(' ');

    return (
      <article
        key={task.id || task._id}
        className={cardClass}
        data-status={task.status}
        onClick={() => onRowClick && onRowClick(task)}
        role={onRowClick ? 'button' : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onRowClick(task);
          }
        }}
      >
        <header className="task-board-card-head">
          <strong>{task.requestNumber || 'Без номера'}</strong>
          <span className={`task-passport-chip is-status-${statusSlug(task.status)}`}>
            {task.status || 'Без статусу'}
          </span>
          {task.urgentRequest && <span className="task-passport-chip is-urgent">Термінова</span>}
          {task.internalWork && <span className="task-passport-chip">Внутрішня</span>}
          {isTaskMarkedForDeletion(task) && <span className="task-passport-chip is-urgent">Під видалення</span>}
        </header>
        <div className="task-board-card-client">{task.client || 'Без замовника'}</div>
        <div className="task-board-card-address">{task.address || 'Адреса не вказана'}</div>
        <div className="task-board-card-contact">
          <small>Контакт</small>
          <div className="task-board-card-meta">
            <span><small>Контактна особа</small><b>{task.contactPerson || '—'}</b></span>
            <span>
              <small>Тел. контактної особи</small>
              {task.contactPhone ? (
                <a
                  href={`tel:${String(task.contactPhone).replace(/\s/g, '')}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {task.contactPhone}
                </a>
              ) : (
                <b>—</b>
              )}
            </span>
          </div>
        </div>
        <div className="task-board-card-meta">
          <span><small>Обладнання</small><b>{task.equipment || '—'}</b></span>
          <span><small>Зав. №</small><b>{task.equipmentSerial || '—'}</b></span>
          <span><small>Регіон</small><b>{task.serviceRegion || '—'}</b></span>
          <span><small>Дата заявки</small><b>{formatValue(task.requestDate, 'requestDate')}</b></span>
          <span><small>План</small><b>{formatValue(task.plannedDate, 'plannedDate')}</b></span>
          <span><small>Роботи</small><b>{formatValue(task.date, 'date')}</b></span>
        </div>
        <div className="task-board-card-desc">
          <small>Опис робіт</small>
          <p>{task.requestDesc || '—'}</p>
        </div>
        {task.work && <p className="task-board-card-work">{task.work}</p>}
        <div className="task-board-card-foot">
          <span
            className="status-badge-compact"
            style={{ backgroundColor: invoiceStatus.color }}
            title={`Статус рахунку: ${invoiceStatus.label}`}
          >
            Рахунок: {invoiceStatus.label}
          </span>
          <b className="task-board-card-sum">
            {parseNumber(task.serviceTotal) ? `${formatServiceTotalSum(task.serviceTotal)} грн` : 'Без суми'}
          </b>
        </div>
        {engineers.length > 0 && (
          <div className="task-board-card-engineers">{engineers.join(' · ')}</div>
        )}
        <div className="task-board-card-actions" onClick={(e) => e.stopPropagation()}>
          {approveRole !== 'warehouse' && approveRole !== 'accountant' && status !== 'accountantInvoiceRequests' && (
            <button
              className="btn-work-order"
              onClick={() => {
                generateWorkOrder(task).catch((err) => {
                  console.error(err);
                  alert('Не вдалося підготувати наряд (завантаження коефіцієнтів або документ). Спробуйте ще раз.');
                });
              }}
              title="Створити наряд на виконання робіт"
            >
              📋 Наряд
            </button>
          )}
          {(columnsArea === 'service' || columnsArea === 'operator') && onCreateFromTask && (
            <button className="btn-work-order" onClick={() => onCreateFromTask(task)} title="Створити нову заявку на основі цієї">
              ➕ На основі
            </button>
          )}
          {canShowViewButton && (
            <button className="btn-view-task" onClick={() => onViewClick(task)} title="Перегляд заявки">
              👁️ Перегляд
            </button>
          )}
          {canRestoreDeletedTask(task) && (
            <button
              className="btn-restore-task"
              onClick={(e) => handleRestoreDeletedTask(task, e)}
              disabled={restoringTaskId === (task._id || task.id)}
            >
              {restoringTaskId === (task._id || task.id) ? '⏳' : '↩ Відновити'}
            </button>
          )}
          {canDeleteTask() && (
            <button
              className="btn-delete-task"
              onClick={(e) => handleDeleteTask(task, e)}
              disabled={deletingTaskId === (task._id || task.id)}
              title={isAdminUser ? 'Видалити заявку з системи' : 'Перевести в заблоковані з поміткою видалення'}
            >
              {deletingTaskId === (task._id || task.id) ? '⏳' : '🗑️'}
            </button>
          )}
        </div>
        {status === 'newRequests' &&
          task.status === 'Заявка' &&
          !isTaskMarkedForDeletion(task) &&
          approveRole !== 'warehouse' &&
          approveRole !== 'accountant' && (
          <button
            type="button"
            className="btn-take-into-work"
            onClick={(e) => handleTakeIntoWork(task, e)}
            disabled={takingTaskId === (task._id || task.id)}
            title="Перевести заявку в статус «В роботі»"
          >
            {takingTaskId === (task._id || task.id) ? '⏳ Переносимо…' : 'Взяти в роботу'}
          </button>
        )}
      </article>
    );
  };

  return (
    <div className={`task-table-container${compactVariant ? ' task-table-container--modern' : ''}`}>
      {/* Фільтри та пошук */}
      <div className="task-table-toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Пошук по всіх полях..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="toolbar-actions">
          {compactVariant && (
            <div className="task-view-toggle" role="group" aria-label="Вигляд списку">
              <button
                type="button"
                className={listViewMode === 'board' ? 'active' : ''}
                onClick={() => setListViewMode('board')}
              >
                Борди
              </button>
              <button
                type="button"
                className={listViewMode === 'table' ? 'active' : ''}
                onClick={() => setListViewMode('table')}
              >
                Таблиця
              </button>
            </div>
          )}
          {compactVariant && listViewMode === 'board' && (
            <select
              className="task-board-sort"
              value={`${sortField}:${sortDirection}`}
              onChange={(e) => {
                const [field, dir] = e.target.value.split(':');
                setSortField(field);
                setSortDirection(dir);
                if (enablePagination) setPage(1);
              }}
              title="Сортування карток"
            >
              <option value="requestDate:desc">Новіші заявки</option>
              <option value="requestDate:asc">Старіші заявки</option>
              <option value="plannedDate:asc">План: спочатку ближчі</option>
              <option value="plannedDate:desc">План: спочатку дальші</option>
              <option value="client:asc">Замовник А–Я</option>
              <option value="serviceTotal:desc">Сума ↓</option>
              <option value="requestNumber:desc">Номер заявки</option>
            </select>
          )}
          <button
            className="btn-export-excel"
            onClick={handleExportToExcel}
            title="Експортувати таблицю в Excel"
          >
            📊 Експорт в Excel
          </button>
          <button
            className={`btn-toggle-filters ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title={showFilters ? 'Сховати фільтри колонок' : 'Натисни щоб активувати фільтрацію'}
          >
            {compactVariant ? 'Натисни щоб активувати фільтрацію' : '🔽 Фільтри'}
          </button>
          {hasActiveFilters && (
            <button
              className="btn-clear-filters"
              onClick={clearAllFilters}
              title="Очистити всі фільтри"
            >
              ✖ Очистити
            </button>
          )}
        </div>
        <div className="toolbar-info">
          <span>Знайдено: {enablePagination ? total : filteredAndSortedTasks.length}</span>
          {showServiceTotalSum && serviceTotalSum != null && (
            <span className="toolbar-service-total">
              Загальна сума послуг по відфільтрованим заявкам: {formatServiceTotalSum(serviceTotalSum)} грн
            </span>
          )}
        </div>
      </div>

      {compactVariant && (
        <div className="task-modern-filterbar">
          <div className="task-preset-bar">
            <select
              className="task-preset-select"
              value={activePresetId}
              onChange={(e) => applyFilterPreset(e.target.value)}
              title="Збережені вигляди фільтрації"
            >
              <option value="">Збережені вигляди…</option>
              {filterPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
            <input
              type="text"
              className="task-preset-name"
              placeholder="Назва вигляду, напр. Київ + Заявка"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveCurrentFilterPreset();
                }
              }}
            />
            <button type="button" className="btn-save-preset" onClick={saveCurrentFilterPreset} disabled={!presetName.trim()}>
              Зберегти фільтр
            </button>
            {activePresetId && (
              <button type="button" className="btn-clear-filters" onClick={deleteActiveFilterPreset}>
                Видалити вигляд
              </button>
            )}
          </div>
          {activeFilterChips.length > 0 && (
            <div className="task-filter-chips">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="task-filter-chip"
                  onClick={() => removeFilterChip(chip.key)}
                  title="Прибрати цей фільтр"
                >
                  {chip.label} ×
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {compactVariant && showFilters && (
        <div className="task-filter-board">
          {displayedColumns.map((col) => (
            <label key={col.key} className="task-filter-field">
              <span>{col.label}</span>
              {renderColumnFilter(col)}
            </label>
          ))}
        </div>
      )}

      {/* Пагінація для оператора */}
      {enablePagination && total > 0 && (
        <div className="task-table-pagination">
          <button
            className="pagination-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            title="Попередня сторінка"
          >
            ◀ Попередня
          </button>
          <span className="pagination-info">
            Сторінка {page} з {Math.ceil(total / PAGE_SIZE) || 1}
            {' '}({((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} з {total})
          </span>
          <button
            className="pagination-btn"
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
            title="Наступна сторінка"
          >
            Наступна ▶
          </button>
        </div>
      )}

      {compactVariant && listViewMode === 'board' ? (
        <div className={`task-kanban${taskBoards.length <= 1 ? ' is-single' : ''}`}>
          {filteredAndSortedTasks.length === 0 ? (
            <div className="task-kanban-empty">Немає завдань для відображення</div>
          ) : taskBoards.length <= 1 ? (
            <div className="task-kanban-single">
              <header className="task-kanban-lane-head">
                <h3>{taskBoards[0]?.status || 'Заявки'}</h3>
                <span>{taskBoards[0]?.tasks.length || 0}</span>
              </header>
              <div className="task-kanban-grid">
                {(taskBoards[0]?.tasks || []).map((task) => renderModernTaskCard(task))}
              </div>
            </div>
          ) : (
            taskBoards.map((lane) => (
              <section
                key={lane.status}
                className={`task-kanban-lane is-status-${statusSlug(lane.status)}`}
              >
                <header className="task-kanban-lane-head">
                  <h3>{lane.status}</h3>
                  <span>{lane.tasks.length}</span>
                </header>
                <div className="task-kanban-lane-body">
                  {lane.tasks.map((task) => renderModernTaskCard(task))}
                </div>
              </section>
            ))
          )}
        </div>
      ) : (
      <div className="task-table-wrapper">
        <table className="task-table">
          <thead>
            {/* Рядок заголовків */}
            <tr>
              {/* Колонка Дії - перша (трохи ширша для панелей з інформацією про рахунки) */}
              <th style={{ 
                width: (status === 'accountantInvoiceRequests' || 
                       columnsArea === 'service' || 
                       columnsArea === 'operator' || 
                       columnsArea === 'warehouse' || 
                       columnsArea === 'accountant-approval' || 
                       columnsArea === 'regional' ||
                       canShowViewButton) ? '170px' : '70px', 
                minWidth: (status === 'accountantInvoiceRequests' || 
                          columnsArea === 'service' || 
                          columnsArea === 'operator' || 
                          columnsArea === 'warehouse' || 
                          columnsArea === 'accountant-approval' || 
                          columnsArea === 'regional' ||
                          canShowViewButton) ? '170px' : '70px' 
              }} rowSpan={showFilters && !compactVariant ? 2 : 1}>
                <div className="th-content">Дії</div>
              </th>
              {displayedColumns.map(col => {
                const colWidth = columnSettings.widths?.[col.key] || col.width;
                const widthValue = typeof colWidth === 'number' ? `${colWidth}px` : colWidth;
                
                return (
                  <th
                    key={col.key}
                    style={{ 
                      width: widthValue,
                      minWidth: '80px',
                      maxWidth: widthValue
                    }}
                    onClick={() => handleSort(col.key)}
                    className={`sortable ${sortField === col.key ? `sort-${sortDirection}` : ''}`}
                  >
                    <div className="th-content">
                      {col.label}
                      {sortField === col.key && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
            {/* Рядок фільтрів — у покращеному виді фільтри винесені в окрему панель */}
            {showFilters && !compactVariant && (
              <tr className="filter-row">
                {displayedColumns.map(col => (
                  <th key={`filter-${col.key}`} className="filter-cell">
                    {renderColumnFilter(col)}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {filteredAndSortedTasks.length === 0 ? (
              <tr>
                <td colSpan={displayedColumns.length + 1} className="empty-state">
                  Немає завдань для відображення
                </td>
              </tr>
            ) : (
              filteredAndSortedTasks.map(task => {
                const rowClass = getRowClass(task);
                
                return (
                  <tr 
                    key={task.id || task._id} 
                    className={rowClass}
                    data-urgent={task.urgentRequest ? 'true' : 'false'}
                    data-status={task.status}
                    onClick={() => onRowClick && onRowClick(task)}
                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    {/* Комірка Дії - перша */}
                    <td className="actions-cell">
                      {(columnsArea === 'warehouse' || columnsArea === 'accountant-approval') &&
                        task.requestNumber &&
                        (() => {
                          const st = onecStatusByRequest[task.requestNumber];
                          const requiresWriteoff = taskRequiresOnecWriteoff(task);
                          if (st?.hasMovement) {
                            return (
                              <div
                                className="onec-writeoff-badge onec-writeoff-badge--ok"
                                title="Знайдено списання або реалізацію в 1С за цим номером заявки"
                              >
                                ✓ Є рух в 1С
                              </div>
                            );
                          }
                          if (!requiresWriteoff) {
                            return (
                              <div
                                className="onec-writeoff-badge onec-writeoff-badge--na"
                                title="У заявці немає витратних матеріалів — списання в 1С не потрібне"
                              >
                                Не потребує списання 1С
                              </div>
                            );
                          }
                          const showMissingBadge =
                            columnsArea === 'warehouse'
                              ? showApproveButtons && task.approvedByWarehouse !== 'Підтверджено'
                              : showApproveButtons && task.approvedByAccountant !== 'Підтверджено';
                          if (!st) return null;
                          if (showMissingBadge) {
                            return (
                              <div
                                className="onec-writeoff-badge onec-writeoff-badge--missing"
                                title="Списання або реалізація в 1С за номером заявки не знайдено"
                              >
                                Немає руху в 1С
                              </div>
                            );
                          }
                          return null;
                        })()}
                      {/* Інформація про рахунок для панелей: бух.рахунки, сервісна служба, оператор, зав.склад, бух на затвердженні, регіональний керівник */}
                      {(status === 'accountantInvoiceRequests' || 
                        columnsArea === 'service' || 
                        columnsArea === 'operator' || 
                        columnsArea === 'warehouse' || 
                        columnsArea === 'accountant-approval' || 
                        columnsArea === 'regional') && (
                        <div className="invoice-info-compact">
                          {/* Тип документів - показуємо тільки для бух.рахунки */}
                          {status === 'accountantInvoiceRequests' && (
                          <div className="docs-row">
                            {task.needInvoice && <span className="doc-badge doc-invoice" title="Потрібен рахунок">📄</span>}
                            {task.needAct && <span className="doc-badge doc-act" title="Потрібен акт">📋</span>}
                            {!task.needInvoice && !task.needAct && <span className="doc-badge doc-none" title="Не вказано">⚠️</span>}
                          </div>
                          )}
                          {/* Статус рахунку - показуємо для всіх панелей */}
                          {(() => {
                            const invoiceStatus = getInvoiceStatus(task);
                            return (
                          <div 
                            className="status-badge-compact"
                                style={{ backgroundColor: invoiceStatus.color }}
                                title={`Статус рахунку: ${invoiceStatus.label}`}
                          >
                                {invoiceStatus.label}
                          </div>
                            );
                          })()}
                          {/* Хто подав запит - тільки для бух.рахунки */}
                          {status === 'accountantInvoiceRequests' && task.invoiceRequesterName && (
                            <div className="invoice-requester-compact" title="Хто подав запит на рахунок">
                              👤 {task.invoiceRequesterName}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Кнопка наряду - не показуємо для зав. складу, бух.рахунки та бух на затвердженні */}
                      {approveRole !== 'warehouse' && approveRole !== 'accountant' && status !== 'accountantInvoiceRequests' && (
                        <button
                          className="btn-work-order"
                          onClick={(e) => {
                            e.stopPropagation();
                            generateWorkOrder(task).catch((err) => {
                              console.error(err);
                              alert(
                                'Не вдалося підготувати наряд (завантаження коефіцієнтів або документ). Спробуйте ще раз.'
                              );
                            });
                          }}
                          title="Створити наряд на виконання робіт"
                        >
                          📋
                        </button>
                      )}
                      {/* Створити заявку на основі даної — тільки сервісна служба та оператор */}
                      {(columnsArea === 'service' || columnsArea === 'operator') && onCreateFromTask && (
                        <button
                          className="btn-work-order"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCreateFromTask(task);
                          }}
                          title="Створити нову заявку на основі цієї (те саме обладнання/клієнт)"
                        >
                          ➕ На основі
                        </button>
                      )}
                      {/* Кнопки дій для бух.рахунки - компактні */}
                      {status === 'accountantInvoiceRequests' && (
                        <div className="invoice-action-buttons">
                          {onUploadClick && (
                            <button
                              className="btn-upload-docs"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUploadClick(task);
                              }}
                              title="Завантажити документи (рахунок/акт)"
                            >
                              📤 Завантажити
                            </button>
                          )}
                          {onRejectInvoice && task.invoiceRequestId && (
                            <button
                              className="btn-reject-invoice"
                              onClick={(e) => {
                                e.stopPropagation();
                                const reason = prompt('Введіть причину відхилення запиту на рахунок:');
                                if (reason !== null && reason.trim() !== '') {
                                  onRejectInvoice(task, reason.trim());
                                }
                              }}
                              title="Відхилити запит на рахунок"
                            >
                              ❌ Відхилити
                            </button>
                          )}
                        </div>
                      )}
                      {/* Кнопки підтвердження для зав. складу */}
                      {showApproveButtons && approveRole === 'warehouse' && task.approvedByWarehouse !== 'Підтверджено' && (
                        <>
                          <button
                            className="btn-approve"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onApprove) onApprove(task._id || task.id, 'Підтверджено');
                            }}
                            title="Підтвердити"
                          >
                            ✅
                          </button>
                          <button
                            className="btn-reject"
                            onClick={(e) => {
                              e.stopPropagation();
                              const comment = prompt('Введіть причину відмови:');
                              if (comment !== null && onApprove) {
                                onApprove(task._id || task.id, 'Відмова', comment);
                              }
                            }}
                            title="Відхилити"
                          >
                            ❌
                          </button>
                        </>
                      )}
                      {/* Кнопки підтвердження для бухгалтера */}
                      {showApproveButtons && approveRole === 'accountant' && task.approvedByAccountant !== 'Підтверджено' && (
                        <div className="invoice-action-buttons">
                          <button
                            className="btn-upload-docs"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onApprove) onApprove(task._id || task.id, 'Підтверджено');
                            }}
                            title="Підтвердити заявку"
                          >
                            ✅ Підтвердити
                          </button>
                          <button
                            className="btn-reject-invoice"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Викликаємо onApprove з 'Відмова' - модальне вікно відкриється в AccountantApprovalDashboard
                              if (onApprove) onApprove(task._id || task.id, 'Відмова');
                            }}
                            title="Відхилити заявку"
                          >
                            ❌ Відхилити
                          </button>
                        </div>
                      )}
                      {canShowViewButton && (
                        <button
                          className="btn-view-task"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewClick(task);
                          }}
                          title="Перегляд заявки"
                        >
                          👁️ Перегляд
                        </button>
                      )}
                      {isTaskMarkedForDeletion(task) && (
                        <div
                          className="deletion-mark-badge"
                          title={task.blockDetail || 'Заявку позначено на видалення'}
                        >
                          Під видалення
                        </div>
                      )}
                      {canRestoreDeletedTask(task) && (
                        <button
                          className="btn-restore-task"
                          onClick={(e) => handleRestoreDeletedTask(task, e)}
                          disabled={restoringTaskId === (task._id || task.id)}
                          title="Відновити заявку в роботу"
                        >
                          {restoringTaskId === (task._id || task.id) ? '⏳' : '↩ Відновити'}
                        </button>
                      )}
                      {canDeleteTask() && (
                        <button
                          className="btn-delete-task"
                          onClick={(e) => handleDeleteTask(task, e)}
                          disabled={deletingTaskId === (task._id || task.id)}
                          title={isAdminUser ? 'Видалити заявку з системи' : 'Перевести в заблоковані з поміткою видалення'}
                        >
                          {deletingTaskId === (task._id || task.id) ? '⏳' : '🗑️'}
                        </button>
                      )}
                    </td>
                    {displayedColumns.map(col => {
                      const colWidth = columnSettings.widths?.[col.key] || col.width;
                      const widthValue = typeof colWidth === 'number' ? `${colWidth}px` : colWidth;
                      const isDeletionStatus = col.key === 'status' && isTaskMarkedForDeletion(task);
                      
                      return (
                        <td key={col.key} style={{ width: widthValue, maxWidth: widthValue }}>
                          {isDeletionStatus ? (
                            <span title={task.blockDetail || 'Помітка видалення'}>
                              {formatValue(getTaskColumnValue(task, col.key), getTaskColumnFormatKey(task, col.key))}
                              <span className="deletion-status-hint"> · під видалення</span>
                            </span>
                          ) : (
                            formatValue(
                              getTaskColumnValue(task, col.key),
                              getTaskColumnFormatKey(task, col.key)
                            )
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

export default TaskTable;
