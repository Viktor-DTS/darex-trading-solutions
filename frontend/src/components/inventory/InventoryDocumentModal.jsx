import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './DocumentModal.css';

function InventoryDocumentModal({ document, warehouses, user, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    documentDate: new Date().toISOString().split('T')[0],
    warehouse: '',
    warehouseName: '',
    inventoryDate: new Date().toISOString().split('T')[0],
    items: [],
    notes: '',
    status: 'draft'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [warehouseEquipment, setWarehouseEquipment] = useState([]);

  useEffect(() => {
    if (document) {
      setFormData({
        documentDate: document.documentDate ? new Date(document.documentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        warehouse: document.warehouse || '',
        warehouseName: document.warehouseName || '',
        inventoryDate: document.inventoryDate ? new Date(document.inventoryDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        items: document.items || [],
        notes: document.notes || '',
        status: document.status || 'draft'
      });
      setSelectedEquipment(document.items || []);
    }
  }, [document]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === 'warehouse') {
      const warehouse = warehouses.find(w => w._id === value);
      if (warehouse) {
        setFormData(prev => ({ ...prev, warehouseName: warehouse.name }));
        loadWarehouseEquipment(value);
      }
    }
  };

  const loadWarehouseEquipment = async (warehouseId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment?warehouse=${warehouseId}&status=in_stock`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setWarehouseEquipment(data);
        
        // Якщо це новий документ, автоматично додаємо все обладнання зі складу
        if (!document && data.length > 0) {
          const items = data.map(eq => ({
            equipmentId: eq._id,
            type: eq.type || '',
            serialNumber: eq.serialNumber || '',
            quantityInSystem: eq.quantity || 1,
            quantityActual: eq.quantity || 1,
            difference: 0,
            notes: ''
          }));
          setSelectedEquipment(items);
        }
      }
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    }
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...selectedEquipment];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'quantityActual') {
      const actual = parseFloat(value) || 0;
      const system = parseFloat(updated[index].quantityInSystem || 0);
      updated[index].difference = actual - system;
    }
    
    setSelectedEquipment(updated);
    setFormData(prev => ({ ...prev, items: updated }));
  };

  const handleAddItem = () => {
    setSelectedEquipment([...selectedEquipment, {
      equipmentId: '',
      type: '',
      serialNumber: '',
      quantityInSystem: 0,
      quantityActual: 0,
      difference: 0,
      notes: ''
    }]);
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
          quantityInSystem: eq.quantity || 1,
          quantityActual: eq.quantity || 1,
          difference: 0
        };
        setSelectedEquipment(updated);
        setFormData(prev => ({ ...prev, items: updated }));
      }
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!formData.warehouse) {
      setError('Оберіть склад');
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
        ? `${API_BASE_URL}/documents/inventory/${document._id}`
        : `${API_BASE_URL}/documents/inventory`;
      
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
          <h2>{document ? 'Редагувати документ інвентаризації' : 'Створити документ інвентаризації'}</h2>
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
            <div className="form-group">
              <label>Склад *</label>
              <select
                name="warehouse"
                value={formData.warehouse}
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
              <label>Дата інвентаризації</label>
              <input
                type="date"
                name="inventoryDate"
                value={formData.inventoryDate}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="items-section">
            <div className="section-header">
              <h3>Позиції інвентаризації</h3>
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
                  <label>В системі</label>
                  <input
                    type="number"
                    value={item.quantityInSystem || 0}
                    readOnly
                    style={{ background: '#f5f5f5' }}
                  />
                </div>
                <div className="form-group">
                  <label>Фактично *</label>
                  <input
                    type="number"
                    min="0"
                    value={item.quantityActual || 0}
                    onChange={(e) => handleItemChange(index, 'quantityActual', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Різниця</label>
                  <input
                    type="number"
                    value={item.difference || 0}
                    readOnly
                    style={{
                      background: item.difference > 0 ? '#d4edda' : item.difference < 0 ? '#f8d7da' : '#f5f5f5',
                      fontWeight: item.difference !== 0 ? 'bold' : 'normal'
                    }}
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
            <label>Статус</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="draft">Чернетка</option>
              <option value="in_progress">В процесі</option>
              <option value="completed">Завершено</option>
              <option value="cancelled">Скасовано</option>
            </select>
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

export default InventoryDocumentModal;

