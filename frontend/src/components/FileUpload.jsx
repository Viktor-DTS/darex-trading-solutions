import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import './FileUpload.css';

const FileUpload = ({ taskId, onFilesUploaded, readOnly = false }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [description, setDescription] = useState('');
  const [descriptionAuto, setDescriptionAuto] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingAllFiles, setSavingAllFiles] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Завантаження існуючих файлів
  useEffect(() => {
    if (taskId) {
      loadFiles();
    } else {
      setLoading(false);
    }
  }, [taskId]);

  const getDefaultDescriptionForFiles = (files) => {
    if (!files || files.length === 0) return '';
    if (files.length === 1) return files[0].name || '';
    const first = files[0].name || '';
    return `${first} (+${files.length - 1})`;
  };

  const handleFileSelect = (event) => {
    if (readOnly) return;
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
    // За замовчуванням опис = назва файлу (для всіх вибраних файлів)
    setDescriptionAuto(true);
    setDescription(getDefaultDescriptionForFiles(files));
    setError('');
  };

  const handleUpload = async () => {
    if (readOnly) return;
    if (selectedFiles.length === 0) {
      setError('Виберіть файли для завантаження');
      return;
    }

    if (!taskId) {
      setError('Спочатку збережіть заявку');
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

      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/files/upload/${taskId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        // Очищаємо форму
        setSelectedFiles([]);
        setDescription('');
        setDescriptionAuto(true);
        // Перезавантажуємо список файлів
        await loadFiles();
        // Повідомляємо батьківський компонент
        if (onFilesUploaded) {
          onFilesUploaded(result.files);
        }
      } else {
        // Перевіряємо, чи відповідь є JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            setError(errorData.error || errorData.details || 'Помилка завантаження файлів');
          } catch (jsonError) {
            setError(`Помилка завантаження файлів (${response.status})`);
          }
        } else {
          // Якщо сервер повернув HTML замість JSON
          const errorText = await response.text();
          console.error('Помилка сервера (HTML):', errorText.substring(0, 200));
          setError(`Помилка завантаження файлів (${response.status}). Перевірте формат файлу та його розмір.`);
        }
      }
    } catch (error) {
      console.error('Помилка завантаження:', error);
      setError(error.message || 'Помилка завантаження файлів. Перевірте підключення до сервера.');
    } finally {
      setUploading(false);
    }
  };

  const handleViewFile = (file, event) => {
    event.preventDefault();
    event.stopPropagation();
    
    const isImage = file.mimetype && file.mimetype.startsWith('image/');
    
    if (isImage) {
      // Відкриваємо зображення в новому вікні з галереєю
      const imageFiles = uploadedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
      const imageIndex = imageFiles.findIndex(f => getFileId(f) === getFileId(file));
      openGalleryInNewWindow(imageFiles, imageIndex >= 0 ? imageIndex : 0);
    } else {
      // Для не-зображень: PDF відкриваємо напряму, Excel/Word — скачуємо
      const url = file.cloudinaryUrl;
      const originalName = file.originalName || '';
      const ext = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : '';

      const mimetype = file.mimetype || '';
      const isPdf = mimetype.includes('pdf') || ext === 'pdf';
      const isOfficeDoc =
        mimetype.includes('spreadsheet') ||
        mimetype.includes('excel') ||
        mimetype.includes('word') ||
        mimetype.includes('document') ||
        ['xls', 'xlsx', 'doc', 'docx'].includes(ext);

      if (isPdf) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      if (isOfficeDoc) {
        // Для Excel/Word просто скачуємо — користувач відкриє файл сам
        const link = document.createElement('a');
        link.href = url;
        link.download = originalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // fallback для інших типів
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const openGalleryInNewWindow = (files, startIndex = 0) => {
    const imageFiles = files.filter(f => f.mimetype && f.mimetype.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const galleryWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!galleryWindow) return;

    const imagesData = imageFiles.map(f => ({
      url: f.cloudinaryUrl,
      name: f.originalName,
      description: f.description || ''
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

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цей файл?')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        await loadFiles();
      } else {
        setError('Помилка видалення файлу');
      }
    } catch (error) {
      console.error('Помилка видалення файлу:', error);
      setError('Помилка видалення файлу');
    }
  };

  // Зберегти всі файли заявки в обрану папку
  const handleSaveAllFiles = async () => {
    if (uploadedFiles.length === 0) {
      setError('Немає файлів для збереження');
      return;
    }
    setSavingAllFiles(true);
    setError('');
    try {
      // Підтримка File System Access API (Chrome, Edge)
      if ('showDirectoryPicker' in window) {
        const dirHandle = await window.showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'documents'
        });
        const usedNames = new Map();
        for (const file of uploadedFiles) {
          const originalName = file.originalName || 'file';
          let fileName = originalName;
          const count = (usedNames.get(fileName) || 0) + 1;
          usedNames.set(fileName, count);
          if (count > 1) {
            const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
            const base = ext ? fileName.slice(0, -ext.length - 1) : fileName;
            fileName = ext ? `${base}_${count}.${ext}` : `${base}_${count}`;
          }
          const response = await fetch(file.cloudinaryUrl);
          const blob = await response.blob();
          const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        }
        alert(`✅ Збережено ${uploadedFiles.length} файлів`);
      } else {
        // Fallback: послідовне завантаження кожного файлу
        for (const file of uploadedFiles) {
          const link = document.createElement('a');
          link.href = file.cloudinaryUrl;
          link.download = file.originalName || 'file';
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          await new Promise(r => setTimeout(r, 300));
        }
        alert(`Завантаження ${uploadedFiles.length} файлів розпочато. Перевірте папку «Завантаження».`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Помилка збереження файлів:', err);
        setError('Помилка збереження файлів');
        alert('❌ Помилка збереження файлів. Спробуйте ще раз.');
      }
    } finally {
      setSavingAllFiles(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileId = (file) => file?.id || file?._id || file?.cloudinaryId || '';

  const getFileIcon = (mimetype) => {
    if (!mimetype) return '📎';
    if (mimetype.startsWith('image/')) return '🖼️';
    if (mimetype.includes('pdf')) return '📄';
    if (mimetype.includes('word') || mimetype.includes('document')) return '📝';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return '📊';
    if (mimetype.includes('text')) return '📄';
    return '📎';
  };

  const loadFiles = async () => {
    if (!taskId) {
      setUploadedFiles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/files/task/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const files = await response.json();
        // Нормалізуємо поля під фронтенд (бекенд може повертати _id)
        const normalized = (Array.isArray(files) ? files : []).map((f) => ({
          ...f,
          id: f?.id || f?._id || f?.cloudinaryId
        }));
        setUploadedFiles(normalized);
      } else {
        console.error('Помилка завантаження файлів');
      }
    } catch (error) {
      console.error('Помилка завантаження файлів:', error);
    } finally {
      setLoading(false);
    }
  };

  const imageCount = uploadedFiles.filter(f => f.mimetype && f.mimetype.startsWith('image/')).length;

  return (
    <div className="file-upload-container">
      <h3>📁 Файли виконаних робіт</h3>
      
      {!readOnly && (
        <div className="upload-section">
          <h4>📤 Завантажити нові файли</h4>
          
          <div className="file-input-container">
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              className="file-input"
              id="file-upload-input"
            />
            <label htmlFor="file-upload-input" className="file-input-label">
              {selectedFiles.length > 0 
                ? `Вибрано ${selectedFiles.length} файлів`
                : '📂 Вибрати файли'
              }
            </label>
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
              onChange={(e) => {
                setDescription(e.target.value);
                setDescriptionAuto(false);
              }}
              placeholder="Введіть опис файлу (необов'язково)"
              className="description-field"
            />
          </div>
          
          <button
            onClick={handleUpload}
            disabled={uploading || selectedFiles.length === 0 || !taskId}
            className="upload-button"
          >
            {uploading ? '⏳ Завантаження...' : '📤 Завантажити файли'}
          </button>
          
          {!taskId && (
            <div className="warning-message">
              ⚠️ Щоб завантажити файли, спочатку збережіть заявку
            </div>
          )}
          
          {error && <div className="error-message">❌ {error}</div>}
        </div>
      )}
      
      {/* Завантажені файли */}
      <div className="uploaded-files-section">
        <div className="files-section-header">
          <h4>📋 Завантажені файли</h4>
          <div className="files-section-buttons">
            {uploadedFiles.length > 0 && (
              <button
                type="button"
                className="save-all-files-button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveAllFiles();
                }}
                disabled={savingAllFiles}
                title="Зберегти всі файли в обрану папку"
              >
                {savingAllFiles ? '⏳ Збереження...' : '💾 Зберегти всі файли'}
              </button>
            )}
            {imageCount > 0 && (
              <button
                type="button"
                className="gallery-button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openGalleryInNewWindow(uploadedFiles, 0);
                }}
                title="Відкрити галерею зображень"
              >
                🖼️ Галерея ({imageCount})
              </button>
            )}
          </div>
        </div>
        
        {loading ? (
          <div className="loading">⏳ Завантаження файлів...</div>
        ) : uploadedFiles.length === 0 ? (
          <div className="no-files">📭 Файлів ще немає</div>
        ) : (
          <div className="files-list">
            {uploadedFiles.map((file) => (
              <div key={getFileId(file)} className="file-item">
                <div
                  className="file-description-top"
                  title={file.description || 'Опис відсутній'}
                >
                  📝 <b>Опис:</b> {file.description ? file.description : '—'}
                </div>

                <div className="file-main-row">
                  <div className="file-info">
                    <span className="file-icon">{getFileIcon(file.mimetype)}</span>
                    <div className="file-details">
                      <div className="file-name">
                        <a 
                          href={file.cloudinaryUrl} 
                          className="file-link"
                          onClick={(e) => handleViewFile(file, e)}
                        >
                          {file.originalName}
                        </a>
                      </div>
                      {/* meta removed by request */}
                    </div>
                  </div>

                  <div className="file-actions">
                  <button
                    type="button"
                    onClick={(e) => handleViewFile(file, e)}
                    className="view-button"
                    title="Переглянути файл"
                  >
                    👁️
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const link = document.createElement('a');
                      link.href = file.cloudinaryUrl;
                      link.download = file.originalName;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="download-button"
                    title="Завантажити файл"
                  >
                    ⬇️
                  </button>
                  {file.mimetype && file.mimetype.startsWith('image/') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const printWindow = window.open('', '_blank');
                        printWindow.document.write(`
                          <html>
                            <head>
                              <title>Друк - ${file.originalName}</title>
                              <style>
                                body { margin: 0; padding: 20px; text-align: center; }
                                img { max-width: 100%; max-height: 100vh; }
                              </style>
                            </head>
                            <body>
                              <img src="${file.cloudinaryUrl}" alt="${file.originalName}" />
                            </body>
                          </html>
                        `);
                        printWindow.document.close();
                        printWindow.print();
                      }}
                      className="print-button"
                      title="Друк"
                    >
                      🖨️
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteFile(getFileId(file));
                    }}
                    className="delete-button"
                    title="Видалити файл"
                  >
                    🗑️
                  </button>
                  </div>
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
