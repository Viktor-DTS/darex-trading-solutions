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
          <h4>Прикріплені файли ({uploadedFiles.length}):</h4>
          <div className="files-grid">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="file-item">
                {file.mimetype && file.mimetype.startsWith('image/') ? (
                  <img src={file.cloudinaryUrl} alt={file.originalName} className="file-preview" />
                ) : (
                  <div className="file-icon">📄</div>
                )}
                <div className="file-info">
                  <div className="file-name" title={file.originalName}>
                    {file.originalName}
                  </div>
                  <div className="file-size">{formatFileSize(file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(file.id)}
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

