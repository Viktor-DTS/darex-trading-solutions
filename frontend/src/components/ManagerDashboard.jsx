import React, { useState, useEffect, useRef } from 'react';
import API_BASE_URL from '../config';
import EquipmentList from './equipment/EquipmentList';
import ReservationModal from './inventory/ReservationModal';
import './ManagerDashboard.css';

function ManagerDashboard({ user }) {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const equipmentListRef = useRef(null);

  useEffect(() => {
    loadWarehouses();
  }, []);

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
    setSelectedEquipment(equipment);
    setShowReservationModal(true);
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
          <nav className="manager-sidebar-nav">
            <div className="sidebar-section-title">Менеджери</div>
            <button className="manager-sidebar-tab active">
              <span className="tab-icon">📦</span>
              <span className="tab-label">Залишки на складах</span>
            </button>
          </nav>
        </aside>

        <main className="manager-main-content">
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : (
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
          )}
        </main>
      </div>

      {/* Модальне вікно для створення резервування */}
      {showReservationModal && selectedEquipment && (
        <ReservationModal
          reservation={null}
          warehouses={warehouses}
          user={user}
          preSelectedEquipment={selectedEquipment}
          onClose={() => {
            setShowReservationModal(false);
            setSelectedEquipment(null);
          }}
          onSuccess={handleReservationSuccess}
        />
      )}
    </div>
  );
}

export default ManagerDashboard;

