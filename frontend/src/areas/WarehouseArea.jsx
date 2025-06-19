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

export default function WarehouseArea() {
  console.log('WarehouseArea рендериться');
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [report, setReport] = useState(null);

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
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, approvedByWarehouse: approved, warehouseComment: comment !== undefined ? comment : t.warehouseComment } : t);
    console.log('Warehouse handleApprove', {id, approved, comment, updatedTasks});
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
    setTasks(tasks.map(t => t.id === task.id ? {
      ...task
    } : t));
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
    filter: [
      'requestDate', 'requestDesc', 'serviceRegion', 'client', 'address', 'equipmentSerial', 'equipment', 'work', 'date', 'serviceTotal'
    ].includes(f.name)
  }));

  // --- Формування звіту ---
  const handleFormReport = () => {
    // Фільтруємо виконані заявки за діапазоном дат
    const filteredTasks = tasks.filter(t => {
      if (t.status !== 'Виконано') return false;
      if (dateFrom && (!t.date || t.date < dateFrom)) return false;
      if (dateTo && (!t.date || t.date > dateTo)) return false;
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
      if (!m.type) return;
      // Ключ для групування — label+type, щоб не змішувати різні категорії з однаковим типом
      const key = (m.label || '') + '||' + m.type;
      if (!summary[key]) summary[key] = { qty: 0, sum: 0, price: m.price, label: m.label, type: m.type };
      summary[key].qty += Number(m.qty)||0;
      summary[key].sum += (Number(m.qty)||0) * (Number(m.price)||0) || Number(m.price)||0;
    });
    // --- Формуємо HTML для нового вікна ---
    const html = `
      <html>
      <head>
        <title>Звіт по складу</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; color: #222; padding: 24px; }
          h2 { color: #1976d2; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
          th, td { border: 1px solid #bbb; padding: 6px 10px; text-align: center; }
          th { background: #ffe600; color: #222; }
          .summary th { background: #b6ffb6; }
        </style>
      </head>
      <body>
        <h2>Звіт по складу за період ${dateFrom || '...'} — ${dateTo || '...'}</h2>
        <h3>Деталізація виконаних робіт</h3>
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Компанія</th>
              <th>Найменування робіт</th>
              <th>Сервісні інженери</th>
              <th>Матеріали (тип, к-сть, ціна)</th>
            </tr>
          </thead>
          <tbody>
            ${details.map(d => `
              <tr>
                <td>${d.date || ''}</td>
                <td>${d.company || ''}</td>
                <td>${d.work || ''}</td>
                <td>${d.engineers || ''}</td>
                <td>
                  ${d.materials.map(m => `${m.label ? m.label + ': ' : ''}${m.type} ${m.qty!==''?`(${m.qty})`:''} ${m.price?`x ${m.price}`:''}`).join('<br/>')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <h3>Підсумок по матеріалах за період</h3>
        <table class="summary">
          <thead>
            <tr>
              <th>Матеріал</th>
              <th>Загальна к-сть</th>
              <th>Сума</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(summary).map(s => `
              <tr>
                <td>${s.label ? (s.label === 'Інші матеріали' ? `Інші матеріали: ${s.type}` : `${s.label}: ${s.type}`) : s.type}</td>
                <td>${s.qty}</td>
                <td>${s.sum.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  return (
    <div style={{padding:32}}>
      <h2>Завдання для затвердження (Склад/Оператор)</h2>
      {/* --- Форма для звіту --- */}
      <div style={{display:'flex',alignItems:'center',gap:24,background:'#fff',border:'3px solid #1976d2',borderRadius:16,padding:'24px 40px',margin:'24px 0 32px 0',boxShadow:'0 4px 24px #0002',flexWrap:'wrap',justifyContent:'flex-start'}}>
        <span style={{fontSize:32,fontWeight:900,color:'#1976d2',letterSpacing:2,marginRight:24}}>ЗВІТ ПО МАТЕРІАЛАМ</span>
        <label style={{color:'#22334a',fontWeight:600,fontSize:18}}>З:
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{marginLeft:8,padding:8,fontSize:18,borderRadius:8,border:'1px solid #bbb'}} />
        </label>
        <label style={{color:'#22334a',fontWeight:600,fontSize:18}}>По:
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{marginLeft:8,padding:8,fontSize:18,borderRadius:8,border:'1px solid #bbb'}} />
        </label>
        <button onClick={handleFormReport} style={{background:'#00bfff',color:'#fff',border:'none',borderRadius:10,padding:'16px 40px',fontWeight:700,fontSize:22,cursor:'pointer',boxShadow:'0 2px 8px #0001',marginLeft:24}}>Сформувати звіт</button>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
        <button onClick={()=>setTab('pending')} style={{width:220,padding:'10px 0',background:tab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='pending'?700:400,cursor:'pointer'}}>Заявка на підтвердженні</button>
        <button onClick={()=>setTab('archive')} style={{width:220,padding:'10px 0',background:tab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
      </div>
      {/* --- Відображення звіту (залишаю для тесту, але можна прибрати) --- */}
      {/* {report && ...} */}
      <ModalTaskForm open={modalOpen} onClose={()=>{setModalOpen(false);setEditTask(null);}} onSave={handleSave} initialData={editTask || initialTask} mode="warehouse" />
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
      />
    </div>
  );
} 