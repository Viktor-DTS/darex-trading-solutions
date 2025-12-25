import React, { useState } from 'react';
import API_BASE_URL from '../config';
import WorkHistoryModal from './WorkHistoryModal';
import './GlobalSearch.css';

function GlobalSearch({ user }) {
  const [searchData, setSearchData] = useState({
    edrpou: '',
    engineSerial: '',
    customerEquipmentNumber: ''
  });
  const [searchResults, setSearchResults] = useState([]);
  const [groupedResults, setGroupedResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedGroupTasks, setSelectedGroupTasks] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Функція для групування заявок по унікальним комбінаціям
  const groupTasksByUniqueCombination = (tasks) => {
    const groupsMap = new Map();
    
    tasks.forEach(task => {
      // Створюємо ключ для групування
      const key = `${task.client || ''}_${task.edrpou || ''}_${task.equipment || ''}_${task.engineSerial || ''}_${task.customerEquipmentNumber || ''}`;
      
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          client: task.client || '',
          edrpou: task.edrpou || '',
          equipment: task.equipment || '',
          engineSerial: task.engineSerial || '',
          customerEquipmentNumber: task.customerEquipmentNumber || '',
          tasks: []
        });
      }
      
      groupsMap.get(key).tasks.push(task);
    });
    
    // Сортуємо заявки в кожній групі від новіших до старіших (по даті заявки)
    const groups = Array.from(groupsMap.values()).map(group => ({
      ...group,
      tasks: group.tasks.sort((a, b) => {
        const dateA = new Date(a.requestDate || a.date || 0);
        const dateB = new Date(b.requestDate || b.date || 0);
        return dateB - dateA; // Від новіших до старіших
      }),
      count: group.tasks.length
    }));
    
    return groups;
  };

  const handleSearch = async () => {
    // Перевірка, чи заповнено хоча б одне поле
    if (!searchData.edrpou.trim() && !searchData.engineSerial.trim() && !searchData.customerEquipmentNumber.trim()) {
      setError('Будь ласка, заповніть хоча б одне поле для пошуку');
      return;
    }

    setLoading(true);
    setError(null);
    setSearchResults([]);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/tasks/global-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(searchData)
      });

      if (!response.ok) {
        throw new Error('Помилка пошуку');
      }

      const results = await response.json();
      setSearchResults(results);
      
      if (results.length === 0) {
        setError('За результатами пошуку нічого не знайдено');
        setGroupedResults([]);
      } else {
        // Групуємо результати по унікальним комбінаціям
        const grouped = groupTasksByUniqueCombination(results);
        setGroupedResults(grouped);
      }
    } catch (err) {
      console.error('Помилка пошуку:', err);
      setError('Помилка виконання пошуку. Спробуйте ще раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSearchData(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null);
  };

  const handleViewHistory = (group) => {
    // Передаємо всі заявки групи, відсортовані від новіших до старіших
    setSelectedGroupTasks(group.tasks);
    setShowHistoryModal(true);
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return '';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  };

  const formatNumber = (num) => {
    if (!num && num !== 0) return '';
    return parseFloat(num).toFixed(2);
  };

  return (
    <div className="global-search">
      <div className="global-search-header">
        <h2>🔍 Глобальний пошук</h2>
        <p className="search-description">
          Введіть дані для пошуку заявок по всій системі
        </p>
      </div>

      {/* Форма пошуку */}
      <div className="search-form">
        <div className="search-form-row">
          <div className="search-form-field">
            <label htmlFor="edrpou">ЄДРПОУ</label>
            <input
              type="text"
              id="edrpou"
              value={searchData.edrpou}
              onChange={(e) => handleInputChange('edrpou', e.target.value)}
              placeholder="Введіть ЄДРПОУ"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
            />
          </div>

          <div className="search-form-field">
            <label htmlFor="engineSerial">Зав. № двигуна</label>
            <input
              type="text"
              id="engineSerial"
              value={searchData.engineSerial}
              onChange={(e) => handleInputChange('engineSerial', e.target.value)}
              placeholder="Введіть заводський номер двигуна"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
            />
          </div>

          <div className="search-form-field">
            <label htmlFor="customerEquipmentNumber">Інвент. № обладнання від замовника</label>
            <input
              type="text"
              id="customerEquipmentNumber"
              value={searchData.customerEquipmentNumber}
              onChange={(e) => handleInputChange('customerEquipmentNumber', e.target.value)}
              placeholder="Введіть інвентарний номер"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
            />
          </div>
        </div>

        <div className="search-form-actions">
          <button 
            className="btn-search"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? '⏳ Пошук...' : '🔍 Шукати'}
          </button>
          <button 
            className="btn-clear"
            onClick={() => {
              setSearchData({
                edrpou: '',
                engineSerial: '',
                customerEquipmentNumber: ''
              });
              setSearchResults([]);
              setError(null);
            }}
            disabled={loading}
          >
            Очистити
          </button>
        </div>
      </div>

      {/* Помилка */}
      {error && (
        <div className="search-error">
          {error}
        </div>
      )}

      {/* Результати пошуку */}
      {groupedResults.length > 0 && (
        <div className="search-results">
          <div className="results-header">
            <h3>Знайдено груп: {groupedResults.length} (всього заявок: {searchResults.length})</h3>
          </div>

          <div className="results-table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Дія</th>
                  <th>Кількість заявок</th>
                  <th>Замовник</th>
                  <th>ЄДРПОУ</th>
                  <th>Тип обладнання</th>
                  <th>Зав. № двигуна</th>
                  <th>Інвент. № обладнання</th>
                </tr>
              </thead>
              <tbody>
                {groupedResults.map((group) => (
                  <tr key={group.key}>
                    <td>
                      <button
                        className="btn-view-history"
                        onClick={() => handleViewHistory(group)}
                        title="Переглянути історію робіт"
                      >
                        📋 Історія
                      </button>
                    </td>
                    <td>{group.count}</td>
                    <td>{group.client}</td>
                    <td>{group.edrpou}</td>
                    <td>{group.equipment}</td>
                    <td>{group.engineSerial}</td>
                    <td>{group.customerEquipmentNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Модальне вікно історії робіт */}
      {showHistoryModal && selectedGroupTasks.length > 0 && (
        <WorkHistoryModal
          tasks={selectedGroupTasks}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedGroupTasks([]);
          }}
        />
      )}
    </div>
  );
}

export default GlobalSearch;

