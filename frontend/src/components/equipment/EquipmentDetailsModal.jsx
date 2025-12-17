import React from 'react';
import './EquipmentDetailsModal.css';

function EquipmentDetailsModal({ equipment, onClose, isPage = false }) {
  // Захист від null/undefined
  if (!equipment || typeof equipment !== 'object') {
    return null;
  }

  const formatValue = (value) => {
    if (value == null || value === '') return 'не визначено';
    return String(value);
  };

  const formatDate = (value) => {
    if (!value) return 'не визначено';
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('uk-UA');
      }
    } catch (e) {}
    return formatValue(value);
  };

  const getStatusLabel = (status) => {
    if (!status) return 'не визначено';
    const labels = {
      'in_stock': 'На складі',
      'reserved': 'Зарезервовано',
      'shipped': 'Відвантажено',
      'in_transit': 'В дорозі'
    };
    return labels[status] || status;
  };

  const containerClass = isPage 
    ? 'equipment-details-page' 
    : 'equipment-details-modal-overlay';
  const contentClass = isPage
    ? 'equipment-details-page-content'
    : 'equipment-details-modal';

  return (
    <div className={containerClass} onClick={isPage ? undefined : onClose}>
      <div className={contentClass} onClick={(e) => !isPage && e.stopPropagation()}>
        <div className="equipment-details-header">
          <h2>Інформація про обладнання</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="equipment-details-body">
          <div className="details-section">
            <h3>Основна інформація</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Виробник:</span>
                <span className="detail-value">{formatValue(equipment.manufacturer)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Тип обладнання:</span>
                <span className="detail-value">{formatValue(equipment.type)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Серійний номер:</span>
                <span className="detail-value">{formatValue(equipment.serialNumber)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Склад:</span>
                <span className="detail-value">{formatValue(equipment.currentWarehouseName || equipment.currentWarehouse)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Статус:</span>
                <span className="detail-value">{getStatusLabel(equipment.status)}</span>
              </div>
            </div>
          </div>

          <div className="details-section">
            <h3>Технічні характеристики</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Резервна потужність:</span>
                <span className="detail-value">{formatValue(equipment.standbyPower)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Основна потужність:</span>
                <span className="detail-value">{formatValue(equipment.primePower)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Фази:</span>
                <span className="detail-value">{formatValue(equipment.phase)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Напруга:</span>
                <span className="detail-value">{formatValue(equipment.voltage)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Струм (A):</span>
                <span className="detail-value">{formatValue(equipment.amperage)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">RPM:</span>
                <span className="detail-value">{formatValue(equipment.rpm)}</span>
              </div>
            </div>
          </div>

          <div className="details-section">
            <h3>Фізичні параметри</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Розміри (мм):</span>
                <span className="detail-value">{formatValue(equipment.dimensions)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Вага (кг):</span>
                <span className="detail-value">{formatValue(equipment.weight)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Дата виробництва:</span>
                <span className="detail-value">{formatDate(equipment.manufactureDate)}</span>
              </div>
            </div>
          </div>

          {equipment.region && (
            <div className="details-section">
              <h3>Додаткова інформація</h3>
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">Регіон:</span>
                  <span className="detail-value">{formatValue(equipment.region)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="equipment-details-footer">
          <button className="btn-close" onClick={onClose}>Закрити</button>
        </div>
      </div>
    </div>
  );
}

export default EquipmentDetailsModal;

