import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './DocumentModal.css';

function ShipmentDocumentModal({ document, warehouses, user, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    documentDate: new Date().toISOString().split('T')[0],
    shippedTo: '',
    clientEdrpou: '',
    clientAddress: '',
    invoiceRecipientDetails: '',
    warehouse: '',
    warehouseName: '',
    items: [],
    orderNumber: '',
    invoiceNumber: '',
    totalAmount: 0,
    currency: 'грн.',
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
        shippedTo: document.shippedTo || '',
        clientEdrpou: document.clientEdrpou || '',
        clientAddress: document.clientAddress || '',
        invoiceRecipientDetails: document.invoiceRecipientDetails || '',
        warehouse: document.warehouse || '',
        warehouseName: document.warehouseName || '',
        items: document.items || [],
        orderNumber: document.orderNumber || '',
        invoiceNumber: document.invoiceNumber || '',
        totalAmount: document.totalAmount || 0,
        currency: document.currency || 'грн.',
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
      }
    }
  };

  const handleAddItem = () => {
    setSelectedEquipment([...selectedEquipment, {
      equipmentId: '',
      type: '',
      serialNumber: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      batchId: '',
      notes: ''
    }]);
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...selectedEquipment];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'quantity' || field === 'unitPrice') {
      const qty = parseFloat(updated[index].quantity || 1);
      const price = parseFloat(updated[index].unitPrice || 0);
      updated[index].totalPrice = qty * price;
    }
    
    setSelectedEquipment(updated);
    updateTotalAmount(updated);
  };

  const handleRemoveItem = (index) => {
    const updated = selectedEquipment.filter((_, i) => i !== index);
    setSelectedEquipment(updated);
    updateTotalAmount(updated);
  };

  const updateTotalAmount = (items) => {
    const total = items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
    setFormData(prev => ({ ...prev, totalAmount: total, items }));
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
          batchName: eq.batchName || '',
          unitPrice: eq.batchPriceWithVAT || 0,
          quantity: eq.quantity || 1
        };
        updated[index].totalPrice = (updated[index].quantity || 1) * (updated[index].unitPrice || 0);
        setSelectedEquipment(updated);
        updateTotalAmount(updated);
      }
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!formData.shippedTo) {
      setError('Вкажіть назву клієнта');
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
        items: selectedEquipment,
        totalAmount: selectedEquipment.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
      };

      const url = document 
        ? `${API_BASE_URL}/documents/shipment/${document._id}`
        : `${API_BASE_URL}/documents/shipment`;
      
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
          <h2>{document ? 'Редагувати документ відвантаження' : 'Створити документ відвантаження'}</h2>
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
              <label>Склад</label>
              <select
                name="warehouse"
                value={formData.warehouse}
                onChange={handleChange}
              >
                <option value="">Оберіть склад</option>
                {warehouses.map(w => (
                  <option key={w._id} value={w._id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Клієнт (назва) *</label>
              <input
                type="text"
                name="shippedTo"
                value={formData.shippedTo}
                onChange={handleChange}
                placeholder="Назва клієнта"
                required
              />
            </div>
            <div className="form-group">
              <label>ЄДРПОУ клієнта</label>
              <input
                type="text"
                name="clientEdrpou"
                value={formData.clientEdrpou}
                onChange={handleChange}
                placeholder="ЄДРПОУ"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Адреса клієнта</label>
            <input
              type="text"
              name="clientAddress"
              value={formData.clientAddress}
              onChange={handleChange}
              placeholder="Адреса доставки"
            />
          </div>

          <div className="form-group">
            <label>Реквізити отримувача рахунку</label>
            <textarea
              name="invoiceRecipientDetails"
              value={formData.invoiceRecipientDetails}
              onChange={handleChange}
              rows="3"
              placeholder="Реквізити для рахунку"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Номер замовлення</label>
              <input
                type="text"
                name="orderNumber"
                value={formData.orderNumber}
                onChange={handleChange}
                placeholder="Номер замовлення"
              />
            </div>
            <div className="form-group">
              <label>Номер рахунку</label>
              <input
                type="text"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleChange}
                placeholder="Номер рахунку"
              />
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
                    onChange={(e) => {
                      const eqId = e.target.value;
                      handleEquipmentSelect(index, eqId);
                    }}
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
                <div className="form-group">
                  <label>Ціна за одиницю</label>
                  <input
                    type="number"
                    step="0.01"
                    value={item.unitPrice || 0}
                    onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Сума</label>
                  <input type="number" value={item.totalPrice || 0} readOnly />
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

          <div className="form-row">
            <div className="form-group">
              <label>Валюта</label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
              >
                <option value="грн.">грн.</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div className="form-group">
              <label>Загальна сума</label>
              <input
                type="number"
                value={formData.totalAmount.toFixed(2)}
                readOnly
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
                <option value="shipped">Відвантажено</option>
                <option value="delivered">Доставлено</option>
                <option value="cancelled">Скасовано</option>
              </select>
            </div>
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

export default ShipmentDocumentModal;

