import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import API_BASE_URL from '../config.js';
import { tasksAPI } from '../utils/tasksAPI';
import './MobileViewArea.css';

export default function MobileViewArea({ user }) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [taskFiles, setTaskFiles] = useState({}); // Файли для кожної заявки
  const [loadingFiles, setLoadingFiles] = useState({}); // Стан завантаження файлів
  const [fileDescription, setFileDescription] = useState(''); // Опис для файлів
  const [selectedFiles, setSelectedFiles] = useState(null); // Обрані файли

  // Функція для виходу з мобільного режиму
  const handleLogout = () => {
    if (window.confirm('Вийти з мобільного режиму?')) {
      window.location.reload();
    }
  };

  // Завантаження заявок
  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true);
        const tasksData = await tasksAPI.getAll();
        setTasks(tasksData);
      } catch (error) {
        console.error('Помилка завантаження заявок:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, []);

  // Функція для відкриття модального вікна з інформацією про заявку
  const openTaskInfo = (task) => {
    setSelectedTask(task);
    setShowTaskModal(true);
    // Завантажуємо файли для цієї заявки
    loadTaskFiles(task.id);
  };

  // Функція для завантаження файлів заявки
  const loadTaskFiles = async (taskId) => {
    try {
      setLoadingFiles(prev => ({ ...prev, [taskId]: true }));
      const response = await fetch(`${API_BASE_URL}/files/task/${taskId}`);
      if (response.ok) {
        const files = await response.json();
        setTaskFiles(prev => ({ ...prev, [taskId]: files }));
      } else {
        setTaskFiles(prev => ({ ...prev, [taskId]: [] }));
      }
    } catch (error) {
      console.error('Помилка завантаження файлів:', error);
      setTaskFiles(prev => ({ ...prev, [taskId]: [] }));
    } finally {
      setLoadingFiles(prev => ({ ...prev, [taskId]: false }));
    }
  };

  // Функція для перегляду файлу
  const viewFile = (file) => {
    if (file.cloudinaryUrl) {
      window.open(file.cloudinaryUrl, '_blank');
    } else {
      alert('URL файлу недоступний');
    }
  };

  // Функція для видалення файлу
  const deleteFile = async (fileId, taskId) => {
    if (!window.confirm('Видалити цей файл?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('Файл видалено!');
        // Оновлюємо список файлів
        await loadTaskFiles(taskId);
      } else {
        alert('Помилка видалення файлу');
      }
    } catch (error) {
      console.error('Помилка видалення файлу:', error);
      alert('Помилка видалення файлу');
    }
  };

  // Функція для завантаження файлів
  const handleFileUpload = async (files, taskId, description = '') => {
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    const formData = new FormData();
    formData.append('taskId', taskId);
    formData.append('description', description);
    
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/files/upload/${taskId}`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        alert('Файли успішно завантажено!');
        // Оновлюємо список файлів для цієї заявки
        await loadTaskFiles(taskId);
      } else {
        alert('Помилка завантаження файлів');
      }
    } catch (error) {
      console.error('Помилка завантаження файлів:', error);
      alert('Помилка завантаження файлів');
    } finally {
      setUploadingFiles(false);
    }
  };

  // Функція для обробки вибору файлів з пристрою
  const handleFileSelect = (files) => {
    setSelectedFiles(files);
    setFileDescription('');
  };

  // Функція для завантаження обраних файлів
  const handleUploadSelectedFiles = async () => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    
    await handleFileUpload(selectedFiles, selectedTask.id, fileDescription);
    setSelectedFiles(null);
    setFileDescription('');
  };

  // Функція для завантаження з камери
  const handleCameraCapture = async (taskId) => {
    try {
      // Спочатку отримуємо список доступних камер
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      let currentStream = null;
      let currentDeviceIndex = 0;

      // Функція для створення потоку з конкретної камери
      const createStream = async (deviceIndex = 0) => {
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
        }
        
        const constraints = {
          video: {
            deviceId: videoDevices[deviceIndex] ? { exact: videoDevices[deviceIndex].deviceId } : undefined
          }
        };
        
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        return currentStream;
      };

      // Створюємо початковий потік
      const stream = await createStream();
      currentStream = stream;
      
      // Створюємо модальне вікно для камери
      const cameraModal = document.createElement('div');
      cameraModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        padding: 20px;
      `;

      // Створюємо відео елемент
      const video = document.createElement('video');
      video.style.cssText = `
        max-width: 100%;
        max-height: 60vh;
        border-radius: 8px;
        background: #000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      `;
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;

      // Створюємо кнопки
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex;
        gap: 16px;
        margin-top: 20px;
        flex-wrap: wrap;
        justify-content: center;
      `;

      const captureButton = document.createElement('button');
      captureButton.textContent = '📷 Зробити фото';
      captureButton.style.cssText = `
        background: #28a745;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        min-width: 140px;
      `;

      const cancelButton = document.createElement('button');
      cancelButton.textContent = '❌ Скасувати';
      cancelButton.style.cssText = `
        background: #dc3545;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        min-width: 140px;
      `;

      // Кнопка перемикання камер (тільки якщо є більше однієї камери)
      let switchCameraButton = null;
      if (videoDevices.length > 1) {
        switchCameraButton = document.createElement('button');
        switchCameraButton.textContent = '🔄 Змінити камеру';
        switchCameraButton.style.cssText = `
          background: #007bff;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          min-width: 140px;
        `;

        switchCameraButton.onclick = async () => {
          currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
          const newStream = await createStream(currentDeviceIndex);
          video.srcObject = newStream;
        };
      }

      // Додаємо обробники подій
      captureButton.onclick = () => {
        // Отримуємо опис з поля вводу
        const descriptionInput = document.getElementById('photo-description');
        const description = descriptionInput ? descriptionInput.value : '';
        
        // Створюємо canvas для захоплення кадру
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        
        // Конвертуємо в blob
        canvas.toBlob(async (blob) => {
          if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
          }
          document.body.removeChild(cameraModal);
          
          const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
          await handleFileUpload([file], taskId, description);
        }, 'image/jpeg');
      };

      cancelButton.onclick = () => {
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
        }
        document.body.removeChild(cameraModal);
      };

      // Додаємо елементи до модального вікна
      buttonContainer.appendChild(captureButton);
      if (switchCameraButton) {
        buttonContainer.appendChild(switchCameraButton);
      }
      buttonContainer.appendChild(cancelButton);
      cameraModal.appendChild(video);
      cameraModal.appendChild(buttonContainer);

      // Додаємо модальне вікно до сторінки
      document.body.appendChild(cameraModal);

      // Додаємо інструкції
      const instructions = document.createElement('div');
      instructions.textContent = 'Наведіть камеру, сфокусуйтеся та натисніть "Зробити фото"';
      instructions.style.cssText = `
        color: #fff;
        font-size: 16px;
        margin-bottom: 20px;
        text-align: center;
        max-width: 300px;
        line-height: 1.4;
      `;
      cameraModal.insertBefore(instructions, video);

      // Додаємо поле для опису фото
      const descriptionContainer = document.createElement('div');
      descriptionContainer.style.cssText = `
        margin: 20px 0;
        width: 100%;
        max-width: 400px;
      `;

      const descriptionLabel = document.createElement('label');
      descriptionLabel.textContent = 'Опис фото (необов\'язково):';
      descriptionLabel.style.cssText = `
        display: block;
        color: #fff;
        font-size: 14px;
        margin-bottom: 8px;
        text-align: center;
      `;

      const descriptionInput = document.createElement('input');
      descriptionInput.id = 'photo-description';
      descriptionInput.type = 'text';
      descriptionInput.placeholder = 'Наприклад: Фото обладнання, документи...';
      descriptionInput.style.cssText = `
        width: 100%;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        background: #fff;
        color: #333;
        box-sizing: border-box;
      `;

      descriptionContainer.appendChild(descriptionLabel);
      descriptionContainer.appendChild(descriptionInput);
      cameraModal.insertBefore(descriptionContainer, buttonContainer);

      // Додаємо індикатор камери
      if (videoDevices.length > 1) {
        const cameraIndicator = document.createElement('div');
        cameraIndicator.textContent = `Камера ${currentDeviceIndex + 1} з ${videoDevices.length}`;
        cameraIndicator.style.cssText = `
          color: #fff;
          font-size: 14px;
          margin-top: 10px;
          text-align: center;
          opacity: 0.8;
        `;
        cameraModal.appendChild(cameraIndicator);
      }

    } catch (error) {
      console.error('Помилка доступу до камери:', error);
      alert('Помилка доступу до камери: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Завантаження заявок...
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', maxWidth: '100%' }}>
      <h2 style={{ 
        marginBottom: '20px', 
        color: '#22334a',
        fontSize: '24px',
        textAlign: 'center'
      }}>
        📱 Мобільний режим перегляду
      </h2>

      {/* Кнопка виходу */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '20px' 
      }}>
        <button
          onClick={handleLogout}
          className="mobile-logout-button"
          style={{
            background: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          🚪 Вийти з режиму
        </button>
      </div>

      {/* Список заявок */}
      <div style={{ marginBottom: '20px' }}>
        {tasks.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#666', 
            padding: '40px 20px',
            fontSize: '16px'
          }}>
            Заявки не знайдено
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tasks.map((task) => (
              <div 
                key={task.id} 
                className="mobile-task-card mobile-fade-in"
                style={{
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  padding: '16px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#22334a' }}>
                    №{task.requestNumber || task.id}
                  </strong>
                </div>
                
                <div 
                  className="mobile-task-grid"
                  style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: '8px',
                    fontSize: '14px',
                    marginBottom: '12px'
                  }}
                >
                  <div>
                    <span style={{ color: '#666' }}>Компанія:</span><br />
                    <span style={{ fontWeight: '500' }}>{task.client || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Регіон:</span><br />
                    <span style={{ fontWeight: '500' }}>{task.serviceRegion || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Обладнання:</span><br />
                    <span style={{ fontWeight: '500' }}>{task.equipment || '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Сума:</span><br />
                    <span style={{ fontWeight: '500', color: '#28a745' }}>
                      {task.serviceTotal ? `${task.serviceTotal} грн` : '—'}
                    </span>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <span style={{ color: '#666' }}>Опис:</span><br />
                  <span style={{ fontSize: '13px' }}>
                    {task.requestDesc || task.work || '—'}
                  </span>
                </div>

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ 
                    color: '#666', 
                    fontSize: '12px' 
                  }}>
                    {task.date ? new Date(task.date).toLocaleDateString() : '—'}
                  </span>
                  
                  <button
                    onClick={() => openTaskInfo(task)}
                    className="mobile-info-button"
                    style={{
                      background: '#007bff',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    ℹ️ Інформація
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Модальне вікно з інформацією про заявку */}
      {showTaskModal && selectedTask && (
        <div 
          className="mobile-modal mobile-scale-in"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
        >
          <div 
            className="mobile-modal-content"
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: 0, color: '#22334a' }}>
                Заявка №{selectedTask.requestNumber || selectedTask.id}
              </h3>
              <button
                onClick={() => setShowTaskModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            {/* Інформація про заявку */}
            <div style={{ marginBottom: '24px' }}>
              {Object.entries(selectedTask).map(([key, value]) => {
                if (!value || value === '' || value === null || value === undefined) return null;
                
                const fieldLabels = {
                  requestNumber: 'Номер заявки/наряду',
                  client: 'Компанія виконавець',
                  serviceRegion: 'Регіон сервісного відділу',
                  requestDesc: 'Опис заявки',
                  address: 'Адреса',
                  equipment: 'Тип обладнання',
                  serviceTotal: 'Загальна сума послуги',
                  date: 'Дата проведення робіт',
                  work: 'Найменування робіт',
                  equipmentSerial: 'Серійний номер обладнання',
                  engineer1: 'Інженер 1',
                  engineer2: 'Інженер 2',
                  paymentType: 'Тип оплати',
                  status: 'Статус'
                };

                const label = fieldLabels[key];
                if (!label) return null;

                return (
                  <div key={key} style={{ marginBottom: '12px' }}>
                    <div style={{ 
                      color: '#666', 
                      fontSize: '14px',
                      marginBottom: '4px'
                    }}>
                      {label}:
                    </div>
                    <div style={{ 
                      fontWeight: '500',
                      fontSize: '16px',
                      color: '#22334a'
                    }}>
                      {key === 'date' ? new Date(value).toLocaleDateString() : 
                       key === 'serviceTotal' ? `${value} грн` : 
                       value}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Секція файлів заявки */}
            <div style={{ 
              borderTop: '1px solid #eee', 
              paddingTop: '20px',
              marginTop: '20px'
            }}>
              <h4 style={{ 
                margin: '0 0 16px 0', 
                color: '#22334a',
                fontSize: '18px'
              }}>
                📁 Файли заявки
              </h4>

              {/* Відображення існуючих файлів */}
              <div style={{ marginBottom: '24px' }}>
                {loadingFiles[selectedTask.id] ? (
                  <div style={{ 
                    textAlign: 'center', 
                    color: '#666', 
                    padding: '20px',
                    fontSize: '14px'
                  }}>
                    Завантаження файлів...
                  </div>
                ) : taskFiles[selectedTask.id] && taskFiles[selectedTask.id].length > 0 ? (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {taskFiles[selectedTask.id].map((file) => (
                      <div 
                        key={file.id}
                        style={{
                          background: '#f8f9fa',
                          border: '1px solid #dee2e6',
                          borderRadius: '6px',
                          padding: '12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontWeight: '500', 
                            fontSize: '14px',
                            color: '#22334a',
                            marginBottom: '4px'
                          }}>
                            {file.originalName}
                          </div>
                          {file.description && (
                            <div style={{ 
                              fontSize: '12px', 
                              color: '#666',
                              marginBottom: '4px'
                            }}>
                              {file.description}
                            </div>
                          )}
                          <div style={{ 
                            fontSize: '12px', 
                            color: '#999'
                          }}>
                            {new Date(file.uploadDate).toLocaleString()} • {(file.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          gap: '8px'
                        }}>
                          <button
                            onClick={() => viewFile(file)}
                            style={{
                              background: '#007bff',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            👁️ Переглянути
                          </button>
                          <button
                            onClick={() => deleteFile(file.id, selectedTask.id)}
                            style={{
                              background: '#dc3545',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            🗑️ Видалити
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    color: '#666', 
                    padding: '20px',
                    fontSize: '14px',
                    background: '#f8f9fa',
                    border: '1px dashed #dee2e6',
                    borderRadius: '6px'
                  }}>
                    Файлів поки немає
                  </div>
                )}
              </div>

              <h4 style={{ 
                margin: '0 0 16px 0', 
                color: '#22334a',
                fontSize: '18px'
              }}>
                📤 Завантажити нові файли
              </h4>

              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '12px'
              }}>
                {/* Завантаження з пристрою */}
                <div>
                  <label 
                    className="mobile-upload-area"
                    style={{
                      display: 'block',
                      background: '#f8f9fa',
                      border: '2px dashed #dee2e6',
                      borderRadius: '8px',
                      padding: '16px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => handleFileSelect(e.target.files)}
                      style={{ display: 'none' }}
                      disabled={uploadingFiles}
                    />
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>
                      📂
                    </div>
                    <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                      Завантажити з пристрою
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Оберіть файли з галереї
                    </div>
                  </label>
                </div>

                {/* Завантаження обраних файлів */}
                {selectedFiles && selectedFiles.length > 0 && (
                  <div style={{
                    background: '#f8f9fa',
                    border: '1px dashed #dee2e6',
                    borderRadius: '8px',
                    padding: '16px',
                    marginTop: '12px',
                    marginBottom: '12px'
                  }}>
                    <h5 style={{ margin: '0 0 8px 0', color: '#22334a' }}>Обрано для завантаження:</h5>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {Array.from(selectedFiles).map((file, index) => (
                        <li key={index} style={{ marginBottom: '4px', fontSize: '14px', color: '#333' }}>
                          {file.name}
                        </li>
                      ))}
                    </ul>
                    
                    {/* Поле для опису файлів */}
                    <div style={{ marginTop: '12px' }}>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '14px', 
                        color: '#666', 
                        marginBottom: '4px' 
                      }}>
                        Опис файлів (необов'язково):
                      </label>
                      <input
                        type="text"
                        value={fileDescription}
                        onChange={(e) => setFileDescription(e.target.value)}
                        placeholder="Наприклад: Документи, фото обладнання..."
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '14px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    
                    {/* Кнопки для завантаження або скасування */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '8px', 
                      marginTop: '12px' 
                    }}>
                      <button
                        onClick={handleUploadSelectedFiles}
                        disabled={uploadingFiles}
                        style={{
                          background: '#28a745',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '8px 16px',
                          fontSize: '14px',
                          cursor: uploadingFiles ? 'not-allowed' : 'pointer',
                          opacity: uploadingFiles ? 0.6 : 1
                        }}
                      >
                        📤 Завантажити
                      </button>
                      <button
                        onClick={() => {
                          setSelectedFiles(null);
                          setFileDescription('');
                        }}
                        style={{
                          background: '#6c757d',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '8px 16px',
                          fontSize: '14px',
                          cursor: 'pointer'
                        }}
                      >
                        ❌ Скасувати
                      </button>
                    </div>
                  </div>
                )}

                {/* Завантаження з камери */}
                <div>
                  <button
                    onClick={() => handleCameraCapture(selectedTask.id)}
                    disabled={uploadingFiles}
                    className="mobile-camera-button"
                    style={{
                      width: '100%',
                      background: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '16px',
                      fontSize: '16px',
                      fontWeight: '500',
                      cursor: uploadingFiles ? 'not-allowed' : 'pointer',
                      opacity: uploadingFiles ? 0.6 : 1
                    }}
                  >
                    📷 Відкрити камеру
                  </button>
                </div>

                {uploadingFiles && (
                  <div style={{
                    textAlign: 'center',
                    color: '#666',
                    fontSize: '14px',
                    padding: '12px'
                  }}>
                    ⏳ Завантаження файлів...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 