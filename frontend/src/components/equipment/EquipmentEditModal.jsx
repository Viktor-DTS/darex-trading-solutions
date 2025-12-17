import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './EquipmentEditModal.css';

function EquipmentEditModal({ equipment, warehouses, onClose, onSuccess }) {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (equipment) {
      setFormData({
        manufacturer: equipment.manufacturer || '',
        type: equipment.type || '',
        serialNumber: equipment.serialNumber || '',
        currentWarehouse: equipment.currentWarehouse || '',
        currentWarehouseName: equipment.currentWarehouseName || '',
        standbyPower: equipment.standbyPower || '',
        primePower: equipment.primePower || '',
        phases: equipment.phase !== undefined ? String(equipment.phase) : '',
        voltage: equipment.voltage || '',
        current: equipment.amperage !== undefined ? String(equipment.amperage) : '',
        rpm: equipment.rpm !== undefined ? String(equipment.rpm) : '',
        dimensions: equipment.dimensions || '',
        weight: equipment.weight !== undefined ? String(equipment.weight) : '',
        manufactureDate: equipment.manufactureDate ? new Date(equipment.manufactureDate).toISOString().split('T')[0] : ''
      });
    }
  }, [equipment]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Якщо змінюється склад, оновлюємо назву складу
    if (name === 'currentWarehouse') {
      const warehouse = warehouses.find(w => (w._id || w.name) === value);
      if (warehouse) {
        setFormData(prev => ({
          ...prev,
          currentWarehouseName: warehouse.name
        }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Підготовка даних для відправки
      const updateData = { ...formData };
      
      // Обробка дати виробництва - якщо порожня, відправляємо null
      if (!updateData.manufactureDate || updateData.manufactureDate.trim() === '') {
        updateData.manufactureDate = null;
      }
      
      // Очищаємо порожні рядки
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === '') {
          updateData[key] = null;
        }
      });
      
      console.log('[EDIT] Відправка даних:', updateData);
      
      const response = await fetch(`${API_BASE_URL}/equipment/${equipment._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        const updatedEquipment = await response.json();
        console.log('[EDIT] Обладнання оновлено:', updatedEquipment);
        onSuccess();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[EDIT] Помилка відповіді:', response.status, errorData);
        setError(errorData.error || 'Помилка оновлення обладнання');
      }
    } catch (err) {
      setError('Помилка з\'єднання з сервером');
      console.error('[EDIT] Помилка оновлення обладнання:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!equipment) return null;

  return (
    <div className="equipment-edit-modal-overlay" onClick={onClose}>
      <div className="equipment-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="equipment-edit-header">
          <h2>Редагувати обладнання</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="equipment-edit-form">
          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          <div className="form-section">
            <h3>Основна інформація</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Виробник</label>
                <input
                  type="text"
                  name="manufacturer"
                  value={formData.manufacturer}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Тип обладнання *</label>
                <input
                  type="text"
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Серійний номер *</label>
                <input
                  type="text"
                  name="serialNumber"
                  value={formData.serialNumber}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Склад *</label>
                <select
                  name="currentWarehouse"
                  value={formData.currentWarehouse}
                  onChange={handleChange}
                  required
                >
                  <option value="">Виберіть склад</option>
                  {warehouses.map(w => (
                    <option key={w._id || w.name} value={w._id || w.name}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Технічні характеристики</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Резервна потужність</label>
                <input
                  type="text"
                  name="standbyPower"
                  value={formData.standbyPower}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Основна потужність</label>
                <input
                  type="text"
                  name="primePower"
                  value={formData.primePower}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Фази</label>
                <input
                  type="text"
                  name="phases"
                  value={formData.phases}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Напруга</label>
                <input
                  type="text"
                  name="voltage"
                  value={formData.voltage}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Струм (A)</label>
                <input
                  type="text"
                  name="current"
                  value={formData.current}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>RPM</label>
                <input
                  type="text"
                  name="rpm"
                  value={formData.rpm}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Фізичні параметри</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Розміри (мм)</label>
                <input
                  type="text"
                  name="dimensions"
                  value={formData.dimensions}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Вага (кг)</label>
                <input
                  type="text"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Дата виробництва</label>
                <input
                  type="date"
                  name="manufactureDate"
                  value={formData.manufactureDate}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="equipment-edit-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Скасувати
            </button>
            <button type="submit" className="btn-save" disabled={loading}>
              {loading ? 'Збереження...' : 'Зберегти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EquipmentEditModal;

