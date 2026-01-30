import React, { useState, useMemo } from 'react';
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
  const [paymentDebtTasks, setPaymentDebtTasks] = useState([]);

  const parseSum = (val) => {
    if (val == null || val === '') return 0;
    const s = String(val).replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const paymentDebtSummary = useMemo(() => {
    if (activeTab !== 'paymentDebt' || !paymentDebtTasks.length) return null;
    const totalSum = paymentDebtTasks.reduce((acc, t) => acc + parseSum(t.serviceTotal), 0);
    const byClient = {};
    paymentDebtTasks.forEach(t => {
      const key = (t.edrpou && String(t.edrpou).trim()) || (t.client && String(t.client).trim()) || '—';
      if (!byClient[key]) byClient[key] = { count: 0, sum: 0, name: t.client || '—' };
      byClient[key].count += 1;
      byClient[key].sum += parseSum(t.serviceTotal);
    });
    return { total: paymentDebtTasks.length, totalSum, byClient: Object.entries(byClient) };
  }, [activeTab, paymentDebtTasks]);

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
    { id: 'globalSearch', label: 'Глобальний пошук', icon: '🔍' }
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
          ) : (
            <>
              {activeTab === 'paymentDebt' && paymentDebtSummary && (
                <div className="payment-debt-summary">
                  <div className="payment-debt-stats">
                    <span>Всього заявок: <strong>{paymentDebtSummary.total}</strong></span>
                    <span>Сума боргу: <strong>{paymentDebtSummary.totalSum.toFixed(2)} грн</strong></span>
                  </div>
                  {paymentDebtSummary.byClient.length > 0 && (
                    <div className="payment-debt-by-client">
                      <div className="payment-debt-by-client-title">По замовниках:</div>
                      <ul>
                        {paymentDebtSummary.byClient.map(([key, { count, sum, name }]) => (
                          <li key={key}>{name || key}: {count} заявок, {sum.toFixed(2)} грн</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
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
                onTasksLoaded={activeTab === 'paymentDebt' ? setPaymentDebtTasks : undefined}
              />
            </>
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
          onSave={(savedTask) => {
            handleCloseModal();
            setTimeout(() => {
              window.location.reload();
            }, 500);
          }}
        />
      )}
    </div>
  );
}

export default Dashboard;
