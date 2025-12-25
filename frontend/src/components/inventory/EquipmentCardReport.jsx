import React, { useState, useEffect, useRef } from 'react';
import API_BASE_URL from '../../config';
import { exportStockReportToPDF } from '../../utils/pdfExport';
import './Documents.css';

function EquipmentCardReport() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Пошук обладнання при введенні символів
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const timeoutId = setTimeout(() => {
        searchEquipment();
      }, 300); // Затримка 300мс для зменшення кількості запитів

      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
      setShowSuggestions(false);
    }
  }, [searchQuery]);

  // Закриття підказок при кліку поза ними
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchEquipment = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('search', searchQuery);
      
      // Виключаємо партійне обладнання (якщо batchId є, це партійне)
      const response = await fetch(`${API_BASE_URL}/equipment?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        // Виключаємо тільки видалене обладнання
        // Партійне обладнання теж показуємо
        const availableEquipment = data.filter(eq => !eq.deleted);
        setSearchResults(availableEquipment);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Помилка пошуку обладнання:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEquipment = (equipment) => {
    setSelectedEquipment(equipment);
    setSearchQuery(equipment.type || equipment.serialNumber || '');
    setShowSuggestions(false);
    loadEquipmentDetails(equipment._id);
  };

  const loadEquipmentDetails = async (equipmentId) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/${equipmentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedEquipment(data);
      }
    } catch (error) {
      console.error('Помилка завантаження деталей обладнання:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!selectedEquipment) return;
    
    try {
      await exportStockReportToPDF([selectedEquipment], 'Картка товару');
    } catch (error) {
      console.error('Помилка експорту в PDF:', error);
      alert('Помилка експорту в PDF');
    }
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="documents-container">
      <div className="documents-header">
        <h2>📋 Картка товару</h2>
        {selectedEquipment && (
          <button className="btn-primary" onClick={handleExportPDF}>
            📄 Експорт в PDF
          </button>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ position: 'relative', maxWidth: '600px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Пошук обладнання (назва або заводський номер)
          </label>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedEquipment(null);
            }}
            onFocus={() => {
              if (searchResults.length > 0) {
                setShowSuggestions(true);
              }
            }}
            placeholder="Введіть назву або серійний номер обладнання..."
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '14px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              boxSizing: 'border-box'
            }}
          />
          
          {loading && (
            <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
              <span>Завантаження...</span>
            </div>
          )}

          {/* Підказки автодоповнення */}
          {showSuggestions && searchResults.length > 0 && (
            <div
              ref={suggestionsRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '6px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                maxHeight: '300px',
                overflowY: 'auto',
                zIndex: 1000,
                marginTop: '4px',
                color: '#000'
              }}
            >
              {searchResults.map((eq) => (
                <div
                  key={eq._id}
                  onClick={() => handleSelectEquipment(eq)}
                  style={{
                    padding: '10px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #eee',
                    transition: 'background-color 0.2s',
                    color: '#000'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                    e.currentTarget.style.color = '#000';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.color = '#000';
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: '#000' }}>{eq.type || 'Без типу'}</div>
                  {eq.serialNumber && (
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Серійний номер: {eq.serialNumber}
                    </div>
                  )}
                  {eq.currentWarehouseName && (
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Склад: {eq.currentWarehouseName}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showSuggestions && searchResults.length === 0 && searchQuery.length >= 2 && !loading && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '6px',
                padding: '10px',
                marginTop: '4px',
                zIndex: 1000,
                color: '#000'
              }}
            >
              Обладнання не знайдено
            </div>
          )}
        </div>
      </div>

      {/* Детальна інформація про обладнання */}
      {selectedEquipment && (
        <div style={{ marginTop: '30px' }}>
          <h3 style={{ marginBottom: '20px' }}>Детальна інформація</h3>
          
          <div className="documents-table">
            <table>
              <tbody>
                <tr>
                  <th style={{ width: '200px' }}>Тип обладнання</th>
                  <td>{selectedEquipment.type || '—'}</td>
                </tr>
                <tr>
                  <th>Виробник</th>
                  <td>{selectedEquipment.manufacturer || '—'}</td>
                </tr>
                <tr>
                  <th>Серійний номер</th>
                  <td>{selectedEquipment.serialNumber || '—'}</td>
                </tr>
                <tr>
                  <th>Поточний склад</th>
                  <td>{selectedEquipment.currentWarehouseName || '—'}</td>
                </tr>
                <tr>
                  <th>Статус</th>
                  <td>
                    <span className={`status-badge ${
                      selectedEquipment.status === 'in_stock' ? 'status-completed' :
                      selectedEquipment.status === 'reserved' ? 'status-delivered' :
                      selectedEquipment.status === 'shipped' ? 'status-cancelled' :
                      'status-completed'
                    }`}>
                      {selectedEquipment.status === 'in_stock' ? 'На складі' :
                       selectedEquipment.status === 'reserved' ? 'Зарезервовано' :
                       selectedEquipment.status === 'shipped' ? 'Відвантажено' :
                       selectedEquipment.status || '—'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th>Резервна потужність</th>
                  <td>{selectedEquipment.standbyPower || '—'}</td>
                </tr>
                <tr>
                  <th>Основна потужність</th>
                  <td>{selectedEquipment.primePower || '—'}</td>
                </tr>
                <tr>
                  <th>Фази</th>
                  <td>{selectedEquipment.phase || '—'}</td>
                </tr>
                <tr>
                  <th>Напруга</th>
                  <td>{selectedEquipment.voltage || '—'}</td>
                </tr>
                <tr>
                  <th>Струм (A)</th>
                  <td>{selectedEquipment.amperage || '—'}</td>
                </tr>
                <tr>
                  <th>RPM</th>
                  <td>{selectedEquipment.rpm || '—'}</td>
                </tr>
                <tr>
                  <th>Розміри (мм)</th>
                  <td>{selectedEquipment.dimensions || '—'}</td>
                </tr>
                <tr>
                  <th>Вага (кг)</th>
                  <td>{selectedEquipment.weight || '—'}</td>
                </tr>
                <tr>
                  <th>Дата виробництва</th>
                  <td>{selectedEquipment.manufactureDate ? formatDate(selectedEquipment.manufactureDate) : '—'}</td>
                </tr>
                <tr>
                  <th>Дата додавання</th>
                  <td>{selectedEquipment.addedAt ? formatDate(selectedEquipment.addedAt) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Історія руху */}
          {selectedEquipment.movementHistory && selectedEquipment.movementHistory.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3 style={{ marginBottom: '20px' }}>Історія руху</h3>
              <div className="documents-table">
                <table>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Зі складу</th>
                      <th>На склад</th>
                      <th>Причина</th>
                      <th>Виконав</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEquipment.movementHistory.map((movement, index) => (
                      <tr key={index}>
                        <td>{formatDate(movement.date)}</td>
                        <td>{movement.fromWarehouseName || '—'}</td>
                        <td>{movement.toWarehouseName || '—'}</td>
                        <td>{movement.reason || '—'}</td>
                        <td>{movement.movedByName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Історія відвантажень */}
          {selectedEquipment.shipmentHistory && selectedEquipment.shipmentHistory.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <h3 style={{ marginBottom: '20px' }}>Історія відвантажень</h3>
              <div className="documents-table">
                <table>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Отримувач</th>
                      <th>Номер замовлення</th>
                      <th>Номер рахунку</th>
                      <th>Відвантажив</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEquipment.shipmentHistory.map((shipment, index) => (
                      <tr key={index}>
                        <td>{formatDate(shipment.shippedDate)}</td>
                        <td>{shipment.shippedTo || '—'}</td>
                        <td>{shipment.orderNumber || '—'}</td>
                        <td>{shipment.invoiceNumber || '—'}</td>
                        <td>{shipment.shippedByName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedEquipment && searchQuery.length < 2 && (
        <div className="empty-state">
          <p>Введіть назву або серійний номер обладнання для пошуку</p>
        </div>
      )}
    </div>
  );
}

export default EquipmentCardReport;

