import React, { useState, useEffect } from 'react';
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

export default function OperatorArea({ user }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
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
  const [editTask, setEditTask] = useState(null);
  const [tab, setTab] = useState('inProgress');
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

  useEffect(() => {
    setLoading(true);
    tasksAPI.getAll().then(setTasks).finally(() => setLoading(false));
  }, []);

  // Автоматичне оновлення даних при фокусі на вкладку браузера
  useEffect(() => {
    const handleFocus = () => {
      console.log('[DEBUG] OperatorArea - оновлення даних при фокусі на вкладку');
      tasksAPI.getAll().then(freshTasks => {
        setTasks(freshTasks);
        console.log('[DEBUG] OperatorArea - дані оновлено при фокусі, завдань:', freshTasks.length);
      }).catch(error => {
        console.error('[ERROR] OperatorArea - помилка оновлення при фокусі:', error);
      });
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

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
      console.log('[DEBUG] OperatorArea handleSave - дані оновлено з бази, завдань:', freshTasks.length);
    } catch (error) {
      console.error('[ERROR] OperatorArea handleSave - помилка оновлення даних з бази:', error);
    }
    
    // Закриваємо модальне вікно
    setEditTask(null);
    setLoading(false);
  };
  const handleFilter = e => {
    console.log('[DEBUG] OperatorArea handleFilter called:', e.target.name, e.target.value);
    console.log('[DEBUG] Current filters before update:', filters);
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    console.log('[DEBUG] New filters after update:', newFilters);
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
  const handleDelete = async id => {
    setLoading(true);
    await tasksAPI.remove(id);
    setTasks(tasks => tasks.filter(t => t.id !== id));
    setLoading(false);
  };
  const columns = allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: true
  }));
  const statusOrder = {
    'Заявка': 1,
    'В роботі': 2,
    'Виконано': 3,
    'Заблоковано': 4,
  };
  const filtered = tasks.filter(t => {
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
    return true;
  });

  const handleApprove = async (id, approved, comment) => {
    setLoading(true);
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    const updated = await tasksAPI.update(id, {
        ...t, 
        approvedByOperator: approved, 
        operatorComment: comment !== undefined ? comment : t.operatorComment,
        status: approved === true ? 'Виконано' : t.status
    });
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    setLoading(false);
  };

  // Заявки на виконанні (статус "Заявка" та "В роботі")
  const inProgress = filtered.filter(t => 
    t.status === 'Заявка' || t.status === 'В роботі'
  ).sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));

  // Архів виконаних заявок (всі інші статуси)
  const archive = filtered.filter(t => 
    t.status !== 'Заявка' && t.status !== 'В роботі'
  );

  const tableData = tab === 'inProgress' ? inProgress : archive;

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
      <h2>Заявки оператора</h2>
      {loading && <div>Завантаження...</div>}
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button onClick={()=>{console.log('Set tab inProgress'); setTab('inProgress')}} style={{width:220,padding:'10px 0',background:tab==='inProgress'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='inProgress'?700:400,cursor:'pointer'}}>Заявки на виконанні</button>
        <button onClick={()=>{console.log('Set tab archive'); setTab('archive')}} style={{width:220,padding:'10px 0',background:tab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
      </div>
      <button onClick={()=>{setEditTask(null);setModalOpen(true);}} style={{marginBottom:16}}>Додати заявку</button>
      <ModalTaskForm open={modalOpen} onClose={()=>{setModalOpen(false);setEditTask(null);}} onSave={handleSave} initialData={editTask || {}} mode="operator" user={user} readOnly={editTask?._readOnly || false} />
      <TaskTable
        tasks={tableData}
        allTasks={tasks}
        onEdit={handleEdit}
        onStatusChange={()=>{}}
        onDelete={handleDelete}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        filters={filters}
        onFilterChange={handleFilter}
        role="operator"
        dateRange={{}}
        setDateRange={()=>{}}
        user={user}
        isArchive={tab === 'archive'}
        onHistoryClick={openClientReport}
      />
    </div>
  );
} 