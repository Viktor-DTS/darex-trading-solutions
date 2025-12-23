import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import EquipmentScanner from './EquipmentScanner';
import EquipmentFileUpload from './EquipmentFileUpload';
import './EquipmentEditModal.css';

function EquipmentEditModal({ equipment, warehouses, user, onClose, onSuccess }) {
  const [formData, setFormData] = useState({});
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
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
        manufactureDate: equipment.manufactureDate ? new Date(equipment.manufactureDate).toISOString().split('T')[0] : ''
      });
    } else {
      // Ініціалізація для нового обладнання
      setFormData({
        manufacturer: '',
        type: '',
        serialNumber: '',
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
        manufactureDate: ''
      });
    }
  }, [equipment, user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Підготовка даних для відправки
      const updateData = { ...formData };
      
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
          <h2>{isNewEquipment ? 'Додати обладнання від постачальників' : 'Редагувати обладнання'}</h2>
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

            <div className="form-section" style={{ marginBottom: '20px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowScanner(true)}
                style={{ width: '100%', padding: '12px', fontSize: '16px' }}
              >
                📷 Сканувати шильдик
              </button>
            </div>

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
                />
              </div>
              <div className="form-group">
                <label>Серійний номер *</label>
                <input
                  type="text"
                  name="serialNumber"
                  value={formData.serialNumber}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Склад *</label>
                <select
                  name="currentWarehouse"
                  value={formData.currentWarehouse}
                  onChange={handleChange}
                  required
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
                />
              </div>
            </div>
          </div>

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

          <div className="form-section">
            <h3>Документи та фото</h3>
            <EquipmentFileUpload
              onFilesChange={setAttachedFiles}
              uploadedFiles={attachedFiles}
            />
          </div>

            <div className="equipment-edit-footer">
              <button type="button" className="btn-cancel" onClick={onClose}>
                Скасувати
              </button>
              <button type="submit" className="btn-save" disabled={loading}>
                {loading ? 'Збереження...' : isNewEquipment ? 'Додати' : 'Зберегти'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default EquipmentEditModal;

