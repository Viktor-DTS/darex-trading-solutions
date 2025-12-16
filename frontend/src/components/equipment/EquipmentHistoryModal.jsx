import React from 'react';
import { exportEquipmentHistoryToExcel } from '../../utils/equipmentExport';
import './EquipmentHistoryModal.css';

function EquipmentHistoryModal({ equipment, onClose }) {
  const getStatusLabel = (status) => {
    const labels = {
      'in_stock': 'На складі',
      'reserved': 'Зарезервовано',
      'shipped': 'Відвантажено',
      'in_transit': 'В дорозі'
    };
    return labels[status] || status;
  };

  const handleExport = async () => {
    await exportEquipmentHistoryToExcel(equipment, 'equipment_history');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📋 Історія обладнання</h2>
          <div className="header-actions">
            <button className="btn-export-small" onClick={handleExport}>
              📊 Експорт
            </button>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          {/* Інформація про обладнання */}
          <div className="equipment-details">
            <h3>Основна інформація</h3>
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Тип:</span>
                <span className="detail-value">{equipment.type || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Серійний номер:</span>
                <span className="detail-value">{equipment.serialNumber || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Виробник:</span>
                <span className="detail-value">{equipment.manufacturer || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Поточний склад:</span>
                <span className="detail-value">{equipment.currentWarehouseName || equipment.currentWarehouse || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Статус:</span>
                <span className={`detail-value status-badge status-${equipment.status}`}>
                  {getStatusLabel(equipment.status)}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Додано:</span>
                <span className="detail-value">
                  {equipment.addedAt ? new Date(equipment.addedAt).toLocaleString('uk-UA') : '—'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Додав:</span>
                <span className="detail-value">{equipment.addedByName || equipment.addedBy || '—'}</span>
              </div>
            </div>
          </div>

          {/* Історія переміщень */}
          {equipment.movementHistory && equipment.movementHistory.length > 0 && (
            <div className="history-section">
              <h3>📦 Історія переміщень ({equipment.movementHistory.length})</h3>
              <div className="history-timeline">
                {equipment.movementHistory
                  .slice()
                  .reverse()
                  .map((move, index) => (
                    <div key={index} className="timeline-item">
                      <div className="timeline-marker" />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-date">
                            {move.date ? new Date(move.date).toLocaleString('uk-UA') : '—'}
                          </span>
                          <span className="timeline-user">{move.movedByName || move.movedBy || '—'}</span>
                        </div>
                        <div className="timeline-body">
                          <div className="move-path">
                            <span className="move-from">{move.fromWarehouseName || move.fromWarehouse || '—'}</span>
                            <span className="move-arrow">→</span>
                            <span className="move-to">{move.toWarehouseName || move.toWarehouse || '—'}</span>
                          </div>
                          {move.reason && (
                            <div className="timeline-reason">
                              <strong>Причина:</strong> {move.reason}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Історія відвантажень */}
          {equipment.shipmentHistory && equipment.shipmentHistory.length > 0 && (
            <div className="history-section">
              <h3>🚚 Історія відвантажень ({equipment.shipmentHistory.length})</h3>
              <div className="history-timeline">
                {equipment.shipmentHistory
                  .slice()
                  .reverse()
                  .map((ship, index) => (
                    <div key={index} className="timeline-item shipment-item">
                      <div className="timeline-marker shipment-marker" />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <span className="timeline-date">
                            {ship.shippedDate ? new Date(ship.shippedDate).toLocaleString('uk-UA') : '—'}
                          </span>
                          <span className="timeline-user">{ship.shippedByName || ship.shippedBy || '—'}</span>
                        </div>
                        <div className="timeline-body">
                          <div className="shipment-info">
                            <div><strong>Замовник:</strong> {ship.shippedTo || '—'}</div>
                            {ship.clientEdrpou && <div><strong>ЄДРПОУ:</strong> {ship.clientEdrpou}</div>}
                            {ship.orderNumber && <div><strong>Номер замовлення:</strong> {ship.orderNumber}</div>}
                            {ship.invoiceNumber && <div><strong>Номер рахунку:</strong> {ship.invoiceNumber}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {(!equipment.movementHistory || equipment.movementHistory.length === 0) &&
           (!equipment.shipmentHistory || equipment.shipmentHistory.length === 0) && (
            <div className="empty-history">
              <p>Історія відсутня</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

export default EquipmentHistoryModal;

