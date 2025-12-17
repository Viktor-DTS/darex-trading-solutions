import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../../config';
import { exportEquipmentToExcel } from '../../utils/equipmentExport';
import EquipmentHistoryModal from './EquipmentHistoryModal';
import EquipmentQRModal from './EquipmentQRModal';
import EquipmentDeleteModal from './EquipmentDeleteModal';
import EquipmentDetailsModal from './EquipmentDetailsModal';
import './EquipmentList.css';

// Визначення всіх колонок
const ALL_COLUMNS = [
  { key: 'manufacturer', label: 'Виробник', width: 150 },
  { key: 'type', label: 'Тип обладнання', width: 180 },
  { key: 'serialNumber', label: 'Серійний номер', width: 150 },
  { key: 'currentWarehouse', label: 'Склад', width: 150 },
  { key: 'standbyPower', label: 'Резервна потужність', width: 150 },
  { key: 'primePower', label: 'Основна потужність', width: 150 },
  { key: 'phases', label: 'Фази', width: 100 },
  { key: 'voltage', label: 'Напруга', width: 120 },
  { key: 'current', label: 'Струм (A)', width: 100 },
  { key: 'rpm', label: 'RPM', width: 100 },
  { key: 'dimensions', label: 'Розміри (мм)', width: 150 },
  { key: 'weight', label: 'Вага (кг)', width: 100 },
  { key: 'manufactureDate', label: 'Дата виробництва', width: 150 }
];

function EquipmentList({ user, warehouses, onMove, onShip }) {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [sortField, setSortField] = useState('type');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showFilters, setShowFilters] = useState(true);
  
  // Фільтри колонок
  const [columnFilters, setColumnFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('equipmentTable_filters');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  
  // Глобальний пошук
  const [filter, setFilter] = useState(() => {
    try {
      const savedFilter = localStorage.getItem('equipmentTable_filter');
      return savedFilter || '';
    } catch {
      return '';
    }
  });

  // Зберігаємо фільтри в localStorage
  useEffect(() => {
    try {
      localStorage.setItem('equipmentTable_filters', JSON.stringify(columnFilters));
    } catch (error) {
      console.error('Помилка збереження фільтрів:', error);
    }
  }, [columnFilters]);

  useEffect(() => {
    try {
      localStorage.setItem('equipmentTable_filter', filter);
    } catch (error) {
      console.error('Помилка збереження пошуку:', error);
    }
  }, [filter]);

  useEffect(() => {
    loadEquipment();
  }, []);

  const loadEquipment = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setEquipment(data);
      }
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshEquipment = () => {
    loadEquipment();
  };

  const handleColumnFilterChange = (columnKey, value) => {
    setColumnFilters(prev => ({
      ...prev,
      [columnKey]: value
    }));
  };

  const clearAllFilters = () => {
    setColumnFilters({});
    setFilter('');
    try {
      localStorage.removeItem('equipmentTable_filters');
      localStorage.removeItem('equipmentTable_filter');
    } catch (error) {
      console.error('Помилка видалення фільтрів:', error);
    }
  };

  const hasActiveFilters = Object.values(columnFilters).some(v => v && v.trim() !== '') || filter.trim() !== '';

  const getFilterType = (columnKey) => {
    if (columnKey === 'manufactureDate') return 'date';
    if (columnKey === 'currentWarehouse') return 'select';
    return 'text';
  };

  const getFilterOptions = (columnKey) => {
    if (columnKey === 'currentWarehouse') {
      const uniqueWarehouses = [...new Set(equipment.map(eq => eq.currentWarehouseName || eq.currentWarehouse).filter(Boolean))];
      return ['', ...uniqueWarehouses];
    }
    return [];
  };

  // Фільтрація та сортування
  const filteredAndSortedEquipment = useMemo(() => {
    let result = [...equipment];

    // Глобальний пошук
    if (filter.trim()) {
      const searchLower = filter.toLowerCase();
      result = result.filter(item => {
        return Object.values(item).some(value => {
          if (value == null) return false;
          return String(value).toLowerCase().includes(searchLower);
        });
      });
    }

    // Фільтри колонок
    Object.keys(columnFilters).forEach(key => {
      const filterValue = columnFilters[key];
      if (filterValue && filterValue.trim() !== '') {
        if (key.endsWith('From')) {
          const baseKey = key.replace('From', '');
          const fromDate = new Date(filterValue);
          result = result.filter(item => {
            const itemValue = item[baseKey];
            if (!itemValue) return false;
            const itemDate = new Date(itemValue);
            return itemDate >= fromDate;
          });
        } else if (key.endsWith('To')) {
          const baseKey = key.replace('To', '');
          const toDate = new Date(filterValue);
          toDate.setHours(23, 59, 59, 999);
          result = result.filter(item => {
            const itemValue = item[baseKey];
            if (!itemValue) return false;
            const itemDate = new Date(itemValue);
            return itemDate <= toDate;
          });
        } else {
          const filterLower = filterValue.toLowerCase();
          result = result.filter(item => {
            const itemValue = item[key];
            if (itemValue == null) return false;
            return String(itemValue).toLowerCase().includes(filterLower);
          });
        }
      }
    });

    // Сортування
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      const comparison = aVal > bVal ? 1 : -1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [equipment, filter, columnFilters, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const formatValue = (value, key) => {
    if (value == null || value === '') return 'не визначено';
    
    if (key === 'manufactureDate') {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('uk-UA');
        }
      } catch (e) {}
    }
    
    return String(value);
  };

  const getStatusLabel = (status) => {
    const labels = {
      'in_stock': 'На складі',
      'reserved': 'Зарезервовано',
      'shipped': 'Відвантажено',
      'in_transit': 'В дорозі'
    };
    return labels[status] || status;
  };

  const getStatusClass = (status) => {
    return `status-${status}`;
  };

  const handleRowClick = (item) => {
    setSelectedEquipment(item);
    setShowDetailsModal(true);
  };

  const handleExport = async () => {
    if (equipment.length === 0) {
      alert('Немає даних для експорту');
      return;
    }
    await exportEquipmentToExcel(equipment, 'equipment');
  };

  const renderColumnFilter = (col) => {
    const filterType = getFilterType(col.key);
    
    if (filterType === 'date') {
      return (
        <div className="filter-date-range">
          <input
            type="date"
            className="filter-input filter-date"
            value={columnFilters[col.key + 'From'] || ''}
            onChange={(e) => handleColumnFilterChange(col.key + 'From', e.target.value)}
            title={`${col.label} від`}
          />
          <input
            type="date"
            className="filter-input filter-date"
            value={columnFilters[col.key + 'To'] || ''}
            onChange={(e) => handleColumnFilterChange(col.key + 'To', e.target.value)}
            title={`${col.label} до`}
          />
        </div>
      );
    }
    
    if (filterType === 'select') {
      const options = getFilterOptions(col.key);
      return (
        <select
          className="filter-input filter-select"
          value={columnFilters[col.key] || ''}
          onChange={(e) => handleColumnFilterChange(col.key, e.target.value)}
        >
          {options.map(opt => (
            <option key={opt} value={opt}>{opt || 'Всі'}</option>
          ))}
        </select>
      );
    }
    
    return (
      <input
        type="text"
        className="filter-input"
        placeholder="Фільтр..."
        value={columnFilters[col.key] || ''}
        onChange={(e) => handleColumnFilterChange(col.key, e.target.value)}
      />
    );
  };

  if (loading) {
    return (
      <div className="equipment-loading">
        <div className="spinner"></div>
        <p>Завантаження обладнання...</p>
      </div>
    );
  }

  return (
    <div className="equipment-table-container">
      {/* Фільтри та пошук */}
      <div className="equipment-table-toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Пошук по всіх полях..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="toolbar-actions">
          <button
            className="btn-export-excel"
            onClick={handleExport}
            title="Експортувати таблицю в Excel"
          >
            📊 Експорт
          </button>
          <button
            className={`btn-toggle-filters ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title={showFilters ? 'Сховати фільтри колонок' : 'Показати фільтри колонок'}
          >
            🔽 Фільтри
          </button>
          {hasActiveFilters && (
            <button
              className="btn-clear-filters"
              onClick={clearAllFilters}
              title="Очистити всі фільтри"
            >
              ✖ Очистити
            </button>
          )}
        </div>
        <div className="toolbar-info">
          <span>Знайдено: {filteredAndSortedEquipment.length}</span>
        </div>
      </div>

      {/* Таблиця */}
      <div className="equipment-table-wrapper">
        <table className="equipment-table">
          <thead>
            {/* Рядок заголовків */}
            <tr>
              <th style={{ width: '200px', minWidth: '200px' }} rowSpan={showFilters ? 2 : 1}>
                <div className="th-content">Дія</div>
              </th>
              {ALL_COLUMNS.map(col => (
                <th
                  key={col.key}
                  style={{ 
                    width: `${col.width}px`,
                    minWidth: '80px'
                  }}
                  onClick={() => handleSort(col.key)}
                  className={`sortable ${sortField === col.key ? `sort-${sortDirection}` : ''}`}
                >
                  <div className="th-content">
                    {col.label}
                    {sortField === col.key && (
                      <span className="sort-indicator">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
            {/* Рядок фільтрів */}
            {showFilters && (
              <tr className="filter-row">
                {ALL_COLUMNS.map(col => (
                  <th key={`filter-${col.key}`} className="filter-cell">
                    {renderColumnFilter(col)}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {filteredAndSortedEquipment.length === 0 ? (
              <tr>
                <td colSpan={ALL_COLUMNS.length + 1} className="empty-state">
                  Обладнання не знайдено
                </td>
              </tr>
            ) : (
              filteredAndSortedEquipment.map(item => (
                <tr 
                  key={item._id} 
                  onClick={() => handleRowClick(item)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                    <div className="action-buttons">
                      <button
                        className="btn-action btn-qr"
                        onClick={() => {
                          setSelectedEquipment(item);
                          setShowQR(true);
                        }}
                        title="QR-код"
                      >
                        📱 QR
                      </button>
                      <button
                        className="btn-action btn-history"
                        onClick={() => {
                          setSelectedEquipment(item);
                          setShowHistory(true);
                        }}
                        title="Історія"
                      >
                        📋 Історія
                      </button>
                      {item.status === 'in_stock' && (
                        <>
                          <button
                            className="btn-action btn-move"
                            onClick={() => onMove && onMove(item)}
                            title="Перемістити"
                          >
                            📦 Перемістити
                          </button>
                          <button
                            className="btn-action btn-ship"
                            onClick={() => onShip && onShip(item)}
                            title="Відвантажити"
                          >
                            🚚 Відвантажити
                          </button>
                        </>
                      )}
                      {(user?.role === 'admin' || user?.role === 'administrator') && (
                        <button
                          className="btn-action btn-delete"
                          onClick={() => {
                            setSelectedEquipment(item);
                            setShowDeleteModal(true);
                          }}
                          title="Видалити"
                        >
                          🗑️ Видалити
                        </button>
                      )}
                    </div>
                  </td>
                  <td>{formatValue(item.manufacturer, 'manufacturer')}</td>
                  <td>{formatValue(item.type, 'type')}</td>
                  <td>{formatValue(item.serialNumber, 'serialNumber')}</td>
                  <td>{formatValue(item.currentWarehouseName || item.currentWarehouse, 'currentWarehouse')}</td>
                  <td>{formatValue(item.standbyPower, 'standbyPower')}</td>
                  <td>{formatValue(item.primePower, 'primePower')}</td>
                  <td>{formatValue(item.phases, 'phases')}</td>
                  <td>{formatValue(item.voltage, 'voltage')}</td>
                  <td>{formatValue(item.current, 'current')}</td>
                  <td>{formatValue(item.rpm, 'rpm')}</td>
                  <td>{formatValue(item.dimensions, 'dimensions')}</td>
                  <td>{formatValue(item.weight, 'weight')}</td>
                  <td>{formatValue(item.manufactureDate, 'manufactureDate')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Модальні вікна */}
      {showDeleteModal && selectedEquipment && (
        <EquipmentDeleteModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowDeleteModal(false);
            setSelectedEquipment(null);
          }}
          onConfirm={async (reason) => {
            const token = localStorage.getItem('token');
            try {
              const response = await fetch(`${API_BASE_URL}/equipment/${selectedEquipment._id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason })
              });

              if (response.ok) {
                setShowDeleteModal(false);
                setSelectedEquipment(null);
                refreshEquipment();
              } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Помилка видалення');
              }
            } catch (error) {
              console.error('[DELETE] Помилка запиту:', error);
              throw error;
            }
          }}
        />
      )}

      {showHistory && selectedEquipment && (
        <EquipmentHistoryModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowHistory(false);
            setSelectedEquipment(null);
          }}
        />
      )}

      {showQR && selectedEquipment && (
        <EquipmentQRModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowQR(false);
            setSelectedEquipment(null);
          }}
        />
      )}

      {showDetailsModal && selectedEquipment && (
        <EquipmentDetailsModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedEquipment(null);
          }}
        />
      )}
    </div>
  );
}

export default EquipmentList;
