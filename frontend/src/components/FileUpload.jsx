import React, { useState, useEffect, useRef } from 'react';
import './FileUpload.css';

const FileUpload = ({ taskId, onFilesUploaded }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Стани для камери
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [capturedImages, setCapturedImages] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraGroupName, setCameraGroupName] = useState('');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [documentDetected, setDocumentDetected] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionCanvasRef = useRef(null);

  const API_URL = process.env.REACT_APP_API_URL || 'https://darex-trading-solutions.onrender.com';

  // Завантаження існуючих файлів
  useEffect(() => {
    if (taskId) {
      loadFiles();
    }
  }, [taskId]);

  // Очищення ресурсів камери при розмонтуванні
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      // Очищаємо URL для знімків
      capturedImages.forEach(image => URL.revokeObjectURL(image.preview));
    };
  }, [cameraStream, capturedImages]);

  // Функції для роботи з камерою
  const startCamera = async () => {
    try {
      setCameraError('');
      setCameraLoading(true);
      setVideoReady(false);
      setShowCamera(true);
      
      // Спочатку пробуємо задню камеру
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });
      } catch (error) {
        console.log('Задня камера недоступна, пробуємо передню:', error);
        // Якщо задня камера недоступна, пробуємо передню
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });
      }
      
      setCameraStream(stream);
      
      // Чекаємо поки відео завантажиться
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Додаємо обробники подій для відео
        videoRef.current.onloadedmetadata = () => {
          console.log('Відео метадані завантажені');
          videoRef.current.play().catch(e => {
            console.error('Помилка відтворення відео:', e);
            setCameraError('Помилка відтворення відео. Спробуйте оновити сторінку.');
            setCameraLoading(false);
          });
        };
        
        videoRef.current.onerror = (e) => {
          console.error('Помилка відео:', e);
          setCameraError('Помилка відео потоку. Перевірте дозволи камери.');
          setCameraLoading(false);
        };
        
        videoRef.current.oncanplay = () => {
          console.log('Відео готове до відтворення');
          setVideoReady(true);
          setCameraLoading(false);
        };
        
        videoRef.current.onplaying = () => {
          console.log('Відео відтворюється');
          setVideoReady(true);
          setCameraLoading(false);
        };
      }
    } catch (error) {
      console.error('Помилка доступу до камери:', error);
      let errorMessage = 'Не вдалося отримати доступ до камери.';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Доступ до камери відхилено. Дозвольте доступ до камери в налаштуваннях браузера.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'Камера не знайдена. Перевірте підключення камери.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Камера зайнята іншою програмою. Закрийте інші програми, що використовують камеру.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = 'Камера не підтримує необхідну роздільність.';
      }
      
      setCameraError(errorMessage);
      setShowCamera(false);
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
    setCameraError('');
    setCameraLoading(false);
    setVideoReady(false);
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsCapturing(true);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Встановлюємо розміри canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Малюємо кадр з відео на canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Конвертуємо в blob
    canvas.toBlob((blob) => {
      if (blob) {
        const imageFile = new File([blob], `document_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setCapturedImages(prev => [...prev, {
          file: imageFile,
          preview: URL.createObjectURL(blob),
          timestamp: new Date().toLocaleString('uk-UA')
        }]);
      }
      setIsCapturing(false);
    }, 'image/jpeg', 0.9);
  };

  // Функція для розпізнавання документів
  const detectDocument = (imageData) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    
    // Конвертуємо в чорно-біле для кращого розпізнавання
    const grayData = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      grayData[i / 4] = gray;
    }
    
    // Знаходимо краї документу (покращений алгоритм)
    const edges = findDocumentEdgesImproved(grayData, width, height);
    
    return edges;
  };

  // Покращена функція для пошуку країв документу
  const findDocumentEdgesImproved = (grayData, width, height) => {
    const margin = Math.min(width, height) * 0.05; // 5% відступ
    const scanStep = Math.max(1, Math.floor(Math.min(width, height) / 100)); // Крок сканування
    
    let top = margin, bottom = height - margin;
    let left = margin, right = width - margin;
    
    // Знаходимо верхній край (знизу вгору)
    for (let y = height - margin - 1; y >= margin; y -= scanStep) {
      let darkPixels = 0;
      for (let x = margin; x < width - margin; x += scanStep) {
        const index = y * width + x;
        if (grayData[index] < 100) { // Темні пікселі
          darkPixels++;
        }
      }
      const darkRatio = darkPixels / Math.floor((width - 2 * margin) / scanStep);
      if (darkRatio > 0.3) { // Якщо більше 30% темних пікселів
        top = y;
        break;
      }
    }
    
    // Знаходимо нижній край (зверху вниз)
    for (let y = margin; y < height - margin; y += scanStep) {
      let darkPixels = 0;
      for (let x = margin; x < width - margin; x += scanStep) {
        const index = y * width + x;
        if (grayData[index] < 100) {
          darkPixels++;
        }
      }
      const darkRatio = darkPixels / Math.floor((width - 2 * margin) / scanStep);
      if (darkRatio > 0.3) {
        bottom = y;
        break;
      }
    }
    
    // Знаходимо лівий край (справа наліво)
    for (let x = width - margin - 1; x >= margin; x -= scanStep) {
      let darkPixels = 0;
      for (let y = margin; y < height - margin; y += scanStep) {
        const index = y * width + x;
        if (grayData[index] < 100) {
          darkPixels++;
        }
      }
      const darkRatio = darkPixels / Math.floor((height - 2 * margin) / scanStep);
      if (darkRatio > 0.3) {
        left = x;
        break;
      }
    }
    
    // Знаходимо правий край (зліва направо)
    for (let x = margin; x < width - margin; x += scanStep) {
      let darkPixels = 0;
      for (let y = margin; y < height - margin; y += scanStep) {
        const index = y * width + x;
        if (grayData[index] < 100) {
          darkPixels++;
        }
      }
      const darkRatio = darkPixels / Math.floor((height - 2 * margin) / scanStep);
      if (darkRatio > 0.3) {
        right = x;
        break;
      }
    }
    
    return { top, bottom, left, right };
  };

  // Функція для вирізання та адаптивного форматування документу
  const cropAndFormatDocument = (canvas, edges) => {
    const { top, bottom, left, right } = edges;
    const cropWidth = right - left;
    const cropHeight = bottom - top;
    
    // Перевіряємо чи знайдено достатньо велику область
    const minSize = Math.min(canvas.width, canvas.height) * 0.2; // Мінімум 20% від розміру
    if (cropWidth < minSize || cropHeight < minSize) {
      return null; // Повертаємо null якщо документ не знайдено
    }
    
    // Створюємо новий canvas для вирізаного зображення
    const cropCanvas = document.createElement('canvas');
    const cropContext = cropCanvas.getContext('2d');
    
    // Адаптивне форматування - зберігаємо оригінальні пропорції
    const maxSize = 1200; // Максимальний розмір
    let targetWidth, targetHeight;
    
    if (cropWidth > cropHeight) {
      // Горизонтальний документ
      targetWidth = Math.min(cropWidth, maxSize);
      targetHeight = (cropHeight * targetWidth) / cropWidth;
    } else {
      // Вертикальний документ
      targetHeight = Math.min(cropHeight, maxSize);
      targetWidth = (cropWidth * targetHeight) / cropHeight;
    }
    
    cropCanvas.width = targetWidth;
    cropCanvas.height = targetHeight;
    
    // Вирізаємо та масштабуємо
    cropContext.drawImage(
      canvas,
      left, top, cropWidth, cropHeight,
      0, 0, targetWidth, targetHeight
    );
    
    return cropCanvas;
  };

  // Оновлена функція знімку з розпізнаванням документу
  const captureDocument = async () => {
    if (!videoRef.current || !canvasRef.current || !detectionCanvasRef.current) return;
    
    setIsCapturing(true);
    setProcessingImage(true);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detectionCanvas = detectionCanvasRef.current;
    const context = canvas.getContext('2d');
    const detectionContext = detectionCanvas.getContext('2d');
    
    // Встановлюємо розміри canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    detectionCanvas.width = video.videoWidth;
    detectionCanvas.height = video.videoHeight;
    
    // Малюємо кадр з відео на canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    detectionContext.drawImage(video, 0, 0, detectionCanvas.width, detectionCanvas.height);
    
    try {
      // Отримуємо дані зображення для розпізнавання
      const imageData = detectionContext.getImageData(0, 0, detectionCanvas.width, detectionCanvas.height);
      
      // Розпізнаємо документ
      const edges = detectDocument(imageData);
      
      // Вирізаємо та форматуємо документ
      const croppedCanvas = cropAndFormatDocument(canvas, edges);
      
      if (croppedCanvas) {
        setDocumentDetected(true);
        
        // Конвертуємо в blob з високою якістю
        croppedCanvas.toBlob((blob) => {
          if (blob) {
            const imageFile = new File([blob], `document_${Date.now()}.jpg`, { type: 'image/jpeg' });
            setCapturedImages(prev => [...prev, {
              file: imageFile,
              preview: URL.createObjectURL(blob),
              timestamp: new Date().toLocaleString('uk-UA'),
              isDocument: true,
              originalEdges: edges,
              dimensions: `${croppedCanvas.width}x${croppedCanvas.height}`
            }]);
          }
          setIsCapturing(false);
          setProcessingImage(false);
        }, 'image/jpeg', 0.98); // Максимальна якість
      } else {
        // Якщо документ не знайдено, зберігаємо оригінальне зображення
        canvas.toBlob((blob) => {
          if (blob) {
            const imageFile = new File([blob], `image_${Date.now()}.jpg`, { type: 'image/jpeg' });
            setCapturedImages(prev => [...prev, {
              file: imageFile,
              preview: URL.createObjectURL(blob),
              timestamp: new Date().toLocaleString('uk-UA'),
              isDocument: false,
              dimensions: `${canvas.width}x${canvas.height}`
            }]);
          }
          setIsCapturing(false);
          setProcessingImage(false);
        }, 'image/jpeg', 0.95);
      }
    } catch (error) {
      console.error('Помилка обробки зображення:', error);
      // Якщо помилка, зберігаємо оригінальне зображення
      canvas.toBlob((blob) => {
        if (blob) {
          const imageFile = new File([blob], `image_${Date.now()}.jpg`, { type: 'image/jpeg' });
          setCapturedImages(prev => [...prev, {
            file: imageFile,
            preview: URL.createObjectURL(blob),
            timestamp: new Date().toLocaleString('uk-UA'),
            isDocument: false,
            dimensions: `${canvas.width}x${canvas.height}`
          }]);
        }
        setIsCapturing(false);
        setProcessingImage(false);
      }, 'image/jpeg', 0.95);
    }
  };

  const removeCapturedImage = (index) => {
    setCapturedImages(prev => {
      const newImages = prev.filter((_, i) => i !== index);
      // Очищаємо URL для видаленого зображення
      URL.revokeObjectURL(prev[index].preview);
      return newImages;
    });
  };

  const uploadCapturedImages = async () => {
    if (capturedImages.length === 0) {
      setError('Немає знімків для завантаження');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      capturedImages.forEach((image, index) => {
        formData.append('files', image.file);
      });
      
      // Використовуємо назву групи або стандартний опис
      const finalDescription = cameraGroupName || description || 'Документи з камери';
      formData.append('description', finalDescription);

      const response = await fetch(`${API_URL}/api/files/upload/${taskId}`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Знімки завантажено:', result);
        
        // Очищаємо знімки
        capturedImages.forEach(image => URL.revokeObjectURL(image.preview));
        setCapturedImages([]);
        setCameraGroupName('');
        setShowCamera(false);
        stopCamera();
        
        // Перезавантажуємо список файлів
        await loadFiles();
        
        // Повідомляємо батьківський компонент
        if (onFilesUploaded) {
          onFilesUploaded(result.files);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Помилка завантаження знімків');
      }
    } catch (error) {
      console.error('Помилка завантаження знімків:', error);
      setError('Помилка завантаження знімків');
    } finally {
      setUploading(false);
    }
  };

  const loadFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/files/task/${taskId}`);
      if (response.ok) {
        const files = await response.json();
        setUploadedFiles(files);
      } else {
        console.error('Помилка завантаження файлів');
      }
    } catch (error) {
      console.error('Помилка завантаження файлів:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
    setError('');
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Виберіть файли для завантаження');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
      formData.append('description', description);

      const response = await fetch(`${API_URL}/api/files/upload/${taskId}`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Файли завантажено:', result);
        
        // Очищаємо форму
        setSelectedFiles([]);
        setDescription('');
        
        // Перезавантажуємо список файлів
        await loadFiles();
        
        // Повідомляємо батьківський компонент
        if (onFilesUploaded) {
          onFilesUploaded(result.files);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Помилка завантаження файлів');
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
      setError('Помилка завантаження файлів');
    } finally {
      setUploading(false);
    }
  };

  const handleViewFile = (file, event) => {
    // Запобігаємо закриття форми
    event.preventDefault();
    event.stopPropagation();
    
    // Відкриваємо файл в новій вкладці
    const newWindow = window.open(file.cloudinaryUrl, '_blank');
    
    // Фокусуємося назад на поточну вкладку
    if (newWindow) {
      newWindow.focus();
    }
    
    // Повертаємо фокус на поточну вкладку через невелику затримку
    setTimeout(() => {
      window.focus();
    }, 100);
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цей файл?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/files/${fileId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Перезавантажуємо список файлів
        await loadFiles();
      } else {
        setError('Помилка видалення файлу');
      }
    } catch (error) {
      console.error('Помилка видалення файлу:', error);
      setError('Помилка видалення файлу');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('uk-UA');
  };

  const getFileIcon = (mimetype) => {
    if (mimetype.startsWith('image/')) return '🖼️';
    if (mimetype.includes('pdf')) return '📄';
    if (mimetype.includes('word') || mimetype.includes('document')) return '📝';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return '📊';
    if (mimetype.includes('text')) return '📄';
    return '📎';
  };

  return (
    <div className="file-upload-container">
      <h3>Файли виконаних робіт</h3>
      
      {/* Завантаження нових файлів */}
      <div className="upload-section">
        <h4>Завантажити нові файли</h4>
        
        <div className="upload-methods">
          {/* Кнопка для знімку камери */}
          <button
            type="button"
            onClick={startCamera}
            className="camera-button"
            disabled={showCamera}
          >
            📸 Знімок камери
          </button>
          
          {/* Або вибрати файли */}
          <div className="file-input-container">
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              className="file-input"
            />
            <div className="file-input-label">
              {selectedFiles.length > 0 
                ? `Вибрано ${selectedFiles.length} файлів`
                : 'Вибрати файли'
              }
            </div>
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <div className="selected-files">
            <h5>Вибрані файли:</h5>
            <ul>
              {selectedFiles.map((file, index) => (
                <li key={index}>
                  {getFileIcon(file.type)} {file.name} ({formatFileSize(file.size)})
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="description-input">
          <label>Опис файлу (для всіх):</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Введіть опис файлу (необов'язково)"
            className="description-field"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={uploading || selectedFiles.length === 0}
          className="upload-button"
        >
          {uploading ? 'Завантаження...' : 'Завантажити файли'}
        </button>

        {error && <div className="error-message">{error}</div>}
      </div>

      {/* Інтерфейс камери */}
      {showCamera && (
        <div className="camera-section">
          <h4>Знімок документів камерою</h4>
          
          {cameraError && (
            <div className="error-message">{cameraError}</div>
          )}
          
          <div className="camera-container">
            {cameraLoading && (
              <div className="camera-loading">
                <div className="loading-spinner"></div>
                <p>Завантаження камери...</p>
              </div>
            )}
            
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`camera-video ${videoReady ? 'video-ready' : ''}`}
              style={{ display: cameraLoading ? 'none' : 'block' }}
            />
            
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <canvas ref={detectionCanvasRef} style={{ display: 'none' }} />
            
            <div className="camera-controls">
              <button
                onClick={captureDocument}
                disabled={isCapturing || !videoReady}
                className="capture-document-button"
              >
                {isCapturing ? (processingImage ? 'Обробка...' : 'Знімаємо...') : '📄 Знімок документу'}
              </button>
              
              <button
                onClick={captureImage}
                disabled={isCapturing || !videoReady}
                className="capture-button"
              >
                {isCapturing ? 'Знімаємо...' : '📸 Звичайний знімок'}
              </button>
              
              <button
                onClick={startCamera}
                disabled={cameraLoading}
                className="restart-camera-button"
              >
                🔄 Перезапустити камеру
              </button>
              
              <button
                onClick={stopCamera}
                className="close-camera-button"
              >
                ✕ Закрити камеру
              </button>
            </div>
          </div>
          
          {/* Попередній перегляд знімків */}
          {capturedImages.length > 0 && (
            <div className="captured-images">
              <h5>Зроблені знімки ({capturedImages.length}):</h5>
              
              <div className="captured-images-grid">
                {capturedImages.map((image, index) => (
                  <div key={index} className="captured-image-item">
                    <div className="image-type-indicator">
                      {image.isDocument ? '📄 Документ' : '📸 Звичайний знімок'}
                    </div>
                    <img 
                      src={image.preview} 
                      alt={`Знімок ${index + 1}`}
                      className="captured-image-preview"
                    />
                    <div className="captured-image-info">
                      <div className="image-details">
                        <span className="captured-image-time">{image.timestamp}</span>
                        {image.dimensions && (
                          <span className="image-dimensions">{image.dimensions}</span>
                        )}
                      </div>
                      <button
                        onClick={() => removeCapturedImage(index)}
                        className="remove-captured-image"
                        title="Видалити знімок"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="camera-group-input">
                <label>Назва групи знімків:</label>
                <input
                  type="text"
                  value={cameraGroupName}
                  onChange={(e) => setCameraGroupName(e.target.value)}
                  placeholder="Наприклад: Документи обладнання, Квитанції, тощо"
                  className="camera-group-field"
                />
              </div>
              
              <button
                onClick={uploadCapturedImages}
                disabled={uploading}
                className="upload-captured-button"
              >
                {uploading ? 'Завантаження...' : `Завантажити ${capturedImages.length} знімків`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Завантажені файли */}
      <div className="uploaded-files-section">
        <h4>Завантажені файли</h4>
        
        {loading ? (
          <div className="loading">Завантаження файлів...</div>
        ) : uploadedFiles.length === 0 ? (
          <div className="no-files">Файлів ще немає</div>
        ) : (
          <div className="files-list">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="file-item">
                <div className="file-info">
                  <span className="file-icon">{getFileIcon(file.mimetype)}</span>
                  <div className="file-details">
                    <div className="file-name">
                      <a 
                        href={file.cloudinaryUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="file-link"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleViewFile(file, event);
                        }}
                      >
                        {file.originalName}
                      </a>
                    </div>
                    <div className="file-meta">
                      {formatFileSize(file.size)} • {formatDate(file.uploadDate)}
                      {file.description && <span className="file-description"> • {file.description}</span>}
                    </div>
                  </div>
                </div>
                <div className="file-actions">
                  <button
                    onClick={(event) => handleViewFile(file, event)}
                    className="view-button"
                    title="Переглянути файл"
                  >
                    👁️
                  </button>
                  <button
                    onClick={() => handleDeleteFile(file.id)}
                    className="delete-button"
                    title="Видалити файл"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload; 