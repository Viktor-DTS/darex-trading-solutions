import React, { useState, useEffect } from 'react';
import { getClientData } from '../utils/edrpouAPI';

const ClientDataSelectionModal = ({ 
  open, 
  onClose, 
  onApply, 
  edrpou,
  currentFormData = {} 
}) => {
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedData, setSelectedData] = useState({
    client: { enabled: false, value: '' },
    address: { enabled: false, value: '' },
    invoiceRecipientDetails: { enabled: false, value: '' },
    contractFile: { enabled: false, value: null }
  });

  // Завантаження даних клієнта при відкритті модального вікна
  useEffect(() => {
    if (open && edrpou) {
      loadClientData();
    }
  }, [open, edrpou]);

  const loadClientData = async () => {
    if (!edrpou) return;
    setLoading(true);
    try {
      const data = await getClientData(edrpou);
      setClientData(data);
      
      // Автоматично заповнюємо поля, якщо є тільки один варіант
      const autoSelected = { ...selectedData };
      if (data.client) {
        autoSelected.client = { 
          enabled: true, 
          value: data.client
        };
      }
      if (data.address) {
        autoSelected.address = { 
          enabled: true, 
          value: data.address
        };
      }
      if (data.invoiceRecipientDetails) {
        autoSelected.invoiceRecipientDetails = { 
          enabled: true, 
          value: data.invoiceRecipientDetails
        };
      }
      if (data.contractFile) {
        autoSelected.contractFile = { 
          enabled: true, 
          value: data.contractFile
        };
      }
      setSelectedData(autoSelected);
    } catch (error) {
      console.error('Помилка завантаження даних клієнта:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDataChange = (field, enabled, value) => {
    setSelectedData(prev => ({
      ...prev,
      [field]: {
        enabled,
        value: enabled ? value : prev[field].value
      }
    }));
  };

  const handleApply = () => {
    const formUpdates = {};
    
    if (selectedData.client.enabled) {
      formUpdates.client = selectedData.client.value;
    }
    if (selectedData.address.enabled) {
      formUpdates.address = selectedData.address.value;
    }
    if (selectedData.invoiceRecipientDetails.enabled) {
      formUpdates.invoiceRecipientDetails = selectedData.invoiceRecipientDetails.value;
    }
    if (selectedData.contractFile.enabled) {
      formUpdates.contractFile = selectedData.contractFile.value;
    }
    
    onApply(formUpdates);
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content client-data-selection-modal">
        <div className="modal-header">
          <h3>Вибір даних клієнта для ЄДРПОУ: {edrpou}</h3>
          <button className="modal-close" onClick={handleCancel}>×</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading">Завантаження даних клієнта...</div>
          ) : clientData ? (
            <div className="client-data-selection">
              {/* Замовник */}
              <div className="data-section">
                <div className="data-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedData.client.enabled}
                      onChange={(e) => handleDataChange('client', e.target.checked, clientData.client)}
                    />
                    Замовник
                  </label>
                </div>
                {selectedData.client.enabled && (
                  <div className="data-fields">
                    <div className="field-group">
                      <label>Назва клієнта:</label>
                      <input
                        type="text"
                        value={selectedData.client.value}
                        onChange={(e) => handleDataChange('client', true, e.target.value)}
                        placeholder="Введіть назву клієнта"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Адреса */}
              <div className="data-section">
                <div className="data-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedData.address.enabled}
                      onChange={(e) => handleDataChange('address', e.target.checked, clientData.address)}
                    />
                    Адреса
                  </label>
                </div>
                {selectedData.address.enabled && (
                  <div className="data-fields">
                    <div className="field-group">
                      <label>Адреса:</label>
                      <textarea
                        value={selectedData.address.value}
                        onChange={(e) => handleDataChange('address', true, e.target.value)}
                        placeholder="Введіть адресу"
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Реквізити отримувача рахунку */}
              <div className="data-section">
                <div className="data-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedData.invoiceRecipientDetails.enabled}
                      onChange={(e) => handleDataChange('invoiceRecipientDetails', e.target.checked, clientData.invoiceRecipientDetails)}
                    />
                    Реквізити отримувача рахунку
                  </label>
                </div>
                {selectedData.invoiceRecipientDetails.enabled && (
                  <div className="data-fields">
                    <div className="field-group">
                      <label>Реквізити:</label>
                      <textarea
                        value={selectedData.invoiceRecipientDetails.value}
                        onChange={(e) => handleDataChange('invoiceRecipientDetails', true, e.target.value)}
                        placeholder="Введіть реквізити отримувача рахунку"
                        rows={4}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Файл договору */}
              <div className="data-section">
                <div className="data-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedData.contractFile.enabled}
                      onChange={(e) => handleDataChange('contractFile', e.target.checked, clientData.contractFile)}
                    />
                    Файл договору
                  </label>
                </div>
                {selectedData.contractFile.enabled && clientData.contractFile && (
                  <div className="data-fields">
                    <div className="field-group">
                      <label>Файл договору:</label>
                      <div style={{ 
                        padding: '8px 12px',
                        backgroundColor: '#e8f5e8',
                        border: '1px solid #4caf50',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span style={{ color: '#2e7d32' }}>
                          📄 {clientData.contractFile.split('/').pop() || 'contract.pdf'}
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => window.open(clientData.contractFile, '_blank')}
                            style={{
                              background: '#2196f3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            👁️ Переглянути
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = clientData.contractFile;
                              link.download = clientData.contractFile.split('/').pop() || 'contract.pdf';
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            style={{
                              background: '#4caf50',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            ⬇️ Завантажити
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="error">Не вдалося завантажити дані клієнта</div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Скасувати
          </button>
          <button className="btn btn-primary" onClick={handleApply}>
            Застосувати
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientDataSelectionModal;
