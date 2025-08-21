import React, { useState, useEffect } from 'react';
import { getEquipmentMaterials } from '../utils/equipmentAPI';

const MaterialsSelectionModal = ({ 
  open, 
  onClose, 
  onApply, 
  equipmentType,
  currentFormData = {} 
}) => {
  const [materials, setMaterials] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState({
    oil: { enabled: false, type: '', quantity: '' },
    oilFilter: { enabled: false, name: '', quantity: '' },
    fuelFilter: { enabled: false, name: '', quantity: '' },
    airFilter: { enabled: false, name: '', quantity: '' },
    antifreeze: { enabled: false, type: '', quantity: '' },
    otherMaterials: { enabled: false, description: '' }
  });

  // Завантаження матеріалів при відкритті модального вікна
  useEffect(() => {
    if (open && equipmentType) {
      loadMaterials();
    }
  }, [open, equipmentType]);

  const loadMaterials = async () => {
    if (!equipmentType) return;
    
    setLoading(true);
    try {
      const materialsData = await getEquipmentMaterials(equipmentType);
      setMaterials(materialsData);
      
      // Автоматично заповнюємо поля, якщо є тільки один варіант
      const autoSelected = { ...selectedMaterials };
      
      if (materialsData.oil.types.length === 1) {
        autoSelected.oil = { 
          enabled: true, 
          type: materialsData.oil.types[0], 
          quantity: materialsData.oil.quantities[0] || '' 
        };
      }
      
      if (materialsData.oilFilter.names.length === 1) {
        autoSelected.oilFilter = { 
          enabled: true, 
          name: materialsData.oilFilter.names[0], 
          quantity: materialsData.oilFilter.quantities[0] || '' 
        };
      }
      
      if (materialsData.fuelFilter.names.length === 1) {
        autoSelected.fuelFilter = { 
          enabled: true, 
          name: materialsData.fuelFilter.names[0], 
          quantity: materialsData.fuelFilter.quantities[0] || '' 
        };
      }
      
      if (materialsData.airFilter.names.length === 1) {
        autoSelected.airFilter = { 
          enabled: true, 
          name: materialsData.airFilter.names[0], 
          quantity: materialsData.airFilter.quantities[0] || '' 
        };
      }
      
      if (materialsData.antifreeze.types.length === 1) {
        autoSelected.antifreeze = { 
          enabled: true, 
          type: materialsData.antifreeze.types[0], 
          quantity: materialsData.antifreeze.quantities[0] || '' 
        };
      }
      
      setSelectedMaterials(autoSelected);
    } catch (error) {
      console.error('Помилка завантаження матеріалів:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialChange = (materialType, field, value) => {
    setSelectedMaterials(prev => ({
      ...prev,
      [materialType]: {
        ...prev[materialType],
        [field]: value
      }
    }));
  };

  const handleApply = () => {
    const formUpdates = {};
    
    // Олива
    if (selectedMaterials.oil.enabled) {
      formUpdates.oilType = selectedMaterials.oil.type;
      formUpdates.oilUsed = selectedMaterials.oil.quantity;
    }
    
    // Масляний фільтр
    if (selectedMaterials.oilFilter.enabled) {
      formUpdates.filterName = selectedMaterials.oilFilter.name;
      formUpdates.filterCount = selectedMaterials.oilFilter.quantity;
    }
    
    // Паливний фільтр
    if (selectedMaterials.fuelFilter.enabled) {
      formUpdates.fuelFilterName = selectedMaterials.fuelFilter.name;
      formUpdates.fuelFilterCount = selectedMaterials.fuelFilter.quantity;
    }
    
    // Повітряний фільтр
    if (selectedMaterials.airFilter.enabled) {
      formUpdates.airFilterName = selectedMaterials.airFilter.name;
      formUpdates.airFilterCount = selectedMaterials.airFilter.quantity;
    }
    
    // Антифриз
    if (selectedMaterials.antifreeze.enabled) {
      formUpdates.antifreezeType = selectedMaterials.antifreeze.type;
      formUpdates.antifreezeL = selectedMaterials.antifreeze.quantity;
    }
    
    // Інші матеріали
    if (selectedMaterials.otherMaterials.enabled) {
      formUpdates.otherMaterials = selectedMaterials.otherMaterials.description;
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
      <div className="modal-content materials-selection-modal">
        <div className="modal-header">
          <h3>Вибір матеріалів для обладнання: {equipmentType}</h3>
          <button className="modal-close" onClick={handleCancel}>×</button>
        </div>
        
        <div className="modal-body">
          {loading ? (
            <div className="loading">Завантаження матеріалів...</div>
          ) : materials ? (
            <div className="materials-selection">
              {/* Олива */}
              <div className="material-section">
                <div className="material-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedMaterials.oil.enabled}
                      onChange={(e) => handleMaterialChange('oil', 'enabled', e.target.checked)}
                    />
                    Олива
                  </label>
                </div>
                {selectedMaterials.oil.enabled && (
                  <div className="material-fields">
                    <div className="field-group">
                      <label>Тип оливи:</label>
                      <select
                        value={selectedMaterials.oil.type}
                        onChange={(e) => handleMaterialChange('oil', 'type', e.target.value)}
                      >
                        <option value="">Виберіть тип</option>
                        {materials.oil.types.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label>Кількість (л):</label>
                      <select
                        value={selectedMaterials.oil.quantity}
                        onChange={(e) => handleMaterialChange('oil', 'quantity', e.target.value)}
                      >
                        <option value="">Виберіть кількість</option>
                        {materials.oil.quantities.map(qty => (
                          <option key={qty} value={qty}>{qty}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Масляний фільтр */}
              <div className="material-section">
                <div className="material-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedMaterials.oilFilter.enabled}
                      onChange={(e) => handleMaterialChange('oilFilter', 'enabled', e.target.checked)}
                    />
                    Масляний фільтр
                  </label>
                </div>
                {selectedMaterials.oilFilter.enabled && (
                  <div className="material-fields">
                    <div className="field-group">
                      <label>Назва фільтра:</label>
                      <select
                        value={selectedMaterials.oilFilter.name}
                        onChange={(e) => handleMaterialChange('oilFilter', 'name', e.target.value)}
                      >
                        <option value="">Виберіть фільтр</option>
                        {materials.oilFilter.names.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label>Кількість (шт):</label>
                      <select
                        value={selectedMaterials.oilFilter.quantity}
                        onChange={(e) => handleMaterialChange('oilFilter', 'quantity', e.target.value)}
                      >
                        <option value="">Виберіть кількість</option>
                        {materials.oilFilter.quantities.map(qty => (
                          <option key={qty} value={qty}>{qty}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Паливний фільтр */}
              <div className="material-section">
                <div className="material-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedMaterials.fuelFilter.enabled}
                      onChange={(e) => handleMaterialChange('fuelFilter', 'enabled', e.target.checked)}
                    />
                    Паливний фільтр
                  </label>
                </div>
                {selectedMaterials.fuelFilter.enabled && (
                  <div className="material-fields">
                    <div className="field-group">
                      <label>Назва фільтра:</label>
                      <select
                        value={selectedMaterials.fuelFilter.name}
                        onChange={(e) => handleMaterialChange('fuelFilter', 'name', e.target.value)}
                      >
                        <option value="">Виберіть фільтр</option>
                        {materials.fuelFilter.names.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label>Кількість (шт):</label>
                      <select
                        value={selectedMaterials.fuelFilter.quantity}
                        onChange={(e) => handleMaterialChange('fuelFilter', 'quantity', e.target.value)}
                      >
                        <option value="">Виберіть кількість</option>
                        {materials.fuelFilter.quantities.map(qty => (
                          <option key={qty} value={qty}>{qty}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Повітряний фільтр */}
              <div className="material-section">
                <div className="material-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedMaterials.airFilter.enabled}
                      onChange={(e) => handleMaterialChange('airFilter', 'enabled', e.target.checked)}
                    />
                    Повітряний фільтр
                  </label>
                </div>
                {selectedMaterials.airFilter.enabled && (
                  <div className="material-fields">
                    <div className="field-group">
                      <label>Назва фільтра:</label>
                      <select
                        value={selectedMaterials.airFilter.name}
                        onChange={(e) => handleMaterialChange('airFilter', 'name', e.target.value)}
                      >
                        <option value="">Виберіть фільтр</option>
                        {materials.airFilter.names.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label>Кількість (шт):</label>
                      <select
                        value={selectedMaterials.airFilter.quantity}
                        onChange={(e) => handleMaterialChange('airFilter', 'quantity', e.target.value)}
                      >
                        <option value="">Виберіть кількість</option>
                        {materials.airFilter.quantities.map(qty => (
                          <option key={qty} value={qty}>{qty}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Антифриз */}
              <div className="material-section">
                <div className="material-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedMaterials.antifreeze.enabled}
                      onChange={(e) => handleMaterialChange('antifreeze', 'enabled', e.target.checked)}
                    />
                    Антифриз
                  </label>
                </div>
                {selectedMaterials.antifreeze.enabled && (
                  <div className="material-fields">
                    <div className="field-group">
                      <label>Тип антифризу:</label>
                      <select
                        value={selectedMaterials.antifreeze.type}
                        onChange={(e) => handleMaterialChange('antifreeze', 'type', e.target.value)}
                      >
                        <option value="">Виберіть тип</option>
                        {materials.antifreeze.types.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label>Кількість (л):</label>
                      <select
                        value={selectedMaterials.antifreeze.quantity}
                        onChange={(e) => handleMaterialChange('antifreeze', 'quantity', e.target.value)}
                      >
                        <option value="">Виберіть кількість</option>
                        {materials.antifreeze.quantities.map(qty => (
                          <option key={qty} value={qty}>{qty}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Інші матеріали */}
              <div className="material-section">
                <div className="material-header">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedMaterials.otherMaterials.enabled}
                      onChange={(e) => handleMaterialChange('otherMaterials', 'enabled', e.target.checked)}
                    />
                    Інші матеріали
                  </label>
                </div>
                {selectedMaterials.otherMaterials.enabled && (
                  <div className="material-fields">
                    <div className="field-group">
                      <label>Опис матеріалів:</label>
                      <textarea
                        value={selectedMaterials.otherMaterials.description}
                        onChange={(e) => handleMaterialChange('otherMaterials', 'description', e.target.value)}
                        placeholder="Введіть опис інших матеріалів..."
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="error">Не вдалося завантажити матеріали</div>
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

export default MaterialsSelectionModal; 