import React, { useState, useMemo } from 'react';
import TaskTable from './TaskTable';
import ColumnSettings from './ColumnSettings';
import AddTaskModal from './AddTaskModal';
import ContractsTable from './ContractsTable';
import { buildTaskDataFromExisting } from '../utils/taskCopyForCreate';
import './Dashboard.css';

function OperatorDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('inProgress');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
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
    setEditingTask(task);
    setIsReadOnlyMode(activeTab === 'archive');
    setShowAddTaskModal(true);
  };

  const handleCloseModal = () => {
    setShowAddTaskModal(false);
    setEditingTask(null);
    setIsReadOnlyMode(false);
  };

  /** Відкрити модалку «Додати заявку» з полями на основі обраної заявки. */
  const handleCreateFromTask = (task) => {
    const baseTask = buildTaskDataFromExisting(task);
    setEditingTask(baseTask);
    setIsReadOnlyMode(false);
    setShowAddTaskModal(true);
  };

  const tabs = [
    { id: 'inProgress', label: 'Заявки на виконанні', icon: '📋' },
    { id: 'archive', label: 'Архів виконаних заявок', icon: '📁' },
    { id: 'paymentDebt', label: 'Заборгованість по оплаті', icon: '💳' },
    { id: 'contracts', label: 'Договори', icon: '📄' }
  ];

  return (
    <div className="dashboard no-header">
      {/* Main Content */}
      <div className="dashboard-main">
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Add Task Button */}
          <button 
            className="sidebar-btn btn-add"
            onClick={() => { setEditingTask(null); setShowAddTaskModal(true); }}
          >
            + Додати заявку
          </button>

          {/* Navigation */}
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

          {/* Settings */}
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
                showRejectedApprovals={false}
                showRejectedInvoices={false}
                onRowClick={handleRowClick}
                columnsArea="operator"
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
          area="operator"
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {showAddTaskModal && (
        <AddTaskModal
          open={showAddTaskModal}
          onClose={handleCloseModal}
          initialData={editingTask || {}}
          user={user}
          panelType="operator"
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

export default OperatorDashboard;
