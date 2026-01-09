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
  const [testingForm, setTestingForm] = useState({
    notes: '',
    result: '',
    materials: [], // Масив об'єктів { type, quantity, unit }
    procedure: '',
    conclusion: 'passed',
    engineer1: '',
    engineer2: '',
    engineer3: ''
  });
  const [serviceEngineers, setServiceEngineers] = useState([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
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

  // Завантаження списку сервісних інженерів
  useEffect(() => {
    const loadEngineers = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const users = await response.json();
          // Фільтруємо тільки сервісних інженерів
          const engineers = users.filter(u => u.role === 'service');
          setServiceEngineers(engineers);
        }
      } catch (error) {
        console.error('Помилка завантаження інженерів:', error);
      }
    };
    loadEngineers();
  }, []);

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
    
    // Парсимо матеріали - спочатку перевіряємо нове поле testingMaterialsArray
    let parsedMaterials = [];
    if (Array.isArray(equipment.testingMaterialsArray) && equipment.testingMaterialsArray.length > 0) {
      // Нове поле - масив об'єктів
      parsedMaterials = equipment.testingMaterialsArray;
    } else if (equipment.testingMaterialsJson) {
      // Старе поле - JSON рядок
      try {
        parsedMaterials = JSON.parse(equipment.testingMaterialsJson);
      } catch (e) {
        console.error('Помилка парсингу матеріалів:', e);
      }
    } else if (Array.isArray(equipment.testingMaterials)) {
      // Дуже старе поле (якщо ще є)
      parsedMaterials = equipment.testingMaterials;
    }
    
    setTestingForm({
      notes: equipment.testingNotes || '',
      result: equipment.testingResult || '',
      materials: parsedMaterials,
      procedure: equipment.testingProcedure || '',
      conclusion: equipment.testingConclusion || 'passed',
      engineer1: equipment.testingEngineer1 || '',
      engineer2: equipment.testingEngineer2 || '',
      engineer3: equipment.testingEngineer3 || ''
    });
    setShowModal(true);
  };

  const handleFormChange = (field, value) => {
    setTestingForm(prev => ({ ...prev, [field]: value }));
  };

  // Функції для роботи з матеріалами
  const handleAddMaterial = () => {
    setTestingForm(prev => ({
      ...prev,
      materials: [...prev.materials, { type: '', quantity: '', unit: 'шт.' }]
    }));
  };

  const handleRemoveMaterial = (index) => {
    setTestingForm(prev => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== index)
    }));
  };

  const handleMaterialChange = (index, field, value) => {
    setTestingForm(prev => ({
      ...prev,
      materials: prev.materials.map((mat, i) => 
        i === index ? { ...mat, [field]: value } : mat
      )
    }));
  };

  // Функції для галереї
  const openGallery = (index) => {
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  const closeGallery = () => {
    setGalleryOpen(false);
  };

  const nextImage = () => {
    if (!selectedEquipment?.testingFiles) return;
    const imageFiles = selectedEquipment.testingFiles.filter(f => f.mimetype?.startsWith('image/'));
    setGalleryIndex((prev) => (prev + 1) % imageFiles.length);
  };

  const prevImage = () => {
    if (!selectedEquipment?.testingFiles) return;
    const imageFiles = selectedEquipment.testingFiles.filter(f => f.mimetype?.startsWith('image/'));
    setGalleryIndex((prev) => (prev - 1 + imageFiles.length) % imageFiles.length);
  };

  // Обробка клавіш для галереї
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!galleryOpen) return;
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'Escape') closeGallery();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [galleryOpen, selectedEquipment]);

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
        body: JSON.stringify({ 
          status, 
          notes: testingForm.notes,
          result: testingForm.result,
          materials: testingForm.materials,
          procedure: testingForm.procedure,
          conclusion: status === 'failed' ? 'failed' : testingForm.conclusion,
          engineer1: testingForm.engineer1,
          engineer2: testingForm.engineer2,
          engineer3: testingForm.engineer3
        })
      });
      
      if (response.ok) {
        setShowModal(false);
        setSelectedEquipment(null);
        setTestingForm({ notes: '', result: '', materials: [], procedure: '', conclusion: 'passed', engineer1: '', engineer2: '', engineer3: '' });
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

  const handleDeleteFile = async (file) => {
    if (!selectedEquipment) return;
    if (!window.confirm(`Видалити файл "${file.originalName}"?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const fileId = file.cloudinaryId || file._id;
      
      const response = await fetch(`${API_BASE_URL}/equipment/${selectedEquipment._id}/testing-files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        setSelectedEquipment(result.equipment);
        loadRequests();
      } else {
        const error = await response.json();
        alert(error.error || 'Помилка видалення файлу');
      }
    } catch (error) {
      console.error('Помилка:', error);
      alert('Помилка з\'єднання з сервером');
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
                  <div className="form-section-title">📝 Інформація по тестуванню</div>
                  
                  <div className="form-group">
                    <label>Процедура тестування:</label>
                    <textarea
                      value={testingForm.procedure}
                      onChange={(e) => handleFormChange('procedure', e.target.value)}
                      placeholder="Опишіть проведену процедуру тестування..."
                      rows={3}
                    />
                  </div>

                  <div className="form-group">
                    <label>Результат тестування:</label>
                    <textarea
                      value={testingForm.result}
                      onChange={(e) => handleFormChange('result', e.target.value)}
                      placeholder="Детальний результат тестування..."
                      rows={3}
                    />
                  </div>

                  <div className="form-group materials-group">
                    <label>Використані матеріали:</label>
                    <div className="materials-list">
                      {testingForm.materials.map((material, index) => (
                        <div key={index} className="material-row">
                          <div className="material-fields">
                            <div className="material-field-group">
                              <label className="material-label">Тип матеріалу:</label>
                              <input
                                type="text"
                                placeholder="Введіть назву матеріалу"
                                value={material.type}
                                onChange={(e) => handleMaterialChange(index, 'type', e.target.value)}
                                className="material-type-input"
                              />
                            </div>
                            <div className="material-field-row">
                              <div className="material-field-group quantity-group">
                                <label className="material-label">Кількість:</label>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={material.quantity}
                                  onChange={(e) => handleMaterialChange(index, 'quantity', e.target.value)}
                                  className="material-quantity-input"
                                />
                              </div>
                              <div className="material-field-group unit-group">
                                <label className="material-label">Од. виміру:</label>
                                <select
                                  value={material.unit}
                                  onChange={(e) => handleMaterialChange(index, 'unit', e.target.value)}
                                  className="material-unit-select"
                                >
                                  <option value="шт.">шт.</option>
                                  <option value="л.">л.</option>
                                  <option value="кг.">кг.</option>
                                  <option value="м.">м.</option>
                                  <option value="комплект">комплект</option>
                                  <option value="упаковка">упаковка</option>
                                </select>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-remove-material"
                            onClick={() => handleRemoveMaterial(index)}
                            title="Видалити"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn-add-material"
                        onClick={handleAddMaterial}
                      >
                        ➕ Додати матеріал
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Висновок:</label>
                    <select 
                      value={testingForm.conclusion}
                      onChange={(e) => handleFormChange('conclusion', e.target.value)}
                    >
                      <option value="passed">✅ Тест пройдено повністю</option>
                      <option value="partial">⚠️ Тест пройдено частково</option>
                      <option value="failed">❌ Тест не пройдено</option>
                    </select>
                  </div>

                  <div className="form-section-title">👷 Сервісні інженери</div>
                  <div className="engineers-grid">
                    <div className="form-group">
                      <label>Сервісний інженер №1:</label>
                      <select 
                        value={testingForm.engineer1}
                        onChange={(e) => handleFormChange('engineer1', e.target.value)}
                      >
                        <option value="">— Не вибрано —</option>
                        {serviceEngineers.map(eng => (
                          <option key={eng._id || eng.login} value={eng.name}>{eng.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Сервісний інженер №2:</label>
                      <select 
                        value={testingForm.engineer2}
                        onChange={(e) => handleFormChange('engineer2', e.target.value)}
                      >
                        <option value="">— Не вибрано —</option>
                        {serviceEngineers.map(eng => (
                          <option key={eng._id || eng.login} value={eng.name}>{eng.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Сервісний інженер №3:</label>
                      <select 
                        value={testingForm.engineer3}
                        onChange={(e) => handleFormChange('engineer3', e.target.value)}
                      >
                        <option value="">— Не вибрано —</option>
                        {serviceEngineers.map(eng => (
                          <option key={eng._id || eng.login} value={eng.name}>{eng.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Додаткові примітки:</label>
                    <textarea
                      value={testingForm.notes}
                      onChange={(e) => handleFormChange('notes', e.target.value)}
                      placeholder="Додаткові зауваження та примітки..."
                      rows={2}
                    />
                  </div>

                  <div className="form-section-title">📎 Файли тестування</div>
                  <div className="form-group">
                    <label className="file-upload-label">
                      <input 
                        type="file" 
                        multiple 
                        onChange={handleUploadFiles}
                        disabled={uploadingFiles}
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                      />
                      <span className="file-upload-btn">
                        {uploadingFiles ? '⏳ Завантаження...' : '📁 Обрати файли (фото, PDF, Excel, Word)'}
                      </span>
                    </label>
                  </div>
                </>
              )}

              {selectedEquipment.testingFiles && selectedEquipment.testingFiles.length > 0 && (
                <div className="files-section">
                  <h4>Завантажені файли ({selectedEquipment.testingFiles.length}):</h4>
                  <div className="files-grid">
                    {selectedEquipment.testingFiles.map((file, index) => {
                      const imageFiles = selectedEquipment.testingFiles.filter(f => f.mimetype?.startsWith('image/'));
                      const imageIndex = imageFiles.findIndex(f => f.cloudinaryId === file.cloudinaryId || f.cloudinaryUrl === file.cloudinaryUrl);
                      
                      return (
                        <div key={file.cloudinaryId || index} className="file-item-wrapper">
                          <div className="file-item">
                            {file.mimetype?.startsWith('image/') ? (
                              <img 
                                src={file.cloudinaryUrl} 
                                alt={file.originalName}
                                onClick={() => openGallery(imageIndex >= 0 ? imageIndex : 0)}
                              />
                            ) : (
                              <div 
                                className="file-icon"
                                onClick={() => window.open(file.cloudinaryUrl, '_blank')}
                              >
                                {file.mimetype?.includes('pdf') ? '📕' : 
                                 file.mimetype?.includes('excel') || file.mimetype?.includes('spreadsheet') ? '📗' :
                                 file.mimetype?.includes('word') || file.mimetype?.includes('document') ? '📘' : '📄'}
                              </div>
                            )}
                            <span className="file-name" title={file.originalName}>
                              {file.originalName}
                            </span>
                          </div>
                          {activeTab !== 'completed' && (
                            <button 
                              className="file-delete-btn"
                              onClick={() => handleDeleteFile(file)}
                              title="Видалити файл"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'completed' && (
                <div className="testing-results-section">
                  {selectedEquipment.testingConclusion && (
                    <div className="conclusion-badge-container">
                      <span className={`conclusion-badge ${selectedEquipment.testingConclusion}`}>
                        {selectedEquipment.testingConclusion === 'passed' && '✅ Тест пройдено'}
                        {selectedEquipment.testingConclusion === 'partial' && '⚠️ Частково пройдено'}
                        {selectedEquipment.testingConclusion === 'failed' && '❌ Тест не пройдено'}
                      </span>
                    </div>
                  )}
                  
                  {selectedEquipment.testingProcedure && (
                    <div className="result-block">
                      <h4>📋 Процедура тестування:</h4>
                      <p>{selectedEquipment.testingProcedure}</p>
                    </div>
                  )}
                  
                  {selectedEquipment.testingResult && (
                    <div className="result-block">
                      <h4>📊 Результат тестування:</h4>
                      <p>{selectedEquipment.testingResult}</p>
                    </div>
                  )}
                  
                  {(() => {
                    let materials = [];
                    // Спочатку перевіряємо нове поле testingMaterialsArray
                    if (Array.isArray(selectedEquipment.testingMaterialsArray) && selectedEquipment.testingMaterialsArray.length > 0) {
                      materials = selectedEquipment.testingMaterialsArray;
                    } else if (selectedEquipment.testingMaterialsJson) {
                      try {
                        materials = JSON.parse(selectedEquipment.testingMaterialsJson);
                      } catch (e) { /* ignore */ }
                    } else if (Array.isArray(selectedEquipment.testingMaterials)) {
                      materials = selectedEquipment.testingMaterials;
                    }
                    
                    if (materials.length === 0) return null;
                    
                    return (
                      <div className="result-block">
                        <h4>🔧 Використані матеріали:</h4>
                        <table className="materials-table">
                          <thead>
                            <tr>
                              <th>Тип матеріалу</th>
                              <th>Кількість</th>
                            </tr>
                          </thead>
                          <tbody>
                            {materials.map((mat, idx) => (
                              <tr key={idx}>
                                <td>{mat.type || '—'}</td>
                                <td>{mat.quantity} {mat.unit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                  
                  {selectedEquipment.testingNotes && (
                    <div className="result-block">
                      <h4>📝 Примітки:</h4>
                      <p>{selectedEquipment.testingNotes}</p>
                    </div>
                  )}

                  {selectedEquipment.testingCompletedByName && (
                    <div className="info-row">
                      <span className="label">Тестував:</span>
                      <span className="value">{selectedEquipment.testingCompletedByName}</span>
                    </div>
                  )}

                  {(selectedEquipment.testingEngineer1 || selectedEquipment.testingEngineer2 || selectedEquipment.testingEngineer3) && (
                    <div className="result-block">
                      <h4>👷 Сервісні інженери:</h4>
                      <div className="engineers-list">
                        {selectedEquipment.testingEngineer1 && (
                          <div className="engineer-item">
                            <span className="engineer-label">№1:</span>
                            <span className="engineer-name">{selectedEquipment.testingEngineer1}</span>
                          </div>
                        )}
                        {selectedEquipment.testingEngineer2 && (
                          <div className="engineer-item">
                            <span className="engineer-label">№2:</span>
                            <span className="engineer-name">{selectedEquipment.testingEngineer2}</span>
                          </div>
                        )}
                        {selectedEquipment.testingEngineer3 && (
                          <div className="engineer-item">
                            <span className="engineer-label">№3:</span>
                            <span className="engineer-name">{selectedEquipment.testingEngineer3}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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

      {/* Галерея для перегляду зображень */}
      {galleryOpen && selectedEquipment?.testingFiles && (
        <div className="gallery-overlay" onClick={closeGallery}>
          <div className="gallery-container" onClick={e => e.stopPropagation()}>
            <button className="gallery-close" onClick={closeGallery}>×</button>
            
            {(() => {
              const imageFiles = selectedEquipment.testingFiles.filter(f => f.mimetype?.startsWith('image/'));
              if (imageFiles.length === 0) return null;
              const currentFile = imageFiles[galleryIndex];
              
              return (
                <>
                  <div className="gallery-main">
                    <button className="gallery-nav gallery-prev" onClick={prevImage} disabled={imageFiles.length <= 1}>
                      ‹
                    </button>
                    <div className="gallery-image-container">
                      <img 
                        src={currentFile?.cloudinaryUrl} 
                        alt={currentFile?.originalName}
                        className="gallery-image"
                      />
                    </div>
                    <button className="gallery-nav gallery-next" onClick={nextImage} disabled={imageFiles.length <= 1}>
                      ›
                    </button>
                  </div>
                  
                  <div className="gallery-info">
                    <span className="gallery-filename">{currentFile?.originalName}</span>
                    <span className="gallery-counter">{galleryIndex + 1} / {imageFiles.length}</span>
                  </div>
                  
                  {imageFiles.length > 1 && (
                    <div className="gallery-thumbnails">
                      {imageFiles.map((file, idx) => (
                        <img
                          key={file.cloudinaryId || idx}
                          src={file.cloudinaryUrl}
                          alt={file.originalName}
                          className={`gallery-thumbnail ${idx === galleryIndex ? 'active' : ''}`}
                          onClick={() => setGalleryIndex(idx)}
                        />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default TestingDashboard;

