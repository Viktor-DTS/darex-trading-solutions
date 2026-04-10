import React, { useState, useEffect, useRef, useCallback } from 'react';
import API_BASE_URL from '../config';
import { listShipmentRequests } from '../utils/shipmentRequestAPI';
import EquipmentList from './equipment/EquipmentList';
import CategoryTree from './equipment/CategoryTree';
import EquipmentEditModal from './equipment/EquipmentEditModal';
import EquipmentMoveModal from './equipment/EquipmentMoveModal';
import EquipmentShipModal from './equipment/EquipmentShipModal';
import EquipmentWriteOffModal from './equipment/EquipmentWriteOffModal';
import EquipmentStatistics from './equipment/EquipmentStatistics';
import ReceiptProductCardsTab from './inventory/ReceiptProductCardsTab';
import InventoryDocuments from './inventory/InventoryDocuments';
import Reservations from './inventory/Reservations';
import InventoryReports from './inventory/InventoryReports';
import InventoryMovementJournal from './inventory/InventoryMovementJournal';
import ReceiptApproval from './inventory/ReceiptApproval';
import ManagerNotificationsTab from './manager/ManagerNotificationsTab';
import './InventoryDashboard.css';

function InventoryDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('stock');
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveDestinationWarehouses, setMoveDestinationWarehouses] = useState(null);
  const [showShipModal, setShowShipModal] = useState(false);
  const [showWriteOffModal, setShowWriteOffModal] = useState(false);
  const [shipModalFromRequestId, setShipModalFromRequestId] = useState(null);
  const [pendingShipRequests, setPendingShipRequests] = useState([]);
  const [shipRequestsLoading, setShipRequestsLoading] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [inTransitCount, setInTransitCount] = useState(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [receiptPresetProductCard, setReceiptPresetProductCard] = useState(null);
  const [receiptAddModalKey, setReceiptAddModalKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('inventory_sidebar_collapsed') === 'true';
    } catch { return false; }
  });
  const equipmentListRef = useRef(null);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('inventory_sidebar_collapsed', String(next)); } catch (_) {}
      return next;
    });
  };

  useEffect(() => {
    loadWarehouses();
    loadInTransitCount();
    // Оновлюємо лічильник кожні 30 секунд
    const interval = setInterval(loadInTransitCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!showMoveModal) return;
    const r = (user?.role || '').toLowerCase();
    const regional = ['warehouse', 'zavsklad'].includes(r);
    if (!regional) {
      setMoveDestinationWarehouses(warehouses);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/warehouses?forMoveDestination=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setMoveDestinationWarehouses(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setMoveDestinationWarehouses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMoveModal, user?.role, warehouses]);

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

  const loadPendingShipRequests = useCallback(async () => {
    setShipRequestsLoading(true);
    try {
      const data = await listShipmentRequests('pending');
      setPendingShipRequests(Array.isArray(data) ? data : []);
    } catch {
      setPendingShipRequests([]);
    } finally {
      setShipRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'shipment') loadPendingShipRequests();
  }, [activeTab, loadPendingShipRequests]);

  const openShipmentFromNotification = useCallback((n) => {
    const raw = n.shipmentRequestId;
    const id = raw && typeof raw === 'object' && raw._id ? raw._id : raw;
    if (!id) return;
    setSelectedEquipment(null);
    setShipModalFromRequestId(String(id));
    setShowShipModal(true);
    setActiveTab('shipment');
  }, []);

  const loadInTransitCount = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/in-transit/count`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInTransitCount(data.count || 0);
      }
    } catch (err) {
      console.error('Помилка завантаження лічильника товарів в дорозі:', err);
    }
  };

  // Управління складами доступне тільки в панелі Адміністратор
  const tabs = [
    { id: 'stock', label: 'Залишки на складах', icon: '📦' },
    { id: 'receipt', label: 'Надходження', icon: '📥' },
    { id: 'movement', label: 'Переміщення', icon: '🔄' },
    { id: 'shipment', label: 'Відвантаження', icon: '🚚' },
    { id: 'movement-journal', label: 'Журнал руху товару', icon: '📒' },
    { id: 'notifications', label: 'Сповіщення', icon: '🔔' },
    { id: 'write-off', label: 'Списання', icon: '📝' },
    { id: 'approval', label: 'Затвердження отримання товару', icon: '✅', badge: inTransitCount },
    { id: 'inventory', label: 'Інвентаризація', icon: '📋' },
    { id: 'reservations', label: 'Резервування', icon: '🔒' },
    { id: 'reports', label: 'Звіти', icon: '📊' },
    { id: 'statistics', label: 'Статистика', icon: '📈' },
  ];

  // Автоматичне відкриття модальних вікон при переключенні на відповідні вкладки
  useEffect(() => {
    // Не відкриваємо модальні вікна, якщо вони вже відкриті (щоб уникнути зациклення)
    if (activeTab === 'movement' && !showMoveModal && !showAddModal && !showShipModal && !showWriteOffModal) {
      setSelectedEquipment(null);
      setShowMoveModal(true);
    } else if (activeTab === 'write-off' && !showWriteOffModal && !showAddModal && !showMoveModal && !showShipModal) {
      setSelectedEquipment(null);
      setShowWriteOffModal(true);
    }
  }, [activeTab, showAddModal, showMoveModal, showShipModal, showWriteOffModal]);

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
    setShipModalFromRequestId(null);
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
    setShipModalFromRequestId(null);
    loadPendingShipRequests();
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
    setActiveTab('stock');
  };

  const handleWriteOffSuccess = () => {
    setShowWriteOffModal(false);
    setSelectedEquipment(null);
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
    // Після успішного списання повертаємося на вкладку залишків
    setActiveTab('stock');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'stock':
        return (
          <div className="inventory-tab-content inventory-stock-list-only">
            <div className="inventory-header">
              <h2>Залишки на складах</h2>
            </div>
            <EquipmentList
              ref={equipmentListRef}
              user={user}
              warehouses={warehouses}
              onMove={handleMove}
              onShip={handleShip}
              categoryId={selectedCategoryId}
              includeSubtree
            />
          </div>
        );

      case 'receipt':
        return (
          <ReceiptProductCardsTab
            user={user}
            warehouses={warehouses}
            onOpenReceiptWithCard={(card) => {
              setReceiptPresetProductCard(card);
              setReceiptAddModalKey((k) => k + 1);
              setShowAddModal(true);
            }}
            onOpenReceiptWithoutCard={() => {
              setReceiptPresetProductCard(null);
              setReceiptAddModalKey((k) => k + 1);
              setShowAddModal(true);
            }}
          />
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
                Запити від менеджерів на відвантаження та ручне відвантаження зі складу
              </p>
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 12 }}
                onClick={() => {
                  setShipModalFromRequestId(null);
                  setSelectedEquipment(null);
                  setShowShipModal(true);
                }}
              >
                Ручне відвантаження
              </button>
            </div>
            <div className="inventory-shipment-requests-block" style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: 12 }}>Запити на відвантаження від менеджерів</h3>
              {shipRequestsLoading ? (
                <div className="loading-indicator">Завантаження…</div>
              ) : pendingShipRequests.length === 0 ? (
                <p className="inventory-description">Немає активних запитів у статусі «Очікує».</p>
              ) : (
                <ul className="inventory-shipment-request-list" style={{ listStyle: 'none', padding: 0 }}>
                  {pendingShipRequests.map((r) => (
                    <li
                      key={r._id}
                      style={{
                        border: '1px solid var(--border-color, #ddd)',
                        borderRadius: 8,
                        padding: 12,
                        marginBottom: 10,
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 12,
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <strong>{r.requestNumber}</strong>
                        <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>{r.clientName || '—'}</span>
                        <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-secondary)' }}>
                          {r.plannedShipmentDate
                            ? new Date(r.plannedShipmentDate).toLocaleDateString('uk-UA')
                            : ''}{' '}
                          · {r.managerName || r.managerLogin || ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setShipModalFromRequestId(String(r._id));
                          setSelectedEquipment(null);
                          setShowShipModal(true);
                        }}
                      >
                        Оформити відвантаження
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="inventory-tab-content">
            <ManagerNotificationsTab
              onOpenShipmentRequest={openShipmentFromNotification}
              description="Системні сповіщення: запити на відвантаження від менеджерів тощо. Натисніть «Відкрити відвантаження», щоб перейти до оформлення відвантаження з даними заявки."
            />
          </div>
        );

      case 'write-off':
        return (
          <div className="inventory-tab-content">
            <div className="inventory-header">
              <h2>Списання обладнання</h2>
              <p className="inventory-description">
                Списання обладнання зі складу
              </p>
            </div>
            <div className="documents-placeholder">
              <p>Використовуйте модальне вікно для списання обладнання</p>
            </div>
          </div>
        );

      case 'approval':
        return <ReceiptApproval warehouses={warehouses} user={user} />;

      case 'inventory':
        return <InventoryDocuments warehouses={warehouses} />;

      case 'reservations':
        return <Reservations warehouses={warehouses} user={user} />;

      case 'reports':
        return <InventoryReports warehouses={warehouses} />;

      case 'statistics':
        return <EquipmentStatistics warehouses={warehouses} />;

      case 'movement-journal':
        return (
          <div className="inventory-tab-content">
            <InventoryMovementJournal />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="inventory-dashboard">
      <div className="inventory-dashboard-main">
        <div className={`inventory-sidebar-wrap ${sidebarCollapsed ? 'inventory-sidebar-wrap-collapsed' : ''}`}>
          <aside className={`inventory-sidebar ${sidebarCollapsed ? 'inventory-sidebar-collapsed' : ''}`}>
            {sidebarCollapsed ? (
              <>
                <nav className="inventory-sidebar-nav">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      className={`inventory-sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTab(tab.id);
                        if (tab.id === 'approval') loadInTransitCount();
                      }}
                      title={tab.label}
                    >
                      <span className="tab-icon">{tab.icon}</span>
                    </button>
                  ))}
                </nav>
              </>
            ) : (
              <div className="inventory-sidebar-scale-outer">
                <div className="inventory-sidebar-scaled">
                  <nav className="inventory-sidebar-nav">
                    <div className="sidebar-section-title">Складський облік</div>
                    {tabs.map(tab => (
                      <button
                        key={tab.id}
                        className={`inventory-sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => {
                          setActiveTab(tab.id);
                          if (tab.id === 'approval') loadInTransitCount();
                        }}
                      >
                        <span className="tab-icon">{tab.icon}</span>
                        <span className="tab-label">{tab.label}</span>
                        {tab.badge !== undefined && tab.badge > 0 && (
                          <span className="tab-badge">{tab.badge}</span>
                        )}
                      </button>
                    ))}
                  </nav>
                  {activeTab === 'stock' && (
                    <div className="inventory-sidebar-nomenclature">
                      <CategoryTree
                        selectedId={selectedCategoryId}
                        onSelectCategory={(id) => setSelectedCategoryId(id)}
                        showAllOption
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
          <button
            type="button"
            className="inventory-sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Розгорнути панель' : 'Згорнути панель'}
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </button>
        </div>

        <main className="inventory-main-content">
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : (
            <div className="inventory-scaled-wrapper">
              {renderTabContent()}
            </div>
          )}
        </main>
      </div>

      {/* Модальні вікна */}
      {showAddModal && (
        <EquipmentEditModal
          key={`receipt-add-${receiptAddModalKey}`}
          equipment={null}
          warehouses={warehouses}
          user={user}
          presetProductCard={receiptPresetProductCard}
          onClose={() => {
            setShowAddModal(false);
            setReceiptPresetProductCard(null);
          }}
          onSuccess={handleEquipmentAdded}
        />
      )}

      {showMoveModal && (
        <EquipmentMoveModal
          equipment={selectedEquipment}
          warehouses={warehouses}
          destinationWarehouses={moveDestinationWarehouses}
          user={user}
          onClose={() => {
            setShowMoveModal(false);
            setMoveDestinationWarehouses(null);
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
          warehouses={warehouses}
          user={user}
          linkedShipmentRequestId={shipModalFromRequestId}
          onClose={() => {
            setShowShipModal(false);
            setSelectedEquipment(null);
            setShipModalFromRequestId(null);
            if (activeTab === 'shipment') {
              loadPendingShipRequests();
            }
          }}
          onSuccess={handleShipSuccess}
        />
      )}

      {showWriteOffModal && (
        <EquipmentWriteOffModal
          equipment={selectedEquipment}
          warehouses={warehouses}
          user={user}
          onClose={() => {
            setShowWriteOffModal(false);
            setSelectedEquipment(null);
            // Якщо закриваємо модальне вікно з вкладки списання, повертаємося на залишки
            if (activeTab === 'write-off') {
              setActiveTab('stock');
            }
          }}
          onSuccess={handleWriteOffSuccess}
        />
      )}
    </div>
  );
}

export default InventoryDashboard;

