import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './EquipmentShipModal.css';

function EquipmentShipModal({ equipment, onClose, onSuccess }) {
  const [selectedEquipment, setSelectedEquipment] = useState(equipment);
  const [equipmentList, setEquipmentList] = useState([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [shippedTo, setShippedTo] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientEdrpou, setClientEdrpou] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Завантаження списку обладнання, якщо не передано
  useEffect(() => {
    if (!equipment) {
      loadEquipment();
    } else {
      setSelectedEquipment(equipment);
    }
  }, [equipment]);

  const loadEquipment = async () => {
    setLoadingEquipment(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment?status=in_stock`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setEquipmentList(data.filter(eq => !eq.deleted));
      }
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    } finally {
      setLoadingEquipment(false);
    }
  };

  // Якщо обладнання не вибрано - показуємо список для вибору
  if (!selectedEquipment) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content equipment-select-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🚚 Відвантаження обладнання</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body">
            <p>Будь ласка, виберіть обладнання для відвантаження:</p>
            {loadingEquipment ? (
              <div className="loading-message">Завантаження...</div>
            ) : equipmentList.length === 0 ? (
              <div className="empty-message">Немає доступного обладнання</div>
            ) : (
              <div className="equipment-select-list">
                {equipmentList.map(eq => (
                  <div
                    key={eq._id}
                    className="equipment-select-item"
                    onClick={() => setSelectedEquipment(eq)}
                  >
                    <div className="equipment-select-info">
                      <strong>{eq.type || '—'}</strong>
                      <span>Серійний номер: {eq.serialNumber || '—'}</span>
                      <span>Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Скасувати
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
      
      const response = await fetch(`${API_BASE_URL}/equipment/${selectedEquipment._id}/ship`, {
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
            <p><strong>Тип:</strong> {selectedEquipment.type || '—'}</p>
            <p><strong>Серійний номер:</strong> {selectedEquipment.serialNumber || '—'}</p>
            <p><strong>Склад:</strong> {selectedEquipment.currentWarehouseName || selectedEquipment.currentWarehouse || '—'}</p>
          </div>

          {!equipment && (
            <div className="form-group">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedEquipment(null)}
                style={{ marginBottom: '12px' }}
              >
                ← Вибрати інше обладнання
              </button>
            </div>
          )}

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

