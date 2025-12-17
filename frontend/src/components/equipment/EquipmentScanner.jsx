import React, { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import { parseEquipmentData, validateEquipmentData } from '../../utils/ocrParser';
import API_BASE_URL from '../../config';
import './EquipmentScanner.css';

function EquipmentScanner({ user, warehouses, onEquipmentAdded, onClose }) {
  const [step, setStep] = useState('camera'); // camera, processing, review, success
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [equipmentData, setEquipmentData] = useState({
    currentWarehouse: user?.region || '',
    currentWarehouseName: user?.region || '',
    region: user?.region || ''
  });
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (error) {
      console.error('Помилка доступу до камери:', error);
      alert('Не вдалося отримати доступ до камери. Перевірте дозволи.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setImagePreview(dataUrl);
      setImage(dataUrl);
      stopCamera();
      setStep('processing');
      processImage(dataUrl);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        setImagePreview(dataUrl);
        setImage(dataUrl);
        setStep('processing');
        processImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async (imageData) => {
    setProcessing(true);
    try {
      const worker = await createWorker('eng+ukr');
      const { data: { text } } = await worker.recognize(imageData);
      await worker.terminate();
      
      setOcrText(text);
      const parsed = parseEquipmentData(text);
      console.log('Розпізнані дані:', parsed);
      console.log('OCR текст:', text);
      
      // Об'єднуємо дані, але не перезаписуємо порожніми значеннями
      setEquipmentData(prev => {
        const merged = { ...prev };
        Object.keys(parsed).forEach(key => {
          // Додаємо значення тільки якщо воно не порожнє
          if (parsed[key] !== '' && parsed[key] !== null && parsed[key] !== undefined) {
            merged[key] = parsed[key];
          }
        });
        console.log('Об\'єднані дані:', merged);
        return merged;
      });
      setStep('review');
    } catch (error) {
      console.error('Помилка OCR:', error);
      alert('Помилка розпізнавання тексту. Спробуйте ще раз з кращою якістю фото.');
      setStep('camera');
    } finally {
      setProcessing(false);
    }
  };

  const handleInputChange = (field, value) => {
    setEquipmentData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    console.log('Дані перед валідацією:', equipmentData);
    const validation = validateEquipmentData(equipmentData);
    console.log('Результат валідації:', validation);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setSaving(true);
    setErrors([]);
    
    try {
      const token = localStorage.getItem('token');
      
      // Завантажуємо фото на Cloudinary
      let photoUrl = image;
      let cloudinaryId = null;
      
      if (image && image.startsWith('data:image')) {
        try {
          // Конвертуємо base64 в Blob
          const response = await fetch(image);
          const blob = await response.blob();
          
          // Створюємо FormData для завантаження
          const formData = new FormData();
          formData.append('photo', blob, 'equipment-photo.jpg');
          
          const uploadResponse = await fetch(`${API_BASE_URL}/equipment/upload-photo`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });
          
          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            photoUrl = uploadData.photoUrl;
            cloudinaryId = uploadData.cloudinaryId;
          } else {
            console.warn('Не вдалося завантажити фото на Cloudinary, використовуємо base64');
          }
        } catch (uploadError) {
          console.warn('Помилка завантаження фото:', uploadError);
          // Продовжуємо з base64
        }
      }
      
      // Очищаємо значення "не визначено" перед відправкою
      const cleanedData = { ...equipmentData };
      Object.keys(cleanedData).forEach(key => {
        if (cleanedData[key] === 'не визначено' || cleanedData[key] === '') {
          cleanedData[key] = key === 'phase' || key === 'amperage' || key === 'rpm' || key === 'weight' ? null : '';
        }
      });
      
      const response = await fetch(`${API_BASE_URL}/equipment/scan`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...cleanedData,
          photoUrl: photoUrl,
          cloudinaryId: cloudinaryId,
          ocrData: { text: ocrText }
        })
      });

      if (response.ok) {
        const saved = await response.json();
        setStep('success');
        setTimeout(() => {
          onEquipmentAdded && onEquipmentAdded(saved);
          onClose && onClose();
        }, 2000);
      } else {
        const error = await response.json();
        setErrors([error.error || 'Помилка збереження']);
      }
    } catch (error) {
      console.error('Помилка збереження:', error);
      setErrors(['Помилка збереження обладнання']);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (step === 'camera') {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [step]);

  return (
    <div className="equipment-scanner">
      {step === 'camera' && (
        <div className="scanner-camera">
          <div className="scanner-header">
            <h2>📷 Сканування шильдика</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          
          <div className="camera-container">
            <video ref={videoRef} autoPlay playsInline className="camera-video" />
            <div className="camera-overlay">
              <div className="scan-frame" />
              <p>Наведіть камеру на шильдик</p>
            </div>
          </div>
          
          <div className="camera-controls">
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
              📁 Вибрати файл
            </button>
            <button className="btn-primary btn-capture" onClick={capturePhoto}>
              📸 Зробити фото
            </button>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {step === 'processing' && (
        <div className="scanner-processing">
          <div className="processing-spinner">⏳</div>
          <h3>Розпізнавання тексту...</h3>
          <p>Це може зайняти кілька секунд</p>
        </div>
      )}

      {step === 'review' && (
        <div className="scanner-review">
          <div className="review-header">
            <h2>✅ Перевірте дані</h2>
            <button className="btn-close" onClick={() => setStep('camera')}>← Назад</button>
          </div>

          {imagePreview && (
            <div className="review-image">
              <img src={imagePreview} alt="Шильдик" />
            </div>
          )}

          {errors.length > 0 && (
            <div className="errors">
              {errors.map((err, i) => (
                <div key={i} className="error-message">{err}</div>
              ))}
            </div>
          )}

          <div className="review-form">
            <div className="form-group">
              <label>Тип обладнання *</label>
              <input
                type="text"
                className={!equipmentData.type ? 'undefined-field' : ''}
                value={equipmentData.type || 'не визначено'}
                onChange={(e) => handleInputChange('type', e.target.value === 'не визначено' ? '' : e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === 'не визначено') {
                    e.target.value = '';
                    handleInputChange('type', '');
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleInputChange('type', '');
                  }
                }}
                placeholder="DE-50BDS"
              />
            </div>

            <div className="form-group">
              <label>Серійний номер *</label>
              <input
                type="text"
                className={!equipmentData.serialNumber ? 'undefined-field' : ''}
                value={equipmentData.serialNumber || 'не визначено'}
                onChange={(e) => handleInputChange('serialNumber', e.target.value === 'не визначено' ? '' : e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === 'не визначено') {
                    e.target.value = '';
                    handleInputChange('serialNumber', '');
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleInputChange('serialNumber', '');
                  }
                }}
                placeholder="20241007015"
              />
            </div>

            <div className="form-group">
              <label>Склад *</label>
              <select
                value={equipmentData.currentWarehouse || ''}
                onChange={(e) => {
                  const warehouse = warehouses.find(w => w._id === e.target.value || w.name === e.target.value);
                  handleInputChange('currentWarehouse', e.target.value);
                  handleInputChange('currentWarehouseName', warehouse?.name || e.target.value);
                }}
              >
                <option value="">Виберіть склад</option>
                {warehouses.map(w => (
                  <option key={w._id || w.name} value={w._id || w.name}>
                    {w.name} {w.region ? `(${w.region})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Резервна потужність</label>
                <input
                  type="text"
                  className={!equipmentData.standbyPower ? 'undefined-field' : ''}
                  value={equipmentData.standbyPower || 'не визначено'}
                  onChange={(e) => handleInputChange('standbyPower', e.target.value === 'не визначено' ? '' : e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === 'не визначено') {
                      e.target.value = '';
                      handleInputChange('standbyPower', '');
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') {
                      handleInputChange('standbyPower', '');
                    }
                  }}
                  placeholder="50/40 KVA/KW"
                />
              </div>
              <div className="form-group">
                <label>Основна потужність</label>
                <input
                  type="text"
                  className={!equipmentData.primePower ? 'undefined-field' : ''}
                  value={equipmentData.primePower || 'не визначено'}
                  onChange={(e) => handleInputChange('primePower', e.target.value === 'не визначено' ? '' : e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === 'не визначено') {
                      e.target.value = '';
                      handleInputChange('primePower', '');
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') {
                      handleInputChange('primePower', '');
                    }
                  }}
                  placeholder="45/36 KVA/KW"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Фази</label>
                <input
                  type="text"
                  className={equipmentData.phase === null || equipmentData.phase === undefined ? 'undefined-field' : ''}
                  value={equipmentData.phase !== null && equipmentData.phase !== undefined ? equipmentData.phase : 'не визначено'}
                  onChange={(e) => {
                    const val = e.target.value === 'не визначено' ? '' : e.target.value;
                    handleInputChange('phase', val === '' ? null : (isNaN(parseInt(val)) ? null : parseInt(val)));
                  }}
                  onFocus={(e) => {
                    if (e.target.value === 'не визначено') {
                      e.target.value = '';
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') {
                      handleInputChange('phase', null);
                    }
                  }}
                  placeholder="3"
                />
              </div>
              <div className="form-group">
                <label>Напруга</label>
                <input
                  type="text"
                  className={!equipmentData.voltage ? 'undefined-field' : ''}
                  value={equipmentData.voltage || 'не визначено'}
                  onChange={(e) => handleInputChange('voltage', e.target.value === 'не визначено' ? '' : e.target.value)}
                  onFocus={(e) => {
                    if (e.target.value === 'не визначено') {
                      e.target.value = '';
                      handleInputChange('voltage', '');
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') {
                      handleInputChange('voltage', '');
                    }
                  }}
                  placeholder="400/230"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Струм (A)</label>
                <input
                  type="text"
                  className={equipmentData.amperage === null || equipmentData.amperage === undefined ? 'undefined-field' : ''}
                  value={equipmentData.amperage !== null && equipmentData.amperage !== undefined ? equipmentData.amperage : 'не визначено'}
                  onChange={(e) => {
                    const val = e.target.value === 'не визначено' ? '' : e.target.value;
                    handleInputChange('amperage', val === '' ? null : (isNaN(parseInt(val)) ? null : parseInt(val)));
                  }}
                  onFocus={(e) => {
                    if (e.target.value === 'не визначено') {
                      e.target.value = '';
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') {
                      handleInputChange('amperage', null);
                    }
                  }}
                  placeholder="72"
                />
              </div>
              <div className="form-group">
                <label>RPM</label>
                <input
                  type="text"
                  className={equipmentData.rpm === null || equipmentData.rpm === undefined ? 'undefined-field' : ''}
                  value={equipmentData.rpm !== null && equipmentData.rpm !== undefined ? equipmentData.rpm : 'не визначено'}
                  onChange={(e) => {
                    const val = e.target.value === 'не визначено' ? '' : e.target.value;
                    handleInputChange('rpm', val === '' ? null : (isNaN(parseInt(val)) ? null : parseInt(val)));
                  }}
                  onFocus={(e) => {
                    if (e.target.value === 'не визначено') {
                      e.target.value = '';
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') {
                      handleInputChange('rpm', null);
                    }
                  }}
                  placeholder="1500"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Розміри (мм)</label>
              <input
                type="text"
                className={!equipmentData.dimensions ? 'undefined-field' : ''}
                value={equipmentData.dimensions || 'не визначено'}
                onChange={(e) => handleInputChange('dimensions', e.target.value === 'не визначено' ? '' : e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === 'не визначено') {
                    e.target.value = '';
                    handleInputChange('dimensions', '');
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleInputChange('dimensions', '');
                  }
                }}
                placeholder="2280 x 950 x 1250"
              />
            </div>

            <div className="form-group">
              <label>Вага (кг)</label>
              <input
                type="text"
                className={equipmentData.weight === null || equipmentData.weight === undefined ? 'undefined-field' : ''}
                value={equipmentData.weight !== null && equipmentData.weight !== undefined ? equipmentData.weight : 'не визначено'}
                onChange={(e) => {
                  const val = e.target.value === 'не визначено' ? '' : e.target.value;
                  handleInputChange('weight', val === '' ? null : (isNaN(parseInt(val)) ? null : parseInt(val)));
                }}
                onFocus={(e) => {
                  if (e.target.value === 'не визначено') {
                    e.target.value = '';
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleInputChange('weight', null);
                  }
                }}
                placeholder="940"
              />
            </div>

            <div className="form-group">
              <label>Дата виробництва</label>
              <input
                type="text"
                className={!equipmentData.manufactureDate ? 'undefined-field' : ''}
                value={equipmentData.manufactureDate || 'не визначено'}
                onChange={(e) => handleInputChange('manufactureDate', e.target.value === 'не визначено' ? '' : e.target.value)}
                onFocus={(e) => {
                  if (e.target.value === 'не визначено') {
                    e.target.value = '';
                    handleInputChange('manufactureDate', '');
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    handleInputChange('manufactureDate', '');
                  }
                }}
                placeholder="2024"
              />
            </div>

            <div className="form-actions">
              <button className="btn-secondary" onClick={() => setStep('camera')}>
                Сканувати знову
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Збереження...' : '💾 Додати на склад'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="scanner-success">
          <div className="success-icon">✅</div>
          <h3>Обладнання успішно додано!</h3>
          <p>Перенаправлення...</p>
        </div>
      )}
    </div>
  );
}

export default EquipmentScanner;

