import React, { useState, useEffect, useCallback } from 'react';
import { getClientData, getEdrpouEquipmentTypes, getEdrpouEquipmentMaterials } from '../utils/edrpouAPI';
import './ClientDataSelectionModal.css';

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
    equipment: { enabled: false, value: '' },
    materials: { 
      enabled: false, 
      value: null,
      selectedMaterials: {
        oil: { enabled: false, selectedType: '', selectedQuantity: '' },
        oilFilter: { enabled: false, selectedName: '', selectedQuantity: '' },
        fuelFilter: { enabled: false, selectedName: '', selectedQuantity: '' },
        airFilter: { enabled: false, selectedName: '', selectedQuantity: '' },
        antifreeze: { enabled: false, selectedType: '', selectedQuantity: '' },
        otherMaterials: { enabled: false, selectedMaterial: '' }
      }
    }
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
      
      // Автоматично заповнюємо поля, якщо є дані
      const autoSelected = { ...selectedData };
      if (data.client) {
        autoSelected.client = { enabled: true, value: data.client };
      }
      if (data.address) {
        autoSelected.address = { enabled: true, value: data.address };
      }
      if (data.invoiceRecipientDetails) {
        autoSelected.invoiceRecipientDetails = { enabled: true, value: data.invoiceRecipientDetails };
      }
      if (data.contractFile) {
        autoSelected.contractFile = { enabled: true, value: data.contractFile };
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
      const data = await getEdrpouEquipmentMaterials(edrpou, equipmentType);
      setMaterials(data);
    } catch (error) {
      console.error('Помилка завантаження матеріалів:', error);
    } finally {
      setMaterialsLoading(false);
    }
  };

  const handleToggleField = (field, value) => {
    setSelectedData(prev => ({
      ...prev,
      [field]: { ...prev[field], enabled: !prev[field].enabled, value: value || prev[field].value }
    }));
  };

  const handleMaterialToggle = (materialType, enabled) => {
    setSelectedData(prev => ({
      ...prev,
      materials: {
        ...prev.materials,
        selectedMaterials: {
          ...prev.materials.selectedMaterials,
          [materialType]: { ...prev.materials.selectedMaterials[materialType], enabled }
        }
      }
    }));
  };

  const handleMaterialSelect = (materialType, field, value) => {
    setSelectedData(prev => ({
      ...prev,
      materials: {
        ...prev.materials,
        selectedMaterials: {
          ...prev.materials.selectedMaterials,
          [materialType]: { ...prev.materials.selectedMaterials[materialType], [field]: value }
        }
      }
    }));
  };

  const handleEquipmentTypeSelect = (type) => {
    setSelectedEquipmentType(type);
    setSelectedData(prev => ({
      ...prev,
      equipment: { enabled: true, value: type }
    }));
  };

  const handleApply = () => {
    const updates = {};
    
    // Основні поля
    if (selectedData.client.enabled && selectedData.client.value) {
      updates.client = selectedData.client.value;
    }
    if (selectedData.address.enabled && selectedData.address.value) {
      updates.address = selectedData.address.value;
    }
    if (selectedData.invoiceRecipientDetails.enabled && selectedData.invoiceRecipientDetails.value) {
      updates.invoiceRecipientDetails = selectedData.invoiceRecipientDetails.value;
    }
    if (selectedData.contractFile.enabled && selectedData.contractFile.value) {
      updates.contractFile = selectedData.contractFile.value;
    }
    if (selectedData.equipment.enabled && selectedData.equipment.value) {
      updates.equipment = selectedData.equipment.value;
    }
    
    // Матеріали
    const mat = selectedData.materials.selectedMaterials;
    if (mat.oil.enabled) {
      if (mat.oil.selectedType) updates.oilType = mat.oil.selectedType;
      if (mat.oil.selectedQuantity) updates.oilUsed = mat.oil.selectedQuantity;
    }
    if (mat.oilFilter.enabled) {
      if (mat.oilFilter.selectedName) updates.filterName = mat.oilFilter.selectedName;
      if (mat.oilFilter.selectedQuantity) updates.filterCount = mat.oilFilter.selectedQuantity;
    }
    if (mat.fuelFilter.enabled) {
      if (mat.fuelFilter.selectedName) updates.fuelFilterName = mat.fuelFilter.selectedName;
      if (mat.fuelFilter.selectedQuantity) updates.fuelFilterCount = mat.fuelFilter.selectedQuantity;
    }
    if (mat.airFilter.enabled) {
      if (mat.airFilter.selectedName) updates.airFilterName = mat.airFilter.selectedName;
      if (mat.airFilter.selectedQuantity) updates.airFilterCount = mat.airFilter.selectedQuantity;
    }
    if (mat.antifreeze.enabled) {
      if (mat.antifreeze.selectedType) updates.antifreezeType = mat.antifreeze.selectedType;
      if (mat.antifreeze.selectedQuantity) updates.antifreezeL = mat.antifreeze.selectedQuantity;
    }
    if (mat.otherMaterials.enabled && mat.otherMaterials.selectedMaterial) {
      updates.otherMaterials = mat.otherMaterials.selectedMaterial;
    }
    
    console.log('[DEBUG] ClientDataSelectionModal - застосовуємо оновлення:', updates);
    onApply(updates);
    onClose({ applied: true });
  };

  if (!open) return null;

  return (
    <div className="client-data-modal-overlay" onClick={() => onClose({ applied: false })}>
      <div className="client-data-modal" onClick={e => e.stopPropagation()}>
        <div className="client-data-modal-header">
          <h2>🔄 Автозаповнення по ЄДРПОУ: {edrpou}</h2>
          <button type="button" className="close-btn" onClick={() => onClose({ applied: false })}>✕</button>
        </div>
        
        <div className="client-data-modal-body">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Завантаження даних...</p>
            </div>
          ) : (
            <>
              {/* Секція даних клієнта */}
              <div className="data-section">
                <h3>📋 Дані клієнта</h3>
                
                {clientData?.client && (
                  <div className="data-field">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={selectedData.client.enabled}
                        onChange={() => handleToggleField('client', clientData.client)}
                      />
                      <span className="field-name">Замовник:</span>
                      <span className="field-value">{clientData.client}</span>
                    </label>
                  </div>
                )}
                
                {clientData?.address && (
                  <div className="data-field">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={selectedData.address.enabled}
                        onChange={() => handleToggleField('address', clientData.address)}
                      />
                      <span className="field-name">Адреса:</span>
                      <span className="field-value">{clientData.address}</span>
                    </label>
                  </div>
                )}
                
                {clientData?.invoiceRecipientDetails && (
                  <div className="data-field">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={selectedData.invoiceRecipientDetails.enabled}
                        onChange={() => handleToggleField('invoiceRecipientDetails', clientData.invoiceRecipientDetails)}
                      />
                      <span className="field-name">Реквізити отримувача отримання товару:</span>
                      <span className="field-value">{clientData.invoiceRecipientDetails.substring(0, 50)}...</span>
                    </label>
                  </div>
                )}

                {!clientData?.client && !clientData?.address && (
                  <p className="no-data">Даних клієнта не знайдено для цього ЄДРПОУ</p>
                )}
              </div>

              {/* Секція типів обладнання */}
              {equipmentTypes.length > 0 && (
                <div className="data-section">
                  <h3>🔧 Типи обладнання для цього ЄДРПОУ</h3>
                  <div className="equipment-types-list">
                    {equipmentTypes.map((type, idx) => (
                      <button
                        key={idx}
                        className={`equipment-type-btn ${selectedEquipmentType === type ? 'selected' : ''}`}
                        onClick={() => handleEquipmentTypeSelect(type)}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Секція матеріалів */}
              {selectedEquipmentType && (
                <div className="data-section">
                  <h3>🛢️ Матеріали для: {selectedEquipmentType}</h3>
                  
                  {materialsLoading ? (
                    <div className="loading-state small">
                      <div className="spinner small"></div>
                      <p>Завантаження матеріалів...</p>
                    </div>
                  ) : materials ? (
                    <div className="materials-grid">
                      {/* Масло */}
                      {(materials.oil?.types?.length > 0 || materials.oil?.quantities?.length > 0) && (
                        <div className="material-block">
                          <label className="checkbox-label material-header">
                            <input 
                              type="checkbox" 
                              checked={selectedData.materials.selectedMaterials.oil.enabled}
                              onChange={(e) => handleMaterialToggle('oil', e.target.checked)}
                            />
                            <span>🛢️ Масло моторне</span>
                          </label>
                          {selectedData.materials.selectedMaterials.oil.enabled && (
                            <div className="material-selects">
                              {materials.oil?.types?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.oil.selectedType}
                                  onChange={(e) => handleMaterialSelect('oil', 'selectedType', e.target.value)}
                                >
                                  <option value="">Тип масла...</option>
                                  {materials.oil.types.map((t, i) => <option key={i} value={t}>{t}</option>)}
                                </select>
                              )}
                              {materials.oil?.quantities?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.oil.selectedQuantity}
                                  onChange={(e) => handleMaterialSelect('oil', 'selectedQuantity', e.target.value)}
                                >
                                  <option value="">Кількість...</option>
                                  {materials.oil.quantities.map((q, i) => <option key={i} value={q}>{q} л</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Фільтр масляний */}
                      {(materials.oilFilter?.names?.length > 0 || materials.oilFilter?.quantities?.length > 0) && (
                        <div className="material-block">
                          <label className="checkbox-label material-header">
                            <input 
                              type="checkbox" 
                              checked={selectedData.materials.selectedMaterials.oilFilter.enabled}
                              onChange={(e) => handleMaterialToggle('oilFilter', e.target.checked)}
                            />
                            <span>🔧 Фільтр масляний</span>
                          </label>
                          {selectedData.materials.selectedMaterials.oilFilter.enabled && (
                            <div className="material-selects">
                              {materials.oilFilter?.names?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.oilFilter.selectedName}
                                  onChange={(e) => handleMaterialSelect('oilFilter', 'selectedName', e.target.value)}
                                >
                                  <option value="">Назва фільтра...</option>
                                  {materials.oilFilter.names.map((n, i) => <option key={i} value={n}>{n}</option>)}
                                </select>
                              )}
                              {materials.oilFilter?.quantities?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.oilFilter.selectedQuantity}
                                  onChange={(e) => handleMaterialSelect('oilFilter', 'selectedQuantity', e.target.value)}
                                >
                                  <option value="">Кількість...</option>
                                  {materials.oilFilter.quantities.map((q, i) => <option key={i} value={q}>{q}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Фільтр паливний */}
                      {(materials.fuelFilter?.names?.length > 0 || materials.fuelFilter?.quantities?.length > 0) && (
                        <div className="material-block">
                          <label className="checkbox-label material-header">
                            <input 
                              type="checkbox" 
                              checked={selectedData.materials.selectedMaterials.fuelFilter.enabled}
                              onChange={(e) => handleMaterialToggle('fuelFilter', e.target.checked)}
                            />
                            <span>⛽ Фільтр паливний</span>
                          </label>
                          {selectedData.materials.selectedMaterials.fuelFilter.enabled && (
                            <div className="material-selects">
                              {materials.fuelFilter?.names?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.fuelFilter.selectedName}
                                  onChange={(e) => handleMaterialSelect('fuelFilter', 'selectedName', e.target.value)}
                                >
                                  <option value="">Назва фільтра...</option>
                                  {materials.fuelFilter.names.map((n, i) => <option key={i} value={n}>{n}</option>)}
                                </select>
                              )}
                              {materials.fuelFilter?.quantities?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.fuelFilter.selectedQuantity}
                                  onChange={(e) => handleMaterialSelect('fuelFilter', 'selectedQuantity', e.target.value)}
                                >
                                  <option value="">Кількість...</option>
                                  {materials.fuelFilter.quantities.map((q, i) => <option key={i} value={q}>{q}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Фільтр повітряний */}
                      {(materials.airFilter?.names?.length > 0 || materials.airFilter?.quantities?.length > 0) && (
                        <div className="material-block">
                          <label className="checkbox-label material-header">
                            <input 
                              type="checkbox" 
                              checked={selectedData.materials.selectedMaterials.airFilter.enabled}
                              onChange={(e) => handleMaterialToggle('airFilter', e.target.checked)}
                            />
                            <span>💨 Фільтр повітряний</span>
                          </label>
                          {selectedData.materials.selectedMaterials.airFilter.enabled && (
                            <div className="material-selects">
                              {materials.airFilter?.names?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.airFilter.selectedName}
                                  onChange={(e) => handleMaterialSelect('airFilter', 'selectedName', e.target.value)}
                                >
                                  <option value="">Назва фільтра...</option>
                                  {materials.airFilter.names.map((n, i) => <option key={i} value={n}>{n}</option>)}
                                </select>
                              )}
                              {materials.airFilter?.quantities?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.airFilter.selectedQuantity}
                                  onChange={(e) => handleMaterialSelect('airFilter', 'selectedQuantity', e.target.value)}
                                >
                                  <option value="">Кількість...</option>
                                  {materials.airFilter.quantities.map((q, i) => <option key={i} value={q}>{q}</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Антифриз */}
                      {(materials.antifreeze?.types?.length > 0 || materials.antifreeze?.quantities?.length > 0) && (
                        <div className="material-block">
                          <label className="checkbox-label material-header">
                            <input 
                              type="checkbox" 
                              checked={selectedData.materials.selectedMaterials.antifreeze.enabled}
                              onChange={(e) => handleMaterialToggle('antifreeze', e.target.checked)}
                            />
                            <span>❄️ Антифриз</span>
                          </label>
                          {selectedData.materials.selectedMaterials.antifreeze.enabled && (
                            <div className="material-selects">
                              {materials.antifreeze?.types?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.antifreeze.selectedType}
                                  onChange={(e) => handleMaterialSelect('antifreeze', 'selectedType', e.target.value)}
                                >
                                  <option value="">Тип антифризу...</option>
                                  {materials.antifreeze.types.map((t, i) => <option key={i} value={t}>{t}</option>)}
                                </select>
                              )}
                              {materials.antifreeze?.quantities?.length > 0 && (
                                <select 
                                  value={selectedData.materials.selectedMaterials.antifreeze.selectedQuantity}
                                  onChange={(e) => handleMaterialSelect('antifreeze', 'selectedQuantity', e.target.value)}
                                >
                                  <option value="">Кількість...</option>
                                  {materials.antifreeze.quantities.map((q, i) => <option key={i} value={q}>{q} л</option>)}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Інші матеріали */}
                      {materials.otherMaterials?.length > 0 && (
                        <div className="material-block">
                          <label className="checkbox-label material-header">
                            <input 
                              type="checkbox" 
                              checked={selectedData.materials.selectedMaterials.otherMaterials.enabled}
                              onChange={(e) => handleMaterialToggle('otherMaterials', e.target.checked)}
                            />
                            <span>📦 Інші матеріали</span>
                          </label>
                          {selectedData.materials.selectedMaterials.otherMaterials.enabled && (
                            <div className="material-selects">
                              <select 
                                value={selectedData.materials.selectedMaterials.otherMaterials.selectedMaterial}
                                onChange={(e) => handleMaterialSelect('otherMaterials', 'selectedMaterial', e.target.value)}
                              >
                                <option value="">Виберіть матеріал...</option>
                                {materials.otherMaterials.map((m, i) => <option key={i} value={m}>{m}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="no-data">Матеріалів не знайдено</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="client-data-modal-footer">
          <button type="button" className="btn-cancel" onClick={() => onClose({ applied: false })}>Скасувати</button>
          <button className="btn-apply" onClick={handleApply}>
            ✅ Застосувати вибране
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientDataSelectionModal;
