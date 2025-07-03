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

export default function AccountantArea({ user }) {
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
      approvedByAccountant: approved,
      accountantComment: comment !== undefined ? comment : t.accountantComment
    });
    setTasks(tasks => tasks.map(tt => tt.id === id ? updated : tt));
    setLoading(false);
  };
  const handleFilter = e => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
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
    t.approvedByAccountant === null ||
    t.approvedByAccountant === undefined ||
    t.approvedByAccountant === 'На розгляді' ||
    t.approvedByAccountant === false ||
    t.approvedByAccountant === 'Відмова'
  ));
  function isApproved(v) {
    return v === true || v === 'Підтверджено';
  }
  const archive = filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByAccountant));
  const tableData = tab === 'pending' ? pending : archive;
  const columns = allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: true
  }));

  // --- Формування звіту ---
  const handleFormReport = () => {
    // Фільтруємо виконані заявки за діапазоном дат і регіоном
    const filteredTasks = tasks.filter(t => {
      if (t.status !== 'Виконано') return false;
      if (filters.dateFrom && (!t.date || t.date < filters.dateFrom)) return false;
      if (filters.dateTo && (!t.date || t.date > filters.dateTo)) return false;
      if (filters.region && filters.region !== 'Україна' && t.serviceRegion !== filters.region) return false;
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
        region: t.serviceRegion,
        company: t.company,
        work: t.work,
        engineers: [t.engineer1, t.engineer2].filter(Boolean).join(', '),
        workPrice: Number(t.workPrice) || 0,
        serviceTotal: Number(t.serviceTotal) || 0,
        materials,
      };
    });
    // --- Підсумки по матеріалах для кожної компанії (і регіону, якщо Україна) ---
    let regionGroups = {};
    if (filters.region === 'Україна' || !filters.region) {
      details.forEach(d => {
        const region = d.region || 'Невідомо';
        if (!regionGroups[region]) regionGroups[region] = [];
        regionGroups[region].push(d);
      });
    } else {
      regionGroups[filters.region] = details;
    }
    // Для кожного регіону: підсумки по компаніях
    const regionSummaries = {};
    Object.entries(regionGroups).forEach(([region, dets]) => {
      const companyGroups = {};
      dets.forEach(d => {
        const company = d.company || 'Невідомо';
        if (!companyGroups[company]) companyGroups[company] = [];
        companyGroups[company].push(...d.materials);
      });
      // Для кожної компанії: підсумок по матеріалах
      const companySummaries = {};
      Object.entries(companyGroups).forEach(([company, mats]) => {
        const summary = {};
        mats.forEach(m => {
          const key = `${m.label} - ${m.type}`;
          if (!summary[key]) summary[key] = { label: m.label, type: m.type, totalQty: 0, totalSum: 0 };
          summary[key].totalQty += Number(m.qty) || 0;
          summary[key].totalSum += (Number(m.qty) || 0) * (Number(m.price) || 0);
        });
        companySummaries[company] = summary;
      });
      regionSummaries[region] = companySummaries;
    });
    // --- Формуємо HTML для нового вікна ---
    let html = `
      <html>
      <head>
        <title>Звіт по матеріалах (Бухгалтерія)</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; color: #222; padding: 24px; }
          h2 { color: #1976d2; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
          th, td { border: 1px solid #bbb; padding: 6px 10px; text-align: center; }
          th { background: #ffe600; color: #222; }
        </style>
      </head>
      <body>
        <h2>Звіт по матеріалах (Бухгалтерія)</h2>
        <h3>Підсумок по матеріалах:</h3>
        ${Object.entries(regionSummaries).map(([region, companySummaries]) => `
          <div style="margin-bottom:24px;">
            <div style="font-weight:600;margin-bottom:8px;color:#1976d2;">Регіон: ${region}</div>
            ${Object.entries(companySummaries).map(([company, summary]) => `
              <div style="font-weight:600;margin-bottom:8px;">${company}</div>
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
            `).join('')}
          </div>
        `).join('')}
        <h3>Деталізація по заявках:</h3>
        ${details.map(detail => `
          <div style="margin-bottom:24px;">
            <div style="font-weight:600;margin-bottom:8px;color:#1976d2;">
              ${detail.date} - ${detail.region} - ${detail.company} - ${detail.work}
            </div>
            <div style="margin-bottom:8px;color:#666;">Інженери: ${detail.engineers}</div>
            <div style="margin-bottom:8px;color:#666;">Вартість робіт: ${detail.workPrice} грн.</div>
            <div style="margin-bottom:8px;color:#666;">Загальна сума послуги: ${detail.serviceTotal} грн.</div>
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

  return (
    <div style={{padding:32}}>
      <h2>Завдання для затвердження (Бухгалтер)</h2>
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
        <label style={{display:'flex',alignItems:'center',gap:4}}>
          Регіон:
          <input type="text" name="region" value={filters.region || ''} onChange={handleFilter} placeholder="Україна або регіон" />
        </label>
        <button onClick={handleFormReport} style={{background:'#00bfff',color:'#fff',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:600,cursor:'pointer'}}>Сформувати звіт</button>
      </div>
      <ModalTaskForm open={modalOpen} onClose={()=>{setModalOpen(false);setEditTask(null);}} onSave={handleSave} initialData={editTask || initialTask} mode="accountant" user={user} />
      <TaskTable
        tasks={tableData}
        allTasks={tasks}
        onApprove={handleApprove}
        onEdit={handleEdit}
        role="accountant"
        filters={filters}
        onFilterChange={handleFilter}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        approveField="approvedByAccountant"
        commentField="accountantComment"
        user={user}
      />
    </div>
  );
} 