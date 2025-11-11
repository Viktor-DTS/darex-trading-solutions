import React, { useState, useEffect } from 'react';
import { columnsSettingsAPI } from './utils/columnsSettingsAPI';
import FileUpload from './components/FileUpload';
import { tasksAPI } from './utils/tasksAPI';
import { regionsAPI } from './utils/regionsAPI';
import { logUserAction, EVENT_ACTIONS, ENTITY_TYPES } from './utils/eventLogAPI';
import { getEquipmentTypes } from './utils/equipmentAPI';
import { getEdrpouList, getClientData } from './utils/edrpouAPI';
import MaterialsSelectionModal from './components/MaterialsSelectionModal';
import InvoiceRequestModal from './components/InvoiceRequestModal';
import InvoiceRequestBlock from './components/InvoiceRequestBlock';
import ContractFileSelector from './components/ContractFileSelector';
import ClientDataSelectionModal from './components/ClientDataSelectionModal';
import authenticatedFetch from './utils/api.js';
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
// Функція для генерації наступного номера заявки
const generateNextRequestNumber = async (region) => {
  try {
    const allTasks = await tasksAPI.getAll();
    const regionCode = getRegionCode(region);
    const pattern = new RegExp(`^${regionCode}-(\\d+)$`);
    // Знаходимо всі номери заявок для цього регіону
    const regionNumbers = allTasks
      .map(task => task.requestNumber)
      .filter(number => number && pattern.test(number))
      .map(number => parseInt(number.match(pattern)[1]))
      .sort((a, b) => a - b);
    // Знаходимо наступний номер
    let nextNumber = 1;
    if (regionNumbers.length > 0) {
      nextNumber = Math.max(...regionNumbers) + 1;
    }
    const result = `${regionCode}-${String(nextNumber).padStart(7, '0')}`;
    return result;
  } catch (error) {
    console.error('Помилка при генерації номера заявки:', error);
    const regionCode = getRegionCode(region);
    return `${regionCode}-0000001`;
  }
};
export const fields = [
  { name: 'autoCreatedAt', label: 'Авт. створення заявки', type: 'datetime-local', readOnly: true },
  { name: 'autoCompletedAt', label: 'Авт. виконанно', type: 'datetime-local', readOnly: true },
  { name: 'autoWarehouseApprovedAt', label: 'Авт. затвердження завскладом', type: 'datetime-local', readOnly: true },
  { name: 'autoAccountantApprovedAt', label: 'Авт. затвердження бухгалтером', type: 'datetime-local', readOnly: true },
  { name: 'invoiceRequestDate', label: 'Дата заявки на рахунок', type: 'datetime-local', readOnly: true },
  { name: 'invoiceUploadDate', label: 'Дата завантаження рахунку', type: 'datetime-local', readOnly: true },
  { name: 'status', label: 'Статус заявки', type: 'select', options: ['', 'Заявка', 'В роботі', 'Виконано', 'Заблоковано'] },
  { name: 'requestDate', label: 'Дата заявки', type: 'date' },
  { name: 'date', label: 'Дата проведення робіт', type: 'date' },
  { name: 'paymentDate', label: 'Дата оплати', type: 'date' },
  { name: 'invoiceRecipientDetails', label: 'Реквізити отримувача рахунку в паперовому вигляді', type: 'textarea' },
  { name: 'contractFile', label: 'Файл договору', type: 'file' },
  { name: 'company', label: 'Компанія виконавець', type: 'select', options: ['', 'ДТС', 'Дарекс Енерго', 'інша'] },
  { name: 'edrpou', label: 'ЄДРПОУ', type: 'text' },
  { name: 'debtStatus', label: 'Заборгованість по Акти виконаних робіт (орігінали)', type: 'select', options: ['Заборгованість', 'Документи в наявності'], role: 'accountant' },
  { name: 'debtStatusCheckbox', label: 'Документи в наявності', type: 'checkbox', role: 'accountant' },
  { name: 'requestDesc', label: 'Опис заявки', type: 'textarea' },
  { name: 'serviceRegion', label: 'Регіон сервісного відділу', type: 'select' },
  { name: 'client', label: 'Замовник', type: 'text' },
  { name: 'requestNumber', label: 'Номер заявки/наряду', type: 'text' },
  { name: 'invoice', label: 'Номер рахунку', type: 'text' },
  { name: 'paymentType', label: 'Вид оплати', type: 'select', options: ['не вибрано', 'Безготівка', 'Готівка', 'На карту', 'Інше'] },
  { name: 'address', label: 'Адреса', type: 'textarea' },
  { name: 'equipmentSerial', label: 'Заводський номер обладнання', type: 'text' },
  { name: 'equipment', label: 'Тип обладнання', type: 'text' },
  { name: 'engineModel', label: 'Модель двигуна', type: 'text' },
  { name: 'engineSerial', label: 'Зав. № двигуна', type: 'text' },
  { name: 'customerEquipmentNumber', label: 'інвент. № обладнання від замовника', type: 'text' },
  { name: 'work', label: 'Найменування робіт', type: 'text' },
  { name: 'engineer1', label: 'Сервісний інженер №1', type: 'text' },
  { name: 'engineer2', label: 'Сервісний інженер №2', type: 'text' },
  { name: 'engineer3', label: 'Сервісний інженер №3', type: 'text' },
  { name: 'engineer4', label: 'Сервісний інженер №4', type: 'text' },
  { name: 'engineer5', label: 'Сервісний інженер №5', type: 'text' },
  { name: 'engineer6', label: 'Сервісний інженер №6', type: 'text' },
  { name: 'serviceTotal', label: 'Загальна сума послуги', type: 'text' },
  { name: 'oilType', label: 'Тип оливи', type: 'text' },
  { name: 'oilUsed', label: 'Використано оливи, л', type: 'text' },
  { name: 'oilPrice', label: 'Ціна оливи за 1 л, грн', type: 'text' },
  { name: 'oilTotal', label: 'Загальна сума за оливу, грн', type: 'text', calc: true },
  { name: 'filterName', label: 'Фільтр масл. назва', type: 'text' },
  { name: 'filterCount', label: 'Фільтр масл. штук', type: 'text' },
  { name: 'filterPrice', label: 'Ціна одного масляного фільтра', type: 'text' },
  { name: 'filterSum', label: 'Загальна сума за фільтри масляні', type: 'text', calc: true },
  { name: 'fuelFilterName', label: 'Фільтр палив. назва', type: 'text' },
  { name: 'fuelFilterCount', label: 'Фільтр палив. штук', type: 'text' },
  { name: 'fuelFilterPrice', label: 'Ціна одного паливного фільтра', type: 'text' },
  { name: 'fuelFilterSum', label: 'Загальна сума за паливні фільтри', type: 'text', calc: true },
  { name: 'antifreezeType', label: 'Антифриз тип', type: 'text' },
  { name: 'antifreezeL', label: 'Антифриз, л', type: 'text' },
  { name: 'antifreezePrice', label: 'Ціна антифризу', type: 'text' },
  { name: 'antifreezeSum', label: 'Загальна сума за антифриз', type: 'text', calc: true },
  { name: 'otherMaterials', label: 'Опис інших матеріалів', type: 'text' },
  { name: 'otherSum', label: 'Загальна ціна інших матеріалів', type: 'text' },
  { name: 'workPrice', label: 'Вартість робіт, грн', type: 'text', calc: true },
  { name: 'perDiem', label: 'Добові, грн', type: 'text' },
  { name: 'living', label: 'Проживання, грн', type: 'text' },
  { name: 'otherExp', label: 'Інші витрати, грн', type: 'text' },
  { name: 'carNumber', label: 'Держномер автотранспорту', type: 'text' },
  { name: 'transportKm', label: 'Транспортні витрати, км', type: 'text' },
  { name: 'transportSum', label: 'Загальна вартість тр. витрат', type: 'text' },
  { name: 'approvedByWarehouse', label: 'Підтвердження зав. складу', type: 'select', options: ['На розгляді', 'Підтверджено', 'Відмова'], role: 'warehouse' },
  { name: 'warehouseApprovalDate', label: 'Дата підтвердження зав. складу', type: 'date', role: 'warehouse' },
  { name: 'warehouseComment', label: 'Опис відмови (зав. склад)', type: 'textarea', role: 'warehouse' },
  { name: 'approvedByAccountant', label: 'Підтвердження бухгалтера', type: 'select', options: ['На розгляді', 'Підтверджено', 'Відмова'], role: 'accountant' },
  { name: 'accountantComment', label: 'Опис відмови (бухгалтер)', type: 'textarea', role: 'accountant' },
  { name: 'accountantComments', label: 'Коментарії бухгалтера', type: 'textarea', role: 'accountant' },
  // { name: 'approvedByRegionalManager', label: 'Підтвердження регіонального керівника', type: 'select', options: ['На розгляді', 'Підтверджено', 'Відмова'], role: 'regionalManager' },
  // { name: 'regionalManagerComment', label: 'Опис відмови (регіональний керівник)', type: 'textarea', role: 'regionalManager' },
  { name: 'comments', label: 'Коментарі', type: 'textarea' },
  { name: 'airFilterName', label: 'Фільтр повітряний назва', type: 'text' },
  { name: 'airFilterCount', label: 'Фільтр повітряний штук', type: 'text' },
  { name: 'airFilterPrice', label: 'Ціна одного повітряного фільтра', type: 'text' },
  { name: 'airFilterSum', label: 'Загальна сума за повітряні фільтри', type: 'text', calc: true },
  { name: 'approvalDate', label: 'Дата затвердження', type: 'date' },
  { name: 'bonusApprovalDate', label: 'Дата затвердження премії', type: 'date' },
  { name: 'serviceBonus', label: 'Премія за виконання сервісних робіт, грн', type: 'text' },
  { name: 'needInvoice', label: 'Потрібен рахунок', type: 'checkbox' },
  { name: 'needAct', label: 'Потрібен акт виконаних робіт', type: 'checkbox' },
];
// Додаю поле для детального опису блокування заявки
const blockDescField = { name: 'blockDetail', label: 'Детальний опис блокування заявки', type: 'textarea' };
// Додаємо нове поле для звітного місяця/року
const reportMonthYearField = { name: 'reportMonthYear', label: 'Місяць/рік для звіту', type: 'text', readOnly: true };
// Групи полів
const group1 = ['requestDesc'];
const group2 = ['warehouseComment', 'accountantComment', 'accountantComments'/*, 'regionalManagerComment'*/];
const group3 = ['work', 'engineer1', 'engineer2'];
const group4 = ['oilType', 'oilUsed', 'oilPrice', 'oilTotal'];
const group5 = ['spareParts', 'sparePartsPrice', 'sparePartsTotal'];
const group6 = ['totalAmount'];
// Для textarea
const textareaFields = ['requestDesc','address','warehouseComment','accountantComment','accountantComments'/*,'regionalManagerComment'*/,'comments','blockDetail','otherMaterials'];
const checkboxFields = ['needInvoice', 'needAct'];
// Групи для компактного відображення
const oilGroup = ['oilType', 'oilUsed', 'oilPrice', 'oilTotal'];
const filterGroup = ['filterName', 'filterCount', 'filterPrice', 'filterSum'];
const fuelFilterGroup = ['fuelFilterName', 'fuelFilterCount', 'fuelFilterPrice', 'fuelFilterSum'];
const airFilterGroup = ['airFilterName', 'airFilterCount', 'airFilterPrice', 'airFilterSum'];
const antifreezeGroup = ['antifreezeType', 'antifreezeL', 'antifreezePrice', 'antifreezeSum'];
const transportGroup = ['carNumber', 'transportKm', 'transportSum'];
const expensesGroup = ['perDiem', 'living', 'otherExp', 'bonusApprovalDate'];
const statusGroup = ['status', 'requestDate', 'company'];
const regionClientGroup = ['edrpou', 'client', 'invoice', 'paymentDate', 'invoiceRecipientDetails'];
const debtGroup = ['debtStatus', 'debtStatusCheckbox'];
const paymentEquipmentGroup = ['paymentType', 'serviceTotal', 'customerEquipmentNumber'];
const equipmentGroup = ['equipment', 'equipmentSerial', 'engineModel', 'engineSerial'];
const workEngineersGroup = ['date', 'work', 'engineer1', 'engineer2', 'engineer3', 'engineer4', 'engineer5', 'engineer6'];
const otherMaterialsGroup = ['otherSum', 'otherMaterials'];
const transportWorkPriceGroup = ['carNumber', 'transportKm', 'transportSum', 'workPrice'];
const warehouseGroup = ['approvedByWarehouse', 'warehouseApprovalDate', 'warehouseComment'];
const accountantGroup = ['approvedByAccountant', 'accountantComment', 'accountantComments'];
// const regionalManagerGroup = ['approvedByRegionalManager', 'regionalManagerComment'];
const commentsGroup = ['comments'];
// Додаю групу для першого рядка
const mainHeaderGroup = ['status', 'requestDate', 'company', 'serviceRegion'];
// Додаю mainHeaderRow для першого рядку
const mainHeaderRow = ['status', 'requestDate', 'company', 'serviceRegion'];
// Новий порядок полів
const orderedFields = [
  'requestDesc',
  'address',
  ...regionClientGroup,
  ...debtGroup,
  ...paymentEquipmentGroup,
  ...equipmentGroup,
  ...workEngineersGroup,
  ...oilGroup,
  ...filterGroup,
  ...fuelFilterGroup,
  ...airFilterGroup,
  ...antifreezeGroup,
  ...transportWorkPriceGroup,
  ...expensesGroup,
  ...otherMaterialsGroup,
  ...warehouseGroup,
  ...accountantGroup,
  // ...regionalManagerGroup,
  ...commentsGroup,
];
// Додаємо поле bonusApprovalDate для адміністратора
// const bonusApprovalDateField = { ... } // (залишити, якщо потрібно)
// Для полів, які мають бути з label над input
const labelAboveFields = [
  'status', 'requestDate', 'requestDesc', 'address', 'paymentDate', 'invoiceRecipientDetails', 'paymentType', 'serviceTotal', 'customerEquipmentNumber', 'otherMaterials',
  'debtStatus', 'debtStatusCheckbox',
  'approvedByWarehouse', 'warehouseApprovalDate', 'warehouseComment',
  'approvedByAccountant', 'accountantComment', 'accountantComments',
  // 'approvedByRegionalManager', 'regionalManagerComment', 
  'comments'
];
export default function ModalTaskForm({ open, onClose, onSave, initialData = {}, mode = 'service', user, readOnly = false }) {
  // console.log('[DEBUG] ModalTaskForm - компонент рендериться, open:', open);
  const isRegionReadOnly = user && user.region && user.region !== 'Україна' && user.role !== 'zavsklad';
  function toSelectString(val) {
    if (val === true) return 'Підтверджено';
    if (val === false) return 'Відмова';
    if (val === 'Підтверджено' || val === 'Відмова' || val === 'На розгляді') return val;
    return 'На розгляді';
  }
  // Функція для отримання поточної дати у форматі YYYY-MM-DD
  function getCurrentDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
  // Функція для отримання дати попереднього місяця у форматі YYYY-MM-DD
  function getPreviousMonthDate() {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    return now.toISOString().split('T')[0];
  }
  // Функція для перевірки чи дата в тому ж місяці та році
  function isSameMonthAndYear(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  }
  // Функція для отримання місяця та року у форматі MM.YYYY
  function getMonthYear(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }
  // Функція для отримання попереднього місяця та року у форматі MM.YYYY
  function getPrevMonthYear(date) {
    if (!date) return '';
    const d = new Date(date);
    d.setMonth(d.getMonth() - 1);
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }
  const [form, setForm] = useState(() => {
    const f = { ...initialData };
    if ('approvedByWarehouse' in f) f.approvedByWarehouse = toSelectString(f.approvedByWarehouse);
    if ('approvedByAccountant' in f) f.approvedByAccountant = toSelectString(f.approvedByAccountant);
    if ('approvedByRegionalManager' in f) f.approvedByRegionalManager = toSelectString(f.approvedByRegionalManager);
    // Значення за замовчуванням для компанії
    if (!('company' in f)) f.company = '';
    // Значення за замовчуванням для чекбоксів
    if (!('needInvoice' in f)) f.needInvoice = true; // За замовчуванням активний
    if (!('needAct' in f)) f.needAct = false; // За замовчуванням неактивний
    // Значення за замовчуванням для заборгованості
    if (!('debtStatus' in f)) f.debtStatus = 'Заборгованість'; // За замовчуванням заборгованість
    if (!('debtStatusCheckbox' in f)) f.debtStatusCheckbox = false; // За замовчуванням неактивний
    // Значення за замовчуванням для внутрішніх робіт
    if (!('internalWork' in f)) f.internalWork = false; // За замовчуванням неактивний
    // Значення за замовчуванням для термінової заявки
    if (!('urgentRequest' in f)) f.urgentRequest = false; // За замовчуванням неактивний
    // Автозаповнення дати
    if (f.status === 'Виконано' && 
        f.approvedByWarehouse === 'Підтверджено' && 
        f.approvedByAccountant === 'Підтверджено') {
      const workDate = f.date;
      if (workDate && isSameMonthAndYear(workDate, getCurrentDate())) {
        f.date = getCurrentDate();
      } else {
        f.date = getPreviousMonthDate();
      }
    }
    // Автозаповнення reportMonthYear
    if (f.status === 'Виконано' && 
        f.approvedByWarehouse === 'Підтверджено' && 
        f.approvedByAccountant === 'Підтверджено') {
      const workDate = f.date;
      const now = new Date();
      if (workDate) {
        const workMonthYear = getMonthYear(workDate);
        const nowMonthYear = getMonthYear(now);
        if (workMonthYear === nowMonthYear) {
          f.reportMonthYear = nowMonthYear;
        } else {
          f.reportMonthYear = getPrevMonthYear(now);
        }
      } else {
        f.reportMonthYear = '';
      }
    } else {
      f.reportMonthYear = '';
    }
    return f;
  });
  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem('users');
    return saved ? JSON.parse(saved) : [];
  });
  const [regions, setRegions] = useState(() => {
    const saved = localStorage.getItem('regions');
    return saved ? JSON.parse(saved) : [
      { name: 'Київський' }, 
      { name: 'Одеський' }, 
      { name: 'Львівський' }
    ];
  });
  // --- Додаємо стан для модального вікна відмови ---
  const [rejectModal, setRejectModal] = useState({ open: false, field: '', comment: '' });
  const [error, setError] = useState('');
  // --- Додаю стан для модального вікна з помилками ---
  const [missingFields, setMissingFields] = useState([]);
  const [showMissingModal, setShowMissingModal] = useState(false);
  // --- Додаємо стан для автодоповнення обладнання ---
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [filteredEquipmentTypes, setFilteredEquipmentTypes] = useState([]);
  const [materialsModal, setMaterialsModal] = useState({ open: false, equipmentType: '' });
  const [showInvoiceRequestModal, setShowInvoiceRequestModal] = useState(false);
  
  // --- Додаємо стан для автодоповнення ЄДРПОУ ---
  const [edrpouList, setEdrpouList] = useState([]);
  const [showEdrpouDropdown, setShowEdrpouDropdown] = useState(false);
  const [filteredEdrpouList, setFilteredEdrpouList] = useState([]);
  const [showContractFileSelector, setShowContractFileSelector] = useState(false);
  const [clientDataModal, setClientDataModal] = useState({ open: false, edrpou: '' });
  useEffect(() => {
    const f = { ...initialData };
    console.log('[DEBUG] ModalTaskForm - встановлення форми, initialData:', initialData);
    console.log('[DEBUG] ModalTaskForm - перевірка файлів:', {
      invoiceFile: f.invoiceFile,
      invoiceFileName: f.invoiceFileName,
      invoiceStatus: f.invoiceStatus,
      invoiceRequestId: f.invoiceRequestId,
      actFile: f.actFile,
      actFileName: f.actFileName,
      actStatus: f.actStatus,
      id: f.id,
      _id: f._id
    });
    
    // Завантажуємо дані про файли з InvoiceRequest якщо є ID заявки
    const taskId = f.id || f._id;
    if (taskId && (!f.invoiceFile || !f.actFile)) {
      console.log('[DEBUG] ModalTaskForm - завантажуємо дані про файли для taskId:', taskId);
      loadInvoiceRequestDataByTaskId(taskId).then(invoiceData => {
        if (invoiceData) {
          console.log('[DEBUG] ModalTaskForm - знайдено дані InvoiceRequest:', invoiceData);
          const updates = {
            invoiceRequestId: invoiceData._id
          };
          
          // Оновлюємо дані про файл рахунку
          if (invoiceData.invoiceFile) {
            updates.invoiceFile = invoiceData.invoiceFile;
            updates.invoiceFileName = invoiceData.invoiceFileName;
            updates.invoiceStatus = invoiceData.status;
            // Автозаповнення поля "Номер рахунку" в основній формі
            if (invoiceData.invoiceNumber) {
              updates.invoice = invoiceData.invoiceNumber;
              console.log('[DEBUG] ModalTaskForm - автозаповнено поле "Номер рахунку":', invoiceData.invoiceNumber);
            }
            console.log('[DEBUG] ModalTaskForm - оновлено дані про файл рахунку');
          }
          
          // Оновлюємо дані про файл акту
          if (invoiceData.actFile) {
            updates.actFile = invoiceData.actFile;
            updates.actFileName = invoiceData.actFileName;
            updates.actStatus = invoiceData.status;
            console.log('[DEBUG] ModalTaskForm - оновлено дані про файл акту');
          }
          
          setForm(prev => ({
            ...prev,
            ...updates
          }));
        } else {
          console.log('[DEBUG] ModalTaskForm - дані InvoiceRequest не знайдено для taskId:', taskId);
        }
      }).catch(error => {
        console.error('[ERROR] ModalTaskForm - помилка завантаження даних про файли:', error);
      });
    }
    
    if ('approvedByWarehouse' in f) f.approvedByWarehouse = toSelectString(f.approvedByWarehouse);
    if ('approvedByAccountant' in f) f.approvedByAccountant = toSelectString(f.approvedByAccountant);
    if ('approvedByRegionalManager' in f) f.approvedByRegionalManager = toSelectString(f.approvedByRegionalManager);
    // Автозаповнення дати при зміні статусу або підтверджень
    if (f.status === 'Виконано' && 
        f.approvedByWarehouse === 'Підтверджено' && 
        f.approvedByAccountant === 'Підтверджено') {
      const workDate = f.date;
      if (workDate && isSameMonthAndYear(workDate, getCurrentDate())) {
        f.date = getCurrentDate();
      } else {
        f.date = getPreviousMonthDate();
      }
    }
    // Автозаповнення reportMonthYear
    if (f.status === 'Виконано' && 
        f.approvedByWarehouse === 'Підтверджено' && 
        f.approvedByAccountant === 'Підтверджено') {
      const workDate = f.date;
      const now = new Date();
      if (workDate) {
        const workMonthYear = getMonthYear(workDate);
        const nowMonthYear = getMonthYear(now);
        if (workMonthYear === nowMonthYear) {
          f.reportMonthYear = nowMonthYear;
        } else {
          f.reportMonthYear = getPrevMonthYear(now);
        }
      } else {
        f.reportMonthYear = '';
      }
    } else {
      f.reportMonthYear = '';
    }
    setForm(f);
  }, [initialData, open]);
  useEffect(() => {
    if (open) {
      // Примусово завантажуємо користувачів при відкритті модального вікна
      console.log('[DEBUG] ModalTaskForm - відкрито модальне вікно, завантажуємо користувачів...');
      console.log('[DEBUG] ModalTaskForm - поточний користувач:', user?.login, 'роль:', user?.role);
      
      // Спочатку перевіряємо localStorage
      const cachedUsers = localStorage.getItem('users');
      if (cachedUsers) {
        try {
          const parsedUsers = JSON.parse(cachedUsers);
          console.log('[DEBUG] ModalTaskForm - користувачі з кешу:', parsedUsers.length);
          setUsers(parsedUsers);
        } catch (error) {
          console.error('[ERROR] ModalTaskForm - помилка парсингу кешу:', error);
        }
      }
      
      // Завжди завантажуємо свіжі дані з API
      columnsSettingsAPI.getAllUsers().then(users => {
        console.log('[DEBUG] ModalTaskForm - завантажено користувачів з API:', users.length);
        console.log('[DEBUG] ModalTaskForm - користувачі з роллю service:', users.filter(u => u.role === 'service').length);
        console.log('[DEBUG] ModalTaskForm - всі користувачі:', users.map(u => ({ login: u.login, role: u.role, region: u.region })));
        setUsers(users);
        // Зберігаємо в localStorage для швидкого доступу
        localStorage.setItem('users', JSON.stringify(users));
      }).catch(error => {
        console.error('[ERROR] ModalTaskForm - помилка завантаження користувачів:', error);
        // Якщо API не працює, використовуємо кеш
        if (cachedUsers) {
          try {
            const parsedUsers = JSON.parse(cachedUsers);
            setUsers(parsedUsers);
          } catch (parseError) {
            console.error('[ERROR] ModalTaskForm - помилка парсингу кешу при fallback:', parseError);
            setUsers([]);
          }
        } else {
          setUsers([]);
        }
      });
      
      regionsAPI.getAll().then(setRegions).catch(() => setRegions([]));
    }
  }, [open]);
  // useEffect для автоматичного заповнення номера заявки
  useEffect(() => {
    const autoFillRequestNumber = async () => {
      // Тільки для нових завдань (коли немає ID) і якщо номер заявки порожній
      if (!initialData.id && !form.requestNumber && form.serviceRegion) {
        try {
          const nextNumber = await generateNextRequestNumber(form.serviceRegion);
          setForm(prev => ({ ...prev, requestNumber: nextNumber }));
        } catch (error) {
          console.error('Помилка при автозаповненні номера заявки:', error);
        }
      } else {
      }
    };
    autoFillRequestNumber();
  }, [form.serviceRegion, initialData.id, form.requestNumber]);
  useEffect(() => {
    // Підставляти регіон лише якщо створюється нова заявка (form.serviceRegion порожнє і initialData.serviceRegion порожнє)
    if (
      user && user.region && user.region !== 'Україна' &&
      !form.serviceRegion && !initialData.serviceRegion
    ) {
      setForm(f => ({ ...f, serviceRegion: user.region }));
    }
  }, [user, form.serviceRegion, initialData.serviceRegion]);
  // Очищаємо поля інженерів при зміні регіону заявки
  useEffect(() => {
    if (form.serviceRegion) {
      const currentEngineers = users.filter(u => u.role === 'service');
      const availableEngineers = currentEngineers.filter(u => {
        if (form.serviceRegion === 'Україна') return true;
        return u.region === form.serviceRegion;
      });
      // Якщо вибраний інженер1 не доступний у новому регіоні, очищаємо поле
      if (form.engineer1 && !availableEngineers.some(u => u.name === form.engineer1)) {
        setForm(f => ({ ...f, engineer1: '' }));
      }
      // Якщо вибраний інженер2 не доступний у новому регіоні, очищаємо поле
      if (form.engineer2 && !availableEngineers.some(u => u.name === form.engineer2)) {
        setForm(f => ({ ...f, engineer2: '' }));
      }
    }
  }, [form.serviceRegion, users]);
  // --- Завантаження користувачів з бази ---
  useEffect(() => {
    if (open && users.length === 0) {
      console.log('[DEBUG] ModalTaskForm - користувачі не завантажені, завантажуємо...');
      columnsSettingsAPI.getAllUsers().then(users => {
        console.log('[DEBUG] ModalTaskForm - завантажено користувачів (fallback):', users.length);
        setUsers(users);
        localStorage.setItem('users', JSON.stringify(users));
      }).catch(error => {
        console.error('[ERROR] ModalTaskForm - помилка завантаження користувачів (fallback):', error);
        setUsers([]);
      });
    }
  }, [open, users.length]);

  // --- Додатковий useEffect для примусового завантаження користувачів ---
  useEffect(() => {
    if (open) {
      // Додаткова перевірка через 100мс після відкриття
      const timer = setTimeout(() => {
        if (users.length === 0) {
          console.log('[DEBUG] ModalTaskForm - користувачі все ще не завантажені, примусово завантажуємо...');
          columnsSettingsAPI.getAllUsers().then(users => {
            console.log('[DEBUG] ModalTaskForm - примусово завантажено користувачів:', users.length);
            setUsers(users);
            localStorage.setItem('users', JSON.stringify(users));
          }).catch(error => {
            console.error('[ERROR] ModalTaskForm - помилка примусового завантаження користувачів:', error);
          });
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [open]);
  // --- Завантаження типів обладнання ---
  useEffect(() => {
    console.log('[DEBUG] ModalTaskForm - useEffect для типів обладнання виконується, open:', open);
    if (open) {
      console.log('[DEBUG] ModalTaskForm - завантажуємо типи обладнання...');
      getEquipmentTypes()
        .then(types => {
          console.log('[DEBUG] ModalTaskForm - отримано типів обладнання:', types.length, types);
          setEquipmentTypes(types);
        })
        .catch(error => {
          console.error('[ERROR] ModalTaskForm - помилка завантаження типів обладнання:', error);
          setEquipmentTypes([]);
        });
    } else {
      console.log('[DEBUG] ModalTaskForm - форма закрита, не завантажуємо типи обладнання');
    }
  }, [open]);

  // --- Завантаження списку ЄДРПОУ ---
  useEffect(() => {
    console.log('[DEBUG] ModalTaskForm - useEffect для ЄДРПОУ виконується, open:', open);
    if (open) {
      console.log('[DEBUG] ModalTaskForm - завантажуємо список ЄДРПОУ...');
      getEdrpouList()
        .then(edrpou => {
          console.log('[DEBUG] ModalTaskForm - отримано ЄДРПОУ:', edrpou.length, edrpou);
          setEdrpouList(edrpou);
        })
        .catch(error => {
          console.error('[ERROR] ModalTaskForm - помилка завантаження ЄДРПОУ:', error);
          setEdrpouList([]);
        });
    } else {
      console.log('[DEBUG] ModalTaskForm - форма закрита, не завантажуємо ЄДРПОУ');
    }
  }, [open]);
  // --- Список сервісних інженерів для вибору ---
  const serviceEngineers = users.filter(u => {
    if (u.role !== 'service') return false;
    if (user?.region === 'Україна') return true;
    if (user?.region && user.region !== 'Україна') {
      return u.region === user.region;
    }
    return true;
  });
  if (!open) return null;
  // Визначаємо, які поля заблоковані
  const isReadOnly = name => {
    // Якщо режим readOnly, всі поля тільки для читання
    if (readOnly) {
      return true;
    }
    // Поле bonusApprovalDate доступне тільки для адміністратора
    if (name === 'bonusApprovalDate') {
      return mode !== 'admin' && user?.role !== 'administrator';
    }
    if (mode === 'regionalManager' || mode === 'regional') {
      // Доступні тільки ці два поля (приховано)
      return true; // !(name === 'approvedByRegionalManager' || name === 'regionalManagerComment');
    }
    if (mode === 'warehouse') {
      return !(name === 'approvedByWarehouse' || name === 'warehouseComment');
    }
    if (mode === 'accountant' || mode === 'buhgalteria') {
      // Бухгалтер має доступ до всіх полів окрім полів складу
      const warehouseFields = ['approvedByWarehouse', 'warehouseComment'];
      if (warehouseFields.includes(name)) {
        return true; // Заблоковано для бухгалтера
      }
      
      // Якщо це режим редагування тільки заборгованості, блокуємо всі поля окрім полів заборгованості
      if (form._debtEditOnly) {
        const debtFields = ['debtStatus', 'debtStatusCheckbox'];
        if (!debtFields.includes(name)) {
          return true; // Заблоковано всі поля окрім заборгованості
        }
      }
      
      return false; // Всі інші поля доступні для редагування
    }
    // Адміністратор має доступ до всіх полів
    if (mode === 'admin' || user?.role === 'administrator') {
      return false;
    }
    // Додаємо логіку для поля дати
    if (name === 'date' && 
        form.status === 'Виконано' && 
        form.approvedByWarehouse === 'Підтверджено' && 
        form.approvedByAccountant === 'Підтверджено') {
      return true;
    }
    // Для оператора поле 'client' (Замовник) завжди доступне для редагування
    if (mode === 'operator' && name === 'client') return false;
    // Спеціальна обробка для полів заборгованості - вони відображаються для всіх, але редагування тільки для бухгалтера
    if (name === 'debtStatus' || name === 'debtStatusCheckbox') {
      return mode !== 'accountant' && mode !== 'buhgalteria';
    }
    if (fields.find(f => f.name === name && f.role) && (!mode || fields.find(f => f.name === name).role !== mode)) return true;
    if (mode === 'operator') {
      // Оператор НЕ може редагувати поля підтвердження від інших ролей:
      const operatorReadOnlyFields = [
        'approvedByWarehouse', 'warehouseComment',
        'approvedByAccountant', 'accountantComment', 'accountantComments'
        // 'approvedByRegionalManager', 'regionalManagerComment'
      ];
      return operatorReadOnlyFields.includes(name);
    }
    // Видаляємо перевірку для режиму service, щоб поля requestDate та requestDesc були доступні для редагування
    return false;
  };
  const sortedFields = [...fields].sort((a, b) => {
    const order = {
      status: 0,
      requestDate: 1,
      requestDesc: 2,
      serviceRegion: 3,
      customer: 4,
      invoiceNumber: 5,
      paymentType: 6,
      address: 7,
      equipmentSerial: 8,
      equipment: 9,
      warehouseComment: 11,
      accountantComment: 12,
      regionalManagerComment: 13
    };
    return (order[a.name] || 99) - (order[b.name] || 99);
  });
  // --- Додаємо обробник для select з відмовою ---
  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    
    // Автоматичне заповнення поля "Номер рахунку" при виборі "Готівка"
    if (name === 'paymentType') {
      if (value === 'Готівка') {
        setForm({ ...form, [name]: value, invoice: 'Не потребує, інша форма оплати' });
        return;
      } else if (form.paymentType === 'Готівка' && value !== 'Готівка') {
        // Очищаємо поле "Номер рахунку" якщо змінюємо з "Готівка" на інший вид оплати
        setForm({ ...form, [name]: value, invoice: '' });
        return;
      }
    }
    
    // Спеціальна обробка для поля обладнання
    if (name === 'equipment') {
      console.log('[DEBUG] ModalTaskForm - зміна поля обладнання:', value);
      console.log('[DEBUG] ModalTaskForm - доступні типи обладнання:', equipmentTypes.length);
      setForm({ ...form, [name]: value });
      // Фільтруємо типи обладнання для автодоповнення
      if (value.trim()) {
        const filtered = equipmentTypes.filter(type => 
          type.toLowerCase().includes(value.toLowerCase())
        );
        console.log('[DEBUG] ModalTaskForm - відфільтровані типи:', filtered.length, filtered);
        setFilteredEquipmentTypes(filtered);
        setShowEquipmentDropdown(filtered.length > 0);
      } else {
        setShowEquipmentDropdown(false);
        setFilteredEquipmentTypes([]);
      }
      return;
    }

    // Спеціальна обробка для поля ЄДРПОУ
    if (name === 'edrpou') {
      console.log('[DEBUG] ModalTaskForm - зміна поля ЄДРПОУ:', value);
      console.log('[DEBUG] ModalTaskForm - доступні ЄДРПОУ:', edrpouList.length);
      setForm({ ...form, [name]: value });
      // Фільтруємо ЄДРПОУ для автодоповнення
      if (value.trim()) {
        const filtered = edrpouList.filter(edrpou => 
          edrpou.toLowerCase().includes(value.toLowerCase())
        );
        console.log('[DEBUG] ModalTaskForm - відфільтровані ЄДРПОУ:', filtered.length, filtered);
        setFilteredEdrpouList(filtered);
        setShowEdrpouDropdown(filtered.length > 0);
      } else {
        setShowEdrpouDropdown(false);
        setFilteredEdrpouList([]);
      }
      return;
    }
    // Якщо це поле підтвердження і вибрано "Відмова" — показати модалку
    if (
      (name === 'approvedByWarehouse' || name === 'approvedByAccountant' || name === 'approvedByRegionalManager') &&
      value === 'Відмова'
    ) {
      setRejectModal({ open: true, field: name, comment: '' });
      // Не оновлюємо форму одразу, чекаємо на коментар
      return;
    }
    // Якщо статус змінюється з "Відмова" на інший — очищаємо відповідний comment
    if (name === 'approvedByWarehouse' && form.approvedByWarehouse === 'Відмова' && value !== 'Відмова') {
      setForm({ ...form, [name]: value, warehouseComment: '' });
      return;
    }
    
    // Автоматичне заповнення дати підтвердження зав. складу
    if (name === 'approvedByWarehouse') {
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD формат
      if (value === 'Підтверджено') {
        setForm({ ...form, [name]: value, warehouseApprovalDate: currentDate });
        return;
      } else if (value === 'Відмова') {
        setForm({ ...form, [name]: value, warehouseApprovalDate: '' });
        return;
      } else {
        // Для "На розгляді" не змінюємо дату
        setForm({ ...form, [name]: value });
        return;
      }
    }
    if (name === 'approvedByAccountant' && form.approvedByAccountant === 'Відмова' && value !== 'Відмова') {
      setForm({ ...form, [name]: value, accountantComment: '', accountantComments: '' });
      return;
    }
    // if (name === 'approvedByRegionalManager' && form.approvedByRegionalManager === 'Відмова' && value !== 'Відмова') {
    //   setForm({ ...form, [name]: value, regionalManagerComment: '' });
    //   return;
    // }
    // Обробка чекбоксів
    if (type === 'checkbox') {
      setForm({ ...form, [name]: checked });
      // Синхронізація між чекбоксом та селектом для заборгованості
      if (name === 'debtStatusCheckbox') {
        setForm({ 
          ...form, 
          [name]: checked,
          debtStatus: checked ? 'Документи в наявності' : 'Заборгованість'
        });
      }
    } else {
      setForm({ ...form, [name]: value });
      // Синхронізація між селектом та чекбоксом для заборгованості
      if (name === 'debtStatus') {
        setForm({ 
          ...form, 
          [name]: value,
          debtStatusCheckbox: value === 'Документи в наявності'
        });
      }
    }
  };
  // --- Обробник вибору обладнання з автодоповнення ---
  const handleEquipmentSelect = (equipmentType) => {
    console.log('[DEBUG] handleEquipmentSelect - ФУНКЦІЯ ВИКЛИКАНА з обладнанням:', equipmentType);
    setForm({ ...form, equipment: equipmentType });
    setShowEquipmentDropdown(false);
    setFilteredEquipmentTypes([]);
    // Відкриваємо модальне вікно для вибору матеріалів
    console.log('[DEBUG] handleEquipmentSelect - відкриваємо модальне вікно матеріалів');
    setMaterialsModal({ open: true, equipmentType });
    console.log('[DEBUG] handleEquipmentSelect - materialsModal встановлено:', { open: true, equipmentType });
  };

  // --- Обробник вибору ЄДРПОУ з автодоповнення ---
  const handleEdrpouSelect = (edrpou) => {
    console.log('[DEBUG] handleEdrpouSelect - ФУНКЦІЯ ВИКЛИКАНА з ЄДРПОУ:', edrpou);
    setForm({ ...form, edrpou: edrpou });
    setShowEdrpouDropdown(false);
    setFilteredEdrpouList([]);
    
    // Відкриваємо модальне вікно для вибору даних клієнта
    console.log('[DEBUG] handleEdrpouSelect - відкриваємо модальне вікно даних клієнта');
    setClientDataModal({ open: true, edrpou });
    console.log('[DEBUG] handleEdrpouSelect - clientDataModal встановлено:', { open: true, edrpou });
  };
  // --- Обробник застосування матеріалів ---
  const handleMaterialsApply = (formUpdates) => {
    setForm(prev => ({ ...prev, ...formUpdates }));
  };

  // --- Обробник застосування даних клієнта ---
  const handleClientDataApply = (formUpdates) => {
    console.log('[DEBUG] handleClientDataApply - отримано оновлення:', formUpdates);
    
    setForm(prev => {
      const newForm = { ...prev, ...formUpdates };
      
      // Якщо є матеріали, застосовуємо їх до форми
      if (formUpdates.materials) {
        const materials = formUpdates.materials;
        
        // Застосовуємо матеріали до відповідних полів
        if (materials.oil && materials.oil.type && materials.oil.quantity) {
          newForm.oilType = materials.oil.type;
          newForm.oilUsed = materials.oil.quantity;
        }
        
        if (materials.oilFilter && materials.oilFilter.name && materials.oilFilter.quantity) {
          newForm.filterName = materials.oilFilter.name;
          newForm.filterCount = materials.oilFilter.quantity;
        }
        
        if (materials.fuelFilter && materials.fuelFilter.name && materials.fuelFilter.quantity) {
          newForm.fuelFilterName = materials.fuelFilter.name;
          newForm.fuelFilterCount = materials.fuelFilter.quantity;
        }
        
        if (materials.airFilter && materials.airFilter.name && materials.airFilter.quantity) {
          newForm.airFilterName = materials.airFilter.name;
          newForm.airFilterCount = materials.airFilter.quantity;
        }
        
        if (materials.antifreeze && materials.antifreeze.type && materials.antifreeze.quantity) {
          newForm.antifreezeType = materials.antifreeze.type;
          newForm.antifreezeL = materials.antifreeze.quantity;
        }
        
        if (materials.otherMaterials) {
          newForm.otherMaterials = materials.otherMaterials;
        }
        
        console.log('[DEBUG] handleClientDataApply - застосовано матеріали:', {
          oilType: newForm.oilType,
          oilUsed: newForm.oilUsed,
          filterName: newForm.filterName,
          filterCount: newForm.filterCount,
          fuelFilterName: newForm.fuelFilterName,
          fuelFilterCount: newForm.fuelFilterCount,
          airFilterName: newForm.airFilterName,
          airFilterCount: newForm.airFilterCount,
          antifreezeType: newForm.antifreezeType,
          antifreezeL: newForm.antifreezeL,
          otherMaterials: newForm.otherMaterials
        });
      }
      
      return newForm;
    });
  };

  // --- Обробник вибору файлу договору ---
  const handleContractFileSelect = (contractFile) => {
    console.log('[DEBUG] handleContractFileSelect - ФУНКЦІЯ ВИКЛИКАНА з файлом:', contractFile);
    setForm(prev => ({ ...prev, contractFile: contractFile.url }));
    setShowContractFileSelector(false);
  };
  // --- Підтвердження відмови ---
  const handleRejectConfirm = () => {
    let newForm = { ...form };
    if (rejectModal.field === 'approvedByWarehouse') {
      newForm.approvedByWarehouse = 'Відмова';
      newForm.warehouseComment = rejectModal.comment;
    }
    if (rejectModal.field === 'approvedByAccountant') {
      newForm.approvedByAccountant = 'Відмова';
      newForm.accountantComment = rejectModal.comment;
      newForm.accountantComments = rejectModal.comment;
    }
    // if (rejectModal.field === 'approvedByRegionalManager') {
    //   newForm.approvedByRegionalManager = 'Відмова';
    //   newForm.regionalManagerComment = rejectModal.comment;
    // }
    setForm(newForm);
    setRejectModal({ open: false, field: '', comment: '' });
  };
  // --- Відміна відмови ---
  const handleRejectCancel = () => {
    setRejectModal({ open: false, field: '', comment: '' });
  };
  const handleSubmit = async e => {
    e.preventDefault();
    const required = [
      { name: 'company', label: 'Компанія виконавець' },
      { name: 'status', label: 'Статус заявки' },
    ];
    if (mode === 'operator') {
      required.push({ name: 'serviceRegion', label: 'Регіон сервісного відділу' });
    }
    const missing = required.filter(f => !form[f.name]);
    
    // Додаткова перевірка: якщо статус "Виконано", то поле "Дата проведення робіт" обов'язкове
    if (form.status === 'Виконано' && !form.date) {
      missing.push({ name: 'date', label: 'Дата проведення робіт' });
    }
    
    if (missing.length > 0) {
      setMissingFields(missing.map(f => f.label));
      setShowMissingModal(true);
      return;
    }
    setError('');
    // --- Автоматичне встановлення bonusApprovalDate ---
    let bonusApprovalDate = form.bonusApprovalDate;
    if (
      form.status === 'Виконано' &&
      form.approvedByWarehouse === 'Підтверджено' &&
      form.approvedByAccountant === 'Підтверджено'
    ) {
      const d = new Date();
      const currentDay = d.getDate();
      const currentMonth = d.getMonth() + 1;
      const currentYear = d.getFullYear();
      
      // Перевіряємо дату виконання робіт
      const workDate = new Date(form.date);
      const workMonth = workDate.getMonth() + 1;
      const workYear = workDate.getFullYear();
      
      // Нова логіка: якщо день >= 16 і місяць затвердження != місяць виконання
      if (currentDay >= 16 && (workMonth !== currentMonth || workYear !== currentYear)) {
        // Встановлюємо поточний місяць + 1
        if (currentMonth === 12) {
          bonusApprovalDate = `01-${currentYear + 1}`;
        } else {
          bonusApprovalDate = `${String(currentMonth + 1).padStart(2, '0')}-${currentYear}`;
        }
      } else {
        // Стара логіка: поточний місяць
        bonusApprovalDate = `${String(currentMonth).padStart(2, '0')}-${currentYear}`;
      }
    }
    // Розрахунок кожної суми на льоту
    const oilTotal = parseNumber(form.oilUsed) * parseNumber(form.oilPrice);
    const filterSum = parseNumber(form.filterCount) * parseNumber(form.filterPrice);
    const fuelFilterSum = parseNumber(form.fuelFilterCount) * parseNumber(form.fuelFilterPrice);
    const airFilterSum = parseNumber(form.airFilterCount) * parseNumber(form.airFilterPrice);
    const antifreezeSum = parseNumber(form.antifreezeL) * parseNumber(form.antifreezePrice);
    // Загальна сума послуги береться з форми (ручне введення)
    const serviceTotal = parseNumber(form.serviceTotal);
    // Вартість робіт розраховується
    // Якщо чекбокс "Внутрішні роботи" активований, то workPrice = serviceTotal (без витрат)
    let workPrice;
    if (form.internalWork) {
      workPrice = serviceTotal;
    } else {
      // Вартість робіт розраховується як різниця
      workPrice = serviceTotal - (
        oilTotal +
        filterSum +
        fuelFilterSum +
        airFilterSum +
        antifreezeSum +
        parseNumber(form.otherSum) +
        parseNumber(form.perDiem) +
        parseNumber(form.living) +
        parseNumber(form.otherExp) +
        parseNumber(form.transportSum)
      );
    }
    // --- Автоматичне заповнення коментарів при підтвердженні ---
    const finalForm = { ...form };
    // Автоматично заповнюємо коментарі при підтвердженні
    if (form.approvedByWarehouse === 'Підтверджено' && !form.warehouseComment) {
      finalForm.warehouseComment = `Погоджено, претензій не маю. ${user?.name || 'Користувач'}`;
    }
    if (form.approvedByAccountant === 'Підтверджено' && !form.accountantComment) {
      finalForm.accountantComment = `Погоджено, претензій не маю. ${user?.name || 'Користувач'}`;
      finalForm.accountantComments = `Погоджено, претензій не маю. ${user?.name || 'Користувач'}`;
    }
    // if (form.approvedByRegionalManager === 'Підтверджено' && !form.regionalManagerComment) {
    //   finalForm.regionalManagerComment = `Погоджено, претензій не маю. ${user?.name || 'Користувач'}`;
    // }
    // --- Завантаження файлу договору на сервер ---
    let contractFileUrl = null;
    console.log('[DEBUG] ModalTaskForm - перевірка файлу договору:', {
      hasFile: !!form.contractFile,
      isFile: form.contractFile instanceof File,
      fileDetails: form.contractFile ? {
        name: form.contractFile.name,
        size: form.contractFile.size,
        type: form.contractFile.type
      } : null
    });
    
    if (form.contractFile && form.contractFile instanceof File) {
      try {
        console.log('[DEBUG] ModalTaskForm - завантажуємо файл договору на сервер:', form.contractFile.name);
        const uploadFormData = new FormData();
        uploadFormData.append('file', form.contractFile);
        uploadFormData.append('type', 'contract');
        
        const API_BASE_URL = window.location.hostname === 'localhost' 
          ? 'http://localhost:3001/api'
          : 'https://darex-trading-solutions.onrender.com/api';
        
        console.log('[DEBUG] ModalTaskForm - відправляємо запит на /api/files/upload-contract');
        const uploadResponse = await fetch(`${API_BASE_URL}/files/upload-contract`, {
          method: 'POST',
          body: uploadFormData
        });
        
        console.log('[DEBUG] ModalTaskForm - отримано відповідь:', uploadResponse.status, uploadResponse.statusText);
        
        // Спочатку отримуємо текст відповіді
        const responseText = await uploadResponse.text();
        console.log('[DEBUG] ModalTaskForm - текст відповіді:', responseText);
        
        if (uploadResponse.ok) {
          try {
            const uploadResult = JSON.parse(responseText);
            contractFileUrl = uploadResult.url;
            console.log('[DEBUG] ModalTaskForm - файл договору завантажено:', contractFileUrl);
            console.log('[DEBUG] ModalTaskForm - повна відповідь:', uploadResult);
          } catch (parseError) {
            console.error('[ERROR] ModalTaskForm - помилка парсингу JSON:', parseError);
            console.error('[ERROR] ModalTaskForm - текст відповіді:', responseText);
          }
        } else {
          console.error('[ERROR] ModalTaskForm - помилка завантаження файлу договору:', {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            responseText: responseText
          });
        }
      } catch (error) {
        console.error('[ERROR] ModalTaskForm - помилка завантаження файлу договору:', error);
      }
    } else if (form.contractFile) {
      console.log('[DEBUG] ModalTaskForm - файл договору вже завантажений (URL):', form.contractFile);
      contractFileUrl = form.contractFile.url || form.contractFile;
    }

    onSave({
      ...finalForm,
      contractFile: contractFileUrl || form.contractFile, // Зберігаємо URL або оригінальний файл
      bonusApprovalDate,
      oilTotal,
      filterSum,
      fuelFilterSum,
      airFilterSum,
      antifreezeSum,
      serviceTotal,
      workPrice
    });
    // Логуємо створення або редагування заявки
    const action = form.id ? EVENT_ACTIONS.UPDATE : EVENT_ACTIONS.CREATE;
    const description = form.id ? 
      `Редагування заявки: ${form.requestNumber || 'Без номера'} - ${form.client || 'Без клієнта'}` :
      `Створення нової заявки: ${form.requestNumber || 'Без номера'} - ${form.client || 'Без клієнта'}`;
    logUserAction(user, action, ENTITY_TYPES.TASK, form.id, description, {
      requestNumber: form.requestNumber,
      client: form.client,
      work: form.work,
      status: form.status,
      serviceTotal: form.serviceTotal,
      company: form.company
    });
    onClose();
  };

  // Функція для завантаження даних про файл рахунку по ID заявки
  const loadInvoiceRequestDataByTaskId = async (taskId) => {
    try {
      console.log('[DEBUG] ModalTaskForm - завантаження даних InvoiceRequest для taskId:', taskId);
      
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001/api'
        : 'https://darex-trading-solutions.onrender.com/api';
      
      const response = await authenticatedFetch(`${API_BASE_URL}/invoice-requests?taskId=${taskId}`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('[DEBUG] ModalTaskForm - отримано дані InvoiceRequest для taskId:', result);
        if (result.success && result.data && result.data.length > 0) {
          return result.data[0]; // Повертаємо перший знайдений запит
        }
        return null;
      } else {
        console.error('[ERROR] ModalTaskForm - помилка завантаження InvoiceRequest для taskId:', response.status);
        return null;
      }
    } catch (error) {
      console.error('[ERROR] ModalTaskForm - помилка завантаження InvoiceRequest для taskId:', error);
      return null;
    }
  };

  // Функція для завантаження даних про файл рахунку
  const loadInvoiceRequestData = async (invoiceRequestId) => {
    try {
      console.log('[DEBUG] ModalTaskForm - завантаження даних InvoiceRequest для ID:', invoiceRequestId);
      
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001/api'
        : 'https://darex-trading-solutions.onrender.com/api';
      
      const response = await authenticatedFetch(`${API_BASE_URL}/invoice-requests/${invoiceRequestId}`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('[DEBUG] ModalTaskForm - отримано дані InvoiceRequest:', result);
        return result.data;
      } else {
        console.error('[ERROR] ModalTaskForm - помилка завантаження InvoiceRequest:', response.status);
        return null;
      }
    } catch (error) {
      console.error('[ERROR] ModalTaskForm - помилка завантаження InvoiceRequest:', error);
      return null;
    }
  };

  // Функція для обробки запиту рахунку
  const handleInvoiceRequest = async (invoiceData) => {
    try {
      console.log('[DEBUG] ModalTaskForm - створення запиту на рахунок:', invoiceData);
      
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001/api'
        : 'https://darex-trading-solutions.onrender.com/api';
      
      const response = await authenticatedFetch(`${API_BASE_URL}/invoice-requests`, {
        method: 'POST',
        body: JSON.stringify(invoiceData)
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('[DEBUG] ModalTaskForm - запит на рахунок створено успішно:', result);
        alert('Запит на рахунок успішно створено! Бухгалтер отримає сповіщення.');
        
        // Оновлюємо заявку щоб показати що запит вже подано
        setForm(prev => ({ ...prev, invoiceRequested: true }));
      } else {
        const error = await response.json();
        console.error('[ERROR] ModalTaskForm - помилка створення запиту на рахунок:', error);
        throw new Error(error.message || 'Помилка створення запиту на рахунок');
      }
      
    } catch (error) {
      console.error('[ERROR] ModalTaskForm - помилка створення запиту на рахунок:', error);
      alert(`Помилка: ${error.message}`);
      throw error;
    }
  };

  // Функція для правильного парсингу чисел з комою як роздільником
  const parseNumber = (value) => {
    if (!value) return 0;
    // Замінюємо кому на крапку для правильного парсингу
    const normalizedValue = String(value).replace(',', '.');
    return parseFloat(normalizedValue) || 0;
  };

  // Функція для форматування чисел з двома знаками після коми
  const formatNumber = (value) => {
    if (value === 0 || value === '0') return '0,00';
    return Number(value).toFixed(2).replace('.', ',');
  };

  // Додаю розрахунок для полів
  const calcOilTotal = () => parseNumber(form.oilUsed) * parseNumber(form.oilPrice);
  const calcFilterSum = () => parseNumber(form.filterCount) * parseNumber(form.filterPrice);
  const calcFuelFilterSum = () => parseNumber(form.fuelFilterCount) * parseNumber(form.fuelFilterPrice);
  const calcAirFilterSum = () => parseNumber(form.airFilterCount) * parseNumber(form.airFilterPrice);
  const calcAntifreezeSum = () => parseNumber(form.antifreezeL) * parseNumber(form.antifreezePrice);
  const calcWorkPrice = () => {
    const serviceTotal = parseNumber(form.serviceTotal);
    // Якщо чекбокс "Внутрішні роботи" активований, то workPrice = serviceTotal (без витрат)
    if (form.internalWork) {
      return serviceTotal;
    }
    const totalExpenses = 
      calcOilTotal() +
      calcFilterSum() +
      calcFuelFilterSum() +
      calcAirFilterSum() +
      calcAntifreezeSum() +
      parseNumber(form.otherSum) +
      parseNumber(form.perDiem) +
      parseNumber(form.living) +
      parseNumber(form.otherExp) +
      parseNumber(form.transportSum);
    return serviceTotal - totalExpenses;
  };
  return (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto'}}>
      <style>{`
        .modal-task-form {
          font-size: 0.85rem; /* Зменшуємо базовий розмір шрифту на 15% */
        }
        .modal-task-form h2 {
          font-size: 1.5rem; /* Пропорційно зменшуємо заголовок */
        }
        .modal-task-form input, .modal-task-form select, .modal-task-form textarea {
          background: #22334a;
          color: #fff;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 6px; /* Зменшуємо padding з 8px до 6px */
          font-size: 0.9rem; /* Зменшуємо розмір шрифту */
        }
        .modal-task-form input[readonly], .modal-task-form input:read-only, .modal-task-form textarea[readonly], .modal-task-form textarea:read-only {
          color: #aaa;
        }
        .modal-task-form .group {
          display: flex;
          flex-wrap: wrap;
          gap: 12px; /* Зменшуємо gap з 16px до 12px */
          margin-bottom: 18px; /* Зменшуємо margin-bottom з 24px до 18px */
        }
        .modal-task-form .field {
          flex: 1 1 220px;
          min-width: 180px;
          max-width: 340px;
          margin-bottom: 0;
          display: flex;
          flex-direction: column; /* Label завжди зверху */
        }
        .modal-task-form .field label {
          display: block !important; /* Завжди зверху */
          font-size: 0.85rem; /* Зменшуємо розмір label */
          margin-bottom: 4px;
          font-weight: 600;
          width: 100%;
        }
        /* Виключаємо checkbox поля з цього правила */
        .modal-task-form .field input[type="checkbox"] + span {
          display: inline;
        }
        .modal-task-form .field.textarea {
          flex: 1 1 100%;
          max-width: 100%;
        }
        .modal-task-form .block-detail {
          margin-bottom: 18px; /* Зменшуємо з 24px до 18px */
        }
        .label-above label {
          display: block;
          margin-bottom: 4px;
          font-weight: 600;
          font-size: 0.85rem; /* Зменшуємо розмір label */
        }
        .modal-task-form .main-header-group {
          display: flex;
          flex-direction: row;
          gap: 12px; /* Зменшуємо gap з 16px до 12px */
          margin-bottom: 18px; /* Зменшуємо margin-bottom з 24px до 18px */
        }
        .modal-task-form button {
          font-size: 0.9rem; /* Зменшуємо розмір шрифту кнопок */
          padding: 8px 16px; /* Зменшуємо padding кнопок */
        }
      `}</style>
      <form className="modal-task-form" onSubmit={handleSubmit} style={{background:'#1a2636',padding:'24px',paddingBottom:200,borderRadius:0,width:'90vw',maxWidth:1100,maxHeight:'90vh',color:'#fff',boxShadow:'0 4px 32px #0008',overflowY:'auto',display:'flex',flexDirection:'column',justifyContent:'flex-start',marginTop:36,position:'relative'}} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} style={{position:'absolute',top:30,right:18,fontSize:22,background:'none',border:'none',color:'#fff',cursor:'pointer',zIndex:10}} aria-label="Закрити">×</button>
        <h2 style={{marginTop:0}}>Завдання</h2>
        {error && <div style={{color:'#ff6666',marginBottom:12,fontWeight:600,fontSize:'0.9rem'}}>{error}</div>}
        {/* Рядок з автоматичними датами (перші 4 поля) */}
        <div style={{display:'flex',gap:12,marginBottom:18}}>
          {['autoCreatedAt', 'autoCompletedAt', 'autoWarehouseApprovedAt', 'autoAccountantApprovedAt'].map(fieldName => {
            const f = fields.find(f => f.name === fieldName);
            if (!f) return null;
            let value = form[f.name] || '';
            // Форматуємо дату для datetime-local (YYYY-MM-DDTHH:mm)
            if (value && typeof value === 'string') {
              // Якщо дата в форматі ISO, конвертуємо в datetime-local
              if (value.includes('T')) {
                value = value.substring(0, 16); // Беремо тільки дату та час без секунд
              } else if (value.includes(' ')) {
                // Якщо дата в форматі "YYYY-MM-DD HH:mm:ss", конвертуємо
                value = value.replace(' ', 'T').substring(0, 16);
              }
            }
            return (
              <div key={f.name} className="field" style={{flex:1}}>
                <label>{f.label}</label>
                <input 
                  type="datetime-local" 
                  name={f.name} 
                  value={value} 
                  readOnly={true}
                  style={{background:'#2a3a4a',color:'#ccc',cursor:'not-allowed'}}
                />
              </div>
            );
          })}
        </div>
        {/* Рядок з автоматичними датами (поля для рахунків) */}
        <div style={{display:'flex',gap:12,marginBottom:18}}>
          {['invoiceRequestDate', 'invoiceUploadDate'].map(fieldName => {
            const f = fields.find(f => f.name === fieldName);
            if (!f) return null;
            let value = form[f.name] || '';
            // Форматуємо дату для datetime-local (YYYY-MM-DDTHH:mm)
            if (value && typeof value === 'string') {
              // Якщо дата в форматі ISO, конвертуємо в datetime-local
              if (value.includes('T')) {
                value = value.substring(0, 16); // Беремо тільки дату та час без секунд
              } else if (value.includes(' ')) {
                // Якщо дата в форматі "YYYY-MM-DD HH:mm:ss", конвертуємо
                value = value.replace(' ', 'T').substring(0, 16);
              }
            }
            return (
              <div key={f.name} className="field" style={{flex:1}}>
                <label>{f.label}</label>
                <input 
                  type="datetime-local" 
                  name={f.name} 
                  value={value} 
                  readOnly={true}
                  style={{background:'#2a3a4a',color:'#ccc',cursor:'not-allowed'}}
                />
              </div>
            );
          })}
        </div>
        {/* Окремий рядок для номера заявки/наряду */}
        <div style={{display:'flex',gap:12,marginBottom:18,justifyContent:'center',alignItems:'flex-end'}}>
          <div className="field" style={{flex:1,maxWidth:400}}>
            <label>Номер заявки/наряду</label>
            <input 
              type="text" 
              name="requestNumber" 
              value={form.requestNumber || ''} 
              onChange={handleChange} 
              readOnly={isReadOnly('requestNumber')} 
            />
          </div>
          {/* Чекбокс "Термінова заявка" - тільки з панелі оператора */}
          {mode === 'operator' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0', paddingBottom: '8px' }}>
              <input 
                type="checkbox" 
                name="urgentRequest" 
                checked={form.urgentRequest || false} 
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm({ ...form, urgentRequest: checked });
                }}
                style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
              />
              <label 
                htmlFor="urgentRequest"
                onClick={(e) => {
                  e.preventDefault();
                  setForm({ ...form, urgentRequest: !form.urgentRequest });
                }}
                style={{ margin: 0, cursor: 'pointer', userSelect: 'none', color: '#fff' }}
              >
                Термінова заявка
              </label>
            </div>
          )}
        </div>
        <div style={{display:'flex',gap:12,marginBottom:18}}>
          {mainHeaderRow.map(n => {
            const f = fields.find(f=>f.name===n);
            if (!f) return null;
            let value = form[f.name] || '';
            if (f.name === 'serviceRegion') {
              return (
                <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'} style={{flex:1}}>
                  <label>{f.label}</label>
                  <select name={f.name} value={value} onChange={handleChange} disabled={isRegionReadOnly}>
                    <option value="">Виберіть регіон</option>
                    {regions
                      .filter(r => {
                        const regionName = r.name || r;
                        // Приховуємо мульти-регіони (які містять кому)
                        return !regionName.includes(',');
                      })
                      .map(r => (
                        <option key={r.name || r} value={r.name || r}>{r.name || r}</option>
                      ))}
                  </select>
                </div>
              );
            }
            if (f.type === 'select') {
              return (
                <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'} style={{flex:1}}>
                  <label>{f.label}</label>
                  <select name={f.name} value={value} onChange={handleChange} disabled={isReadOnly(f.name)}>
                    {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              );
            }
            return (
              <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'} style={{flex:1}}>
                <label>{f.label}</label>
                <input type={f.type} name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
              </div>
            );
          })}
        </div>
        {orderedFields.map((name, idx) => {
          // Пропускаємо дублікати групових полів (окрім першого елемента кожної групи)
          if ([
            'requestNumber', // Пропускаємо, оскільки воно відображається окремо
            ...statusGroup.slice(1).filter(n => n !== 'serviceRegion'),
            ...regionClientGroup.slice(1),
            ...debtGroup.slice(1),
            ...paymentEquipmentGroup.slice(1),
            ...equipmentGroup.slice(1),
            ...workEngineersGroup.slice(1),
            ...oilGroup.slice(1),
            ...filterGroup.slice(1),
            ...fuelFilterGroup.slice(1),
            ...airFilterGroup.slice(1),
            ...antifreezeGroup.slice(1),
            ...transportWorkPriceGroup.slice(1),
            ...expensesGroup.slice(1),
            ...otherMaterialsGroup.slice(1),
            ...warehouseGroup.slice(1),
            ...accountantGroup.slice(1),
            // ...regionalManagerGroup.slice(1),
            ...commentsGroup.slice(1)
          ].includes(name)) return null;
          if (idx === orderedFields.indexOf('status')) {
            return (
              <div className="group" key="statusGroup">
                {statusGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      {f.type === 'select' ? (
                        <select name={f.name} value={form[f.name] || ''} onChange={handleChange} disabled={isReadOnly(f.name)}>
                          {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type={f.type} name={f.name} value={form[f.name] || ''} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('address')) {
            return (
              <div className="group" key="addressGroup">
                <div className="field label-above textarea" style={{flex:1}}>
                  <label>Адреса</label>
                  <textarea 
                    name="address" 
                    value={form.address || ''} 
                    onChange={handleChange} 
                    readOnly={isReadOnly('address')} 
                    style={{minHeight:60}}
                  />
                </div>
              </div>
            );
          }
          if (idx === orderedFields.indexOf('edrpou')) {
            return (
              <div className="group" key="regionClientGroup">
                {['edrpou', 'client', 'invoice', 'paymentDate', 'invoiceRecipientDetails'].map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  
                  // Спеціальна обробка для поля ЄДРПОУ з автозаповненням
                  if (n === 'edrpou') {
                    return (
                      <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'} style={{position: 'relative'}}>
                        <label>{f.label}</label>
                        <input 
                          type="text" 
                          name={f.name} 
                          value={value} 
                          onChange={handleChange} 
                          readOnly={isReadOnly(f.name)}
                          placeholder="Введіть ЄДРПОУ..."
                          autoComplete="off"
                        />
                        {/* Dropdown з автодоповненням для ЄДРПОУ */}
                        {showEdrpouDropdown && filteredEdrpouList.length > 0 && (
                          <div 
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              right: 0,
                              background: '#2a3a4a',
                              border: '1px solid #444',
                              borderRadius: '4px',
                              maxHeight: '200px',
                              overflowY: 'auto',
                              zIndex: 1000,
                              boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
                            }}
                            onClick={(e) => {
                              console.log('[DEBUG] ModalTaskForm - клік по dropdown контейнеру ЄДРПОУ');
                              e.stopPropagation();
                            }}>
                            {filteredEdrpouList.map((edrpou, index) => (
                              <div
                                key={index}
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  color: '#fff',
                                  borderBottom: index < filteredEdrpouList.length - 1 ? '1px solid #444' : 'none'
                                }}
                                onMouseEnter={(e) => e.target.style.background = '#3a4a5a'}
                                onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                onClick={() => {
                                  console.log('[DEBUG] ModalTaskForm - клік по dropdown варіанту ЄДРПОУ:', edrpou);
                                  handleEdrpouSelect(edrpou);
                                }}
                              >
                                {edrpou}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Спеціальна обробка для поля "Номер рахунку"
                  if (n === 'invoice') {
                    return (
                      <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                        <label>{f.label}</label>
                        <input type={f.type} name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                      </div>
                    );
                  }
                  
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      {f.type === 'textarea' ? (
                        <textarea 
                          name={f.name} 
                          value={value} 
                          onChange={handleChange} 
                          readOnly={isReadOnly(f.name)}
                          rows={4}
                          style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
                        />
                      ) : f.type === 'checkbox' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="checkbox" 
                            name={f.name} 
                            checked={form[f.name] || false} 
                            onChange={handleChange} 
                            readOnly={isReadOnly(f.name)}
                            style={{ margin: 0 }}
                          />
                          <span style={{ fontSize: '14px', color: '#333' }}>{f.label}</span>
                        </div>
                      ) : (
                        <input type={f.type} name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                      )}
                    </div>
                  );
                })}
                
                {/* Блок запиту на рахунок та завантаження договору - в один рядок */}
                {console.log('DEBUG ModalTaskForm - передаємо в InvoiceRequestBlock:', {
                  taskStatus: form.status,
                  userRole: user?.role,
                  invoiceRequested: form.invoiceRequested,
                  task: form,
                  user: user
                })}
                <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', minHeight: '200px' }}>
                  {/* Запит на рахунок */}
                  <div style={{ flex: 1, minWidth: '300px', maxWidth: '400px' }}>
                    <div style={{ 
                      border: '1px solid #ddd', 
                      borderRadius: '8px', 
                      padding: '16px', 
                      backgroundColor: '#f9f9f9',
                      minHeight: '180px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}>
                      <InvoiceRequestBlock 
                        task={(() => {
                          const taskData = {
                            ...form,
                            // Передаємо дані про файли з InvoiceRequest
                            invoiceFile: form.invoiceFile,
                            invoiceFileName: form.invoiceFileName,
                            invoiceStatus: form.invoiceStatus,
                            actFile: form.actFile,
                            actFileName: form.actFileName,
                            actStatus: form.actStatus,
                            invoiceRequestId: form.invoiceRequestId
                          };
                          console.log('[DEBUG] ModalTaskForm - передаємо в InvoiceRequestBlock:', {
                            taskStatus: taskData.status,
                            userRole: user?.role,
                            invoiceRequested: taskData.invoiceRequested,
                            task: taskData,
                            user: user
                          });
                          return taskData;
                        })()} 
                        user={user} 
                        onRequest={handleInvoiceRequest}
                        onFileUploaded={(fileType, fileData) => {
                          console.log('[DEBUG] ModalTaskForm - файл завантажено:', fileType, fileData);
                          
                          // Оновлюємо стан форми з новими даними про файл
                          setForm(prev => ({
                            ...prev,
                            ...fileData
                          }));
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Завантаження файлу договору */}
                  <div style={{ flex: 1, minWidth: '300px', maxWidth: '400px' }}>
                    <div style={{ 
                      border: '1px solid #ddd', 
                      borderRadius: '8px', 
                      padding: '16px', 
                      backgroundColor: '#f9f9f9',
                      minHeight: '180px',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div className="field label-above" style={{ flex: 1 }}>
                        <label style={{ color: '#333', fontWeight: 'bold' }}>Файл договору</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {form.contractFile ? (
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              backgroundColor: '#e8f5e8',
                              border: '1px solid #4caf50',
                              borderRadius: '4px'
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '14px', color: '#2e7d32' }}>
                                    📄 {form.contractFile.name || 'Файл договору'}
                                  </span>
                                  <span style={{ fontSize: '12px', color: '#666' }}>
                                    ({(form.contractFile.size / 1024 / 1024).toFixed(2)} MB)
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      console.log('[DEBUG] ModalTaskForm - перегляд файлу договору');
                                      if (form.contractFile) {
                                        if (form.contractFile.url) {
                                          // Якщо це URL (вже завантажений файл)
                                          window.open(form.contractFile.url, '_blank');
                                        } else if (form.contractFile instanceof File) {
                                          // Якщо це локальний файл, створюємо URL для перегляду
                                          const url = URL.createObjectURL(form.contractFile);
                                          window.open(url, '_blank');
                                        } else {
                                          // Якщо це просто рядок URL
                                          window.open(form.contractFile, '_blank');
                                        }
                                      }
                                    }}
                                    style={{
                                      background: '#2196f3',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      padding: '6px 12px',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      flex: 1
                                    }}
                                  >
                                    👁️ Переглянути
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      console.log('[DEBUG] ModalTaskForm - завантаження файлу договору');
                                      if (form.contractFile) {
                                        let url;
                                        let fileName = 'contract.pdf';
                                        
                                        if (form.contractFile.url) {
                                          // Якщо це URL (вже завантажений файл)
                                          url = form.contractFile.url;
                                          fileName = form.contractFile.name || 'contract.pdf';
                                        } else if (form.contractFile instanceof File) {
                                          // Якщо це локальний файл
                                          url = URL.createObjectURL(form.contractFile);
                                          fileName = form.contractFile.name || 'contract.pdf';
                                        } else {
                                          // Якщо це просто рядок URL
                                          url = form.contractFile;
                                          fileName = 'contract.pdf';
                                        }
                                        
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = fileName;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                      }
                                    }}
                                    style={{
                                      background: '#4caf50',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      padding: '6px 12px',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      flex: 1
                                    }}
                                  >
                                    ⬇️ Завантажити
                                  </button>
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        console.log('[DEBUG] ModalTaskForm - видалено файл договору');
                                        setForm({ ...form, contractFile: null });
                                      }}
                                      style={{
                                        background: '#f44336',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '6px 12px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        flex: 1
                                      }}
                                    >
                                      ✕ Видалити
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <button
                                  type="button"
                                  onClick={() => setShowContractFileSelector(true)}
                                  disabled={readOnly}
                                  style={{
                                    background: '#2196f3',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '8px 12px',
                                    cursor: readOnly ? 'not-allowed' : 'pointer',
                                    fontSize: '12px',
                                    flex: 1
                                  }}
                                >
                                  📁 Вибрати з існуючих
                                </button>
                              </div>
                              <input
                                type="file"
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    if (file.size > 20 * 1024 * 1024) {
                                      alert('Файл занадто великий. Максимальний розмір: 20MB');
                                      return;
                                    }
                                    console.log('[DEBUG] ModalTaskForm - завантажено файл договору:', file);
                                    setForm({ ...form, contractFile: file });
                                  }
                                }}
                                disabled={readOnly}
                                style={{ 
                                  width: '100%', 
                                  padding: '8px',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  backgroundColor: readOnly ? '#f5f5f5' : 'white'
                                }}
                              />
                              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                Підтримувані формати: PDF, DOC, DOCX, JPG, PNG (макс. 20MB)
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          
          if (idx === orderedFields.indexOf('debtStatus')) {
            return (
              <div className="group" key="debtGroup">
                {['debtStatus', 'debtStatusCheckbox'].map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      {f.type === 'checkbox' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="checkbox"
                            name={f.name}
                            checked={value}
                            onChange={handleChange}
                            disabled={isReadOnly(f.name)}
                          />
                          <span>{f.label}</span>
                        </div>
                      ) : (
                        <select name={f.name} value={value} onChange={handleChange} disabled={isReadOnly(f.name)}>
                          {f.options?.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
                {/* Чекбокс "Внутрішні роботи" */}
                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    name="internalWork" 
                    checked={form.internalWork || false} 
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm({ ...form, internalWork: checked });
                    }}
                    style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                  />
                  <label 
                    htmlFor="internalWork"
                    onClick={(e) => {
                      e.preventDefault();
                      setForm({ ...form, internalWork: !form.internalWork });
                    }}
                    style={{ color: '#ff0000', margin: 0, cursor: 'pointer', userSelect: 'none' }}
                  >
                    Внутрішні роботи
                  </label>
                </div>
              </div>
            );
          }
          
          // Новий блок для обладнання та двигуна
          if (idx === orderedFields.indexOf('equipment')) {
            return (
              <div className="group" key="equipmentGroup">
                {/* Поле "Тип обладнання" з dropdown */}
                <div className={labelAboveFields.includes('equipment') ? 'field label-above' : 'field'} style={{position: 'relative'}}>
                  <label>Тип обладнання</label>
                  <input 
                    type="text" 
                    name="equipment" 
                    value={form.equipment || ''} 
                    onChange={handleChange} 
                    readOnly={isReadOnly('equipment')}
                    placeholder="Введіть тип обладнання..."
                    autoComplete="off"
                  />
                  {/* Dropdown з автодоповненням */}
                  {console.log('[DEBUG] ModalTaskForm - перевірка dropdown:', { showEquipmentDropdown, filteredLength: filteredEquipmentTypes.length })}
                  {showEquipmentDropdown && filteredEquipmentTypes.length > 0 && (
                    <div 
                      style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#2a3a4a',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
                    }}
                      onClick={(e) => {
                        console.log('[DEBUG] ModalTaskForm - клік по dropdown контейнеру');
                        e.stopPropagation();
                      }}>
                      {filteredEquipmentTypes.map((type, index) => (
                        <div
                          key={index}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            color: '#fff',
                            borderBottom: index < filteredEquipmentTypes.length - 1 ? '1px solid #444' : 'none'
                          }}
                          onMouseEnter={(e) => e.target.style.background = '#3a4a5a'}
                          onMouseLeave={(e) => e.target.style.background = 'transparent'}
                          onClick={() => {
                            console.log('[DEBUG] ModalTaskForm - клік по dropdown варіанту:', type);
                            handleEquipmentSelect(type);
                          }}
                        >
                          {type}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Інші поля групи */}
                {['equipmentSerial', 'engineModel', 'engineSerial'].map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type={f.type} name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                    </div>
                  );
                })}
              </div>
            );
          }
          
          if (idx === orderedFields.indexOf('paymentType')) {
            return (
              <div className="group" key="paymentEquipmentGroup">
                {['paymentType', 'serviceTotal', 'customerEquipmentNumber'].map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      {f.type === 'select' ? (
                        <select name={f.name} value={form[f.name] || ''} onChange={handleChange} disabled={isReadOnly(f.name)}>
                          {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type={f.type} name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('oilType')) {
            return (
              <div className="group" key="oilGroup">
                {oilGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (f.name === 'oilTotal') value = formatNumber(calcOilTotal());
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type="text" name={f.name} value={value} onChange={handleChange} readOnly={f.name==='oilTotal'} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('filterName')) {
            return (
              <div className="group" key="filterGroup">
                {filterGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (f.name === 'filterSum') value = formatNumber(calcFilterSum());
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type="text" name={f.name} value={value} onChange={handleChange} readOnly={f.name==='filterSum'} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('fuelFilterName')) {
            return (
              <div className="group" key="fuelFilterGroup">
                {fuelFilterGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (f.name === 'fuelFilterSum') value = formatNumber(calcFuelFilterSum());
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type="text" name={f.name} value={value} onChange={handleChange} readOnly={f.name==='fuelFilterSum'} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('airFilterName')) {
            return (
              <div className="group" key="airFilterGroup">
                {airFilterGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (f.name === 'airFilterSum') value = formatNumber(calcAirFilterSum());
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type="text" name={f.name} value={value} onChange={handleChange} readOnly={f.name==='airFilterSum'} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('antifreezeType')) {
            return (
              <div className="group" key="antifreezeGroup">
                {antifreezeGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (f.name === 'antifreezeSum') value = formatNumber(calcAntifreezeSum());
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type="text" name={f.name} value={value} onChange={handleChange} readOnly={f.name==='antifreezeSum'} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('carNumber')) {
            return (
              <div className="group" key="transportWorkPriceGroup">
                {['carNumber', 'transportKm', 'transportSum', 'workPrice'].map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (n === 'workPrice') {
                    value = formatNumber(calcWorkPrice());
                  }
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type="text" name={f.name} value={value} onChange={handleChange} readOnly={n==='workPrice' || isReadOnly(f.name)} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('perDiem')) {
            return (
              <div className="group" key="expensesGroup">
                {expensesGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  // Автоматичне поле для bonusApprovalDate
                  if (n === 'bonusApprovalDate') {
                    if (
                      form.status === 'Виконано' &&
                      form.approvedByWarehouse === 'Підтверджено' &&
                      form.approvedByAccountant === 'Підтверджено'
                    ) {
                      const d = new Date();
                      value = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                    } else {
                      value = '';
                    }
                  }
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type="text" name={f.name} value={value} onChange={handleChange} readOnly={n==='bonusApprovalDate' || isReadOnly(f.name)} />
                    </div>
                  );
                })}
              </div>
            );
          }
          // textarea на весь рядок
          if (['requestDesc','address','warehouseComment','accountantComment','accountantComments'/*,'regionalManagerComment'*/,'comments','blockDetail','otherMaterials'].includes(name)) {
            const f = fields.find(f=>f.name===name);
            if (!f) return null;
            return (
              <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field textarea'}>
                <label>{f.label}</label>
                <textarea name={f.name} value={form[f.name] || ''} onChange={handleChange} readOnly={isReadOnly(f.name)} />
              </div>
            );
          }
          if (name === 'bonusApprovalDate') {
            const f = fields.find(f=>f.name===name);
            // Алгоритм автозаповнення дати затвердження премії
            let autoValue = '';
            if (
              form.status === 'Виконано' &&
              form.approvedByWarehouse === 'Підтверджено' &&
              form.approvedByAccountant === 'Підтверджено'
            ) {
              const d = new Date();
              autoValue = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; // MM-YYYY
            } else {
              autoValue = form[name] || '';
            }
            const isAdmin = mode === 'admin' || user?.role === 'administrator';
            // --- Конвертація значення для адміністратора ---
            let dateValue = '';
            if (isAdmin) {
              // Якщо вже є значення у форматі MM-YYYY, конвертуємо у YYYY-MM-DD для date input
              if (form[name] && /^\d{2}-\d{4}$/.test(form[name])) {
                const [mm, yyyy] = form[name].split('-');
                dateValue = `${yyyy}-${mm}-01`;
              } else if (form[name]) {
                dateValue = form[name];
              } else {
                dateValue = '';
              }
            }
            return (
              <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                <label>{f.label}</label>
                {isAdmin ? (
                <input
                    type="date"
                  name={f.name}
                    value={dateValue}
                  onChange={handleChange}
                    readOnly={isReadOnly(f.name)}
                  tabIndex={-1}
                />
                ) : (
                  <input
                    type="text"
                    name={f.name}
                    value={autoValue}
                    readOnly
                    tabIndex={-1}
                  />
                )}
              </div>
            );
          }
          // Інші поля — стандартно
          const f = fields.find(f=>f.name===name);
          if (!f) return null;
          let value = form[f.name] || '';
          if (f.name === 'serviceRegion') {
            return (
              <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                <label>{f.label}</label>
                <select name={f.name} value={value} onChange={handleChange} disabled={isRegionReadOnly}>
                  <option value="">Виберіть регіон</option>
                  {regions
                    .filter(r => {
                      const regionName = r.name || r;
                      // Приховуємо мульти-регіони (які містять кому)
                      return !regionName.includes(',');
                    })
                    .map(r => (
                      <option key={r.name || r} value={r.name || r}>{r.name || r}</option>
                    ))}
                </select>
              </div>
            );
          }
          if (name === 'date') {
            return (
              <div className="group" key="workEngineersGroup">
                {workEngineersGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (n === 'engineer1' || n === 'engineer2' || n === 'engineer3' || n === 'engineer4' || n === 'engineer5' || n === 'engineer6') {
                    console.log('[DEBUG] ModalTaskForm - рендеринг поля інженера:', n);
                    console.log('[DEBUG] ModalTaskForm - загальна кількість користувачів:', users.length);
                    console.log('[DEBUG] ModalTaskForm - поточний регіон заявки:', form.serviceRegion);
                    
                    // Отримуємо доступних інженерів для поточного регіону
                    const currentEngineers = users.filter(u => u.role === 'service');
                    console.log('[DEBUG] ModalTaskForm - інженери (service):', currentEngineers.length);
                    
                    const availableEngineers = currentEngineers.filter(u => {
                      if (form.serviceRegion === 'Україна') return true;
                      return u.region === form.serviceRegion;
                    });
                    console.log('[DEBUG] ModalTaskForm - доступні інженери для регіону:', availableEngineers.length);
                    console.log('[DEBUG] ModalTaskForm - доступні інженери:', availableEngineers.map(u => ({ name: u.name, region: u.region })));
                    
                    // Додаткова перевірка - якщо користувачі не завантажені, спробуємо завантажити
                    if (users.length === 0) {
                      console.log('[DEBUG] ModalTaskForm - користувачі не завантажені при рендерингу, спробуємо завантажити...');
                      // Неблокуючий виклик для завантаження користувачів
                      setTimeout(() => {
                        columnsSettingsAPI.getAllUsers().then(users => {
                          if (users.length > 0) {
                            console.log('[DEBUG] ModalTaskForm - завантажено користувачів при рендерингу:', users.length);
                            setUsers(users);
                            localStorage.setItem('users', JSON.stringify(users));
                          }
                        }).catch(error => {
                          console.error('[ERROR] ModalTaskForm - помилка завантаження користувачів при рендерингу:', error);
                        });
                      }, 0);
                    }
                    
                    return (
                      <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                        <label>{f.label}</label>
                        <select name={f.name} value={value} onChange={handleChange} disabled={isReadOnly(f.name)}>
                          <option value="">{users.length === 0 ? 'Завантаження інженерів...' : 'Виберіть інженера'}</option>
                          {availableEngineers.map(u => (
                            <option key={u.id} value={u.name}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type={f.type} name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (name === 'otherSum') {
            return (
              <div className="group" key="otherMaterialsGroup">
                {otherMaterialsGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (n === 'otherMaterials') {
                    return (
                      <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field textarea'} style={{flex:2}}>
                        <label>{f.label}</label>
                        <textarea name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} style={{minHeight:40}} />
                      </div>
                    );
                  }
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type={f.type} name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('approvedByWarehouse')) {
            return (
              <div className="group" key="warehouseGroup">
                {warehouseGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (n === 'warehouseComment') {
                    return (
                      <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field textarea'} style={{flex:2}}>
                        <label>{f.label}</label>
                        <textarea name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} style={{minHeight:40}} />
                      </div>
                    );
                  }
                  if (n === 'warehouseApprovalDate') {
                    return (
                      <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                        <label>{f.label}</label>
                        <input type="date" name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                      </div>
                    );
                  }
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <select name={f.name} value={value} onChange={handleChange} disabled={isReadOnly(f.name)}>
                        {(f.options || []).map(opt => (
                          <option key={opt} value={opt}>{opt === '' ? 'Оберіть компанію' : opt}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('approvedByAccountant')) {
            return (
              <div className="group" key="accountantGroup">
                {accountantGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (n === 'accountantComment' || n === 'accountantComments') {
                    return (
                      <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field textarea'} style={{flex:2}}>
                        <label>{f.label}</label>
                        <textarea name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} style={{minHeight:40}} />
                      </div>
                    );
                  }
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <select name={f.name} value={value} onChange={handleChange} disabled={isReadOnly(f.name)}>
                        {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            );
          }
          // if (idx === orderedFields.indexOf('approvedByRegionalManager')) {
          //   return (
          //     <div className="group" key="regionalManagerGroup">
          //       {['approvedByRegionalManager', 'regionalManagerComment'].map(n => {
          //         const f = fields.find(f=>f.name===n);
          //         if (!f) return null;
          //         let value = form[f.name] || '';
          //         if (n === 'regionalManagerComment') {
          //           return (
          //             <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field textarea'} style={{flex:2}}>
          //               <label>{f.label}</label>
          //               <textarea name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} style={{minHeight:40}} />
          //             </div>
          //           );
          //         }
          //         return (
          //           <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
          //             <label>{f.label}</label>
          //             <select name={f.name} value={value} onChange={handleChange} disabled={isReadOnly(f.name)}>
          //               {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          //             </select>
          //           </div>
          //         );
          //       })}
          //     </div>
          //   );
          // }
          if (idx === orderedFields.indexOf('comments')) {
            return (
              <div className="group" key="commentsGroup">
                {commentsGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field textarea'}>
                      <label>{f.label}</label>
                      <textarea name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                    </div>
                  );
                })}
              </div>
            );
          }
          // Спеціальна обробка для поля обладнання з автодоповненням (перенесено в групу)
          
          return (
            <div className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
              <label>{f.label}</label>
              {f.type === 'select' ? (
                <select name={f.name} value={form[f.name] || ''} onChange={handleChange} disabled={isReadOnly(f.name)}>
                  {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type={f.type} name={f.name} value={form[f.name] || ''} onChange={handleChange} readOnly={isReadOnly(f.name)} />
              )}
            </div>
          );
        })}
        {/* Додаємо FileUpload тільки якщо є ID завдання (режим редагування) */}
        {initialData.id && (
          <FileUpload 
            taskId={initialData.id} 
            onFilesUploaded={(files) => {
            }}
          />
        )}
        <div style={{display:'flex',gap:10,marginTop:18,marginBottom:24}}>
          {!readOnly && <button type="submit" style={{flex:1}}>Зберегти</button>}
          <button type="button" onClick={onClose} style={{flex:1,background:readOnly ? '#00bfff' : '#888',color:'#fff'}}>
            {readOnly ? 'Закрити' : 'Скасувати'}
          </button>
        </div>
        {/* Пустий рядок для відступу в кінці форми */}
        <div style={{height:200}}></div>
      </form>
      
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
      {/* --- Додаю рендер модального вікна з помилками --- */}
      {showMissingModal && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#22334a',padding:32,borderRadius:8,minWidth:320,maxWidth:400,boxShadow:'0 4px 32px #0008',color:'#fff',display:'flex',flexDirection:'column',gap:16,alignItems:'center'}}>
            <h3 style={{color:'#ff6666'}}>Не заповнені обов'язкові поля</h3>
            <ul style={{color:'#fff',textAlign:'left',margin:'8px 0 16px 0',paddingLeft:20}}>
              {missingFields.map((f,i) => <li key={i}>{f}</li>)}
            </ul>
            <button type="button" style={{background:'#00bfff',color:'#fff',padding:'8px 24px',border:'none',borderRadius:4,fontWeight:600,cursor:'pointer'}} onClick={()=>setShowMissingModal(false)}>OK</button>
          </div>
        </div>
      )}
      {/* --- Модальне вікно вибору матеріалів --- */}
      {console.log('[DEBUG] ModalTaskForm - рендеринг MaterialsSelectionModal:', materialsModal)}
      <MaterialsSelectionModal
        open={materialsModal.open}
        onClose={() => setMaterialsModal({ open: false, equipmentType: '' })}
        onApply={handleMaterialsApply}
        equipmentType={materialsModal.equipmentType}
        currentFormData={form}
      />
      
      {/* Модальне вікно запиту рахунку */}
      <InvoiceRequestModal
        isOpen={showInvoiceRequestModal}
        onClose={() => setShowInvoiceRequestModal(false)}
        task={form}
        user={user}
        onSubmit={handleInvoiceRequest}
      />
      
      {/* Модальне вікно вибору файлу договору */}
      <ContractFileSelector
        open={showContractFileSelector}
        onClose={() => setShowContractFileSelector(false)}
        onSelect={handleContractFileSelect}
        currentContractFile={form.contractFile}
        currentEdrpou={form.edrpou}
      />
      
      {/* Модальне вікно вибору даних клієнта */}
      <ClientDataSelectionModal
        open={clientDataModal.open}
        onClose={() => setClientDataModal({ open: false, edrpou: '' })}
        onApply={handleClientDataApply}
        edrpou={clientDataModal.edrpou}
        currentFormData={form}
      />
    </div>
  );
}