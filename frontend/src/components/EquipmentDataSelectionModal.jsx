import React, { useState, useEffect } from 'react';
import { getEquipmentData } from '../utils/edrpouAPI';
import './EquipmentDataSelectionModal.css';

const EquipmentDataSelectionModal = ({ 
  open, 
  onClose, 
  onApply, 
  equipmentType,
  currentFormData = {} 
}) => {
  const [equipmentData, setEquipmentData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const [selectedData, setSelectedData] = useState({
    equipmentSerial: { enabled: false, value: '' },
    engineModel: { enabled: false, value: '' },
    engineSerial: { enabled: false, value: '' },
    materials: { 
      enabled: false, 
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

  // Завантаження даних обладнання при відкритті модального вікна
  useEffect(() => {
    if (open && equipmentType) {
      loadEquipmentData();
    }
  }, [open, equipmentType]);

  // Скидання стану при закритті
  useEffect(() => {
    if (!open) {
      setSelectedData({
        equipmentSerial: { enabled: false, value: '' },
        engineModel: { enabled: false, value: '' },
        engineSerial: { enabled: false, value: '' },
        materials: { 
          enabled: false, 
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
    }
  }, [open]);

  const loadEquipmentData = async () => {
    if (!equipmentType) return;
    setLoading(true);
    try {
      const data = await getEquipmentData(equipmentType);
      console.log('[DEBUG] EquipmentDataSelectionModal - завантажено дані:', data);
      setEquipmentData(data);
    } catch (error) {
      console.error('Помилка завантаження даних обладнання:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleField = (field, value) => {
    setSelectedData(prev => ({
      ...prev,
      [field]: { ...prev[field], enabled: !prev[field].enabled, value: value || prev[field].value }
    }));
  };

  const handleSelectValue = (field, value) => {
    setSelectedData(prev => ({
      ...prev,
      [field]: { ...prev[field], value: value, enabled: true }
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
          [materialType]: { ...prev.materials.selectedMaterials[materialType], [field]: value, enabled: true }
        }
      }
    }));
  };

  const handleApply = () => {
    const updates = {};
    
    // Дані обладнання
    if (selectedData.equipmentSerial.enabled && selectedData.equipmentSerial.value) {
      updates.equipmentSerial = selectedData.equipmentSerial.value;
    }
    if (selectedData.engineModel.enabled && selectedData.engineModel.value) {
      updates.engineModel = selectedData.engineModel.value;
    }
    if (selectedData.engineSerial.enabled && selectedData.engineSerial.value) {
      updates.engineSerial = selectedData.engineSerial.value;
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
    
    console.log('[DEBUG] EquipmentDataSelectionModal - застосовуємо оновлення:', updates);
    onApply(updates);
    onClose();
  };

  // Перевірка чи є дані для відображення
  const hasData = equipmentData && (
    equipmentData.equipmentSerials?.length > 0 ||
    equipmentData.engineModels?.length > 0 ||
    equipmentData.engineSerials?.length > 0 ||
    equipmentData.oil?.types?.length > 0 ||
    equipmentData.oil?.quantities?.length > 0 ||
    equipmentData.oilFilter?.names?.length > 0 ||
    equipmentData.fuelFilter?.names?.length > 0 ||
    equipmentData.airFilter?.names?.length > 0 ||
    equipmentData.antifreeze?.types?.length > 0 ||
    equipmentData.otherMaterials?.length > 0
  );

  if (!open) return null;

  return (
    <div className="equipment-modal-overlay" onClick={onClose}>
      <div className="equipment-modal" onClick={e => e.stopPropagation()}>
        <div className="equipment-modal-header">
          <h2>🔧 Автозаповнення: {equipmentType}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="equipment-modal-body">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Пошук даних в базі...</p>
            </div>
          ) : !hasData ? (
            <div className="no-data-state">
              <div className="no-data-icon">📭</div>
              <p>Даних для обладнання "{equipmentType}" не знайдено в базі</p>
              <p className="hint">Це обладнання ще не використовувалося в заявках</p>
            </div>
          ) : (
            <>
              {/* Секція серійних номерів */}
              {(equipmentData.equipmentSerials?.length > 0 || 
                equipmentData.engineModels?.length > 0 || 
                equipmentData.engineSerials?.length > 0) && (
                <div className="data-section">
                  <h3>📋 Серійні номери та моделі</h3>
                  
                  {equipmentData.equipmentSerials?.length > 0 && (
                    <div className="data-field">
                      <label className="field-label">Заводський номер обладнання:</label>
                      <div className="options-list">
                        {equipmentData.equipmentSerials.map((serial, idx) => (
                          <button
                            key={idx}
                            className={`option-btn ${selectedData.equipmentSerial.value === serial ? 'selected' : ''}`}
                            onClick={() => handleSelectValue('equipmentSerial', serial)}
                          >
                            {serial}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {equipmentData.engineModels?.length > 0 && (
                    <div className="data-field">
                      <label className="field-label">Модель двигуна:</label>
                      <div className="options-list">
                        {equipmentData.engineModels.map((model, idx) => (
                          <button
                            key={idx}
                            className={`option-btn ${selectedData.engineModel.value === model ? 'selected' : ''}`}
                            onClick={() => handleSelectValue('engineModel', model)}
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {equipmentData.engineSerials?.length > 0 && (
                    <div className="data-field">
                      <label className="field-label">Серійний номер двигуна:</label>
                      <div className="options-list">
                        {equipmentData.engineSerials.map((serial, idx) => (
                          <button
                            key={idx}
                            className={`option-btn ${selectedData.engineSerial.value === serial ? 'selected' : ''}`}
                            onClick={() => handleSelectValue('engineSerial', serial)}
                          >
                            {serial}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Секція матеріалів */}
              {(equipmentData.oil?.types?.length > 0 ||
                equipmentData.oil?.quantities?.length > 0 ||
                equipmentData.oilFilter?.names?.length > 0 ||
                equipmentData.fuelFilter?.names?.length > 0 ||
                equipmentData.airFilter?.names?.length > 0 ||
                equipmentData.antifreeze?.types?.length > 0 ||
                equipmentData.otherMaterials?.length > 0) && (
                <div className="data-section">
                  <h3>🛢️ Матеріали що використовувалися</h3>
                  
                  <div className="materials-grid">
                    {/* Масло */}
                    {(equipmentData.oil?.types?.length > 0 || equipmentData.oil?.quantities?.length > 0) && (
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
                            {equipmentData.oil?.types?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.oil.selectedType}
                                onChange={(e) => handleMaterialSelect('oil', 'selectedType', e.target.value)}
                              >
                                <option value="">Тип масла...</option>
                                {equipmentData.oil.types.map((t, i) => <option key={i} value={t}>{t}</option>)}
                              </select>
                            )}
                            {equipmentData.oil?.quantities?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.oil.selectedQuantity}
                                onChange={(e) => handleMaterialSelect('oil', 'selectedQuantity', e.target.value)}
                              >
                                <option value="">Кількість...</option>
                                {equipmentData.oil.quantities.map((q, i) => <option key={i} value={q}>{q} л</option>)}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Фільтр масляний */}
                    {(equipmentData.oilFilter?.names?.length > 0 || equipmentData.oilFilter?.quantities?.length > 0) && (
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
                            {equipmentData.oilFilter?.names?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.oilFilter.selectedName}
                                onChange={(e) => handleMaterialSelect('oilFilter', 'selectedName', e.target.value)}
                              >
                                <option value="">Назва фільтра...</option>
                                {equipmentData.oilFilter.names.map((n, i) => <option key={i} value={n}>{n}</option>)}
                              </select>
                            )}
                            {equipmentData.oilFilter?.quantities?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.oilFilter.selectedQuantity}
                                onChange={(e) => handleMaterialSelect('oilFilter', 'selectedQuantity', e.target.value)}
                              >
                                <option value="">Кількість...</option>
                                {equipmentData.oilFilter.quantities.map((q, i) => <option key={i} value={q}>{q}</option>)}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Фільтр паливний */}
                    {(equipmentData.fuelFilter?.names?.length > 0 || equipmentData.fuelFilter?.quantities?.length > 0) && (
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
                            {equipmentData.fuelFilter?.names?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.fuelFilter.selectedName}
                                onChange={(e) => handleMaterialSelect('fuelFilter', 'selectedName', e.target.value)}
                              >
                                <option value="">Назва фільтра...</option>
                                {equipmentData.fuelFilter.names.map((n, i) => <option key={i} value={n}>{n}</option>)}
                              </select>
                            )}
                            {equipmentData.fuelFilter?.quantities?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.fuelFilter.selectedQuantity}
                                onChange={(e) => handleMaterialSelect('fuelFilter', 'selectedQuantity', e.target.value)}
                              >
                                <option value="">Кількість...</option>
                                {equipmentData.fuelFilter.quantities.map((q, i) => <option key={i} value={q}>{q}</option>)}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Фільтр повітряний */}
                    {(equipmentData.airFilter?.names?.length > 0 || equipmentData.airFilter?.quantities?.length > 0) && (
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
                            {equipmentData.airFilter?.names?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.airFilter.selectedName}
                                onChange={(e) => handleMaterialSelect('airFilter', 'selectedName', e.target.value)}
                              >
                                <option value="">Назва фільтра...</option>
                                {equipmentData.airFilter.names.map((n, i) => <option key={i} value={n}>{n}</option>)}
                              </select>
                            )}
                            {equipmentData.airFilter?.quantities?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.airFilter.selectedQuantity}
                                onChange={(e) => handleMaterialSelect('airFilter', 'selectedQuantity', e.target.value)}
                              >
                                <option value="">Кількість...</option>
                                {equipmentData.airFilter.quantities.map((q, i) => <option key={i} value={q}>{q}</option>)}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Антифриз */}
                    {(equipmentData.antifreeze?.types?.length > 0 || equipmentData.antifreeze?.quantities?.length > 0) && (
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
                            {equipmentData.antifreeze?.types?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.antifreeze.selectedType}
                                onChange={(e) => handleMaterialSelect('antifreeze', 'selectedType', e.target.value)}
                              >
                                <option value="">Тип антифризу...</option>
                                {equipmentData.antifreeze.types.map((t, i) => <option key={i} value={t}>{t}</option>)}
                              </select>
                            )}
                            {equipmentData.antifreeze?.quantities?.length > 0 && (
                              <select 
                                value={selectedData.materials.selectedMaterials.antifreeze.selectedQuantity}
                                onChange={(e) => handleMaterialSelect('antifreeze', 'selectedQuantity', e.target.value)}
                              >
                                <option value="">Кількість...</option>
                                {equipmentData.antifreeze.quantities.map((q, i) => <option key={i} value={q}>{q} л</option>)}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Інші матеріали */}
                    {equipmentData.otherMaterials?.length > 0 && (
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
                              {equipmentData.otherMaterials.map((m, i) => <option key={i} value={m}>{m}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="equipment-modal-footer">
          <button className="btn-cancel" onClick={onClose}>Скасувати</button>
          <button className="btn-apply" onClick={handleApply} disabled={!hasData}>
            ✅ Застосувати вибране
          </button>
        </div>
      </div>
    </div>
  );
};

export default EquipmentDataSelectionModal;
