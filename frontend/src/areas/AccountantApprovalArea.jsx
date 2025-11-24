import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import ModalTaskForm, { fields as allTaskFields } from '../ModalTaskForm';
import TaskTable from '../components/TaskTable';
import AccountantReportsModal from '../components/AccountantReportsModal';
import { tasksAPI } from '../utils/tasksAPI';
import { columnsSettingsAPI } from '../utils/columnsSettingsAPI';
import { useLazyData } from '../hooks/useLazyData';
import { debounce } from '../utils/debounce';

const AccountantApprovalArea = memo(function AccountantApprovalArea({ user, accessRules, currentArea }) {
  // Перевіряємо права доступу для поточної області
  const hasFullAccess = accessRules && accessRules[user?.role] && accessRules[user?.role][currentArea] === 'full';
  const isReadOnly = accessRules && accessRules[user?.role] && accessRules[user?.role][currentArea] === 'read';
  
  // Перевіряємо чи користувач завантажений
  if (!user) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '200px',
        fontSize: '16px',
        color: '#666'
      }}>
        Завантаження даних користувача...
      </div>
    );
  }

  // Використовуємо хук useLazyData для оптимізації (як у ServiceArea)
  const { 
    data: tasks, 
    loading, 
    error, 
    activeTab, 
    setActiveTab, 
    refreshData, 
    getTabCount 
  } = useLazyData(user, 'pending');

  // Налаштування колонок
  const [columnSettings, setColumnSettings] = useState({});
  // Користувачі (для звітів)
  const [users, setUsers] = useState([]);
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await columnsSettingsAPI.getAllUsers();
        setUsers(usersData || []);
      } catch (error) {
        console.error('[ERROR] AccountantApprovalArea - помилка завантаження користувачів:', error);
        setUsers([]);
      }
    };
    loadUsers();
  }, []);
  
  // Завантаження налаштувань колонок
  useEffect(() => {
    const loadColumnSettings = async () => {
      try {
        const settings = await columnsSettingsAPI.loadSettings(user.login, 'accountant-approval');
        setColumnSettings(settings);
      } catch (error) {
        console.error('Помилка завантаження налаштувань колонок:', error);
      }
    };
    
    if (user?.login) {
      loadColumnSettings();
    }
  }, [user?.login]);

  // Ініціалізую filters з усіма можливими ключами для фільтрації
  const allFilterKeys = allTaskFields
    .map(f => f.name)
    .reduce((acc, key) => {
      acc[key] = '';
      if (["date", "requestDate", "paymentDate"].includes(key)) {
        acc[key + 'From'] = '';
        acc[key + 'To'] = '';
      }
      return acc;
    }, {});
  const [filters, setFilters] = useState(allFilterKeys);
  
  const [approvalFilter, setApprovalFilter] = useState('all'); // 'all', 'approved', 'not_approved'
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [tableKey, setTableKey] = useState(0);
  const [reportsModalOpen, setReportsModalOpen] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  
  // Додаткові завдання для чекбокса "Відобразити всі заявки"
  const [additionalTasks, setAdditionalTasks] = useState([]);
  const [loadingAdditionalTasks, setLoadingAdditionalTasks] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);

  // Функція для завантаження додаткових завдань (статус "Заявка" та "В роботі")
  const loadAdditionalTasks = async () => {
    if (additionalTasks.length > 0) {
      return;
    }
    
    setLoadingAdditionalTasks(true);
    try {
      const notDoneTasks = await tasksAPI.getByStatus('notDone', user.region);
      setAdditionalTasks(notDoneTasks);
    } catch (error) {
      console.error('[ERROR] AccountantApprovalArea - помилка завантаження додаткових завдань:', error);
    } finally {
      setLoadingAdditionalTasks(false);
    }
  };

  // Додаємо useEffect для оновлення filters при зміні allTaskFields
  useEffect(() => {
    const newFilterKeys = allTaskFields
      .map(f => f.name)
      .reduce((acc, key) => {
        acc[key] = '';
        if (["date", "requestDate", "paymentDate"].includes(key)) {
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
  }, [allTaskFields]);

  // Функція для ручного оновлення кешу
  const refreshCache = async () => {
    try {
      await refreshData(activeTab);
    } catch (error) {
      console.error('[ERROR] AccountantApprovalArea refreshCache - помилка оновлення кешу:', error);
      alert('Помилка оновлення даних: ' + error.message);
    }
  };

  // Функція для повного перезавантаження вкладки (оптимізована версія)
  const fullTabReload = useCallback(async () => {
    try {
      console.log('🔄 AccountantApprovalArea FULL TAB RELOAD: Starting optimized reload...');
      
      // Step 1: Очищаємо кеш поточної вкладки (не всіх, тільки активної для оптимізації)
      console.log('🔄 Step 1: Clearing cache for active tab...');
      await refreshData(activeTab);
      
      // Step 2: Перезавантажуємо всі завдання з API (без попереднього очищення для меншої кількості ре-рендерів)
      console.log('🔄 Step 2: Reloading all tasks from API...');
      try {
        const allTasksData = await tasksAPI.getAll();
        setAllTasksFromAPI(allTasksData);
        console.log('✅ All tasks from API reloaded:', allTasksData.length);
      } catch (error) {
        console.error('❌ Error reloading all tasks from API:', error);
      }
      
      // Step 4: Перезавантажуємо additionalTasks якщо showAllTasks активний (оптимізовано - тільки якщо потрібно)
      if (showAllTasks) {
        console.log('🔄 Step 4: Reloading additional tasks for showAllTasks...');
        try {
          const notDoneTasks = await tasksAPI.getByStatus('notDone', user.region);
          setAdditionalTasks(notDoneTasks);
          console.log('✅ Additional tasks reloaded:', notDoneTasks.length);
        } catch (error) {
          console.error('❌ Error reloading additional tasks:', error);
        }
      }
      
      // Step 4: Форсуємо ре-рендер компонента (без зайвих затримок, React сам оновить UI)
      console.log('🔄 Step 4: Forcing component re-render...');
      setTableKey(prev => prev + 1);
      
      console.log('✅ AccountantApprovalArea FULL TAB RELOAD: Complete tab reload finished');
    } catch (error) {
      console.error('❌ Error in AccountantApprovalArea full tab reload:', error);
    }
  }, [activeTab, refreshData, showAllTasks, user.region]);

  const handleApprove = async (id, approved, comment) => {
    try {
      const t = tasks.find(t => t.id === id);
      if (!t) {
        console.error('[ERROR] AccountantApprovalArea handleApprove - заявка не знайдена:', id);
        return;
      }
      
      const currentDateTime = new Date().toISOString();
      let next = {
        ...t,
        approvedByAccountant: approved,
        accountantComment: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.accountantComment),
        accountantComments: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.accountantComments),
        // Зберігаємо інформацію про відмову
        accountantRejectionDate: approved === 'Відмова' ? currentDateTime : (approved === 'Підтверджено' ? null : t.accountantRejectionDate),
        accountantRejectionUser: approved === 'Відмова' ? (user?.name || user?.login || 'Користувач') : (approved === 'Підтверджено' ? null : t.accountantRejectionUser)
      };
      
      let bonusApprovalDate = t.bonusApprovalDate;
      if (
        next.status === 'Виконано' &&
        (next.approvedByWarehouse === 'Підтверджено' || next.approvedByWarehouse === true) &&
        (next.approvedByAccountant === 'Підтверджено' || next.approvedByAccountant === true)
      ) {
        const d = new Date();
        bonusApprovalDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      }
      
      const updated = await tasksAPI.update(id, {
        ...next,
        bonusApprovalDate
      });
      
      // Оновлюємо дані через refreshData
      await refreshData(activeTab);
      
    } catch (error) {
      console.error('[ERROR] AccountantApprovalArea handleApprove - помилка підтвердження заявки:', error);
      alert('Помилка підтвердження заявки: ' + error.message);
    }
  };

  // Debounced функція для текстових фільтрів
  const handleFilterDebounced = useCallback(
    debounce((e) => {
      setFilters(prevFilters => {
        const newFilters = { ...prevFilters, [e.target.name]: e.target.value };
        return newFilters;
      });
    }, 300), // 300ms затримка для текстових полів
    []
  );

  // Миттєва функція для select полів
  const handleFilterImmediate = useCallback(e => {
    setFilters(prevFilters => {
      const newFilters = { ...prevFilters, [e.target.name]: e.target.value };
      return newFilters;
    });
  }, []);

  // Універсальна функція handleFilter
  const handleFilter = useCallback(e => {
    const { name, type } = e.target;
    
    // Для select полів використовуємо миттєве оновлення
    if (type === 'select-one' || 
        ['approvedByRegionalManager', 'approvedByWarehouse', 'approvedByAccountant', 'paymentType', 'status'].includes(name)) {
      handleFilterImmediate(e);
    } else {
      // Для текстових полів використовуємо debounce
      handleFilterDebounced(e);
    }
  }, [handleFilterDebounced, handleFilterImmediate]);

  const handleEdit = async t => {
    const taskReadOnly = t._readOnly;
    
    // Завантажуємо сві array дані з бази для гарантії актуальності
    try {
      const freshTask = await tasksAPI.getById(t.id || t._id);
      const taskData = { ...freshTask };
      delete taskData._readOnly; // Видаляємо прапорець з даних завдання
      
      setEditTask(taskData);
      setModalOpen(true);
      // Передаємо readOnly в ModalTaskForm якщо задача має _readOnly або якщо доступ тільки для читання
      if (taskReadOnly || isReadOnly) {
        // Встановлюємо прапорець для ModalTaskForm
        setEditTask(prev => ({ ...prev, _readOnly: true }));
      }
    } catch (error) {
      console.error('[ERROR] AccountantApprovalArea handleEdit - помилка завантаження даних:', error);
      // Якщо не вдалося завантажити, використовуємо дані з таблиці
      const taskData = { ...t };
      delete taskData._readOnly;
      setEditTask(taskData);
      setModalOpen(true);
      if (taskReadOnly || isReadOnly) {
        setEditTask(prev => ({ ...prev, _readOnly: true }));
      }
    }
  };
  
  // Функція для збереження налаштувань колонок
  const handleSaveColumns = async (selectedColumns) => {
    try {
      await columnsSettingsAPI.saveColumnsSettings(user.login, 'accountant-approval', selectedColumns);
      setColumnSettings({ ...columnSettings, visible: selectedColumns });
      console.log('[DEBUG] AccountantApprovalArea - збережено налаштування колонок:', selectedColumns.length);
    } catch (error) {
      console.error('[ERROR] AccountantApprovalArea - помилка збереження налаштувань колонок:', error);
    }
  };
  
  const handleSave = async (task) => {
    let updatedTask = null;
    
    try {
      if (editTask && editTask.id) {
        updatedTask = await tasksAPI.update(editTask.id, task);
      } else {
        updatedTask = await tasksAPI.add(task);
      }
      
      // Повне перезавантаження вкладки для оновлення даних
      await fullTabReload();
      
    } catch (error) {
      console.error('[ERROR] AccountantApprovalArea handleSave - помилка збереження або оновлення даних:', error);
      alert('Помилка збереження заявки: ' + error.message);
    } finally {
      // Закриваємо модальне вікно
      setModalOpen(false);
      setEditTask(null);
    }
  };

  // Функція для видалення завдання
  const handleDelete = async (taskId) => {
    try {
      // Видаляємо завдання через API
      await tasksAPI.remove(taskId);
      
      // Оновлюємо дані
      await refreshData(activeTab);
      
    } catch (error) {
      console.error('[ERROR] AccountantApprovalArea handleDelete - помилка видалення завдання:', error);
      alert('Помилка видалення завдання: ' + error.message);
    }
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

  // Об'єднуємо основні завдання з додатковими (якщо чекбокс активний)
  const allTasks = useMemo(() => {
    if (showAllTasks) {
      return [...tasks, ...additionalTasks];
    }
    return tasks;
  }, [tasks, additionalTasks, showAllTasks]);

  // Фільтрація завдань (логіка як у бухгалтера - заявки на підтвердження)
  const filtered = useMemo(() => {
    return allTasks.filter(t => {
      for (const key in filters) {
        const value = filters[key];
        if (!value) continue;
        if (key.endsWith('From')) {
          const field = key.replace('From', '');
          if (!t[field]) return false;
          const taskDate = new Date(t[field]);
          const filterDate = new Date(value);
          if (isNaN(taskDate.getTime()) || isNaN(filterDate.getTime())) return false;
          if (taskDate < filterDate) return false;
        } else if (key.endsWith('To')) {
          const field = key.replace('To', '');
          if (!t[field]) return false;
          const taskDate = new Date(t[field]);
          const filterDate = new Date(value);
          if (isNaN(taskDate.getTime()) || isNaN(filterDate.getTime())) return false;
          if (taskDate > filterDate) return false;
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
      return true;
    });
  }, [allTasks, filters]);

  function isApproved(v) {
    return v === true || v === 'Підтверджено';
  }

  // Логіка як у бухгалтера - заявки на підтвердженні
  const pending = useMemo(() => {
    return filtered.filter(t => {
      // Базовий фільтр: заявки на підтвердженні
      const isPendingApproval = t.status === 'Виконано' && 
        isApproved(t.approvedByWarehouse) && (
        t.approvedByAccountant === null ||
        t.approvedByAccountant === undefined ||
        t.approvedByAccountant === 'На розгляді' ||
        t.approvedByAccountant === false ||
        t.approvedByAccountant === 'Відмова'
      );
      
      // Якщо чекбокс "Відобразити всі заявки" активний, додаємо заявки зі статусом "Заявка" та "В роботі"
      if (showAllTasks) {
        const isNewOrInProgress = t.status === 'Заявка' || t.status === 'В роботі';
        const shouldInclude = isPendingApproval || isNewOrInProgress;
        
        // Додаткова перевірка для фільтра затвердження
        if (approvalFilter === 'approved') {
          return shouldInclude && isApproved(t.approvedByAccountant);
        } else if (approvalFilter === 'not_approved') {
          return shouldInclude && !isApproved(t.approvedByAccountant);
        }
        
        return shouldInclude;
      }
      
      // Стандартна логіка без додаткових завдань
      if (approvalFilter === 'approved') {
        return isPendingApproval && isApproved(t.approvedByAccountant);
      } else if (approvalFilter === 'not_approved') {
        return isPendingApproval && !isApproved(t.approvedByAccountant);
      }
      
      return isPendingApproval;
    });
  }, [filtered, showAllTasks, approvalFilter]);

  const archive = useMemo(() => {
    return filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByAccountant));
  }, [filtered]);

  // Для вкладки debt використовуємо всі завдання з API (як у бухгалтера)
  const [allTasksFromAPI, setAllTasksFromAPI] = useState([]);
  const [allTasksLoading, setAllTasksLoading] = useState(false);
  
  // Завантажуємо всі завдання для вкладки debt
  useEffect(() => {
    const loadAllTasks = async () => {
      setAllTasksLoading(true);
      try {
        const allTasksData = await tasksAPI.getAll();
        setAllTasksFromAPI(allTasksData);
        console.log('[DEBUG] AccountantApprovalArea - завантажено всіх завдань з API:', allTasksData.length);
      } catch (error) {
        console.error('[ERROR] AccountantApprovalArea - помилка завантаження всіх завдань:', error);
      } finally {
        setAllTasksLoading(false);
      }
    };
    
    loadAllTasks();
  }, []); // Завантажуємо при кожному монтуванні компонента

  // Логіка заборгованості по документам (як у бухгалтера)
  const debt = useMemo(() => {
    // Використовуємо всі завдання з API для заборгованості
    return allTasksFromAPI.filter(task => {
      // Показуємо завдання, які потребують встановлення статусу заборгованості:
      // 1. Не мають встановленого debtStatus (undefined або порожнє)
      // 2. Мають paymentType (не порожнє)
      // 3. paymentType не є 'Готівка'
      const hasPaymentType = task.paymentType && task.paymentType.trim() !== '';
      const isNotCash = !['Готівка'].includes(task.paymentType);
      const needsDebtStatus = !task.debtStatus || task.debtStatus === undefined || task.debtStatus === '';
      
      return needsDebtStatus && hasPaymentType && isNotCash;
    });
  }, [allTasksFromAPI]);
  
  // Додаємо логування для діагностики
  console.log('[DEBUG] AccountantApprovalArea debt tab - allTasksFromAPI.length:', allTasksFromAPI.length);
  console.log('[DEBUG] AccountantApprovalArea debt tab - debt.length:', debt.length);

  const tableData = useMemo(() => {
    return activeTab === 'pending' ? pending : 
           activeTab === 'archive' ? archive :
           activeTab === 'debt' ? debt : [];
  }, [activeTab, pending, archive, debt]);

  const columns = allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: true
  }));

  return (
    <div style={{padding:32, width:'100%', maxWidth:'100%', boxSizing:'border-box', overflowX:'hidden'}}>
      {loading && <div>Завантаження...</div>}
      
      {/* Перший рядок: вкладки, кнопки та налаштування колонок */}
      <div style={{display:'flex',gap:16,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <button onClick={()=>setActiveTab('pending')} style={{padding:'10px 16px',background:activeTab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='pending'?700:400,cursor:'pointer',whiteSpace:'nowrap',fontSize:'1rem'}}>Заявка на підтвердженні</button>
        <button onClick={()=>setActiveTab('archive')} style={{padding:'10px 16px',background:activeTab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='archive'?700:400,cursor:'pointer',whiteSpace:'nowrap',fontSize:'1rem'}}>Архів виконаних заявок</button>
        <button onClick={()=>setActiveTab('debt')} style={{padding:'10px 16px',background:activeTab==='debt'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='debt'?700:400,cursor:'pointer',whiteSpace:'nowrap',fontSize:'1rem'}}>Заборгованість по документам</button>
        <button onClick={()=>setReportsModalOpen(true)} style={{padding:'10px 16px',background:'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:400,cursor:'pointer',whiteSpace:'nowrap',fontSize:'1rem'}}>📊 Бухгалтерські звіти</button>
        <button onClick={() => {
          console.log('[DEBUG] AccountantApprovalArea - кнопка "Оновити дані" натиснута');
          refreshCache();
        }} disabled={loading} style={{
          background: loading ? '#6c757d' : '#17a2b8',
          color:'#fff',
          border:'none',
          borderRadius:6,
          padding:'8px 20px',
          fontWeight:600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          fontSize:'1rem',
          whiteSpace:'nowrap'
        }}>
          {loading ? '⏳ Оновлення...' : '🔄 Оновити дані'}
        </button>
        <button 
          onClick={()=>setShowColumnSettings(true)}
          style={{
            background:'#1976d2',
            color:'#fff',
            border:'none',
            padding:'8px 16px',
            borderRadius:'4px',
            cursor:'pointer',
            fontSize:'1rem',
            whiteSpace:'nowrap'
          }}
        >
          ⚙️ Налаштувати колонки
        </button>
      </div>
      <ModalTaskForm 
        key={`modal-${editTask?.id || 'new'}`}
        open={modalOpen} 
        onClose={()=>{
          console.log('[DEBUG] AccountantApprovalArea - модальне вікно закривається...');
          setModalOpen(false);
          setEditTask(null);
          // Примітка: fullTabReload() вже викликається в handleSave, тому тут не потрібен
        }} 
        onSave={handleSave} 
        initialData={editTask || {}} 
        mode="buhgalteria" 
        user={user} 
        readOnly={editTask?._readOnly || false} 
      />
      
      {/* Чекбокс "Відобразити всі заявки" тільки для вкладки "Заявка на підтвердженні" */}
      {activeTab === 'pending' && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'flex-start', 
          alignItems: 'center', 
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: '#f8f9fa',
          borderRadius: '6px',
          border: '1px solid #dee2e6'
        }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            color: '#495057'
          }}>
            <input
              type="checkbox"
              checked={showAllTasks}
              onChange={async (e) => {
                console.log('[DEBUG] AccountantApprovalArea - showAllTasks checkbox changed:', e.target.checked);
                setShowAllTasks(e.target.checked);
                
                // Якщо чекбокс активується, завантажуємо додаткові завдання
                if (e.target.checked) {
                  await loadAdditionalTasks();
                }
              }}
              style={{ 
                margin: 0,
                transform: 'scale(1.2)',
                cursor: 'pointer'
              }}
            />
            <span>Відобразити всі заявки (включно зі статусом "Заявка" та "В роботі")</span>
          </label>
        </div>
      )}
      
      <TaskTable
        key={`main-${activeTab}-${tableKey}`}
        tasks={tableData}
        allTasks={allTasks}
        onApprove={handleApprove}
        onEdit={handleEdit}
        onDelete={handleDelete}
        role="accountant"
        filters={filters}
        onFilterChange={handleFilter}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        approveField="approvedByAccountant"
        commentField="accountantComment"
        user={user}
        isArchive={activeTab === 'archive'}
        showColumnSettings={showColumnSettings}
        onShowColumnSettings={setShowColumnSettings}
        onHistoryClick={openClientReport}
        accessRules={accessRules}
        currentArea={currentArea}
        columnsSettings={{
          open: false,
          selected: columnSettings?.visible || allTaskFields.map(f => f.name)
        }}
        onSaveColumns={handleSaveColumns}
      />
      
      {/* Модальне вікно бухгалтерських звітів */}
      <AccountantReportsModal 
        isOpen={reportsModalOpen}
        onClose={() => setReportsModalOpen(false)}
        user={user}
        tasks={tasks}
        users={users}
      />
    </div>
  );
});

export default AccountantApprovalArea;
