import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './WarehouseManagement.css';

function WarehouseManagement({ user }) {
  const [warehouses, setWarehouses] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    region: '',
    address: ''
  });
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    loadWarehouses();
    loadRegions();
  }, []);

  const loadRegions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/regions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        // Регіони можуть приходити як масив об'єктів {name} або масив рядків
        const regionNames = data.map(r => r.name || r).filter(r => r && r !== 'Україна');
        setRegions(regionNames);
      } else {
        // Fallback регіони
        setRegions(['Київський', 'Дніпровський', 'Львівський', 'Хмельницький']);
      }
    } catch (error) {
      console.error('Помилка завантаження регіонів:', error);
      // Fallback регіони
      setRegions(['Київський', 'Дніпровський', 'Львівський', 'Хмельницький']);
    }
  };

  const loadWarehouses = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/warehouses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setWarehouses(data);
      }
    } catch (error) {
      console.error('Помилка завантаження складів:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (warehouse = null) => {
    if (warehouse) {
      setEditingWarehouse(warehouse);
      setFormData({
        name: warehouse.name || '',
        region: warehouse.region || '',
        address: warehouse.address || ''
      });
    } else {
      setEditingWarehouse(null);
      setFormData({ name: '', region: '', address: '' });
    }
    setErrors([]);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingWarehouse(null);
    setFormData({ name: '', region: '', address: '' });
    setErrors([]);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);

    if (!formData.name.trim()) {
      setErrors(['Назва складу обов\'язкова']);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const url = editingWarehouse 
        ? `${API_BASE_URL}/warehouses/${editingWarehouse._id}`
        : `${API_BASE_URL}/warehouses`;
      
      const method = editingWarehouse ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        handleCloseModal();
        loadWarehouses();
      } else {
        const error = await response.json();
        setErrors([error.error || 'Помилка збереження']);
      }
    } catch (error) {
      console.error('Помилка збереження:', error);
      setErrors(['Помилка збереження складу']);
    }
  };

  const handleDelete = async (warehouseId) => {
    // Перевірка прав - тільки адміністратори можуть видаляти
    if (user?.role !== 'admin' && user?.role !== 'administrator') {
      alert('Тільки адміністратор може видаляти склади');
      return;
    }
    
    if (!window.confirm('Ви впевнені, що хочете видалити цей склад?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/warehouses/${warehouseId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        loadWarehouses();
      } else {
        const error = await response.json();
        alert(error.error || 'Помилка видалення складу');
      }
    } catch (error) {
      console.error('Помилка видалення:', error);
      alert('Помилка видалення складу');
    }
  };

  const handleToggleActive = async (warehouse) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/warehouses/${warehouse._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !warehouse.isActive })
      });

      if (response.ok) {
        loadWarehouses();
      }
    } catch (error) {
      console.error('Помилка оновлення:', error);
    }
  };

  return (
    <div className="warehouse-management">
      <div className="management-header">
        <h2>🏢 Управління складами</h2>
        <button className="btn-primary" onClick={() => handleOpenModal()}>
          ➕ Додати склад
        </button>
      </div>

      {loading ? (
        <div className="loading">Завантаження...</div>
      ) : warehouses.length === 0 ? (
        <div className="empty-state">
          <p>Складів не знайдено</p>
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            Додати перший склад
          </button>
        </div>
      ) : (
        <div className="warehouses-grid">
          {warehouses.map(warehouse => (
            <div key={warehouse._id} className={`warehouse-card ${!warehouse.isActive ? 'inactive' : ''}`}>
              <div className="warehouse-card-header">
                <h3>{warehouse.name}</h3>
                <span className={`status-badge ${warehouse.isActive ? 'active' : 'inactive'}`}>
                  {warehouse.isActive ? 'Активний' : 'Неактивний'}
                </span>
              </div>

              <div className="warehouse-card-body">
                {warehouse.region && (
                  <div className="warehouse-info">
                    <span className="info-label">Регіон:</span>
                    <span className="info-value">{warehouse.region}</span>
                  </div>
                )}
                {warehouse.address && (
                  <div className="warehouse-info">
                    <span className="info-label">Адреса:</span>
                    <span className="info-value">{warehouse.address}</span>
                  </div>
                )}
                <div className="warehouse-info">
                  <span className="info-label">Створено:</span>
                  <span className="info-value">
                    {warehouse.createdAt ? new Date(warehouse.createdAt).toLocaleDateString('uk-UA') : '—'}
                  </span>
                </div>
              </div>

              <div className="warehouse-card-actions">
                <button
                  className="btn-action btn-edit"
                  onClick={() => handleOpenModal(warehouse)}
                >
                  ✏️ Редагувати
                </button>
                <button
                  className="btn-action btn-toggle"
                  onClick={() => handleToggleActive(warehouse)}
                >
                  {warehouse.isActive ? '🔒 Деактивувати' : '✅ Активувати'}
                </button>
                {(user?.role === 'admin' || user?.role === 'administrator') && (
                  <button
                    className="btn-action btn-delete"
                    onClick={() => handleDelete(warehouse._id)}
                  >
                    🗑️ Видалити
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingWarehouse ? '✏️ Редагувати склад' : '➕ Додати склад'}</h2>
              <button className="btn-close" onClick={handleCloseModal}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="warehouse-form">
              {errors.length > 0 && (
                <div className="errors">
                  {errors.map((err, i) => (
                    <div key={i} className="error-message">{err}</div>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label>Назва складу *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Назва складу"
                  required
                />
              </div>

              <div className="form-group">
                <label>Регіон</label>
                <select
                  value={formData.region}
                  onChange={(e) => handleInputChange('region', e.target.value)}
                >
                  <option value="">Виберіть регіон</option>
                  {regions.map(region => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Адреса</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="Адреса складу"
                  rows="3"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                  Скасувати
                </button>
                <button type="submit" className="btn-primary">
                  {editingWarehouse ? 'Зберегти' : 'Додати'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default WarehouseManagement;

