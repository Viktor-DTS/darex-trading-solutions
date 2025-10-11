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
    
    console.log('[DEBUG] ClientDataSelectionModal - loadMaterials:', edrpou, equipmentType);
    setMaterialsLoading(true);
    try {
      const materialsData = await getEdrpouEquipmentMaterials(edrpou, equipmentType);
      console.log('[DEBUG] ClientDataSelectionModal - завантажені матеріали:', materialsData);
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
        ...prev.materials,
        enabled,
        value: materialsData
      }
    }));
  };

  const handleMaterialTypeChange = (materialType, enabled) => {
    console.log('[DEBUG] ClientDataSelectionModal - handleMaterialTypeChange:', materialType, enabled);
    setSelectedData(prev => ({
      ...prev,
      materials: {
        ...prev.materials,
        selectedMaterials: {
          ...prev.materials.selectedMaterials,
          [materialType]: {
            ...prev.materials.selectedMaterials[materialType],
            enabled
          }
        }
      }
    }));
  };

  const handleMaterialValueChange = (materialType, field, value) => {
    console.log('[DEBUG] ClientDataSelectionModal - handleMaterialValueChange:', materialType, field, value);
    setSelectedData(prev => ({
      ...prev,
      materials: {
        ...prev.materials,
        selectedMaterials: {
          ...prev.materials.selectedMaterials,
          [materialType]: {
            ...prev.materials.selectedMaterials[materialType],
            [field]: value
          }
        }
      }
    }));
  };

  const handleApply = () => {
    const formUpdates = {};
    
    console.log('[DEBUG] ClientDataSelectionModal - handleApply початок');
    console.log('[DEBUG] ClientDataSelectionModal - selectedData:', selectedData);
    console.log('[DEBUG] ClientDataSelectionModal - selectedEquipmentType:', selectedEquipmentType);
    console.log('[DEBUG] ClientDataSelectionModal - materials:', materials);
    
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
    // Додаємо тип обладнання якщо вибрано
    if (selectedEquipmentType) {
      formUpdates.equipment = selectedEquipmentType;
    }
    
    console.log('[DEBUG] ClientDataSelectionModal - перевірка матеріалів:');
    console.log('[DEBUG] ClientDataSelectionModal - selectedData.materials.enabled:', selectedData.materials.enabled);
    console.log('[DEBUG] ClientDataSelectionModal - selectedData.materials.value:', selectedData.materials.value);
    
    if (selectedData.materials.enabled && selectedData.materials.value) {
      // Формуємо матеріали з вибраними значеннями
      const selectedMaterials = {};
      const selectedTypes = selectedData.materials.selectedMaterials;
      
      console.log('[DEBUG] ClientDataSelectionModal - selectedTypes:', selectedTypes);
      
      if (selectedTypes.oil.enabled && selectedTypes.oil.selectedType && selectedTypes.oil.selectedQuantity) {
        selectedMaterials.oil = {
          type: selectedTypes.oil.selectedType,
          quantity: selectedTypes.oil.selectedQuantity
        };
        console.log('[DEBUG] ClientDataSelectionModal - додано оливу:', selectedMaterials.oil);
      }
      if (selectedTypes.oilFilter.enabled && selectedTypes.oilFilter.selectedName && selectedTypes.oilFilter.selectedQuantity) {
        selectedMaterials.oilFilter = {
          name: selectedTypes.oilFilter.selectedName,
          quantity: selectedTypes.oilFilter.selectedQuantity
        };
        console.log('[DEBUG] ClientDataSelectionModal - додано масляний фільтр:', selectedMaterials.oilFilter);
      }
      if (selectedTypes.fuelFilter.enabled && selectedTypes.fuelFilter.selectedName && selectedTypes.fuelFilter.selectedQuantity) {
        selectedMaterials.fuelFilter = {
          name: selectedTypes.fuelFilter.selectedName,
          quantity: selectedTypes.fuelFilter.selectedQuantity
        };
        console.log('[DEBUG] ClientDataSelectionModal - додано паливний фільтр:', selectedMaterials.fuelFilter);
      }
      if (selectedTypes.airFilter.enabled && selectedTypes.airFilter.selectedName && selectedTypes.airFilter.selectedQuantity) {
        selectedMaterials.airFilter = {
          name: selectedTypes.airFilter.selectedName,
          quantity: selectedTypes.airFilter.selectedQuantity
        };
        console.log('[DEBUG] ClientDataSelectionModal - додано повітряний фільтр:', selectedMaterials.airFilter);
      }
      if (selectedTypes.antifreeze.enabled && selectedTypes.antifreeze.selectedType && selectedTypes.antifreeze.selectedQuantity) {
        selectedMaterials.antifreeze = {
          type: selectedTypes.antifreeze.selectedType,
          quantity: selectedTypes.antifreeze.selectedQuantity
        };
        console.log('[DEBUG] ClientDataSelectionModal - додано антифриз:', selectedMaterials.antifreeze);
      }
      if (selectedTypes.otherMaterials.enabled && selectedTypes.otherMaterials.selectedMaterial) {
        selectedMaterials.otherMaterials = selectedTypes.otherMaterials.selectedMaterial;
        console.log('[DEBUG] ClientDataSelectionModal - додано інші матеріали:', selectedMaterials.otherMaterials);
      }
      
      formUpdates.materials = selectedMaterials;
      console.log('[DEBUG] ClientDataSelectionModal - фінальні матеріали:', selectedMaterials);
    }
    
    console.log('[DEBUG] ClientDataSelectionModal - formUpdates:', formUpdates);
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
                                <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedData.materials.selectedMaterials.oil.enabled}
                                      onChange={(e) => handleMaterialTypeChange('oil', e.target.checked)}
                                      style={{ marginRight: '8px', marginTop: '2px', marginLeft: '0' }}
                                    />
                                    <strong style={{ fontSize: '14px', color: '#000' }}>🛢️ Олива</strong>
                                  </div>
                                  {selectedData.materials.selectedMaterials.oil.enabled && (
                                    <div style={{ marginLeft: '25px' }}>
                                      {materials.oil.types.length > 0 && (
                                        <div style={{ marginBottom: '8px' }}>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Тип оливи:</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.oil.selectedType}
                                            onChange={(e) => handleMaterialValueChange('oil', 'selectedType', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть тип</option>
                                            {materials.oil.types.map((type, index) => (
                                              <option key={index} value={type}>{type}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                      {materials.oil.quantities.length > 0 && (
                                        <div>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Кількість (л):</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.oil.selectedQuantity}
                                            onChange={(e) => handleMaterialValueChange('oil', 'selectedQuantity', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть кількість</option>
                                            {materials.oil.quantities.map((quantity, index) => (
                                              <option key={index} value={quantity}>{quantity}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Масляний фільтр */}
                              {materials.oilFilter && (materials.oilFilter.names.length > 0 || materials.oilFilter.quantities.length > 0) && (
                                <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedData.materials.selectedMaterials.oilFilter.enabled}
                                      onChange={(e) => handleMaterialTypeChange('oilFilter', e.target.checked)}
                                      style={{ marginRight: '8px', marginTop: '2px', marginLeft: '0' }}
                                    />
                                    <strong style={{ fontSize: '14px', color: '#000' }}>🔧 Масляний фільтр</strong>
                                  </div>
                                  {selectedData.materials.selectedMaterials.oilFilter.enabled && (
                                    <div style={{ marginLeft: '25px' }}>
                                      {materials.oilFilter.names.length > 0 && (
                                        <div style={{ marginBottom: '8px' }}>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Назва фільтра:</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.oilFilter.selectedName}
                                            onChange={(e) => handleMaterialValueChange('oilFilter', 'selectedName', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть фільтр</option>
                                            {materials.oilFilter.names.map((name, index) => (
                                              <option key={index} value={name}>{name}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                      {materials.oilFilter.quantities.length > 0 && (
                                        <div>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Кількість (шт):</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.oilFilter.selectedQuantity}
                                            onChange={(e) => handleMaterialValueChange('oilFilter', 'selectedQuantity', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть кількість</option>
                                            {materials.oilFilter.quantities.map((quantity, index) => (
                                              <option key={index} value={quantity}>{quantity}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Паливний фільтр */}
                              {materials.fuelFilter && (materials.fuelFilter.names.length > 0 || materials.fuelFilter.quantities.length > 0) && (
                                <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedData.materials.selectedMaterials.fuelFilter.enabled}
                                      onChange={(e) => handleMaterialTypeChange('fuelFilter', e.target.checked)}
                                      style={{ marginRight: '8px', marginTop: '2px', marginLeft: '0' }}
                                    />
                                    <strong style={{ fontSize: '14px', color: '#000' }}>⛽ Паливний фільтр</strong>
                                  </div>
                                  {selectedData.materials.selectedMaterials.fuelFilter.enabled && (
                                    <div style={{ marginLeft: '25px' }}>
                                      {materials.fuelFilter.names.length > 0 && (
                                        <div style={{ marginBottom: '8px' }}>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Назва фільтра:</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.fuelFilter.selectedName}
                                            onChange={(e) => handleMaterialValueChange('fuelFilter', 'selectedName', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть фільтр</option>
                                            {materials.fuelFilter.names.map((name, index) => (
                                              <option key={index} value={name}>{name}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                      {materials.fuelFilter.quantities.length > 0 && (
                                        <div>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Кількість (шт):</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.fuelFilter.selectedQuantity}
                                            onChange={(e) => handleMaterialValueChange('fuelFilter', 'selectedQuantity', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть кількість</option>
                                            {materials.fuelFilter.quantities.map((quantity, index) => (
                                              <option key={index} value={quantity}>{quantity}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Повітряний фільтр */}
                              {materials.airFilter && (materials.airFilter.names.length > 0 || materials.airFilter.quantities.length > 0) && (
                                <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedData.materials.selectedMaterials.airFilter.enabled}
                                      onChange={(e) => handleMaterialTypeChange('airFilter', e.target.checked)}
                                      style={{ marginRight: '8px', marginTop: '2px', marginLeft: '0' }}
                                    />
                                    <strong style={{ fontSize: '14px', color: '#000' }}>💨 Повітряний фільтр</strong>
                                  </div>
                                  {selectedData.materials.selectedMaterials.airFilter.enabled && (
                                    <div style={{ marginLeft: '25px' }}>
                                      {materials.airFilter.names.length > 0 && (
                                        <div style={{ marginBottom: '8px' }}>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Назва фільтра:</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.airFilter.selectedName}
                                            onChange={(e) => handleMaterialValueChange('airFilter', 'selectedName', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть фільтр</option>
                                            {materials.airFilter.names.map((name, index) => (
                                              <option key={index} value={name}>{name}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                      {materials.airFilter.quantities.length > 0 && (
                                        <div>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Кількість (шт):</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.airFilter.selectedQuantity}
                                            onChange={(e) => handleMaterialValueChange('airFilter', 'selectedQuantity', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть кількість</option>
                                            {materials.airFilter.quantities.map((quantity, index) => (
                                              <option key={index} value={quantity}>{quantity}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Антифриз */}
                              {materials.antifreeze && (materials.antifreeze.types.length > 0 || materials.antifreeze.quantities.length > 0) && (
                                <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedData.materials.selectedMaterials.antifreeze.enabled}
                                      onChange={(e) => handleMaterialTypeChange('antifreeze', e.target.checked)}
                                      style={{ marginRight: '8px', marginTop: '2px', marginLeft: '0' }}
                                    />
                                    <strong style={{ fontSize: '14px', color: '#000' }}>🧊 Антифриз</strong>
                                  </div>
                                  {selectedData.materials.selectedMaterials.antifreeze.enabled && (
                                    <div style={{ marginLeft: '25px' }}>
                                      {materials.antifreeze.types.length > 0 && (
                                        <div style={{ marginBottom: '8px' }}>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Тип антифризу:</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.antifreeze.selectedType}
                                            onChange={(e) => handleMaterialValueChange('antifreeze', 'selectedType', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть тип</option>
                                            {materials.antifreeze.types.map((type, index) => (
                                              <option key={index} value={type}>{type}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                      {materials.antifreeze.quantities.length > 0 && (
                                        <div>
                                          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Кількість (л):</label>
                                          <select
                                            value={selectedData.materials.selectedMaterials.antifreeze.selectedQuantity}
                                            onChange={(e) => handleMaterialValueChange('antifreeze', 'selectedQuantity', e.target.value)}
                                            style={{
                                              width: '100%',
                                              padding: '6px 8px',
                                              border: '1px solid #ddd',
                                              borderRadius: '4px',
                                              fontSize: '12px'
                                            }}
                                          >
                                            <option value="">Виберіть кількість</option>
                                            {materials.antifreeze.quantities.map((quantity, index) => (
                                              <option key={index} value={quantity}>{quantity}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Інші матеріали */}
                              {materials.otherMaterials && materials.otherMaterials.length > 0 && (
                                <div style={{ marginBottom: '15px', padding: '10px', border: '1px solid #e0e0e0', borderRadius: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedData.materials.selectedMaterials.otherMaterials.enabled}
                                      onChange={(e) => handleMaterialTypeChange('otherMaterials', e.target.checked)}
                                      style={{ marginRight: '8px', marginTop: '2px', marginLeft: '0' }}
                                    />
                                    <strong style={{ fontSize: '14px', color: '#000' }}>📦 Інші матеріали</strong>
                                  </div>
                                  {selectedData.materials.selectedMaterials.otherMaterials.enabled && (
                                    <div style={{ marginLeft: '25px' }}>
                                      <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Матеріал:</label>
                                      <select
                                        value={selectedData.materials.selectedMaterials.otherMaterials.selectedMaterial}
                                        onChange={(e) => handleMaterialValueChange('otherMaterials', 'selectedMaterial', e.target.value)}
                                        style={{
                                          width: '100%',
                                          padding: '6px 8px',
                                          border: '1px solid #ddd',
                                          borderRadius: '4px',
                                          fontSize: '12px'
                                        }}
                                      >
                                        <option value="">Виберіть матеріал</option>
                                        {materials.otherMaterials.map((material, index) => (
                                          <option key={index} value={material}>{material}</option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
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
