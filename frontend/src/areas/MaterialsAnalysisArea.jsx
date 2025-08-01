import React, { useState, useEffect } from 'react';
import TaskTable from '../components/TaskTable';
import { tasksAPI } from '../utils/tasksAPI';

export default function MaterialsAnalysisArea({ user }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [analysisData, setAnalysisData] = useState([]);

  // Колонки для аналізу матеріалів
  const columns = [
    { key: 'equipment', label: 'Тип обладнання', filter: true },
    { key: 'oilTypes', label: 'Тип оливи', filter: true },
    { key: 'oilRange', label: 'Кількість оливи', filter: true },
    { key: 'oilPriceRange', label: 'Ціна оливи', filter: true },
    { key: 'filterNames', label: 'Фільтр масл. назва', filter: true },
    { key: 'filterCountRange', label: 'Фільтр масл. штук', filter: true },
    { key: 'filterPriceRange', label: 'Ціна одного масляного фільтра', filter: true },
    { key: 'airFilterNames', label: 'Фільтр повітряний назва', filter: true },
    { key: 'airFilterCountRange', label: 'Фільтр повітряний штук', filter: true },
    { key: 'airFilterPriceRange', label: 'Ціна одного повітряного фільтра', filter: true },
    { key: 'antifreezeTypes', label: 'Антифриз тип', filter: true },
    { key: 'antifreezeRange', label: 'Антифриз, л', filter: true },
    { key: 'antifreezePriceRange', label: 'Ціна антифризу', filter: true },
  ];

  // Завантаження даних
  useEffect(() => {
    const loadTasks = async () => {
      setLoading(true);
      try {
        const allTasks = await tasksAPI.getAll();
        setTasks(allTasks);
        generateAnalysisData(allTasks);
      } catch (error) {
        console.error('Помилка завантаження завдань:', error);
      } finally {
        setLoading(false);
      }
    };
    loadTasks();
  }, []);

  // Генерація аналітичних даних
  const generateAnalysisData = (tasksData) => {
    const equipmentGroups = {};
    
    // Групуємо завдання по типу обладнання
    tasksData.forEach(task => {
      if (!task.equipment) return;
      
      if (!equipmentGroups[task.equipment]) {
        equipmentGroups[task.equipment] = [];
      }
      equipmentGroups[task.equipment].push(task);
    });

    // Створюємо аналітичні рядки
    const analysis = Object.keys(equipmentGroups).map(equipment => {
      const groupTasks = equipmentGroups[equipment];
      
      // Аналіз оливи
      const oilTypes = [...new Set(groupTasks.map(t => t.oilType).filter(Boolean))].join(', ');
      const oilUsedValues = groupTasks.map(t => parseFloat(t.oilUsed)).filter(v => !isNaN(v));
      const oilPriceValues = groupTasks.map(t => parseFloat(t.oilPrice)).filter(v => !isNaN(v));
      
      // Аналіз масляних фільтрів
      const filterNames = [...new Set(groupTasks.map(t => t.filterName).filter(Boolean))].join(', ');
      const filterCountValues = groupTasks.map(t => parseFloat(t.filterCount)).filter(v => !isNaN(v));
      const filterPriceValues = groupTasks.map(t => parseFloat(t.filterPrice)).filter(v => !isNaN(v));
      
      // Аналіз повітряних фільтрів
      const airFilterNames = [...new Set(groupTasks.map(t => t.airFilterName).filter(Boolean))].join(', ');
      const airFilterCountValues = groupTasks.map(t => parseFloat(t.airFilterCount)).filter(v => !isNaN(v));
      const airFilterPriceValues = groupTasks.map(t => parseFloat(t.airFilterPrice)).filter(v => !isNaN(v));
      
      // Аналіз антифризу
      const antifreezeTypes = [...new Set(groupTasks.map(t => t.antifreezeType).filter(Boolean))].join(', ');
      const antifreezeValues = groupTasks.map(t => parseFloat(t.antifreezeL)).filter(v => !isNaN(v));
      const antifreezePriceValues = groupTasks.map(t => parseFloat(t.antifreezePrice)).filter(v => !isNaN(v));

      return {
        id: equipment, // Використовуємо тип обладнання як ID
        equipment,
        oilTypes,
        oilRange: oilUsedValues.length > 0 ? `${Math.min(...oilUsedValues)} - ${Math.max(...oilUsedValues)}` : '',
        oilPriceRange: oilPriceValues.length > 0 ? `${Math.min(...oilPriceValues)} - ${Math.max(...oilPriceValues)}` : '',
        filterNames,
        filterCountRange: filterCountValues.length > 0 ? `${Math.min(...filterCountValues)} - ${Math.max(...filterCountValues)}` : '',
        filterPriceRange: filterPriceValues.length > 0 ? `${Math.min(...filterPriceValues)} - ${Math.max(...filterPriceValues)}` : '',
        airFilterNames,
        airFilterCountRange: airFilterCountValues.length > 0 ? `${Math.min(...airFilterCountValues)} - ${Math.max(...airFilterCountValues)}` : '',
        airFilterPriceRange: airFilterPriceValues.length > 0 ? `${Math.min(...airFilterPriceValues)} - ${Math.max(...airFilterPriceValues)}` : '',
        antifreezeTypes,
        antifreezeRange: antifreezeValues.length > 0 ? `${Math.min(...antifreezeValues)} - ${Math.max(...antifreezeValues)}` : '',
        antifreezePriceRange: antifreezePriceValues.length > 0 ? `${Math.min(...antifreezePriceValues)} - ${Math.max(...antifreezePriceValues)}` : '',
      };
    });

    setAnalysisData(analysis);
  };

  // Функція для відкриття звіту в новому вікні
  const openEquipmentReport = (equipmentType) => {
    const equipmentTasks = tasks.filter(task => task.equipment === equipmentType);
    
    if (equipmentTasks.length === 0) {
      alert('Немає даних для даного типу обладнання');
      return;
    }

    // Створюємо HTML звіт
    const reportHTML = `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Звіт по обладнанню: ${equipmentType}</title>
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
          .task-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .task-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #22334a;
          }
          .task-date {
            font-size: 18px;
            font-weight: bold;
            color: #22334a;
          }
          .task-status {
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .status-completed { background: #4caf50; color: white; }
          .status-in-progress { background: #ff9800; color: white; }
          .status-new { background: #2196f3; color: white; }
          .status-blocked { background: #f44336; color: white; }
          .materials-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
            margin-top: 15px;
          }
          .material-section {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #22334a;
          }
          .material-section h4 {
            margin: 0 0 10px 0;
            color: #22334a;
            font-size: 14px;
            text-transform: uppercase;
          }
          .material-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 5px 0;
            border-bottom: 1px solid #eee;
          }
          .material-item:last-child {
            border-bottom: none;
          }
          .material-label {
            font-weight: 500;
            color: #555;
          }
          .material-value {
            font-weight: bold;
            color: #22334a;
          }
          .task-info {
            margin-bottom: 15px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }
          .info-label {
            font-weight: 500;
            color: #666;
          }
          .info-value {
            font-weight: bold;
            color: #22334a;
          }
          .summary {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 6px;
            margin-top: 20px;
            border-left: 4px solid #2196f3;
          }
          .summary h3 {
            margin: 0 0 10px 0;
            color: #1976d2;
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
          <h1>Звіт по обладнанню: ${equipmentType}</h1>
          <p>Кількість проведених робіт: ${equipmentTasks.length}</p>
          <p>Дата створення звіту: ${new Date().toLocaleDateString('uk-UA')}</p>
        </div>

        ${equipmentTasks.map(task => `
          <div class="task-card">
            <div class="task-header">
              <div class="task-date">Дата проведення робіт: ${task.date || 'Не вказано'}</div>
              <div class="task-status status-${task.status === 'Виконано' ? 'completed' : task.status === 'В роботі' ? 'in-progress' : task.status === 'Новий' ? 'new' : 'blocked'}">
                ${task.status || 'Невідомо'}
              </div>
            </div>
            
            <div class="task-info">
              <div class="info-row">
                <span class="info-label">Дата заявки:</span>
                <span class="info-value">${task.requestDate || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Адреса:</span>
                <span class="info-value">${task.address || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Вартість робіт:</span>
                <span class="info-value">${task.workPrice || 'Не вказано'} грн</span>
              </div>
            </div>

            <div class="materials-grid">
              ${task.oilType || task.oilUsed || task.oilPrice ? `
                <div class="material-section">
                  <h4>Олива</h4>
                  ${task.oilType ? `<div class="material-item"><span class="material-label">Тип оливи:</span><span class="material-value">${task.oilType}</span></div>` : ''}
                  ${task.oilUsed ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.oilUsed} л</span></div>` : ''}
                  ${task.oilPrice ? `<div class="material-item"><span class="material-label">Ціна за л:</span><span class="material-value">${task.oilPrice} грн</span></div>` : ''}
                  ${task.oilTotal ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.oilTotal} грн</span></div>` : ''}
                </div>
              ` : ''}

              ${task.filterName || task.filterCount || task.filterPrice ? `
                <div class="material-section">
                  <h4>Масляний фільтр</h4>
                  ${task.filterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.filterName}</span></div>` : ''}
                  ${task.filterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.filterCount} шт</span></div>` : ''}
                  ${task.filterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.filterPrice} грн</span></div>` : ''}
                  ${task.filterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.filterSum} грн</span></div>` : ''}
                </div>
              ` : ''}

              ${task.airFilterName || task.airFilterCount || task.airFilterPrice ? `
                <div class="material-section">
                  <h4>Повітряний фільтр</h4>
                  ${task.airFilterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.airFilterName}</span></div>` : ''}
                  ${task.airFilterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.airFilterCount} шт</span></div>` : ''}
                  ${task.airFilterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.airFilterPrice} грн</span></div>` : ''}
                  ${task.airFilterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.airFilterSum} грн</span></div>` : ''}
                </div>
              ` : ''}

              ${task.antifreezeType || task.antifreezeL || task.antifreezePrice ? `
                <div class="material-section">
                  <h4>Антифриз</h4>
                  ${task.antifreezeType ? `<div class="material-item"><span class="material-label">Тип:</span><span class="material-value">${task.antifreezeType}</span></div>` : ''}
                  ${task.antifreezeL ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.antifreezeL} л</span></div>` : ''}
                  ${task.antifreezePrice ? `<div class="material-item"><span class="material-label">Ціна за л:</span><span class="material-value">${task.antifreezePrice} грн</span></div>` : ''}
                  ${task.antifreezeSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.antifreezeSum} грн</span></div>` : ''}
                </div>
              ` : ''}

              ${task.fuelFilterName || task.fuelFilterCount || task.fuelFilterPrice ? `
                <div class="material-section">
                  <h4>Паливний фільтр</h4>
                  ${task.fuelFilterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.fuelFilterName}</span></div>` : ''}
                  ${task.fuelFilterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.fuelFilterCount} шт</span></div>` : ''}
                  ${task.fuelFilterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.fuelFilterPrice} грн</span></div>` : ''}
                  ${task.fuelFilterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.fuelFilterSum} грн</span></div>` : ''}
                </div>
              ` : ''}

              ${task.otherMaterials || task.otherSum ? `
                <div class="material-section">
                  <h4>Інші матеріали</h4>
                  ${task.otherMaterials ? `<div class="material-item"><span class="material-label">Опис:</span><span class="material-value">${task.otherMaterials}</span></div>` : ''}
                  ${task.otherSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.otherSum} грн</span></div>` : ''}
                </div>
              ` : ''}
            </div>

            ${task.serviceTotal ? `
              <div class="summary">
                <h3>Загальна сума послуги: ${task.serviceTotal} грн</h3>
              </div>
            ` : ''}
          </div>
        `).join('')}

        <div class="summary">
          <h3>Підсумок по обладнанню ${equipmentType}</h3>
          <p>Всього проведено робіт: ${equipmentTasks.length}</p>
          <p>Загальна вартість всіх послуг: ${equipmentTasks.reduce((sum, task) => sum + (parseFloat(task.serviceTotal) || 0), 0).toFixed(2)} грн</p>
        </div>
      </body>
      </html>
    `;

    // Відкриваємо нове вікно з звітом
    const newWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    newWindow.document.write(reportHTML);
    newWindow.document.close();
  };

  // Обробка зміни фільтрів
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Фільтрація даних
  const filteredData = analysisData.filter(item => {
    for (const [key, value] of Object.entries(filters)) {
      if (value && value.trim() !== '') {
        const itemValue = item[key];
        if (!itemValue || !itemValue.toString().toLowerCase().includes(value.toLowerCase())) {
          return false;
        }
      }
    }
    return true;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <div>Завантаження аналізу матеріалів...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '80px 24px 24px', minHeight: '100vh', background: 'transparent' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '24px', color: '#22334a', fontSize: '28px', fontWeight: '600' }}>
          Аналіз ціни матеріалів
        </h1>
        
        <div style={{ background: 'transparent', borderRadius: '8px', padding: '24px' }}>
          <div style={{ marginBottom: '16px', fontSize: '14px', color: '#666' }}>
            Аналіз використання матеріалів по типах обладнання. Дані групуються по унікальним назвам обладнання.
          </div>
          
          <TaskTable
            tasks={filteredData}
            allTasks={analysisData}
            role="materials"
            filters={filters}
            onFilterChange={handleFilterChange}
            columns={columns}
            user={user}
            isArchive={false}
            onHistoryClick={openEquipmentReport}
          />
        </div>
      </div>
    </div>
  );
} 