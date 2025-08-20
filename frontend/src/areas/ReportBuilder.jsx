import React, { useState, useEffect } from 'react';
import { tasksAPI } from '../utils/tasksAPI';

export default function ReportBuilder() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    requestDate: '', requestDesc: '', serviceRegion: '', address: '', equipmentSerial: '', equipment: '', work: '', date: '', approvedByWarehouse: '', approvedByAccountant: '', approvedByRegionalManager: ''
  });
  const [approvalFilter, setApprovalFilter] = useState('all'); // 'all', 'approved', 'not_approved'
  const [groupBy, setGroupBy] = useState('');
  const [reportData, setReportData] = useState([]);
  const [selectedFields, setSelectedFields] = useState(['requestDate', 'date', 'paymentDate']); // Початкові поля
  const [availableFields, setAvailableFields] = useState([
    { name: 'requestDate', label: 'Дата заявки' },
    { name: 'requestDesc', label: 'Опис заявки' },
    { name: 'serviceRegion', label: 'Регіон обслуговування' },
    { name: 'address', label: 'Адреса' },
    { name: 'equipmentSerial', label: 'Серійний номер обладнання' },
    { name: 'equipment', label: 'Обладнання' },
    { name: 'work', label: 'Робота' },
    { name: 'date', label: 'Дата виконання' },
    { name: 'paymentDate', label: 'Дата оплати' },
    { name: 'engineer1', label: 'Інженер 1' },
    { name: 'engineer2', label: 'Інженер 2' },
    { name: 'client', label: 'Клієнт' },
    { name: 'invoice', label: 'Рахунок' },
    { name: 'paymentType', label: 'Тип оплати' },
    { name: 'serviceTotal', label: 'Сума послуги' },
    { name: 'warehouseComment', label: 'Коментар складу' },
    { name: 'accountantComment', label: 'Коментар бухгалтера' },
    { name: 'accountantComments', label: 'Коментарії бухгалтера' },
    { name: 'regionalManagerComment', label: 'Коментар регіонального менеджера' },
    { name: 'approvedByWarehouse', label: 'Статус затвердження складу' },
    { name: 'approvedByAccountant', label: 'Статус затвердження бухгалтера' },
    { name: 'approvedByRegionalManager', label: 'Статус затвердження регіонального менеджера' }
  ]);

  // Функція для перевірки статусу підтвердження
  function isApproved(value) {
    return value === true || value === 'Підтверджено';
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
    
    const filtered = tasksData.filter(t => {
      // Перевіряємо всі фільтри динамічно
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
          return false;
        }
      } else if (approvalFilter === 'not_approved') {
        // Для незатверджених - хоча б один не затвердив
        if (isApproved(t.approvedByWarehouse) && isApproved(t.approvedByAccountant) && isApproved(t.approvedByRegionalManager)) {
          return false;
        }
      }
      // Якщо approvalFilter === 'all', то показуємо всі
      
      return true;
    });

    console.log('[DEBUG][ReportBuilder] Відфільтровано завдань:', filtered.length);

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

  // Автоматично оновлюємо звіт при зміні фільтрів
  useEffect(() => {
    if (tasks.length > 0) {
      console.log('[DEBUG][ReportBuilder] Автоматичне оновлення звіту при зміні фільтрів');
      generateReportFromData(tasks);
    }
  }, [filters, groupBy, tasks, approvalFilter]);

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
            selectedFields.map(field => t[field] || '')
          )
        ];
      }
      return [selectedFields.map(field => item[field] || '')];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
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
      
      {/* Фільтри */}
      <div style={{marginBottom: '16px', padding: '16px', background: '#1a2636', borderRadius: '8px'}}>
        <h3 style={{color: '#fff', marginBottom: '12px'}}>Фільтри</h3>
        
        {/* Статус затвердження */}
        <div style={{marginBottom: '16px', padding: '12px', background: '#2a3a4a', borderRadius: '6px', border: '1px solid #00bfff'}}>
          <label style={{color: '#fff', marginBottom: '8px', fontSize: '16px', display: 'block', fontWeight: 'bold'}}>Статус затвердження:</label>
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
              onClick={generateReport}
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
        </div>
        
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px'}}>
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
                              {task[field] || ''}
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
                          {row[field] || ''}
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