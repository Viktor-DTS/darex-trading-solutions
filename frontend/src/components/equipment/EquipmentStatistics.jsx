import React, { useState, useEffect, useRef, useMemo } from 'react';
import API_BASE_URL from '../../config';
import './EquipmentStatistics.css';

function EquipmentStatistics({ warehouses }) {
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [warehouseMenuOpen, setWarehouseMenuOpen] = useState(false);
  const warehouseSelectRef = useRef(null);
  const [filters, setFilters] = useState({
    warehouse: '',
    region: ''
  });

  const warehouseTriggerLabel = useMemo(() => {
    if (!filters.warehouse) return 'Всі склади';
    const w = (warehouses || []).find(
      (x) => String(x._id || x.name) === String(filters.warehouse)
    );
    return w?.name || 'Всі склади';
  }, [filters.warehouse, warehouses]);

  useEffect(() => {
    loadStatistics();
  }, [filters]);

  useEffect(() => {
    if (!warehouseMenuOpen) return;
    const onDocMouseDown = (e) => {
      if (warehouseSelectRef.current && !warehouseSelectRef.current.contains(e.target)) {
        setWarehouseMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setWarehouseMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [warehouseMenuOpen]);

  const loadStatistics = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.warehouse) params.append('warehouse', filters.warehouse);
      if (filters.region) params.append('region', filters.region);

      const response = await fetch(`${API_BASE_URL}/equipment/statistics?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setStatistics(data);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Помилка завантаження статистики' }));
        console.error('Помилка завантаження статистики:', response.status, errorData);
        setStatistics(null); // Встановлюємо null, щоб показати повідомлення про помилку
      }
    } catch (error) {
      console.error('Помилка завантаження статистики:', error);
      setStatistics(null); // Встановлюємо null, щоб показати повідомлення про помилку
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

  return (
    <div className="equipment-statistics-page">
      {loading ? (
        <div className="statistics-loading">Завантаження статистики...</div>
      ) : !statistics ? (
        <div className="statistics-error">Помилка завантаження статистики</div>
      ) : (
        <div className="equipment-statistics">
      <div className="statistics-header">
        <h2>📊 Статистика обладнання</h2>
        <div className="statistics-filters" ref={warehouseSelectRef}>
          <div className={`statistics-custom-select ${warehouseMenuOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="statistics-custom-select-trigger"
              aria-expanded={warehouseMenuOpen}
              aria-haspopup="listbox"
              onClick={() => setWarehouseMenuOpen((o) => !o)}
            >
              <span className="statistics-custom-select-value">{warehouseTriggerLabel}</span>
              <span className="statistics-custom-select-chevron" aria-hidden>
                ▾
              </span>
            </button>
            {warehouseMenuOpen && (
              <ul className="statistics-custom-select-menu" role="listbox">
                <li
                  role="option"
                  aria-selected={filters.warehouse === ''}
                  className={filters.warehouse === '' ? 'is-active' : ''}
                  onClick={() => {
                    setFilters({ ...filters, warehouse: '' });
                    setWarehouseMenuOpen(false);
                  }}
                >
                  Всі склади
                </li>
                {(warehouses || []).map((w) => {
                  const val = String(w._id || w.name);
                  const selected = String(filters.warehouse) === val;
                  return (
                    <li
                      key={val}
                      role="option"
                      aria-selected={selected}
                      className={selected ? 'is-active' : ''}
                      onClick={() => {
                        setFilters({ ...filters, warehouse: val });
                        setWarehouseMenuOpen(false);
                      }}
                    >
                      {w.name}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Загальна статистика */}
      <div className="stats-grid">
        <div className="stat-card total">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <div className="stat-label">Всього обладнання</div>
            <div className="stat-value">{statistics.total || 0}</div>
          </div>
        </div>

        {Object.entries(statistics.byStatus || {}).map(([status, count]) => (
          <div key={status} className={`stat-card status-${status}`}>
            <div className="stat-icon">
              {status === 'in_stock' && '✅'}
              {status === 'in_transit' && '🚚'}
              {status === 'shipped' && '📤'}
              {status === 'reserved' && '🔒'}
            </div>
            <div className="stat-content">
              <div className="stat-label">{getStatusLabel(status)}</div>
              <div className="stat-value">{count}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Статистика по складах */}
      {statistics.byWarehouse && statistics.byWarehouse.length > 0 && (
        <div className="statistics-section">
          <h3>📋 По складах</h3>
          <div className="warehouse-stats">
            {statistics.byWarehouse.map((warehouse, index) => (
              <div key={index} className="warehouse-stat-card">
                <div className="warehouse-name">{warehouse.warehouse || 'Без назви'}</div>
                <div className="warehouse-stats-grid">
                  <div className="warehouse-stat-item">
                    <span className="warehouse-stat-label">Всього:</span>
                    <span className="warehouse-stat-value">{warehouse.total || 0}</span>
                  </div>
                  <div className="warehouse-stat-item">
                    <span className="warehouse-stat-label">На складі:</span>
                    <span className="warehouse-stat-value success">{warehouse.inStock || 0}</span>
                  </div>
                  <div className="warehouse-stat-item">
                    <span className="warehouse-stat-label">В дорозі:</span>
                    <span className="warehouse-stat-value warning">{warehouse.inTransit || 0}</span>
                  </div>
                  <div className="warehouse-stat-item">
                    <span className="warehouse-stat-label">Відвантажено:</span>
                    <span className="warehouse-stat-value info">{warehouse.shipped || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Топ типів обладнання */}
      {statistics.byType && statistics.byType.length > 0 && (
        <div className="statistics-section">
          <h3>🔧 Популярні типи обладнання</h3>
          <div className="type-stats">
            {statistics.byType.map((type, index) => (
              <div key={index} className="type-stat-item">
                <div className="type-name">{type._id || 'Без типу'}</div>
                <div className="type-bar">
                  <div 
                    className="type-bar-fill" 
                    style={{ width: `${(type.count / statistics.total) * 100}%` }}
                  />
                </div>
                <div className="type-count">{type.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Останні додані */}
      {statistics.recentlyAdded && statistics.recentlyAdded.length > 0 && (
        <div className="statistics-section">
          <h3>🆕 Останні додані</h3>
          <div className="recent-equipment">
            {statistics.recentlyAdded.map((item, index) => (
              <div key={index} className="recent-item">
                <div className="recent-info">
                  <div className="recent-type">{item.type || 'Без типу'}</div>
                  <div className="recent-serial">№{item.serialNumber || '—'}</div>
                </div>
                <div className="recent-meta">
                  <div className="recent-warehouse">{item.currentWarehouseName || '—'}</div>
                  <div className="recent-date">
                    {item.addedAt ? new Date(item.addedAt).toLocaleDateString('uk-UA') : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}

export default EquipmentStatistics;

