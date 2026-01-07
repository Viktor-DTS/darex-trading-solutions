import React, { useState, useEffect, useRef } from 'react';
import API_BASE_URL from '../config';
import EquipmentList from './equipment/EquipmentList';
import EquipmentEditModal from './equipment/EquipmentEditModal';
import './ManagerDashboard.css';

function ManagerDashboard({ user }) {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showViewModal, setShowViewModal] = useState(false);
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
    setShowViewModal(true);
  };

  const handleReserveSuccess = async (equipmentId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/${equipmentId}/reserve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        // Оновлюємо список обладнання
        if (equipmentListRef.current) {
          equipmentListRef.current.refresh();
        }
        // Оновлюємо обране обладнання
        const updatedEquipment = await response.json();
        setSelectedEquipment(updatedEquipment);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Помилка резервування обладнання');
      }
    } catch (error) {
      console.error('Помилка резервування:', error);
      alert('Помилка резервування обладнання');
    }
  };

  const handleCancelReserve = async (equipmentId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/${equipmentId}/cancel-reserve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        // Оновлюємо список обладнання
        if (equipmentListRef.current) {
          equipmentListRef.current.refresh();
        }
        // Оновлюємо обране обладнання
        const updatedEquipment = await response.json();
        setSelectedEquipment(updatedEquipment);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Помилка скасування резервування');
      }
    } catch (error) {
      console.error('Помилка скасування резервування:', error);
      alert('Помилка скасування резервування');
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
                  showReserveAction={true}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Модальне вікно для перегляду та резервування */}
      {showViewModal && selectedEquipment && (
        <EquipmentEditModal
          equipment={selectedEquipment}
          warehouses={warehouses}
          user={user}
          onClose={() => {
            setShowViewModal(false);
            setSelectedEquipment(null);
          }}
          onSuccess={() => {
            if (equipmentListRef.current) {
              equipmentListRef.current.refresh();
            }
          }}
          readOnly={true}
          onReserve={handleReserveSuccess}
          onCancelReserve={handleCancelReserve}
        />
      )}
    </div>
  );
}

export default ManagerDashboard;

