import React, { useState, useCallback, useEffect } from 'react';
import API_BASE_URL from '../config';
import ManagerNotificationsTab from './manager/ManagerNotificationsTab';
import TaskTable from './TaskTable';
import ContractsTable from './ContractsTable';
import ColumnSettings from './ColumnSettings';
import AddTaskModal from './AddTaskModal';
import LogisticsMap from './LogisticsMap';
import GlobalSearch from './GlobalSearch';
import ServiceStockPanel from './ServiceStockPanel';
import ServiceTransferRequestsPanel from './ServiceTransferRequestsPanel';
import { buildTaskDataFromExisting } from '../utils/taskCopyForCreate';
import { computeTaskModalReadOnly } from '../utils/taskModalAccess';
import './Dashboard.css';
import './ServiceModern.css';

const SERVICE_LAYOUT_KEY = 'servicePanel.layoutMode';

function Dashboard({ user, panelType = 'service' }) {
  const [layoutMode, setLayoutMode] = useState(() => {
    try {
      return localStorage.getItem(SERVICE_LAYOUT_KEY) || 'classic';
    } catch {
      return 'classic';
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    try {
      return panelType === 'service' && localStorage.getItem(SERVICE_LAYOUT_KEY) === 'modern'
        ? 'newRequests'
        : 'notDone';
    } catch {
      return 'notDone';
    }
  });
  const [taskCounts, setTaskCounts] = useState({ notInWork: 0, inWork: 0 });
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showRejectedApprovals, setShowRejectedApprovals] = useState(false);
  const [showRejectedInvoices, setShowRejectedInvoices] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(false);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);

  const isServiceAdmin = user?.role === 'admin' || user?.role === 'administrator';
  const isModern = panelType === 'service' && layoutMode === 'modern';

  useEffect(() => {
    if (panelType !== 'service') return undefined;
    try {
      localStorage.setItem(SERVICE_LAYOUT_KEY, layoutMode);
    } catch {
      /* ignore */
    }
    return undefined;
  }, [layoutMode, panelType]);

  useEffect(() => {
    setActiveTab((current) => {
      if (isModern && current === 'notDone') return 'newRequests';
      if (!isModern && (current === 'newRequests' || current === 'inWork')) return 'notDone';
      return current;
    });
  }, [isModern]);

  useEffect(() => {
    if (panelType !== 'service') return undefined;
    let cancelled = false;
    const region = user?.region && user.region !== 'Україна' ? user.region : '';
    const loadCounts = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/tasks/statistics?region=${encodeURIComponent(region)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setTaskCounts({
          notInWork: Number(data?.notInWork) || 0,
          inWork: Number(data?.inWork) || 0,
        });
      } catch {
        /* ignore */
      }
    };
    loadCounts();
    const id = setInterval(loadCounts, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [panelType, user?.region]);

  const fetchNotificationsUnread = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const params = new URLSearchParams();
      if (isServiceAdmin) params.set('serviceGlobal', '1');
      params.set('excludeProcurementServiceFeed', '1');
      const qs = `?${params.toString()}`;
      const res = await fetch(`${API_BASE_URL}/manager-notifications/unread-count${qs}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotificationsUnreadCount(typeof data.count === 'number' ? data.count : 0);
      }
    } catch {
      /* ignore */
    }
  }, [isServiceAdmin]);

  useEffect(() => {
    fetchNotificationsUnread();
    const id = setInterval(fetchNotificationsUnread, 60000);
    return () => clearInterval(id);
  }, [fetchNotificationsUnread]);

  useEffect(() => {
    const openNotifications = () => setActiveTab('notifications');
    window.addEventListener('dts-open-notifications-tab', openNotifications);
    return () => window.removeEventListener('dts-open-notifications-tab', openNotifications);
  }, []);

  const handleOpenTaskFromNotification = useCallback(async (taskId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        alert('Не вдалося завантажити заявку');
        return;
      }
      const task = await res.json();
      setEditingTask(task);
      setIsReadOnlyMode(true);
      setShowAddTaskModal(true);
    } catch {
      alert('Помилка завантаження заявки');
    }
  }, []);

  const handleRowClick = (task) => {
    setEditingTask(task);
    setIsReadOnlyMode(computeTaskModalReadOnly(user, task));
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

  const handleLogisticsTaskClick = (task) => {
    setEditingTask(task);
    setShowAddTaskModal(true);
  };

  /** Відкрити модалку «Додати заявку» з полями, заповненими на основі обраної заявки (клієнт, обладнання тощо). */
  const handleCreateFromTask = (task) => {
    const baseTask = buildTaskDataFromExisting(task);
    setEditingTask(baseTask);
    setIsReadOnlyMode(false);
    setShowAddTaskModal(true);
  };

  const tabs = [
    ...(isModern
      ? [
          { id: 'newRequests', label: 'Нові заявки', icon: '📋', group: 'work', count: taskCounts.notInWork, countTone: 'hanging' },
          { id: 'inWork', label: 'В роботі', icon: '🔧', group: 'work', count: taskCounts.inWork },
        ]
      : [
          { id: 'notDone', label: 'Невиконані заявки', icon: '📋', group: 'work' },
        ]),
    { id: 'pending', label: 'Очікують підтвердження', icon: '⏳', group: 'work' },
    { id: 'done', label: 'Архів заявок', icon: '✅', group: 'work' },
    { id: 'blocked', label: 'Заблоковані', icon: '🚫', group: 'work' },
    { id: 'paymentDebt', label: 'Заборгованість по оплаті', icon: '💳', group: 'work' },
    { id: 'contracts', label: 'Договори', icon: '📄', group: 'resources' },
    { id: 'stock', label: 'Залишки', icon: '📦', group: 'resources' },
    { id: 'transferRequests', label: 'Запити на переміщення', icon: '🔁', group: 'resources' },
    { id: 'logistics', label: 'Логістика', icon: '🗺️', group: 'resources' },
    { id: 'globalSearch', label: 'Глобальний пошук', icon: '🔍', group: 'other' },
    { id: 'notifications', label: 'Системні сповіщення', icon: '🔔', group: 'other' }
  ];

  const renderTabButton = (tab) => {
    const count = tab.id === 'notifications' ? notificationsUnreadCount : tab.count;
    const showCount = typeof count === 'number' && (tab.id === 'notifications' ? count > 0 : true);
    return (
    <button
      key={tab.id}
      className={`sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
      onClick={() => setActiveTab(tab.id)}
    >
      <span className="tab-icon">{tab.icon}</span>
      <span className="tab-label">{tab.label}</span>
      {showCount ? (
        <span className={`tab-count${tab.countTone === 'hanging' && count > 0 ? ' is-hanging' : ''}`}>
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </button>
    );
  };

  return (
    <div className={`dashboard no-header${isModern ? ' is-modern' : ''}`}>
      {/* Main Layout */}
      <div className={`dashboard-main${isModern ? ' is-modern' : ''}`}>
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Кнопка додати заявку */}
          <button 
            className="sidebar-btn btn-add"
            onClick={() => setShowAddTaskModal(true)}
          >
            ➕ Додати заявку
          </button>

          {/* Навігація по табах */}
          <nav className="sidebar-nav">
            {isModern ? (
              <>
                <div className="sidebar-section-title">Робота</div>
                {tabs.filter((tab) => tab.group === 'work').map(renderTabButton)}
                <div className="sidebar-section-title">Ресурси</div>
                {tabs.filter((tab) => tab.group === 'resources').map(renderTabButton)}
                <div className="sidebar-section-title">Інше</div>
                {tabs.filter((tab) => tab.group === 'other').map(renderTabButton)}
              </>
            ) : (
              <>
                <div className="sidebar-section-title">Навігація</div>
                {tabs.map(renderTabButton)}
              </>
            )}
          </nav>

          {/* Фільтри */}
          <div className="sidebar-filters">
            <div className="sidebar-section-title">Фільтри</div>
            <label className="sidebar-checkbox">
              <input 
                type="checkbox" 
                checked={showRejectedApprovals}
                onChange={(e) => setShowRejectedApprovals(e.target.checked)}
              />
              <span className="checkbox-text">Відхилені заявки на затвердженні</span>
            </label>
            <label className="sidebar-checkbox">
              <input 
                type="checkbox" 
                checked={showRejectedInvoices}
                onChange={(e) => setShowRejectedInvoices(e.target.checked)}
              />
              <span className="checkbox-text">Відхилені рахунки</span>
            </label>
          </div>

          {/* Налаштування */}
          <div className="sidebar-settings">
            <div className="sidebar-section-title">Налаштування</div>
            {panelType === 'service' ? (
              <button
                type="button"
                className={`sidebar-btn btn-layout-toggle${isModern ? ' is-classic-target' : ''}`}
                onClick={() => setLayoutMode((mode) => (mode === 'modern' ? 'classic' : 'modern'))}
              >
                {isModern ? '↩ Перейти до класичного виду' : '✨ Покращена версія (тест)'}
              </button>
            ) : null}
            <button
              className="sidebar-btn btn-settings"
              onClick={() => setShowColumnSettings(true)}
            >
              ⚙️ Налаштувати колонки
            </button>
          </div>
        </aside>

        {/* Table Area */}
        <main className="table-area">
          {activeTab === 'contracts' ? (
            <ContractsTable user={user} />
          ) : activeTab === 'stock' ? (
            <ServiceStockPanel user={user} />
          ) : activeTab === 'transferRequests' ? (
            <ServiceTransferRequestsPanel user={user} />
          ) : activeTab === 'logistics' ? (
            <LogisticsMap user={user} onTaskClick={handleLogisticsTaskClick} />
          ) : activeTab === 'globalSearch' ? (
            <GlobalSearch user={user} />
          ) : activeTab === 'notifications' ? (
            <ManagerNotificationsTab
              onUnreadCountChange={fetchNotificationsUnread}
              onOpenTask={handleOpenTaskFromNotification}
              globalFeed={isServiceAdmin}
              excludeProcurementServiceFeed
              description={
                isServiceAdmin
                  ? 'Як адміністратор сервісу ви бачите лише сповіщення, надіслані регіональним керівникам (ролі regional / regkerivn). Біля типу вказано отримувача. «Позначити всі прочитаними» стосується лише цих записів. Інші сповіщення по закупівлях (крім «Заявку виконано» та відмови по позиції для заявника) тут не показуються.'
                  : 'Персональні сповіщення для вашого облікового запису: нагадування про резерви, події по заявках регіону (рахунок, затвердження або відмова завскладом і бухгалтерією). Сповіщення VidZakupok про нові заявки та склад тут не показуються; «Заявку виконано» та відмова відділу закупівель по позиції — для вас, якщо ви заявник, або для адміністратора.'
              }
            />
          ) : (
            <TaskTable 
              user={user} 
              status={activeTab}
              onColumnSettingsClick={() => setShowColumnSettings(true)}
              showRejectedApprovals={showRejectedApprovals}
              showRejectedInvoices={showRejectedInvoices}
              onRowClick={handleRowClick}
              onViewClick={handleViewClick}
              columnsArea={panelType}
              onCreateFromTask={handleCreateFromTask}
              compactVariant={isModern}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {showColumnSettings && (
        <ColumnSettings
          user={user}
          area={panelType}
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {showAddTaskModal && (
        <AddTaskModal
          open={showAddTaskModal}
          onClose={handleCloseModal}
          user={user}
          initialData={editingTask || {}}
          readOnly={isReadOnlyMode}
          modernLayout={isModern}
          onSave={(savedTask, options) => {
            if (!options?.keepModalOpen) handleCloseModal();
            if (!options?.keepModalOpen) setTimeout(() => {
              window.location.reload();
            }, 500);
          }}
        />
      )}
    </div>
  );
}

export default Dashboard;
