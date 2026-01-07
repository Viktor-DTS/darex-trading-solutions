import React, { useState, useRef, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './EquipmentFileUpload.css';

const EquipmentFileUpload = ({ onFilesChange, uploadedFiles = [] }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showCamera, setShowCamera] = useState(false);
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (error) {
      console.error('Помилка доступу до камери:', error);
      alert('Не вдалося отримати доступ до камери. Перевірте дозволи.');
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        handleFileAdd(file);
        stopCamera();
        setShowCamera(false);
      }
    }, 'image/jpeg', 0.9);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => handleFileAdd(file));
    e.target.value = ''; // Очищаємо input для можливості вибрати той самий файл знову
  };

  const handleFileAdd = async (file) => {
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('photo', file);

      const response = await fetch(`${API_BASE_URL}/equipment/upload-photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        const newFile = {
          id: Date.now() + Math.random(),
          originalName: file.name,
          cloudinaryUrl: data.photoUrl,
          cloudinaryId: data.cloudinaryId,
          mimetype: file.type || 'image/jpeg',
          size: file.size
        };
        
        const updatedFiles = [...uploadedFiles, newFile];
        setSelectedFiles([...selectedFiles, file]);
        onFilesChange && onFilesChange(updatedFiles);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Помилка завантаження файлу');
      }
    } catch (error) {
      console.error('Помилка завантаження файлу:', error);
      alert('Помилка завантаження файлу');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = (fileId) => {
    const updatedFiles = uploadedFiles.filter(f => f.id !== fileId);
    onFilesChange && onFilesChange(updatedFiles);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Функція для відкриття галереї зображень
  const openGalleryInNewWindow = (files, startIndex = 0) => {
    const imageFiles = files.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const galleryWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!galleryWindow) return;

    const imagesData = imageFiles.map(f => ({
      url: f.cloudinaryUrl,
      name: f.originalName || 'Фото',
      description: ''
    }));

    galleryWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Галерея зображень</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            background: #1a1a2e; 
            color: white; 
            font-family: Arial, sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .header {
            background: #16213e;
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .header h2 { font-size: 18px; }
          .nav-buttons { display: flex; gap: 10px; }
          .nav-btn {
            background: #0f3460;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
          }
          .nav-btn:hover { background: #1a4f7a; }
          .nav-btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .main-image {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            position: relative;
          }
          .main-image img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          .image-info {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.7);
            padding: 10px 20px;
            border-radius: 5px;
            text-align: center;
          }
          .thumbnails {
            background: #16213e;
            padding: 10px;
            display: flex;
            gap: 10px;
            overflow-x: auto;
            justify-content: center;
          }
          .thumb {
            width: 80px;
            height: 60px;
            object-fit: cover;
            border-radius: 5px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: border-color 0.2s;
          }
          .thumb:hover { border-color: #4CAF50; }
          .thumb.active { border-color: #4CAF50; }
          .counter {
            font-size: 14px;
            color: #aaa;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>🖼️ Галерея зображень</h2>
          <div class="nav-buttons">
            <button class="nav-btn" onclick="prevImage()">⬅️ Попереднє</button>
            <span class="counter" id="counter">1 / ${imageFiles.length}</span>
            <button class="nav-btn" onclick="nextImage()">Наступне ➡️</button>
            <button class="nav-btn" onclick="downloadImage()">⬇️ Завантажити</button>
            <button class="nav-btn" onclick="window.close()">✕ Закрити</button>
          </div>
        </div>
        <div class="main-image">
          <img id="mainImg" src="${imagesData[startIndex].url}" alt="${imagesData[startIndex].name}" />
          <div class="image-info">
            <div id="imgName">${imagesData[startIndex].name}</div>
            <div id="imgDesc">${imagesData[startIndex].description}</div>
          </div>
        </div>
        <div class="thumbnails" id="thumbnails">
          ${imagesData.map((img, i) => `
            <img class="thumb ${i === startIndex ? 'active' : ''}" 
                 src="${img.url}" 
                 onclick="showImage(${i})" 
                 alt="${img.name}" />
          `).join('')}
        </div>
        <script>
          const images = ${JSON.stringify(imagesData)};
          let currentIndex = ${startIndex};
          
          function showImage(index) {
            currentIndex = index;
            document.getElementById('mainImg').src = images[index].url;
            document.getElementById('imgName').textContent = images[index].name;
            document.getElementById('imgDesc').textContent = images[index].description || '';
            document.getElementById('counter').textContent = (index + 1) + ' / ' + images.length;
            document.querySelectorAll('.thumb').forEach((t, i) => {
              t.classList.toggle('active', i === index);
            });
          }
          
          function prevImage() {
            showImage((currentIndex - 1 + images.length) % images.length);
          }
          
          function nextImage() {
            showImage((currentIndex + 1) % images.length);
          }
          
          function downloadImage() {
            const link = document.createElement('a');
            link.href = images[currentIndex].url;
            link.download = images[currentIndex].name;
            link.click();
          }
          
          document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') prevImage();
            if (e.key === 'ArrowRight') nextImage();
            if (e.key === 'Escape') window.close();
          });
        </script>
      </body>
      </html>
    `);
    galleryWindow.document.close();
  };

  // Обробник перегляду файлу
  const handleViewFile = (file, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    const isImage = file.mimetype && file.mimetype.startsWith('image/');
    
    if (isImage) {
      // Відкриваємо зображення в новому вікні з галереєю
      const imageFiles = uploadedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
      const imageIndex = imageFiles.findIndex(f => f.id === file.id);
      openGalleryInNewWindow(uploadedFiles, imageIndex >= 0 ? imageIndex : 0);
    } else {
      // Для не-зображень відкриваємо в новій вкладці
      window.open(file.cloudinaryUrl, '_blank');
    }
  };

  useEffect(() => {
    if (showCamera) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [showCamera]);

  return (
    <div className="equipment-file-upload">
      <div className="file-upload-controls">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx"
          onChange={handleFileSelect}
          className="file-input-hidden"
          id="equipment-file-input"
        />
        <label htmlFor="equipment-file-input" className="btn-file-select">
          📁 Вибрати файли
        </label>
        
        <button
          type="button"
          onClick={() => {
            if (showCamera) {
              stopCamera();
            }
            setShowCamera(!showCamera);
          }}
          className="btn-camera"
        >
          📷 {showCamera ? 'Закрити камеру' : 'Зробити фото'}
        </button>
      </div>

      {showCamera && (
        <div className="camera-modal">
          <div className="camera-container">
            <video ref={videoRef} autoPlay playsInline className="camera-video" />
            <div className="camera-controls">
              <button type="button" onClick={capturePhoto} className="btn-capture">
                📸 Зробити фото
              </button>
              <button type="button" onClick={() => {
                stopCamera();
                setShowCamera(false);
              }} className="btn-cancel">
                ✕ Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {uploading && (
        <div className="upload-progress">
          ⏳ Завантаження файлу...
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="uploaded-files-list">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4>Прикріплені файли ({uploadedFiles.length}):</h4>
            {uploadedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/')).length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const imageFiles = uploadedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
                  openGalleryInNewWindow(uploadedFiles, 0);
                }}
                style={{
                  background: '#0f3460',
                  color: 'white',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                title="Відкрити галерею зображень"
              >
                🖼️ Галерея ({uploadedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/')).length})
              </button>
            )}
          </div>
          <div className="files-grid">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="file-item">
                {file.mimetype && file.mimetype.startsWith('image/') ? (
                  <img 
                    src={file.cloudinaryUrl} 
                    alt={file.originalName} 
                    className="file-preview"
                    onClick={(e) => handleViewFile(file, e)}
                    style={{ cursor: 'pointer' }}
                  />
                ) : (
                  <div 
                    className="file-icon"
                    onClick={(e) => handleViewFile(file, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    📄
                  </div>
                )}
                <div className="file-info">
                  <div 
                    className="file-name" 
                    title={file.originalName}
                    onClick={(e) => handleViewFile(file, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    {file.originalName}
                  </div>
                  <div className="file-size">{formatFileSize(file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(file.id);
                  }}
                  className="btn-remove"
                  title="Видалити"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentFileUpload;

