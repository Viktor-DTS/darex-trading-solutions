import React, { useState, useEffect, useRef, useCallback } from 'react';
import API_BASE_URL from '../config';
import { authFetch } from '../utils/authFetch';
import { listShipmentRequests } from '../utils/shipmentRequestAPI';
import EquipmentList from './equipment/EquipmentList';
import CategoryTree from './equipment/CategoryTree';
import EquipmentEditModal from './equipment/EquipmentEditModal';
import EquipmentMoveModal from './equipment/EquipmentMoveModal';
import EquipmentShipModal from './equipment/EquipmentShipModal';
import EquipmentWriteOffModal from './equipment/EquipmentWriteOffModal';
import EquipmentStatistics from './equipment/EquipmentStatistics';
import Reservations from './inventory/Reservations';
import InventoryReports from './inventory/InventoryReports';
import InventoryMovementJournal from './inventory/InventoryMovementJournal';
import OneCReconciliation from './inventory/OneCReconciliation';
import OneCMovementsJournal from './inventory/OneCMovementsJournal';
import ReceiptApproval from './inventory/ReceiptApproval';
import ManagerNotificationsTab from './manager/ManagerNotificationsTab';
import './InventoryDashboard.css';

const INVENTORY_ACTIVE_TAB_STORAGE_KEY = 'inventory_active_tab';

/** Дозволені id вкладок бічної панелі (мають збігатися з полем id у масиві tabs). */
const INVENTORY_TAB_IDS = new Set([
  'stock',
  'receipt',
  'movement',
  'shipment',
  'movement-journal',
  'onec-reconciliation',
  'notifications',
  'write-off',
  'approval',
  'inventory',
  'reservations',
  'reports',
  'statistics',
]);

function readStoredInventoryTab() {
  try {
    const raw = localStorage.getItem(INVENTORY_ACTIVE_TAB_STORAGE_KEY);
    if (raw && INVENTORY_TAB_IDS.has(raw)) return raw;
  } catch (_) {}
  return 'stock';
}

function InventoryDashboard({ user }) {
  const [activeTab, setActiveTab] = useState(readStoredInventoryTab);
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
  const [procurementPendingCount, setProcurementPendingCount] = useState(0);
  const [procurementReceiptFocusId, setProcurementReceiptFocusId] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [receiptPresetProductCard, setReceiptPresetProductCard] = useState(null);
  const [receiptAddModalKey, setReceiptAddModalKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('inventory_sidebar_collapsed') === 'true';
    } catch { return false; }
  });
  const equipmentListRef = useRef(null);
  /** null на першому рендері — щоб при збереженій вкладці «Переміщення» модалка все одно відкрилась один раз. */
  const prevActiveTabRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(INVENTORY_ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch (_) {}
  }, [activeTab]);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('inventory_sidebar_collapsed', String(next)); } catch (_) {}
      return next;
    });
  };

  const loadProcurementPendingCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await authFetch(`${API_BASE_URL}/procurement-requests/pending-warehouse-receipt/count`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setProcurementPendingCount(data.count || 0);
      }
    } catch (err) {
      console.error('Помилка лічильника надходжень від закупівель:', err);
    }
  }, []);

  useEffect(() => {
    loadWarehouses();
    loadInTransitCount();
    loadProcurementPendingCount();
    const interval = setInterval(() => {
      loadInTransitCount();
      loadProcurementPendingCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadProcurementPendingCount]);

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
        const res = await authFetch(`${API_BASE_URL}/warehouses?forMoveDestination=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || !res.ok || cancelled) return;
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
      const response = await authFetch(`${API_BASE_URL}/warehouses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        return;
      }

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
      const response = await authFetch(`${API_BASE_URL}/equipment/in-transit/count`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        return;
      }

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
    { id: 'onec-reconciliation', label: 'Звірка з 1С', icon: '🔍' },
    { id: 'notifications', label: 'Сповіщення', icon: '🔔' },
    { id: 'write-off', label: 'Списання', icon: '📝' },
    {
      id: 'approval',
      label: 'Затвердження отримання товару',
      icon: '✅',
      badge: inTransitCount + procurementPendingCount
    },
    { id: 'inventory', label: 'Інвентаризація', icon: '📋' },
    { id: 'reservations', label: 'Резервування', icon: '🔒' },
    { id: 'reports', label: 'Звіти', icon: '📊' },
    { id: 'statistics', label: 'Статистика', icon: '📈' },
  ];

  // Раніше: автовідкриття модалок переміщення/списання. Тимчасово вимкнено — рух в 1С.
  useEffect(() => {
    prevActiveTabRef.current = activeTab;
  }, [activeTab]);

  const handleEquipmentAdded = () => {
    setShowAddModal(false);
    setReceiptPresetProductCard(null);
    setActiveTab('receipt');
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
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
  };

  const handleShipSuccess = () => {
    setShowShipModal(false);
    setSelectedEquipment(null);
    setShipModalFromRequestId(null);
    loadPendingShipRequests();
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
  };

  const handleWriteOffSuccess = () => {
    setShowWriteOffModal(false);
    setSelectedEquipment(null);
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
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
          <OneCMovementsJournal
            title="Надходження"
            docType="receipt"
            warehouses={warehouses}
            user={user}
            description="Журнал надходжень товару з 1С (документи «Поступление» зі звіту «Ведомость по товарам на складах»)."
          />
        );

      case 'movement':
        return (
          <OneCMovementsJournal
            title="Переміщення"
            docType="move"
            warehouses={warehouses}
            user={user}
            description="Журнал переміщень між складами з 1С (документи «Перемещение» зі звіту «Ведомость»)."
          />
        );

      case 'shipment':
        return (
          <OneCMovementsJournal
            title="Відвантаження"
            docType="sale"
            warehouses={warehouses}
            user={user}
            description="Журнал відвантажень / реалізацій з 1С (документи «Реализация товаров и услуг» зі звіту «Ведомость»)."
          />
        );

      case 'notifications':
        return (
          <div className="inventory-tab-content">
            <ManagerNotificationsTab
              onOpenShipmentRequest={openShipmentFromNotification}
              onOpenProcurementRequest={(id) => {
                setProcurementReceiptFocusId(id);
                setActiveTab('approval');
              }}
              description="Системні сповіщення: надходження від закупівель, запити на відвантаження від менеджерів тощо. Номер заявки закупівель відкриває картку у вкладці «Затвердження отримання товару»."
            />
          </div>
        );

      case 'write-off':
        return (
          <OneCMovementsJournal
            title="Списання"
            docType="writeoff"
            warehouses={warehouses}
            user={user}
            description="Журнал списань товару з 1С (документи «Списание» зі звіту «Ведомость»)."
          />
        );

      case 'approval':
        return (
          <div className="inventory-tab-content receipt-approval-tab">
            <ReceiptApproval
              warehouses={warehouses}
              user={user}
              focusProcurementId={procurementReceiptFocusId}
              onConsumedFocusProcurement={() => setProcurementReceiptFocusId(null)}
              onProcurementReceiptChanged={loadProcurementPendingCount}
              onMoveReceiptChanged={loadInTransitCount}
            />
          </div>
        );

      case 'inventory':
        return (
          <OneCMovementsJournal
            title="Інвентаризація"
            docType="inventory"
            warehouses={warehouses}
            user={user}
            description="Журнал інвентаризації та коригувань з 1С (документи «Инвентаризация», «Оприходование», «Пересорт» зі звіту «Ведомость»)."
          />
        );

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

      case 'onec-reconciliation':
        return (
          <div className="inventory-tab-content">
            <OneCReconciliation />
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
                        if (tab.id === 'approval') {
                          loadInTransitCount();
                          loadProcurementPendingCount();
                        }
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
                          if (tab.id === 'approval') {
                            loadInTransitCount();
                            loadProcurementPendingCount();
                          }
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
          }}
          onSuccess={handleWriteOffSuccess}
        />
      )}
    </div>
  );
}

export default InventoryDashboard;

