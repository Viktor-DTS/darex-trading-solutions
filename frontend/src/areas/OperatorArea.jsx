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

export default function OperatorArea() {
  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem('tasks');
    return saved ? JSON.parse(saved) : [];
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    requestDate: '', requestDesc: '', serviceRegion: '', address: '', equipmentSerial: '', equipment: '', work: '', date: ''
  });
  const [editTask, setEditTask] = useState(null);
  const [tab, setTab] = useState(() => {
    const savedTab = localStorage.getItem('operatorTab');
    return savedTab || 'pending';
  });

  useEffect(() => {
    localStorage.setItem('operatorTab', tab);
  }, [tab]);

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

  const handleSave = (task) => {
    if (editTask) {
      setTasks(tasks.map(t => t.id === editTask.id ? { ...task, id: editTask.id } : t));
    } else {
      setTasks([...tasks, { ...initialTask, ...task, id: Date.now() }]);
    }
    setEditTask(null);
  };
  const handleFilter = e => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };
  const handleEdit = t => {
    setEditTask(t);
    setModalOpen(true);
  };
  const handleDelete = id => {
    setTasks(tasks.filter(t => t.id !== id));
  };
  const columns = allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: [
      'requestDate', 'requestDesc', 'serviceRegion', 'client', 'address', 'equipmentSerial', 'equipment', 'work', 'date', 'serviceTotal'
    ].includes(f.name)
  }));
  const statusOrder = {
    'Новий': 1,
    'В роботі': 2,
    'Виконано': 3,
    'Заблоковано': 4,
  };
  const filtered = tasks.filter(t =>
    (!filters.requestDate || t.requestDate.includes(filters.requestDate)) &&
    (!filters.requestDesc || t.requestDesc.toLowerCase().includes(filters.requestDesc.toLowerCase())) &&
    (!filters.serviceRegion || t.serviceRegion.toLowerCase().includes(filters.serviceRegion.toLowerCase())) &&
    (!filters.address || t.address.toLowerCase().includes(filters.address.toLowerCase())) &&
    (!filters.equipmentSerial || t.equipmentSerial.toLowerCase().includes(filters.equipmentSerial.toLowerCase())) &&
    (!filters.equipment || t.equipment.toLowerCase().includes(filters.equipment.toLowerCase())) &&
    (!filters.work || t.work.toLowerCase().includes(filters.work.toLowerCase())) &&
    (!filters.date || t.date.includes(filters.date))
  );
  const sortedTasks = [...filtered].sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));

  const handleApprove = (id, approved, comment) => {
    const updatedTasks = tasks.map(t => 
      t.id === id ? { 
        ...t, 
        approvedByOperator: approved, 
        operatorComment: comment !== undefined ? comment : t.operatorComment,
        status: approved === true ? 'Виконано' : t.status
      } : t
    );
    setTasks(updatedTasks);
    localStorage.setItem('tasks', JSON.stringify(updatedTasks));
  };

  const pending = filtered.filter(t => 
    t.status !== 'Виконано' || 
    !t.approvedByOperator || 
    t.approvedByOperator === 'На розгляді' || 
    t.approvedByOperator === false || 
    t.approvedByOperator === 'Відмова'
  );

  function isApproved(v) {
    return v === true || v === 'Підтверджено';
  }

  const archive = filtered.filter(t => 
    t.status === 'Виконано' && 
    isApproved(t.approvedByOperator)
  );

  const tableData = tab === 'pending' ? pending : archive;

  return (
    <div style={{padding:32}}>
      <h2>Заявки оператора</h2>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button onClick={()=>setTab('pending')} style={{width:220,padding:'10px 0',background:tab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='pending'?700:400,cursor:'pointer'}}>Завдання на підтвердженні</button>
        <button onClick={()=>setTab('archive')} style={{width:220,padding:'10px 0',background:tab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
      </div>
      <button onClick={()=>{setEditTask(null);setModalOpen(true);}} style={{marginBottom:16}}>Додати заявку</button>
      <ModalTaskForm open={modalOpen} onClose={()=>{setModalOpen(false);setEditTask(null);}} onSave={handleSave} initialData={editTask||initialTask} mode="operator" />
      <TaskTable
        tasks={tableData}
        allTasks={tasks}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onApprove={handleApprove}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        filters={filters}
        onFilterChange={handleFilter}
        role="operator"
        approveField="approvedByOperator"
        commentField="operatorComment"
      />
    </div>
  );
} 