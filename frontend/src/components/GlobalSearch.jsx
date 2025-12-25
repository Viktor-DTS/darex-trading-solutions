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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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

  const handleViewHistory = (task) => {
    setSelectedTask(task);
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
      {searchResults.length > 0 && (
        <div className="search-results">
          <div className="results-header">
            <h3>Знайдено заявок: {searchResults.length}</h3>
          </div>

          <div className="results-table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Номер заявки/наряду</th>
                  <th>Статус заявки</th>
                  <th>Дата заявки</th>
                  <th>Компанія виконавець</th>
                  <th>Регіон сервісного відділу</th>
                  <th>Замовник</th>
                  <th>ЄДРПОУ</th>
                  <th>Тип обладнання</th>
                  <th>Зав. № двигуна</th>
                  <th>Інвент. № обладнання</th>
                  <th>Дата проведення робіт</th>
                  <th>Загальна сума послуги, грн</th>
                  <th>Дії</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map((task) => (
                  <tr key={task.id || task._id}>
                    <td>{task.requestNumber || ''}</td>
                    <td>{task.status || ''}</td>
                    <td>{formatDate(task.requestDate)}</td>
                    <td>{task.company || ''}</td>
                    <td>{task.serviceRegion || ''}</td>
                    <td>{task.client || ''}</td>
                    <td>{task.edrpou || ''}</td>
                    <td>{task.equipment || ''}</td>
                    <td>{task.engineSerial || ''}</td>
                    <td>{task.customerEquipmentNumber || ''}</td>
                    <td>{formatDate(task.date)}</td>
                    <td>{formatNumber(task.serviceTotal)}</td>
                    <td>
                      <button
                        className="btn-view-history"
                        onClick={() => handleViewHistory(task)}
                        title="Переглянути історію робіт"
                      >
                        📋 Історія
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Модальне вікно історії робіт */}
      {showHistoryModal && selectedTask && (
        <WorkHistoryModal
          task={selectedTask}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedTask(null);
          }}
        />
      )}
    </div>
  );
}

export default GlobalSearch;

