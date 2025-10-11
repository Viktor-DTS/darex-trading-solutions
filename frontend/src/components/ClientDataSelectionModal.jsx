import React, { useState, useEffect } from 'react';
import { getClientData, getEdrpouEquipmentTypes, getEdrpouEquipmentMaterials } from '../utils/edrpouAPI';

const ClientDataSelectionModal = ({ 
  open, 
  onClose, 
  onApply, 
  edrpou,
  currentFormData = {} 
}) => {
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [equipmentTypes, setEquipmentTypes] = useState([]);
  const [materials, setMaterials] = useState(null);
  const [selectedEquipmentType, setSelectedEquipmentType] = useState('');
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [selectedData, setSelectedData] = useState({
    client: { enabled: false, value: '' },
    address: { enabled: false, value: '' },
    invoiceRecipientDetails: { enabled: false, value: '' },
    contractFile: { enabled: false, value: null },
    materials: { enabled: false, value: null }
  });

  // Завантаження даних клієнта при відкритті модального вікна
  useEffect(() => {
    if (open && edrpou) {
      loadClientData();
      loadEquipmentTypes();
    }
  }, [open, edrpou]);

  // Завантаження матеріалів при зміні типу обладнання
  useEffect(() => {
    if (selectedEquipmentType && edrpou) {
      loadMaterials(selectedEquipmentType);
    }
  }, [selectedEquipmentType, edrpou]);

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

  const loadEquipmentTypes = async () => {
    if (!edrpou) return;
    try {
      const types = await getEdrpouEquipmentTypes(edrpou);
      setEquipmentTypes(types);
    } catch (error) {
      console.error('Помилка завантаження типів обладнання:', error);
    }
  };

  const loadMaterials = async (equipmentType) => {
    if (!edrpou || !equipmentType) return;
    setMaterialsLoading(true);
    try {
      const materialsData = await getEdrpouEquipmentMaterials(edrpou, equipmentType);
      setMaterials(materialsData);
    } catch (error) {
      console.error('Помилка завантаження матеріалів:', error);
    } finally {
      setMaterialsLoading(false);
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

  const handleEquipmentTypeChange = (equipmentType) => {
    setSelectedEquipmentType(equipmentType);
  };

  const handleMaterialsChange = (enabled, materialsData) => {
    setSelectedData(prev => ({
      ...prev,
      materials: {
        enabled,
        value: materialsData
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
    if (selectedData.materials.enabled && selectedData.materials.value) {
      formUpdates.materials = selectedData.materials.value;
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

              {/* Автозаповнення матеріалів по ЄДРПОУ */}
              <div className="data-section">
                <div className="data-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedData.materials.enabled}
                      onChange={(e) => handleMaterialsChange(e.target.checked, materials)}
                    />
                    Автозаповнення матеріалів
                  </label>
                </div>
                {selectedData.materials.enabled && (
                  <div className="data-fields">
                    {/* Вибір типу обладнання */}
                    <div className="field-group">
                      <label>Тип обладнання для цього ЄДРПОУ:</label>
                      <select
                        value={selectedEquipmentType}
                        onChange={(e) => handleEquipmentTypeChange(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      >
                        <option value="">Оберіть тип обладнання</option>
                        {equipmentTypes.map((type, index) => (
                          <option key={index} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Матеріали */}
                    {selectedEquipmentType && (
                      <div className="field-group">
                        <div style={{ marginTop: '10px' }}>
                          {materialsLoading ? (
                            <div className="loading">Завантаження матеріалів...</div>
                          ) : materials ? (
                            <div style={{ 
                              border: '1px solid #ddd', 
                              borderRadius: '4px', 
                              padding: '10px',
                              backgroundColor: '#f9f9f9'
                            }}>
                              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Доступні матеріали для автозаповнення:</h4>
                              
                              {/* Олива */}
                              {materials.oil && (materials.oil.types.length > 0 || materials.oil.quantities.length > 0) && (
                                <div style={{ marginBottom: '8px' }}>
                                  <strong>🛢️ Олива:</strong>
                                  {materials.oil.types.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Типи: {materials.oil.types.join(', ')}
                                    </div>
                                  )}
                                  {materials.oil.quantities.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Кількості: {materials.oil.quantities.join(', ')}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Масляний фільтр */}
                              {materials.oilFilter && (materials.oilFilter.names.length > 0 || materials.oilFilter.quantities.length > 0) && (
                                <div style={{ marginBottom: '8px' }}>
                                  <strong>🔧 Масляний фільтр:</strong>
                                  {materials.oilFilter.names.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Назви: {materials.oilFilter.names.join(', ')}
                                    </div>
                                  )}
                                  {materials.oilFilter.quantities.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Кількості: {materials.oilFilter.quantities.join(', ')}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Паливний фільтр */}
                              {materials.fuelFilter && (materials.fuelFilter.names.length > 0 || materials.fuelFilter.quantities.length > 0) && (
                                <div style={{ marginBottom: '8px' }}>
                                  <strong>⛽ Паливний фільтр:</strong>
                                  {materials.fuelFilter.names.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Назви: {materials.fuelFilter.names.join(', ')}
                                    </div>
                                  )}
                                  {materials.fuelFilter.quantities.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Кількості: {materials.fuelFilter.quantities.join(', ')}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Повітряний фільтр */}
                              {materials.airFilter && (materials.airFilter.names.length > 0 || materials.airFilter.quantities.length > 0) && (
                                <div style={{ marginBottom: '8px' }}>
                                  <strong>💨 Повітряний фільтр:</strong>
                                  {materials.airFilter.names.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Назви: {materials.airFilter.names.join(', ')}
                                    </div>
                                  )}
                                  {materials.airFilter.quantities.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Кількості: {materials.airFilter.quantities.join(', ')}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Антифриз */}
                              {materials.antifreeze && (materials.antifreeze.types.length > 0 || materials.antifreeze.quantities.length > 0) && (
                                <div style={{ marginBottom: '8px' }}>
                                  <strong>🧊 Антифриз:</strong>
                                  {materials.antifreeze.types.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Типи: {materials.antifreeze.types.join(', ')}
                                    </div>
                                  )}
                                  {materials.antifreeze.quantities.length > 0 && (
                                    <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                      Кількості: {materials.antifreeze.quantities.join(', ')}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Інші матеріали */}
                              {materials.otherMaterials && materials.otherMaterials.length > 0 && (
                                <div style={{ marginBottom: '8px' }}>
                                  <strong>📦 Інші матеріали:</strong>
                                  <div style={{ marginLeft: '15px', fontSize: '12px' }}>
                                    {materials.otherMaterials.join(', ')}
                                  </div>
                                </div>
                              )}

                              {Object.values(materials).every(m => 
                                !m || (Array.isArray(m) ? m.length === 0 : 
                                  (m.types && m.types.length === 0 && m.quantities && m.quantities.length === 0) ||
                                  (m.names && m.names.length === 0 && m.quantities && m.quantities.length === 0))
                              ) && (
                                <div style={{ color: '#666', fontStyle: 'italic' }}>
                                  Немає доступних матеріалів для цього типу обладнання
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ color: '#666', fontStyle: 'italic' }}>
                              Немає доступних матеріалів для цього типу обладнання
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
