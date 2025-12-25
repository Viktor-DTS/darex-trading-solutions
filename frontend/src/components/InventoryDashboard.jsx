import React, { useState, useEffect, useRef } from 'react';
import API_BASE_URL from '../config';
import EquipmentList from './equipment/EquipmentList';
import EquipmentEditModal from './equipment/EquipmentEditModal';
import EquipmentMoveModal from './equipment/EquipmentMoveModal';
import EquipmentShipModal from './equipment/EquipmentShipModal';
import EquipmentStatistics from './equipment/EquipmentStatistics';
import WarehouseManagement from './equipment/WarehouseManagement';
import ReceiptDocuments from './inventory/ReceiptDocuments';
import MovementDocuments from './inventory/MovementDocuments';
import ShipmentDocuments from './inventory/ShipmentDocuments';
import InventoryDocuments from './inventory/InventoryDocuments';
import Reservations from './inventory/Reservations';
import InventoryReports from './inventory/InventoryReports';
import './InventoryDashboard.css';

function InventoryDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('stock');
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
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

  const tabs = [
    { id: 'stock', label: 'Залишки на складах', icon: '📦' },
    { id: 'receipt', label: 'Надходження', icon: '📥' },
    { id: 'movement', label: 'Переміщення', icon: '🔄' },
    { id: 'shipment', label: 'Відвантаження', icon: '🚚' },
    { id: 'inventory', label: 'Інвентаризація', icon: '📋' },
    { id: 'reservations', label: 'Резервування', icon: '🔒' },
    { id: 'warehouses', label: 'Управління складами', icon: '🏢' },
    { id: 'reports', label: 'Звіти', icon: '📊' },
    { id: 'statistics', label: 'Статистика', icon: '📈' },
  ];

  const handleEquipmentAdded = () => {
    setShowAddModal(false);
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
  };

  const handleMove = (equipment) => {
    setSelectedEquipment(equipment);
    setShowMoveModal(true);
  };

  const handleShip = (equipment) => {
    setSelectedEquipment(equipment);
    setShowShipModal(true);
  };

  const handleMoveSuccess = () => {
    setShowMoveModal(false);
    setSelectedEquipment(null);
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
  };

  const handleShipSuccess = () => {
    setShowShipModal(false);
    setSelectedEquipment(null);
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'stock':
        return (
          <div className="inventory-tab-content">
            <div className="inventory-header">
              <h2>Залишки на складах</h2>
              <div className="inventory-actions">
                <button 
                  className="btn-primary"
                  onClick={() => setShowAddModal(true)}
                >
                  ➕ Надходження товарів
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => {
                    setSelectedEquipment(null);
                    setShowMoveModal(true);
                  }}
                >
                  🔄 Переміщення між складами
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => {
                    setSelectedEquipment(null);
                    setShowShipModal(true);
                  }}
                >
                  🚚 Відвантаження замовнику
                </button>
              </div>
            </div>
            <EquipmentList
              ref={equipmentListRef}
              user={user}
              warehouses={warehouses}
              onMove={handleMove}
              onShip={handleShip}
            />
          </div>
        );

      case 'receipt':
        return <ReceiptDocuments warehouses={warehouses} />;

      case 'movement':
        return <MovementDocuments warehouses={warehouses} />;

      case 'shipment':
        return <ShipmentDocuments warehouses={warehouses} />;

      case 'inventory':
        return <InventoryDocuments warehouses={warehouses} />;

      case 'reservations':
        return <Reservations />;

      case 'warehouses':
        return <WarehouseManagement user={user} />;

      case 'reports':
        return <InventoryReports warehouses={warehouses} />;

      case 'statistics':
        return <EquipmentStatistics warehouses={warehouses} />;

      default:
        return null;
    }
  };

  return (
    <div className="inventory-dashboard">
      <div className="inventory-dashboard-main">
        <aside className="inventory-sidebar">
          <nav className="inventory-sidebar-nav">
            <div className="sidebar-section-title">Складський облік</div>
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`inventory-sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="inventory-main-content">
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : (
            renderTabContent()
          )}
        </main>
      </div>

      {/* Модальні вікна */}
      {showAddModal && (
        <EquipmentEditModal
          equipment={null}
          warehouses={warehouses}
          user={user}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleEquipmentAdded}
        />
      )}

      {showMoveModal && (
        <EquipmentMoveModal
          equipment={selectedEquipment}
          warehouses={warehouses}
          onClose={() => {
            setShowMoveModal(false);
            setSelectedEquipment(null);
          }}
          onSuccess={handleMoveSuccess}
        />
      )}

      {showShipModal && (
        <EquipmentShipModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowShipModal(false);
            setSelectedEquipment(null);
          }}
          onSuccess={handleShipSuccess}
        />
      )}
    </div>
  );
}

export default InventoryDashboard;

