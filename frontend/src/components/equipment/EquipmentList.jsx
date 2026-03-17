import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import API_BASE_URL from '../../config';
import { exportEquipmentToExcel } from '../../utils/equipmentExport';
import EquipmentHistoryModal from './EquipmentHistoryModal';
import EquipmentQRModal from './EquipmentQRModal';
import EquipmentDeleteModal from './EquipmentDeleteModal';
import EquipmentDetailsModal from './EquipmentDetailsModal';
import EquipmentEditModal from './EquipmentEditModal';
import './EquipmentList.css';

// Функції для обробки статусів (винесені за межі компонента)
const getStatusLabel = (status) => {
  const labels = {
    'in_stock': 'На складі',
    'reserved': 'На складі', // Зарезервоване також показуємо як "На складі" в колонці статусу на складі
    'shipped': 'Відвантажено',
    'in_transit': 'В дорозі',
    'written_off': 'Списано',
    'deleted': 'Видалено'
  };
  return labels[status] || status || 'На складі';
};

const getReservationStatusLabel = (item) => {
  // Перевіряємо, чи є резервування
  if (item.status === 'reserved' || item.reservedByName || item.reservationClientName) {
    return 'Зарезервовано';
  }
  return 'Вільна';
};

// Визначення всіх колонок
const ALL_COLUMNS = [
  { key: 'itemKind', label: 'Тип номенклатури', width: 140 },
  { key: 'status', label: 'Статус на складі', width: 140 },
  { key: 'reservationStatus', label: 'Статус Резерву', width: 140 },
  { key: 'manufacturer', label: 'Виробник', width: 150 },
  { key: 'type', label: 'Тип обладнання', width: 180 },
  { key: 'quantity', label: 'Кількість', width: 100 },
  { key: 'serialNumber', label: 'Серійний номер', width: 150 },
  { key: 'currentWarehouse', label: 'Склад', width: 150 },
  { key: 'reservationClientName', label: 'Клієнт резервування', width: 200 },
  { key: 'reservedByName', label: 'Хто зарезервував', width: 180 },
  { key: 'testingStatus', label: 'Статус тестування', width: 160 },
  { key: 'testingDate', label: 'Дата тестування', width: 140 },
  { key: 'standbyPower', label: 'Резервна потужність', width: 150 },
  { key: 'primePower', label: 'Основна потужність', width: 150 },
  { key: 'phase', label: 'Фази', width: 100 },
  { key: 'voltage', label: 'Напруга', width: 120 },
  { key: 'amperage', label: 'Струм (A)', width: 100 },
  { key: 'rpm', label: 'RPM', width: 100 },
  { key: 'dimensions', label: 'Розміри (мм)', width: 150 },
  { key: 'weight', label: 'Вага (кг)', width: 100 },
  { key: 'manufactureDate', label: 'Дата виробництва', width: 150 }
];

const EquipmentList = forwardRef(({ user, warehouses, onMove, onShip, onReserve, onRequestTesting, showReserveAction = false, categoryId = null, includeSubtree = true }, ref) => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
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
  }, [categoryId, includeSubtree]);

  const loadEquipment = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (categoryId) {
        params.set('categoryId', categoryId);
        if (includeSubtree) params.set('includeSubtree', 'true');
      }
      const url = params.toString() ? `${API_BASE_URL}/equipment?${params}` : `${API_BASE_URL}/equipment`;
      const response = await fetch(url, {
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

  // Експортуємо метод оновлення через ref
  useImperativeHandle(ref, () => ({
    refresh: refreshEquipment
  }));

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
    if (columnKey === 'status') return 'select';
    if (columnKey === 'reservationStatus') return 'select';
    if (columnKey === 'itemKind') return 'select';
    return 'text';
  };

  const getFilterOptions = (columnKey) => {
    if (columnKey === 'currentWarehouse') {
      const uniqueWarehouses = [...new Set(equipment.map(eq => eq.currentWarehouseName || eq.currentWarehouse).filter(Boolean))];
      return ['', ...uniqueWarehouses];
    }
    if (columnKey === 'status') {
      return ['', 'На складі', 'В дорозі', 'Відвантажено'];
    }
    if (columnKey === 'reservationStatus') {
      return ['', 'Всі', 'Вільна', 'Зарезервовано'];
    }
    if (columnKey === 'itemKind') {
      return ['', 'Товари', 'Деталі'];
    }
    return [];
  };

  // Фільтрація та сортування
  const filteredAndSortedEquipment = useMemo(() => {
    let result = [...equipment];

    // Фільтр видаленого обладнання
    if (!showDeleted) {
      result = result.filter(item => !item.isDeleted && item.status !== 'deleted');
    }

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
          // Спеціальна обробка для select фільтрів (точне співпадіння)
          if (getFilterType(key) === 'select') {
            result = result.filter(item => {
              if (key === 'currentWarehouse') {
                const warehouseName = item.currentWarehouseName || '';
                const warehouse = item.currentWarehouse || '';
                return warehouseName === filterValue || warehouse === filterValue;
              }
              if (key === 'status') {
                const statusLabel = getStatusLabel(item.status || '');
                return statusLabel === filterValue;
              }
              if (key === 'reservationStatus') {
                const reservationStatus = getReservationStatusLabel(item);
                return reservationStatus === filterValue;
              }
              if (key === 'itemKind') {
                const kind = filterValue === 'Товари' ? 'equipment' : filterValue === 'Деталі' ? 'parts' : null;
                return kind ? (item.itemKind || 'equipment') === kind : true;
              }
              const itemValue = item[key];
              return String(itemValue || '') === filterValue;
            });
          } else {
            // Текстовий фільтр (часткове співпадіння)
            const filterLower = filterValue.toLowerCase();
            result = result.filter(item => {
              const itemValue = item[key];
              if (itemValue == null) return false;
              return String(itemValue).toLowerCase().includes(filterLower);
            });
          }
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

    // Групування партій за типом та складом
    const groups = {};
    const singleItems = [];
    
    result.forEach(item => {
      if (item.isBatch && item.batchId && item.status === 'in_stock') {
        const key = `${item.batchId}-${item.currentWarehouse || item.currentWarehouseName}`;
        if (!groups[key]) {
          groups[key] = {
            ...item,
            _id: `batch-${key}`, // Унікальний ID для групи
            batchItems: [],
            batchCount: 0,
            isGrouped: true
          };
        }
        groups[key].batchItems.push(item);
        groups[key].batchCount++;
      } else {
        singleItems.push(item);
      }
    });
    
    // Об'єднуємо групи та одиничні елементи
    return [...Object.values(groups), ...singleItems];
  }, [equipment, filter, columnFilters, sortField, sortDirection, showDeleted]);

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
    
    if (key === 'reservationStatus') {
      return value === 'reserved' ? 'Зарезервовано' : 'Вільне';
    }
    
    return String(value);
  };

  const getTestingStatusLabel = (status) => {
    const labels = {
      'none': 'Не тестувалось',
      'requested': 'Очікує',
      'in_progress': 'В роботі',
      'completed': 'Пройдено',
      'failed': 'Не пройшло'
    };
    return labels[status] || status || 'Не тестувалось';
  };

  const getTestingStatusClass = (status) => {
    const classes = {
      'none': 'testing-none',
      'requested': 'testing-requested',
      'in_progress': 'testing-progress',
      'completed': 'testing-completed',
      'failed': 'testing-failed'
    };
    return classes[status] || 'testing-none';
  };

  const getStatusClass = (status) => {
    return `status-${status}`;
  };

  const handleRowClick = (item) => {
    // Якщо це група партії, використовуємо перший елемент з batchItems
    let equipmentToEdit = item;
    if (item.isGrouped && item.batchItems && item.batchItems.length > 0) {
      equipmentToEdit = item.batchItems[0];
    }
    setSelectedEquipment(equipmentToEdit);
    setShowEditModal(true);
  };

  const handleEdit = (item, e) => {
    e.stopPropagation();
    
    // Якщо це група партії, використовуємо перший елемент з batchItems
    if (item.isGrouped && item.batchItems && item.batchItems.length > 0) {
      // Беремо перший елемент партії для редагування
      setSelectedEquipment(item.batchItems[0]);
    } else {
      setSelectedEquipment(item);
    }
    setShowEditModal(true);
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    setSelectedEquipment(null);
    refreshEquipment();
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
        <div className="equipment-table-wrapper-inner">
          <table className="equipment-table">
          <thead>
            {/* Рядок заголовків */}
            <tr>
              <th className="th-actions" style={{ width: '150px', minWidth: '150px' }} rowSpan={showFilters ? 2 : 1}>
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
                    <div className="action-buttons" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '3px' }}>
                      {showReserveAction && onReserve && (
                        <button
                          className="btn-action btn-reserve"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Якщо це група партії, використовуємо перший елемент з batchItems
                            if (item.isGrouped && item.batchItems && item.batchItems.length > 0) {
                              onReserve(item.batchItems[0]);
                            } else {
                              onReserve(item);
                            }
                          }}
                          title="Резервувати"
                          disabled={item.status === 'reserved'}
                          style={{
                            opacity: item.status === 'reserved' ? 0.5 : 1,
                            cursor: item.status === 'reserved' ? 'not-allowed' : 'pointer'
                          }}
                        >
                          🔒 Резервувати
                        </button>
                      )}
                      {showReserveAction && onRequestTesting && (
                        <button
                          className="btn-action btn-test"
                          onClick={(e) => {
                            e.stopPropagation();
                            const eq = item.isGrouped && item.batchItems && item.batchItems.length > 0 
                              ? item.batchItems[0] 
                              : item;
                            onRequestTesting(eq);
                          }}
                          title="Подати на тест"
                          disabled={item.testingStatus === 'requested' || item.testingStatus === 'in_progress'}
                          style={{
                            opacity: (item.testingStatus === 'requested' || item.testingStatus === 'in_progress') ? 0.5 : 1
                          }}
                        >
                          🧪 На тест
                        </button>
                      )}
                      {(user?.role === 'admin' || user?.role === 'administrator') && (
                        <button
                          className="btn-action btn-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Якщо це група партії, використовуємо перший елемент з batchItems
                            if (item.isGrouped && item.batchItems && item.batchItems.length > 0) {
                              setSelectedEquipment(item.batchItems[0]);
                            } else {
                              setSelectedEquipment(item);
                            }
                            setShowDeleteModal(true);
                          }}
                          title="Видалити"
                        >
                          🗑️ Видалити
                        </button>
                      )}
                    </div>
                  </td>
                  <td>{item.itemKind === 'parts' ? 'Деталі' : 'Товари'}</td>
                  <td>
                    <span className={`status-badge ${getStatusClass(item.status || 'in_stock')}`}>
                      {getStatusLabel(item.status || 'in_stock')}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${getReservationStatusLabel(item) === 'Зарезервовано' ? 'status-reserved' : 'status-in_stock'}`}>
                      {getReservationStatusLabel(item)}
                    </span>
                  </td>
                  <td className="cell-truncate" title={formatValue(item.manufacturer, 'manufacturer')}>
                    {formatValue(item.manufacturer, 'manufacturer')}
                  </td>
                  <td className="cell-truncate" title={item.isGrouped && item.batchCount ? `${formatValue(item.type, 'type')} × ${item.batchCount} шт.` : formatValue(item.type, 'type')}>
                    {item.isGrouped && item.batchCount ? (
                      <span style={{ fontWeight: 'bold' }}>
                        {formatValue(item.type, 'type')} × {item.batchCount} шт.
                      </span>
                    ) : (
                      formatValue(item.type, 'type')
                    )}
                  </td>
                  <td>
                    {item.quantity && item.quantity > 1 ? (
                      <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                        {item.quantity} шт.
                      </span>
                    ) : (
                      '1 шт.'
                    )}
                  </td>
                  <td>
                    {item.isGrouped && item.batchCount ? (
                      <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                        Партія: {item.batchCount} шт.
                      </span>
                    ) : (
                      formatValue(item.serialNumber, 'serialNumber')
                    )}
                  </td>
                  <td className="cell-truncate" title={formatValue(item.currentWarehouseName || item.currentWarehouse, 'currentWarehouse')}>
                    {formatValue(item.currentWarehouseName || item.currentWarehouse, 'currentWarehouse')}
                  </td>
                  <td className="cell-truncate" title={formatValue(item.reservationClientName, 'reservationClientName')}>
                    {formatValue(item.reservationClientName, 'reservationClientName')}
                  </td>
                  <td className="cell-truncate" title={formatValue(item.reservedByName, 'reservedByName')}>
                    {formatValue(item.reservedByName, 'reservedByName')}
                  </td>
                  <td>
                    <span className={`status-badge ${getTestingStatusClass(item.testingStatus)}`}>
                      {getTestingStatusLabel(item.testingStatus)}
                    </span>
                  </td>
                  <td>
                    {item.testingDate ? new Date(item.testingDate).toLocaleDateString('uk-UA') : '—'}
                  </td>
                  <td>{formatValue(item.standbyPower, 'standbyPower')}</td>
                  <td>{formatValue(item.primePower, 'primePower')}</td>
                  <td>{formatValue(item.phase, 'phases')}</td>
                  <td>{formatValue(item.voltage, 'voltage')}</td>
                  <td>{formatValue(item.amperage, 'current')}</td>
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

      {showEditModal && selectedEquipment && (
        <EquipmentEditModal
          equipment={selectedEquipment}
          warehouses={warehouses}
          user={user}
          readOnly={showReserveAction}
          onClose={() => {
            setShowEditModal(false);
            setSelectedEquipment(null);
          }}
          onSuccess={handleEditSuccess}
          onReserve={showReserveAction && onReserve ? async (id) => {
            await onReserve(selectedEquipment);
            setShowEditModal(false);
            setSelectedEquipment(null);
          } : null}
          onCancelReserve={showReserveAction && onReserve ? async (id) => {
            // Тут потрібен cancelReserve, але поки використаємо onReserve для toggle
            try {
              const token = localStorage.getItem('token');
              await fetch(`${API_BASE_URL}/equipment/${id}/cancel-reserve`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });
              refreshEquipment();
            } catch (err) {
              console.error('Помилка скасування резервування:', err);
            }
          } : null}
        />
      )}
    </div>
  );
});

export default EquipmentList;
