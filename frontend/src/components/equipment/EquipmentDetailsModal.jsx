import React from 'react';
import { openImageGalleryWindow } from '../../utils/imageGalleryWindow';
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
      'in_transit': 'В дорозі',
      'sold': 'Продано'
    };
    return labels[status] || status;
  };

  const hasSaleInfo = equipment.status === 'sold' || equipment.soldDate || equipment.warrantyUntil || equipment.saleAmount;

  // Функція для відкриття галереї зображень
  const openGalleryInNewWindow = (files, startIndex = 0) => {
    const imageFiles = files.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
    if (imageFiles.length === 0) return;

    openImageGalleryWindow(
      imageFiles.map(f => ({ url: f.cloudinaryUrl, name: f.originalName || 'Фото', description: '' })),
      startIndex
    );
  };

  // Обробник перегляду файлу
  const handleViewFile = (file, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    const isImage = file.mimetype && file.mimetype.startsWith('image/');
    
    if (isImage) {
      // Відкриваємо зображення в новому вікні з галереєю
      const imageFiles = equipment.attachedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
      const imageIndex = imageFiles.findIndex(f => 
        (f._id && file._id && f._id === file._id) || 
        (f.cloudinaryId && file.cloudinaryId && f.cloudinaryId === file.cloudinaryId) ||
        (f.cloudinaryUrl === file.cloudinaryUrl)
      );
      openGalleryInNewWindow(equipment.attachedFiles, imageIndex >= 0 ? imageIndex : 0);
    } else {
      // Для не-зображень відкриваємо в новій вкладці
      window.open(file.cloudinaryUrl, '_blank');
    }
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

          {hasSaleInfo && (
            <div className="details-section sale-info-section">
              <h3>💰 Продаж та гарантія</h3>
              <div className="details-grid">
                {equipment.soldDate && (
                  <div className="detail-item">
                    <span className="detail-label">Дата продажу:</span>
                    <span className="detail-value">{formatDate(equipment.soldDate)}</span>
                  </div>
                )}
                {equipment.saleAmount != null && equipment.saleAmount > 0 && (
                  <div className="detail-item">
                    <span className="detail-label">Сума продажу:</span>
                    <span className="detail-value">
                      {new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(equipment.saleAmount)}
                    </span>
                  </div>
                )}
                {equipment.warrantyUntil && (
                  <div className="detail-item">
                    <span className="detail-label">Гарантія до:</span>
                    <span className="detail-value">{formatDate(equipment.warrantyUntil)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

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

          {equipment.attachedFiles && Array.isArray(equipment.attachedFiles) && equipment.attachedFiles.length > 0 && (
            <div className="details-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3>Документи та фото ({equipment.attachedFiles.length})</h3>
                {equipment.attachedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/')).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const imageFiles = equipment.attachedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
                      openGalleryInNewWindow(equipment.attachedFiles, 0);
                    }}
                    style={{
                      background: '#0f3460',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                    title="Відкрити галерею зображень"
                  >
                    🖼️ Галерея ({equipment.attachedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/')).length})
                  </button>
                )}
              </div>
              <div className="attached-files-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px', marginTop: '15px' }}>
                {equipment.attachedFiles.map((file, index) => {
                  const isImage = file.mimetype && file.mimetype.startsWith('image/');
                  return (
                    <div key={file._id || file.cloudinaryId || index} className="file-item" style={{ 
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
                          onClick={(e) => handleViewFile(file, e)}
                        />
                      ) : (
                        <div style={{ 
                          fontSize: '48px', 
                          marginBottom: '10px',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => handleViewFile(file, e)}
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
                      onClick={(e) => handleViewFile(file, e)}
                      title={file.originalName}
                      >
                        {file.originalName || 'Файл'}
                      </div>
                      {file.size && (
                        <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>
                          {(file.size / 1024).toFixed(2)} KB
                        </div>
                      )}
                    </div>
                  );
                })}
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

