import React, { useState, useEffect, useRef } from 'react';
import TaskTable from './TaskTable';
import ColumnSettings from './ColumnSettings';
import AddTaskModal from './AddTaskModal';
import API_BASE_URL from '../config';
import './Dashboard.css';
import './AccountantUpload.css';

// Панель "Бух рахунки" - робота із заявками на рахунок
function AccountantDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('invoiceRequests');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // Ключ для оновлення таблиці
  const invoiceFileRef = useRef(null);
  const actFileRef = useRef(null);

  const handleRowClick = (task) => {
    // Завжди відкриваємо редагування заявки при кліку на рядок
    setEditingTask(task);
    setShowAddTaskModal(true);
  };

  // Окремий обробник для кнопки завантаження документів
  const handleUploadClick = (task) => {
    console.log('[UPLOAD MODAL] Task data:', {
      invoiceStatus: task.invoiceStatus,
      invoiceFile: task.invoiceFile,
      needInvoice: task.needInvoice,
      needAct: task.needAct,
      actFile: task.actFile
    });
    setSelectedRequest(task);
    setShowUploadModal(true);
  };

  const handleCloseModal = () => {
    setShowAddTaskModal(false);
    setEditingTask(null);
  };

  const handleCloseUploadModal = () => {
    setShowUploadModal(false);
    setSelectedRequest(null);
  };

  // Завантаження файлу рахунку
  const handleUploadInvoice = async (file, invoiceNumber) => {
    if (!selectedRequest?.invoiceRequestId && !selectedRequest?._id) return;
    
    setUploadingId('invoice');
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('invoiceFile', file);
      formData.append('invoiceNumber', invoiceNumber || '');
      
      const requestId = selectedRequest.invoiceRequestId || selectedRequest._id;
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (response.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
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
              action: 'update',
              entityType: 'invoice',
              entityId: requestId,
              description: `Завантаження файлу рахунку для заявки ${selectedRequest.requestNumber || requestId}${invoiceNumber ? ` (№${invoiceNumber})` : ''}`,
              details: {
                invoiceNumber: invoiceNumber || '',
                requestNumber: selectedRequest.requestNumber || ''
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        // Отримуємо оновлені дані заявки
        const updatedTaskResponse = await fetch(`${API_BASE_URL}/tasks/${selectedRequest._id || selectedRequest.taskId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (updatedTaskResponse.ok) {
          const updatedTask = await updatedTaskResponse.json();
          setSelectedRequest(updatedTask);
        }
        
        alert('✅ Файл рахунку завантажено!');
        setRefreshKey(prev => prev + 1);
      } else {
        const error = await response.json();
        alert(`❌ Помилка: ${error.message}`);
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
      alert('❌ Помилка завантаження файлу');
    } finally {
      setUploadingId(null);
    }
  };

  // Завантаження файлу акту
  const handleUploadAct = async (file) => {
    if (!selectedRequest?.invoiceRequestId && !selectedRequest?._id) return;
    
    setUploadingId('act');
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('actFile', file);
      
      const requestId = selectedRequest.invoiceRequestId || selectedRequest._id;
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/upload-act`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (response.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
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
              action: 'update',
              entityType: 'invoice',
              entityId: requestId,
              description: `Завантаження файлу акту для заявки ${selectedRequest.requestNumber || requestId}`,
              details: {
                requestNumber: selectedRequest.requestNumber || ''
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        // Отримуємо оновлені дані заявки
        const updatedTaskResponse = await fetch(`${API_BASE_URL}/tasks/${selectedRequest._id || selectedRequest.taskId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (updatedTaskResponse.ok) {
          const updatedTask = await updatedTaskResponse.json();
          setSelectedRequest(updatedTask);
        }
        
        alert('✅ Файл акту завантажено!');
        setRefreshKey(prev => prev + 1);
      } else {
        const error = await response.json();
        alert(`❌ Помилка: ${error.message}`);
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
      alert('❌ Помилка завантаження файлу');
    } finally {
      setUploadingId(null);
    }
  };

  // Видалення файлу рахунку
  const handleDeleteInvoiceFile = async () => {
    if (!selectedRequest?.invoiceRequestId && !selectedRequest?._id) return;
    
    if (!window.confirm('Ви впевнені, що хочете видалити файл рахунку?')) return;
    
    setUploadingId('delete-invoice');
    try {
      const token = localStorage.getItem('token');
      const requestId = selectedRequest.invoiceRequestId || selectedRequest._id;
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/invoice`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        alert('✅ Файл рахунку видалено!');
        handleCloseUploadModal();
        setRefreshKey(prev => prev + 1);
      } else {
        const error = await response.json();
        alert(`❌ Помилка: ${error.message}`);
      }
    } catch (error) {
      console.error('Помилка видалення:', error);
      alert('❌ Помилка видалення файлу');
    } finally {
      setUploadingId(null);
    }
  };

  // Видалення файлу акту
  const handleDeleteActFile = async () => {
    if (!selectedRequest?.invoiceRequestId && !selectedRequest?._id) return;
    
    if (!window.confirm('Ви впевнені, що хочете видалити файл акту?')) return;
    
    setUploadingId('delete-act');
    try {
      const token = localStorage.getItem('token');
      const requestId = selectedRequest.invoiceRequestId || selectedRequest._id;
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/act`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        alert('✅ Файл акту видалено!');
        handleCloseUploadModal();
        setRefreshKey(prev => prev + 1);
      } else {
        const error = await response.json();
        alert(`❌ Помилка: ${error.message}`);
      }
    } catch (error) {
      console.error('Помилка видалення:', error);
      alert('❌ Помилка видалення файлу');
    } finally {
      setUploadingId(null);
    }
  };

  // Підтвердити завдання на рахунок (статус completed)
  const handleConfirmInvoice = async () => {
    if (!selectedRequest?.invoiceRequestId && !selectedRequest?._id) return;
    
    // Перевіряємо чи є завантажений файл рахунку
    if (!selectedRequest.invoiceFile && selectedRequest.needInvoice !== false) {
      alert('❌ Спочатку завантажте файл рахунку!');
      return;
    }
    
    if (!window.confirm('Підтвердити виконання заявки на рахунок?')) return;
    
    setUploadingId('confirm');
    try {
      const token = localStorage.getItem('token');
      const requestId = selectedRequest.invoiceRequestId || selectedRequest._id;
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/confirm`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'completed' })
      });
      
      if (response.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
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
              entityType: 'invoice',
              entityId: requestId,
              description: `Підтвердження виконання заявки на рахунок ${selectedRequest.requestNumber || requestId}`,
              details: {
                requestNumber: selectedRequest.requestNumber || '',
                invoiceNumber: selectedRequest.invoiceNumber || ''
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        alert('✅ Заявку на рахунок підтверджено!');
        handleCloseUploadModal();
        setRefreshKey(prev => prev + 1);
      } else {
        const error = await response.json();
        alert(`❌ Помилка: ${error.message}`);
      }
    } catch (error) {
      console.error('Помилка підтвердження:', error);
      alert('❌ Помилка підтвердження');
    } finally {
      setUploadingId(null);
    }
  };

  // Відхилити запит на рахунок (як в оригінальному проекті)
  // 1. Видаляємо InvoiceRequest
  // 2. Оновлюємо Task з інформацією про відхилення
  const handleRejectInvoice = async (task, reason) => {
    const invoiceRequestId = task.invoiceRequestId;
    const taskId = task._id || task.id;
    
    if (!invoiceRequestId) {
      alert('❌ ID запиту на рахунок не знайдено');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      
      // 1. Видаляємо InvoiceRequest
      const deleteResponse = await fetch(`${API_BASE_URL}/invoice-requests/${invoiceRequestId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!deleteResponse.ok) {
        const error = await deleteResponse.json();
        throw new Error(error.message || 'Помилка видалення запиту на рахунок');
      }
      
      // 2. Оновлюємо Task з інформацією про відхилення
      const updateResponse = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoiceRejectionReason: reason,
          invoiceRejectionDate: new Date().toISOString(),
          invoiceRejectionUser: user?.name || user?.login || 'Бухгалтер',
          invoiceRequestId: null,
          needInvoice: false,
          needAct: false
        })
      });
      
      if (updateResponse.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
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
              entityType: 'invoice',
              entityId: taskId,
              description: `Відхилення запиту на рахунок для заявки ${task.requestNumber || taskId}: ${reason}`,
              details: {
                requestNumber: task.requestNumber || '',
                reason: reason
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        alert('✅ Запит на рахунок відхилено та видалено. Можна подати повторний запит.');
        setRefreshKey(prev => prev + 1);
      } else {
        const error = await updateResponse.json();
        alert(`❌ Помилка оновлення заявки: ${error.message}`);
      }
    } catch (error) {
      console.error('Помилка відхилення:', error);
      alert('❌ Помилка відхилення запиту: ' + error.message);
    }
  };

  // Повернути в роботу (статус processing)
  const handleReturnToWork = async () => {
    if (!selectedRequest?.invoiceRequestId && !selectedRequest?._id) return;
    
    if (!window.confirm('Повернути заявку на рахунок в роботу?')) return;
    
    setUploadingId('return');
    try {
      const token = localStorage.getItem('token');
      const requestId = selectedRequest.invoiceRequestId || selectedRequest._id;
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/return-to-work`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        
        // Логування події
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
              action: 'update',
              entityType: 'invoice',
              entityId: requestId,
              description: `Повернення заявки на рахунок ${selectedRequest.requestNumber || requestId} в роботу`,
              details: {
                requestNumber: selectedRequest.requestNumber || '',
                oldStatus: 'completed',
                newStatus: 'processing'
              }
            })
          });
        } catch (logErr) {
          console.error('Помилка логування:', logErr);
        }
        
        alert('✅ Заявку повернено в роботу!');
        handleCloseUploadModal();
        setRefreshKey(prev => prev + 1);
      } else {
        const error = await response.json();
        alert(`❌ Помилка: ${error.message}`);
      }
    } catch (error) {
      console.error('Помилка повернення:', error);
      alert('❌ Помилка повернення в роботу');
    } finally {
      setUploadingId(null);
    }
  };

  const tabs = [
    { id: 'invoiceRequests', label: 'Заявка на рахунок', icon: '📋' },
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

          {/* Filters */}
          <div className="sidebar-filters">
            <div className="sidebar-section-title">Фільтри</div>
            <label className="sidebar-checkbox">
              <input
                type="checkbox"
                checked={showAllInvoices}
                onChange={(e) => setShowAllInvoices(e.target.checked)}
              />
              <span>Показати всі заявки (включно з виконаними)</span>
            </label>
          </div>

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
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : (
            <TaskTable 
              user={user}
              refreshTrigger={refreshKey}
              status={activeTab === 'allExceptApproved' ? 'allExceptApproved' : 'accountantInvoiceRequests'}
              onColumnSettingsClick={() => setShowColumnSettings(true)}
              showRejectedApprovals={false}
              showRejectedInvoices={false}
              showAllInvoices={showAllInvoices}
              onRowClick={handleRowClick}
              onUploadClick={handleUploadClick}
              onRejectInvoice={handleRejectInvoice}
              approveRole=""
              columnsArea="accountant-invoice"
            />
          )}
        </main>
      </div>

      {/* Modals */}
      {showColumnSettings && (
        <ColumnSettings
          user={user}
          area="accountant-invoice"
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
          onSave={(savedTask, options) => {
            if (!options?.keepModalOpen) handleCloseModal();
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}

      {/* Модальне вікно завантаження файлів рахунку */}
      {showUploadModal && selectedRequest && (
        <div className="upload-modal-overlay">
          <div className="upload-modal">
            <div className="upload-modal-header">
              <h3>📄 Завантаження документів</h3>
              <button className="close-btn" onClick={handleCloseUploadModal}>×</button>
            </div>
            
            <div className="upload-modal-content">
              <div className="request-info">
                <p><strong>Заявка:</strong> {selectedRequest.requestNumber}</p>
                <p><strong>Клієнт:</strong> {selectedRequest.client}</p>
                <p><strong>ЄДРПОУ:</strong> {selectedRequest.edrpou}</p>
              </div>
              
              {/* Завантаження рахунку */}
              {(selectedRequest.needInvoice !== false) && (
                <div className="upload-section">
                  <h4>📄 Рахунок</h4>
                  {selectedRequest.invoiceFile ? (
                    <div className="file-exists">
                      <span>✅ Завантажено: {selectedRequest.invoiceFileName}</span>
                      <div className="file-actions">
                        <button 
                          className="btn-view"
                          onClick={() => window.open(selectedRequest.invoiceFile, '_blank')}
                        >
                          👁️ Переглянути
                        </button>
                        <button 
                          className="btn-delete"
                          onClick={handleDeleteInvoiceFile}
                          disabled={uploadingId === 'delete-invoice'}
                        >
                          {uploadingId === 'delete-invoice' ? '⏳...' : '🗑️ Видалити'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="upload-controls">
                      <input
                        type="text"
                        placeholder="Номер рахунку (автозаповнення з назви файлу)"
                        id="invoiceNumber"
                        className="invoice-number-input"
                      />
                      <input
                        type="file"
                        ref={invoiceFileRef}
                        accept=".pdf,.jpg,.jpeg,.png"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            // Автогенерація номера рахунку: дата + назва файлу
                            const currentDate = new Date().toISOString().split('T')[0];
                            const fileName = file.name.replace(/\.[^/.]+$/, ""); // Без розширення
                            const generatedInvoiceNumber = `${currentDate}_${fileName}`;
                            
                            // Заповнюємо поле номера рахунку
                            const inputEl = document.getElementById('invoiceNumber');
                            if (inputEl && !inputEl.value) {
                              inputEl.value = generatedInvoiceNumber;
                            }
                            
                            const invoiceNumber = inputEl?.value || generatedInvoiceNumber;
                            handleUploadInvoice(file, invoiceNumber);
                          }
                        }}
                      />
                      <button 
                        className="btn-upload"
                        onClick={() => invoiceFileRef.current?.click()}
                        disabled={uploadingId === 'invoice'}
                      >
                        {uploadingId === 'invoice' ? '⏳ Завантаження...' : '📤 Завантажити рахунок'}
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {/* Завантаження акту */}
              {selectedRequest.needAct && (
                <div className="upload-section">
                  <h4>📋 Акт виконаних робіт</h4>
                  {selectedRequest.actFile ? (
                    <div className="file-exists">
                      <span>✅ Завантажено: {selectedRequest.actFileName}</span>
                      <div className="file-actions">
                        <button 
                          className="btn-view"
                          onClick={() => window.open(selectedRequest.actFile, '_blank')}
                        >
                          👁️ Переглянути
                        </button>
                        <button 
                          className="btn-delete"
                          onClick={handleDeleteActFile}
                          disabled={uploadingId === 'delete-act'}
                        >
                          {uploadingId === 'delete-act' ? '⏳...' : '🗑️ Видалити'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="upload-controls">
                      <input
                        type="file"
                        ref={actFileRef}
                        accept=".pdf,.jpg,.jpeg,.png"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) handleUploadAct(file);
                        }}
                      />
                      <button 
                        className="btn-upload"
                        onClick={() => actFileRef.current?.click()}
                        disabled={uploadingId === 'act'}
                      >
                        {uploadingId === 'act' ? '⏳ Завантаження...' : '📤 Завантажити акт'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Статус запиту */}
              <div className="upload-section status-section">
                <h4>📊 Статус запиту</h4>
                <div className="status-row">
                  <div className={`invoice-status-badge ${selectedRequest.invoiceStatus || 'pending'}`}>
                    {selectedRequest.invoiceStatus === 'completed' ? '✅ Виконано' :
                     selectedRequest.invoiceStatus === 'processing' ? '🔄 В обробці' :
                     '⏳ Очікує обробки'}
                  </div>
                  {/* Кнопка повернути в роботу - тільки якщо статус completed */}
                  {selectedRequest.invoiceStatus === 'completed' && (
                    <button 
                      className="btn-return-to-work"
                      onClick={handleReturnToWork}
                      disabled={uploadingId === 'return'}
                    >
                      {uploadingId === 'return' ? '⏳...' : '🔄 Повернути в роботу'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            <div className="upload-modal-footer">
              {/* Кнопка підтвердження - тільки якщо є файли і статус не completed */}
              {selectedRequest.invoiceStatus !== 'completed' && (
                <button 
                  className="btn-confirm"
                  onClick={handleConfirmInvoice}
                  disabled={uploadingId === 'confirm' || 
                    (!selectedRequest.invoiceFile && selectedRequest.needInvoice !== false)}
                >
                  {uploadingId === 'confirm' ? '⏳ Підтвердження...' : '✅ Підтвердити виконання'}
                </button>
              )}
              <button className="btn-close" onClick={handleCloseUploadModal}>
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountantDashboard;
