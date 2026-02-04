import React, { useState, useEffect, useRef } from 'react';
import API_BASE_URL from '../config';
import EquipmentList from './equipment/EquipmentList';
import './ManagerDashboard.css';

function ManagerDashboard({ user }) {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' або 'history'
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [reservationForm, setReservationForm] = useState({
    clientName: '',
    notes: '',
    endDate: ''
  });
  const [reservationLoading, setReservationLoading] = useState(false);
  const [reservationHistory, setReservationHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const equipmentListRef = useRef(null);

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadReservationHistory();
    }
  }, [activeTab]);

  const loadReservationHistory = async () => {
    try {
      setHistoryLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/reservation-history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setReservationHistory(data);
      }
    } catch (err) {
      console.error('Помилка завантаження історії:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadWarehouses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/warehouses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setWarehouses(data);
      }
    } catch (err) {
      console.error('Помилка завантаження складів:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReserve = (equipment) => {
    if (equipment.status === 'reserved') {
      alert('Це обладнання вже зарезервовано');
      return;
    }
    setSelectedEquipment(equipment);
    setReservationForm({ clientName: '', notes: '', endDate: '' });
    setShowReservationModal(true);
  };

  const handleReservationSubmit = async (e) => {
    e.preventDefault();
    
    if (!reservationForm.clientName.trim()) {
      alert('Введіть назву клієнта');
      return;
    }
    
    setReservationLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/${selectedEquipment._id}/reserve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientName: reservationForm.clientName,
          notes: reservationForm.notes,
          endDate: reservationForm.endDate || null
        })
      });
      
      if (response.ok) {
        alert('Обладнання успішно зарезервовано!');
        if (equipmentListRef.current) {
          equipmentListRef.current.refresh();
        }
        setShowReservationModal(false);
        setSelectedEquipment(null);
      } else {
        const error = await response.json();
        alert(error.error || 'Помилка резервування');
      }
    } catch (error) {
      console.error('Помилка:', error);
      alert('Помилка з\'єднання з сервером');
    } finally {
      setReservationLoading(false);
    }
  };

  const handleReservationSuccess = () => {
    // Оновлюємо список обладнання після успішного створення резервування
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
    setShowReservationModal(false);
    setSelectedEquipment(null);
  };

  const handleRequestTesting = async (equipment) => {
    if (!window.confirm(`Подати обладнання "${equipment.type}" (${equipment.serialNumber || 'без серійного номера'}) на тестування?`)) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/${equipment._id}/request-testing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        alert('Заявку на тестування подано успішно!');
        // Оновлюємо список
        if (equipmentListRef.current) {
          equipmentListRef.current.refresh();
        }
      } else {
        const error = await response.json();
        alert(error.error || 'Помилка подачі заявки на тестування');
      }
    } catch (error) {
      console.error('Помилка:', error);
      alert('Помилка з\'єднання з сервером');
    }
  };

  return (
    <div className="manager-dashboard">
      <div className="manager-dashboard-main">
        <aside className="manager-sidebar">
          <div className="manager-sidebar-scaled">
            <nav className="manager-sidebar-nav">
              <div className="sidebar-section-title">Менеджери</div>
              <button 
                className={`manager-sidebar-tab ${activeTab === 'stock' ? 'active' : ''}`}
                onClick={() => setActiveTab('stock')}
              >
                <span className="tab-icon">📦</span>
                <span className="tab-label">Залишки на складах</span>
              </button>
              <button 
                className={`manager-sidebar-tab ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                <span className="tab-icon">📋</span>
                <span className="tab-label">Історія резервування</span>
              </button>
            </nav>
          </div>
        </aside>

        <main className="manager-main-content">
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : (
            <div className="manager-scaled-wrapper">
              <div className="manager-scaled-inner">
          {activeTab === 'stock' ? (
            <div className="manager-tab-content">
              <div className="manager-header" style={{ flexShrink: 0 }}>
                <h2>Залишки на складах</h2>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <EquipmentList
                  ref={equipmentListRef}
                  user={user}
                  warehouses={warehouses}
                  onReserve={handleReserve}
                  onRequestTesting={handleRequestTesting}
                  showReserveAction={true}
                />
              </div>
            </div>
          ) : (
            <div className="manager-tab-content">
              <div className="manager-header" style={{ flexShrink: 0 }}>
                <h2>📋 Історія резервування</h2>
              </div>
              <div className="reservation-history-container">
                {historyLoading ? (
                  <div className="loading-indicator">Завантаження історії...</div>
                ) : reservationHistory.length === 0 ? (
                  <div className="no-history">Історія резервувань порожня</div>
                ) : (
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Дата і час</th>
                        <th>Дія</th>
                        <th>Обладнання</th>
                        <th>Серійний номер</th>
                        <th>Клієнт</th>
                        <th>Виконавець</th>
                        <th>Деталі</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservationHistory.map((record, index) => (
                        <tr key={index} className={record.action === 'reserved' ? 'row-reserved' : 'row-cancelled'}>
                          <td>
                            {new Date(record.date).toLocaleDateString('uk-UA', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td>
                            <span className={`action-badge ${record.action}`}>
                              {record.action === 'reserved' ? '🔒 Резервування' : '🔓 Зняття резерву'}
                            </span>
                          </td>
                          <td>{record.equipmentType || '—'}</td>
                          <td>{record.equipmentSerial || '—'}</td>
                          <td>{record.clientName || '—'}</td>
                          <td>{record.userName || '—'}</td>
                          <td>
                            {record.action === 'reserved' ? (
                              <>
                                {record.endDate && (
                                  <div>До: {new Date(record.endDate).toLocaleDateString('uk-UA')}</div>
                                )}
                                {record.notes && <div>Примітки: {record.notes}</div>}
                              </>
                            ) : (
                              <>
                                {record.cancelReason === 'expired' && <span className="cancel-reason expired">⏰ Автоматично (термін)</span>}
                                {record.cancelReason === 'admin' && <span className="cancel-reason admin">👔 Адміністратор</span>}
                                {record.cancelReason === 'manual' && <span className="cancel-reason manual">👤 Власник</span>}
                                {record.cancelledByName && record.cancelledByName !== record.userName && (
                                  <div>Резервував: {record.cancelledByName}</div>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
              </div>
          </div>
        )}
        </main>
      </div>

      {/* Модальне вікно для резервування */}
      {showReservationModal && selectedEquipment && (
        <div className="modal-overlay" onClick={() => setShowReservationModal(false)}>
          <div className="modal-content reservation-form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔒 Резервування обладнання</h3>
              <button className="btn-close" onClick={() => setShowReservationModal(false)}>×</button>
            </div>
            
            <form onSubmit={handleReservationSubmit}>
              <div className="modal-body">
                <div className="equipment-info-block">
                  <div><strong>Тип:</strong> {selectedEquipment.type}</div>
                  <div><strong>Серійний номер:</strong> {selectedEquipment.serialNumber || '—'}</div>
                  <div><strong>Виробник:</strong> {selectedEquipment.manufacturer || '—'}</div>
                  <div><strong>Склад:</strong> {selectedEquipment.currentWarehouseName || selectedEquipment.currentWarehouse || '—'}</div>
                </div>
                
                <div className="form-group">
                  <label>Назва клієнта <span className="required">*</span></label>
                  <input
                    type="text"
                    value={reservationForm.clientName}
                    onChange={(e) => setReservationForm(prev => ({ ...prev, clientName: e.target.value }))}
                    placeholder="Введіть назву клієнта"
                    required
                    autoFocus
                  />
                </div>
                
                <div className="form-group">
                  <label>Дата закінчення резервування</label>
                  <input
                    type="date"
                    value={reservationForm.endDate}
                    onChange={(e) => setReservationForm(prev => ({ ...prev, endDate: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                
                <div className="form-group">
                  <label>Примітки</label>
                  <textarea
                    value={reservationForm.notes}
                    onChange={(e) => setReservationForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Введіть примітки (необов'язково)"
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn-cancel"
                  onClick={() => setShowReservationModal(false)}
                  disabled={reservationLoading}
                >
                  Скасувати
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={reservationLoading || !reservationForm.clientName.trim()}
                >
                  {reservationLoading ? 'Резервування...' : '🔒 Зарезервувати'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagerDashboard;

