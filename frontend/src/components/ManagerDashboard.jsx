import React, { useState, useEffect, useRef, useMemo } from 'react';
import API_BASE_URL from '../config';
import EquipmentList from './equipment/EquipmentList';
import CategoryTree from './equipment/CategoryTree';
import ClientsTab from './manager/ClientsTab';
import SalesTab from './manager/SalesTab';
import SalesReportTab from './manager/SalesReportTab';
import IncomingCallTab from './manager/IncomingCallTab';
import { getClients } from '../utils/clientsAPI';
import './ManagerDashboard.css';

const canSeeReservationClient = (role) => 
  ['admin', 'administrator', 'mgradm'].includes((role || '').toLowerCase());

const RESERVATION_BASIS_OPTIONS = [
  'В процесі домовленості з клієнтом',
  'Під тендер',
  'Зарезервовано за договором'
];

const RESERVATION_DAYS_COEFFICIENT_IDS = {
  'В процесі домовленості з клієнтом': 'reservation_days_negotiation',
  'Під тендер': 'reservation_days_tender',
  'Зарезервовано за договором': 'reservation_days_contract'
};

/** Додає календарні дні до дати YYYY-MM-DD (чиста арифметика дат, без годинника клієнта). */
function addDaysToYmd(startYmd, days) {
  const [y, m, day] = startYmd.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() + Math.max(0, Math.round(Number(days) || 0)));
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function endDateAfterDaysFromServer(days, serverTodayYmd) {
  if (!serverTodayYmd) return '';
  return addDaysToYmd(serverTodayYmd, days);
}

function clampReservationEndDateYmd(endYmd, basis, daysByBasis, serverTodayYmd) {
  if (!serverTodayYmd) return endYmd || '';
  const maxDays = basis ? (daysByBasis[basis] ?? 0) : 0;
  const maxY = addDaysToYmd(serverTodayYmd, maxDays);
  let v = endYmd || '';
  if (v && v < serverTodayYmd) v = serverTodayYmd;
  if (v && v > maxY) v = maxY;
  return v;
}

function ManagerDashboard({ user }) {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' або 'history'
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [reservationForm, setReservationForm] = useState({
    clientName: '',
    edrpou: '',
    basis: '',
    notes: '',
    endDate: ''
  });
  /** Кількість днів резерву за підставою — з коефіцієнтів фінвідділу (продажі) */
  const [reservationDaysByBasis, setReservationDaysByBasis] = useState({});
  /** YYYY-MM-DD з бекенду (global-calculation-coefficients); null = ще завантажується */
  const [reservationServerTodayYmd, setReservationServerTodayYmd] = useState(null);
  const [reservationLoading, setReservationLoading] = useState(false);
  const [reservationHistory, setReservationHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [crmClients, setCrmClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [edrpouSearch, setEdrpouSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showEdrpouDropdown, setShowEdrpouDropdown] = useState(false);
  const equipmentListRef = useRef(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (activeTab !== 'stock') setSelectedCategoryId(null);
  }, [activeTab]);

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
    setReservationForm({ clientName: '', edrpou: '', basis: '', notes: '', endDate: '' });
    setReservationDaysByBasis({});
    setReservationServerTodayYmd(null);
    setClientSearch('');
    setEdrpouSearch('');
    setShowReservationModal(true);
    try {
      const token = localStorage.getItem('token');
      const [crmData, tasksRes, coeffRes] = await Promise.all([
        getClients(),
        fetch(`${API_BASE_URL}/tasks?region=${user?.region || ''}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.ok ? r.json() : null).then(d => Array.isArray(d) ? d : (d?.tasks || [])).catch(() => []),
        fetch(`${API_BASE_URL}/global-calculation-coefficients`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
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

      const salesRows = coeffRes?.sales?.rows || [];
      const daysMap = {};
      for (const label of RESERVATION_BASIS_OPTIONS) {
        const id = RESERVATION_DAYS_COEFFICIENT_IDS[label];
        const row = salesRows.find((r) => r.id === id);
        daysMap[label] =
          row != null && typeof row.value === 'number' && !Number.isNaN(row.value)
            ? Math.max(0, Math.round(row.value))
            : 0;
      }
      setReservationDaysByBasis(daysMap);

      const srv = coeffRes?.serverTodayYmd;
      setReservationServerTodayYmd(
        typeof srv === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(srv) ? srv : ''
      );
    } catch {
      setCrmClients([]);
      setReservationDaysByBasis({});
      setReservationServerTodayYmd('');
    }
  };

  const handleSelectClient = (c) => {
    const name = c.name || c.edrpou || '';
    const edrpou = c.edrpou || '';
    setReservationForm(prev => ({ ...prev, clientName: name, edrpou }));
    setClientSearch(name);
    setEdrpouSearch(edrpou);
    setShowClientDropdown(false);
    setShowEdrpouDropdown(false);
  };

  const searchTerm = (clientSearch || edrpouSearch || '').trim();
  const searchLower = searchTerm.toLowerCase();
  const filteredReservationClients = crmClients.filter(c => {
    if (!c.name && !c.edrpou) return false;
    if (!searchTerm) return true;
    return (c.name || '').toLowerCase().includes(searchLower) || (c.edrpou || '').includes(searchTerm);
  });
  const showDropdown = (showClientDropdown || showEdrpouDropdown) && filteredReservationClients.length > 0;

  const reservationEndDateMaxYmd = useMemo(() => {
    const b = reservationForm.basis;
    const srv = reservationServerTodayYmd;
    if (!b || !srv) return '';
    const days = reservationDaysByBasis[b] ?? 0;
    return addDaysToYmd(srv, days);
  }, [reservationForm.basis, reservationDaysByBasis, reservationServerTodayYmd]);

  const handleReservationSubmit = async (e) => {
    e.preventDefault();
    
    if (!reservationForm.clientName.trim()) {
      alert('Введіть назву клієнта');
      return;
    }
    if (!reservationForm.basis.trim()) {
      alert('Оберіть підставу резервування');
      return;
    }

    const srv = reservationServerTodayYmd;
    if (!srv) {
      alert(
        reservationServerTodayYmd === null
          ? 'Зачекайте завантаження даних з сервера'
          : 'Не вдалося отримати дату сервера. Закрийте вікно та спробуйте резервування ще раз.'
      );
      return;
    }

    const maxDays = reservationDaysByBasis[reservationForm.basis] ?? 0;
    const maxY = addDaysToYmd(srv, maxDays);
    if (reservationForm.endDate) {
      if (reservationForm.endDate < srv) {
        alert('Дата закінчення резервування не може бути раніше за поточну дату сервера');
        return;
      }
      if (reservationForm.endDate > maxY) {
        alert(
          `Дата закінчення не може перевищувати ${maxDays} дн. для обраної підстави (до ${maxY.split('-').reverse().join('.')})`
        );
        return;
      }
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
          edrpou: reservationForm.edrpou || undefined,
          notes: reservationForm.notes,
          endDate: reservationForm.endDate || null,
          reservationBasis: reservationForm.basis.trim()
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
                className={`manager-sidebar-tab ${activeTab === 'report' ? 'active' : ''}`}
                onClick={() => setActiveTab('report')}
              >
                <span className="tab-icon">📊</span>
                <span className="tab-label">Звіт по угодах</span>
              </button>
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
                className={`manager-sidebar-tab ${activeTab === 'incoming' ? 'active' : ''}`}
                onClick={() => setActiveTab('incoming')}
              >
                <span className="tab-icon">📞</span>
                <span className="tab-label">Перевірка клієнта</span>
              </button>
            </nav>
            {activeTab === 'stock' && (
              <div className="manager-sidebar-nomenclature">
                <CategoryTree
                  selectedId={selectedCategoryId}
                  onSelectCategory={(id) => setSelectedCategoryId(id)}
                  showAllOption
                  managerCategoryContext
                />
              </div>
            )}
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
          ) : activeTab === 'report' ? (
            <div className="manager-scaled-inner">
              <SalesReportTab user={user} />
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
                  categoryId={selectedCategoryId}
                  includeSubtree
                  managerCategoryContext
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
                        {canSeeReservationClient(user?.role) && <th>Клієнт</th>}
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
                          {canSeeReservationClient(user?.role) && (
                            <td>{record.clientName || '—'}</td>
                          )}
                          <td>{record.userName || '—'}</td>
                          <td>
                            {record.action === 'reserved' ? (
                              <>
                                {record.basis && <div>Підстава: {record.basis}</div>}
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
                
                <div className="client-edrpou-autocomplete">
                  <div className="form-group">
                    <label>Назва клієнта <span className="required">*</span></label>
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
                  </div>
                  <div className="form-group">
                    <label>ЄДРПОУ</label>
                    <input
                      type="text"
                      value={edrpouSearch || reservationForm.edrpou}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEdrpouSearch(v);
                        setReservationForm(prev => ({ ...prev, edrpou: v }));
                        setShowEdrpouDropdown(true);
                      }}
                      onFocus={() => setShowEdrpouDropdown(crmClients.length > 0)}
                      onBlur={() => setTimeout(() => setShowEdrpouDropdown(false), 200)}
                      placeholder="Введіть ЄДРПОУ або назву"
                    />
                  </div>
                  {showDropdown && (
                    <ul className="client-dropdown">
                      {filteredReservationClients.slice(0, 8).map(c => (
                        <li key={c._id} onMouseDown={() => handleSelectClient(c)}>
                          {c.name || c.edrpou}{c.edrpou ? ` (ЄДРПОУ: ${c.edrpou})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="form-group">
                  <label>Підстава резервування <span className="required">*</span></label>
                  <select
                    required
                    value={reservationForm.basis}
                    onChange={(e) => {
                      const v = e.target.value;
                      const days = reservationDaysByBasis[v] ?? 0;
                      const srv = reservationServerTodayYmd;
                      setReservationForm((prev) => {
                        if (!srv) return { ...prev, basis: v, endDate: prev.endDate };
                        const maxY = addDaysToYmd(srv, days);
                        let end =
                          v && days > 0
                            ? endDateAfterDaysFromServer(days, srv)
                            : v
                              ? srv
                              : prev.endDate;
                        if (v) {
                          if (end > maxY) end = maxY;
                          if (end < srv) end = srv;
                        }
                        return { ...prev, basis: v, endDate: end };
                      });
                    }}
                    disabled={!reservationServerTodayYmd}
                  >
                    <option value="">— Оберіть підставу —</option>
                    {RESERVATION_BASIS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                        {(reservationDaysByBasis[opt] ?? 0) > 0
                          ? ` (${reservationDaysByBasis[opt]} дн.)`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Дата закінчення резервування</label>
                  <input
                    type="date"
                    value={reservationForm.endDate}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const clamped = clampReservationEndDateYmd(
                        raw,
                        reservationForm.basis,
                        reservationDaysByBasis,
                        reservationServerTodayYmd || ''
                      );
                      setReservationForm((prev) => ({ ...prev, endDate: clamped }));
                    }}
                    min={reservationServerTodayYmd || undefined}
                    max={reservationForm.basis ? reservationEndDateMaxYmd || undefined : undefined}
                    disabled={!reservationServerTodayYmd}
                  />
                  {reservationServerTodayYmd === null && (
                    <p className="reservation-date-hint">Завантаження дати сервера…</p>
                  )}
                  {reservationServerTodayYmd === '' && (
                    <p className="reservation-date-hint reservation-date-hint--warn">
                      Не вдалося отримати дату з сервера. Закрийте вікно та відкрийте резервування знову.
                    </p>
                  )}
                  {reservationServerTodayYmd && reservationForm.basis && reservationEndDateMaxYmd && (
                    <p className="reservation-date-hint">
                      Ліміти за <strong>датою сервера</strong> {reservationServerTodayYmd.split('-').reverse().join('.')}
                      {' — '}не пізніше {reservationEndDateMaxYmd.split('-').reverse().join('.')} (макс.{' '}
                      {reservationDaysByBasis[reservationForm.basis] ?? 0} дн. за підставою).
                    </p>
                  )}
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
                  disabled={
                    reservationLoading ||
                    !reservationForm.clientName.trim() ||
                    !reservationForm.basis.trim() ||
                    !reservationServerTodayYmd
                  }
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

