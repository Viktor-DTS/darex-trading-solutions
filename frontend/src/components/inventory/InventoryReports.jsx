import React, { useState } from 'react';
import API_BASE_URL from '../../config';
import { exportEquipmentToExcel } from '../../utils/equipmentExport';
import { exportStockReportToPDF, exportMovementReportToPDF, exportCostReportToPDF } from '../../utils/pdfExport';
import './Documents.css';

function InventoryReports({ warehouses }) {
  const [reportType, setReportType] = useState('');
  const [reportParams, setReportParams] = useState({
    warehouse: '',
    dateFrom: '',
    dateTo: '',
    equipmentId: '',
    costMethod: 'average' // average, fifo, lifo
  });
  const [generating, setGenerating] = useState(false);

  const handleGenerateReport = async (type) => {
    setGenerating(true);
    try {
      const token = localStorage.getItem('token');
      
      switch (type) {
        case 'stock':
          // Експорт залишків
          const stockResponse = await fetch(`${API_BASE_URL}/equipment?warehouse=${reportParams.warehouse || ''}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (stockResponse.ok) {
            const equipment = await stockResponse.json();
            const warehouseName = reportParams.warehouse 
              ? warehouses.find(w => w._id === reportParams.warehouse)?.name || 'Всі склади'
              : 'Всі склади';
            
            // Пропонуємо вибір формату
            const format = window.confirm('Експортувати в Excel? (OK - Excel, Cancel - PDF)');
            if (format) {
              await exportEquipmentToExcel(equipment, 'Залишки_на_складах');
            } else {
              exportStockReportToPDF(equipment, warehouseName);
            }
          }
          break;
          
        case 'movement':
          // Звіт про рух товарів
          const movementParams = new URLSearchParams();
          if (reportParams.warehouse) movementParams.append('warehouse', reportParams.warehouse);
          if (reportParams.dateFrom) movementParams.append('dateFrom', reportParams.dateFrom);
          if (reportParams.dateTo) movementParams.append('dateTo', reportParams.dateTo);
          
          const movementResponse = await fetch(`${API_BASE_URL}/documents/movement?${movementParams}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (movementResponse.ok) {
            const movements = await movementResponse.json();
            exportMovementReportToPDF(movements, reportParams.dateFrom, reportParams.dateTo);
          }
          break;
          
        case 'cost':
          // Вартісний облік
          const costResponse = await fetch(`${API_BASE_URL}/equipment/cost-report?warehouse=${reportParams.warehouse || ''}&method=${reportParams.costMethod}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (costResponse.ok) {
            const costData = await costResponse.json();
            exportCostReportToPDF(costData);
          }
          break;
          
        default:
          alert('Оберіть тип звіту');
      }
    } catch (error) {
      console.error('Помилка формування звіту:', error);
      alert('Помилка формування звіту');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="inventory-tab-content">
      <div className="inventory-header">
        <h2>Звіти по складському обліку</h2>
        <p className="inventory-description">
          Формування та перегляд звітів по складському обліку
        </p>
      </div>

      <div className="reports-grid">
        <div className="report-card">
          <h3>📊 Залишки на складах</h3>
          <p>Детальний звіт про залишки товарів на всіх складах</p>
          <div className="report-params" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <select
              value={reportParams.warehouse}
              onChange={(e) => setReportParams({ ...reportParams, warehouse: e.target.value })}
            >
              <option value="">Всі склади</option>
              {warehouses.map(w => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
            <button
              className="btn-secondary"
              onClick={() => handleGenerateReport('stock')}
              disabled={generating}
            >
              {generating ? 'Формування...' : 'Сформувати звіт (Excel/PDF)'}
            </button>
          </div>
        </div>

        <div className="report-card">
          <h3>📥 Рух товарів</h3>
          <p>Звіт про рух товарів за період</p>
          <div className="report-params" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <select
              value={reportParams.warehouse}
              onChange={(e) => setReportParams({ ...reportParams, warehouse: e.target.value })}
            >
              <option value="">Всі склади</option>
              {warehouses.map(w => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={reportParams.dateFrom}
              onChange={(e) => setReportParams({ ...reportParams, dateFrom: e.target.value })}
              placeholder="Дата від"
            />
            <input
              type="date"
              value={reportParams.dateTo}
              onChange={(e) => setReportParams({ ...reportParams, dateTo: e.target.value })}
              placeholder="Дата до"
            />
            <button
              className="btn-secondary"
              onClick={() => handleGenerateReport('movement')}
              disabled={generating}
            >
              {generating ? 'Формування...' : 'Сформувати звіт (PDF)'}
            </button>
          </div>
        </div>

        <div className="report-card">
          <h3>📦 Оборотна відомість</h3>
          <p>Оборотна відомість по складах</p>
          <div className="report-params" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <select
              value={reportParams.warehouse}
              onChange={(e) => setReportParams({ ...reportParams, warehouse: e.target.value })}
            >
              <option value="">Всі склади</option>
              {warehouses.map(w => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={reportParams.dateFrom}
              onChange={(e) => setReportParams({ ...reportParams, dateFrom: e.target.value })}
            />
            <input
              type="date"
              value={reportParams.dateTo}
              onChange={(e) => setReportParams({ ...reportParams, dateTo: e.target.value })}
            />
            <button className="btn-secondary">Сформувати звіт</button>
          </div>
        </div>

        <div className="report-card">
          <h3>💰 Вартісний облік</h3>
          <p>Звіт про вартість товарів на складах (FIFO, LIFO, Середня)</p>
          <div className="report-params" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <select
              value={reportParams.warehouse}
              onChange={(e) => setReportParams({ ...reportParams, warehouse: e.target.value })}
            >
              <option value="">Всі склади</option>
              {warehouses.map(w => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
            <select
              value={reportParams.costMethod}
              onChange={(e) => setReportParams({ ...reportParams, costMethod: e.target.value })}
            >
              <option value="average">Середня собівартість</option>
              <option value="fifo">FIFO (Перший прийшов - перший пішов)</option>
              <option value="lifo">LIFO (Останній прийшов - перший пішов)</option>
            </select>
            <button
              className="btn-secondary"
              onClick={() => handleGenerateReport('cost')}
              disabled={generating}
            >
              {generating ? 'Формування...' : 'Сформувати звіт (PDF)'}
            </button>
          </div>
        </div>

        <div className="report-card">
          <h3>📋 Картка товару</h3>
          <p>Детальна картка товару з історією руху</p>
          <div className="report-params" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="text"
              value={reportParams.equipmentId}
              onChange={(e) => setReportParams({ ...reportParams, equipmentId: e.target.value })}
              placeholder="ID обладнання"
            />
            <button className="btn-secondary">Сформувати звіт</button>
          </div>
        </div>

        <div className="report-card">
          <h3>🔄 Переміщення товарів</h3>
          <p>Звіт про переміщення товарів між складами</p>
          <div className="report-params" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <select
              value={reportParams.warehouse}
              onChange={(e) => setReportParams({ ...reportParams, warehouse: e.target.value })}
            >
              <option value="">Всі склади</option>
              {warehouses.map(w => (
                <option key={w._id} value={w._id}>{w.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={reportParams.dateFrom}
              onChange={(e) => setReportParams({ ...reportParams, dateFrom: e.target.value })}
            />
            <input
              type="date"
              value={reportParams.dateTo}
              onChange={(e) => setReportParams({ ...reportParams, dateTo: e.target.value })}
            />
            <button className="btn-secondary">Сформувати звіт</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InventoryReports;

