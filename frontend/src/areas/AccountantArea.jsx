import React, { useState, useEffect } from 'react';
import ModalTaskForm, { fields as allTaskFields } from '../ModalTaskForm';
import TaskTable from '../components/TaskTable';
import { tasksAPI } from '../utils/tasksAPI';
import * as XLSX from 'xlsx-js-style';

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
  const [approvalFilter, setApprovalFilter] = useState('all'); // 'all', 'approved', 'not_approved'
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

  useEffect(() => {
    setLoading(true);
    tasksAPI.getAll().then(setTasks).finally(() => setLoading(false));
  }, []);

  const handleApprove = async (id, approved, comment) => {
    setLoading(true);
    const t = tasks.find(t => t.id === id);
    if (!t) return;
    let next = {
      ...t,
      approvedByAccountant: approved,
      accountantComment: comment !== undefined ? comment : t.accountantComment
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
    setLoading(false);
  };
  const handleFilter = e => {
    console.log('[DEBUG] AccountantArea handleFilter called:', e.target.name, e.target.value);
    console.log('[DEBUG] Current filters before update:', filters);
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    console.log('[DEBUG] New filters after update:', newFilters);
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
    // Фільтруємо виконані заявки за діапазоном дат, регіоном та статусом затвердження
    const filteredTasks = tasks.filter(t => {
      if (t.status !== 'Виконано') return false;
      if (filters.dateFrom && (!t.date || t.date < filters.dateFrom)) return false;
      if (filters.dateTo && (!t.date || t.date > filters.dateTo)) return false;
      if (filters.region && filters.region !== 'Україна' && t.serviceRegion !== filters.region) return false;
      
      // Фільтр по статусу затвердження
      if (approvalFilter === 'approved') {
        if (!isApproved(t.approvedByAccountant)) return false;
      } else if (approvalFilter === 'not_approved') {
        if (isApproved(t.approvedByAccountant)) return false;
      }
      // Якщо approvalFilter === 'all', то показуємо всі
      
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
        client: t.client || '',
        address: t.address || '',
        engineers: [t.engineer1, t.engineer2].filter(Boolean).join(', '),
        workPrice: Number(t.workPrice) || 0,
        serviceTotal: Number(t.serviceTotal) || 0,
        perDiem: Number(t.perDiem) || 0,
        living: Number(t.living) || 0,
        otherExp: Number(t.otherExp) || 0,
        otherSum: Number(t.otherSum) || 0,
        otherMaterials: t.otherMaterials || '',
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
        <div style="margin-bottom: 16px; padding: 12px; background: #f0f0f0; border-radius: 4px;">
          <strong>Фільтри:</strong><br/>
          ${filters.dateFrom || filters.dateTo ? `Період: ${filters.dateFrom || 'з початку'} - ${filters.dateTo || 'до кінця'}<br/>` : ''}
          ${filters.region ? `Регіон: ${filters.region}<br/>` : ''}
          Статус затвердження: ${
            approvalFilter === 'all' ? 'Всі звіти' : 
            approvalFilter === 'approved' ? 'Тільки затверджені' : 
            'Тільки незатверджені'
          }
        </div>
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
            ${detail.client ? `<div style="margin-bottom:8px;color:#666;">Замовник: ${detail.client}</div>` : ''}
            ${detail.address ? `<div style="margin-bottom:8px;color:#666;">Адреса: ${detail.address}</div>` : ''}
            <div style="margin-bottom:8px;color:#666;">Інженери: ${detail.engineers}</div>
            <div style="margin-bottom:8px;color:#666;">Вартість робіт: ${detail.workPrice} грн.</div>
            <div style="margin-bottom:8px;color:#666;">Загальна сума послуги: ${detail.serviceTotal} грн.</div>
            ${detail.perDiem > 0 ? `<div style="margin-bottom:8px;color:#666;">Добові: ${detail.perDiem} грн.</div>` : ''}
            ${detail.living > 0 ? `<div style="margin-bottom:8px;color:#666;">Проживання: ${detail.living} грн.</div>` : ''}
            ${detail.otherExp > 0 ? `<div style="margin-bottom:8px;color:#666;">Інші витрати: ${detail.otherExp} грн.</div>` : ''}
            ${detail.otherSum > 0 ? `<div style="margin-bottom:8px;color:#666;">Загальна ціна інших матеріалів: ${detail.otherSum} грн.</div>` : ''}
            ${detail.otherMaterials ? `<div style="margin-bottom:8px;color:#666;">Опис інших матеріалів: ${detail.otherMaterials}</div>` : ''}
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

  // --- Експорт у Excel з урахуванням фільтрів звіту ---
  const exportFilteredToExcel = () => {
    // Використовуємо ту ж логіку фільтрації, що й у handleFormReport
    const filteredTasks = tasks.filter(t => {
      if (t.status !== 'Виконано') return false;
      if (filters.dateFrom && (!t.date || t.date < filters.dateFrom)) return false;
      if (filters.dateTo && (!t.date || t.date > filters.dateTo)) return false;
      if (filters.region && filters.region !== 'Україна' && t.serviceRegion !== filters.region) return false;
      
      // Фільтр по статусу затвердження
      if (approvalFilter === 'approved') {
        if (!isApproved(t.approvedByAccountant)) return false;
      } else if (approvalFilter === 'not_approved') {
        if (isApproved(t.approvedByAccountant)) return false;
      }
      // Якщо approvalFilter === 'all', то показуємо всі
      
      return true;
    });

    // Створюємо дані для експорту
    const exportData = filteredTasks.map(task => {
      const row = {};
      allTaskFields.forEach(field => {
        row[field.label] = task[field.name] ?? '';
      });
      return row;
    });

    // Формуємо worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Додаємо стилі до заголовків
    const headerLabels = allTaskFields.map(f => f.label);
    headerLabels.forEach((label, idx) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: idx });
      if (!worksheet[cellAddress]) return;
      worksheet[cellAddress].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "FFFDEB46" } }, // Яскраво-жовтий
        alignment: { wrapText: true, vertical: "center", horizontal: "center" }
      };
    });

    // Додаємо wrapText для всіх клітинок
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let R = 1; R <= range.e.r; ++R) {
      for (let C = 0; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (worksheet[cellAddress]) {
          worksheet[cellAddress].s = {
            ...worksheet[cellAddress].s,
            alignment: { wrapText: true, vertical: "center" }
          };
        }
      }
    }

    // Автоматична ширина колонок
    worksheet['!cols'] = headerLabels.map(() => ({ wch: 20 }));

    // Формуємо workbook
    const workbook = XLSX.utils.book_new();
    
    // Створюємо назву файлу з урахуванням фільтрів
    let fileName = 'Звіт_по_заявках';
    if (filters.dateFrom || filters.dateTo) {
      fileName += `_${filters.dateFrom || 'з_початку'}_${filters.dateTo || 'до_кінця'}`;
    }
    if (filters.region) {
      fileName += `_${filters.region}`;
    }
    if (approvalFilter !== 'all') {
      fileName += `_${approvalFilter === 'approved' ? 'затверджені' : 'незатверджені'}`;
    }
    fileName += '.xlsx';
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Заявки');
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div style={{padding:32}}>
      <h2>Завдання для затвердження (Бухгалтер)</h2>
      {loading && <div>Завантаження...</div>}
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button onClick={()=>setTab('pending')} style={{width:220,padding:'10px 0',background:tab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='pending'?700:400,cursor:'pointer'}}>Заявка на підтвердженні</button>
        <button onClick={()=>setTab('archive')} style={{width:220,padding:'10px 0',background:tab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:tab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок</button>
        <button onClick={exportFilteredToExcel} style={{background:'#43a047',color:'#fff',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:600,cursor:'pointer'}}>Експорт у Excel</button>
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
        <label style={{display:'flex',alignItems:'center',gap:4}}>
          Статус затвердження:
          <select 
            value={approvalFilter} 
            onChange={(e) => setApprovalFilter(e.target.value)}
            style={{padding:'4px 8px',borderRadius:'4px',border:'1px solid #ccc'}}
          >
            <option value="all">Всі звіти</option>
            <option value="approved">Тільки затверджені</option>
            <option value="not_approved">Тільки незатверджені</option>
          </select>
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