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

  // Автоматичне відкриття модальних вікон при переключенні на відповідні вкладки
  useEffect(() => {
    // Не відкриваємо модальні вікна, якщо вони вже відкриті (щоб уникнути зациклення)
    if (activeTab === 'receipt' && !showAddModal && !showMoveModal && !showShipModal) {
      setShowAddModal(true);
    } else if (activeTab === 'movement' && !showMoveModal && !showAddModal && !showShipModal) {
      setSelectedEquipment(null);
      setShowMoveModal(true);
    } else if (activeTab === 'shipment' && !showShipModal && !showAddModal && !showMoveModal) {
      setSelectedEquipment(null);
      setShowShipModal(true);
    }
  }, [activeTab, showAddModal, showMoveModal, showShipModal]);

  const handleEquipmentAdded = () => {
    setShowAddModal(false);
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
    // Після успішного додавання повертаємося на вкладку залишків
    setActiveTab('stock');
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
    // Після успішного переміщення повертаємося на вкладку залишків
    setActiveTab('stock');
  };

  const handleShipSuccess = () => {
    setShowShipModal(false);
    setSelectedEquipment(null);
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
    // Після успішного відвантаження повертаємося на вкладку залишків
    setActiveTab('stock');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'stock':
        return (
          <div className="inventory-tab-content">
            <div className="inventory-header">
              <h2>Залишки на складах</h2>
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
        return (
          <div className="inventory-tab-content">
            <div className="inventory-header">
              <h2>Надходження товарів</h2>
              <p className="inventory-description">
                Додавання нового обладнання на склад від постачальників
              </p>
            </div>
            <div className="documents-placeholder">
              <p>Використовуйте модальне вікно для додавання обладнання</p>
            </div>
          </div>
        );

      case 'movement':
        return (
          <div className="inventory-tab-content">
            <div className="inventory-header">
              <h2>Переміщення між складами</h2>
              <p className="inventory-description">
                Переміщення обладнання між складами
              </p>
            </div>
            <div className="documents-placeholder">
              <p>Використовуйте модальне вікно для переміщення обладнання</p>
            </div>
          </div>
        );

      case 'shipment':
        return (
          <div className="inventory-tab-content">
            <div className="inventory-header">
              <h2>Відвантаження замовникам</h2>
              <p className="inventory-description">
                Відвантаження обладнання замовникам
              </p>
            </div>
            <div className="documents-placeholder">
              <p>Використовуйте модальне вікно для відвантаження обладнання</p>
            </div>
          </div>
        );

      case 'inventory':
        return <InventoryDocuments warehouses={warehouses} />;

      case 'reservations':
        return <Reservations warehouses={warehouses} user={user} />;

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
          onClose={() => {
            setShowAddModal(false);
            // Якщо закриваємо модальне вікно з вкладки надходження, повертаємося на залишки
            if (activeTab === 'receipt') {
              setActiveTab('stock');
            }
          }}
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
            // Якщо закриваємо модальне вікно з вкладки переміщення, повертаємося на залишки
            if (activeTab === 'movement') {
              setActiveTab('stock');
            }
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
            // Якщо закриваємо модальне вікно з вкладки відвантаження, повертаємося на залишки
            if (activeTab === 'shipment') {
              setActiveTab('stock');
            }
          }}
          onSuccess={handleShipSuccess}
        />
      )}
    </div>
  );
}

export default InventoryDashboard;

