import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './EquipmentList.css';

function EquipmentList({ user, warehouses, onMove, onShip }) {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    warehouse: '',
    status: '',
    search: ''
  });

  useEffect(() => {
    loadEquipment();
  }, [filters]);

  const loadEquipment = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.warehouse) params.append('warehouse', filters.warehouse);
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);

      const response = await fetch(`${API_BASE_URL}/equipment?${params}`, {
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

  return (
    <div className="equipment-list">
      <div className="equipment-filters">
        <div className="filter-group">
          <label>Склад</label>
          <select
            value={filters.warehouse}
            onChange={(e) => setFilters({ ...filters, warehouse: e.target.value })}
          >
            <option value="">Всі склади</option>
            {warehouses.map(w => (
              <option key={w._id || w.name} value={w._id || w.name}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Статус</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Всі статуси</option>
            <option value="in_stock">На складі</option>
            <option value="reserved">Зарезервовано</option>
            <option value="in_transit">В дорозі</option>
            <option value="shipped">Відвантажено</option>
          </select>
        </div>

        <div className="filter-group filter-search">
          <label>Пошук</label>
          <input
            type="text"
            placeholder="Серійний номер, тип..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading">Завантаження...</div>
      ) : equipment.length === 0 ? (
        <div className="empty-state">
          <p>Обладнання не знайдено</p>
        </div>
      ) : (
        <div className="equipment-grid">
          {equipment.map(item => (
            <div key={item._id} className="equipment-card">
              <div className="card-header">
                <h3>{item.type || 'Без типу'}</h3>
                <span className={`status-badge ${getStatusClass(item.status)}`}>
                  {getStatusLabel(item.status)}
                </span>
              </div>

              <div className="card-body">
                <div className="card-field">
                  <span className="field-label">Серійний номер:</span>
                  <span className="field-value">{item.serialNumber || '—'}</span>
                </div>

                <div className="card-field">
                  <span className="field-label">Склад:</span>
                  <span className="field-value">{item.currentWarehouseName || item.currentWarehouse || '—'}</span>
                </div>

                {item.standbyPower && (
                  <div className="card-field">
                    <span className="field-label">Резервна потужність:</span>
                    <span className="field-value">{item.standbyPower}</span>
                  </div>
                )}

                {item.primePower && (
                  <div className="card-field">
                    <span className="field-label">Основна потужність:</span>
                    <span className="field-value">{item.primePower}</span>
                  </div>
                )}

                {item.voltage && (
                  <div className="card-field">
                    <span className="field-label">Напруга:</span>
                    <span className="field-value">{item.voltage}V</span>
                  </div>
                )}
              </div>

              <div className="card-actions">
                {item.status === 'in_stock' && (
                  <>
                    <button
                      className="btn-action btn-move"
                      onClick={() => onMove && onMove(item)}
                    >
                      📦 Перемістити
                    </button>
                    <button
                      className="btn-action btn-ship"
                      onClick={() => onShip && onShip(item)}
                    >
                      🚚 Відвантажити
                    </button>
                  </>
                )}
                {item.status === 'in_transit' && (
                  <button
                    className="btn-action btn-arrived"
                    onClick={async () => {
                      const token = localStorage.getItem('token');
                      await fetch(`${API_BASE_URL}/equipment/${item._id}/status`, {
                        method: 'PUT',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ status: 'in_stock' })
                      });
                      loadEquipment();
                    }}
                  >
                    ✅ Прибуло
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default EquipmentList;

