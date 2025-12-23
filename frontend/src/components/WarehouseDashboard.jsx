import React, { useState, useEffect, useMemo, useRef } from 'react';
import TaskTable from './TaskTable';
import ColumnSettings from './ColumnSettings';
import AddTaskModal from './AddTaskModal';
import EquipmentScanner from './equipment/EquipmentScanner';
import EquipmentList from './equipment/EquipmentList';
import EquipmentEditModal from './equipment/EquipmentEditModal';
import EquipmentMoveModal from './equipment/EquipmentMoveModal';
import EquipmentShipModal from './equipment/EquipmentShipModal';
import EquipmentStatistics from './equipment/EquipmentStatistics';
import API_BASE_URL from '../config';
import './Dashboard.css';

function WarehouseDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('pending');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showAddEquipmentModal, setShowAddEquipmentModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showShipModal, setShowShipModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const equipmentListRef = useRef(null);

  // Завантаження завдань та складів
  useEffect(() => {
    loadTasks();
    loadWarehouses();
  }, [user]);

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
    }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      // Завантажуємо всі заявки зі статусом "Виконано"
      const response = await fetch(`${API_BASE_URL}/tasks/filter?status=warehousePending&region=${user?.region || ''}`, {
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

  // Фільтрація завдань по вкладках
  const filteredTasks = useMemo(() => {
    switch (activeTab) {
      case 'pending':
        // Заявки на підтвердженні: статус "Виконано" і ще не підтверджено зав. складом
        return tasks.filter(t => 
          t.status === 'Виконано' && 
          t.approvedByWarehouse !== 'Підтверджено'
        );
      case 'approvedWarehouse':
        // Архів підтверджених завскладом: статус "Виконано" і підтверджено зав. складом
        return tasks.filter(t => 
          t.status === 'Виконано' && 
          t.approvedByWarehouse === 'Підтверджено'
        );
      case 'archive':
        // Архів виконаних: статус "Виконано" і підтверджено бухгалтером
        return tasks.filter(t => 
          t.status === 'Виконано' && 
          t.approvedByAccountant === 'Підтверджено'
        );
      default:
        return tasks;
    }
  }, [tasks, activeTab]);

  // Підтвердження/відмова заявки
  const handleApprove = async (taskId, approved, comment) => {
    try {
      const token = localStorage.getItem('token');
      const task = tasks.find(t => t.id === taskId || t._id === taskId);
      if (!task) return;

      const currentDate = new Date().toISOString().split('T')[0];
      const currentDateTime = new Date().toISOString();
      
      const updateData = {
        approvedByWarehouse: approved,
        warehouseComment: approved === 'Підтверджено' 
          ? `Погоджено, претензій не маю. ${user?.name || user?.login || 'Користувач'}`
          : (comment || task.warehouseComment),
        // При відмові змінюємо статус на "В роботі"
        status: approved === 'Відмова' ? 'В роботі' : task.status
      };

      // Якщо підтверджено - записуємо дату
      if (approved === 'Підтверджено') {
        updateData.autoWarehouseApprovedAt = currentDateTime;
        
        // Якщо бухгалтер раніше відхилив - скидаємо на "На розгляді"
        if (task.approvedByAccountant === 'Відмова') {
          updateData.approvedByAccountant = 'На розгляді';
        }
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
              action: approved === 'Підтверджено' ? 'approve' : 'reject',
              entityType: 'task',
              entityId: taskId,
              description: approved === 'Підтверджено' 
                ? `Підтвердження заявки ${task.requestNumber || taskId} завскладом`
                : `Відмова заявки ${task.requestNumber || taskId} завскладом: ${comment || 'без коментаря'}`,
              details: {
                field: 'approvedByWarehouse',
                oldValue: task.approvedByWarehouse || 'На розгляді',
                newValue: approved
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        // Перезавантажуємо список
        await loadTasks();
        
        // Якщо підтверджено - переходимо в архів
        if (approved === 'Підтверджено') {
          setActiveTab('archive');
        }
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
    setShowAddTaskModal(true);
  };

  const handleCloseModal = () => {
    setShowAddTaskModal(false);
    setEditingTask(null);
  };

  const tabs = [
    { id: 'pending', label: 'Заявки на підтвердженні', icon: '⏳' },
    { id: 'approvedWarehouse', label: 'Архів підтверджених', icon: '✅' },
    { id: 'archive', label: 'Архів виконаних заявок', icon: '📁' },
    { id: 'equipment', label: 'Складський облік', icon: '📦' },
    { id: 'statistics', label: 'Статистика', icon: '📊' },
  ];

  const handleEquipmentAdded = () => {
    setShowScanner(false);
    // Оновлюємо список обладнання
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
  };

  const handleMove = (equipment) => {
    setSelectedEquipment(equipment);
    setShowMoveModal(true);
  };

  const handleShip = (equipment) => {
    setSelectedEquipment(equipment);
    setShowShipModal(true);
  };

  const handleMoveSuccess = () => {
    setShowMoveModal(false);
    setSelectedEquipment(null);
    // Оновлюємо список обладнання
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
  };

  const handleShipSuccess = () => {
    setShowShipModal(false);
    setSelectedEquipment(null);
    // Оновлюємо список обладнання
    if (equipmentListRef.current) {
      equipmentListRef.current.refresh();
    }
  };

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
              className="sidebar-btn btn-settings"
              onClick={() => setShowColumnSettings(true)}
            >
              ⚙️ Налаштувати колонки
            </button>
          </div>
        </aside>

        {/* Table Area */}
        <main className="table-area">
          {activeTab === 'equipment' ? (
            <div className="equipment-tab">
              <div className="equipment-tab-header">
                <h2>Складський облік обладнання</h2>
                <div className="equipment-header-buttons">
                  <button 
                    className="btn-primary"
                    onClick={() => setShowAddEquipmentModal(true)}
                  >
                    ➕ Додати обладнання від постачальників
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={() => {
                      setSelectedEquipment(null);
                      setShowMoveModal(true);
                    }}
                  >
                    📦 Зробити переміщення між складами
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={() => {
                      setSelectedEquipment(null);
                      setShowShipModal(true);
                    }}
                  >
                    🚚 Зробити відвантаження замовнику
                  </button>
                </div>
              </div>
              <EquipmentList
                ref={equipmentListRef}
                user={user}
                warehouses={warehouses}
                onMove={handleMove}
                onShip={handleShip}
              />
            </div>
          ) : activeTab === 'statistics' ? (
            <EquipmentStatistics warehouses={warehouses} />
          ) : loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : (
            <TaskTable 
              user={user} 
              status={
                activeTab === 'pending' ? 'warehousePending' : 
                activeTab === 'approvedWarehouse' ? 'warehouseApproved' : 
                'done'
              }
              onColumnSettingsClick={() => setShowColumnSettings(true)}
              showRejectedApprovals={false}
              showRejectedInvoices={false}
              onRowClick={handleRowClick}
              onApprove={handleApprove}
              showApproveButtons={activeTab === 'pending'}
              approveRole="warehouse"
              columnsArea="warehouse"
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {showColumnSettings && (
        <ColumnSettings
          user={user}
          area="warehouse"
          onClose={() => setShowColumnSettings(false)}
        />
      )}

      {showAddTaskModal && (
        <AddTaskModal
          open={showAddTaskModal}
          onClose={handleCloseModal}
          initialData={editingTask || {}}
          user={user}
          panelType="warehouse"
          onSave={(savedTask) => {
            handleCloseModal();
            loadTasks();
          }}
        />
      )}

      {showScanner && (
        <EquipmentScanner
          user={user}
          warehouses={warehouses}
          onEquipmentAdded={handleEquipmentAdded}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showAddEquipmentModal && (
        <EquipmentEditModal
          equipment={null}
          warehouses={warehouses}
          user={user}
          onClose={() => setShowAddEquipmentModal(false)}
          onSuccess={() => {
            setShowAddEquipmentModal(false);
            if (equipmentListRef.current) {
              equipmentListRef.current.refresh();
            }
          }}
        />
      )}

      {showMoveModal && (
        <EquipmentMoveModal
          equipment={selectedEquipment}
          warehouses={warehouses}
          onClose={() => {
            setShowMoveModal(false);
            setSelectedEquipment(null);
          }}
          onSuccess={handleMoveSuccess}
        />
      )}

      {showShipModal && (
        <EquipmentShipModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowShipModal(false);
            setSelectedEquipment(null);
          }}
          onSuccess={handleShipSuccess}
        />
      )}
    </div>
  );
}

export default WarehouseDashboard;
