import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import EquipmentScanner from './EquipmentScanner';
import EquipmentFileUpload from './EquipmentFileUpload';
import EquipmentQRModal from './EquipmentQRModal';
import EquipmentHistoryModal from './EquipmentHistoryModal';
import './EquipmentEditModal.css';

function EquipmentEditModal({ equipment, warehouses, user, onClose, onSuccess, readOnly = false, onReserve, onCancelReserve }) {
  const [formData, setFormData] = useState({});
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [equipmentType, setEquipmentType] = useState('single'); // 'single' або 'batch'
  const isNewEquipment = !equipment;

  useEffect(() => {
    if (equipment) {
      setFormData({
        manufacturer: equipment.manufacturer || '',
        type: equipment.type || '',
        serialNumber: equipment.serialNumber || '',
        currentWarehouse: equipment.currentWarehouse || '',
        currentWarehouseName: equipment.currentWarehouseName || '',
        region: equipment.region || '',
        standbyPower: equipment.standbyPower || '',
        primePower: equipment.primePower || '',
        phase: equipment.phase !== undefined ? String(equipment.phase) : '',
        voltage: equipment.voltage || '',
        amperage: equipment.amperage !== undefined ? String(equipment.amperage) : '',
        rpm: equipment.rpm !== undefined ? String(equipment.rpm) : '',
        dimensions: equipment.dimensions || '',
        weight: equipment.weight !== undefined ? String(equipment.weight) : '',
        manufactureDate: equipment.manufactureDate ? new Date(equipment.manufactureDate).toISOString().split('T')[0] : '',
        batchName: equipment.batchName || '',
        batchUnit: equipment.batchUnit || '',
        batchPriceWithVAT: equipment.batchPriceWithVAT !== undefined ? String(equipment.batchPriceWithVAT) : '',
        currency: equipment.currency || 'грн.',
        notes: equipment.notes || '',
        materialValueType: equipment.materialValueType || (equipment.isServiceParts ? 'service' : equipment.isElectroInstallParts ? 'electroinstall' : equipment.isInternalEquipment ? 'internal' : '')
      });
      setEquipmentType(equipment.isBatch ? 'batch' : 'single');
      // Завантажуємо існуючі файли з бази даних
      if (equipment.attachedFiles && Array.isArray(equipment.attachedFiles) && equipment.attachedFiles.length > 0) {
        // Перетворюємо файли з бази в формат, який очікує компонент
        const existingFiles = equipment.attachedFiles.map((file, index) => ({
          id: file._id || file.cloudinaryId || `existing-${index}`,
          cloudinaryUrl: file.cloudinaryUrl,
          cloudinaryId: file.cloudinaryId,
          originalName: file.originalName,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: file.uploadedAt
        }));
        setAttachedFiles(existingFiles);
      } else {
        setAttachedFiles([]);
      }
    } else {
      // Ініціалізація для нового обладнання
      setFormData({
        manufacturer: '',
        type: '',
        serialNumber: '',
        quantity: 1,
        currentWarehouse: user?.region || '',
        currentWarehouseName: '',
        region: user?.region || '',
        standbyPower: '',
        primePower: '',
        phase: '',
        voltage: '',
        amperage: '',
        rpm: '',
        dimensions: '',
        weight: '',
        manufactureDate: '',
        batchName: '',
        batchUnit: '',
        batchPriceWithVAT: '',
        currency: 'грн.',
        notes: '',
        materialValueType: ''
      });
      setEquipmentType('single');
    }
  }, [equipment, user]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Якщо змінюється склад, оновлюємо назву складу та регіон
    if (name === 'currentWarehouse') {
      const warehouse = warehouses.find(w => (w._id || w.name) === value);
      if (warehouse) {
        setFormData(prev => ({
          ...prev,
          currentWarehouseName: warehouse.name,
          region: warehouse.region || prev.region || ''
        }));
      }
    }

    // Якщо змінюється тип матеріальних цінностей, скидаємо інші опції
    if (name === 'materialValueType') {
      // Вже встановлено через setFormData вище
    }
  };

  const handleMaterialValueTypeChange = (value) => {
    // Встановлюємо вибране значення (радіо-кнопки автоматично скидають інші через однаковий name)
    setFormData(prev => ({
      ...prev,
      materialValueType: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Підготовка даних для відправки
      const updateData = { ...formData };
      
      // Додаємо поля для партії (тільки для нового обладнання)
      if (isNewEquipment) {
        updateData.isBatch = equipmentType === 'batch';
        if (equipmentType === 'batch') {
          updateData.quantity = parseInt(formData.quantity) || 1;
          updateData.serialNumber = null; // Партії без серійних номерів
        } else {
          updateData.quantity = 1;
        }
      }
      
      // Додаємо прикріплені файли
      if (attachedFiles.length > 0) {
        updateData.attachedFiles = attachedFiles.map(f => ({
          cloudinaryUrl: f.cloudinaryUrl,
          cloudinaryId: f.cloudinaryId,
          originalName: f.originalName,
          mimetype: f.mimetype,
          size: f.size
        }));
      }
      
      // Обробка дати виробництва - якщо порожня, відправляємо null
      if (!updateData.manufactureDate || updateData.manufactureDate.trim() === '') {
        updateData.manufactureDate = null;
      }
      
      // Очищаємо порожні рядки
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === '' && key !== 'attachedFiles') {
          updateData[key] = null;
        }
      });
      
      // Обробка числових полів
      if (updateData.phase) {
        const phaseNum = parseFloat(updateData.phase);
        updateData.phase = isNaN(phaseNum) ? null : phaseNum;
      }
      if (updateData.amperage) {
        const amperageNum = parseFloat(updateData.amperage);
        updateData.amperage = isNaN(amperageNum) ? null : amperageNum;
      }
      if (updateData.rpm) {
        const rpmNum = parseFloat(updateData.rpm);
        updateData.rpm = isNaN(rpmNum) ? null : rpmNum;
      }
      if (updateData.weight) {
        const weightNum = parseFloat(updateData.weight);
        updateData.weight = isNaN(weightNum) ? null : weightNum;
      }
      if (updateData.batchPriceWithVAT) {
        const priceNum = parseFloat(updateData.batchPriceWithVAT);
        updateData.batchPriceWithVAT = isNaN(priceNum) ? null : priceNum;
      }
      
      console.log('[EDIT] Відправка даних:', updateData);
      
      const url = isNewEquipment 
        ? `${API_BASE_URL}/equipment/scan`
        : `${API_BASE_URL}/equipment/${equipment._id}`;
      const method = isNewEquipment ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(isNewEquipment ? '[ADD] Обладнання додано:' : '[EDIT] Обладнання оновлено:', result);
        onSuccess();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[EDIT] Помилка відповіді:', response.status, errorData);
        let errorMessage = errorData.error || (isNewEquipment ? 'Помилка додавання обладнання' : 'Помилка оновлення обладнання');
        
        // Якщо це помилка дублікату, показуємо детальну інформацію
        if (errorData.existing) {
          errorMessage = `${errorMessage}\n\nІснуюче обладнання:\nТип: ${errorData.existing.type}\nСерійний номер: ${errorData.existing.serialNumber}\nСклад: ${errorData.existing.currentWarehouse || 'Не вказано'}`;
        }
        
        setError(errorMessage);
      }
    } catch (err) {
      setError('Помилка з\'єднання з сервером');
      console.error('[EDIT] Помилка оновлення обладнання:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScannerData = (scannedData) => {
    setFormData(prev => ({
      ...prev,
      ...scannedData,
      // Зберігаємо склад, якщо він вже вибраний
      currentWarehouse: prev.currentWarehouse || scannedData.currentWarehouse || '',
      currentWarehouseName: prev.currentWarehouseName || scannedData.currentWarehouseName || '',
      region: prev.region || scannedData.region || ''
    }));
    setShowScanner(false);
  };

  return (
    <div className="equipment-edit-modal-overlay" onClick={onClose}>
      <div className="equipment-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="equipment-edit-header">
          <h2>{isNewEquipment ? 'Додати обладнання від постачальників' : (readOnly ? 'Перегляд обладнання' : 'Редагувати обладнання')}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        {showScanner && (
          <EquipmentScanner
            user={user}
            warehouses={warehouses}
            embedded={true}
            onDataScanned={(scannedData) => {
              // Отримуємо дані зі сканера і заповнюємо форму без збереження
              handleScannerData({
                manufacturer: scannedData.manufacturer || '',
                type: scannedData.type || '',
                serialNumber: scannedData.serialNumber || '',
                currentWarehouse: scannedData.currentWarehouse || formData.currentWarehouse || '',
                currentWarehouseName: scannedData.currentWarehouseName || formData.currentWarehouseName || '',
                region: scannedData.region || formData.region || '',
                standbyPower: scannedData.standbyPower || '',
                primePower: scannedData.primePower || '',
                phase: scannedData.phase !== undefined && scannedData.phase !== null ? String(scannedData.phase) : '',
                voltage: scannedData.voltage || '',
                amperage: scannedData.amperage !== undefined && scannedData.amperage !== null ? String(scannedData.amperage) : '',
                rpm: scannedData.rpm !== undefined && scannedData.rpm !== null ? String(scannedData.rpm) : '',
                dimensions: scannedData.dimensions || '',
                weight: scannedData.weight !== undefined && scannedData.weight !== null ? String(scannedData.weight) : '',
                manufactureDate: scannedData.manufactureDate || ''
              });
            }}
            onClose={() => setShowScanner(false)}
          />
        )}
        
        {!showScanner && (
          <form onSubmit={handleSubmit} className="equipment-edit-form">
            {error && (
              <div className="form-error">
                {error}
              </div>
            )}

            {!readOnly && (
              <div className="form-section" style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowScanner(true)}
                  style={{ flex: '1', minWidth: '200px', padding: '12px', fontSize: '16px' }}
                >
                  📷 Сканувати шильдик
                </button>
              {!isNewEquipment && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowQR(true)}
                    style={{ flex: '1', minWidth: '150px', padding: '12px', fontSize: '16px' }}
                  >
                    📱 QR
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowHistory(true)}
                    style={{ flex: '1', minWidth: '150px', padding: '12px', fontSize: '16px' }}
                  >
                    📋 Історія
                  </button>
                </>
              )}
              </div>
            )}

            {!readOnly && (
              <div className="form-section">
                <h3>Тип матеріальних цінностей</h3>
                {isNewEquipment && (
                  <>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="equipmentType"
                          value="single"
                          checked={equipmentType === 'single'}
                          onChange={(e) => {
                            setEquipmentType(e.target.value);
                            // Скидаємо тип матеріальних цінностей при зміні типу обладнання
                            setFormData(prev => ({ ...prev, materialValueType: '' }));
                          }}
                        />
                        Одиничне обладнання (з серійним номером)
                      </label>
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="equipmentType"
                          value="batch"
                          checked={equipmentType === 'batch'}
                          onChange={(e) => {
                            setEquipmentType(e.target.value);
                            // Скидаємо тип матеріальних цінностей при зміні типу обладнання
                            setFormData(prev => ({ ...prev, materialValueType: '' }));
                          }}
                        />
                        Партія обладнання (без серійного номера - щитове обладннання для продажу - АВР, ЩР, ЩС, тощо)
                      </label>
                    </div>
                  </>
                )}
                <div className="form-group" style={{ marginTop: isNewEquipment ? '15px' : '0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="materialValueType"
                      value="service"
                      checked={formData.materialValueType === 'service'}
                      onChange={(e) => handleMaterialValueTypeChange(e.target.value)}
                    />
                    Комплектуючі ЗІП (Сервіс)
                  </label>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="materialValueType"
                      value="electroinstall"
                      checked={formData.materialValueType === 'electroinstall'}
                      onChange={(e) => handleMaterialValueTypeChange(e.target.value)}
                    />
                    Комплектуючі для електромонтажних робіт (Елетромонтажний відділ)
                  </label>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="materialValueType"
                      value="internal"
                      checked={formData.materialValueType === 'internal'}
                      onChange={(e) => handleMaterialValueTypeChange(e.target.value)}
                    />
                    Обладнання для внутрішніх потреб підприємства
                  </label>
                </div>
              </div>
            )}

            {!isNewEquipment && equipment?.isBatch && (
              <div className="form-section" style={{ backgroundColor: 'var(--surface-dark)', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '10px' }}>📦 Партійне обладнання</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)' }}>
                  <div><strong>Індекс в партії:</strong> {equipment.batchIndex || '—'}</div>
                  <div style={{ fontSize: '12px', marginTop: '5px', color: 'var(--text-secondary)' }}>
                    ⚠️ Це одиниця з партії. Серійний номер не застосовується.
                  </div>
                </div>
              </div>
            )}

            <div className="form-section">
            <h3>Основна інформація</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Виробник</label>
                <input
                  type="text"
                  name="manufacturer"
                  value={formData.manufacturer}
                  onChange={handleChange}
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Тип обладнання *</label>
                <input
                  type="text"
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Серійний номер {equipmentType === 'single' && '*'}</label>
                <input
                  type="text"
                  name="serialNumber"
                  value={formData.serialNumber}
                  onChange={handleChange}
                  disabled={(equipmentType === 'batch' && isNewEquipment) || (!isNewEquipment && equipment?.isBatch) || readOnly}
                  required={equipmentType === 'single' && isNewEquipment}
                  readOnly={readOnly}
                  placeholder={
                    (!isNewEquipment && equipment?.isBatch) 
                      ? 'Не застосовується для партійного обладнання' 
                      : (equipmentType === 'batch' && isNewEquipment) 
                        ? 'Не застосовується для партій' 
                        : 'Введіть серійний номер'
                  }
                />
              </div>
              {equipmentType === 'batch' && isNewEquipment && (
                <div className="form-group">
                  <label>Кількість одиниць *</label>
                  <input
                    type="number"
                    name="quantity"
                  value={formData.quantity || 1}
                  onChange={handleChange}
                  min="1"
                  required
                  placeholder="Введіть кількість"
                  readOnly={readOnly}
                  disabled={readOnly}
                />
                </div>
              )}
              <div className="form-group">
                <label>Склад *</label>
                <select
                  name="currentWarehouse"
                  value={formData.currentWarehouse}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                >
                  <option value="">Виберіть склад</option>
                  {warehouses.map(w => (
                    <option key={w._id || w.name} value={w._id || w.name}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Регіон</label>
                <input
                  type="text"
                  name="region"
                  value={formData.region}
                  onChange={handleChange}
                  placeholder="Введіть регіон"
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>

          {/* Кількісна характеристика - відображається для обох типів */}
          <div className="form-section">
            <h3>Кількісна характеристика</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Одиниця виміру <span className="required">*</span></label>
                <select
                  name="batchUnit"
                  value={formData.batchUnit}
                  onChange={handleChange}
                  required
                  disabled={readOnly}
                >
                  <option value="">Виберіть одиницю виміру</option>
                  <option value="шт.">шт.</option>
                  <option value="л.">л.</option>
                  <option value="комплект">комплект</option>
                  <option value="упаковка">упаковка</option>
                  <option value="балон">балон</option>
                  <option value="м.п.">м.п.</option>
                </select>
              </div>
              <div className="form-group">
                <label>Ціна за одиницю з ПДВ</label>
                <input
                  type="number"
                  name="batchPriceWithVAT"
                  value={formData.batchPriceWithVAT}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  readOnly={readOnly}
                  disabled={readOnly}
                />
              </div>
              <div className="form-group">
                <label>Тип валюти</label>
                <select
                  name="currency"
                  value={formData.currency || 'грн.'}
                  onChange={handleChange}
                >
                  <option value="грн.">грн.</option>
                  <option value="USD">USD</option>
                  <option value="EURO">EURO</option>
                </select>
              </div>
            </div>
          </div>

          {/* Технічні характеристики - тільки для одиничного обладнання */}
          {!(equipmentType === 'batch' || (!isNewEquipment && equipment?.isBatch)) && (
            <div className="form-section">
              <h3>Технічні характеристики</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Резервна потужність</label>
                  <input
                    type="text"
                    name="standbyPower"
                    value={formData.standbyPower}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Основна потужність</label>
                  <input
                    type="text"
                    name="primePower"
                    value={formData.primePower}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Фази</label>
                  <input
                    type="text"
                    name="phase"
                    value={formData.phase}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Напруга</label>
                  <input
                    type="text"
                    name="voltage"
                    value={formData.voltage}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Струм (A)</label>
                  <input
                    type="text"
                    name="amperage"
                    value={formData.amperage}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>RPM</label>
                  <input
                    type="text"
                    name="rpm"
                    value={formData.rpm}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="form-section">
            <h3>Фізичні параметри</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Розміри (мм)</label>
                <input
                  type="text"
                  name="dimensions"
                  value={formData.dimensions}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Вага (кг)</label>
                <input
                  type="text"
                  name="weight"
                  value={formData.weight}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Дата виробництва</label>
                <input
                  type="date"
                  name="manufactureDate"
                  value={formData.manufactureDate}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          {!readOnly && (
            <div className="form-section">
              <h3>Документи та фото</h3>
              <EquipmentFileUpload
                onFilesChange={setAttachedFiles}
                uploadedFiles={attachedFiles}
              />
            </div>
          )}
          {readOnly && equipment?.attachedFiles && equipment.attachedFiles.length > 0 && (
            <div className="form-section">
              <h3>Документи та фото ({equipment.attachedFiles.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px', marginTop: '15px' }}>
                {equipment.attachedFiles.map((file, index) => {
                  const isImage = file.mimetype && file.mimetype.startsWith('image/');
                  return (
                    <div key={file._id || file.cloudinaryId || index} style={{ 
                      border: '1px solid #444', 
                      borderRadius: '8px', 
                      padding: '10px', 
                      textAlign: 'center',
                      backgroundColor: '#1a1a1a'
                    }}>
                      {isImage ? (
                        <img 
                          src={file.cloudinaryUrl} 
                          alt={file.originalName || 'Фото'} 
                          style={{ 
                            width: '100%', 
                            height: '120px', 
                            objectFit: 'cover', 
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                          onClick={() => window.open(file.cloudinaryUrl, '_blank')}
                        />
                      ) : (
                        <div style={{ 
                          fontSize: '48px', 
                          marginBottom: '10px',
                          cursor: 'pointer'
                        }}
                        onClick={() => window.open(file.cloudinaryUrl, '_blank')}
                        >
                          📄
                        </div>
                      )}
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#aaa', 
                        marginTop: '8px',
                        wordBreak: 'break-word',
                        cursor: 'pointer'
                      }}
                      onClick={() => window.open(file.cloudinaryUrl, '_blank')}
                      title={file.originalName}
                      >
                        {file.originalName || 'Файл'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {equipment && (equipment.reservedByName || equipment.status === 'reserved') && (
            <div className="form-section" style={{ backgroundColor: 'var(--surface-dark)', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '10px' }}>🔒 Резервування</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)' }}>
                <div><strong>Статус:</strong> {equipment.status === 'reserved' ? 'Зарезервовано' : 'Вільне'}</div>
                {equipment.reservedByName && (
                  <div><strong>Зарезервував:</strong> {equipment.reservedByName}</div>
                )}
                {equipment.reservedAt && (
                  <div><strong>Дата резервування:</strong> {new Date(equipment.reservedAt).toLocaleDateString('uk-UA')}</div>
                )}
              </div>
            </div>
          )}

          <div className="form-section">
            <h3>Примітки</h3>
            <div className="form-group">
              <textarea
                name="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                placeholder="Введіть примітки (необов'язково)"
                rows="5"
                style={{ width: '100%', minHeight: '120px' }}
                readOnly={readOnly}
                disabled={readOnly}
              />
            </div>
          </div>

            <div className="equipment-edit-footer">
              {readOnly && onReserve && onCancelReserve && (
                <>
                  {equipment && equipment.status === 'reserved' ? (
                    <button 
                      type="button" 
                      className="btn-cancel" 
                      onClick={async () => {
                        if (window.confirm('Ви впевнені, що хочете скасувати резервування?')) {
                          await onCancelReserve(equipment._id);
                          onClose();
                        }
                      }}
                    >
                      🔓 Скасувати резервування
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      className="btn-save" 
                      onClick={async () => {
                        if (window.confirm('Ви впевнені, що хочете зарезервувати це обладнання?')) {
                          await onReserve(equipment._id);
                          onClose();
                        }
                      }}
                    >
                      🔒 Зарезервувати
                    </button>
                  )}
                </>
              )}
              <button type="button" className="btn-cancel" onClick={onClose}>
                {readOnly ? 'Закрити' : 'Скасувати'}
              </button>
              {!readOnly && (
                <button type="submit" className="btn-save" disabled={loading}>
                  {loading ? 'Збереження...' : isNewEquipment ? 'Додати' : 'Зберегти'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Модалки QR та Історії */}
      {showQR && equipment && (
        <EquipmentQRModal
          equipment={equipment}
          onClose={() => setShowQR(false)}
        />
      )}

      {showHistory && equipment && (
        <EquipmentHistoryModal
          equipment={equipment}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

export default EquipmentEditModal;

