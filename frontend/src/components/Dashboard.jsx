import React, { useState, useCallback, useEffect } from 'react';
import API_BASE_URL from '../config';
import ManagerNotificationsTab from './manager/ManagerNotificationsTab';
import TaskTable from './TaskTable';
import ContractsTable from './ContractsTable';
import ColumnSettings from './ColumnSettings';
import AddTaskModal from './AddTaskModal';
import LogisticsMap from './LogisticsMap';
import GlobalSearch from './GlobalSearch';
import { buildTaskDataFromExisting } from '../utils/taskCopyForCreate';
import './Dashboard.css';

function Dashboard({ user, panelType = 'service' }) {
  const [activeTab, setActiveTab] = useState('notDone');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showRejectedApprovals, setShowRejectedApprovals] = useState(false);
  const [showRejectedInvoices, setShowRejectedInvoices] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(false);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);

  const isServiceAdmin = user?.role === 'admin' || user?.role === 'administrator';

  const fetchNotificationsUnread = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const params = new URLSearchParams();
      if (isServiceAdmin) params.set('serviceGlobal', '1');
      params.set('excludeProcurement', '1');
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
    // Перевірка: підтверджені бухгалтером заявки можуть редагувати тільки admin/administrator
    const isApprovedByAccountant = task.status === 'Виконано' && task.approvedByAccountant === 'Підтверджено';
    const isAdmin = user?.role === 'admin' || user?.role === 'administrator';
    
    if (isApprovedByAccountant && !isAdmin) {
      setEditingTask(task);
      setIsReadOnlyMode(true);
      setShowAddTaskModal(true);
      return;
    }
    
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
    { id: 'notDone', label: 'Невиконані заявки', icon: '📋' },
    { id: 'pending', label: 'Очікують підтвердження', icon: '⏳' },
    { id: 'done', label: 'Архів заявок', icon: '✅' },
    { id: 'blocked', label: 'Заблоковані', icon: '🚫' },
    { id: 'paymentDebt', label: 'Заборгованість по оплаті', icon: '💳' },
    { id: 'contracts', label: 'Договори', icon: '📄' },
    { id: 'logistics', label: 'Логістика', icon: '🗺️' },
    { id: 'globalSearch', label: 'Глобальний пошук', icon: '🔍' },
    { id: 'notifications', label: 'Системні сповіщення', icon: '🔔' }
  ];

  return (
    <div className="dashboard no-header">
      {/* Main Layout */}
      <div className="dashboard-main">
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
            <div className="sidebar-section-title">Навігація</div>
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
                {tab.id === 'notifications' && notificationsUnreadCount > 0 ? (
                  <span className="tab-count">
                    {notificationsUnreadCount > 99 ? '99+' : notificationsUnreadCount}
                  </span>
                ) : null}
              </button>
            ))}
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
          ) : activeTab === 'logistics' ? (
            <LogisticsMap user={user} onTaskClick={handleLogisticsTaskClick} />
          ) : activeTab === 'globalSearch' ? (
            <GlobalSearch user={user} />
          ) : activeTab === 'notifications' ? (
            <ManagerNotificationsTab
              onUnreadCountChange={fetchNotificationsUnread}
              onOpenTask={handleOpenTaskFromNotification}
              globalFeed={isServiceAdmin}
              excludeProcurement
              description={
                isServiceAdmin
                  ? 'Як адміністратор сервісу ви бачите лише сповіщення, надіслані регіональним керівникам (ролі regional / regkerivn). Біля типу вказано отримувача. «Позначити всі прочитаними» стосується лише цих записів. Сповіщення по заявках закупівель (VZ) тут не показуються.'
                  : 'Персональні сповіщення для вашого облікового запису: нагадування про резерви, події по заявках регіону (рахунок, затвердження або відмова завскладом і бухгалтерією). Сповіщення по заявках закупівель (VZ) тут не показуються.'
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
