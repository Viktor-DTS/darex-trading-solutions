import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../config';
import './TestingDashboard.css';

const TESTING_STATUSES = {
  none: { label: 'Не тестувалось', color: '#6c757d' },
  requested: { label: 'Очікує тестування', color: '#ffc107' },
  in_progress: { label: 'В роботі', color: '#17a2b8' },
  completed: { label: 'Завершено', color: '#28a745' },
  failed: { label: 'Не пройшло', color: '#dc3545' }
};

function TestingDashboard({ user }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'in_progress', 'completed'
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      let statusFilter = '';
      if (activeTab === 'pending') statusFilter = 'requested';
      else if (activeTab === 'in_progress') statusFilter = 'in_progress';
      else statusFilter = 'completed,failed';
      
      const response = await fetch(`${API_BASE_URL}/equipment/testing-requests?status=${statusFilter}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      }
    } catch (error) {
      console.error('Помилка завантаження заявок:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleTakeToWork = async (equipment) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/${equipment._id}/take-testing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        loadRequests();
      } else {
        const error = await response.json();
        alert(error.error || 'Помилка взяття в роботу');
      }
    } catch (error) {
      console.error('Помилка:', error);
      alert('Помилка з\'єднання з сервером');
    }
  };

  const handleOpenComplete = (equipment) => {
    setSelectedEquipment(equipment);
    setNotes(equipment.testingNotes || '');
    setShowModal(true);
  };

  const handleCompleteTesting = async (status) => {
    if (!selectedEquipment) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/${selectedEquipment._id}/complete-testing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, notes })
      });
      
      if (response.ok) {
        setShowModal(false);
        setSelectedEquipment(null);
        setNotes('');
        loadRequests();
      } else {
        const error = await response.json();
        alert(error.error || 'Помилка завершення тестування');
      }
    } catch (error) {
      console.error('Помилка:', error);
      alert('Помилка з\'єднання з сервером');
    }
  };

  const handleUploadFiles = async (e) => {
    if (!selectedEquipment || !e.target.files || e.target.files.length === 0) return;
    
    try {
      setUploadingFiles(true);
      const token = localStorage.getItem('token');
      const formData = new FormData();
      
      for (const file of e.target.files) {
        formData.append('files', file);
      }
      
      const response = await fetch(`${API_BASE_URL}/equipment/${selectedEquipment._id}/testing-files`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        setSelectedEquipment(result.equipment);
        loadRequests();
      } else {
        const error = await response.json();
        alert(error.error || 'Помилка завантаження файлів');
      }
    } catch (error) {
      console.error('Помилка:', error);
      alert('Помилка з\'єднання з сервером');
    } finally {
      setUploadingFiles(false);
      e.target.value = '';
    }
  };

  const handleCancelTesting = async (equipment) => {
    if (!window.confirm('Скасувати заявку на тестування?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/${equipment._id}/cancel-testing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        loadRequests();
      } else {
        const error = await response.json();
        alert(error.error || 'Помилка скасування');
      }
    } catch (error) {
      console.error('Помилка:', error);
      alert('Помилка з\'єднання з сервером');
    }
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const config = TESTING_STATUSES[status] || TESTING_STATUSES.none;
    return (
      <span 
        className="status-badge" 
        style={{ backgroundColor: config.color }}
      >
        {config.label}
      </span>
    );
  };

  return (
    <div className="testing-dashboard">
      <div className="testing-header">
        <h2>🧪 Відділ тестування</h2>
        <p className="testing-description">Управління заявками на тестування обладнання</p>
      </div>

      <div className="testing-tabs">
        <button 
          className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          ⏳ Очікують ({requests.filter(r => r.testingStatus === 'requested').length || '—'})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'in_progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('in_progress')}
        >
          🔧 В роботі ({requests.filter(r => r.testingStatus === 'in_progress').length || '—'})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          ✅ Завершені
        </button>
      </div>

      {loading ? (
        <div className="loading">Завантаження...</div>
      ) : requests.length === 0 ? (
        <div className="no-requests">
          {activeTab === 'pending' && 'Немає заявок, що очікують'}
          {activeTab === 'in_progress' && 'Немає заявок в роботі'}
          {activeTab === 'completed' && 'Немає завершених заявок'}
        </div>
      ) : (
        <div className="requests-table-container">
          <table className="requests-table">
            <thead>
              <tr>
                <th>Дія</th>
                <th>Статус</th>
                <th>Тип обладнання</th>
                <th>Серійний номер</th>
                <th>Виробник</th>
                <th>Склад</th>
                <th>Заявник</th>
                <th>Дата заявки</th>
                {activeTab !== 'pending' && <th>Тестувальник</th>}
                {activeTab === 'completed' && <th>Дата тесту</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map(item => (
                <tr key={item._id}>
                  <td className="actions-cell">
                    {activeTab === 'pending' && (
                      <>
                        <button 
                          className="btn-action btn-take"
                          onClick={() => handleTakeToWork(item)}
                          title="Взяти в роботу"
                        >
                          ▶️ В роботу
                        </button>
                        <button 
                          className="btn-action btn-cancel"
                          onClick={() => handleCancelTesting(item)}
                          title="Скасувати"
                        >
                          ❌
                        </button>
                      </>
                    )}
                    {activeTab === 'in_progress' && (
                      <button 
                        className="btn-action btn-complete"
                        onClick={() => handleOpenComplete(item)}
                        title="Завершити тестування"
                      >
                        ✅ Завершити
                      </button>
                    )}
                    {activeTab === 'completed' && (
                      <button 
                        className="btn-action btn-view"
                        onClick={() => {
                          setSelectedEquipment(item);
                          setShowModal(true);
                        }}
                        title="Переглянути"
                      >
                        👁️ Деталі
                      </button>
                    )}
                  </td>
                  <td>{getStatusBadge(item.testingStatus)}</td>
                  <td>{item.type || '—'}</td>
                  <td>{item.serialNumber || '—'}</td>
                  <td>{item.manufacturer || '—'}</td>
                  <td>{item.currentWarehouseName || item.currentWarehouse || '—'}</td>
                  <td>{item.testingRequestedByName || '—'}</td>
                  <td>{formatDate(item.testingRequestedAt)}</td>
                  {activeTab !== 'pending' && (
                    <td>{item.testingTakenByName || item.testingCompletedByName || '—'}</td>
                  )}
                  {activeTab === 'completed' && (
                    <td>{formatDate(item.testingDate)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Модальне вікно завершення тестування */}
      {showModal && selectedEquipment && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content testing-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {activeTab === 'completed' ? '📋 Деталі тестування' : '✅ Завершення тестування'}
              </h3>
              <button className="btn-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="equipment-info">
                <div className="info-row">
                  <span className="label">Тип:</span>
                  <span className="value">{selectedEquipment.type || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Серійний номер:</span>
                  <span className="value">{selectedEquipment.serialNumber || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Виробник:</span>
                  <span className="value">{selectedEquipment.manufacturer || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Статус:</span>
                  <span className="value">{getStatusBadge(selectedEquipment.testingStatus)}</span>
                </div>
                {selectedEquipment.testingDate && (
                  <div className="info-row">
                    <span className="label">Дата тестування:</span>
                    <span className="value">{formatDate(selectedEquipment.testingDate)}</span>
                  </div>
                )}
              </div>

              {activeTab !== 'completed' && (
                <>
                  <div className="form-group">
                    <label>Примітки по тестуванню:</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Введіть результати та примітки по тестуванню..."
                      rows={4}
                    />
                  </div>

                  <div className="form-group">
                    <label>Файли тестування:</label>
                    <input 
                      type="file" 
                      multiple 
                      onChange={handleUploadFiles}
                      disabled={uploadingFiles}
                    />
                    {uploadingFiles && <span className="uploading">Завантаження...</span>}
                  </div>
                </>
              )}

              {selectedEquipment.testingFiles && selectedEquipment.testingFiles.length > 0 && (
                <div className="files-section">
                  <h4>Завантажені файли ({selectedEquipment.testingFiles.length}):</h4>
                  <div className="files-grid">
                    {selectedEquipment.testingFiles.map((file, index) => (
                      <div key={file.cloudinaryId || index} className="file-item">
                        {file.mimetype?.startsWith('image/') ? (
                          <img 
                            src={file.cloudinaryUrl} 
                            alt={file.originalName}
                            onClick={() => window.open(file.cloudinaryUrl, '_blank')}
                          />
                        ) : (
                          <div 
                            className="file-icon"
                            onClick={() => window.open(file.cloudinaryUrl, '_blank')}
                          >
                            📄
                          </div>
                        )}
                        <span className="file-name" title={file.originalName}>
                          {file.originalName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedEquipment.testingNotes && activeTab === 'completed' && (
                <div className="notes-section">
                  <h4>Примітки:</h4>
                  <p>{selectedEquipment.testingNotes}</p>
                </div>
              )}
            </div>

            {activeTab !== 'completed' && (
              <div className="modal-footer">
                <button 
                  className="btn-cancel"
                  onClick={() => setShowModal(false)}
                >
                  Скасувати
                </button>
                <button 
                  className="btn-fail"
                  onClick={() => handleCompleteTesting('failed')}
                >
                  ❌ Не пройшло
                </button>
                <button 
                  className="btn-success"
                  onClick={() => handleCompleteTesting('completed')}
                >
                  ✅ Тест пройдено
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TestingDashboard;

