import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import ReservationModal from './ReservationModal';
import './Documents.css';

function Reservations({ warehouses = [], user }) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    client: ''
  });

  useEffect(() => {
    loadReservations();
  }, [filters]);

  const loadReservations = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.client) params.append('client', filters.client);

      const response = await fetch(`${API_BASE_URL}/reservations?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setReservations(data);
      }
    } catch (error) {
      console.error('Помилка завантаження резервувань:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (reservationId) => {
    if (!window.confirm('Ви впевнені, що хочете скасувати резервування?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/reservations/${reservationId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        loadReservations();
      }
    } catch (error) {
      console.error('Помилка скасування резервування:', error);
      alert('Помилка скасування резервування');
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const getStatusBadge = (status) => {
    const badges = {
      active: { text: 'Активне', class: 'status-completed' },
      completed: { text: 'Виконано', class: 'status-delivered' },
      cancelled: { text: 'Скасовано', class: 'status-cancelled' },
      expired: { text: 'Прострочено', class: 'status-cancelled' }
    };
    const badge = badges[status] || badges.active;
    return <span className={`status-badge ${badge.class}`}>{badge.text}</span>;
  };

  const isExpired = (reservedUntil) => {
    if (!reservedUntil) return false;
    return new Date(reservedUntil) < new Date();
  };

  return (
    <div className="documents-container">
      <div className="documents-header">
        <h2>Резервування товарів</h2>
        <button 
          className="btn-primary"
          onClick={() => {
            setSelectedReservation(null);
            setShowModal(true);
          }}
        >
          ➕ Створити резервування
        </button>
      </div>

      <div className="documents-filters">
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
        >
          <option value="">Всі статуси</option>
          <option value="active">Активні</option>
          <option value="completed">Виконані</option>
          <option value="cancelled">Скасовані</option>
          <option value="expired">Прострочені</option>
        </select>
        <input
          type="text"
          value={filters.client}
          onChange={(e) => handleFilterChange('client', e.target.value)}
          placeholder="Пошук по клієнту"
        />
      </div>

      {loading ? (
        <div className="loading">Завантаження...</div>
      ) : reservations.length === 0 ? (
        <div className="empty-state">
          <p>Резервувань не знайдено</p>
        </div>
      ) : (
        <div className="documents-table">
          <table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Клієнт</th>
                <th>Номер замовлення</th>
                <th>Кількість позицій</th>
                <th>Зарезервовано до</th>
                <th>Статус</th>
                <th>Створено</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map(res => (
                <tr key={res._id} style={isExpired(res.reservedUntil) && res.status === 'active' ? { opacity: 0.7 } : {}}>
                  <td>{res.reservationNumber}</td>
                  <td>{new Date(res.reservationDate).toLocaleDateString('uk-UA')}</td>
                  <td>{res.clientName || '—'}</td>
                  <td>{res.orderNumber || '—'}</td>
                  <td>{res.items?.length || 0}</td>
                  <td>
                    {res.reservedUntil 
                      ? new Date(res.reservedUntil).toLocaleDateString('uk-UA')
                      : '—'
                    }
                    {isExpired(res.reservedUntil) && res.status === 'active' && (
                      <span style={{ color: 'red', marginLeft: '5px' }}>⚠️</span>
                    )}
                  </td>
                  <td>{getStatusBadge(res.status)}</td>
                  <td>{res.createdByName || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button 
                        className="btn-action"
                        onClick={() => {
                          setSelectedReservation(res);
                          setShowModal(true);
                        }}
                      >
                        Переглянути
                      </button>
                      {res.status === 'active' && (
                        <button
                          className="btn-action"
                          onClick={() => handleCancel(res._id)}
                          style={{ background: '#dc3545' }}
                        >
                          Скасувати
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ReservationModal
          reservation={selectedReservation}
          warehouses={warehouses}
          user={user}
          onClose={() => {
            setShowModal(false);
            setSelectedReservation(null);
          }}
          onSuccess={() => {
            loadReservations();
          }}
        />
      )}
    </div>
  );
}

export default Reservations;

