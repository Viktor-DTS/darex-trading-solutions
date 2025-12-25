import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './DocumentModal.css';

function MovementDocumentModal({ document, warehouses, user, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    documentDate: new Date().toISOString().split('T')[0],
    fromWarehouse: '',
    fromWarehouseName: '',
    toWarehouse: '',
    toWarehouseName: '',
    items: [],
    reason: '',
    notes: '',
    status: 'draft'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState([]);

  useEffect(() => {
    if (document) {
      setFormData({
        documentDate: document.documentDate ? new Date(document.documentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        fromWarehouse: document.fromWarehouse || '',
        fromWarehouseName: document.fromWarehouseName || '',
        toWarehouse: document.toWarehouse || '',
        toWarehouseName: document.toWarehouseName || '',
        items: document.items || [],
        reason: document.reason || '',
        notes: document.notes || '',
        status: document.status || 'draft'
      });
      setSelectedEquipment(document.items || []);
    }
  }, [document]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === 'fromWarehouse') {
      const warehouse = warehouses.find(w => w._id === value);
      if (warehouse) {
        setFormData(prev => ({ ...prev, fromWarehouseName: warehouse.name }));
      }
    } else if (name === 'toWarehouse') {
      const warehouse = warehouses.find(w => w._id === value);
      if (warehouse) {
        setFormData(prev => ({ ...prev, toWarehouseName: warehouse.name }));
      }
    }
  };

  const handleAddItem = () => {
    setSelectedEquipment([...selectedEquipment, {
      equipmentId: '',
      type: '',
      serialNumber: '',
      quantity: 1,
      batchId: '',
      notes: ''
    }]);
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...selectedEquipment];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedEquipment(updated);
  };

  const handleRemoveItem = (index) => {
    setSelectedEquipment(selectedEquipment.filter((_, i) => i !== index));
  };

  const handleEquipmentSelect = async (index, equipmentId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/${equipmentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const eq = await response.json();
        const updated = [...selectedEquipment];
        updated[index] = {
          ...updated[index],
          equipmentId: eq._id,
          type: eq.type || '',
          serialNumber: eq.serialNumber || '',
          batchId: eq.batchId || '',
          quantity: eq.quantity || 1
        };
        setSelectedEquipment(updated);
      }
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!formData.fromWarehouse || !formData.toWarehouse) {
      setError('Оберіть склади');
      setLoading(false);
      return;
    }

    if (formData.fromWarehouse === formData.toWarehouse) {
      setError('Склади повинні бути різними');
      setLoading(false);
      return;
    }

    if (selectedEquipment.length === 0) {
      setError('Додайте хоча б одну позицію');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const payload = {
        ...formData,
        items: selectedEquipment
      };

      const url = document 
        ? `${API_BASE_URL}/documents/movement/${document._id}`
        : `${API_BASE_URL}/documents/movement`;
      
      const method = document ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Помилка збереження документа');
      }
    } catch (error) {
      console.error('Помилка збереження:', error);
      setError('Помилка збереження документа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="document-modal-overlay" onClick={onClose}>
      <div className="document-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="document-modal-header">
          <h2>{document ? 'Редагувати документ переміщення' : 'Створити документ переміщення'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="document-modal-body">
          {error && <div className="error-message">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label>Дата документа *</label>
              <input
                type="date"
                name="documentDate"
                value={formData.documentDate}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Зі складу *</label>
              <select
                name="fromWarehouse"
                value={formData.fromWarehouse}
                onChange={handleChange}
                required
              >
                <option value="">Оберіть склад</option>
                {warehouses.map(w => (
                  <option key={w._id} value={w._id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>На склад *</label>
              <select
                name="toWarehouse"
                value={formData.toWarehouse}
                onChange={handleChange}
                required
              >
                <option value="">Оберіть склад</option>
                {warehouses.map(w => (
                  <option key={w._id} value={w._id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="items-section">
            <div className="section-header">
              <h3>Позиції товарів</h3>
              <button type="button" className="btn-add-item" onClick={handleAddItem}>
                ➕ Додати позицію
              </button>
            </div>

            {selectedEquipment.map((item, index) => (
              <div key={index} className="item-row">
                <div className="form-group">
                  <label>Обладнання</label>
                  <input
                    type="text"
                    placeholder="ID обладнання"
                    value={item.equipmentId}
                    onChange={(e) => handleEquipmentSelect(index, e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Тип</label>
                  <input type="text" value={item.type || ''} readOnly />
                </div>
                <div className="form-group">
                  <label>Серійний номер</label>
                  <input type="text" value={item.serialNumber || ''} readOnly />
                </div>
                <div className="form-group">
                  <label>Кількість</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity || 1}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn-remove-item"
                  onClick={() => handleRemoveItem(index)}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <div className="form-group">
            <label>Причина переміщення</label>
            <input
              type="text"
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              placeholder="Причина переміщення"
            />
          </div>

          <div className="form-group">
            <label>Примітки</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
            />
          </div>

          <div className="form-group">
            <label>Статус</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="draft">Чернетка</option>
              <option value="in_transit">В дорозі</option>
              <option value="completed">Завершено</option>
              <option value="cancelled">Скасовано</option>
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Скасувати
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Збереження...' : 'Зберегти'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MovementDocumentModal;

