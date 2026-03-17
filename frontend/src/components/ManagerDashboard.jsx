import React, { useState, useEffect, useRef } from 'react';
import API_BASE_URL from '../config';
import EquipmentList from './equipment/EquipmentList';
import ClientsTab from './manager/ClientsTab';
import SalesTab from './manager/SalesTab';
import IncomingCallTab from './manager/IncomingCallTab';
import { getClients } from '../utils/clientsAPI';
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
  const [crmClients, setCrmClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
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

  const handleReserve = async (equipment) => {
    if (equipment.status === 'reserved') {
      alert('Це обладнання вже зарезервовано');
      return;
    }
    setSelectedEquipment(equipment);
    setReservationForm({ clientName: '', notes: '', endDate: '' });
    setClientSearch('');
    setShowReservationModal(true);
    try {
      const [crmData, tasksRes] = await Promise.all([
        getClients(),
        fetch(`${API_BASE_URL}/tasks?region=${user?.region || ''}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.ok ? r.json() : null).then(d => Array.isArray(d) ? d : (d?.tasks || [])).catch(() => [])
      ]);
      const crm = Array.isArray(crmData) ? crmData : crmData.clients || [];
      const tasks = Array.isArray(tasksRes) ? tasksRes : [];
      const fromTasks = tasks
        .filter(t => t.client || t.edrpou)
        .map(t => ({ name: t.client || '', edrpou: t.edrpou || '', _id: `task-${t._id || Math.random()}`, _source: 'tasks' }));
      const seen = new Set();
      const merged = [...crm.map(c => ({ ...c, name: c.name || '', edrpou: c.edrpou || '', _source: 'crm' }))];
      fromTasks.forEach(t => {
        const key = `${(t.name || '').toLowerCase()}|${t.edrpou || ''}`;
        if (!seen.has(key) && (t.name || t.edrpou)) {
          seen.add(key);
          if (!merged.some(m => (m.name || '').toLowerCase() === (t.name || '').toLowerCase() && (m.edrpou || '') === (t.edrpou || ''))) {
            merged.push(t);
          }
        }
      });
      setCrmClients(merged);
    } catch {
      setCrmClients([]);
    }
  };

  const searchLower = (clientSearch || '').toLowerCase().trim();
  const filteredReservationClients = crmClients.filter(c => {
    if (!c.name && !c.edrpou) return false;
    if (!searchLower) return true;
    return (c.name || '').toLowerCase().includes(searchLower) || (c.edrpou || '').includes(clientSearch);
  });

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
              <button 
                className={`manager-sidebar-tab ${activeTab === 'clients' ? 'active' : ''}`}
                onClick={() => setActiveTab('clients')}
              >
                <span className="tab-icon">👥</span>
                <span className="tab-label">Мої клієнти</span>
              </button>
              <button 
                className={`manager-sidebar-tab ${activeTab === 'sales' ? 'active' : ''}`}
                onClick={() => setActiveTab('sales')}
              >
                <span className="tab-icon">💰</span>
                <span className="tab-label">Продажі</span>
              </button>
              <button 
                className={`manager-sidebar-tab ${activeTab === 'incoming' ? 'active' : ''}`}
                onClick={() => setActiveTab('incoming')}
              >
                <span className="tab-icon">📞</span>
                <span className="tab-label">Вхідний дзвінок</span>
              </button>
            </nav>
          </div>
        </aside>

        <main className="manager-main-content">
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : (
            <div className="manager-scaled-wrapper">
          {activeTab === 'clients' ? (
            <div className="manager-scaled-inner">
              <ClientsTab user={user} />
            </div>
          ) : activeTab === 'sales' ? (
            <div className="manager-scaled-inner">
              <SalesTab user={user} />
            </div>
          ) : activeTab === 'incoming' ? (
            <div className="manager-scaled-inner">
              <IncomingCallTab user={user} />
            </div>
          ) : activeTab === 'stock' ? (
            <div className="manager-stock-scaled">
              <div className="manager-header">
                <h2>Залишки на складах</h2>
              </div>
              <div className="manager-table-viewport">
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
            <div className="manager-scaled-inner">
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
              </div>
          )}
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
                  <div className="client-autocomplete">
                    <input
                      type="text"
                      value={clientSearch || reservationForm.clientName}
                      onChange={(e) => {
                        const v = e.target.value;
                        setClientSearch(v);
                        setReservationForm(prev => ({ ...prev, clientName: v }));
                        setShowClientDropdown(true);
                      }}
                      onFocus={() => setShowClientDropdown(crmClients.length > 0)}
                      onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                      placeholder="Введіть назву або ЄДРПОУ, оберіть з CRM або заявок"
                      required
                      autoFocus
                    />
                    {showClientDropdown && crmClients.length > 0 && (
                      <ul className="client-dropdown">
                        {filteredReservationClients.slice(0, 8).map(c => (
                          <li key={c._id} onMouseDown={() => {
                            setReservationForm(prev => ({ ...prev, clientName: c.name || c.edrpou }));
                            setClientSearch(c.name || c.edrpou);
                            setShowClientDropdown(false);
                          }}>
                            {c.name || c.edrpou}{c.edrpou ? ` (ЄДРПОУ: ${c.edrpou})` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
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

