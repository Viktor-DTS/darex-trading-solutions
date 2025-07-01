import React, { useState, useEffect } from 'react';
import ModalTaskForm, { fields as allTaskFields } from '../ModalTaskForm';
import TaskTable from '../components/TaskTable';

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
  engineer1: '',
  engineer2: '',
  client: '',
  invoice: '',
  paymentType: '',
  serviceTotal: '',
  approvedByWarehouse: null,
  warehouseComment: '',
  approvedByAccountant: null,
  accountantComment: '',
  approvedByRegionalManager: null,
  regionalManagerComment: '',
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

export default function RegionalManagerArea({ user }) {
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('tasks');
    return saved ? JSON.parse(saved) : [];
  });
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

  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);
  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem('tasks');
      setTasks(saved ? JSON.parse(saved) : []);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const handleApprove = (id, approved, comment) => {
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, approvedByRegionalManager: approved, regionalManagerComment: comment !== undefined ? comment : t.regionalManagerComment } : t);
    setTasks(updatedTasks);
    localStorage.setItem('tasks', JSON.stringify(updatedTasks));
  };
  const handleFilter = e => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };
  const handleEdit = t => {
    setEditTask(t);
    setModalOpen(true);
  };
  const handleSave = (task) => {
    console.log('[LOG] RegionalManager handleSave called', task);
    const updatedTasks = tasks.map(t => t.id === task.id ? { ...task } : t);
    console.log('[LOG] RegionalManager updatedTasks after save:', updatedTasks);
    setTasks(updatedTasks);
    localStorage.setItem('tasks', JSON.stringify(updatedTasks));
    setTimeout(() => {
      const saved = localStorage.getItem('tasks');
      console.log('[LOG] RegionalManager localStorage after save:', saved);
    }, 100);
    setEditTask(null);
  };
  const region = user?.region || '';

  // Діагностика
  console.log('[DEBUG] user.region:', region);
  console.log('[DEBUG] tasks.map(serviceRegion):', tasks.map(t => t.serviceRegion));

  const filtered = tasks.filter(t => {
    if (
      region !== '' &&
      region !== 'Україна' &&
      (typeof t.serviceRegion !== 'string' ||
        t.serviceRegion.trim().toLowerCase() !== region.trim().toLowerCase())
    ) return false;
    
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
        'approvalDate', 'bonusApprovalDate'
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

  // Логую відфільтровані заявки
  console.log('[DEBUG] filtered:', filtered.map(t => ({id: t.id, serviceRegion: t.serviceRegion})));

  const pending = filtered.filter(t => t.status === 'Виконано' && (
    t.approvedByRegionalManager === null ||
    t.approvedByRegionalManager === undefined ||
    t.approvedByRegionalManager === 'На розгляді' ||
    t.approvedByRegionalManager === false ||
    t.approvedByRegionalManager === 'Відмова' ||
    t.approvedByWarehouse === null ||
    t.approvedByWarehouse === undefined ||
    t.approvedByWarehouse === 'На розгляді' ||
    t.approvedByWarehouse === false ||
    t.approvedByWarehouse === 'Відмова' ||
    t.approvedByAccountant === null ||
    t.approvedByAccountant === undefined ||
    t.approvedByAccountant === 'На розгляді' ||
    t.approvedByAccountant === false ||
    t.approvedByAccountant === 'Відмова'
  ));
  function isApproved(v) {
    return v === true || v === 'Підтверджено';
  }
  const archive = filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByWarehouse) && isApproved(t.approvedByAccountant) && isApproved(t.approvedByRegionalManager));
  const tableData = tab === 'pending' ? pending : archive;
  const columns = allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: true
  }));
  console.log('[LOG] RegionalManagerArea columns:', columns);

  return (
    <div style={{padding:32}}>
      <h2>Завдання для затвердження (Регіональний менеджер)</h2>
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
      </div>
      <ModalTaskForm open={modalOpen} onClose={()=>{setModalOpen(false);setEditTask(null);}} onSave={handleSave} initialData={editTask || initialTask} mode="regionalManager" user={user} />
      <TaskTable
        tasks={tableData}
        allTasks={tasks}
        onApprove={handleApprove}
        onEdit={handleEdit}
        role="regionalManager"
        filters={filters}
        onFilterChange={handleFilter}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        approveField="approvedByRegionalManager"
        commentField="regionalManagerComment"
        dateRange={{ from: filters.dateFrom, to: filters.dateTo }}
        setDateRange={r => setFilters(f => ({ ...f, dateFrom: r.from, dateTo: r.to }))}
        user={user}
      />
    </div>
  );
} 