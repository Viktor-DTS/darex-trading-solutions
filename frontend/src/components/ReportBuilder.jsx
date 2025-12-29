import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ExcelJS from 'exceljs';
import API_BASE_URL from '../config.js';
import './ReportBuilder.css';

// Доступні поля для звіту (всі поля з TaskTable)
const AVAILABLE_FIELDS = [
  // Основна інформація
  { key: 'requestNumber', label: '№ Заявки', type: 'text' },
  { key: 'requestDate', label: 'Дата заявки', type: 'date' },
  { key: 'status', label: 'Статус заявки', type: 'select' },
  { key: 'company', label: 'Компанія виконавець', type: 'select' },
  { key: 'serviceRegion', label: 'Регіон сервісного відділу', type: 'select' },
  
  // Клієнт та адреса
  { key: 'edrpou', label: 'ЄДРПОУ', type: 'text' },
  { key: 'client', label: 'Замовник', type: 'text' },
  { key: 'address', label: 'Адреса', type: 'text' },
  { key: 'requestDesc', label: 'Опис заявки', type: 'text' },
  { key: 'plannedDate', label: 'Запланована дата робіт', type: 'date' },
  { key: 'contactPerson', label: 'Контактна особа', type: 'text' },
  { key: 'contactPhone', label: 'Тел. контактної особи', type: 'text' },
  
  // Обладнання
  { key: 'equipment', label: 'Тип обладнання', type: 'text' },
  { key: 'equipmentSerial', label: 'Заводський номер обладнання', type: 'text' },
  { key: 'engineModel', label: 'Модель двигуна', type: 'text' },
  { key: 'engineSerial', label: 'Зав. № двигуна', type: 'text' },
  { key: 'customerEquipmentNumber', label: 'інвент. № обладнання від замовника', type: 'text' },
  
  // Роботи та інженери
  { key: 'work', label: 'Найменування робіт', type: 'text' },
  { key: 'date', label: 'Дата проведення робіт', type: 'date' },
  { key: 'engineer1', label: 'Сервісний інженер №1', type: 'select' },
  { key: 'engineer2', label: 'Сервісний інженер №2', type: 'select' },
  { key: 'engineer3', label: 'Сервісний інженер №3', type: 'select' },
  { key: 'engineer4', label: 'Сервісний інженер №4', type: 'select' },
  { key: 'engineer5', label: 'Сервісний інженер №5', type: 'select' },
  { key: 'engineer6', label: 'Сервісний інженер №6', type: 'select' },
  
  // Фінанси
  { key: 'serviceTotal', label: 'Загальна сума послуги', type: 'number' },
  { key: 'workPrice', label: 'Вартість робіт, грн', type: 'number' },
  { key: 'paymentType', label: 'Вид оплати', type: 'select' },
  { key: 'paymentDate', label: 'Дата оплати', type: 'date' },
  { key: 'invoice', label: 'Номер рахунку', type: 'text' },
  { key: 'invoiceRecipientDetails', label: 'Реквізити отримувача рахунку', type: 'text' },
  
  // Оливи
  { key: 'oilType', label: 'Тип оливи', type: 'text' },
  { key: 'oilUsed', label: 'Використано оливи, л', type: 'number' },
  { key: 'oilPrice', label: 'Ціна оливи за 1 л, грн', type: 'number' },
  { key: 'oilTotal', label: 'Загальна сума за оливу, грн', type: 'number' },
  
  // Фільтри масляні
  { key: 'filterName', label: 'Фільтр масл. назва', type: 'text' },
  { key: 'filterCount', label: 'Фільтр масл. штук', type: 'number' },
  { key: 'filterPrice', label: 'Ціна одного масляного фільтра', type: 'number' },
  { key: 'filterSum', label: 'Загальна сума за фільтри масляні', type: 'number' },
  
  // Фільтри паливні
  { key: 'fuelFilterName', label: 'Фільтр палив. назва', type: 'text' },
  { key: 'fuelFilterCount', label: 'Фільтр палив. штук', type: 'number' },
  { key: 'fuelFilterPrice', label: 'Ціна одного паливного фільтра', type: 'number' },
  { key: 'fuelFilterSum', label: 'Загальна сума за паливні фільтри', type: 'number' },
  
  // Фільтри повітряні
  { key: 'airFilterName', label: 'Фільтр повітряний назва', type: 'text' },
  { key: 'airFilterCount', label: 'Фільтр повітряний штук', type: 'number' },
  { key: 'airFilterPrice', label: 'Ціна одного повітряного фільтра', type: 'number' },
  { key: 'airFilterSum', label: 'Загальна сума за повітряні фільтри', type: 'number' },
  
  // Антифриз
  { key: 'antifreezeType', label: 'Антифриз тип', type: 'text' },
  { key: 'antifreezeL', label: 'Антифриз, л', type: 'number' },
  { key: 'antifreezePrice', label: 'Ціна антифризу', type: 'number' },
  { key: 'antifreezeSum', label: 'Загальна сума за антифриз', type: 'number' },
  
  // Інші матеріали
  { key: 'otherMaterials', label: 'Опис інших матеріалів', type: 'text' },
  { key: 'otherSum', label: 'Загальна ціна інших матеріалів', type: 'number' },
  
  // Транспорт
  { key: 'carNumber', label: 'Держномер автотранспорту', type: 'text' },
  { key: 'transportKm', label: 'Транспортні витрати, км', type: 'number' },
  { key: 'transportSum', label: 'Загальна вартість тр. витрат', type: 'number' },
  
  // Витрати
  { key: 'perDiem', label: 'Добові, грн', type: 'number' },
  { key: 'living', label: 'Проживання, грн', type: 'number' },
  { key: 'otherExp', label: 'Інші витрати, грн', type: 'number' },
  { key: 'serviceBonus', label: 'Премія за виконання сервісних робіт, грн', type: 'number' },
  
  // Підтвердження зав. складу
  { key: 'approvedByWarehouse', label: 'Підтвердження зав. складу', type: 'approval' },
  { key: 'warehouseApprovalDate', label: 'Дата підтвердження зав. складу', type: 'date' },
  { key: 'warehouseComment', label: 'Опис відмови (зав. склад)', type: 'text' },
  
  // Підтвердження бухгалтера
  { key: 'approvedByAccountant', label: 'Підтвердження бухгалтера', type: 'approval' },
  { key: 'accountantComment', label: 'Опис відмови (бухгалтер)', type: 'text' },
  { key: 'accountantComments', label: 'Коментарії бухгалтера', type: 'text' },
  
  // Підтвердження регіонального керівника
  { key: 'approvedByRegionalManager', label: 'Підтвердження регіонального керівника', type: 'approval' },
  { key: 'regionalManagerComment', label: 'Опис відмови (регіональний керівник)', type: 'text' },
  
  // Інші поля
  { key: 'comments', label: 'Коментарі', type: 'text' },
  { key: 'approvalDate', label: 'Дата затвердження', type: 'date' },
  { key: 'bonusApprovalDate', label: 'Дата затвердження премії', type: 'date' },
  { key: 'reportMonthYear', label: 'Місяць/рік для звіту', type: 'text' },
  { key: 'blockDetail', label: 'Детальний опис блокування заявки', type: 'text' },
  
  // Чекбокси (як текст)
  { key: 'needInvoice', label: 'Потрібен рахунок', type: 'text' },
  { key: 'needAct', label: 'Потрібен акт виконаних робіт', type: 'text' },
  { key: 'debtStatus', label: 'Заборгованість по Акти виконаних робіт', type: 'text' },
  { key: 'debtStatusCheckbox', label: 'Документи в наявності', type: 'text' },
  
  // Автоматичні дати
  { key: 'autoCreatedAt', label: 'Авт. створення заявки', type: 'date' },
  { key: 'autoCompletedAt', label: 'Авт. виконанно', type: 'date' },
  { key: 'autoWarehouseApprovedAt', label: 'Авт. затвердження завскладом', type: 'date' },
  { key: 'autoAccountantApprovedAt', label: 'Авт. затвердження бухгалтером', type: 'date' },
  { key: 'invoiceRequestDate', label: 'Дата заявки на рахунок', type: 'date' },
  { key: 'invoiceUploadDate', label: 'Дата завантаження рахунку', type: 'date' },
];

// Функція для витягування контактної особи та телефону з адреси
const extractContactFromAddress = (address, taskEdrpou = '') => {
  if (!address || typeof address !== 'string') {
    return { contactPerson: '', contactPhone: '' };
  }

  let contactPerson = '';
  let contactPhone = '';
  let cleanedAddress = address.trim();

  // Функція для перевірки чи число є телефоном (а не ЄДРПОУ)
  const isValidPhone = (phoneStr, contextAddress) => {
    // Видаляємо всі нецифрові символи для перевірки
    const digitsOnly = phoneStr.replace(/\D/g, '');
    
    // Перевірка: чи це число співпадає з ЄДРПОУ заявки
    if (taskEdrpou) {
      const edrpouDigits = String(taskEdrpou).replace(/\D/g, '');
      if (digitsOnly === edrpouDigits) {
        return false; // Це ЄДРПОУ заявки, не телефон
      }
    }
    
    // Перевірка контексту: якщо перед числом є "ЄДРПОУ" або "ЕДРПОУ", це не телефон
    const phoneIndex = contextAddress.indexOf(phoneStr);
    if (phoneIndex > 0) {
      const beforePhone = contextAddress.substring(Math.max(0, phoneIndex - 50), phoneIndex).toLowerCase();
      if (beforePhone.match(/[єе]дрпоу|edrpou/i)) {
        return false; // Це ЄДРПОУ в контексті
      }
    }
    
    // ЄДРПОУ завжди 8 цифр і не починається з 0
    // Якщо це рівно 8 цифр і не починається з 0 або 38, це скоріше за все ЄДРПОУ
    if (digitsOnly.length === 8 && !digitsOnly.startsWith('0') && !digitsOnly.startsWith('38')) {
      return false; // Це ЄДРПОУ, не телефон
    }
    
    // Телефон повинен мати:
    // - Починатися з +38 або 0 (для українських номерів)
    // - Або мати 9-10 цифр (місцеві формати)
    // - Але не бути 8-значним числом без префіксу
    
    // Перевірка на український формат (+38 або 0 на початку)
    if (phoneStr.match(/^\+?38/) || phoneStr.match(/^0\d/)) {
      return true;
    }
    
    // Перевірка на місцевий формат (9-10 цифр, але не 8)
    if (digitsOnly.length >= 9 && digitsOnly.length <= 10) {
      return true;
    }
    
    // Якщо це 8 цифр без префіксу - це не телефон
    if (digitsOnly.length === 8) {
      return false;
    }
    
    return true;
  };

  // Патерни для телефонів (українські формати)
  // ВАЖЛИВО: не включаємо патерни, які можуть знайти 8-значні числа без префіксу
  const phonePatterns = [
    /(\+?38\s?\(?\d{3}\)?\s?\d{3}[\s-]?\d{2}[\s-]?\d{2})/g, // +38 (XXX) XXX XX XX
    /(\+?38\s?\d{10})/g, // +38XXXXXXXXXX
    /(0\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})/g, // 0XX XXX XX XX
    // Видалено патерн /(\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})/g - він може знайти 8-значні числа
    // Додаємо більш специфічні патерни для місцевих форматів (9-10 цифр, але не 8)
    // Використовуємо позитивний lookahead для перевірки, що це не 8 цифр
    /(\d{9}(?=\D|$))/g, // Рівно 9 цифр
    /(\d{10}(?=\D|$))/g, // Рівно 10 цифр
  ];

  // Знаходимо всі потенційні телефони в адресі
  const foundPhones = [];
  phonePatterns.forEach(pattern => {
    const matches = cleanedAddress.match(pattern);
    if (matches) {
      foundPhones.push(...matches);
    }
  });

  // Фільтруємо тільки валідні телефони (виключаємо ЄДРПОУ)
  // Також виключаємо числа, які співпадають з ЄДРПОУ заявки
  const validPhones = foundPhones.filter(phone => {
    const digitsOnly = phone.replace(/\D/g, '');
    // Якщо це 8 цифр і співпадає з ЄДРПОУ - пропускаємо
    if (taskEdrpou && digitsOnly.length === 8) {
      const edrpouDigits = String(taskEdrpou).replace(/\D/g, '');
      if (digitsOnly === edrpouDigits) {
        return false;
      }
    }
    return isValidPhone(phone, address);
  });

  // Беремо перший валідний телефон
  if (validPhones.length > 0) {
    contactPhone = validPhones[0].trim();
    // Видаляємо телефон з адреси
    cleanedAddress = cleanedAddress.replace(contactPhone, '').trim();
  }

  // Шукаємо контактну особу (зазвичай перед телефоном або після коми/крапки)
  // Патерни для імен (українські імена зазвичай містять великі літери)
  const namePatterns = [
    /([А-ЯІЇЄҐ][а-яіїєґ']+\s+[А-ЯІЇЄҐ][а-яіїєґ']+\s+[А-ЯІЇЄҐ][а-яіїєґ']+)/, // ПІБ
    /([А-ЯІЇЄҐ][а-яіїєґ']+\s+[А-ЯІЇЄҐ][а-яіїєґ']+)/, // Ім'я Прізвище
    /(контакт[а-яіїєґ']*\s*:\s*([А-ЯІЇЄҐ][а-яіїєґ'\s]+))/i, // "контакт: Ім'я"
    /(тел[а-яіїєґ']*\s*:\s*[^,]+,\s*([А-ЯІЇЄҐ][а-яіїєґ'\s]+))/i, // "тел: ..., Ім'я"
  ];

  for (const pattern of namePatterns) {
    const match = cleanedAddress.match(pattern);
    if (match) {
      // Беремо останню групу (ім'я) або весь збіг
      contactPerson = (match[match.length - 1] || match[0]).trim();
      // Видаляємо знайдене ім'я з адреси
      cleanedAddress = cleanedAddress.replace(match[0], '').trim();
      break;
    }
  }

  // Якщо не знайшли через патерни, спробуємо знайти текст перед телефоном
  if (!contactPerson && contactPhone) {
    const phoneIndex = address.indexOf(contactPhone);
    if (phoneIndex > 0) {
      const beforePhone = address.substring(0, phoneIndex).trim();
      // Шукаємо ПІБ перед телефоном (останні 2-3 слова з великої літери)
      const words = beforePhone.split(/[,\n]/);
      const nameWords = words
        .filter(w => w.trim().match(/^[А-ЯІЇЄҐ]/))
        .slice(-3)
        .join(' ')
        .trim();
      if (nameWords && nameWords.length > 3) {
        contactPerson = nameWords;
      }
    }
  }

  // Очищаємо контактну особу від зайвих символів
  if (contactPerson) {
    contactPerson = contactPerson
      .replace(/^контакт[а-яіїєґ']*\s*:\s*/i, '')
      .replace(/тел[а-яіїєґ']*\s*:\s*/i, '')
      .trim();
  }

  // Очищаємо телефон від зайвих символів
  if (contactPhone) {
    contactPhone = contactPhone.replace(/\s+/g, ' ').trim();
  }

  return { contactPerson, contactPhone };
};

// Готові шаблони звітів
const REPORT_TEMPLATES = [
  {
    id: 'financial',
    name: '💰 Фінансовий звіт',
    description: 'Доходи та витрати по заявках',
    fields: ['requestNumber', 'date', 'client', 'serviceRegion', 'serviceTotal', 'workPrice', 'paymentType'],
    groupBy: 'serviceRegion',
    filters: { status: 'Виконано' }
  },
  {
    id: 'engineers',
    name: '👷 Звіт по інженерах',
    description: 'Роботи виконані інженерами',
    fields: ['requestNumber', 'date', 'engineer1', 'engineer2', 'work', 'client', 'serviceTotal'],
    groupBy: 'engineer1',
    filters: {}
  },
  {
    id: 'clients',
    name: '🏢 Звіт по клієнтах',
    description: 'Заявки згруповані по замовниках',
    fields: ['requestNumber', 'date', 'client', 'edrpou', 'address', 'equipment', 'serviceTotal'],
    groupBy: 'client',
    filters: {}
  },
  {
    id: 'regions',
    name: '🌍 Звіт по регіонах',
    description: 'Статистика по регіонах',
    fields: ['requestNumber', 'date', 'serviceRegion', 'client', 'serviceTotal', 'status'],
    groupBy: 'serviceRegion',
    filters: {}
  },
  {
    id: 'approval',
    name: '✅ Звіт по затвердженнях',
    description: 'Статус підтверджень заявок',
    fields: ['requestNumber', 'date', 'client', 'approvedByWarehouse', 'approvedByAccountant', 'serviceTotal'],
    groupBy: null,
    filters: { status: 'Виконано' }
  },
  {
    id: 'materials',
    name: '🔧 Матеріали та витрати',
    description: 'Використані матеріали',
    fields: ['requestNumber', 'date', 'equipment', 'oilTotal', 'filterSum', 'transportSum', 'serviceTotal'],
    groupBy: 'equipment',
    filters: {}
  },
  {
    id: 'equipment-details',
    name: '📋 Звіт по обладнанню та контактах',
    description: 'Детальна інформація про заявки з контактними даними',
    fields: ['requestNumber', 'client', 'edrpou', 'address', 'equipment', 'equipmentSerial', 'contactPerson', 'contactPhone'],
    groupBy: 'contactPhone',
    filters: { requireContactPhone: true }
  }
];

export default function ReportBuilder({ user }) {
  // Стан даних
  const [tasks, setTasks] = useState([]);
  const [regions, setRegions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Стан конструктора
  const [selectedFields, setSelectedFields] = useState(['requestNumber', 'date', 'client', 'serviceTotal']);
  const [fieldOrder, setFieldOrder] = useState(['requestNumber', 'date', 'client', 'serviceTotal']); // Порядок відображення колонок
  const [groupBy, setGroupBy] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Фільтри
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    requestDateFrom: '',
    requestDateTo: '',
    status: '',
    serviceRegion: '',
    company: '',
    client: '',
    engineer1: '',
    engineer2: '',
    paymentType: '',
    approvalStatus: 'all', // all, approved, pending, rejected
    approvedByWarehouse: '',
    approvedByAccountant: '',
    approvedByRegionalManager: ''
  });
  
  // Активна вкладка
  const [activeTab, setActiveTab] = useState('builder'); // builder, templates, saved
  
  // Збережені звіти
  const [savedReports, setSavedReports] = useState([]);
  const [reportName, setReportName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Завантаження даних
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [tasksRes, regionsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tasks/filter?showAll=true`, { headers }),
        fetch(`${API_BASE_URL}/regions`, { headers }),
        fetch(`${API_BASE_URL}/users`, { headers })
      ]);
      
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.tasks || data);
      }
      
      if (regionsRes.ok) {
        const data = await regionsRes.json();
        setRegions(data.map(r => r.name || r));
      }
      
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
    } finally {
      setLoading(false);
    }
  };

  // Фільтрація та обробка даних (з витягуванням контактів з адреси)
  const filteredData = useMemo(() => {
    const filtered = tasks.filter(task => {
      // Фільтр по датах виконання
      if (filters.dateFrom && task.date && task.date < filters.dateFrom) return false;
      if (filters.dateTo && task.date && task.date > filters.dateTo) return false;
      
      // Фільтр по датах заявки
      if (filters.requestDateFrom && task.requestDate && task.requestDate < filters.requestDateFrom) return false;
      if (filters.requestDateTo && task.requestDate && task.requestDate > filters.requestDateTo) return false;
      
      // Фільтр по статусу
      if (filters.status && task.status !== filters.status) return false;
      
      // Фільтр по регіону
      if (filters.serviceRegion && task.serviceRegion !== filters.serviceRegion) return false;
      
      // Фільтр по компанії
      if (filters.company && task.company !== filters.company) return false;
      
      // Фільтр по замовнику
      if (filters.client && task.client && !task.client.toLowerCase().includes(filters.client.toLowerCase())) return false;
      
      // Виключення внутрішніх замовників (Дарекс Енерго та ДТС) - тільки для звіту по обладнанню та контактах
      // Перевіряємо чи використовується шаблон equipment-details (по groupBy === 'contactPhone')
      if (groupBy === 'contactPhone' && task.client) {
        const clientLower = task.client.toLowerCase();
        if (clientLower.includes('дарекс енерго') || clientLower.includes('дтс') || 
            clientLower === 'дарекс енерго' || clientLower === 'дтс') {
          return false;
        }
      }
      
      // Фільтр по інженеру 1
      if (filters.engineer1 && task.engineer1 !== filters.engineer1) return false;
      
      // Фільтр по інженеру 2
      if (filters.engineer2 && task.engineer2 !== filters.engineer2) return false;
      
      // Фільтр по типу оплати
      if (filters.paymentType && task.paymentType !== filters.paymentType) return false;
      
      // Фільтр по затвердженню складу
      if (filters.approvedByWarehouse && task.approvedByWarehouse !== filters.approvedByWarehouse) return false;
      
      // Фільтр по затвердженню бухгалтера
      if (filters.approvedByAccountant && task.approvedByAccountant !== filters.approvedByAccountant) return false;
      
      // Фільтр по затвердженню регіонального керівника
      if (filters.approvedByRegionalManager && task.approvedByRegionalManager !== filters.approvedByRegionalManager) return false;
      
      // Фільтр по затвердженню (загальний)
      if (filters.approvalStatus !== 'all') {
        const isWarehouseApproved = task.approvedByWarehouse === 'Підтверджено';
        const isAccountantApproved = task.approvedByAccountant === 'Підтверджено';
        
        if (filters.approvalStatus === 'approved' && (!isWarehouseApproved || !isAccountantApproved)) return false;
        if (filters.approvalStatus === 'pending' && (isWarehouseApproved && isAccountantApproved)) return false;
        if (filters.approvalStatus === 'rejected' && 
            task.approvedByWarehouse !== 'Відмова' && task.approvedByAccountant !== 'Відмова') return false;
      }
      
      // Фільтр по регіону користувача
      if (user?.region && user.region !== 'Україна' && task.serviceRegion !== user.region) {
        return false;
      }
      
      return true;
    });

    // Обробка даних: витягування контактів з адреси, якщо поля пусті
    const processed = filtered.map(task => {
      const processedTask = { ...task };
      
      // ДОДАТКОВА ПЕРЕВІРКА: якщо contactPhone вже заповнено, але це ЄДРПОУ - очищаємо
      if (processedTask.contactPhone) {
        const phoneDigits = String(processedTask.contactPhone).replace(/\D/g, '');
        const edrpouDigits = processedTask.edrpou ? String(processedTask.edrpou).replace(/\D/g, '') : '';
        
        // Якщо це 8 цифр і співпадає з ЄДРПОУ - очищаємо
        if (phoneDigits.length === 8 && phoneDigits === edrpouDigits) {
          processedTask.contactPhone = '';
        }
        // Або якщо це 8 цифр без префіксу 0 або 38 - це скоріше за все ЄДРПОУ
        else if (phoneDigits.length === 8 && !phoneDigits.startsWith('0') && !phoneDigits.startsWith('38')) {
          // Перевіряємо, чи не починається з +38 або 0 в оригінальному форматі
          const originalPhone = String(processedTask.contactPhone).trim();
          if (!originalPhone.match(/^\+?38/) && !originalPhone.match(/^0\d/)) {
            processedTask.contactPhone = ''; // Це ЄДРПОУ, очищаємо
          }
        }
      }
      
      // Перевіряємо чи потрібно витягувати контактні дані
      const needsContactPerson = !processedTask.contactPerson || processedTask.contactPerson.trim() === '';
      const needsContactPhone = !processedTask.contactPhone || processedTask.contactPhone.trim() === '';
      
      if ((needsContactPerson || needsContactPhone) && processedTask.address) {
        const extracted = extractContactFromAddress(processedTask.address, processedTask.edrpou);
        
        if (needsContactPerson && extracted.contactPerson) {
          processedTask.contactPerson = extracted.contactPerson;
        }
        
        if (needsContactPhone && extracted.contactPhone) {
          processedTask.contactPhone = extracted.contactPhone;
        }
      }
      
      return processedTask;
    });

    // Фільтрація заявок без телефону, якщо групуємо по телефону або це потрібно для шаблону
    if (filters.requireContactPhone || groupBy === 'contactPhone') {
      return processed.filter(task => {
        const phone = task.contactPhone;
        return phone && String(phone).trim() !== '';
      });
    }

    return processed;
  }, [tasks, filters, user, groupBy]);

  // Розрахунок підсумків (повинно бути перед groupedData)
  const calculateTotals = useCallback((items) => {
    const totals = {};
    const numericFields = AVAILABLE_FIELDS.filter(f => f.type === 'number').map(f => f.key);
    
    numericFields.forEach(field => {
      totals[field] = items.reduce((sum, item) => sum + (parseFloat(item[field]) || 0), 0);
    });
    
    totals.count = items.length;
    return totals;
  }, []);

  // Групування даних
  const groupedData = useMemo(() => {
    if (!groupBy) {
      // Сортування без групування
      return [...filteredData].sort((a, b) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      });
    }
    
    // Групування
    const groups = {};
    filteredData.forEach(task => {
      const key = task[groupBy] || 'Не вказано';
      if (!groups[key]) groups[key] = [];
      groups[key].push(task);
    });
    
    return Object.entries(groups).map(([key, items]) => ({
      groupName: key,
      items: items.sort((a, b) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
        return aVal < bVal ? 1 : -1;
      }),
      totals: calculateTotals(items)
    }));
  }, [filteredData, groupBy, sortBy, sortOrder, calculateTotals]);

  // Загальні підсумки
  const grandTotals = useMemo(() => calculateTotals(filteredData), [filteredData, calculateTotals]);

  // Застосування шаблону
  const applyTemplate = (template) => {
    setSelectedFields(template.fields);
    setFieldOrder(template.fields);
    setGroupBy(template.groupBy);
    setFilters(prev => ({ ...prev, ...template.filters }));
    setActiveTab('builder');
  };

  // Переключення поля
  const toggleField = (fieldKey) => {
    setSelectedFields(prev => {
      const newFields = prev.includes(fieldKey) 
        ? prev.filter(f => f !== fieldKey)
        : [...prev, fieldKey];
      
      // Оновлюємо порядок колонок
      setFieldOrder(prevOrder => {
        if (prev.includes(fieldKey)) {
          // Видаляємо з порядку
          return prevOrder.filter(f => f !== fieldKey);
        } else {
          // Додаємо в кінець порядку
          return [...prevOrder, fieldKey];
        }
      });
      
      return newFields;
    });
  };

  // Зміна порядку колонок (вверх)
  const moveFieldUp = (fieldKey) => {
    setFieldOrder(prev => {
      const index = prev.indexOf(fieldKey);
      if (index <= 0) return prev;
      const newOrder = [...prev];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      return newOrder;
    });
  };

  // Зміна порядку колонок (вниз)
  const moveFieldDown = (fieldKey) => {
    setFieldOrder(prev => {
      const index = prev.indexOf(fieldKey);
      if (index < 0 || index >= prev.length - 1) return prev;
      const newOrder = [...prev];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      return newOrder;
    });
  };

  // Форматування значення
  const formatValue = (value, type) => {
    if (value === null || value === undefined || value === '') return '-';
    
    if (type === 'number') {
      return Number(value).toLocaleString('uk-UA', { minimumFractionDigits: 2 });
    }
    if (type === 'approval') {
      if (value === 'Підтверджено' || value === true) return '✅ Підтверджено';
      if (value === 'Відмова' || value === false) return '❌ Відмова';
      return '⏳ На розгляді';
    }
    
    // Форматування дат
    if (type === 'date') {
      try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return String(value);
        
        // Перевіряємо чи є час в значенні (ISO формат з часом)
        const hasTime = String(value).includes('T') || String(value).includes(' ');
        if (hasTime) {
          // Формат: ДД.ММ.РРРР ГГ:ХХ
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${day}.${month}.${year} ${hours}:${minutes}`;
        } else {
          // Формат: ДД.ММ.РРРР
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          return `${day}.${month}.${year}`;
        }
      } catch {
        return String(value);
      }
    }
    
    // Автоматичне визначення дат з часом (ISO формат)
    const stringValue = String(value);
    if (stringValue.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) || 
        stringValue.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)) {
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
      } catch {
        // Якщо не вдалося розпарсити, повертаємо як є
      }
    }
    
    return String(value);
  };

  // Експорт в HTML
  const exportToHTML = () => {
    const html = generateHTMLReport();
    const newWindow = window.open('', '_blank');
    newWindow.document.write(html);
    newWindow.document.close();
  };

  // Отримання полів у правильному порядку
  const getOrderedFields = () => {
    const ordered = fieldOrder.filter(f => selectedFields.includes(f));
    const unordered = selectedFields.filter(f => !fieldOrder.includes(f));
    return [...ordered, ...unordered].map(key => AVAILABLE_FIELDS.find(f => f.key === key)).filter(Boolean);
  };

  // Генерація HTML звіту
  const generateHTMLReport = () => {
    const selectedFieldsData = getOrderedFields();
    
    return `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <title>Звіт - ${new Date().toLocaleDateString('uk-UA')}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .header { background: linear-gradient(135deg, #1a2636, #22334a); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
          .header h1 { margin: 0 0 8px 0; }
          .stats { display: flex; gap: 24px; margin-top: 16px; flex-wrap: wrap; }
          .stat { background: rgba(255,255,255,0.1); padding: 12px 20px; border-radius: 8px; }
          .stat-value { font-size: 24px; font-weight: bold; }
          .stat-label { font-size: 12px; opacity: 0.8; }
          table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          th { background: #1976d2; color: white; padding: 12px; text-align: left; font-weight: 600; }
          td { padding: 10px 12px; border-bottom: 1px solid #eee; }
          tr:hover { background: #f8f9fa; }
          .group-header { background: #e3f2fd; font-weight: bold; }
          .group-header td { padding: 12px; color: #1565c0; }
          .totals-row { background: #1a2636; color: #4fc3f7; font-weight: bold; }
          .totals-row td { padding: 12px; }
          .print-btn { position: fixed; top: 20px; right: 20px; background: #1976d2; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px; }
          @media print { .print-btn { display: none; } }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">🖨️ Друкувати</button>
        <div class="header">
          <h1>📊 Звіт</h1>
          <p>Сформовано: ${new Date().toLocaleString('uk-UA')}</p>
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${filteredData.length}</div>
              <div class="stat-label">Записів</div>
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>№</th>
              ${selectedFieldsData.map(f => `<th>${f.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${groupBy ? groupedData.map((group, gi) => `
              <tr class="group-header">
                <td colspan="${selectedFields.length + 1}">
                  📁 ${AVAILABLE_FIELDS.find(f => f.key === groupBy)?.label}: ${group.groupName} 
                  (${group.items.length} записів)
                </td>
              </tr>
              ${group.items.map((task, ti) => `
                <tr>
                  <td>${gi + 1}.${ti + 1}</td>
                  ${selectedFieldsData.map(f => `<td>${formatValue(task[f.key], f.type)}</td>`).join('')}
                </tr>
              `).join('')}
            `).join('') : filteredData.map((task, i) => `
              <tr>
                <td>${i + 1}</td>
                ${selectedFieldsData.map(f => `<td>${formatValue(task[f.key], f.type)}</td>`).join('')}
              </tr>
            `).join('')}
            <tr class="totals-row">
              <td>Підсумок:</td>
              ${selectedFieldsData.map(f => `
                <td>${f.type === 'number' ? (grandTotals[f.key] || 0).toLocaleString('uk-UA') + ' ₴' : ''}</td>
              `).join('')}
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;
  };

  // Експорт в Excel (XLSX)
  const exportToCSV = async () => {
    try {
      const selectedFieldsData = getOrderedFields();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Звіт');

      // Визначаємо заголовки
      const headers = ['№', ...selectedFieldsData.map(f => f.label)];
      
      // Додаємо заголовки
      worksheet.addRow(headers);
      
      // Стилізація заголовків
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, size: 12 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      headerRow.font = { ...headerRow.font, color: { argb: 'FFFFFFFF' } };
      headerRow.alignment = { 
        vertical: 'middle', 
        horizontal: 'center',
        wrapText: true 
      };
      headerRow.height = 25;

      // Додаємо дані з групуванням (якщо є)
      if (groupBy && groupedData.length > 0 && groupedData[0] && groupedData[0].items && Array.isArray(groupedData[0].items)) {
        // Групування є
        let rowIndex = 2;
        groupedData.forEach((group, groupIndex) => {
          // Додаємо заголовок групи
          const groupHeaderRow = worksheet.addRow([]);
          const groupLabel = `${AVAILABLE_FIELDS.find(f => f.key === groupBy)?.label || groupBy}: ${group.groupName} (${group.items.length} записів)`;
          groupHeaderRow.getCell(1).value = groupLabel;
          groupHeaderRow.getCell(1).font = { bold: true, size: 11 };
          groupHeaderRow.getCell(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFE699' }
          };
          groupHeaderRow.getCell(1).alignment = { vertical: 'middle', wrapText: true };
          // Об'єднуємо комірки для заголовка групи
          worksheet.mergeCells(rowIndex, 1, rowIndex, headers.length);
          rowIndex++;

          // Додаємо дані групи
          group.items.forEach((task, itemIndex) => {
            const row = worksheet.addRow([
              `${groupIndex + 1}.${itemIndex + 1}`,
              ...selectedFieldsData.map(f => formatValue(task[f.key], f.type))
            ]);
            
            // Налаштування переносу тексту для всіх комірок
            row.eachCell({ includeEmpty: false }, (cell) => {
              cell.alignment = { 
                vertical: 'middle', 
                horizontal: 'left',
                wrapText: true 
              };
            });
            rowIndex++;
          });
        });
      } else {
        // Групування немає - просто додаємо дані
        filteredData.forEach((task, i) => {
          const row = worksheet.addRow([
            i + 1,
            ...selectedFieldsData.map(f => formatValue(task[f.key], f.type))
          ]);
          
          // Налаштування переносу тексту для всіх комірок
          row.eachCell({ includeEmpty: false }, (cell) => {
            cell.alignment = { 
              vertical: 'middle', 
              horizontal: 'left',
              wrapText: true 
            };
          });
        });
      }

      // Автоматичний підбір ширини колонок
      worksheet.columns.forEach((column, index) => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: false }, (cell) => {
          const cellValue = cell.value ? String(cell.value) : '';
          const cellLength = cellValue.length;
          if (cellLength > maxLength) {
            maxLength = cellLength;
          }
        });
        // Встановлюємо ширину з невеликим запасом, але не менше 10 і не більше 50
        column.width = Math.min(Math.max(maxLength + 2, 10), 50);
      });

      // Заморожуємо перший рядок
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      // Генеруємо файл
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Помилка експорту:', error);
      alert('Помилка при експорті звіту. Спробуйте ще раз.');
    }
  };

  // Збереження звіту
  const saveReport = () => {
    if (!reportName.trim()) return;
    
    const report = {
      id: Date.now(),
      name: reportName,
      date: new Date().toISOString(),
      selectedFields,
      fieldOrder: fieldOrder.filter(f => selectedFields.includes(f)),
      groupBy,
      sortBy,
      sortOrder,
      filters
    };
    
    const saved = JSON.parse(localStorage.getItem('savedReports') || '[]');
    saved.push(report);
    localStorage.setItem('savedReports', JSON.stringify(saved));
    setSavedReports(saved);
    setShowSaveModal(false);
    setReportName('');
  };

  // Завантаження збережених звітів
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('savedReports') || '[]');
    setSavedReports(saved);
  }, []);

  // Застосування збереженого звіту
  const loadSavedReport = (report) => {
    setSelectedFields(report.selectedFields);
    setFieldOrder(report.fieldOrder || report.selectedFields);
    setGroupBy(report.groupBy);
    setSortBy(report.sortBy);
    setSortOrder(report.sortOrder);
    setFilters(report.filters);
    setActiveTab('builder');
  };

  // Видалення збереженого звіту
  const deleteSavedReport = (id) => {
    const saved = savedReports.filter(r => r.id !== id);
    localStorage.setItem('savedReports', JSON.stringify(saved));
    setSavedReports(saved);
  };

  if (loading) {
    return <div className="report-loading">⏳ Завантаження даних...</div>;
  }

  return (
    <div className="report-builder">
      {/* Заголовок */}
      <div className="report-header">
        <h2>📊 Конструктор звітів</h2>
        <div className="report-stats">
          <div className="stat-item">
            <span className="stat-value">{filteredData.length}</span>
            <span className="stat-label">записів</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{(grandTotals.serviceTotal || 0).toLocaleString('uk-UA')} ₴</span>
            <span className="stat-label">загальна сума</span>
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className="report-tabs">
        <button 
          className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          🔧 Конструктор
        </button>
        <button 
          className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          📋 Шаблони
        </button>
        <button 
          className={`tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          💾 Збережені ({savedReports.length})
        </button>
      </div>

      {/* Контент вкладок */}
      {activeTab === 'templates' && (
        <div className="templates-grid">
          {REPORT_TEMPLATES.map(template => (
            <div key={template.id} className="template-card" onClick={() => applyTemplate(template)}>
              <div className="template-icon">{template.name.split(' ')[0]}</div>
              <div className="template-info">
                <h4>{template.name.substring(2)}</h4>
                <p>{template.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'saved' && (
        <div className="saved-reports">
          {savedReports.length === 0 ? (
            <div className="no-saved">Немає збережених звітів</div>
          ) : (
            savedReports.map(report => (
              <div key={report.id} className="saved-report-card">
                <div className="saved-info">
                  <h4>{report.name}</h4>
                  <p>{new Date(report.date).toLocaleDateString('uk-UA')}</p>
                </div>
                <div className="saved-actions">
                  <button onClick={() => loadSavedReport(report)}>📂 Завантажити</button>
                  <button className="delete" onClick={() => deleteSavedReport(report.id)}>🗑️</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'builder' && (
        <>
          {/* Фільтри */}
          <div className="report-filters">
            <h3>🔍 Фільтри</h3>
            <div className="filters-grid">
              <div className="filter-group">
                <label>Дата виконання з:</label>
                <input 
                  type="date" 
                  value={filters.dateFrom}
                  onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>Дата виконання по:</label>
                <input 
                  type="date" 
                  value={filters.dateTo}
                  onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>Дата заявки з:</label>
                <input 
                  type="date" 
                  value={filters.requestDateFrom}
                  onChange={e => setFilters(prev => ({ ...prev, requestDateFrom: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>Дата заявки по:</label>
                <input 
                  type="date" 
                  value={filters.requestDateTo}
                  onChange={e => setFilters(prev => ({ ...prev, requestDateTo: e.target.value }))}
                />
              </div>
              <div className="filter-group">
                <label>Статус:</label>
                <select 
                  value={filters.status}
                  onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">Всі</option>
                  <option value="Заявка">Заявка</option>
                  <option value="В роботі">В роботі</option>
                  <option value="Виконано">Виконано</option>
                  <option value="Заблоковано">Заблоковано</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Регіон:</label>
                <select 
                  value={filters.serviceRegion}
                  onChange={e => setFilters(prev => ({ ...prev, serviceRegion: e.target.value }))}
                  disabled={user?.region && user.region !== 'Україна'}
                >
                  <option value="">Всі регіони</option>
                  {regions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>Компанія:</label>
                <select 
                  value={filters.company}
                  onChange={e => setFilters(prev => ({ ...prev, company: e.target.value }))}
                >
                  <option value="">Всі</option>
                  <option value="ДТС">ДТС</option>
                  <option value="Дарекс Енерго">Дарекс Енерго</option>
                  <option value="інша">інша</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Замовник:</label>
                <input 
                  type="text" 
                  value={filters.client}
                  onChange={e => setFilters(prev => ({ ...prev, client: e.target.value }))}
                  placeholder="Пошук по замовнику..."
                />
              </div>
              <div className="filter-group">
                <label>Інженер 1:</label>
                <select 
                  value={filters.engineer1}
                  onChange={e => setFilters(prev => ({ ...prev, engineer1: e.target.value }))}
                >
                  <option value="">Всі</option>
                  {users.filter(u => u.role === 'service' || u.role === 'operator').map(u => (
                    <option key={u._id || u.id} value={u.name || u.login}>{u.name || u.login}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>Інженер 2:</label>
                <select 
                  value={filters.engineer2}
                  onChange={e => setFilters(prev => ({ ...prev, engineer2: e.target.value }))}
                >
                  <option value="">Всі</option>
                  {users.filter(u => u.role === 'service' || u.role === 'operator').map(u => (
                    <option key={u._id || u.id} value={u.name || u.login}>{u.name || u.login}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>Тип оплати:</label>
                <select 
                  value={filters.paymentType}
                  onChange={e => setFilters(prev => ({ ...prev, paymentType: e.target.value }))}
                >
                  <option value="">Всі</option>
                  <option value="Безготівка">Безготівка</option>
                  <option value="Готівка">Готівка</option>
                  <option value="На карту">На карту</option>
                  <option value="Інше">Інше</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Підтвердження складу:</label>
                <select 
                  value={filters.approvedByWarehouse}
                  onChange={e => setFilters(prev => ({ ...prev, approvedByWarehouse: e.target.value }))}
                >
                  <option value="">Всі</option>
                  <option value="На розгляді">На розгляді</option>
                  <option value="Підтверджено">Підтверджено</option>
                  <option value="Відмова">Відмова</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Підтвердження бухгалтера:</label>
                <select 
                  value={filters.approvedByAccountant}
                  onChange={e => setFilters(prev => ({ ...prev, approvedByAccountant: e.target.value }))}
                >
                  <option value="">Всі</option>
                  <option value="На розгляді">На розгляді</option>
                  <option value="Підтверджено">Підтверджено</option>
                  <option value="Відмова">Відмова</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Підтвердження рег. керівника:</label>
                <select 
                  value={filters.approvedByRegionalManager}
                  onChange={e => setFilters(prev => ({ ...prev, approvedByRegionalManager: e.target.value }))}
                >
                  <option value="">Всі</option>
                  <option value="На розгляді">На розгляді</option>
                  <option value="Підтверджено">Підтверджено</option>
                  <option value="Відмова">Відмова</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Затвердження (загальне):</label>
                <select 
                  value={filters.approvalStatus}
                  onChange={e => setFilters(prev => ({ ...prev, approvalStatus: e.target.value }))}
                >
                  <option value="all">Всі</option>
                  <option value="approved">✅ Затверджені</option>
                  <option value="pending">⏳ На розгляді</option>
                  <option value="rejected">❌ Відхилені</option>
                </select>
              </div>
            </div>
          </div>

          {/* Вибір полів */}
          <div className="report-fields">
            <h3>📋 Поля звіту</h3>
            <div className="fields-grid">
              {AVAILABLE_FIELDS.map(field => (
                <label key={field.key} className={`field-checkbox ${selectedFields.includes(field.key) ? 'selected' : ''}`}>
                  <input 
                    type="checkbox" 
                    checked={selectedFields.includes(field.key)}
                    onChange={() => toggleField(field.key)}
                  />
                  {field.label}
                </label>
              ))}
            </div>
            
            {/* Порядок відображення колонок */}
            {selectedFields.length > 0 && (
              <div className="field-order-section">
                <h4>📐 Порядок відображення колонок</h4>
                <div className="field-order-list">
                  {fieldOrder.filter(f => selectedFields.includes(f)).map((fieldKey, index) => {
                    const field = AVAILABLE_FIELDS.find(f => f.key === fieldKey);
                    if (!field) return null;
                    const isFirst = index === 0;
                    const isLast = index === fieldOrder.filter(f => selectedFields.includes(f)).length - 1;
                    
                    return (
                      <div key={fieldKey} className="field-order-item">
                        <button 
                          className="order-btn" 
                          onClick={() => moveFieldUp(fieldKey)}
                          disabled={isFirst}
                          title="Перемістити вверх"
                        >
                          ↑
                        </button>
                        <button 
                          className="order-btn" 
                          onClick={() => moveFieldDown(fieldKey)}
                          disabled={isLast}
                          title="Перемістити вниз"
                        >
                          ↓
                        </button>
                        <span className="field-order-label">{field.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Групування та сортування */}
          <div className="report-options">
            <div className="option-group">
              <label>Групувати по:</label>
              <select value={groupBy || ''} onChange={e => setGroupBy(e.target.value || null)}>
                <option value="">Без групування</option>
                {AVAILABLE_FIELDS.filter(f => f.type !== 'number').map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="option-group">
              <label>Сортувати по:</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                {AVAILABLE_FIELDS.map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="option-group">
              <label>Напрямок:</label>
              <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                <option value="desc">↓ Спадання</option>
                <option value="asc">↑ Зростання</option>
              </select>
            </div>
          </div>

          {/* Кнопки дій */}
          <div className="report-actions">
            <button className="btn-primary" onClick={exportToHTML}>
              📄 Відкрити звіт
            </button>
            <button className="btn-secondary" onClick={exportToCSV}>
              📥 Експорт CSV
            </button>
            <button className="btn-save" onClick={() => setShowSaveModal(true)}>
              💾 Зберегти шаблон
            </button>
          </div>

          {/* Попередній перегляд */}
          <div className="report-preview">
            <h3>👁️ Попередній перегляд ({filteredData.length} записів)</h3>
            <div className="preview-table-wrapper">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>№</th>
                    {getOrderedFields().map(f => (
                      <th key={f.key}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(groupBy ? groupedData.slice(0, 5) : filteredData.slice(0, 10)).map((item, i) => 
                    groupBy ? (
                      <React.Fragment key={item.groupName}>
                        <tr className="group-row">
                          <td colSpan={selectedFields.length + 1}>
                            📁 {item.groupName} ({item.items.length} записів)
                          </td>
                        </tr>
                        {item.items.slice(0, 3).map((task, ti) => (
                          <tr key={task._id || ti}>
                            <td>{i + 1}.{ti + 1}</td>
                            {getOrderedFields().map(f => (
                              <td key={f.key}>{formatValue(task[f.key], f.type)}</td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ) : (
                      <tr key={item._id || i}>
                        <td>{i + 1}</td>
                        {getOrderedFields().map(f => (
                          <td key={f.key}>{formatValue(item[f.key], f.type)}</td>
                        ))}
                      </tr>
                    )
                  )}
                </tbody>
              </table>
              {filteredData.length > 10 && (
                <div className="preview-more">... та ще {filteredData.length - 10} записів</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Модальне вікно збереження */}
      {showSaveModal && (
        <div className="modal-overlay">
          <div className="save-modal">
            <h3>💾 Зберегти шаблон звіту</h3>
            <input 
              type="text" 
              placeholder="Назва шаблону"
              value={reportName}
              onChange={e => setReportName(e.target.value)}
            />
            <div className="modal-actions">
              <button onClick={() => setShowSaveModal(false)}>Скасувати</button>
              <button className="btn-primary" onClick={saveReport}>Зберегти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
