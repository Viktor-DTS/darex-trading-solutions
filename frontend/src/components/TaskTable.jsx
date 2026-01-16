import React, { useState, useEffect, useMemo } from 'react';
import ExcelJS from 'exceljs';
import API_BASE_URL from '../config';
import { generateWorkOrder } from '../utils/workOrderGenerator';
import './TaskTable.css';

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

// Функція для перевірки відмови (як в оригінальному проекті)
function isRejected(value) {
  return value === false || value === 'Відмова';
}

function TaskTable({ user, status, onColumnSettingsClick, showRejectedApprovals = false, showRejectedInvoices = false, showAllInvoices = false, onRowClick, onApprove, showApproveButtons = false, approveRole = '', onUploadClick = null, onRejectInvoice = null, columnsArea = 'service', onViewClick = null }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
  
  const [showFilters, setShowFilters] = useState(true);
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
    } catch (error) {
      console.error('Помилка завантаження фільтрів при зміні панелі:', error);
    }
  }, [columnsArea]);

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
    try {
      localStorage.removeItem(filtersStorageKey);
      localStorage.removeItem(filterStorageKey);
    } catch (error) {
      console.error('Помилка видалення фільтрів:', error);
    }
  };

  // Перевірка чи є активні фільтри
  const hasActiveFilters = Object.values(columnFilters).some(v => v && v.trim() !== '') || filter.trim() !== '';

  // Отримати тип фільтра для колонки
  const getFilterType = (columnKey) => {
    // Дати
    if (['requestDate', 'date', 'paymentDate', 'autoCreatedAt', 'autoCompletedAt', 
         'autoWarehouseApprovedAt', 'autoAccountantApprovedAt', 'invoiceRequestDate', 
         'invoiceUploadDate', 'warehouseApprovalDate', 'approvalDate', 'bonusApprovalDate'].includes(columnKey)) {
      return 'date';
    }
    // Випадаючі списки
    if (columnKey === 'status') return 'select';
    if (columnKey === 'company') return 'select';
    if (columnKey === 'paymentType') return 'select';
    if (columnKey === 'serviceRegion') return 'select';
    if (columnKey === 'approvedByWarehouse') return 'select';
    if (columnKey === 'approvedByAccountant') return 'select';
    if (columnKey === 'approvedByRegionalManager') return 'select';
    // Текстові
    return 'text';
  };

  // Отримати опції для select фільтра
  const getFilterOptions = (columnKey) => {
    switch (columnKey) {
      case 'status':
        return ['', 'Заявка', 'В роботі', 'Виконано', 'Заблоковано'];
      case 'company':
        return ['', 'ДТС', 'Дарекс Енерго', 'інша'];
      case 'paymentType':
        return ['', 'Безготівка', 'Готівка', 'На карту', 'Інше'];
      case 'serviceRegion':
        return ['', 'Київський', 'Одеський', 'Львівський', 'Дніпровський', 'Хмельницький', 'Кропивницький', 'Україна'];
      case 'approvedByWarehouse':
      case 'approvedByAccountant':
      case 'approvedByRegionalManager':
        return ['', 'На розгляді', 'Підтверджено', 'Відмова'];
      default:
        return [];
    }
  };

  // Функція перевірки права на видалення заявки
  const canDeleteTask = () => {
    const userRole = user?.role || '';
    
    // Для вкладок "Невиконані" та "Очікують підтвердження"
    if (status === 'notDone' || status === 'pending') {
      return ['regkerivn', 'admin', 'administrator'].includes(userRole);
    }
    
    // Для вкладок "Підтверджені бухгалтером" та "Заблоковані"
    if (status === 'done' || status === 'blocked') {
      return ['admin', 'administrator'].includes(userRole);
    }
    
    return false;
  };

  // Функція видалення заявки
  const handleDeleteTask = async (task, e) => {
    e.stopPropagation();
    
    const taskId = task._id || task.id;
    const taskNumber = task.requestNumber || taskId;
    
    if (!window.confirm(`Ви впевнені, що хочете видалити заявку ${taskNumber}?\n\nЦю дію неможливо відмінити!`)) {
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
              action: 'delete',
              entityType: 'task',
              entityId: taskId,
              description: `Видалення заявки ${taskNumber}`,
              details: {
                requestNumber: taskNumber,
                status: task.status,
                client: task.client
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        // Видаляємо заявку з локального стану
        setTasks(prev => prev.filter(t => (t._id || t.id) !== taskId));
        console.log('[DEBUG] Заявку успішно видалено:', taskId);
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

  // Основні колонки за замовчуванням (якщо налаштувань немає)
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
          console.log('[DEBUG] Завантажені налаштування колонок:', settings);
          
          // Перевіряємо, чи всі ключі з налаштувань існують у поточних колонках
          // Як в оригінальному проекті
          if (settings.visible && 
              settings.visible.length > 0 && 
              settings.visible.every(k => ALL_COLUMNS.some(c => c.key === k))) {
            console.log('[DEBUG] ✅ Встановлюємо збережені налаштування:', settings.visible);
            console.log('[DEBUG] ✅ Порядок колонок з сервера:', settings.order);
            
            // Встановлюємо налаштування
            // Переконуємося, що ширини - це числа
            const normalizedWidths = {};
            if (settings.widths && typeof settings.widths === 'object') {
              Object.keys(settings.widths).forEach(key => {
                const width = settings.widths[key];
                normalizedWidths[key] = typeof width === 'number' ? width : parseInt(width) || 150;
              });
            }
            
            console.log('[DEBUG] ✅ Ширини колонок:', normalizedWidths);
            
            setColumnSettings({
              visible: settings.visible,
              order: settings.order && settings.order.length > 0 
                ? settings.order 
                : settings.visible,
              widths: normalizedWidths
            });
          } else {
            // Якщо налаштування невалідні або порожні, встановлюємо стандартні
            console.log('[DEBUG] ⚠️ Скидаємо на стандартні (дефолтні колонки)');
            setColumnSettings({
              visible: DEFAULT_VISIBLE_COLUMNS,
              order: DEFAULT_VISIBLE_COLUMNS,
              widths: {}
            });
          }
        } else {
          console.log('[DEBUG] Помилка завантаження, використання дефолтних колонок');
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

  // Завантаження завдань
  useEffect(() => {
    const loadTasks = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const token = localStorage.getItem('token');
        let url;
        
        // Якщо активні чекбокси - завантажуємо з обох вкладок (notDone та pending)
        if (showRejectedApprovals || showRejectedInvoices) {
          url = `${API_BASE_URL}/tasks/filter?statuses=notDone,pending&region=${user?.region || ''}`;
        } else if (status) {
          url = `${API_BASE_URL}/tasks/filter?status=${status}&region=${user?.region || ''}`;
          // Додаємо параметр showAllInvoices для панелі бухгалтера
          if (status === 'accountantInvoiceRequests') {
            url += `&showAllInvoices=${showAllInvoices}`;
          }
        } else {
          url = `${API_BASE_URL}/tasks?region=${user?.region || ''}`;
        }
        
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
          throw new Error('Помилка завантаження завдань');
        }
        
        const data = await response.json();
        setTasks(data);
      } catch (err) {
        setError(err.message);
        console.error('Помилка завантаження завдань:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadTasks();
    }
  }, [user, status, showRejectedApprovals, showRejectedInvoices, showAllInvoices]);

  // Відсортовані та відфільтровані завдання
  const filteredAndSortedTasks = useMemo(() => {
    let result = [...tasks];

    // Фільтрація по глобальному тексту
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(task => {
        return Object.values(task).some(value => 
          value && value.toString().toLowerCase().includes(lowerFilter)
        );
      });
    }

    // Фільтрація по колонках
    Object.entries(columnFilters).forEach(([key, value]) => {
      if (!value || value.trim() === '') return;
      
      const filterValue = value.toLowerCase().trim();
      
      // Обробка дат з діапазоном
      if (key.endsWith('From')) {
        const field = key.replace('From', '');
        result = result.filter(task => {
          if (!task[field]) return false;
          const taskDate = new Date(task[field]);
          const filterDate = new Date(value);
          return !isNaN(taskDate.getTime()) && !isNaN(filterDate.getTime()) && taskDate >= filterDate;
        });
        return;
      }
      
      if (key.endsWith('To')) {
        const field = key.replace('To', '');
        result = result.filter(task => {
          if (!task[field]) return false;
          const taskDate = new Date(task[field]);
          const filterDate = new Date(value);
          return !isNaN(taskDate.getTime()) && !isNaN(filterDate.getTime()) && taskDate <= filterDate;
        });
        return;
      }
      
      // Спеціальна логіка для поля "work" (Найменування робіт) з підтримкою виключень
      if (key === 'work') {
        result = result.filter(task => {
          let taskValue = task[key];
          if (taskValue === null || taskValue === undefined) taskValue = '';
          
          const taskValueStr = String(taskValue).toLowerCase();
          
          // Перевірка чи є виключення через мінус (наприклад: "гаран -ремонт в цеху")
          if (filterValue.includes(' -')) {
            // Розділяємо на частини: включення та виключення
            const parts = filterValue.split(' -');
            const includeFilter = parts[0].trim(); // Частина перед першим мінусом
            const excludeFilters = parts.slice(1).map(e => e.trim()); // Всі частини після мінусів
            
            // Якщо є частина включення - перевіряємо її
            if (includeFilter) {
              if (!taskValueStr.includes(includeFilter)) {
                return false; // Не містить потрібний текст - виключаємо
              }
            }
            
            // Перевіряємо всі виключення
            for (const excludeFilter of excludeFilters) {
              if (excludeFilter && taskValueStr.includes(excludeFilter)) {
                return false; // Містить виключений текст - виключаємо
              }
            }
            
            return true; // Пройшов всі перевірки
          }
          
          // Спеціальна обробка для "гаран" (автоматичне виключення не гарантійних ремонтів)
          if (filterValue.includes('гаран')) {
            if (!taskValueStr.includes('гаран')) {
              return false;
            }
            
            // Автоматично виключаємо не гарантійні ремонти
            const isNonWarrantyRepair = 
              (taskValueStr.includes('ремонт в цеху') && !taskValueStr.includes('гарантійний')) ||
              (taskValueStr.includes('ремонт на місті') && !taskValueStr.includes('гарантійний'));
            
            if (isNonWarrantyRepair) {
              return false;
            }
          }
          
          // Стандартний пошук підрядка для всіх інших випадків
          return taskValueStr.includes(filterValue);
        });
        return;
      }
      
      // Звичайна фільтрація для інших полів
      // Для select полів використовуємо точне порівняння, для текстових - includes
      const filterType = getFilterType(key);
      result = result.filter(task => {
        let taskValue = task[key];
        if (taskValue === null || taskValue === undefined) taskValue = '';
        
        // Для select полів - точне порівняння (без урахування регістру)
        if (filterType === 'select') {
          return String(taskValue).toLowerCase() === filterValue;
        }
        
        // Для текстових полів - пошук підрядка
        const taskValueStr = String(taskValue).toLowerCase();
        return taskValueStr.includes(filterValue);
      });
    });

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
      
      const comparison = aVal > bVal ? 1 : -1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [tasks, filter, columnFilters, sortField, sortDirection, showRejectedApprovals, showRejectedInvoices, approveRole]);

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
    
    // Дати
    if (key && (key.includes('Date') || key.includes('At') || key === 'date' || key === 'requestDate' || key === 'paymentDate')) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('uk-UA');
        }
      } catch (e) {
        // Якщо не вдалося розпарсити як дату, повертаємо як є
      }
    }
    
    // Дата з часом (datetime)
    if (key && (key.includes('At') || key === 'autoCreatedAt' || key === 'autoCompletedAt' || 
                key === 'invoiceRequestDate' || key === 'invoiceUploadDate')) {
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

  // Функція для експорту в Excel
  const handleExportToExcel = async () => {
    if (filteredAndSortedTasks.length === 0) {
      alert('Немає даних для експорту');
      return;
    }

    try {
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
      filteredAndSortedTasks.forEach(task => {
        const row = displayedColumns.map(col => {
          const value = task[col.key];
          return formatValue(value, col.key);
        });
        worksheet.addRow(row);
      });

      // Налаштування колонок: автоширина та перенос тексту
      displayedColumns.forEach((col, index) => {
        const column = worksheet.getColumn(index + 1);
        
        // Знаходимо максимальну довжину тексту в колонці
        let maxLength = col.label.length;
        filteredAndSortedTasks.forEach(task => {
          const value = formatValue(task[col.key], col.key);
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
      const options = getFilterOptions(col.key);
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

  return (
    <div className="task-table-container">
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
            title={showFilters ? 'Сховати фільтри колонок' : 'Показати фільтри колонок'}
          >
            🔽 Фільтри
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
          <span>Знайдено: {filteredAndSortedTasks.length}</span>
        </div>
      </div>

      {/* Таблиця */}
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
              }} rowSpan={showFilters ? 2 : 1}>
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
            {/* Рядок фільтрів */}
            {showFilters && (
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
                        </div>
                      )}
                      
                      {/* Кнопка наряду - не показуємо для зав. складу, бух.рахунки та бух на затвердженні */}
                      {approveRole !== 'warehouse' && approveRole !== 'accountant' && status !== 'accountantInvoiceRequests' && (
                        <button
                          className="btn-work-order"
                          onClick={(e) => {
                            e.stopPropagation();
                            generateWorkOrder(task);
                          }}
                          title="Створити наряд на виконання робіт"
                        >
                          📋
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
                      {canDeleteTask() && (
                        <button
                          className="btn-delete-task"
                          onClick={(e) => handleDeleteTask(task, e)}
                          disabled={deletingTaskId === (task._id || task.id)}
                          title="Видалити заявку"
                        >
                          {deletingTaskId === (task._id || task.id) ? '⏳' : '🗑️'}
                        </button>
                      )}
                    </td>
                    {displayedColumns.map(col => {
                      const colWidth = columnSettings.widths?.[col.key] || col.width;
                      const widthValue = typeof colWidth === 'number' ? `${colWidth}px` : colWidth;
                      
                      return (
                        <td key={col.key} style={{ width: widthValue, maxWidth: widthValue }}>
                          {formatValue(task[col.key], col.key)}
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
    </div>
  );
}

export default TaskTable;
