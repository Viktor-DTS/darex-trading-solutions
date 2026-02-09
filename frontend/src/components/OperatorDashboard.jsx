import React, { useState } from 'react';
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
            <TaskTable 
              user={user} 
              status={activeTab}
              onColumnSettingsClick={() => setShowColumnSettings(true)}
              showRejectedApprovals={false}
              showRejectedInvoices={false}
              onRowClick={handleRowClick}
              columnsArea="operator"
              onCreateFromTask={handleCreateFromTask}
            />
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

export default OperatorDashboard;
