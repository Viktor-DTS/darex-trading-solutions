import React, { useState, useEffect } from 'react';
import { tasksAPI } from '../utils/tasksAPI';

export default function ReportBuilder() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    requestDate: '', requestDesc: '', serviceRegion: '', address: '', equipmentSerial: '', equipment: '', work: '', date: ''
  });
  const [groupBy, setGroupBy] = useState('');
  const [reportData, setReportData] = useState([]);
  const [selectedFields, setSelectedFields] = useState([]);
  const [availableFields, setAvailableFields] = useState([
    { name: 'requestDate', label: 'Дата заявки' },
    { name: 'requestDesc', label: 'Опис заявки' },
    { name: 'serviceRegion', label: 'Регіон обслуговування' },
    { name: 'address', label: 'Адреса' },
    { name: 'equipmentSerial', label: 'Серійний номер обладнання' },
    { name: 'equipment', label: 'Обладнання' },
    { name: 'work', label: 'Робота' },
    { name: 'date', label: 'Дата виконання' },
    { name: 'engineer1', label: 'Інженер 1' },
    { name: 'engineer2', label: 'Інженер 2' },
    { name: 'client', label: 'Клієнт' },
    { name: 'invoice', label: 'Рахунок' },
    { name: 'paymentType', label: 'Тип оплати' },
    { name: 'serviceTotal', label: 'Сума послуги' },
    { name: 'warehouseComment', label: 'Коментар складу' },
    { name: 'accountantComment', label: 'Коментар бухгалтера' },
    { name: 'regionalManagerComment', label: 'Коментар регіонального менеджера' }
  ]);

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
    tasksAPI.getAll().then(setTasks).finally(() => setLoading(false));
  }, []);

  const handleFilter = e => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const generateReport = () => {
    const filtered = tasks.filter(t =>
      (!filters.requestDate || (t.requestDate && t.requestDate.includes(filters.requestDate))) &&
      (!filters.requestDesc || (t.requestDesc || '').toLowerCase().includes(filters.requestDesc.toLowerCase())) &&
      (!filters.serviceRegion || (t.serviceRegion || '').toLowerCase().includes(filters.serviceRegion.toLowerCase())) &&
      (!filters.address || (t.address || '').toLowerCase().includes(filters.address.toLowerCase())) &&
      (!filters.equipmentSerial || (t.equipmentSerial || '').toLowerCase().includes(filters.equipmentSerial.toLowerCase())) &&
      (!filters.equipment || (t.equipment || '').toLowerCase().includes(filters.equipment.toLowerCase())) &&
      (!filters.work || (t.work || '').toLowerCase().includes(filters.work.toLowerCase())) &&
      (!filters.date || (t.date && t.date.includes(filters.date)))
    );

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
  };

  const exportToCSV = () => {
    const headers = [
      'Дата заявки', 'Опис заявки', 'Регіон обслуговування', 'Адреса',
      'Серійний номер обладнання', 'Обладнання', 'Робота', 'Дата виконання',
      'Інженер 1', 'Інженер 2', 'Клієнт', 'Рахунок', 'Тип оплати',
      'Сума послуги', 'Коментар складу', 'Коментар бухгалтера',
      'Коментар регіонального менеджера'
    ];

    const rows = reportData.flatMap(item => {
      if (item.group) {
        return [
          [item.group, 'Всього:', item.total],
          ...item.tasks.map(t => [
            t.requestDate, t.requestDesc, t.serviceRegion, t.address,
            t.equipmentSerial, t.equipment, t.work, t.date,
            t.engineer1, t.engineer2, t.client, t.invoice, t.paymentType,
            t.serviceTotal, t.warehouseComment, t.accountantComment,
            t.regionalManagerComment
          ])
        ];
      }
      return [[
        item.requestDate, item.requestDesc, item.serviceRegion, item.address,
        item.equipmentSerial, item.equipment, item.work, item.date,
        item.engineer1, item.engineer2, item.client, item.invoice, item.paymentType,
        item.serviceTotal, item.warehouseComment, item.accountantComment,
        item.regionalManagerComment
      ]];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'report.csv';
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
      <div style={{marginBottom: '16px'}}>
        <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
          {availableFields.map(field => (
            <div key={field.name} style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
              <input
                type="checkbox"
                checked={selectedFields.includes(field.name)}
                onChange={() => handleFieldToggle(field.name)}
                style={{cursor: 'pointer'}}
              />
              <label style={{color: '#fff'}}>{field.label}</label>
            </div>
          ))}
        </div>
      </div>
      <div style={{display: 'flex', gap: '8px', marginBottom: '16px'}}>
        <select
          value={groupBy}
          onChange={e => setGroupBy(e.target.value)}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #29506a',
            background: '#1a2636',
            color: '#fff'
          }}
        >
          <option value="">Групувати за...</option>
          {availableFields.map(field => (
            <option key={field.name} value={field.name}>{field.label}</option>
          ))}
        </select>
        <button
          onClick={generateReport}
          style={{
            padding: '8px 16px',
            background: '#00bfff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Згенерувати звіт
        </button>
        <button
          onClick={exportToCSV}
          style={{
            padding: '8px 16px',
            background: '#22334a',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Експорт в CSV
        </button>
      </div>
      <div style={{overflowX:'auto'}}>
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
            {reportData.map((row, index) => (
              <tr key={index} style={{
                borderBottom: '1px solid #29506a',
                background: index % 2 === 0 ? '#22334a' : '#1a2636'
              }}>
                {selectedFields.map(field => (
                  <td key={field} style={{padding: '12px'}}>
                    {row[field]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 