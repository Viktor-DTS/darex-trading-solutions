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

export default function RegionalManagerArea() {
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('tasks');
    return saved ? JSON.parse(saved) : [];
  });
  const [filters, setFilters] = useState({
    requestDesc: '', serviceRegion: '', address: '', equipmentSerial: '', equipment: '', work: '', date: ''
  });
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
  const filtered = tasks.filter(t =>
    (!filters.requestDesc || t.requestDesc.toLowerCase().includes(filters.requestDesc.toLowerCase())) &&
    (!filters.serviceRegion || t.serviceRegion.toLowerCase().includes(filters.serviceRegion.toLowerCase())) &&
    (!filters.address || t.address.toLowerCase().includes(filters.address.toLowerCase())) &&
    (!filters.equipmentSerial || t.equipmentSerial.toLowerCase().includes(filters.equipmentSerial.toLowerCase())) &&
    (!filters.equipment || t.equipment.toLowerCase().includes(filters.equipment.toLowerCase())) &&
    (!filters.work || t.work.toLowerCase().includes(filters.work.toLowerCase())) &&
    (!filters.date || t.date.includes(filters.date))
  );
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
    filter: [
      'requestDate', 'requestDesc', 'serviceRegion', 'client', 'address', 'equipmentSerial', 'equipment', 'work', 'date', 'serviceTotal'
    ].includes(f.name)
  }));

  return (
    <div style={{padding:32}}>
      <h2>Завдання для затвердження (Регіональний менеджер)</h2>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button onClick={()=>setTab('pending')} style={{width:220,padding:'10px 0',background:tab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='pending'?700:400,cursor:'pointer'}}>Заявка на підтвердженні</button>
        <button onClick={()=>setTab('archive')} style={{width:220,padding:'10px 0',background:tab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
      </div>
      <ModalTaskForm open={modalOpen} onClose={()=>{setModalOpen(false);setEditTask(null);}} onSave={handleSave} initialData={editTask || initialTask} mode="regionalManager" />
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
      />
    </div>
  );
} 