import React, { useState, useEffect } from 'react';
import TaskTable from './TaskTable';
import ColumnSettings from './ColumnSettings';
import AddTaskModal from './AddTaskModal';
import AccountantReportsModal from './AccountantReportsModal';
import API_BASE_URL from '../config';
import './Dashboard.css';

// Панель "Бух на затвердженні" - підтвердження заявок бухгалтером
function AccountantApprovalDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('pending');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0); // Ключ для оновлення таблиці
  
  // Стан для модального вікна відхилення
  const [rejectModal, setRejectModal] = useState({
    open: false,
    taskId: null,
    comment: '',
    returnTo: 'service' // 'service' або 'warehouse'
  });
  const [showReportsModal, setShowReportsModal] = useState(false);

  // Завантаження завдань
  useEffect(() => {
    loadTasks();
  }, [user, activeTab]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      let statusParam = '';
      
      switch (activeTab) {
        case 'pending':
          statusParam = 'accountantPending';
          break;
        case 'archive':
          statusParam = 'done';
          break;
        case 'debt':
          statusParam = 'accountantDebt';
          break;
        case 'allExceptApproved':
          statusParam = 'allExceptApproved';
          break;
        default:
          statusParam = 'accountantPending';
      }
      
      const response = await fetch(`${API_BASE_URL}/tasks/filter?status=${statusParam}&region=${user?.region || ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
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

  // Підтвердження/відмова заявки
  const handleApprove = async (taskId, approved, comment) => {
    // Якщо відмова - відкриваємо модальне вікно з чекбоксами
    if (approved === 'Відмова') {
      setRejectModal({
        open: true,
        taskId: taskId,
        comment: comment || '',
        returnTo: 'service'
      });
      return;
    }
    
    // Підтвердження
    try {
      const token = localStorage.getItem('token');
      const task = tasks.find(t => t.id === taskId || t._id === taskId);
      if (!task) return;

      const currentDateTime = new Date().toISOString();
      
      const updateData = {
        approvedByAccountant: approved,
        accountantComment: `Погоджено, претензій не маю. ${user?.name || user?.login || 'Користувач'}`,
        autoAccountantApprovedAt: currentDateTime
      };

      // Перевіряємо чи потрібно встановити bonusApprovalDate
      if (task.status === 'Виконано' && 
          (task.approvedByWarehouse === 'Підтверджено' || task.approvedByWarehouse === true)) {
        const d = new Date();
        updateData.bonusApprovalDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      }

      const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        // Логування події
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'approve',
              entityType: 'task',
              entityId: taskId,
              description: `Підтвердження заявки ${task.requestNumber || taskId} бухгалтером`,
              details: {
                field: 'approvedByAccountant',
                oldValue: task.approvedByAccountant || 'На розгляді',
                newValue: 'Підтверджено'
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        await loadTasks();
        setRefreshKey(prev => prev + 1);
      } else {
        alert('Помилка оновлення заявки');
      }
    } catch (error) {
      console.error('Помилка підтвердження:', error);
      alert('Помилка підтвердження заявки');
    }
  };

  // Обробка підтвердження відхилення з модального вікна
  const handleRejectConfirm = async () => {
    if (!rejectModal.comment.trim()) {
      alert('Введіть причину відмови');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const task = tasks.find(t => t.id === rejectModal.taskId || t._id === rejectModal.taskId);
      if (!task) return;

      const updateData = {
        approvedByAccountant: 'Відмова',
        accountantComment: rejectModal.comment
      };

      if (rejectModal.returnTo === 'service') {
        // Повернути в роботу сервісному відділу
        updateData.status = 'В роботі';
      } else if (rejectModal.returnTo === 'warehouse') {
        // Повернути в роботу завскладу
        // Статус залишається "Виконано", але завсклад повинен перепідтвердити
        updateData.approvedByWarehouse = 'На розгляді';
      }

      const response = await fetch(`${API_BASE_URL}/tasks/${rejectModal.taskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        // Логування події
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        try {
          await fetch(`${API_BASE_URL}/event-log`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: currentUser._id || currentUser.id,
              userName: currentUser.name || currentUser.login,
              userRole: currentUser.role,
              action: 'reject',
              entityType: 'task',
              entityId: rejectModal.taskId,
              description: `Відмова заявки ${task.requestNumber || rejectModal.taskId} бухгалтером: ${rejectModal.comment}`,
              details: {
                field: 'approvedByAccountant',
                oldValue: task.approvedByAccountant || 'На розгляді',
                newValue: 'Відмова',
                comment: rejectModal.comment,
                returnTo: rejectModal.returnTo
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        setRejectModal({ open: false, taskId: null, comment: '', returnTo: 'service' });
        await loadTasks();
        setRefreshKey(prev => prev + 1);
      } else {
        alert('Помилка оновлення заявки');
      }
    } catch (error) {
      console.error('Помилка відхилення:', error);
      alert('Помилка відхилення заявки');
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

  const tabs = [
    { id: 'pending', label: 'Заявка на підтвердженні', icon: '⏳' },
    { id: 'archive', label: 'Архів виконаних заявок', icon: '📁' },
    { id: 'debt', label: 'Заборгованість по документам', icon: '💰' },
    { id: 'allExceptApproved', label: 'Всі заявки окрім затвердженні до оплати на премію', icon: '📋' }
  ];

  return (
    <div className="dashboard no-header">
      {/* Main Content */}
      <div className="dashboard-main">
        {/* Sidebar */}
        <aside className="sidebar">
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
              className="sidebar-btn btn-reports"
              onClick={() => setShowReportsModal(true)}
            >
              📊 Бухгалтерські звіти
            </button>
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
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : (
            <TaskTable 
              key={refreshKey}
              user={user} 
              status={
                activeTab === 'pending' ? 'accountantPending' :
                activeTab === 'archive' ? 'done' :
                activeTab === 'debt' ? 'accountantDebt' :
                activeTab === 'allExceptApproved' ? 'allExceptApproved' :
                'accountantPending'
              }
              onColumnSettingsClick={() => setShowColumnSettings(true)}
              showRejectedApprovals={false}
              showRejectedInvoices={false}
              onRowClick={handleRowClick}
              onViewClick={handleViewClick}
              onApprove={handleApprove}
              showApproveButtons={activeTab === 'pending'}
              approveRole="accountant"
              columnsArea="accountant-approval"
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {showColumnSettings && (
        <ColumnSettings
          user={user}
          area="accountant-approval"
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {showAddTaskModal && (
        <AddTaskModal
          open={showAddTaskModal}
          onClose={handleCloseModal}
          initialData={editingTask || {}}
          user={user}
          panelType="accountant"
          debtOnly={activeTab === 'debt'}
          readOnly={isReadOnlyMode}
          onSave={(savedTask) => {
            handleCloseModal();
            loadTasks();
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}

      {/* Модальне вікно звітів */}
      {showReportsModal && (
        <AccountantReportsModal
          isOpen={showReportsModal}
          onClose={() => setShowReportsModal(false)}
          user={user}
        />
      )}

      {/* Модальне вікно відхилення */}
      {rejectModal.open && (
        <div className="modal-overlay" onClick={() => setRejectModal({ ...rejectModal, open: false })}>
          <div className="reject-modal" onClick={(e) => e.stopPropagation()}>
            <h3>⚠️ Відхилення заявки</h3>
            
            <div className="reject-form">
              <label>Причина відмови:</label>
              <textarea
                value={rejectModal.comment}
                onChange={(e) => setRejectModal({ ...rejectModal, comment: e.target.value })}
                placeholder="Введіть причину відмови..."
                rows={4}
              />
              
              <div className="return-options">
                <label className="return-option">
                  <input
                    type="radio"
                    name="returnTo"
                    checked={rejectModal.returnTo === 'service'}
                    onChange={() => setRejectModal({ ...rejectModal, returnTo: 'service' })}
                  />
                  <span>🔧 Повернути в роботу сервісному відділу</span>
                  <small>Статус заявки зміниться на "В роботі"</small>
                </label>
                
                <label className="return-option">
                  <input
                    type="radio"
                    name="returnTo"
                    checked={rejectModal.returnTo === 'warehouse'}
                    onChange={() => setRejectModal({ ...rejectModal, returnTo: 'warehouse' })}
                  />
                  <span>📦 Повернути в роботу завскладу</span>
                  <small>Завсклад повинен перепідтвердити заявку</small>
                </label>
              </div>
              
              <div className="modal-buttons">
                <button 
                  className="btn-cancel"
                  onClick={() => setRejectModal({ open: false, taskId: null, comment: '', returnTo: 'service' })}
                >
                  Скасувати
                </button>
                <button 
                  className="btn-reject-confirm"
                  onClick={handleRejectConfirm}
                  disabled={!rejectModal.comment.trim()}
                >
                  Відхилити заявку
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountantApprovalDashboard;
