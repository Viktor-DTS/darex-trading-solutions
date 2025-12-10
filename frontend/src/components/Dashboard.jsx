import React, { useState } from 'react';
import TaskTable from './TaskTable';
import ContractsTable from './ContractsTable';
import ColumnSettings from './ColumnSettings';
import AddTaskModal from './AddTaskModal';
import LogisticsMap from './LogisticsMap';
import './Dashboard.css';

function Dashboard({ user, panelType = 'service' }) {
  const [activeTab, setActiveTab] = useState('notDone');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showRejectedApprovals, setShowRejectedApprovals] = useState(false);
  const [showRejectedInvoices, setShowRejectedInvoices] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const handleRowClick = (task) => {
    // Перевірка: підтверджені бухгалтером заявки можуть редагувати тільки admin/administrator
    const isApprovedByAccountant = task.status === 'Виконано' && task.approvedByAccountant === 'Підтверджено';
    const isAdmin = user?.role === 'admin' || user?.role === 'administrator';
    
    if (isApprovedByAccountant && !isAdmin) {
      alert('Редагування підтверджених бухгалтером заявок доступне тільки для адміністраторів.');
      return;
    }
    
    setEditingTask(task);
    setShowAddTaskModal(true);
  };

  const handleCloseModal = () => {
    setShowAddTaskModal(false);
    setEditingTask(null);
  };

  const handleLogisticsTaskClick = (task) => {
    setEditingTask(task);
    setShowAddTaskModal(true);
  };

  const tabs = [
    { id: 'notDone', label: 'Невиконані заявки', icon: '📋' },
    { id: 'pending', label: 'Очікують підтвердження', icon: '⏳' },
    { id: 'done', label: 'Заявки на підтвердженні у завсклада та бухгалтера', icon: '✅' },
    { id: 'blocked', label: 'Заблоковані', icon: '🚫' },
    { id: 'contracts', label: 'Договори', icon: '📄' },
    { id: 'logistics', label: 'Логістика', icon: '🗺️' }
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
          ) : (
            <TaskTable 
              user={user} 
              status={activeTab}
              onColumnSettingsClick={() => setShowColumnSettings(true)}
              showRejectedApprovals={showRejectedApprovals}
              showRejectedInvoices={showRejectedInvoices}
              onRowClick={handleRowClick}
              columnsArea={panelType}
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
