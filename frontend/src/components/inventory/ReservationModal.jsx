import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import { getEdrpouList, getClientData } from '../../utils/edrpouAPI';
import './DocumentModal.css';

function ReservationModal({ reservation, warehouses, user, onClose, onSuccess, preSelectedEquipment = null }) {
  const [formData, setFormData] = useState({
    reservationDate: new Date().toISOString().split('T')[0],
    clientName: '',
    clientEdrpou: '',
    orderNumber: '',
    reservedUntil: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [availableEquipment, setAvailableEquipment] = useState([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [edrpouList, setEdrpouList] = useState([]);
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const isNew = !reservation;
  const hasPreSelectedEquipment = !!preSelectedEquipment;

  useEffect(() => {
    if (reservation) {
      setFormData({
        reservationDate: reservation.reservationDate 
          ? new Date(reservation.reservationDate).toISOString().split('T')[0] 
          : new Date().toISOString().split('T')[0],
        clientName: reservation.clientName || '',
        clientEdrpou: reservation.clientEdrpou || '',
        orderNumber: reservation.orderNumber || '',
        reservedUntil: reservation.reservedUntil 
          ? new Date(reservation.reservedUntil).toISOString().split('T')[0] 
          : '',
        notes: reservation.notes || ''
      });
      setSelectedEquipment(reservation.items || []);
    } else if (preSelectedEquipment) {
      // Якщо передано попередньо вибране обладнання, додаємо його до списку
      const equipmentItem = {
        equipmentId: preSelectedEquipment._id,
        type: preSelectedEquipment.type || '',
        serialNumber: preSelectedEquipment.serialNumber || '',
        quantity: 1,
        warehouse: preSelectedEquipment.currentWarehouse || '',
        warehouseName: preSelectedEquipment.currentWarehouseName || '',
        batchId: preSelectedEquipment.batchId || '',
        notes: ''
      };
      setSelectedEquipment([equipmentItem]);
    }
    if (!reservation && !preSelectedEquipment) {
      loadAvailableEquipment();
    }
    loadEdrpouList();
  }, [preSelectedEquipment]);

  useEffect(() => {
    if (!reservation) {
      loadAvailableEquipment();
    }
  }, [selectedWarehouse, equipmentSearch, selectedEquipment.length]);

  const loadEdrpouList = async () => {
    try {
      const data = await getEdrpouList();
      setEdrpouList(data || []);
    } catch (err) {
      console.error('Помилка завантаження ЄДРПОУ:', err);
    }
  };

  const loadAvailableEquipment = async () => {
    setLoadingEquipment(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('status', 'in_stock');
      if (selectedWarehouse) {
        params.append('warehouse', selectedWarehouse);
      }
      if (equipmentSearch) {
        params.append('search', equipmentSearch);
      }

      const response = await fetch(`${API_BASE_URL}/equipment?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        // Фільтруємо тільки доступне обладнання (не видалене, не зарезервоване, не вже вибране)
        const selectedIds = selectedEquipment.map(sel => sel.equipmentId);
        const available = data.filter(eq => 
          !eq.deleted && 
          eq.status === 'in_stock' &&
          !selectedIds.includes(eq._id)
        );
        setAvailableEquipment(available);
      }
    } catch (error) {
      console.error('Помилка завантаження обладнання:', error);
    } finally {
      setLoadingEquipment(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Автозаповнення даних клієнта по ЄДРПОУ
    if (name === 'clientEdrpou' && value) {
      handleEdrpouChange(value);
    }
  };

  const handleEdrpouChange = async (edrpou) => {
    if (edrpou && edrpou.length >= 8) {
      try {
        const clientData = await getClientData(edrpou);
        if (clientData && clientData.client) {
          setFormData(prev => ({
            ...prev,
            clientName: clientData.client || prev.clientName
          }));
        }
      } catch (error) {
        console.error('Помилка завантаження даних клієнта:', error);
      }
    }
  };

  const handleAddEquipment = (equipment) => {
    const newItem = {
      equipmentId: equipment._id,
      type: equipment.type || '',
      serialNumber: equipment.serialNumber || '',
      quantity: 1,
      warehouse: equipment.currentWarehouse || '',
      warehouseName: equipment.currentWarehouseName || '',
      batchId: equipment.batchId || '',
      notes: ''
    };
    setSelectedEquipment([...selectedEquipment, newItem]);
    // Видаляємо обладнання зі списку доступного
    setAvailableEquipment(prev => prev.filter(eq => eq._id !== equipment._id));
  };

  const handleRemoveEquipment = async (index) => {
    const removed = selectedEquipment[index];
    setSelectedEquipment(prev => prev.filter((_, i) => i !== index));
    // Повертаємо обладнання в список доступного, якщо воно відповідає поточним фільтрам
    if (removed.equipmentId) {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/equipment/${removed.equipmentId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const eq = await response.json();
          // Перевіряємо, чи відповідає обладнання поточним фільтрам
          const matchesWarehouse = !selectedWarehouse || eq.currentWarehouse === selectedWarehouse;
          const matchesSearch = !equipmentSearch || 
            (eq.type && eq.type.toLowerCase().includes(equipmentSearch.toLowerCase())) ||
            (eq.serialNumber && eq.serialNumber.toLowerCase().includes(equipmentSearch.toLowerCase()));
          
          if (matchesWarehouse && matchesSearch && eq.status === 'in_stock' && !eq.deleted) {
            setAvailableEquipment(prev => [...prev, eq]);
          }
        }
      } catch (error) {
        console.error('Помилка завантаження обладнання:', error);
      }
    }
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...selectedEquipment];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedEquipment(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!formData.clientName) {
      setError('Вкажіть назву клієнта');
      setLoading(false);
      return;
    }

    if (selectedEquipment.length === 0) {
      setError('Додайте хоча б одну позицію обладнання');
      setLoading(false);
      return;
    }

    if (!formData.reservedUntil) {
      setError('Вкажіть термін резервування');
      setLoading(false);
      return;
    }

    // Перевірка, що термін резервування не в минулому
    const reservedUntilDate = new Date(formData.reservedUntil);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (reservedUntilDate < today) {
      setError('Термін резервування не може бути в минулому');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const payload = {
        ...formData,
        items: selectedEquipment.map(item => ({
          equipmentId: item.equipmentId,
          type: item.type,
          serialNumber: item.serialNumber,
          quantity: item.quantity || 1,
          warehouse: item.warehouse,
          warehouseName: item.warehouseName,
          batchId: item.batchId,
          notes: item.notes
        }))
      };

      const response = await fetch(`${API_BASE_URL}/reservations`, {
        method: 'POST',
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
        setError(errorData.error || 'Помилка створення резервування');
      }
    } catch (error) {
      console.error('Помилка створення резервування:', error);
      setError('Помилка створення резервування');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="document-modal-overlay" onClick={onClose}>
      <div className="document-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="document-modal-header">
          <h2>{isNew ? 'Створити резервування' : 'Редагувати резервування'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="document-modal-body">
          {error && <div className="error-message">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label>Дата резервування *</label>
              <input
                type="date"
                name="reservationDate"
                value={formData.reservationDate}
                onChange={handleChange}
                required
                readOnly={!isNew}
              />
            </div>
            <div className="form-group">
              <label>Зарезервовано до *</label>
              <input
                type="date"
                name="reservedUntil"
                value={formData.reservedUntil}
                onChange={handleChange}
                required={isNew}
                min={new Date().toISOString().split('T')[0]}
                readOnly={!isNew}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>ЄДРПОУ клієнта</label>
              <input
                type="text"
                name="clientEdrpou"
                value={formData.clientEdrpou}
                onChange={handleChange}
                placeholder="ЄДРПОУ"
                list="edrpou-list"
                readOnly={!isNew}
              />
              <datalist id="edrpou-list">
                {edrpouList.map(edrpou => (
                  <option key={edrpou} value={edrpou} />
                ))}
              </datalist>
            </div>
            <div className="form-group">
              <label>Назва клієнта *</label>
              <input
                type="text"
                name="clientName"
                value={formData.clientName}
                onChange={handleChange}
                placeholder="Назва клієнта"
                required={isNew}
                readOnly={!isNew}
              />
            </div>
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
                readOnly={!isNew}
              />
            </div>
          </div>

          <div className="items-section">
            <div className="section-header">
              <h3>Обладнання для резервування</h3>
            </div>

            {/* Фільтри для пошуку обладнання - тільки для нових резервувань без попередньо вибраного обладнання */}
            {isNew && !hasPreSelectedEquipment && (
              <>
                <div className="form-row" style={{ marginBottom: '15px' }}>
                  <div className="form-group">
                    <label>Склад</label>
                    <select
                      value={selectedWarehouse}
                      onChange={(e) => setSelectedWarehouse(e.target.value)}
                    >
                      <option value="">Всі склади</option>
                      {warehouses.map(w => (
                        <option key={w._id} value={w._id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Пошук обладнання</label>
                    <input
                      type="text"
                      value={equipmentSearch}
                      onChange={(e) => setEquipmentSearch(e.target.value)}
                      placeholder="Тип, серійний номер..."
                    />
                  </div>
                </div>

                {/* Список доступного обладнання */}
                {loadingEquipment ? (
                  <div className="loading">Завантаження обладнання...</div>
                ) : availableEquipment.length > 0 ? (
                  <div className="equipment-select-list" style={{ 
                    maxHeight: '200px', 
                    overflowY: 'auto', 
                    border: '1px solid #ddd', 
                    borderRadius: '4px',
                    padding: '10px',
                    marginBottom: '20px'
                  }}>
                    {availableEquipment.map(eq => (
                      <div 
                        key={eq._id} 
                        className="equipment-select-item"
                        style={{
                          padding: '10px',
                          border: '1px solid #eee',
                          borderRadius: '4px',
                          marginBottom: '5px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}
                        onClick={() => handleAddEquipment(eq)}
                      >
                        <div>
                          <strong>{eq.type || 'Без типу'}</strong>
                          {eq.serialNumber && <span> - №{eq.serialNumber}</span>}
                          {eq.currentWarehouseName && <span> ({eq.currentWarehouseName})</span>}
                        </div>
                        <button 
                          type="button"
                          className="btn-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddEquipment(eq);
                          }}
                        >
                          ➕ Додати
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '10px', color: '#666', marginBottom: '20px' }}>
                    {equipmentSearch || selectedWarehouse 
                      ? 'Обладнання не знайдено' 
                      : 'Введіть критерії пошуку або оберіть склад'}
                  </div>
                )}
              </>
            )}

            {/* Вибране обладнання */}
            {selectedEquipment.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h4>Вибране обладнання ({selectedEquipment.length})</h4>
                {selectedEquipment.map((item, index) => (
                  <div key={index} className="item-row">
                    <div className="form-group">
                      <label>Тип</label>
                      <input type="text" value={item.type || ''} readOnly />
                    </div>
                    <div className="form-group">
                      <label>Серійний номер</label>
                      <input type="text" value={item.serialNumber || ''} readOnly />
                    </div>
                    <div className="form-group">
                      <label>Склад</label>
                      <input type="text" value={item.warehouseName || ''} readOnly />
                    </div>
                    <div className="form-group">
                      <label>Кількість</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity || 1}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        readOnly={!isNew}
                      />
                    </div>
                    <div className="form-group">
                      <label>Примітки</label>
                      <input
                        type="text"
                        value={item.notes || ''}
                        onChange={(e) => handleItemChange(index, 'notes', e.target.value)}
                        placeholder="Примітки"
                        readOnly={!isNew}
                      />
                    </div>
                    {isNew && !hasPreSelectedEquipment && (
                      <button
                        type="button"
                        className="btn-remove-item"
                        onClick={() => handleRemoveEquipment(index)}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Примітки</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              placeholder="Додаткові примітки до резервування"
              readOnly={!isNew}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {isNew ? 'Скасувати' : 'Закрити'}
            </button>
            {isNew && (
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Створення...' : 'Створити резервування'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReservationModal;

