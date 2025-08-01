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
    <div style={{ padding: '80px 24px 24px', minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '24px', color: '#22334a', fontSize: '28px', fontWeight: '600' }}>
          Аналіз ціни матеріалів
        </h1>
        
        <div style={{ background: '#fff', borderRadius: '8px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
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
          />
        </div>
      </div>
    </div>
  );
} 