import React, { useState, useEffect } from 'react';
import { columnsSettingsAPI } from './utils/columnsSettingsAPI';

export const fields = [
  { name: 'status', label: 'Статус заявки', type: 'select', options: ['', 'Заявка', 'В роботі', 'Виконано', 'Заблоковано'] },
  { name: 'requestDate', label: 'Дата заявки', type: 'date' },
  { name: 'date', label: 'Дата проведення робіт', type: 'date' },
  { name: 'company', label: 'Компанія виконавець', type: 'select', options: ['', 'ДТС', 'Дарекс Енерго', 'інша'] },
  { name: 'edrpou', label: 'ЄДРПОУ', type: 'text' },
  { name: 'requestDesc', label: 'Опис заявки', type: 'textarea' },
  { name: 'serviceRegion', label: 'Регіон сервісного відділу', type: 'select' },
  { name: 'client', label: 'Замовник', type: 'text' },
  { name: 'invoice', label: 'Номер рахунку', type: 'text' },
  { name: 'paymentType', label: 'Вид оплати', type: 'select', options: ['не вибрано', 'Безготівка', 'Готівка', 'Інше'] },
  { name: 'address', label: 'Адреса', type: 'text' },
  { name: 'equipmentSerial', label: 'Заводський номер обладнання', type: 'text' },
  { name: 'equipment', label: 'Тип обладнання', type: 'text' },
  { name: 'work', label: 'Найменування робіт', type: 'text' },
  { name: 'engineer1', label: 'Сервісний інженер №1', type: 'text' },
  { name: 'engineer2', label: 'Сервісний інженер №2', type: 'text' },
  { name: 'serviceTotal', label: 'Загальна сума послуги', type: 'text', calc: true },
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
  { name: 'workPrice', label: 'Вартість робіт, грн', type: 'text' },
  { name: 'perDiem', label: 'Добові, грн', type: 'text' },
  { name: 'living', label: 'Проживання, грн', type: 'text' },
  { name: 'otherExp', label: 'Інші витрати, грн', type: 'text' },
  { name: 'carNumber', label: 'Держномер автотранспорту', type: 'text' },
  { name: 'transportKm', label: 'Транспортні витрати, км', type: 'text' },
  { name: 'transportSum', label: 'Загальна вартість тр. витрат', type: 'text' },
  { name: 'approvedByWarehouse', label: 'Підтвердження зав. складу', type: 'select', options: ['На розгляді', 'Підтверджено', 'Відмова'], role: 'warehouse' },
  { name: 'warehouseComment', label: 'Опис відмови (зав. склад)', type: 'textarea', role: 'warehouse' },
  { name: 'approvedByAccountant', label: 'Підтвердження бухгалтера', type: 'select', options: ['На розгляді', 'Підтверджено', 'Відмова'], role: 'accountant' },
  { name: 'accountantComment', label: 'Опис відмови (бухгалтер)', type: 'textarea', role: 'accountant' },
  { name: 'approvedByRegionalManager', label: 'Підтвердження регіонального керівника', type: 'select', options: ['На розгляді', 'Підтверджено', 'Відмова'], role: 'regionalManager' },
  { name: 'regionalManagerComment', label: 'Опис відмови (регіональний керівник)', type: 'textarea', role: 'regionalManager' },
  { name: 'airFilterName', label: 'Фільтр повітряний назва', type: 'text' },
  { name: 'airFilterCount', label: 'Фільтр повітряний штук', type: 'text' },
  { name: 'airFilterPrice', label: 'Ціна одного повітряного фільтра', type: 'text' },
  { name: 'airFilterSum', label: 'Загальна сума за повітряні фільтри', type: 'text', calc: true },
  { name: 'approvalDate', label: 'Дата затвердження', type: 'date' },
  { name: 'bonusApprovalDate', label: 'Дата затвердження премії', type: 'date' },
  { name: 'serviceBonus', label: 'Премія за виконання сервісних робіт, грн', type: 'text' },
];

// Додаю поле для детального опису блокування заявки
const blockDescField = { name: 'blockDetail', label: 'Детальний опис блокування заявки', type: 'textarea' };

// Додаємо нове поле для звітного місяця/року
const reportMonthYearField = { name: 'reportMonthYear', label: 'Місяць/рік для звіту', type: 'text', readOnly: true };

// Групи полів
const group1 = ['requestDesc'];
const group2 = ['warehouseComment', 'accountantComment', 'regionalManagerComment'];
const group3 = ['work', 'engineer1', 'engineer2'];
const group4 = ['oilType', 'oilUsed', 'oilPrice', 'oilTotal'];
const group5 = ['spareParts', 'sparePartsPrice', 'sparePartsTotal'];
const group6 = ['totalAmount'];

// Для textarea
const textareaFields = ['requestDesc','warehouseComment','accountantComment','regionalManagerComment','blockDetail','otherMaterials'];

// Групи для компактного відображення
const oilGroup = ['oilType', 'oilUsed', 'oilPrice', 'oilTotal'];
const filterGroup = ['filterName', 'filterCount', 'filterPrice', 'filterSum'];
const fuelFilterGroup = ['fuelFilterName', 'fuelFilterCount', 'fuelFilterPrice', 'fuelFilterSum'];
const airFilterGroup = ['airFilterName', 'airFilterCount', 'airFilterPrice', 'airFilterSum'];
const antifreezeGroup = ['antifreezeType', 'antifreezeL', 'antifreezePrice', 'antifreezeSum'];
const transportGroup = ['carNumber', 'transportKm', 'transportSum', 'workPrice'];
const expensesGroup = ['perDiem', 'living', 'otherExp', 'bonusApprovalDate'];
const statusGroup = ['status', 'requestDate', 'company'];
const regionClientGroup = ['edrpou', 'client', 'address', 'invoice'];
const paymentEquipmentGroup = ['paymentType', 'serviceTotal', 'equipment', 'equipmentSerial'];
const workEngineersGroup = ['date', 'work', 'engineer1', 'engineer2'];
const otherMaterialsGroup = ['otherSum', 'otherMaterials'];
const warehouseGroup = ['approvedByWarehouse', 'warehouseComment'];
const accountantGroup = ['approvedByAccountant', 'accountantComment'];
const regionalManagerGroup = ['approvedByRegionalManager', 'regionalManagerComment'];

// Додаю групу для першого рядка
const mainHeaderGroup = ['status', 'requestDate', 'company', 'serviceRegion'];

// Додаю mainHeaderRow для першого рядку
const mainHeaderRow = ['status', 'requestDate', 'company', 'serviceRegion'];

// Новий порядок полів
const orderedFields = [
  'requestDesc',
  ...regionClientGroup,
  ...paymentEquipmentGroup,
  ...workEngineersGroup,
  ...oilGroup,
  ...filterGroup,
  ...fuelFilterGroup,
  ...airFilterGroup,
  ...antifreezeGroup,
  ...transportGroup,
  ...expensesGroup,
  ...otherMaterialsGroup,
  ...warehouseGroup,
  ...accountantGroup,
  ...regionalManagerGroup,
];

// Додаємо поле bonusApprovalDate для адміністратора
// const bonusApprovalDateField = { ... } // (залишити, якщо потрібно)

// Для полів, які мають бути з label над input
const labelAboveFields = [
  'status', 'requestDate', 'requestDesc', 'paymentType', 'otherMaterials',
  'approvedByWarehouse', 'warehouseComment',
  'approvedByAccountant', 'accountantComment',
  'approvedByRegionalManager', 'regionalManagerComment'
];

export default function ModalTaskForm({ open, onClose, onSave, initialData = {}, mode = 'service', user }) {
  const isRegionReadOnly = user && user.region && user.region !== 'Україна';

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

    // Автозаповнення дати
    if (f.status === 'Виконано' && 
        f.approvedByWarehouse === 'Підтверджено' && 
        f.approvedByAccountant === 'Підтверджено' && 
        f.approvedByRegionalManager === 'Підтверджено') {
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
        f.approvedByAccountant === 'Підтверджено' && 
        f.approvedByRegionalManager === 'Підтверджено') {
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
    return saved ? JSON.parse(saved) : ['Київський', 'Одеський', 'Львівський'];
  });

  // --- Додаємо стан для модального вікна відмови ---
  const [rejectModal, setRejectModal] = useState({ open: false, field: '', comment: '' });

  const [error, setError] = useState('');

  // --- Додаю стан для модального вікна з помилками ---
  const [missingFields, setMissingFields] = useState([]);
  const [showMissingModal, setShowMissingModal] = useState(false);

  useEffect(() => {
    const f = { ...initialData };
    if ('approvedByWarehouse' in f) f.approvedByWarehouse = toSelectString(f.approvedByWarehouse);
    if ('approvedByAccountant' in f) f.approvedByAccountant = toSelectString(f.approvedByAccountant);
    if ('approvedByRegionalManager' in f) f.approvedByRegionalManager = toSelectString(f.approvedByRegionalManager);

    // Автозаповнення дати при зміні статусу або підтверджень
    if (f.status === 'Виконано' && 
        f.approvedByWarehouse === 'Підтверджено' && 
        f.approvedByAccountant === 'Підтверджено' && 
        f.approvedByRegionalManager === 'Підтверджено') {
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
        f.approvedByAccountant === 'Підтверджено' && 
        f.approvedByRegionalManager === 'Підтверджено') {
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
      const saved = localStorage.getItem('regions');
      setRegions(saved ? JSON.parse(saved) : ['Київський', 'Одеський', 'Львівський']);
    }
  }, [open]);

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
    if (open) {
      columnsSettingsAPI.getAllUsers().then(setUsers).catch(() => setUsers([]));
    }
  }, [open]);

  if (!open) return null;

  // Визначаємо, які поля заблоковані
  const isReadOnly = name => {
    if (mode === 'regionalManager') {
      // Доступні тільки ці два поля
      return !(name === 'approvedByRegionalManager' || name === 'regionalManagerComment');
    }
    if (mode === 'warehouse') {
      return !(name === 'approvedByWarehouse' || name === 'warehouseComment');
    }
    if (mode === 'accountant') {
      return !(name === 'approvedByAccountant' || name === 'accountantComment');
    }
    // Додаємо логіку для поля дати
    if (name === 'date' && 
        form.status === 'Виконано' && 
        form.approvedByWarehouse === 'Підтверджено' && 
        form.approvedByAccountant === 'Підтверджено' && 
        form.approvedByRegionalManager === 'Підтверджено') {
      return true;
    }
    // Для оператора поле 'client' (Замовник) завжди доступне для редагування
    if (mode === 'operator' && name === 'client') return false;

    if (fields.find(f => f.name === name && f.role) && (!mode || fields.find(f => f.name === name).role !== mode)) return true;
    if (mode === 'operator') {
      return !['status','requestDate','requestDesc','serviceRegion','company','customer','invoiceNumber','paymentType','address','equipmentSerial','equipment'].includes(name);
    }
    if (mode === 'service') {
      return ['requestDate','requestDesc'].includes(name);
    }
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
    const { name, value } = e.target;
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
    if (name === 'approvedByAccountant' && form.approvedByAccountant === 'Відмова' && value !== 'Відмова') {
      setForm({ ...form, [name]: value, accountantComment: '' });
      return;
    }
    if (name === 'approvedByRegionalManager' && form.approvedByRegionalManager === 'Відмова' && value !== 'Відмова') {
      setForm({ ...form, [name]: value, regionalManagerComment: '' });
      return;
    }
    setForm({ ...form, [name]: value });
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
    }
    if (rejectModal.field === 'approvedByRegionalManager') {
      newForm.approvedByRegionalManager = 'Відмова';
      newForm.regionalManagerComment = rejectModal.comment;
    }
    setForm(newForm);
    setRejectModal({ open: false, field: '', comment: '' });
  };

  // --- Відміна відмови ---
  const handleRejectCancel = () => {
    setRejectModal({ open: false, field: '', comment: '' });
  };

  const handleSubmit = e => {
    e.preventDefault();
    const required = [
      { name: 'company', label: 'Компанія виконавець' },
      { name: 'status', label: 'Статус заявки' },
    ];
    if (mode === 'operator') {
      required.push({ name: 'serviceRegion', label: 'Регіон сервісного відділу' });
    }
    const missing = required.filter(f => !form[f.name]);
    if (missing.length > 0) {
      setMissingFields(missing.map(f => f.label));
      setShowMissingModal(true);
      return;
    }
    setError('');
    // --- Додаю автозаповнення bonusApprovalDate для адміністратора, якщо порожнє ---
    let submitForm = { ...form };
    if (mode === 'admin' && !submitForm.bonusApprovalDate) {
      if (
        submitForm.status === 'Виконано' &&
        submitForm.approvedByWarehouse === 'Підтверджено' &&
        submitForm.approvedByAccountant === 'Підтверджено' &&
        submitForm.approvedByRegionalManager === 'Підтверджено'
      ) {
        const d = new Date();
        submitForm.bonusApprovalDate = d.toISOString().split('T')[0];
      }
    }
    // Розрахунок кожної суми на льоту
    const oilTotal = (parseFloat(submitForm.oilUsed)||0) * (parseFloat(submitForm.oilPrice)||0);
    const filterSum = (parseFloat(submitForm.filterCount)||0) * (parseFloat(submitForm.filterPrice)||0);
    const fuelFilterSum = (parseFloat(submitForm.fuelFilterCount)||0) * (parseFloat(submitForm.fuelFilterPrice)||0);
    const airFilterSum = (parseFloat(submitForm.airFilterCount)||0) * (parseFloat(submitForm.airFilterPrice)||0);
    const antifreezeSum = (parseFloat(submitForm.antifreezeL)||0) * (parseFloat(submitForm.antifreezePrice)||0);
    const serviceTotal =
      oilTotal +
      filterSum +
      fuelFilterSum +
      airFilterSum +
      antifreezeSum +
      (parseFloat(submitForm.otherSum)||0) +
      (parseFloat(submitForm.perDiem)||0) +
      (parseFloat(submitForm.living)||0) +
      (parseFloat(submitForm.otherExp)||0) +
      (parseFloat(submitForm.transportSum)||0) +
      (parseFloat(submitForm.workPrice)||0);
    onSave({
      ...submitForm,
      oilTotal,
      filterSum,
      fuelFilterSum,
      airFilterSum,
      antifreezeSum,
      serviceTotal
    });
    onClose();
  };

  // Додаю розрахунок для полів
  const calcOilTotal = () => (parseFloat(form.oilUsed)||0)*(parseFloat(form.oilPrice)||0);
  const calcFilterSum = () => (parseFloat(form.filterCount)||0)*(parseFloat(form.filterPrice)||0);
  const calcFuelFilterSum = () => (parseFloat(form.fuelFilterCount)||0)*(parseFloat(form.fuelFilterPrice)||0);
  const calcAntifreezeSum = () => (parseFloat(form.antifreezeL)||0)*(parseFloat(form.antifreezePrice)||0);
  const calcServiceTotal = () => (
    (parseFloat(calcOilTotal())||0)+
    (parseFloat(calcFilterSum())||0)+
    (parseFloat(calcFuelFilterSum())||0)+
    (parseFloat(calcAntifreezeSum())||0)+
    (parseFloat(form.otherSum)||0)+
    (parseFloat(form.workPrice)||0)+
    (parseFloat(form.perDiem)||0)+
    (parseFloat(form.living)||0)+
    (parseFloat(form.otherExp)||0)+
    (parseFloat(form.transportSum)||0)
  );

  return (
    <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'#000a',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto'}}>
      <style>{`
        .modal-task-form input, .modal-task-form select, .modal-task-form textarea {
          background: #22334a;
          color: #fff;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 8px;
          font-size: 1rem;
        }
        .modal-task-form input[readonly], .modal-task-form input:read-only, .modal-task-form textarea[readonly], .modal-task-form textarea:read-only {
          color: #aaa;
        }
        .modal-task-form .group {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 24px;
        }
        .modal-task-form .field {
          flex: 1 1 220px;
          min-width: 180px;
          max-width: 340px;
          margin-bottom: 0;
        }
        .modal-task-form .field.textarea {
          flex: 1 1 100%;
          max-width: 100%;
        }
        .modal-task-form .block-detail {
          margin-bottom: 24px;
        }
        .label-above label {
          display: block;
          margin-bottom: 4px;
          font-weight: 600;
        }
        .modal-task-form .main-header-group {
          display: flex;
          flex-direction: row;
          gap: 16px;
          margin-bottom: 24px;
        }
      `}</style>
      <form className="modal-task-form" onSubmit={handleSubmit} style={{background:'#1a2636',padding:32,paddingBottom:48,borderRadius:0,width:'90vw',maxWidth:1100,maxHeight:'90vh',color:'#fff',boxShadow:'0 4px 32px #0008',overflowY:'auto',display:'flex',flexDirection:'column',justifyContent:'flex-start',marginTop:48,position:'relative'}}>
        <button type="button" onClick={onClose} style={{position:'absolute',top:40,right:24,fontSize:28,background:'none',border:'none',color:'#fff',cursor:'pointer',zIndex:10}} aria-label="Закрити">×</button>
        <h2 style={{marginTop:0}}>Завдання</h2>
        {error && <div style={{color:'#ff6666',marginBottom:16,fontWeight:600}}>{error}</div>}
        <div style={{display:'flex',gap:16,marginBottom:24}}>
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
                    {regions.map(r => (
                      <option key={r} value={r}>{r}</option>
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
            ...statusGroup.slice(1).filter(n => n !== 'serviceRegion'),
            ...regionClientGroup.slice(1),
            ...paymentEquipmentGroup.slice(1),
            ...workEngineersGroup.slice(1),
            ...oilGroup.slice(1),
            ...filterGroup.slice(1),
            ...fuelFilterGroup.slice(1),
            ...airFilterGroup.slice(1),
            ...antifreezeGroup.slice(1),
            ...transportGroup.slice(1),
            ...expensesGroup.slice(1),
            ...otherMaterialsGroup.slice(1),
            ...warehouseGroup.slice(1),
            ...accountantGroup.slice(1),
            ...regionalManagerGroup.slice(1)
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
          if (idx === orderedFields.indexOf('edrpou')) {
            return (
              <div className="group" key="regionClientGroup">
                {['edrpou', 'client', 'address', 'invoice'].map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                    return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type="text" name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
                    </div>
                  );
                })}
              </div>
            );
          }
          if (idx === orderedFields.indexOf('paymentType')) {
            return (
              <div className="group" key="paymentEquipmentGroup">
                {paymentEquipmentGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  // serviceTotal — тільки для читання, автозаповнення
                  if (n === 'serviceTotal') {
                    value =
                      (parseFloat(form.oilUsed)||0)*(parseFloat(form.oilPrice)||0) +
                      (parseFloat(form.filterCount)||0)*(parseFloat(form.filterPrice)||0) +
                      (parseFloat(form.fuelFilterCount)||0)*(parseFloat(form.fuelFilterPrice)||0) +
                      (parseFloat(form.airFilterCount)||0)*(parseFloat(form.airFilterPrice)||0) +
                      (parseFloat(form.antifreezeL)||0)*(parseFloat(form.antifreezePrice)||0) +
                      (parseFloat(form.otherSum)||0) +
                      (parseFloat(form.perDiem)||0) +
                      (parseFloat(form.living)||0) +
                      (parseFloat(form.otherExp)||0) +
                      (parseFloat(form.transportSum)||0) +
                      (parseFloat(form.workPrice)||0);
                  }
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      {f.type === 'select' ? (
                        <select name={f.name} value={form[f.name] || ''} onChange={handleChange} disabled={isReadOnly(f.name)}>
                          {(f.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type={f.type} name={f.name} value={value} onChange={handleChange} readOnly={f.name==='serviceTotal' || isReadOnly(f.name)} />
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
                  if (f.name === 'oilTotal') value = (parseFloat(form.oilUsed)||0)*(parseFloat(form.oilPrice)||0) || '';
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
                  if (f.name === 'filterSum') value = (parseFloat(form.filterCount)||0)*(parseFloat(form.filterPrice)||0) || '';
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
                  if (f.name === 'fuelFilterSum') value = (parseFloat(form.fuelFilterCount)||0)*(parseFloat(form.fuelFilterPrice)||0) || '';
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
                  if (f.name === 'airFilterSum') value = (parseFloat(form.airFilterCount)||0)*(parseFloat(form.airFilterPrice)||0) || '';
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
                  if (f.name === 'antifreezeSum') value = (parseFloat(form.antifreezeL)||0)*(parseFloat(form.antifreezePrice)||0) || '';
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
              <div className="group" key="transportGroup">
                {transportGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  return (
                    <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                      <label>{f.label}</label>
                      <input type="text" name={f.name} value={value} onChange={handleChange} readOnly={isReadOnly(f.name)} />
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
                      form.approvedByAccountant === 'Підтверджено' &&
                      form.approvedByRegionalManager === 'Підтверджено'
                    ) {
                      const d = new Date();
                      value = `${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
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
          if (['requestDesc','otherMaterials','warehouseComment','accountantComment'].includes(name)) {
            const f = fields.find(f=>f.name===name);
            if (!f) return null;
            return (
              <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field textarea'}>
                <label>{f.label}</label>
                <textarea name={f.name} value={form[f.name] || ''} onChange={handleChange} readOnly={isReadOnly(f.name)} />
              </div>
            );
          }
          // serviceTotal, bonusApprovalDate — тільки для читання
          if (name === 'serviceTotal') {
            const f = fields.find(f=>f.name===name);
            let value =
              (parseFloat(form.oilUsed)||0)*(parseFloat(form.oilPrice)||0) +
              (parseFloat(form.filterCount)||0)*(parseFloat(form.filterPrice)||0) +
              (parseFloat(form.fuelFilterCount)||0)*(parseFloat(form.fuelFilterPrice)||0) +
              (parseFloat(form.airFilterCount)||0)*(parseFloat(form.airFilterPrice)||0) +
              (parseFloat(form.antifreezeL)||0)*(parseFloat(form.antifreezePrice)||0) +
              (parseFloat(form.otherSum)||0) +
              (parseFloat(form.perDiem)||0) +
              (parseFloat(form.living)||0) +
              (parseFloat(form.otherExp)||0) +
              (parseFloat(form.transportSum)||0) +
              (parseFloat(form.workPrice)||0);
            return (
              <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                <label>{f.label}</label>
                <input type="text" name={f.name} value={value} readOnly tabIndex={-1} />
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
              form.approvedByAccountant === 'Підтверджено' &&
              form.approvedByRegionalManager === 'Підтверджено'
            ) {
              const d = new Date();
              autoValue = d.toISOString().split('T')[0]; // yyyy-mm-dd
            } else {
              autoValue = form[name] || '';
            }
            const isAdmin = mode === 'admin';
            // --- Конвертація значення для адміністратора ---
            let dateValue = '';
            if (isAdmin) {
              // Якщо вже є значення у форматі MM.YYYY, конвертуємо у YYYY-MM-DD
              if (form[name] && /^\d{2}\.\d{4}$/.test(form[name])) {
                const [mm, yyyy] = form[name].split('.');
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
                    readOnly={false}
                  tabIndex={-1}
                />
                ) : (
                  <input
                    type="text"
                    name={f.name}
                    value={autoValue ? `${autoValue.slice(5,7)}.${autoValue.slice(0,4)}` : ''}
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
                  {regions.map(r => (
                    <option key={r} value={r}>{r}</option>
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
                  if (n === 'engineer1' || n === 'engineer2') {
                    return (
                      <div key={f.name} className={labelAboveFields.includes(f.name) ? 'field label-above' : 'field'}>
                        <label>{f.label}</label>
                        <select name={f.name} value={value} onChange={handleChange} disabled={isReadOnly(f.name)}>
                          <option value="">Виберіть інженера</option>
                          {serviceEngineers.map(u => (
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
                  if (n === 'accountantComment') {
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
          if (idx === orderedFields.indexOf('approvedByRegionalManager')) {
            return (
              <div className="group" key="regionalManagerGroup">
                {regionalManagerGroup.map(n => {
                  const f = fields.find(f=>f.name===n);
                  if (!f) return null;
                  let value = form[f.name] || '';
                  if (n === 'regionalManagerComment') {
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
        <div style={{display:'flex',gap:12,marginTop:24}}>
          <button type="submit" style={{flex:1}}>Зберегти</button>
          <button type="button" onClick={onClose} style={{flex:1,background:'#888',color:'#fff'}}>Скасувати</button>
        </div>
        <div style={{marginTop:48}}></div>
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
    </div>
  );
}