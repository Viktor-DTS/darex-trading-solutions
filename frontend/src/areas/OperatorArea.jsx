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

  const handleSave = async (task) => {
    setLoading(true);
    if (editTask && editTask.id) {
      const updated = await tasksAPI.update(editTask.id, task);
      setTasks(tasks => tasks.map(t => t.id === editTask.id ? updated : t));
    } else {
      const added = await tasksAPI.add(task);
      setTasks(tasks => [...tasks, added]);
    }
    setEditTask(null);
    setLoading(false);
    
    // Оновлюємо дані з бази після збереження
    try {
      const freshTasks = await tasksAPI.getAll();
      setTasks(freshTasks);
      console.log('[DEBUG] OperatorArea handleSave - дані оновлено з бази, завдань:', freshTasks.length);
      
      // Оновлюємо editTask, якщо він ще встановлений
      if (editTask && editTask.id) {
        const updatedTask = freshTasks.find(t => t.id === editTask.id);
        if (updatedTask) {
          setEditTask(updatedTask);
        }
      }
    } catch (error) {
      console.error('[ERROR] OperatorArea handleSave - помилка оновлення даних з бази:', error);
    }
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
      />
    </div>
  );
} 