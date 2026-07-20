import React, { useState, useEffect, useMemo, useCallback } from 'react';
import TaskTable, { clearTasksCache } from './TaskTable';
import ColumnSettings from './ColumnSettings';
import AddTaskModal from './AddTaskModal';
import InventoryDashboard from './InventoryDashboard';
import CategoryTree from './equipment/CategoryTree';
import API_BASE_URL from '../config';
import { authFetch } from '../utils/authFetch';
import {
  buildZavskladTabs,
  isZavskladInventoryTab,
  ZAVSKLAD_INVENTORY_TAB_IDS,
} from '../constants/inventoryTabs';
import './Dashboard.css';
import './InventoryDashboard.css';

const WAREHOUSE_ACTIVE_TAB_KEY = 'warehouse_active_tab';
const TASK_TAB_IDS = new Set(['pending', 'approvedWarehouse', 'archive']);

function readStoredWarehouseTab() {
  try {
    const raw = localStorage.getItem(WAREHOUSE_ACTIVE_TAB_KEY);
    if (raw && (TASK_TAB_IDS.has(raw) || ZAVSKLAD_INVENTORY_TAB_IDS.includes(raw))) return raw;
    const legacy = localStorage.getItem('inventory_active_tab');
    if (legacy && ZAVSKLAD_INVENTORY_TAB_IDS.includes(legacy)) return legacy;
  } catch (_) {}
  return 'pending';
}

function WarehouseDashboard({ user }) {
  const [activeTab, setActiveTab] = useState(readStoredWarehouseTab);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [inTransitCount, setInTransitCount] = useState(0);
  const [procurementPendingCount, setProcurementPendingCount] = useState(0);

  const isInventoryView = isZavskladInventoryTab(activeTab);

  const taskTabs = [
    { id: 'pending', label: 'Заявки на підтвердженні', icon: '⏳' },
    { id: 'approvedWarehouse', label: 'Архів підтверджених', icon: '✅' },
    { id: 'archive', label: 'Архів виконаних заявок', icon: '📁' },
  ];

  const inventoryTabs = buildZavskladTabs({
    approvalBadge: inTransitCount + procurementPendingCount,
  });

  useEffect(() => {
    try {
      localStorage.setItem(WAREHOUSE_ACTIVE_TAB_KEY, activeTab);
    } catch (_) {}
  }, [activeTab]);

  const loadProcurementPendingCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await authFetch(`${API_BASE_URL}/procurement-requests/pending-warehouse-receipt/count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setProcurementPendingCount(data.count || 0);
      }
    } catch (err) {
      console.error('Помилка лічильника надходжень від закупівель:', err);
    }
  }, []);

  const loadInTransitCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await authFetch(`${API_BASE_URL}/equipment/in-transit/count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setInTransitCount(data.count || 0);
      }
    } catch (err) {
      console.error('Помилка завантаження лічильника товарів в дорозі:', err);
    }
  }, []);

  useEffect(() => {
    loadInTransitCount();
    loadProcurementPendingCount();
    const interval = setInterval(() => {
      loadInTransitCount();
      loadProcurementPendingCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadInTransitCount, loadProcurementPendingCount]);

  useEffect(() => {
    if (isInventoryView) return;
    loadTasks();
  }, [user, isInventoryView]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/tasks/filter?status=warehousePending&region=${user?.region || ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTasks(data);
      }
    } catch (err) {
      console.error('Помилка завантаження завдань:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    switch (activeTab) {
      case 'pending':
        return tasks.filter((t) => t.status === 'Виконано' && t.approvedByWarehouse !== 'Підтверджено');
      case 'approvedWarehouse':
        return tasks.filter((t) => t.status === 'Виконано' && t.approvedByWarehouse === 'Підтверджено');
      case 'archive':
        return tasks.filter((t) => t.status === 'Виконано' && t.approvedByAccountant === 'Підтверджено');
      default:
        return tasks;
    }
  }, [tasks, activeTab]);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'approval') {
      loadInTransitCount();
      loadProcurementPendingCount();
    }
  };

  const handleApprove = async (taskId, approved, comment) => {
    try {
      const token = localStorage.getItem('token');
      const task = tasks.find((t) => t.id === taskId || t._id === taskId);
      if (!task) return;

      const currentDateTime = new Date().toISOString();
      const updateData = {
        approvedByWarehouse: approved,
        warehouseComment:
          approved === 'Підтверджено'
            ? `Погоджено, претензій не маю. ${user?.name || user?.login || 'Користувач'}`
            : comment || task.warehouseComment,
        status: approved === 'Відмова' ? 'В роботі' : task.status,
      };

      if (approved === 'Підтверджено') {
        updateData.autoWarehouseApprovedAt = currentDateTime;
        if (task.approvedByAccountant === 'Відмова') {
          updateData.approvedByAccountant = 'На розгляді';
        }
      }

      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: approved === 'Підтверджено' ? 'approve' : 'reject',
              entityType: 'task',
              entityId: taskId,
              description:
                approved === 'Підтверджено'
                  ? `Підтвердження заявки ${task.requestNumber || taskId} завскладом`
                  : `Відмова заявки ${task.requestNumber || taskId} завскладом: ${comment || 'без коментаря'}`,
              details: {
                field: 'approvedByWarehouse',
                oldValue: task.approvedByWarehouse || 'На розгляді',
                newValue: approved,
              },
            }),
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }

        clearTasksCache();
        await loadTasks();
        if (approved === 'Підтверджено') setActiveTab('archive');
      } else {
        alert('Помилка оновлення заявки');
      }
    } catch (error) {
      console.error('Помилка підтвердження:', error);
      alert('Помилка підтвердження заявки');
    }
  };

  const handleRowClick = (task) => {
    setEditingTask(task);
    setIsReadOnlyMode(false);
    setShowAddTaskModal(true);
  };

  const handleViewClick = (task) => {
    setEditingTask(task);
    setIsReadOnlyMode(true);
    setShowAddTaskModal(true);
  };

  const handleCloseModal = () => {
    setShowAddTaskModal(false);
    setEditingTask(null);
    setIsReadOnlyMode(false);
  };

  const renderSidebarTab = (tab) => (
    <button
      key={tab.id}
      className={`sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
      onClick={() => handleTabClick(tab.id)}
    >
      <span className="tab-icon">{tab.icon}</span>
      <span className="tab-label">{tab.label}</span>
      {tab.badge !== undefined && tab.badge > 0 ? (
        <span className="sidebar-tab-badge">{tab.badge}</span>
      ) : null}
    </button>
  );

  return (
    <div className="dashboard no-header">
      <div className="dashboard-main">
        <aside className="sidebar warehouse-sidebar">
          <nav className="sidebar-nav">
            <div className="sidebar-section-title">Навігація</div>
            {taskTabs.map(renderSidebarTab)}
            <div className="sidebar-section-divider" aria-hidden="true" />
            <div className="sidebar-section-title">Склад</div>
            {inventoryTabs.map(renderSidebarTab)}
          </nav>

          {activeTab === 'stock' && (
            <div className="warehouse-sidebar-nomenclature inventory-sidebar-nomenclature">
              <CategoryTree
                selectedId={selectedCategoryId}
                onSelectCategory={(id) => setSelectedCategoryId(id)}
                showAllOption
              />
            </div>
          )}

          {!isInventoryView ? (
            <div className="sidebar-settings">
              <div className="sidebar-section-title">Налаштування</div>
              <button className="sidebar-btn btn-settings" onClick={() => setShowColumnSettings(true)}>
                ⚙️ Налаштувати колонки
              </button>
            </div>
          ) : null}
        </aside>

        <main className={`table-area${isInventoryView ? ' warehouse-inventory-area' : ''}`}>
          {isInventoryView ? (
            <InventoryDashboard
              user={user}
              variant="zavsklad"
              embedded
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              selectedCategoryId={selectedCategoryId}
              onSelectedCategoryChange={setSelectedCategoryId}
            />
          ) : loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : (
            <TaskTable
              user={user}
              status={
                activeTab === 'pending'
                  ? 'warehousePending'
                  : activeTab === 'approvedWarehouse'
                    ? 'warehouseApproved'
                    : 'done'
              }
              onColumnSettingsClick={() => setShowColumnSettings(true)}
              showRejectedApprovals={false}
              showRejectedInvoices={false}
              onRowClick={handleRowClick}
              onViewClick={handleViewClick}
              onApprove={handleApprove}
              showApproveButtons={activeTab === 'pending'}
              approveRole="warehouse"
              columnsArea="warehouse"
            />
          )}
        </main>
      </div>

      {showColumnSettings && (
        <ColumnSettings user={user} area="warehouse" onClose={() => setShowColumnSettings(false)} />
      )}

      {showAddTaskModal && (
        <AddTaskModal
          open={showAddTaskModal}
          onClose={handleCloseModal}
          initialData={editingTask || {}}
          user={user}
          panelType="warehouse"
          readOnly={isReadOnlyMode}
          onSave={(savedTask, options) => {
            if (!options?.keepModalOpen) handleCloseModal();
            clearTasksCache();
            loadTasks();
          }}
        />
      )}
    </div>
  );
}

export default WarehouseDashboard;
