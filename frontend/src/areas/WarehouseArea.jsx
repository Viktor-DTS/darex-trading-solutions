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

export default function WarehouseArea({ user }) {
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
  const [report, setReport] = useState(null);
  const region = user?.region || '';

  useEffect(() => {
    setLoading(true);
    tasksAPI.getAll().then(setTasks).finally(() => setLoading(false));
  }, []);

  const handleApprove = async (id, approved, comment) => {
    setLoading(true);
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    const updated = await tasksAPI.update(id, {
      ...t,
      approvedByWarehouse: approved,
      warehouseComment: comment !== undefined ? comment : t.warehouseComment
    });
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    setLoading(false);
  };
  const handleFilter = e => {
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    setFilters(newFilters);
  };
  const handleEdit = t => {
    setEditTask(t);
    setModalOpen(true);
  };
  const handleSave = async (task) => {
    setLoading(true);
    if (editTask && editTask.id) {
      const updated = await tasksAPI.update(editTask.id, task);
      setTasks(tasks => tasks.map(t => t.id === updated.id ? updated : t));
    } else {
      const added = await tasksAPI.add(task);
      setTasks(tasks => [...tasks, added]);
    }
    setEditTask(null);
    setLoading(false);
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
  const pending = filtered.filter(t => t.status === 'Виконано' && (
    t.approvedByWarehouse === null ||
    t.approvedByWarehouse === undefined ||
    t.approvedByWarehouse === 'На розгляді' ||
    t.approvedByWarehouse === false ||
    t.approvedByWarehouse === 'Відмова' ||
    t.approvedByAccountant === null ||
    t.approvedByAccountant === undefined ||
    t.approvedByAccountant === 'На розгляді' ||
    t.approvedByAccountant === false ||
    t.approvedByAccountant === 'Відмова' ||
    t.approvedByRegionalManager === null ||
    t.approvedByRegionalManager === undefined ||
    t.approvedByRegionalManager === 'На розгляді' ||
    t.approvedByRegionalManager === false ||
    t.approvedByRegionalManager === 'Відмова'
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
      // Масив матеріалів для цієї заявки
      const materials = [];
      if (t.oilType && t.oilUsed) materials.push({ label: 'Олива', type: t.oilType, qty: Number(t.oilUsed), price: Number(t.oilPrice)||0 });
      if (t.filterName && t.filterCount) materials.push({ label: 'Фільтр масл', type: t.filterName, qty: Number(t.filterCount), price: Number(t.filterPrice)||0 });
      if (t.fuelFilterName && t.fuelFilterCount) materials.push({ label: 'Фільтр палив', type: t.fuelFilterName, qty: Number(t.fuelFilterCount), price: Number(t.fuelFilterPrice)||0 });
      if (t.airFilterName && t.airFilterCount) materials.push({ label: 'Фільтр повітряний', type: t.airFilterName, qty: Number(t.airFilterCount), price: Number(t.airFilterPrice)||0 });
      if (t.antifreezeType && t.antifreezeL) materials.push({ label: 'Антифриз', type: t.antifreezeType, qty: Number(t.antifreezeL), price: Number(t.antifreezePrice)||0 });
      if (t.otherMaterials) materials.push({ label: 'Інші матеріали', type: t.otherMaterials, qty: '', price: Number(t.otherSum)||0 });
      return {
        date: t.date,
        company: t.company,
        work: t.work,
        engineers: [t.engineer1, t.engineer2].filter(Boolean).join(', '),
        materials,
      };
    });
    // Підсумок по матеріалах
    const allMaterials = details.flatMap(d => d.materials);
    const summary = {};
    allMaterials.forEach(m => {
      const key = `${m.label} - ${m.type}`;
      if (!summary[key]) {
        summary[key] = { label: m.label, type: m.type, totalQty: 0, totalPrice: 0 };
      }
      summary[key].totalQty += m.qty || 0;
      summary[key].totalPrice += m.price || 0;
    });
    setReport({ details, summary });
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
      <ModalTaskForm open={modalOpen} onClose={()=>{setModalOpen(false);setEditTask(null);}} onSave={handleSave} initialData={editTask || initialTask} mode="warehouse" user={user} />
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
      />
      {report && (
        <div style={{marginTop:32,background:'#f8fafc',border:'2px solid #1976d2',borderRadius:12,padding:'18px 18px 8px 18px',boxShadow:'0 2px 12px #0001'}}>
          <div style={{fontWeight:700,fontSize:20,marginBottom:16,color:'#1976d2',letterSpacing:1}}>Звіт по матеріалах</div>
          <div style={{marginBottom:24}}>
            <h3 style={{color:'#222',marginBottom:12}}>Підсумок по матеріалах:</h3>
            <table style={{width:'100%',color:'#222',background:'#fff',borderRadius:8,overflow:'hidden',fontSize:'1rem'}}>
              <thead>
                <tr style={{background:'#ffe600',color:'#222',fontWeight:700}}>
                  <th>Матеріал</th>
                  <th>Тип</th>
                  <th>Загальна кількість</th>
                  <th>Загальна вартість</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(report.summary).map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.label}</td>
                    <td>{item.type}</td>
                    <td>{item.totalQty}</td>
                    <td style={{fontWeight:600,background:'#b6ffb6'}}>{item.totalPrice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 style={{color:'#222',marginBottom:12}}>Деталізація по заявках:</h3>
            {report.details.map((detail, idx) => (
              <div key={idx} style={{background:'#fff',borderRadius:8,padding:16,marginBottom:16,boxShadow:'0 1px 4px #0001'}}>
                <div style={{fontWeight:600,marginBottom:8,color:'#1976d2'}}>
                  {detail.date} - {detail.company} - {detail.work}
                </div>
                <div style={{marginBottom:8,color:'#666'}}>Інженери: {detail.engineers}</div>
                {detail.materials.length > 0 && (
                  <table style={{width:'100%',fontSize:'0.9rem',color:'#222'}}>
                    <thead>
                      <tr style={{background:'#f0f0f0'}}>
                        <th>Матеріал</th>
                        <th>Тип</th>
                        <th>Кількість</th>
                        <th>Вартість</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.materials.map((material, matIdx) => (
                        <tr key={matIdx}>
                          <td>{material.label}</td>
                          <td>{material.type}</td>
                          <td>{material.qty}</td>
                          <td>{material.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 