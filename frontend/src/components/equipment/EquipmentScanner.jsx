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
      // Спочатку пробуємо отримати список доступних камер
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      // Налаштування для максимальної якості та макро режиму
      const constraints = {
        video: {
          facingMode: 'environment',
          // Максимальне розрішення
          width: { ideal: 4096 },
          height: { ideal: 2160 },
          // Режим макро (фокус на близькі об'єкти)
          focusMode: 'manual',
          // Додаткові налаштування для кращої якості
          aspectRatio: { ideal: 16/9 },
          frameRate: { ideal: 30 }
        }
      };

      let stream;
      try {
        // Пробуємо з макро режимом
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Намагаємося встановити фокус на близькі об'єкти (макро)
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        
        if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: 'manual', focusDistance: 0.1 }]
            });
          } catch (focusError) {
            console.log('Макро режим не підтримується, використовуємо автофокус');
          }
        }
      } catch (highQualityError) {
        console.log('Високоякісний режим не підтримується, використовуємо стандартний');
        // Fallback до стандартного режиму
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
      }

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

  const enhanceImage = (imageSrc) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Встановлюємо розміри canvas на розміри зображення
        canvas.width = img.width;
        canvas.height = img.height;
        
        // Малюємо оригінальне зображення
        ctx.drawImage(img, 0, 0);
        
        // Отримуємо дані пікселів
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Обчислюємо середню яскравість для адаптивної обробки
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          totalBrightness += gray;
        }
        const avgBrightness = totalBrightness / (data.length / 4);
        
        // Адаптивні параметри на основі середньої яскравості
        const contrast = avgBrightness < 100 ? 2.2 : 1.9; // Більший контраст для темних зображень
        const brightness = avgBrightness < 100 ? 1.2 : 1.05;
        
        // Обчислюємо адаптивний поріг для бінаризації
        const threshold = avgBrightness;
        
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];
          
          // Застосовуємо контраст
          const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
          r = Math.max(0, Math.min(255, factor * (r - 128) + 128));
          g = Math.max(0, Math.min(255, factor * (g - 128) + 128));
          b = Math.max(0, Math.min(255, factor * (b - 128) + 128));
          
          // Застосовуємо яскравість
          r = Math.max(0, Math.min(255, r * brightness));
          g = Math.max(0, Math.min(255, g * brightness));
          b = Math.max(0, Math.min(255, b * brightness));
          
          // Спрощена обробка для кращого розпізнавання тексту
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          
          // Менш агресивна обробка - тільки посилення контрасту без подвійної обробки
          if (gray < threshold - 25) {
            // Темні області (текст) - трохи темніші для кращого контрасту
            const darkenFactor = 0.85;
            r = Math.max(0, r * darkenFactor);
            g = Math.max(0, g * darkenFactor);
            b = Math.max(0, b * darkenFactor);
          } else if (gray > threshold + 25) {
            // Світлі області (фон) - трохи світліші
            const lightenFactor = 1.1;
            r = Math.min(255, r * lightenFactor);
            g = Math.min(255, g * lightenFactor);
            b = Math.min(255, b * lightenFactor);
          }
          
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
        
        // Застосовуємо покращені дані
        ctx.putImageData(imageData, 0, 0);
        
        // Додаткове покращення різкості через фільтр
        const sharpnessCanvas = document.createElement('canvas');
        sharpnessCanvas.width = canvas.width;
        sharpnessCanvas.height = canvas.height;
        const sharpnessCtx = sharpnessCanvas.getContext('2d');
        
        // Застосовуємо фільтр різкості та контрасту (менш агресивно)
        sharpnessCtx.filter = 'contrast(1.15) saturate(1.1) brightness(1.02)';
        sharpnessCtx.drawImage(canvas, 0, 0);
        
        // Використовуємо покращене зображення
        canvas.width = sharpnessCanvas.width;
        canvas.height = sharpnessCanvas.height;
        ctx.drawImage(sharpnessCanvas, 0, 0);
        
        // Конвертуємо в base64 з високою якістю
        const enhancedDataUrl = canvas.toDataURL('image/jpeg', 1.0);
        resolve(enhancedDataUrl);
      };
      img.src = imageSrc;
    });
  };

  const capturePhoto = async () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      // Використовуємо максимальне розрішення з відео
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      // Малюємо кадр з максимальною якістю
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      // Зберігаємо оригінальне зображення для preview та Google Vision
      const originalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setImagePreview(originalDataUrl);
      
      // Покращуємо зображення для Tesseract OCR (якщо Google Vision не спрацює)
      const enhancedDataUrl = await enhanceImage(originalDataUrl);
      setImage(enhancedDataUrl);
      
      stopCamera();
      setStep('processing');
      // Передаємо обидва зображення: оригінальне для Google Vision, оброблене для Tesseract
      processImage(enhancedDataUrl, originalDataUrl);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const originalDataUrl = e.target.result;
        setImagePreview(originalDataUrl);
        
        // Покращуємо зображення для Tesseract OCR (якщо Google Vision не спрацює)
        const enhancedDataUrl = await enhanceImage(originalDataUrl);
        setImage(enhancedDataUrl);
        setStep('processing');
        // Передаємо обидва зображення: оригінальне для Google Vision, оброблене для Tesseract
        processImage(enhancedDataUrl, originalDataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImageWithGoogleVision = async (originalImageData) => {
    try {
      // Використовуємо оригінальне зображення (не оброблене) для Google Vision API
      // Конвертуємо base64 в blob
      const response = await fetch(originalImageData);
      const blob = await response.blob();
      
      // Відправляємо на бекенд для обробки через Google Vision API
      const formData = new FormData();
      formData.append('image', blob, 'equipment-photo.jpg');
      
      const token = localStorage.getItem('token');
      const ocrResponse = await fetch(`${API_BASE_URL}/equipment/ocr`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (ocrResponse.ok) {
        const result = await ocrResponse.json();
        const text = result.text || '';
        if (text && text.trim().length > 10) {
          console.log('[OCR] Google Vision API розпізнав текст:', text.substring(0, 100) + '...');
          return text;
        }
      } else {
        const errorData = await ocrResponse.json().catch(() => ({}));
        // Якщо сервер повертає useTesseract: true, це нормально - використаємо Tesseract
        if (errorData.useTesseract) {
          console.log('[OCR] Google Vision API недоступний, використовуємо Tesseract');
        } else {
          console.warn('[OCR] Google Vision API помилка:', ocrResponse.status, errorData);
        }
      }
      return null;
    } catch (error) {
      console.error('[OCR] Помилка Google Vision API:', error);
      return null;
    }
  };

  const processImage = async (enhancedImageData, originalImageData) => {
    setProcessing(true);
    try {
      let text = '';
      
      // Спочатку пробуємо Google Vision API з оригінальним зображенням (якщо доступний)
      if (originalImageData) {
        try {
          text = await processImageWithGoogleVision(originalImageData);
        } catch (googleError) {
          console.log('[OCR] Google Vision API недоступний, використовуємо Tesseract:', googleError);
        }
      }
      
      // Якщо Google Vision не дав результату, використовуємо Tesseract
      if (!text || text.trim().length < 10) {
        console.log('[OCR] Використовуємо Tesseract для розпізнавання...');
        const worker = await createWorker('eng+ukr');
        
        // Спочатку пробуємо з обробленим зображенням
        let { data: { text: tesseractText } } = await worker.recognize(enhancedImageData);
        
        // Якщо результат поганий (багато символів, але мало слів), пробуємо з оригіналом
        const words = tesseractText.trim().split(/\s+/).filter(w => w.length > 2);
        if (words.length < 3 && originalImageData) {
          console.log('[OCR] Оброблене зображення дало поганий результат, пробуємо оригінал...');
          const { data: { text: originalText } } = await worker.recognize(originalImageData);
          const originalWords = originalText.trim().split(/\s+/).filter(w => w.length > 2);
          // Вибираємо кращий результат
          if (originalWords.length > words.length) {
            tesseractText = originalText;
            console.log('[OCR] Оригінальне зображення дало кращий результат');
          }
        }
        
        await worker.terminate();
        text = tesseractText;
        console.log('[OCR] Tesseract розпізнав текст:', text.substring(0, 100) + '...');
      }
      
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
        const errorData = await response.json();
        let errorMessage = errorData.error || 'Помилка збереження';
        
        // Якщо це помилка дублікату, показуємо детальну інформацію
        if (errorData.existing) {
          errorMessage = `${errorMessage}\n\nІснуюче обладнання:\nТип: ${errorData.existing.type}\nСерійний номер: ${errorData.existing.serialNumber}\nСклад: ${errorData.existing.currentWarehouse || 'Не вказано'}`;
        }
        
        setErrors([errorMessage]);
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
              <label>Виробник</label>
              <input
                type="text"
                className={!equipmentData.manufacturer ? 'undefined-field' : ''}
                value={equipmentData.manufacturer || ''}
                onChange={(e) => handleInputChange('manufacturer', e.target.value)}
                placeholder={!equipmentData.manufacturer ? 'не визначено' : 'DAREX ENERGY'}
              />
            </div>

            <div className="form-group">
              <label>Тип обладнання *</label>
              <input
                type="text"
                className={!equipmentData.type ? 'undefined-field' : ''}
                value={equipmentData.type || ''}
                onChange={(e) => handleInputChange('type', e.target.value)}
                placeholder={!equipmentData.type ? 'не визначено' : 'DE-50BDS'}
                required
              />
            </div>

            <div className="form-group">
              <label>Серійний номер *</label>
              <input
                type="text"
                className={!equipmentData.serialNumber ? 'undefined-field' : ''}
                value={equipmentData.serialNumber || ''}
                onChange={(e) => handleInputChange('serialNumber', e.target.value)}
                placeholder={!equipmentData.serialNumber ? 'не визначено' : '20241007015'}
                required
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
                  if (warehouse?.region) {
                    handleInputChange('region', warehouse.region);
                  }
                }}
                required
              >
                <option value="">Виберіть склад</option>
                {warehouses.map(w => (
                  <option key={w._id || w.name} value={w._id || w.name}>
                    {w.name} {w.region ? `(${w.region})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Регіон</label>
              <input
                type="text"
                className={!equipmentData.region ? 'undefined-field' : ''}
                value={equipmentData.region || ''}
                onChange={(e) => handleInputChange('region', e.target.value)}
                placeholder={!equipmentData.region ? 'не визначено' : 'Введіть регіон'}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Резервна потужність</label>
                <input
                  type="text"
                  className={!equipmentData.standbyPower ? 'undefined-field' : ''}
                  value={equipmentData.standbyPower || ''}
                  onChange={(e) => handleInputChange('standbyPower', e.target.value)}
                  placeholder={!equipmentData.standbyPower ? 'не визначено' : '50/40 KVA/KW'}
                />
              </div>
              <div className="form-group">
                <label>Основна потужність</label>
                <input
                  type="text"
                  className={!equipmentData.primePower ? 'undefined-field' : ''}
                  value={equipmentData.primePower || ''}
                  onChange={(e) => handleInputChange('primePower', e.target.value)}
                  placeholder={!equipmentData.primePower ? 'не визначено' : '45/36 KVA/KW'}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Фази</label>
                <input
                  type="text"
                  className={equipmentData.phase === null || equipmentData.phase === undefined ? 'undefined-field' : ''}
                  value={equipmentData.phase !== null && equipmentData.phase !== undefined ? String(equipmentData.phase) : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleInputChange('phase', val === '' ? null : (isNaN(parseInt(val)) ? null : parseInt(val)));
                  }}
                  placeholder={equipmentData.phase === null || equipmentData.phase === undefined ? 'не визначено' : '3'}
                />
              </div>
              <div className="form-group">
                <label>Напруга</label>
                <input
                  type="text"
                  className={!equipmentData.voltage ? 'undefined-field' : ''}
                  value={equipmentData.voltage || ''}
                  onChange={(e) => handleInputChange('voltage', e.target.value)}
                  placeholder={!equipmentData.voltage ? 'не визначено' : '400/230'}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Струм (A)</label>
                <input
                  type="text"
                  className={equipmentData.amperage === null || equipmentData.amperage === undefined ? 'undefined-field' : ''}
                  value={equipmentData.amperage !== null && equipmentData.amperage !== undefined ? String(equipmentData.amperage) : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleInputChange('amperage', val === '' ? null : (isNaN(parseInt(val)) ? null : parseInt(val)));
                  }}
                  placeholder={equipmentData.amperage === null || equipmentData.amperage === undefined ? 'не визначено' : '72'}
                />
              </div>
              <div className="form-group">
                <label>RPM</label>
                <input
                  type="text"
                  className={equipmentData.rpm === null || equipmentData.rpm === undefined ? 'undefined-field' : ''}
                  value={equipmentData.rpm !== null && equipmentData.rpm !== undefined ? String(equipmentData.rpm) : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleInputChange('rpm', val === '' ? null : (isNaN(parseInt(val)) ? null : parseInt(val)));
                  }}
                  placeholder={equipmentData.rpm === null || equipmentData.rpm === undefined ? 'не визначено' : '1500'}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Розміри (мм)</label>
              <input
                type="text"
                className={!equipmentData.dimensions ? 'undefined-field' : ''}
                value={equipmentData.dimensions || ''}
                onChange={(e) => handleInputChange('dimensions', e.target.value)}
                placeholder={!equipmentData.dimensions ? 'не визначено' : '2280 x 950 x 1250'}
              />
            </div>

            <div className="form-group">
              <label>Вага (кг)</label>
              <input
                type="text"
                className={equipmentData.weight === null || equipmentData.weight === undefined ? 'undefined-field' : ''}
                value={equipmentData.weight !== null && equipmentData.weight !== undefined ? String(equipmentData.weight) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handleInputChange('weight', val === '' ? null : (isNaN(parseInt(val)) ? null : parseInt(val)));
                }}
                placeholder={equipmentData.weight === null || equipmentData.weight === undefined ? 'не визначено' : '940'}
              />
            </div>

            <div className="form-group">
              <label>Дата виробництва</label>
              <input
                type="text"
                className={!equipmentData.manufactureDate ? 'undefined-field' : ''}
                value={equipmentData.manufactureDate || ''}
                onChange={(e) => handleInputChange('manufactureDate', e.target.value)}
                placeholder={!equipmentData.manufactureDate ? 'не визначено' : '2024'}
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

