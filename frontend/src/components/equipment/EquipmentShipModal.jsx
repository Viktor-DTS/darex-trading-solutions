import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import { getEdrpouList } from '../../utils/edrpouAPI';
import ClientDataSelectionModal from '../ClientDataSelectionModal';
import EquipmentFileUpload from './EquipmentFileUpload';
import './EquipmentShipModal.css';

function EquipmentShipModal({ equipment, onClose, onSuccess }) {
  const [selectedEquipmentList, setSelectedEquipmentList] = useState(equipment ? [equipment] : []);
  const [equipmentList, setEquipmentList] = useState([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);
  const [showSelection, setShowSelection] = useState(!equipment);
  const [shippedTo, setShippedTo] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientEdrpou, setClientEdrpou] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [invoiceRecipientDetails, setInvoiceRecipientDetails] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Стан для автозаповнення ЄДРПОУ
  const [edrpouList, setEdrpouList] = useState([]);
  const [showEdrpouDropdown, setShowEdrpouDropdown] = useState(false);
  const [filteredEdrpouList, setFilteredEdrpouList] = useState([]);
  const [clientDataModal, setClientDataModal] = useState({ open: false, edrpou: '' });

  // Завантаження списку обладнання, якщо не передано
  useEffect(() => {
    if (!equipment) {
      loadEquipment();
    }
  }, [equipment]);

  // Завантаження списку ЄДРПОУ для автозаповнення
  useEffect(() => {
    getEdrpouList()
      .then(data => {
        setEdrpouList(data || []);
      })
      .catch(err => console.error('Помилка завантаження ЄДРПОУ:', err));
  }, []);

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

  const handleEquipmentToggle = (eq) => {
    setSelectedEquipmentList(prev => {
      const exists = prev.find(e => e._id === eq._id);
      if (exists) {
        return prev.filter(e => e._id !== eq._id);
      } else {
        return [...prev, eq];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedEquipmentList.length === equipmentList.length) {
      setSelectedEquipmentList([]);
    } else {
      setSelectedEquipmentList([...equipmentList]);
    }
  };

  // Якщо потрібно показати вибір обладнання
  if (showSelection) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content equipment-select-modal two-column-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>🚚 Відвантаження обладнання</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          <div className="modal-body two-column-body">
            {/* Ліва колонка - список обладнання */}
            <div className="equipment-selection-column">
              <h3>Доступне обладнання</h3>
              {loadingEquipment ? (
                <div className="loading-message">Завантаження...</div>
              ) : equipmentList.length === 0 ? (
                <div className="empty-message">Немає доступного обладнання</div>
              ) : (
                <>
                  <div className="select-all-controls">
                    <label className="select-all-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedEquipmentList.length === equipmentList.length && equipmentList.length > 0}
                        onChange={handleSelectAll}
                      />
                      <span>Вибрати все ({selectedEquipmentList.length}/{equipmentList.length})</span>
                    </label>
                  </div>
                  <div className="equipment-select-list">
                    {equipmentList.map(eq => (
                      <div
                        key={eq._id}
                        className={`equipment-select-item ${selectedEquipmentList.find(e => e._id === eq._id) ? 'selected' : ''}`}
                        onClick={() => handleEquipmentToggle(eq)}
                      >
                        <input
                          type="checkbox"
                          checked={!!selectedEquipmentList.find(e => e._id === eq._id)}
                          onChange={() => handleEquipmentToggle(eq)}
                          onClick={(e) => e.stopPropagation()}
                          className="equipment-checkbox"
                        />
                        <div className="equipment-select-info">
                          <strong>{eq.type || '—'}</strong>
                          <span>Серійний номер: {eq.serialNumber || '—'}</span>
                          <span>Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Права колонка - вибране обладнання */}
            <div className="selected-equipment-column">
              <h3>Вибране обладнання ({selectedEquipmentList.length})</h3>
              {selectedEquipmentList.length === 0 ? (
                <div className="empty-selection-message">
                  <p>Виберіть обладнання зі списку зліва</p>
                </div>
              ) : (
                <div className="selected-equipment-display-list">
                  {selectedEquipmentList.map(eq => (
                    <div key={eq._id} className="selected-equipment-display-item">
                      <button
                        className="remove-equipment-btn"
                        onClick={() => handleEquipmentToggle(eq)}
                        title="Видалити з вибраного"
                      >
                        ✕
                      </button>
                      <div className="selected-equipment-display-info">
                        <strong>{eq.type || '—'}</strong>
                        <span>Серійний номер: {eq.serialNumber || '—'}</span>
                        <span>Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Скасувати
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (selectedEquipmentList.length > 0) {
                  setShowSelection(false);
                } else {
                  setError('Виберіть хоча б одне обладнання');
                }
              }}
              disabled={selectedEquipmentList.length === 0}
            >
              Продовжити ({selectedEquipmentList.length})
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (selectedEquipmentList.length === 0) {
      setError('Виберіть хоча б одне обладнання');
      return;
    }

    if (!shippedTo) {
      setError('Вкажіть замовника');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Обробляємо кожне вибране обладнання
      const results = await Promise.allSettled(
        selectedEquipmentList.map(eq =>
          fetch(`${API_BASE_URL}/equipment/${eq._id}/ship`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              shippedTo: shippedTo,
              orderNumber: orderNumber,
              invoiceNumber: invoiceNumber,
              clientEdrpou: clientEdrpou,
              clientAddress: clientAddress,
              invoiceRecipientDetails: invoiceRecipientDetails,
              attachedFiles: attachedFiles.map(f => ({
                cloudinaryUrl: f.cloudinaryUrl,
                cloudinaryId: f.cloudinaryId,
                originalName: f.originalName,
                mimetype: f.mimetype,
                size: f.size
              }))
            })
          })
        )
      );

      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      
      if (failed.length === 0) {
        onSuccess && onSuccess();
        onClose();
      } else {
        const successCount = results.length - failed.length;
        setError(`Відвантажено ${successCount} з ${results.length}. Деякі операції не вдалися.`);
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
            <p><strong>Вибрано обладнання:</strong> {selectedEquipmentList.length} шт.</p>
            <div className="selected-equipment-list">
              {selectedEquipmentList.map(eq => (
                <div key={eq._id} className="selected-equipment-item">
                  <span><strong>{eq.type || '—'}</strong> (Серійний номер: {eq.serialNumber || '—'})</span>
                  <span>Склад: {eq.currentWarehouseName || eq.currentWarehouse || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {!equipment && (
            <div className="form-group">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowSelection(true)}
                style={{ marginBottom: '12px' }}
              >
                ← Змінити вибір обладнання
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

            <div className="form-group autocomplete-wrapper">
              <label>ЄДРПОУ</label>
              <input
                type="text"
                value={clientEdrpou}
                onChange={(e) => {
                  const value = e.target.value;
                  setClientEdrpou(value);
                  // Фільтруємо ЄДРПОУ для автодоповнення
                  if (value.trim()) {
                    const filtered = edrpouList.filter(edrpou => 
                      edrpou.toLowerCase().includes(value.toLowerCase())
                    );
                    setFilteredEdrpouList(filtered);
                    setShowEdrpouDropdown(filtered.length > 0);
                  } else {
                    setShowEdrpouDropdown(false);
                    setFilteredEdrpouList([]);
                  }
                }}
                placeholder="Введіть ЄДРПОУ..."
                autoComplete="off"
              />
              {/* Dropdown з автодоповненням для ЄДРПОУ */}
              {showEdrpouDropdown && filteredEdrpouList.length > 0 && (
                <div className="autocomplete-dropdown">
                  <div className="autocomplete-hint">
                    💡 Виберіть ЄДРПОУ для автозаповнення даних клієнта
                  </div>
                  {filteredEdrpouList.slice(0, 10).map((edrpou, index) => (
                    <div
                      key={index}
                      className="autocomplete-item"
                      onClick={() => {
                        setClientEdrpou(edrpou);
                        setShowEdrpouDropdown(false);
                        setFilteredEdrpouList([]);
                        setClientDataModal({ open: true, edrpou: edrpou });
                      }}
                    >
                      {edrpou}
                    </div>
                  ))}
                  {filteredEdrpouList.length > 10 && (
                    <div className="autocomplete-more">
                      ... та ще {filteredEdrpouList.length - 10}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Адреса</label>
              <input
                type="text"
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                placeholder="Адреса доставки"
              />
            </div>

            <div className="form-group">
              <label>Реквізити отримувача</label>
              <textarea
                value={invoiceRecipientDetails}
                onChange={(e) => setInvoiceRecipientDetails(e.target.value)}
                placeholder="Реквізити для рахунку"
                rows="3"
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

            <div className="form-group">
              <label>Документи та фото</label>
              <EquipmentFileUpload
                onFilesChange={setAttachedFiles}
                uploadedFiles={attachedFiles}
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

      {/* Модальне вікно для вибору даних клієнта */}
      <ClientDataSelectionModal
        open={clientDataModal.open}
        onClose={() => setClientDataModal({ open: false, edrpou: '' })}
        onApply={(updates) => {
          // Застосовуємо дані клієнта до форми
          // ClientDataSelectionModal передає поля як прості значення (рядки), а не об'єкти
          if (updates.client) {
            setShippedTo(updates.client);
          }
          if (updates.address) {
            setClientAddress(updates.address);
          }
          if (updates.invoiceRecipientDetails) {
            setInvoiceRecipientDetails(updates.invoiceRecipientDetails);
          }
          setClientDataModal({ open: false, edrpou: '' });
        }}
        edrpou={clientDataModal.edrpou}
        currentFormData={{ shippedTo, clientEdrpou, clientAddress, invoiceRecipientDetails }}
      />
    </div>
  );
}

export default EquipmentShipModal;

