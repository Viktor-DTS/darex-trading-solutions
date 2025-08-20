import React, { useState, useEffect } from 'react';
import { tasksAPI } from '../utils/tasksAPI';

export default function ReportBuilder() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    requestDate: '', requestDesc: '', serviceRegion: '', address: '', equipmentSerial: '', equipment: '', work: '', date: '', paymentDate: '', approvedByWarehouse: '', approvedByAccountant: '', approvedByRegionalManager: ''
  });
  const [approvalFilter, setApprovalFilter] = useState('all'); // 'all', 'approved', 'not_approved'
  const [groupBy, setGroupBy] = useState('');
  const [reportData, setReportData] = useState([]);
  const [selectedFields, setSelectedFields] = useState(['requestDate', 'date', 'paymentDate', 'approvedByWarehouse', 'approvedByAccountant', 'approvedByRegionalManager']); // Початкові поля
  const [availableFields, setAvailableFields] = useState([
    { name: 'requestDate', label: 'Дата заявки' },
    { name: 'requestDesc', label: 'Опис заявки' },
    { name: 'serviceRegion', label: 'Регіон обслуговування' },
    { name: 'address', label: 'Адреса' },
    { name: 'equipmentSerial', label: 'Серійний номер обладнання' },
    { name: 'equipment', label: 'Обладнання' },
    { name: 'work', label: 'Найменування робіт' },
    { name: 'date', label: 'Дата проведення робіт' },
    { name: 'paymentDate', label: 'Дата оплати' },
    { name: 'engineer1', label: 'Інженер 1' },
    { name: 'engineer2', label: 'Інженер 2' },
    { name: 'client', label: 'Клієнт' },
    { name: 'requestNumber', label: 'Номер заявки' },
    { name: 'invoice', label: 'Рахунок' },
    { name: 'paymentType', label: 'Тип оплати' },
    { name: 'serviceTotal', label: 'Сума послуги' },
    { name: 'warehouseComment', label: 'Коментар складу' },
    { name: 'accountantComment', label: 'Коментар бухгалтера' },
    { name: 'accountantComments', label: 'Коментарії бухгалтера' },
    { name: 'regionalManagerComment', label: 'Коментар регіонального менеджера' },
    { name: 'approvedByWarehouse', label: 'Статус затвердження складу' },
    { name: 'approvedByAccountant', label: 'Статус затвердження бухгалтера' },
    { name: 'approvedByRegionalManager', label: 'Статус затвердження регіонального менеджера' },
    { name: 'comments', label: 'Коментарі' },
    { name: 'oilType', label: 'Тип оливи' },
    { name: 'oilUsed', label: 'Використано оливи' },
    { name: 'oilPrice', label: 'Ціна оливи' },
    { name: 'oilTotal', label: 'Сума оливи' },
    { name: 'filterName', label: 'Назва фільтра' },
    { name: 'filterCount', label: 'Кількість фільтрів' },
    { name: 'filterPrice', label: 'Ціна фільтра' },
    { name: 'filterSum', label: 'Сума фільтрів' },
    { name: 'fuelFilterName', label: 'Назва паливного фільтра' },
    { name: 'fuelFilterCount', label: 'Кількість паливних фільтрів' },
    { name: 'fuelFilterPrice', label: 'Ціна паливного фільтра' },
    { name: 'fuelFilterSum', label: 'Сума паливних фільтрів' },
    { name: 'antifreezeType', label: 'Тип антифризу' },
    { name: 'antifreezeL', label: 'Кількість антифризу' },
    { name: 'antifreezePrice', label: 'Ціна антифризу' },
    { name: 'antifreezeSum', label: 'Сума антифризу' },
    { name: 'otherMaterials', label: 'Інші матеріали' },
    { name: 'otherSum', label: 'Сума інших матеріалів' },
    { name: 'workPrice', label: 'Вартість робіт' },
    { name: 'perDiem', label: 'Добові' },
    { name: 'living', label: 'Проживання' },
    { name: 'otherExp', label: 'Інші витрати' },
    { name: 'carNumber', label: 'Номер автомобіля' },
    { name: 'transportKm', label: 'Транспортні км' },
    { name: 'transportSum', label: 'Сума транспорту' },
    { name: 'status', label: 'Статус' },
    { name: 'company', label: 'Компанія' }
  ]);

  // Додаємо стани для фільтрів дат з діапазоном
  const [dateRangeFilter, setDateRangeFilter] = useState({ from: '', to: '' });
  const [paymentDateRangeFilter, setPaymentDateRangeFilter] = useState({ from: '', to: '' });
  const [requestDateRangeFilter, setRequestDateRangeFilter] = useState({ from: '', to: '' });

  // Функція для перевірки статусу підтвердження
  function isApproved(value) {
    return value === true || value === 'Підтверджено';
  }

  // Функція для форматування статусу затвердження
  function formatApprovalStatus(value) {
    if (isApproved(value)) {
      return 'Підтверджено';
    } else if (value === false || value === 'Відмова') {
      return 'Відхилено';
    } else {
      return 'На розгляді';
    }
  }

  // Додаємо useEffect для оновлення filters при зміні availableFields
  // але зберігаємо вже введені користувачем значення
  useEffect(() => {
    const newFilterKeys = {};
    availableFields.forEach(field => {
      newFilterKeys[field.name] = '';
    });
    
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
  }, [availableFields]); // Залежність від availableFields

  useEffect(() => {
    setLoading(true);
    tasksAPI.getAll().then(tasks => {
      console.log('[DEBUG][ReportBuilder] Завантажено завдань:', tasks.length);
      setTasks(tasks);
      // Автоматично генеруємо звіт після завантаження даних
      if (tasks.length > 0) {
        console.log('[DEBUG][ReportBuilder] Автоматична генерація звіту після завантаження');
        generateReportFromData(tasks);
      }
    }).finally(() => setLoading(false));
  }, []);

  // Функція для генерації звіту з переданими даними
  const generateReportFromData = (tasksData) => {
    console.log('[DEBUG][ReportBuilder] Генерація звіту з', tasksData.length, 'завдань');
    console.log('[DEBUG][ReportBuilder] Поточний approvalFilter:', approvalFilter);
    
    const filtered = tasksData.filter(t => {
      // Фільтр по діапазону дати проведення робіт
      if (dateRangeFilter.from && (!t.date || t.date < dateRangeFilter.from)) {
        return false;
      }
      if (dateRangeFilter.to && (!t.date || t.date > dateRangeFilter.to)) {
        return false;
      }
      
      // Фільтр по діапазону дати оплати
      if (paymentDateRangeFilter.from && (!t.paymentDate || t.paymentDate < paymentDateRangeFilter.from)) {
        return false;
      }
      if (paymentDateRangeFilter.to && (!t.paymentDate || t.paymentDate > paymentDateRangeFilter.to)) {
        return false;
      }
      
      // Фільтр по діапазону дати заявки
      if (requestDateRangeFilter.from && (!t.requestDate || t.requestDate < requestDateRangeFilter.from)) {
        return false;
      }
      if (requestDateRangeFilter.to && (!t.requestDate || t.requestDate > requestDateRangeFilter.to)) {
        return false;
      }
      
      // Перевіряємо всі інші фільтри динамічно
      for (const field of availableFields) {
        const filterValue = filters[field.name];
        if (filterValue && filterValue.trim() !== '') {
          const fieldValue = t[field.name];
          if (!fieldValue || !fieldValue.toString().toLowerCase().includes(filterValue.toLowerCase())) {
            return false;
          }
        }
      }
      
      // Фільтр по статусу затвердження
      if (approvalFilter === 'approved') {
        // Для затверджених - всі повинні бути затверджені
        if (!isApproved(t.approvedByWarehouse) || !isApproved(t.approvedByAccountant) || !isApproved(t.approvedByRegionalManager)) {
          console.log('[DEBUG][ReportBuilder] Завдання', t.id, 'відфільтровано: не всі затвердили');
          return false;
        }
      } else if (approvalFilter === 'not_approved') {
        // Для незатверджених - хоча б один не затвердив
        if (isApproved(t.approvedByWarehouse) && isApproved(t.approvedByAccountant) && isApproved(t.approvedByRegionalManager)) {
          console.log('[DEBUG][ReportBuilder] Завдання', t.id, 'відфільтровано: всі затвердили');
          return false;
        }
      }
      // Якщо approvalFilter === 'all', то показуємо всі
      
      return true;
    });

    console.log('[DEBUG][ReportBuilder] Відфільтровано завдань:', filtered.length);
    console.log('[DEBUG][ReportBuilder] Приклад завдань після фільтрації:', filtered.slice(0, 3).map(t => ({
      id: t.id,
      status: t.status,
      approvedByWarehouse: t.approvedByWarehouse,
      approvedByAccountant: t.approvedByAccountant,
      approvedByRegionalManager: t.approvedByRegionalManager
    })));

    let grouped = filtered;
    if (groupBy) {
      const groups = {};
      filtered.forEach(task => {
        const key = task[groupBy] || 'Не вказано';
        if (!groups[key]) groups[key] = [];
        groups[key].push(task);
      });
      grouped = Object.entries(groups).map(([key, tasks]) => ({
        group: key,
        tasks,
        total: tasks.reduce((sum, t) => sum + (parseFloat(t.serviceTotal) || 0), 0)
      }));
    }

    setReportData(grouped);
    console.log('[DEBUG][ReportBuilder] Звіт згенеровано, рядків:', grouped.length);
  };

  const handleFilter = e => {
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    setFilters(newFilters);
    console.log('[DEBUG][ReportBuilder] Фільтр змінено:', e.target.name, '=', e.target.value);
  };

  const generateReport = () => {
    console.log('[DEBUG][ReportBuilder] Ручна генерація звіту');
    generateReportFromData(tasks);
  };

  // Функція для відкриття звіту в новій вкладці
  const openReportInNewTab = () => {
    console.log('[DEBUG][ReportBuilder] Відкриття звіту в новій вкладці');
    
    // Генеруємо звіт спочатку
    generateReportFromData(tasks);
    
    // Створюємо HTML для нового вікна
    const html = `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Звіт - ${new Date().toLocaleDateString('uk-UA')}</title>
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
          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
          }
          th {
            background: #ffe600;
            color: #222;
            font-weight: bold;
          }
          tr:hover {
            background: #f8f9fa;
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
          <h1>Звіт</h1>
          <p>Дата створення: ${new Date().toLocaleDateString('uk-UA')}</p>
          <p>Кількість записів: ${reportData.length}</p>
        </div>

        <table>
          <thead>
            <tr>
              ${selectedFields.map(field => 
                `<th>${availableFields.find(f => f.name === field)?.label || field}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${reportData.map(item => {
              if (item.group) {
                // Групування
                return `
                  <tr style="background: #e3f2fd; font-weight: bold;">
                    <td colspan="${selectedFields.length}">${item.group} - Всього: ${item.total}</td>
                  </tr>
                  ${item.tasks.map(task => `
                    <tr>
                      ${selectedFields.map(field => {
                        const value = task[field];
                        if (field === 'approvedByWarehouse' || field === 'approvedByAccountant' || field === 'approvedByRegionalManager') {
                          return `<td>${formatApprovalStatus(value)}</td>`;
                        }
                        return `<td>${value || ''}</td>`;
                      }).join('')}
                    </tr>
                  `).join('')}
                `;
              }
              return `
                <tr>
                  ${selectedFields.map(field => {
                    const value = item[field];
                    if (field === 'approvedByWarehouse' || field === 'approvedByAccountant' || field === 'approvedByRegionalManager') {
                      return `<td>${formatApprovalStatus(value)}</td>`;
                    }
                    return `<td>${value || ''}</td>`;
                  }).join('')}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    // Відкриваємо нове вікно з звітом
    const newWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    newWindow.document.write(html);
    newWindow.document.close();
  };

  // Автоматично оновлюємо звіт при зміні фільтрів
  useEffect(() => {
    if (tasks.length > 0) {
      console.log('[DEBUG][ReportBuilder] Автоматичне оновлення звіту при зміні фільтрів');
      generateReportFromData(tasks);
    }
  }, [filters, groupBy, tasks, approvalFilter, dateRangeFilter, paymentDateRangeFilter, requestDateRangeFilter]);

  // Автоматично оновлюємо звіт при зміні вибраних полів
  useEffect(() => {
    if (tasks.length > 0 && selectedFields.length > 0) {
      console.log('[DEBUG][ReportBuilder] Автоматичне оновлення звіту при зміні вибраних полів');
      generateReportFromData(tasks);
    }
  }, [selectedFields]);

  const exportToCSV = () => {
    const headers = selectedFields.map(field => 
      availableFields.find(f => f.name === field)?.label || field
    );

    const rows = reportData.flatMap(item => {
      if (item.group) {
        // Групування
        return [
          [`${item.group} - Всього: ${item.total}`, ...Array(selectedFields.length - 1).fill('')],
          ...item.tasks.map(t => 
            selectedFields.map(field => {
              const value = t[field];
              if (field === 'approvedByWarehouse' || field === 'approvedByAccountant' || field === 'approvedByRegionalManager') {
                return formatApprovalStatus(value);
              }
              return value || '';
            })
          )
        ];
      }
      return [selectedFields.map(field => {
        const value = item[field];
        if (field === 'approvedByWarehouse' || field === 'approvedByAccountant' || field === 'approvedByRegionalManager') {
          return formatApprovalStatus(value);
        }
        return value || '';
      })];
    });

    // Додаємо UTF-8 BOM для правильного відображення в Excel
    const BOM = '\uFEFF';
    const csvContent = BOM + [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Екрануємо коми та лапки в значеннях
        const escapedCell = String(cell).replace(/"/g, '""');
        return `"${escapedCell}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleFieldToggle = (fieldName) => {
    if (selectedFields.includes(fieldName)) {
      setSelectedFields(selectedFields.filter(f => f !== fieldName));
    } else {
      setSelectedFields([...selectedFields, fieldName]);
    }
  };

  return (
    <div style={{
      padding: '24px',
      background: '#22334a',
      borderRadius: '12px',
      margin: '32px auto',
      maxWidth: '1200px'
    }}>
      <h2>Конструктор звітів</h2>
      {loading && <div style={{color: '#fff', marginBottom: '16px'}}>Завантаження...</div>}
      
      {/* Додаткове логування */}
      {console.log('[DEBUG][ReportBuilder] Рендеринг компонента, approvalFilter:', approvalFilter)}
      
      {/* Фільтри */}
      <div style={{marginBottom: '16px', padding: '16px', background: '#1a2636', borderRadius: '8px'}}>
        <h3 style={{color: '#fff', marginBottom: '12px'}}>Фільтри</h3>
        
        {/* Статус затвердження - ЗАВЖДИ ВИДИМИЙ */}
        <div style={{
          marginBottom: '16px', 
          padding: '12px', 
          background: '#2a3a4a', 
          borderRadius: '6px', 
          border: '2px solid #00bfff',
          display: 'block',
          minHeight: '80px'
        }}>
          <label style={{color: '#fff', marginBottom: '8px', fontSize: '16px', display: 'block', fontWeight: 'bold'}}>
            Статус затвердження: (approvalFilter = {approvalFilter})
          </label>
          <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
            <select
              value={approvalFilter}
              onChange={(e) => setApprovalFilter(e.target.value)}
              style={{
                padding: '10px',
                borderRadius: '4px',
                border: '2px solid #00bfff',
                background: '#22334a',
                color: '#fff',
                fontSize: '14px',
                width: '250px',
                fontWeight: 'bold'
              }}
            >
              <option value="all">Всі звіти</option>
              <option value="approved">Тільки затверджені</option>
              <option value="not_approved">Тільки незатверджені</option>
            </select>
            <button
              onClick={openReportInNewTab}
              disabled={loading || tasks.length === 0}
              style={{
                padding: '10px 20px',
                background: loading || tasks.length === 0 ? '#666' : '#00bfff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || tasks.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              {loading ? 'Завантаження...' : 'Сформувати звіт'}
            </button>
          </div>
          <div style={{marginTop: '8px', color: '#00bfff', fontSize: '12px'}}>
            Активний фільтр: {
              approvalFilter === 'all' ? 'Всі звіти' :
              approvalFilter === 'approved' ? 'Тільки затверджені' :
              approvalFilter === 'not_approved' ? 'Тільки незатверджені' : 'Невідомо'
            }
          </div>
        </div>
        
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px'}}>
          {/* Фільтри дат з діапазоном - вертикальне розташування */}
          <div style={{display: 'flex', flexDirection: 'column', gridColumn: '1 / -1', marginBottom: '16px'}}>
            <h4 style={{color: '#fff', marginBottom: '12px', fontSize: '16px'}}>Фільтри за датами:</h4>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px'}}>
              <div style={{display: 'flex', flexDirection: 'column'}}>
                <label style={{color: '#fff', marginBottom: '4px', fontSize: '14px'}}>Дата проведення робіт (з - по)</label>
                <div style={{display: 'flex', gap: '8px'}}>
                  <input
                    type="date"
                    value={dateRangeFilter.from}
                    onChange={(e) => setDateRangeFilter(prev => ({...prev, from: e.target.value}))}
                    placeholder="з"
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #29506a',
                      background: '#22334a',
                      color: '#fff',
                      fontSize: '14px',
                      flex: 1
                    }}
                  />
                  <input
                    type="date"
                    value={dateRangeFilter.to}
                    onChange={(e) => setDateRangeFilter(prev => ({...prev, to: e.target.value}))}
                    placeholder="по"
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #29506a',
                      background: '#22334a',
                      color: '#fff',
                      fontSize: '14px',
                      flex: 1
                    }}
                  />
                </div>
              </div>
              
              <div style={{display: 'flex', flexDirection: 'column'}}>
                <label style={{color: '#fff', marginBottom: '4px', fontSize: '14px'}}>Дата оплати (з - по)</label>
                <div style={{display: 'flex', gap: '8px'}}>
                  <input
                    type="date"
                    value={paymentDateRangeFilter.from}
                    onChange={(e) => setPaymentDateRangeFilter(prev => ({...prev, from: e.target.value}))}
                    placeholder="з"
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #29506a',
                      background: '#22334a',
                      color: '#fff',
                      fontSize: '14px',
                      flex: 1
                    }}
                  />
                  <input
                    type="date"
                    value={paymentDateRangeFilter.to}
                    onChange={(e) => setPaymentDateRangeFilter(prev => ({...prev, to: e.target.value}))}
                    placeholder="по"
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #29506a',
                      background: '#22334a',
                      color: '#fff',
                      fontSize: '14px',
                      flex: 1
                    }}
                  />
                </div>
              </div>
              
              <div style={{display: 'flex', flexDirection: 'column'}}>
                <label style={{color: '#fff', marginBottom: '4px', fontSize: '14px'}}>Дата заявки (з - по)</label>
                <div style={{display: 'flex', gap: '8px'}}>
                  <input
                    type="date"
                    value={requestDateRangeFilter.from}
                    onChange={(e) => setRequestDateRangeFilter(prev => ({...prev, from: e.target.value}))}
                    placeholder="з"
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #29506a',
                      background: '#22334a',
                      color: '#fff',
                      fontSize: '14px',
                      flex: 1
                    }}
                  />
                  <input
                    type="date"
                    value={requestDateRangeFilter.to}
                    onChange={(e) => setRequestDateRangeFilter(prev => ({...prev, to: e.target.value}))}
                    placeholder="по"
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #29506a',
                      background: '#22334a',
                      color: '#fff',
                      fontSize: '14px',
                      flex: 1
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Інші фільтри */}
          {availableFields.map(field => (
            <div key={field.name} style={{display: 'flex', flexDirection: 'column'}}>
              <label style={{color: '#fff', marginBottom: '4px', fontSize: '14px'}}>{field.label}</label>
              <input
                type="text"
                name={field.name}
                value={filters[field.name] || ''}
                onChange={handleFilter}
                placeholder={`Фільтр по ${field.label.toLowerCase()}`}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #29506a',
                  background: '#22334a',
                  color: '#fff',
                  fontSize: '14px'
                }}
              />
            </div>
          ))}
        </div>
      </div>
      
      {/* Вибір полів */}
      <div style={{marginBottom: '16px', padding: '16px', background: '#1a2636', borderRadius: '8px'}}>
        <h3 style={{color: '#fff', marginBottom: '12px'}}>Вибір полів для звіту</h3>
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
          {availableFields.map(field => (
            <div key={field.name} style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
              <input
                type="checkbox"
                checked={selectedFields.includes(field.name)}
                onChange={() => handleFieldToggle(field.name)}
                style={{cursor: 'pointer'}}
              />
              <label style={{color: '#fff', fontSize: '14px'}}>{field.label}</label>
            </div>
          ))}
        </div>
      </div>
      {/* Кнопки управління */}
      <div style={{display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap'}}>
        <select
          value={groupBy}
          onChange={e => setGroupBy(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #29506a',
            background: '#1a2636',
            color: '#fff',
            fontSize: '14px'
          }}
        >
          <option value="">Групувати за...</option>
          {availableFields.map(field => (
            <option key={field.name} value={field.name}>{field.label}</option>
          ))}
        </select>
        <button
          onClick={generateReport}
          disabled={loading || tasks.length === 0}
          style={{
            padding: '8px 16px',
            background: loading || tasks.length === 0 ? '#666' : '#00bfff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: loading || tasks.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {loading ? 'Завантаження...' : 'Згенерувати звіт'}
        </button>
        <button
          onClick={openReportInNewTab}
          disabled={reportData.length === 0}
          style={{
            padding: '8px 16px',
            background: reportData.length === 0 ? '#666' : '#22334a',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: reportData.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          Відкрити в новій вкладці
        </button>
        <button
          onClick={exportToCSV}
          disabled={reportData.length === 0}
          style={{
            padding: '8px 16px',
            background: reportData.length === 0 ? '#666' : '#22334a',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: reportData.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          Експорт в CSV
        </button>
      </div>
      
      {/* Інформація про стан */}
      <div style={{marginBottom: '16px', padding: '12px', background: '#1a2636', borderRadius: '8px'}}>
        <div style={{color: '#fff', fontSize: '14px'}}>
          <strong>Стан:</strong> {loading ? 'Завантаження даних...' : 
            tasks.length === 0 ? 'Немає даних для звіту' :
            `Завантажено ${tasks.length} завдань, відображено ${reportData.length} рядків у звіті`
          }
        </div>
        {selectedFields.length > 0 && (
          <div style={{color: '#fff', fontSize: '14px', marginTop: '4px'}}>
            <strong>Вибрано полів:</strong> {selectedFields.length} з {availableFields.length}
          </div>
        )}
        <div style={{color: '#fff', fontSize: '14px', marginTop: '4px'}}>
          <strong>Фільтр статусу затвердження:</strong> {
            approvalFilter === 'all' ? 'Всі звіти' :
            approvalFilter === 'approved' ? 'Тільки затверджені' :
            approvalFilter === 'not_approved' ? 'Тільки незатверджені' : 'Невідомо'
          }
        </div>
      </div>
      <div style={{overflowX:'auto'}}>
        {loading ? (
          <div style={{color: '#fff', textAlign: 'center', padding: '20px'}}>
            Завантаження даних...
          </div>
        ) : selectedFields.length === 0 ? (
          <div style={{color: '#fff', textAlign: 'center', padding: '20px'}}>
            Виберіть поля для відображення в звіті
          </div>
        ) : reportData.length === 0 ? (
          <div style={{color: '#fff', textAlign: 'center', padding: '20px'}}>
            Немає даних для відображення. Спробуйте змінити фільтри або натисніть "Згенерувати звіт"
          </div>
        ) : (
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '16px',
            color: '#fff'
          }}>
            <thead>
              <tr>
                {selectedFields.map(field => (
                  <th key={field} style={{
                    padding: '12px',
                    textAlign: 'left',
                    borderBottom: '1px solid #29506a',
                    background: '#1a2636'
                  }}>
                    {availableFields.find(f => f.name === field)?.label || field}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportData.map((row, index) => {
                if (row.group) {
                  // Групування
                  return (
                    <React.Fragment key={index}>
                      <tr style={{
                        borderBottom: '2px solid #00bfff',
                        background: '#1a2636',
                        fontWeight: 'bold'
                      }}>
                        <td colSpan={selectedFields.length} style={{padding: '12px', color: '#00bfff'}}>
                          {row.group} - Всього: {row.total}
                        </td>
                      </tr>
                      {row.tasks.map((task, taskIndex) => (
                        <tr key={`${index}-${taskIndex}`} style={{
                          borderBottom: '1px solid #29506a',
                          background: taskIndex % 2 === 0 ? '#22334a' : '#1a2636'
                        }}>
                          {selectedFields.map(field => (
                            <td key={field} style={{padding: '12px'}}>
                              {field === 'approvedByWarehouse' || field === 'approvedByAccountant' || field === 'approvedByRegionalManager' 
                                ? formatApprovalStatus(task[field]) 
                                : (task[field] || '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                } else {
                  // Звичайний рядок
                  return (
                    <tr key={index} style={{
                      borderBottom: '1px solid #29506a',
                      background: index % 2 === 0 ? '#22334a' : '#1a2636'
                    }}>
                      {selectedFields.map(field => (
                        <td key={field} style={{padding: '12px'}}>
                          {field === 'approvedByWarehouse' || field === 'approvedByAccountant' || field === 'approvedByRegionalManager' 
                            ? formatApprovalStatus(row[field]) 
                            : (row[field] || '')}
                        </td>
                      ))}
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        )}
        {reportData.length > 0 && (
          <div style={{color: '#fff', marginTop: '16px', textAlign: 'center'}}>
            Всього рядків: {reportData.length}
          </div>
        )}
      </div>
    </div>
  );
} 