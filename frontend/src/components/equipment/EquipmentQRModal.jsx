import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './EquipmentQRModal.css';

function EquipmentQRModal({ equipment, onClose }) {
  const qrValue = `${window.location.origin}/equipment/${equipment._id || equipment.serialNumber}`;
  
  const handleDownload = () => {
    const svg = document.getElementById('equipment-qr-code');
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      
      const downloadLink = document.createElement('a');
      downloadLink.download = `QR_${equipment.serialNumber || equipment._id}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📱 QR-код обладнання</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="qr-content">
            <div className="qr-code-container">
              <div id="equipment-qr-code">
                <QRCodeSVG
                  value={qrValue}
                  size={256}
                  level="H"
                  includeMargin={true}
                />
              </div>
            </div>
            
            <div className="qr-info">
              <div className="qr-info-item">
                <span className="qr-label">Тип:</span>
                <span className="qr-value">{equipment.type || '—'}</span>
              </div>
              <div className="qr-info-item">
                <span className="qr-label">Серійний номер:</span>
                <span className="qr-value">{equipment.serialNumber || '—'}</span>
              </div>
              <div className="qr-info-item">
                <span className="qr-label">Склад:</span>
                <span className="qr-value">{equipment.currentWarehouseName || equipment.currentWarehouse || '—'}</span>
              </div>
            </div>
          </div>

          <div className="qr-actions">
            <button className="btn-secondary" onClick={onClose}>
              Закрити
            </button>
            <button className="btn-primary" onClick={handleDownload}>
              📥 Завантажити QR-код
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EquipmentQRModal;

