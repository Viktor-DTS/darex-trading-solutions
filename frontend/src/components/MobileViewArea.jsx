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
  const [filePhotoType, setFilePhotoType] = useState('document'); // Тип фото для завантаження з пристрою
  const [activeTab, setActiveTab] = useState('pending'); // Активна вкладка: pending, confirmed, completed

  // Функція для перевірки, чи поле заповнене
  const isFieldFilled = (value) => {
    return value !== null && value !== undefined && value !== '' && 
           (typeof value !== 'string' || value.trim() !== '') &&
           (Array.isArray(value) ? value.length > 0 : true);
  };

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
        console.log('Завантаження заявок...');
        const tasksData = await tasksAPI.getAll();
        console.log('Отримані заявки:', tasksData);
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
    setFilePhotoType('document'); // Скидаємо тип фото при виборі з галереї
  };

  // Функція для завантаження обраних файлів
  const handleUploadSelectedFiles = async () => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    
    // Додаємо тип фото до опису
    const photoTypeLabels = {
      'document': '📄 Фото документ',
      'details': '🔧 Фото деталей',
      'equipment': '⚙️ Фото обладнання'
    };
    
    const fullDescription = fileDescription ? 
      `${photoTypeLabels[filePhotoType]} - ${fileDescription}` : 
      photoTypeLabels[filePhotoType];
    
    await handleFileUpload(selectedFiles, selectedTask.id, fullDescription);
    setSelectedFiles(null);
    setFileDescription('');
    setFilePhotoType('document');
  };

  // Функція для фільтрації заявок по статусу та регіону
  const getFilteredTasks = () => {
    let filteredTasks;
    
    // Спочатку фільтруємо по статусу
    switch (activeTab) {
      case 'pending':
        // Невиконані заявки: "Заявка" (нові заявки)
        filteredTasks = tasks.filter(task => task.status === 'Заявка');
        break;
      case 'confirmed':
        // Заявки на підтвердженні: "В роботі" (заявки в процесі)
        filteredTasks = tasks.filter(task => task.status === 'В роботі');
        break;
      case 'completed':
        // Виконані заявки: "Виконано"
        filteredTasks = tasks.filter(task => task.status === 'Виконано');
        break;
      case 'all':
        filteredTasks = tasks;
        break;
      default:
        filteredTasks = tasks;
    }
    
    // Тепер фільтруємо по регіону користувача
    if (user && user.region) {
      // Якщо користувач з регіону "Україна", показуємо всі заявки
      if (user.region === 'Україна') {
        return filteredTasks;
      } else {
        // Інакше показуємо тільки заявки з регіону користувача
        filteredTasks = filteredTasks.filter(task => {
          // Перевіряємо поле serviceRegion або region в заявці
          const taskRegion = task.serviceRegion || task.region;
          return taskRegion === user.region;
        });
      }
    }
    
    return filteredTasks;
  };

  // Функція для скидання дозволу на камеру
  const resetCameraPermission = () => {
    localStorage.removeItem('cameraPermission');
    alert('Дозвіл на камеру скинуто. При наступному використанні камери дозвіл буде запитуватися знову.');
  };

  // Функція для групування файлів по типу та часу
  const groupFilesByTypeAndTime = (files) => {
    const groups = {};
    
    files.forEach(file => {
      // Визначаємо тип файлу з опису
      let fileType = 'Інші файли';
      if (file.description) {
        if (file.description.includes('📄 Фото документ')) {
          fileType = '📄 Фото документ';
        } else if (file.description.includes('🔧 Фото деталей')) {
          fileType = '🔧 Фото деталей';
        } else if (file.description.includes('⚙️ Фото обладнання')) {
          fileType = '⚙️ Фото обладнання';
        }
      }
      
      // Групуємо по типу
      if (!groups[fileType]) {
        groups[fileType] = [];
      }
      groups[fileType].push(file);
    });
    
    // Сортуємо файли в кожній групі по часу завантаження (новіші спочатку)
    Object.keys(groups).forEach(type => {
      groups[type].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    });
    
    return groups;
  };

  // Функція для показу превью фото
  const showPhotoPreview = (canvas, taskId, description, photoType, currentStream, cameraModal) => {
    // Створюємо модальне вікно для превью
    const previewModal = document.createElement('div');
    previewModal.style.cssText = `
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
      z-index: 3000;
      padding: 20px;
    `;

    // Створюємо зображення для превью
    const previewImage = document.createElement('img');
    previewImage.style.cssText = `
      max-width: 100%;
      max-height: 60vh;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    previewImage.src = canvas.toDataURL('image/jpeg', 0.8);

    // Створюємо інформацію про фото
    const photoInfo = document.createElement('div');
    photoInfo.style.cssText = `
      color: #fff;
      font-size: 16px;
      margin: 20px 0;
      text-align: center;
      max-width: 400px;
    `;
    
    const photoTypeLabels = {
      'document': '📄 Фото документ',
      'details': '🔧 Фото деталей',
      'equipment': '⚙️ Фото обладнання'
    };
    
    photoInfo.innerHTML = `
      <div style="margin-bottom: 10px;">
        <strong>Тип:</strong> ${photoTypeLabels[photoType] || '📄 Фото документ'}
      </div>
      ${description ? `<div style="margin-bottom: 10px;"><strong>Опис:</strong> ${description}</div>` : ''}
      <div style="font-size: 14px; opacity: 0.8;">
        Розмір: ${canvas.width} × ${canvas.height} пікселів
      </div>
    `;

    // Створюємо кнопки
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 12px;
      margin-top: 20px;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      max-width: 100%;
    `;

    const confirmButton = document.createElement('button');
    confirmButton.textContent = '✅ Зберегти фото';
    confirmButton.style.cssText = `
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

    const retakeButton = document.createElement('button');
    retakeButton.textContent = '🔄 Перефотографувати';
    retakeButton.style.cssText = `
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

    // Обробники подій
    confirmButton.onclick = async () => {
      try {
        // Конвертуємо в blob і зберігаємо
        canvas.toBlob(async (blob) => {
          const fileName = `${photoType}_${Date.now()}.jpg`;
          const file = new File([blob], fileName, { type: 'image/jpeg' });
          
          // Додаємо тип фото до опису
          const fullDescription = description ? 
            `${photoTypeLabels[photoType]} - ${description}` : 
            photoTypeLabels[photoType];
          
          await handleFileUpload([file], taskId, fullDescription);
          
          // Закриваємо превью і повертаємось до камери
          document.body.removeChild(previewModal);
          
          // НЕ зупиняємо поточний потік і НЕ створюємо новий
          // Просто повертаємось до існуючого відео
          const video = cameraModal.querySelector('video');
          if (video && currentStream) {
            // Перевіряємо, чи потік ще активний
            if (currentStream.active) {
              video.srcObject = currentStream;
            } else {
              // Якщо потік неактивний, створюємо новий з тією ж камерою
              try {
                const newStream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: false
                });
                video.srcObject = newStream;
              } catch (error) {
                console.error('Помилка відновлення потоку камери:', error);
              }
            }
          }
          
          // Встановлюємо значення полів
          const descriptionInput = cameraModal.querySelector('#photo-description');
          const photoTypeSelect = cameraModal.querySelector('#photo-type');
          if (descriptionInput) descriptionInput.value = description;
          if (photoTypeSelect) photoTypeSelect.value = photoType;
          
        }, 'image/jpeg');
      } catch (error) {
        console.error('Помилка збереження фото:', error);
        alert('Помилка збереження фото');
      }
    };

    retakeButton.onclick = () => {
      document.body.removeChild(previewModal);
    };

    cancelButton.onclick = () => {
      document.body.removeChild(previewModal);
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
      document.body.removeChild(cameraModal);
    };

    // Додаємо елементи
    buttonContainer.appendChild(confirmButton);
    buttonContainer.appendChild(retakeButton);
    buttonContainer.appendChild(cancelButton);
    
    previewModal.appendChild(previewImage);
    previewModal.appendChild(photoInfo);
    previewModal.appendChild(buttonContainer);
    
    document.body.appendChild(previewModal);
  };

  // Функція для завантаження з камери
  const handleCameraCapture = async (taskId) => {
    console.log('=== ПОЧАТОК handleCameraCapture ===');
    
    // Перевіряємо підтримку API камери
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('Браузер не підтримує getUserMedia');
      alert('Ваш браузер не підтримує доступ до камери. Спробуйте використати сучасний браузер (Chrome, Firefox, Safari).');
      return;
    }

    // Перевіряємо, чи працює через HTTPS (необхідно для камери)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      console.error('Не HTTPS з\'єднання');
      alert('Доступ до камери працює тільки через HTTPS або на localhost. Перейдіть на безпечне з\'єднання.');
      return;
    }

    // Додаткова перевірка для мобільних пристроїв
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('Виявлено мобільний пристрій:', isMobile);
    console.log('User Agent:', navigator.userAgent);
    
    if (isMobile) {
      console.log('Виявлено мобільний пристрій, використовуються спеціальні налаштування камери');
    }

    try {
      console.log('Спроба отримання списку пристроїв...');
      
      // Перевіряємо, чи вже є збережений дозвіл
      const hasCameraPermission = localStorage.getItem('cameraPermission');
      console.log('Збережений дозвіл на камеру:', hasCameraPermission);
      
      if (hasCameraPermission === 'denied') {
        // Якщо дозвіл був відхилений, показуємо повідомлення
        console.log('Дозвіл на камеру відхилений');
        alert('Доступ до камери був відхилений. Натисніть "Скинути дозвіл камери" та спробуйте знову.');
        return;
      }
      
      // Спочатку отримуємо список доступних камер
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log('Всі пристрої:', devices);
      
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log('Відео пристрої:', videoDevices);
      
      // Логуємо всі знайдені камери для діагностики
      console.log('Всі знайдені камери:', videoDevices.map((device, index) => 
        `${index + 1}. ${device.label || 'Без назви'} (${device.deviceId.substring(0, 8)}...)`
      ));
      
      if (videoDevices.length === 0) {
        console.error('Не знайдено жодної камери');
        alert('Не знайдено жодної камери на пристрої.');
        return;
      }
      
      // Для мобільних пристроїв спрощуємо логіку - беремо першу камеру
      let selectedCamera = null;
      
      if (isMobile) {
        // На мобільних пристроях беремо першу камеру (зазвичай це задня)
        selectedCamera = videoDevices[0];
        console.log('На мобільному пристрої використовуємо першу камеру:', selectedCamera.label);
      } else {
        // На десктопі шукаємо задню камеру
        selectedCamera = videoDevices.find(device => {
          const label = device.label.toLowerCase();
          return label.includes('back') || 
                 label.includes('rear') || 
                 label.includes('задня') ||
                 label.includes('основна') ||
                 label.includes('main') ||
                 label.includes('primary');
        });
        
        if (!selectedCamera) {
          selectedCamera = videoDevices[0];
          console.log('Використовуємо першу доступну камеру:', selectedCamera.label);
        }
      }
      
      console.log('Обрана камера:', selectedCamera.label);
      
      // Створюємо потік з обраною камерою
      console.log('Спроба створення потоку з камерою...');
      let initialStream;
      
      try {
        // Спочатку пробуємо з точним deviceId
        initialStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: selectedCamera.deviceId }
          },
          audio: false
        });
        console.log('Успішно створено потік з точним deviceId');
      } catch (error) {
        console.log('Помилка з точним deviceId:', error.name);
        
        try {
          // Пробуємо без точного deviceId
          initialStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: selectedCamera.deviceId
            },
            audio: false
          });
          console.log('Успішно створено потік без точного deviceId');
        } catch (error2) {
          console.log('Помилка без точного deviceId:', error2.name);
          
          try {
            // Пробуємо з базовими налаштуваннями
            initialStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false
            });
            console.log('Успішно створено потік з базовими налаштуваннями');
          } catch (error3) {
            console.error('Всі спроби створення потоку невдалі:', error3);
            throw error3;
          }
        }
      }
      
      // Зберігаємо дозвіл, якщо успішно створили потік
      if (initialStream) {
        localStorage.setItem('cameraPermission', 'granted');
        console.log('Дозвіл на камеру збережено');
      }
      
      let currentStream = initialStream;
      let currentDeviceIndex = 0;

      // Функція для створення потоку з конкретної камери
      const createStream = async (deviceIndex = 0) => {
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
        }
        
        try {
          currentStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: false 
          });
          return currentStream;
        } catch (error) {
          console.error('Помилка створення потоку для камери:', error);
          // Якщо не вдалося створити потік з конкретною камерою, використовуємо загальний
          currentStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: false 
          });
          return currentStream;
        }
      };

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
        padding: 16px;
      `;

      // Створюємо відео елемент
      const video = document.createElement('video');
      video.style.cssText = `
        max-width: 100%;
        max-height: 50vh;
        border-radius: 8px;
        background: #000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      `;
      video.srcObject = currentStream;
      video.autoplay = true;
      video.playsInline = true;

      // Додаємо обробник помилок для відео
      video.onerror = (error) => {
        console.error('Помилка відео:', error);
        alert('Помилка відображення відео з камери');
      };

      // Створюємо кнопки
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex;
        gap: 12px;
        margin-top: 12px;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        max-width: 100%;
      `;

      const captureButton = document.createElement('button');
      captureButton.textContent = '📷 Зробити фото';
      captureButton.style.cssText = `
        background: #28a745;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        min-width: 120px;
        flex: 1;
        max-width: 150px;
      `;

      const cancelButton = document.createElement('button');
      cancelButton.textContent = '❌ Скасувати';
      cancelButton.style.cssText = `
        background: #dc3545;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        min-width: 120px;
        flex: 1;
        max-width: 150px;
      `;

      // Кнопка для вибору фото з галереї
      const galleryButton = document.createElement('button');
      galleryButton.textContent = '📂 З галереї';
      galleryButton.style.cssText = `
        background: #6f42c1;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        min-width: 120px;
        flex: 1;
        max-width: 150px;
      `;

      galleryButton.onclick = () => {
        // Створюємо прихований input для вибору файлу
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        
        fileInput.onchange = async (e) => {
          if (e.target.files && e.target.files.length > 0) {
            const descriptionInput = document.getElementById('photo-description');
            const photoTypeSelect = document.getElementById('photo-type');
            const description = descriptionInput ? descriptionInput.value : '';
            const photoType = photoTypeSelect ? photoTypeSelect.value : 'document';
            
            if (currentStream) {
              currentStream.getTracks().forEach(track => track.stop());
            }
            document.body.removeChild(cameraModal);
            
            // Додаємо тип фото до опису
            const photoTypeLabels = {
              'document': '📄 Фото документ',
              'details': '🔧 Фото деталей',
              'equipment': '⚙️ Фото обладнання'
            };
            
            const fullDescription = description ? 
              `${photoTypeLabels[photoType]} - ${description}` : 
              photoTypeLabels[photoType];
            
            await handleFileUpload(e.target.files, taskId, fullDescription);
          }
        };
        
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
      };

      // Додаємо обробники подій
      captureButton.onclick = () => {
        try {
          // Отримуємо опис та тип з полів вводу
          const descriptionInput = document.getElementById('photo-description');
          const photoTypeSelect = document.getElementById('photo-type');
          const description = descriptionInput ? descriptionInput.value : '';
          const photoType = photoTypeSelect ? photoTypeSelect.value : 'document';
          
          // Створюємо canvas для захоплення кадру
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0);
          
          // Показуємо превью фото
          showPhotoPreview(canvas, taskId, description, photoType, currentStream, cameraModal);
        } catch (error) {
          console.error('Помилка захоплення фото:', error);
          alert('Помилка захоплення фото');
        }
      };

      cancelButton.onclick = () => {
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
        }
        document.body.removeChild(cameraModal);
      };

      // Додаємо елементи до модального вікна
      buttonContainer.appendChild(captureButton);
      buttonContainer.appendChild(cancelButton); // Переміщуємо кнопку "Скасувати" в один ряд з "Зробити фото"
      buttonContainer.appendChild(galleryButton); // Додаємо кнопку для галереї
      cameraModal.appendChild(video);
      cameraModal.appendChild(buttonContainer);

      // Додаємо модальне вікно до сторінки
      document.body.appendChild(cameraModal);

      // Додаємо інструкції
      const instructions = document.createElement('div');
      instructions.textContent = 'Наведіть камеру, сфокусуйтеся та натисніть "Зробити фото"';
      instructions.style.cssText = `
        color: #fff;
        font-size: 14px;
        margin-bottom: 12px;
        text-align: center;
        max-width: 300px;
        line-height: 1.3;
      `;
      cameraModal.insertBefore(instructions, video);

      // Додаємо поле для опису фото
      const descriptionContainer = document.createElement('div');
      descriptionContainer.style.cssText = `
        margin: 12px 0;
        width: 100%;
        max-width: 400px;
      `;

      const descriptionLabel = document.createElement('label');
      descriptionLabel.textContent = 'Опис фото (необов\'язково):';
      descriptionLabel.style.cssText = `
        display: block;
        color: #fff;
        font-size: 14px;
        margin-bottom: 4px;
        text-align: center;
      `;

      const descriptionInput = document.createElement('input');
      descriptionInput.id = 'photo-description';
      descriptionInput.type = 'text';
      descriptionInput.placeholder = 'Наприклад: Фото обладнання, документи...';
      descriptionInput.style.cssText = `
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        background: #fff;
        color: #333;
        box-sizing: border-box;
      `;

      // Додаємо поле для типу фото
      const photoTypeContainer = document.createElement('div');
      photoTypeContainer.style.cssText = `
        margin: 12px 0;
        width: 100%;
        max-width: 400px;
      `;

      const photoTypeLabel = document.createElement('label');
      photoTypeLabel.textContent = 'Тип фото:';
      photoTypeLabel.style.cssText = `
        display: block;
        color: #fff;
        font-size: 14px;
        margin-bottom: 4px;
        text-align: center;
      `;

      const photoTypeSelect = document.createElement('select');
      photoTypeSelect.id = 'photo-type';
      photoTypeSelect.style.cssText = `
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
        background: #fff;
        color: #333;
        box-sizing: border-box;
      `;

      // Додаємо опції для типу фото
      const photoTypes = [
        { value: 'document', label: '📄 Фото документ' },
        { value: 'details', label: '🔧 Фото деталей' },
        { value: 'equipment', label: '⚙️ Фото обладнання' }
      ];

      photoTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type.value;
        option.textContent = type.label;
        if (type.value === 'document') {
          option.selected = true; // За замовчуванням "Фото документ"
        }
        photoTypeSelect.appendChild(option);
      });

      descriptionContainer.appendChild(descriptionLabel);
      descriptionContainer.appendChild(descriptionInput);
      
      photoTypeContainer.appendChild(photoTypeLabel);
      photoTypeContainer.appendChild(photoTypeSelect);
      
      cameraModal.insertBefore(descriptionContainer, buttonContainer);
      cameraModal.insertBefore(photoTypeContainer, buttonContainer);

      // Додаємо індикатор камери (прибираємо, оскільки використовуємо тільки одну камеру)
      // let cameraIndicator = null;
      // if (filteredVideoDevices.length > 1) {
      //   cameraIndicator = document.createElement('div');
      //   const currentDevice = filteredVideoDevices[currentDeviceIndex];
      //   const deviceName = currentDevice.label || `Камера ${currentDeviceIndex + 1}`;
      //   cameraIndicator.textContent = `${deviceName} (${currentDeviceIndex + 1} з ${filteredVideoDevices.length})`;
      //   cameraIndicator.style.cssText = `
      //     color: #fff;
      //     font-size: 12px;
      //     margin-top: 8px;
      //     text-align: center;
      //     opacity: 0.8;
      //   `;
      //   cameraModal.appendChild(cameraIndicator);
      // }

    } catch (error) {
      console.error('=== ПОМИЛКА handleCameraCapture ===');
      console.error('Помилка доступу до камери:', error);
      console.error('Назва помилки:', error.name);
      console.error('Повідомлення помилки:', error.message);
      
      // Більш детальні повідомлення про помилки для мобільних пристроїв
      let errorMessage = 'Помилка доступу до камери';
      
      if (error.name === 'NotAllowedError') {
        // Якщо дозвіл відхилено, зберігаємо це
        localStorage.setItem('cameraPermission', 'denied');
        errorMessage = 'Доступ до камери відхилено. Дозвольте доступ до камери в налаштуваннях браузера.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'Камера не знайдена. Перевірте, чи підключена камера до пристрою.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Камера зайнята іншим додатком. Закрийте інші додатки, що використовують камеру.';
      } else if (error.name === 'OverconstrainedError') {
        // Покращена обробка для мобільних пристроїв
        errorMessage = 'Камера не підтримує необхідні налаштування. Спробуйте використати "З галереї" або оновіть браузер.';
      } else if (error.name === 'TypeError') {
        errorMessage = 'Браузер не підтримує доступ до камери. Спробуйте використати інший браузер.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Ваш пристрій не підтримує доступ до камери. Спробуйте використати "З галереї".';
      } else if (error.name === 'AbortError') {
        errorMessage = 'Операція з камерою була перервана. Спробуйте ще раз.';
      } else if (error.name === 'SecurityError') {
        errorMessage = 'Помилка безпеки. Переконайтеся, що використовуєте HTTPS з\'єднання.';
      } else {
        errorMessage = `Помилка доступу до камери: ${error.message}`;
      }
      
      // Додаємо пораду для мобільних пристроїв
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        errorMessage += '\n\n💡 Поради для мобільних пристроїв:';
        errorMessage += '\n• Переконайтеся, що використовуєте Chrome або Safari';
        errorMessage += '\n• Дозвольте доступ до камери в налаштуваннях браузера';
        errorMessage += '\n• Спробуйте використати "З галереї" для завантаження фото';
        errorMessage += '\n• Перевірте, чи не зайнята камера іншим додатком';
      }
      
      console.error('Фінальне повідомлення про помилку:', errorMessage);
      alert(errorMessage);
    }
  };

  if (loading) {
    console.log('Відображення завантаження...');
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

  console.log('Відображення основного контенту. Стан:', { tasks: tasks.length, loading, activeTab });

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

      {/* Індикатор регіону */}
      {user && user.region && (
        <div style={{
          textAlign: 'center',
          marginBottom: '16px',
          padding: '8px 16px',
          background: user.region === 'Україна' ? '#e3f2fd' : '#fff3e0',
          border: `2px solid ${user.region === 'Україна' ? '#2196f3' : '#ff9800'}`,
          borderRadius: '8px',
          display: 'inline-block',
          margin: '0 auto 16px auto'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: user.region === 'Україна' ? '#1976d2' : '#f57c00'
          }}>
            🌍 Регіон: {user.region}
          </div>
          <div style={{
            fontSize: '12px',
            color: user.region === 'Україна' ? '#1976d2' : '#f57c00',
            marginTop: '2px'
          }}>
            {user.region === 'Україна' ? 'Переглядаєте всі заявки' : `Переглядаєте заявки регіону "${user.region}"`}
          </div>
        </div>
      )}

      {/* Кнопка виходу */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: '20px',
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        flexWrap: 'wrap'
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
        <button
          onClick={resetCameraPermission}
          style={{
            background: '#6c757d',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          🔄 Скинути дозвіл камери
        </button>
      </div>

      {/* Вкладки */}
      <div style={{ 
        marginBottom: '20px',
        borderBottom: '1px solid #ddd'
      }}>
        <div style={{
          display: 'flex',
          gap: '0',
          background: '#f8f9fa',
          borderRadius: '8px 8px 0 0',
          overflow: 'hidden'
        }}>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 'none',
              background: activeTab === 'pending' ? '#007bff' : '#f8f9fa',
              color: activeTab === 'pending' ? '#fff' : '#666',
              fontSize: '14px',
              fontWeight: activeTab === 'pending' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            📝 Нові заявки
          </button>
          <button
            onClick={() => setActiveTab('confirmed')}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 'none',
              background: activeTab === 'confirmed' ? '#ffc107' : '#f8f9fa',
              color: activeTab === 'confirmed' ? '#000' : '#666',
              fontSize: '14px',
              fontWeight: activeTab === 'confirmed' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🔄 В роботі
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            style={{
              flex: 1,
              padding: '12px 8px',
              border: 'none',
              background: activeTab === 'completed' ? '#28a745' : '#f8f9fa',
              color: activeTab === 'completed' ? '#fff' : '#666',
              fontSize: '14px',
              fontWeight: activeTab === 'completed' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            ✅ Виконані
          </button>
        </div>
        
        {/* Тимчасова кнопка для діагностики */}
        <div style={{ 
          marginTop: '10px', 
          textAlign: 'center' 
        }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              background: '#6c757d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            🔍 Показати всі заявки ({getFilteredTasks().length})
          </button>
        </div>
      </div>

      {/* Список заявок */}
      <div style={{ marginBottom: '20px' }}>
        {(() => {
          const filteredTasks = getFilteredTasks();
          return filteredTasks.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              color: '#666', 
              padding: '40px 20px',
              fontSize: '16px'
            }}>
              {activeTab === 'pending' && (user && user.region && user.region !== 'Україна' ? 
                `Нових заявок у регіоні "${user.region}" немає` : 'Нових заявок немає')}
              {activeTab === 'confirmed' && (user && user.region && user.region !== 'Україна' ? 
                `Заявок в роботі у регіоні "${user.region}" немає` : 'Заявок в роботі немає')}
              {activeTab === 'completed' && (user && user.region && user.region !== 'Україна' ? 
                `Виконаних заявок у регіоні "${user.region}" немає` : 'Виконаних заявок немає')}
              {activeTab === 'all' && (user && user.region && user.region !== 'Україна' ? 
                `Заявок у регіоні "${user.region}" немає` : 'Заявок немає')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredTasks.map((task) => (
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
                    {task.status && (
                      <span style={{
                        marginLeft: '8px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        background: task.status === 'Виконано' ? '#d4edda' : 
                                   task.status === 'В роботі' ? '#fff3cd' : 
                                   task.status === 'Заявка' ? '#f8d7da' : '#e2e3e5',
                        color: task.status === 'Виконано' ? '#155724' : 
                               task.status === 'В роботі' ? '#856404' : 
                               task.status === 'Заявка' ? '#721c24' : '#6c757d'
                      }}>
                        {task.status === 'Виконано' ? '✅ Виконано' :
                         task.status === 'В роботі' ? '🔄 В роботі' : 
                         task.status === 'Заявка' ? '📝 Нова заявка' :
                         task.status === 'Заблоковано' ? '🚫 Заблоковано' : task.status}
                      </span>
                    )}
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
                    {isFieldFilled(task.client) && (
                      <div>
                        <span style={{ color: '#333' }}>Компанія:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.client}</span>
                      </div>
                    )}
                    {isFieldFilled(task.serviceRegion) && (
                      <div>
                        <span style={{ color: '#333' }}>Регіон:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.serviceRegion}</span>
                      </div>
                    )}
                    {isFieldFilled(task.equipment) && (
                      <div>
                        <span style={{ color: '#333' }}>Обладнання:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.equipment}</span>
                      </div>
                    )}
                    {isFieldFilled(task.serviceTotal) && (
                      <div>
                        <span style={{ color: '#333' }}>Сума:</span><br />
                        <span style={{ fontWeight: '500', color: '#28a745' }}>
                          {task.serviceTotal} грн
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.address) && (
                      <div>
                        <span style={{ color: '#333' }}>Адреса:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.address}</span>
                      </div>
                    )}
                    {isFieldFilled(task.equipmentSerial) && (
                      <div>
                        <span style={{ color: '#333' }}>Серійний номер:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.equipmentSerial}</span>
                      </div>
                    )}
                    {isFieldFilled(task.engineer1) && (
                      <div>
                        <span style={{ color: '#333' }}>Інженер 1:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.engineer1}</span>
                      </div>
                    )}
                    {isFieldFilled(task.engineer2) && (
                      <div>
                        <span style={{ color: '#333' }}>Інженер 2:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.engineer2}</span>
                      </div>
                    )}
                    {isFieldFilled(task.paymentType) && (
                      <div>
                        <span style={{ color: '#333' }}>Тип оплати:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.paymentType}</span>
                      </div>
                    )}
                    {isFieldFilled(task.work) && (
                      <div>
                        <span style={{ color: '#333' }}>Роботи:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.work}</span>
                      </div>
                    )}
                    {isFieldFilled(task.workPrice) && (
                      <div>
                        <span style={{ color: '#333' }}>Вартість робіт:</span><br />
                        <span style={{ fontWeight: '500', color: '#007bff' }}>
                          {task.workPrice} грн
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.transportSum) && (
                      <div>
                        <span style={{ color: '#333' }}>Транспорт:</span><br />
                        <span style={{ fontWeight: '500', color: '#ff6b35' }}>
                          {task.transportSum} грн
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.otherMaterials) && (
                      <div>
                        <span style={{ color: '#333' }}>Матеріали:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.otherMaterials}</span>
                      </div>
                    )}
                    {isFieldFilled(task.otherSum) && (
                      <div>
                        <span style={{ color: '#333' }}>Вартість матеріалів:</span><br />
                        <span style={{ fontWeight: '500', color: '#6f42c1' }}>
                          {task.otherSum} грн
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.oilTotal) && task.oilTotal > 0 && (
                      <div>
                        <span style={{ color: '#333' }}>Масло:</span><br />
                        <span style={{ fontWeight: '500', color: '#fd7e14' }}>
                          {task.oilTotal} грн
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.airFilterSum) && task.airFilterSum > 0 && (
                      <div>
                        <span style={{ color: '#333' }}>Повітряний фільтр:</span><br />
                        <span style={{ fontWeight: '500', color: '#20c997' }}>
                          {task.airFilterSum} грн
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.fuelFilterSum) && task.fuelFilterSum > 0 && (
                      <div>
                        <span style={{ color: '#333' }}>Паливний фільтр:</span><br />
                        <span style={{ fontWeight: '500', color: '#20c997' }}>
                          {task.fuelFilterSum} грн
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.filterSum) && task.filterSum > 0 && (
                      <div>
                        <span style={{ color: '#333' }}>Інші фільтри:</span><br />
                        <span style={{ fontWeight: '500', color: '#20c997' }}>
                          {task.filterSum} грн
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.antifreezeSum) && task.antifreezeSum > 0 && (
                      <div>
                        <span style={{ color: '#333' }}>Антифриз:</span><br />
                        <span style={{ fontWeight: '500', color: '#17a2b8' }}>
                          {task.antifreezeSum} грн
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.requestDate) && (
                      <div>
                        <span style={{ color: '#333' }}>Дата заявки:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>
                          {new Date(task.requestDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {isFieldFilled(task.company) && (
                      <div>
                        <span style={{ color: '#333' }}>Компанія:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.company}</span>
                      </div>
                    )}
                    {isFieldFilled(task.reportMonthYear) && (
                      <div>
                        <span style={{ color: '#333' }}>Звітний місяць:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.reportMonthYear}</span>
                      </div>
                    )}
                    {isFieldFilled(task.invoice) && (
                      <div>
                        <span style={{ color: '#333' }}>Номер рахунку:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.invoice}</span>
                      </div>
                    )}
                    {isFieldFilled(task.bonusApprovalDate) && (
                      <div>
                        <span style={{ color: '#333' }}>Дата затвердження премії:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.bonusApprovalDate}</span>
                      </div>
                    )}
                    {isFieldFilled(task.approvedByWarehouse) && (
                      <div>
                        <span style={{ color: '#333' }}>Підтверджено складом:</span><br />
                        <span style={{ fontWeight: '500', color: '#28a745' }}>{task.approvedByWarehouse}</span>
                      </div>
                    )}
                    {isFieldFilled(task.warehouseComment) && (
                      <div>
                        <span style={{ color: '#333' }}>Коментар складу:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.warehouseComment}</span>
                      </div>
                    )}
                    {isFieldFilled(task.approvedByAccountant) && (
                      <div>
                        <span style={{ color: '#333' }}>Підтверджено бухгалтером:</span><br />
                        <span style={{ fontWeight: '500', color: '#28a745' }}>{task.approvedByAccountant}</span>
                      </div>
                    )}
                    {isFieldFilled(task.accountantComment) && (
                      <div>
                        <span style={{ color: '#333' }}>Коментар бухгалтера:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.accountantComment}</span>
                      </div>
                    )}
                    {isFieldFilled(task.approvedByRegional) && (
                      <div>
                        <span style={{ color: '#333' }}>Підтверджено регіональним:</span><br />
                        <span style={{ fontWeight: '500', color: '#28a745' }}>{task.approvedByRegional}</span>
                      </div>
                    )}
                    {isFieldFilled(task.regionalComment) && (
                      <div>
                        <span style={{ color: '#333' }}>Коментар регіонального:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.regionalComment}</span>
                      </div>
                    )}
                    {isFieldFilled(task.approvedByRegionalManager) && (
                      <div>
                        <span style={{ color: '#333' }}>Підтверджено рег. менеджером:</span><br />
                        <span style={{ fontWeight: '500', color: '#28a745' }}>{task.approvedByRegionalManager}</span>
                      </div>
                    )}
                    {isFieldFilled(task.regionalManagerComment) && (
                      <div>
                        <span style={{ color: '#333' }}>Коментар рег. менеджера:</span><br />
                        <span style={{ fontWeight: '500', color: '#000' }}>{task.regionalManagerComment}</span>
                      </div>
                    )}
                  </div>

                  {(isFieldFilled(task.requestDesc) || isFieldFilled(task.work)) && (
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ color: '#333' }}>Опис:</span><br />
                      <span style={{ fontSize: '13px', color: '#000' }}>
                        {task.requestDesc || task.work}
                      </span>
                    </div>
                  )}

                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ 
                      color: '#333', 
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
          );
        })()}
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
                // Використовуємо ту саму функцію перевірки
                if (!isFieldFilled(value)) return null;
                
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
                  status: 'Статус',
                  workPrice: 'Вартість робіт',
                  transportSum: 'Транспортні витрати',
                  otherMaterials: 'Матеріали',
                  otherSum: 'Вартість матеріалів',
                  oilTotal: 'Масло',
                  airFilterSum: 'Повітряний фільтр',
                  fuelFilterSum: 'Паливний фільтр',
                  filterSum: 'Інші фільтри',
                  antifreezeSum: 'Антифриз',
                  invoice: 'Номер рахунку',
                  requestDate: 'Дата заявки',
                  company: 'Компанія',
                  reportMonthYear: 'Звітний місяць',
                  bonusApprovalDate: 'Дата затвердження премії',
                  approvedByWarehouse: 'Підтверджено складом',
                  warehouseComment: 'Коментар складу',
                  approvedByAccountant: 'Підтверджено бухгалтером',
                  accountantComment: 'Коментар бухгалтера',
                  approvedByRegional: 'Підтверджено регіональним',
                  regionalComment: 'Коментар регіонального',
                  approvedByRegionalManager: 'Підтверджено рег. менеджером',
                  regionalManagerComment: 'Коментар рег. менеджера'
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
                       key === 'requestDate' ? new Date(value).toLocaleDateString() :
                       key === 'serviceTotal' ? `${value} грн` : 
                       key === 'workPrice' ? `${value} грн` :
                       key === 'transportSum' ? `${value} грн` :
                       key === 'otherSum' ? `${value} грн` :
                       key === 'oilTotal' ? `${value} грн` :
                       key === 'airFilterSum' ? `${value} грн` :
                       key === 'fuelFilterSum' ? `${value} грн` :
                       key === 'filterSum' ? `${value} грн` :
                       key === 'antifreezeSum' ? `${value} грн` :
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
                    gap: '16px'
                  }}>
                    {(() => {
                      const groupedFiles = groupFilesByTypeAndTime(taskFiles[selectedTask.id]);
                      return Object.entries(groupedFiles).map(([fileType, files]) => (
                        <div key={fileType} style={{
                          border: '1px solid #dee2e6',
                          borderRadius: '8px',
                          overflow: 'hidden'
                        }}>
                          {/* Заголовок групи */}
                          <div style={{
                            background: '#f8f9fa',
                            padding: '8px 12px',
                            borderBottom: '1px solid #dee2e6',
                            fontWeight: '600',
                            color: '#22334a',
                            fontSize: '14px'
                          }}>
                            {fileType} ({files.length})
                          </div>
                          
                          {/* Файли в групі */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0'
                          }}>
                            {files.map((file, index) => (
                              <div 
                                key={file.id}
                                style={{
                                  background: index % 2 === 0 ? '#fff' : '#f8f9fa',
                                  padding: '8px 12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px',
                                  borderBottom: index < files.length - 1 ? '1px solid #eee' : 'none'
                                }}
                              >
                                <div style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  gap: '8px'
                                }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ 
                                      fontWeight: '500', 
                                      fontSize: '13px',
                                      color: '#22334a',
                                      marginBottom: '2px',
                                      wordBreak: 'break-word'
                                    }}>
                                      {file.originalName}
                                    </div>
                                    {file.description && (
                                      <div style={{ 
                                        fontSize: '11px', 
                                        color: '#666',
                                        marginBottom: '2px',
                                        wordBreak: 'break-word'
                                      }}>
                                        {file.description}
                                      </div>
                                    )}
                                    <div style={{ 
                                      fontSize: '11px', 
                                      color: '#999'
                                    }}>
                                      {new Date(file.uploadDate).toLocaleString()} • {(file.size / 1024).toFixed(1)} KB
                                    </div>
                                  </div>
                                  <div style={{ 
                                    display: 'flex', 
                                    gap: '4px',
                                    flexWrap: 'wrap',
                                    flexShrink: 0
                                  }}>
                                    <button
                                      onClick={() => viewFile(file)}
                                      style={{
                                        background: '#007bff',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
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
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      🗑️ Видалити
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
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
                    
                    {/* Поле для типу фото */}
                    <div style={{ marginTop: '12px' }}>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '14px', 
                        color: '#666', 
                        marginBottom: '4px' 
                      }}>
                        Тип фото:
                      </label>
                      <select
                        value={filePhotoType}
                        onChange={(e) => setFilePhotoType(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '14px',
                          boxSizing: 'border-box',
                          background: '#fff'
                        }}
                      >
                        <option value="document">📄 Фото документ</option>
                        <option value="details">🔧 Фото деталей</option>
                        <option value="equipment">⚙️ Фото обладнання</option>
                      </select>
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
                          setFilePhotoType('document'); // Скидаємо тип фото після скасування
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