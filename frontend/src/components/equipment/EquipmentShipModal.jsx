import React, { useState } from 'react';
import API_BASE_URL from '../../config';
import './EquipmentShipModal.css';

function EquipmentShipModal({ equipment, onClose, onSuccess }) {
  const [shippedTo, setShippedTo] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientEdrpou, setClientEdrpou] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Захист від null
  if (!equipment) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🚚 Відвантаження обладнання</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            <p>Будь ласка, виберіть обладнання з таблиці для відвантаження.</p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Закрити
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!shippedTo) {
      setError('Вкажіть замовника');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_BASE_URL}/equipment/${equipment._id}/ship`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shippedTo: shippedTo,
          orderNumber: orderNumber,
          invoiceNumber: invoiceNumber,
          clientEdrpou: clientEdrpou
        })
      });

      if (response.ok) {
        onSuccess && onSuccess();
        onClose();
      } else {
        const data = await response.json();
        setError(data.error || 'Помилка відвантаження');
      }
    } catch (error) {
      console.error('Помилка відвантаження:', error);
      setError('Помилка відвантаження обладнання');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🚚 Відвантаження обладнання</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="equipment-info">
            <p><strong>Тип:</strong> {equipment.type || '—'}</p>
            <p><strong>Серійний номер:</strong> {equipment.serialNumber || '—'}</p>
            <p><strong>Склад:</strong> {equipment.currentWarehouseName || equipment.currentWarehouse || '—'}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Замовник *</label>
              <input
                type="text"
                value={shippedTo}
                onChange={(e) => setShippedTo(e.target.value)}
                placeholder="Назва компанії або ПІБ"
                required
              />
            </div>

            <div className="form-group">
              <label>ЄДРПОУ</label>
              <input
                type="text"
                value={clientEdrpou}
                onChange={(e) => setClientEdrpou(e.target.value)}
                placeholder="12345678"
              />
            </div>

            <div className="form-group">
              <label>Номер замовлення</label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="ORD-12345"
              />
            </div>

            <div className="form-group">
              <label>Номер рахунку</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-12345"
              />
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Скасувати
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Відвантаження...' : 'Відвантажити'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EquipmentShipModal;

