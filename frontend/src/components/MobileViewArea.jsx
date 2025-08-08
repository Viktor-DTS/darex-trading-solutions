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
  const showPhotoPreview = (canvas, taskId, description, photoType, currentStream, cameraModal, videoDevices, currentDeviceIndex) => {
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
          
          // Відновлюємо камеру з тими ж налаштуваннями
          if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
          }
          
          // Створюємо новий потік з тією ж камерою
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: videoDevices[currentDeviceIndex] ? { exact: videoDevices[currentDeviceIndex].deviceId } : undefined
            },
            audio: false
          });
          
          // Оновлюємо відео
          const video = cameraModal.querySelector('video');
          if (video) {
            video.srcObject = newStream;
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
    // Перевіряємо підтримку API камери
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Ваш браузер не підтримує доступ до камери. Спробуйте використати сучасний браузер (Chrome, Firefox, Safari).');
      return;
    }

    // Перевіряємо, чи працює через HTTPS (необхідно для камери)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      alert('Доступ до камери працює тільки через HTTPS або на localhost. Перейдіть на безпечне з\'єднання.');
      return;
    }

    try {
      // Перевіряємо, чи вже є збережений дозвіл
      const hasCameraPermission = localStorage.getItem('cameraPermission');
      let initialStream;
      
      if (hasCameraPermission === 'granted') {
        // Якщо дозвіл вже надано, створюємо потік без запиту
        initialStream = await navigator.mediaDevices.getUserMedia({ 
          video: true,
          audio: false 
        });
      } else if (hasCameraPermission === 'denied') {
        // Якщо дозвіл був відхилений, показуємо повідомлення
        alert('Доступ до камери був відхилений. Натисніть "Скинути дозвіл камери" та спробуйте знову.');
        return;
      } else {
        // Запитуємо дозвіл тільки один раз
        initialStream = await navigator.mediaDevices.getUserMedia({ 
          video: true,
          audio: false 
        });
        // Зберігаємо дозвіл
        localStorage.setItem('cameraPermission', 'granted');
      }
      
      // Після отримання дозволу, отримуємо список доступних камер
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      // Сортуємо камери: спочатку задня, потім фронтальна
      // Задня камера зазвичай має більшу роздільну здатність і кращу якість
      videoDevices.sort((a, b) => {
        // Якщо одна з камер має "back" або "rear" в назві, вона йде першою
        const aIsBack = a.label.toLowerCase().includes('back') || a.label.toLowerCase().includes('rear') || a.label.toLowerCase().includes('задня');
        const bIsBack = b.label.toLowerCase().includes('back') || b.label.toLowerCase().includes('rear') || b.label.toLowerCase().includes('задня');
        
        if (aIsBack && !bIsBack) return -1;
        if (!aIsBack && bIsBack) return 1;
        
        // Якщо обидві або жодна не є задньою, сортуємо за роздільною здатністю
        // (припускаємо, що камера з більшим deviceId зазвичай має кращі характеристики)
        return b.deviceId.localeCompare(a.deviceId);
      });
      
      // Логуємо порядок камер для діагностики
      console.log('Знайдені камери:', videoDevices.map((device, index) => 
        `${index + 1}. ${device.label || 'Без назви'} (${device.deviceId.substring(0, 8)}...)`
      ));
      
      let currentStream = initialStream;
      let currentDeviceIndex = 0;

      // Функція для створення потоку з конкретної камери
      const createStream = async (deviceIndex = 0) => {
        if (currentStream) {
          currentStream.getTracks().forEach(track => track.stop());
        }
        
        let constraints;
        if (videoDevices.length > 0 && deviceIndex < videoDevices.length) {
          constraints = {
            video: {
              deviceId: { exact: videoDevices[deviceIndex].deviceId }
            },
            audio: false
          };
        } else {
          constraints = {
            video: true,
            audio: false
          };
        }
        
        try {
          currentStream = await navigator.mediaDevices.getUserMedia(constraints);
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

      // Створюємо потік з першою камерою (зазвичай задньою)
      if (videoDevices.length > 0) {
        try {
          currentStream = await createStream(0);
        } catch (error) {
          console.error('Помилка створення потоку з першою камерою:', error);
          // Використовуємо початковий потік як fallback
        }
      }

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
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          min-width: 120px;
          flex: 1;
          max-width: 150px;
        `;

        switchCameraButton.onclick = async () => {
          try {
            currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
            const newStream = await createStream(currentDeviceIndex);
            video.srcObject = newStream;
            
            // Оновлюємо індикатор камери
            if (cameraIndicator) {
              const currentDevice = videoDevices[currentDeviceIndex];
              const deviceName = currentDevice.label || `Камера ${currentDeviceIndex + 1}`;
              cameraIndicator.textContent = `${deviceName} (${currentDeviceIndex + 1} з ${videoDevices.length})`;
            }
          } catch (error) {
            console.error('Помилка перемикання камери:', error);
            alert('Помилка перемикання камери');
          }
        };
      }

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
          showPhotoPreview(canvas, taskId, description, photoType, currentStream, cameraModal, videoDevices, currentDeviceIndex);
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
      if (switchCameraButton) {
        buttonContainer.appendChild(switchCameraButton);
      }
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

      // Додаємо індикатор камери
      let cameraIndicator = null;
      if (videoDevices.length > 1) {
        cameraIndicator = document.createElement('div');
        const currentDevice = videoDevices[currentDeviceIndex];
        const deviceName = currentDevice.label || `Камера ${currentDeviceIndex + 1}`;
        cameraIndicator.textContent = `${deviceName} (${currentDeviceIndex + 1} з ${videoDevices.length})`;
        cameraIndicator.style.cssText = `
          color: #fff;
          font-size: 12px;
          margin-top: 8px;
          text-align: center;
          opacity: 0.8;
        `;
        cameraModal.appendChild(cameraIndicator);
      }

    } catch (error) {
      console.error('Помилка доступу до камери:', error);
      
      // Більш детальні повідомлення про помилки
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
        errorMessage = 'Камера не підтримує необхідні налаштування.';
      } else if (error.name === 'TypeError') {
        errorMessage = 'Браузер не підтримує доступ до камери. Спробуйте використати інший браузер.';
      } else {
        errorMessage = `Помилка доступу до камери: ${error.message}`;
      }
      
      alert(errorMessage);
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