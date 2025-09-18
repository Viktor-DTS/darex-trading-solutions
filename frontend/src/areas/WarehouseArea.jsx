import React, { useState, useEffect, useMemo } from 'react';
import ModalTaskForm, { fields as allTaskFields } from '../ModalTaskForm';
import TaskTable from '../components/TaskTable';
import { tasksAPI } from '../utils/tasksAPI';
const initialTask = {
  id: null,
  status: '',
  requestDate: '',
  requestDesc: '',
  serviceRegion: '',
  address: '',
  equipmentSerial: '',
  equipment: '',
  work: '',
  date: '',
  paymentDate: '',
  engineer1: '',
  engineer2: '',
  client: '',
  requestNumber: '',
  invoice: '',
  paymentType: '',
  serviceTotal: '',
  approvedByWarehouse: null,
  warehouseComment: '',
  approvedByAccountant: null,
  accountantComment: '',
  accountantComments: '',
  approvedByRegionalManager: null,
  regionalManagerComment: '',
  comments: '',
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
  carNumber: '',
  transportKm: '',
  transportSum: '',
};
export default function WarehouseArea({ user }) {
  console.log('DEBUG WarehouseArea: user =', user);
  console.log('DEBUG WarehouseArea: user.region =', user?.region);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  // Ініціалізую filters з усіма можливими ключами для фільтрації
  const allFilterKeys = allTaskFields
    .map(f => f.name)
    .reduce((acc, key) => {
      acc[key] = '';
      if (["date", "requestDate"].includes(key)) {
        acc[key + 'From'] = '';
        acc[key + 'To'] = '';
      }
      return acc;
    }, {});
  const [filters, setFilters] = useState(allFilterKeys);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [tab, setTab] = useState('pending');
  const region = user?.region || '';
  // Додаємо useEffect для оновлення filters при зміні allTaskFields
  // але зберігаємо вже введені користувачем значення
  useEffect(() => {
    const newFilterKeys = allTaskFields
      .map(f => f.name)
      .reduce((acc, key) => {
        acc[key] = '';
        if (["date", "requestDate"].includes(key)) {
          acc[key + 'From'] = '';
          acc[key + 'To'] = '';
        }
        return acc;
      }, {});
    // Оновлюємо filters, зберігаючи вже введені значення
    setFilters(prevFilters => {
      const updatedFilters = { ...newFilterKeys };
      // Зберігаємо вже введені значення
      Object.keys(prevFilters).forEach(key => {
        if (prevFilters[key] && prevFilters[key] !== '') {
          updatedFilters[key] = prevFilters[key];
        }
      });
      return updatedFilters;
    });
  }, [allTaskFields]); // Залежність від allTaskFields
  
  // Автоматично встановлюємо "Загальний" для користувачів з множинними регіонами
  useEffect(() => {
    console.log('DEBUG WarehouseArea useEffect: user?.region =', user?.region);
    console.log('DEBUG WarehouseArea useEffect: filters.serviceRegion =', filters.serviceRegion);
    console.log('DEBUG WarehouseArea useEffect: user.region.includes(",") =', user?.region?.includes(','));
    console.log('DEBUG WarehouseArea useEffect: filters.serviceRegion === "" =', filters.serviceRegion === '');
    console.log('DEBUG WarehouseArea useEffect: filters.serviceRegion === "" || filters.serviceRegion === undefined =', filters.serviceRegion === '' || filters.serviceRegion === undefined);
    if (user?.region && user.region.includes(',') && (filters.serviceRegion === '' || filters.serviceRegion === undefined)) {
      console.log('DEBUG WarehouseArea: Auto-setting serviceRegion to "Загальний" for multi-region user');
      setFilters(prev => {
        const newFilters = { ...prev, serviceRegion: 'Загальний' };
        console.log('DEBUG WarehouseArea: setFilters called with newFilters =', newFilters);
        return newFilters;
      });
    }
  }, [user?.region, filters.serviceRegion]);

  useEffect(() => {
    setLoading(true);
    tasksAPI.getAll().then(tasks => {
      setTasks(tasks);
    }).finally(() => setLoading(false));
  }, []);
  // Автоматичне оновлення даних при фокусі на вкладку браузера
  useEffect(() => {
    const handleFocus = () => {
      tasksAPI.getAll().then(freshTasks => {
        setTasks(freshTasks);
      }).catch(error => {
        console.error('[ERROR] WarehouseArea - помилка оновлення при фокусі:', error);
      });
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);
  const handleApprove = async (id, approved, comment) => {
    setLoading(true);
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    // Перевіряємо чи всі підтвердження пройшли для автоматичного заповнення bonusApprovalDate
    let next = {
      ...t,
      approvedByWarehouse: approved,
      warehouseComment: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.warehouseComment)
    };
    let bonusApprovalDate = t.bonusApprovalDate;
    if (
      next.status === 'Виконано' &&
      (next.approvedByWarehouse === 'Підтверджено' || next.approvedByWarehouse === true) &&
      (next.approvedByAccountant === 'Підтверджено' || next.approvedByAccountant === true) &&
      (next.approvedByRegionalManager === 'Підтверджено' || next.approvedByRegionalManager === true)
    ) {
      const d = new Date();
      bonusApprovalDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    }
    const updated = await tasksAPI.update(id, {
      ...next,
      bonusApprovalDate
    });
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    if (approved === 'Підтверджено') {
      setTab('archive');
    }
    setLoading(false);
  };
  const handleFilter = e => {
    console.log('DEBUG WarehouseArea: handleFilter CALLED - e.target.name =', e.target.name);
    console.log('DEBUG WarehouseArea: handleFilter CALLED - e.target.value =', e.target.value);
    console.log('DEBUG WarehouseArea: handleFilter CALLED - current filters =', filters);
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    console.log('DEBUG WarehouseArea: handleFilter - newFilters =', newFilters);
    setFilters(newFilters);
  };
  const handleEdit = t => {
    const isReadOnly = t._readOnly;
    const taskData = { ...t };
    delete taskData._readOnly; // Видаляємо прапорець з даних завдання
    setEditTask(taskData);
    setModalOpen(true);
    // Передаємо readOnly в ModalTaskForm
    if (isReadOnly) {
      // Встановлюємо прапорець для ModalTaskForm
      setEditTask(prev => ({ ...prev, _readOnly: true }));
    }
  };
  const handleSave = async (task) => {
    setLoading(true);
    let updatedTask = null;
    if (editTask && editTask.id) {
      updatedTask = await tasksAPI.update(editTask.id, task);
    } else {
      updatedTask = await tasksAPI.add(task);
    }
    // Оновлюємо дані з бази після збереження
    try {
      const freshTasks = await tasksAPI.getAll();
      setTasks(freshTasks);
    } catch (error) {
      console.error('[ERROR] WarehouseArea handleSave - помилка оновлення даних з бази:', error);
    }
    // Закриваємо модальне вікно
    setEditTask(null);
    setLoading(false);
  };
  const filtered = useMemo(() => {
    console.log('DEBUG WarehouseArea filtered: useMemo dependencies changed, recalculating...');
    console.log('DEBUG WarehouseArea filtered: tasks.length =', tasks?.length);
    console.log('DEBUG WarehouseArea filtered: filters =', filters);
    console.log('DEBUG WarehouseArea filtered: user =', user);
    console.log('DEBUG WarehouseArea filtered: useMemo dependencies = [tasks, filters, user]');
    console.log('DEBUG WarehouseArea filtered: filters.serviceRegion =', filters.serviceRegion);
    console.log('DEBUG WarehouseArea filtered: user.region =', user?.region);
    
    const result = tasks.filter(t => {
      // Додаткове логування для завдань з регіонами користувача
      if (t.serviceRegion === 'Львівський' || t.serviceRegion === 'Хмельницький') {
        console.log('🔍 FOUND USER REGION TASK!', t.id, 'serviceRegion =', t.serviceRegion);
      }
      
      // Перевірка доступу до регіону заявки
      if (user?.region && user.region !== 'Україна') {
        // Якщо користувач має множинні регіони (через кому)
        if (user.region.includes(',')) {
          const userRegions = user.region.split(',').map(r => r.trim());
          console.log('🌍 Multi-region user, userRegions =', userRegions);
          
          // Якщо вибрано "Загальний" або нічого не вибрано, показуємо всі регіони користувача
          if (filters.serviceRegion === 'Загальний' || !filters.serviceRegion || filters.serviceRegion === '') {
            // Перевіряємо, чи регіон завдання є в списку регіонів користувача
            const taskRegion = t.serviceRegion?.trim();
            const userRegionsTrimmed = userRegions.map(r => r.trim());
            const isInUserRegions = userRegionsTrimmed.includes(taskRegion);
            
            console.log('🔍 GENERAL FILTER: taskRegion =', taskRegion, '| userRegions =', userRegionsTrimmed, '| isInUserRegions =', isInUserRegions);
            
            if (!isInUserRegions) {
              return false;
            }
          } else {
            // Якщо вибрано конкретний регіон
            console.log('🎯 SPECIFIC FILTER: taskRegion =', t.serviceRegion, '| filter =', filters.serviceRegion, '| match =', t.serviceRegion === filters.serviceRegion);
            if (t.serviceRegion !== filters.serviceRegion) {
              return false;
            }
          }
        } else {
          // Якщо користувач має один регіон
          if (t.serviceRegion !== user.region) {
            return false;
          }
        }
      }
      
      // Інші фільтри
    for (const key in filters) {
      const value = filters[key];
      if (!value) continue;
      if (key.endsWith('From')) {
        const field = key.replace('From', '');
        if (!t[field] || t[field] < value) return false;
      } else if (key.endsWith('To')) {
        const field = key.replace('To', '');
        if (!t[field] || t[field] > value) return false;
      } else if ([
        'approvedByRegionalManager', 'approvedByWarehouse', 'approvedByAccountant', 'paymentType', 'status'
      ].includes(key)) {
        if (t[key]?.toString() !== value.toString()) return false;
      } else if ([
        'airFilterCount', 'airFilterPrice', 'serviceBonus'
      ].includes(key)) {
        if (Number(t[key]) !== Number(value)) return false;
      } else if ([
        'bonusApprovalDate'
      ].includes(key)) {
        if (t[key] !== value) return false;
      } else if ([
        'regionalManagerComment', 'airFilterName'
      ].includes(key)) {
        if (!t[key] || !t[key].toString().toLowerCase().includes(value.toLowerCase())) return false;
      } else if (typeof t[key] === 'string' || typeof t[key] === 'number') {
        if (!t[key]?.toString().toLowerCase().includes(value.toLowerCase())) return false;
      }
    }
      console.log('DEBUG WarehouseArea filtered: Task passed all filters');
    return true;
  });
    
    console.log('✅ FILTERED RESULT: length =', result.length);
    return result;
  }, [tasks, filters, user]);
  const pending = filtered.filter(
    t => t.status === 'Виконано' && t.approvedByWarehouse !== 'Підтверджено'
  );
  function isApproved(v) {
    return v === true || v === 'Підтверджено';
  }
  const archive = filtered.filter(
    t => t.status === 'Виконано' && t.approvedByWarehouse === 'Підтверджено'
  ).filter(t => {
    // Фільтрація за регіоном для архіву
    // Якщо користувач має регіон "Україна", показуємо всі заявки
    if (region === 'Україна') {
      return true;
    }
    // Інакше показуємо тільки заявки регіону користувача
    const matchesRegion = t.serviceRegion === region;
    return matchesRegion;
  });
  const tableData = tab === 'pending' ? pending : archive;
  const columns = allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: true
  }));
  // --- Формування звіту ---
  const handleFormReport = () => {
    // Фільтруємо виконані заявки за діапазоном дат
    const filteredTasks = tasks.filter(t => {
      if (t.status !== 'Виконано') return false;
      if (filters.dateFrom && (!t.date || t.date < filters.dateFrom)) return false;
      if (filters.dateTo && (!t.date || t.date > filters.dateTo)) return false;
      return true;
    });
    // Деталізація по кожній заявці
    const details = filteredTasks.map(t => {
      const materials = [];
      if (t.oilType && t.oilUsed) materials.push({ label: 'Олива', type: t.oilType, qty: Number(t.oilUsed), price: Number(t.oilPrice)||0 });
      if (t.filterName && t.filterCount) materials.push({ label: 'Фільтр масл', type: t.filterName, qty: Number(t.filterCount), price: Number(t.filterPrice)||0 });
      if (t.fuelFilterName && t.fuelFilterCount) materials.push({ label: 'Фільтр палив', type: t.fuelFilterName, qty: Number(t.fuelFilterCount), price: Number(t.fuelFilterPrice)||0 });
      if (t.airFilterName && t.airFilterCount) materials.push({ label: 'Фільтр повітряний', type: t.airFilterName, qty: Number(t.airFilterCount), price: Number(t.airFilterPrice)||0 });
      if (t.antifreezeType && t.antifreezeL) materials.push({ label: 'Антифриз', type: t.antifreezeType, qty: Number(t.antifreezeL), price: Number(t.antifreezePrice)||0 });
      if (t.otherMaterials) materials.push({ label: 'Інші матеріали', type: t.otherMaterials, qty: '', price: Number(t.otherSum)||0 });
      materials.forEach(m => { m.totalSum = (Number(m.qty) || 0) * (Number(m.price) || 0); });
      return {
        date: t.date,
        company: t.company,
        work: t.work,
        engineers: [t.engineer1, t.engineer2].filter(Boolean).join(', '),
        materials,
      };
    });
    // --- Підсумки по матеріалах для кожної компанії ---
    const companyGroups = {};
    details.forEach(d => {
      if (!companyGroups[d.company]) companyGroups[d.company] = [];
      companyGroups[d.company].push(d);
    });
    const summary = {};
    Object.keys(companyGroups).forEach(company => {
      const companyDetails = companyGroups[company];
      companyDetails.forEach(detail => {
        detail.materials.forEach(material => {
          const key = `${material.label}_${material.type}`;
          if (!summary[key]) {
            summary[key] = {
              label: material.label,
              type: material.type,
              totalQty: 0,
              totalSum: 0
            };
          }
          summary[key].totalQty += Number(material.qty) || 0;
          summary[key].totalSum += Number(material.totalSum) || 0;
        });
      });
    });
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Звіт по матеріалах</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; color: #222; padding: 24px; }
          h2 { color: #1976d2; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
          th, td { border: 1px solid #000; padding: 6px 10px; text-align: center; }
          th { background: #ffe600; color: #222; }
        </style>
      </head>
      <body>
        <h2>Звіт по матеріалах</h2>
        <h3>Підсумок по матеріалах (по компаніях):</h3>
        ${Object.entries(companySummaries).map(([company, summary]) => `
          <div style="margin-bottom:24px;">
            <div style="font-weight:600;margin-bottom:8px;color:#1976d2;">${company}</div>
        <table>
          <thead>
            <tr>
                  <th>Матеріал</th>
                  <th>Тип</th>
                  <th>Загальна кількість</th>
                  <th>Загальна вартість, грн.</th>
            </tr>
          </thead>
          <tbody>
                ${Object.values(summary).map(item => `
              <tr>
                    <td>${item.label}</td>
                    <td>${item.type}</td>
                    <td>${item.totalQty}</td>
                    <td>${item.totalSum}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
          </div>
        `).join('')}
        <h3>Деталізація по заявках:</h3>
        ${details.map(detail => `
          <div style="margin-bottom:24px;">
            <div style="font-weight:600;margin-bottom:8px;color:#1976d2;">
              ${detail.date} - ${detail.company} - ${detail.work}
            </div>
            <div style="margin-bottom:8px;color:#666;">Інженери: ${detail.engineers}</div>
            ${detail.materials.length > 0 ? `
              <table>
          <thead>
            <tr>
              <th>Матеріал</th>
                    <th>Тип</th>
                    <th>Кількість</th>
                    <th>Вартість</th>
                    <th>Загальна вартість, грн.</th>
            </tr>
          </thead>
          <tbody>
                  ${detail.materials.map(material => `
              <tr>
                      <td>${material.label}</td>
                      <td>${material.type}</td>
                      <td>${material.qty}</td>
                      <td>${material.price}</td>
                      <td>${material.totalSum}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
            ` : ''}
          </div>
        `).join('')}
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };
  // Функція для створення звіту по замовнику
  const openClientReport = (clientName) => {
    const clientTasks = tasks.filter(task => task.client === clientName);
    if (clientTasks.length === 0) {
      alert('Немає даних для даного замовника');
      return;
    }
    // Сортуємо завдання за датою (від найновішої до найстарішої)
    const sortedTasks = clientTasks.sort((a, b) => {
      const dateA = new Date(a.date || a.requestDate || 0);
      const dateB = new Date(b.date || b.requestDate || 0);
      return dateB - dateA;
    });
    // Створюємо HTML звіт
    const reportHTML = `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Звіт по замовнику: ${clientName}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
          }
          .header {
            background: #22334a;
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
          }
          .task-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .task-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #22334a;
          }
          .task-date {
            font-size: 18px;
            font-weight: bold;
            color: #22334a;
          }
          .task-status {
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .status-completed { background: #4caf50; color: white; }
          .status-in-progress { background: #ff9800; color: white; }
          .status-new { background: #2196f3; color: white; }
          .status-blocked { background: #f44336; color: white; }
          .materials-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
            margin-top: 15px;
          }
          .material-section {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #22334a;
          }
          .material-section h4 {
            margin: 0 0 10px 0;
            color: #22334a;
            font-size: 14px;
            text-transform: uppercase;
          }
          .material-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 5px 0;
            border-bottom: 1px solid #eee;
          }
          .material-item:last-child {
            border-bottom: none;
          }
          .material-label {
            font-weight: 500;
            color: #555;
          }
          .material-value {
            font-weight: bold;
            color: #22334a;
          }
          .task-info {
            margin-bottom: 15px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }
          .info-label {
            font-weight: 500;
            color: #666;
          }
          .info-value {
            font-weight: bold;
            color: #22334a;
          }
          .summary {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 6px;
            margin-top: 20px;
            border-left: 4px solid #2196f3;
          }
          .summary h3 {
            margin: 0 0 10px 0;
            color: #1976d2;
          }
          .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #22334a;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          }
          .print-button:hover {
            background: #1a2636;
          }
          @media print {
            .print-button { display: none; }
            body { background: white; }
          }
        </style>
      </head>
      <body>
        <button class="print-button" onclick="window.print()">🖨️ Друкувати</button>
        <div class="header">
          <h1>Звіт по замовнику: ${clientName}</h1>
          <p>Кількість проведених робіт: ${sortedTasks.length}</p>
          <p>Дата створення звіту: ${new Date().toLocaleDateString('uk-UA')}</p>
        </div>
        ${sortedTasks.map(task => `
          <div class="task-card">
            <div class="task-header">
              <div class="task-date">Дата проведення робіт: ${task.date || 'Не вказано'}</div>
              <div class="task-status status-${task.status === 'Виконано' ? 'completed' : task.status === 'В роботі' ? 'in-progress' : task.status === 'Новий' ? 'new' : 'blocked'}">
                ${task.status || 'Невідомо'}
              </div>
            </div>
            <div class="task-info">
              <div class="info-row">
                <span class="info-label">Дата заявки:</span>
                <span class="info-value">${task.requestDate || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Замовник:</span>
                <span class="info-value">${task.client || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Адреса:</span>
                <span class="info-value">${task.address || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Найменування робіт:</span>
                <span class="info-value">${task.work || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Сервісні інженери:</span>
                <span class="info-value">${task.engineer1 || ''} ${task.engineer2 ? ', ' + task.engineer2 : ''}</span>
              </div>
            </div>
            <div class="materials-grid">
              ${task.oilType || task.oilUsed || task.oilPrice ? `
                <div class="material-section">
                  <h4>Олива</h4>
                  ${task.oilType ? `<div class="material-item"><span class="material-label">Тип оливи:</span><span class="material-value">${task.oilType}</span></div>` : ''}
                  ${task.oilUsed ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.oilUsed} л</span></div>` : ''}
                  ${task.oilPrice ? `<div class="material-item"><span class="material-label">Ціна за л:</span><span class="material-value">${task.oilPrice} грн</span></div>` : ''}
                  ${task.oilTotal ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.oilTotal} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.filterName || task.filterCount || task.filterPrice ? `
                <div class="material-section">
                  <h4>Масляний фільтр</h4>
                  ${task.filterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.filterName}</span></div>` : ''}
                  ${task.filterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.filterCount} шт</span></div>` : ''}
                  ${task.filterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.filterPrice} грн</span></div>` : ''}
                  ${task.filterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.filterSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.airFilterName || task.airFilterCount || task.airFilterPrice ? `
                <div class="material-section">
                  <h4>Повітряний фільтр</h4>
                  ${task.airFilterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.airFilterName}</span></div>` : ''}
                  ${task.airFilterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.airFilterCount} шт</span></div>` : ''}
                  ${task.airFilterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.airFilterPrice} грн</span></div>` : ''}
                  ${task.airFilterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.airFilterSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.antifreezeType || task.antifreezeL || task.antifreezePrice ? `
                <div class="material-section">
                  <h4>Антифриз</h4>
                  ${task.antifreezeType ? `<div class="material-item"><span class="material-label">Тип:</span><span class="material-value">${task.antifreezeType}</span></div>` : ''}
                  ${task.antifreezeL ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.antifreezeL} л</span></div>` : ''}
                  ${task.antifreezePrice ? `<div class="material-item"><span class="material-label">Ціна за л:</span><span class="material-value">${task.antifreezePrice} грн</span></div>` : ''}
                  ${task.antifreezeSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.antifreezeSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.fuelFilterName || task.fuelFilterCount || task.fuelFilterPrice ? `
                <div class="material-section">
                  <h4>Паливний фільтр</h4>
                  ${task.fuelFilterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.fuelFilterName}</span></div>` : ''}
                  ${task.fuelFilterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.fuelFilterCount} шт</span></div>` : ''}
                  ${task.fuelFilterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.fuelFilterPrice} грн</span></div>` : ''}
                  ${task.fuelFilterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.fuelFilterSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.otherMaterials || task.otherSum ? `
                <div class="material-section">
                  <h4>Інші матеріали</h4>
                  ${task.otherMaterials ? `<div class="material-item"><span class="material-label">Опис:</span><span class="material-value">${task.otherMaterials}</span></div>` : ''}
                  ${task.otherSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.otherSum} грн</span></div>` : ''}
                </div>
              ` : ''}
            </div>
            ${task.serviceTotal ? `
              <div class="summary">
                <h3>Загальна сума послуги: ${task.serviceTotal} грн</h3>
              </div>
            ` : ''}
          </div>
        `).join('')}
        <div class="summary">
          <h3>Підсумок по замовнику ${clientName}</h3>
          <p>Всього проведено робіт: ${sortedTasks.length}</p>
          <p>Загальна вартість всіх послуг: ${sortedTasks.reduce((sum, task) => sum + (parseFloat(task.serviceTotal) || 0), 0).toFixed(2)} грн</p>
        </div>
      </body>
      </html>
    `;
    // Відкриваємо нове вікно з звітом
    const newWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    newWindow.document.write(reportHTML);
    newWindow.document.close();
  };
  return (
    <div style={{padding:32}}>
      <h2>Завдання для затвердження (Зав. склад)</h2>
      {loading && <div>Завантаження...</div>}
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button onClick={()=>setTab('pending')} style={{width:220,padding:'10px 0',background:tab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='pending'?700:400,cursor:'pointer'}}>Заявка на підтвердженні</button>
        <button onClick={()=>setTab('archive')} style={{width:220,padding:'10px 0',background:tab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <label style={{display:'flex',alignItems:'center',gap:4}}>
          Дата виконаних робіт з:
          <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilter} />
          по
          <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilter} />
        </label>
        <button onClick={handleFormReport} style={{background:'#00bfff',color:'#fff',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:600,cursor:'pointer'}}>Сформувати звіт</button>
      </div>
      <ModalTaskForm open={modalOpen} onClose={()=>{setModalOpen(false);setEditTask(null);}} onSave={handleSave} initialData={editTask || {}} mode="warehouse" user={user} readOnly={editTask?._readOnly || false} />
      <TaskTable
        tasks={tableData}
        allTasks={tasks}
        onApprove={handleApprove}
        onEdit={handleEdit}
        role="warehouse"
        filters={filters}
        onFilterChange={handleFilter}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        approveField="approvedByWarehouse"
        commentField="warehouseComment"
        dateRange={{ from: filters.dateFrom, to: filters.dateTo }}
        setDateRange={r => setFilters(f => ({ ...f, dateFrom: r.from, dateTo: r.to }))}
        user={user}
        isArchive={tab === 'archive'}
        onHistoryClick={openClientReport}
      />
    </div>
  );
} 