import React, { useState, useEffect } from 'react';
import { processFileForUpload } from '../utils/pdfConverter';
import './FileUpload.css';
const FileUpload = ({ taskId, onFilesUploaded }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const API_URL = process.env.REACT_APP_API_URL || 'https://darex-trading-solutions.onrender.com';
  // Завантаження існуючих файлів
  useEffect(() => {
    if (taskId) {
      loadFiles();
    }
  }, [taskId]);
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
      // Конвертуємо PDF файли в JPG якщо потрібно
      const processedFiles = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        try {
          const { file: processedFile, ocrData } = await processFileForUpload(selectedFiles[i]);
          console.log('DEBUG FileUpload PDF Converter: Оброблений файл:', processedFile.name, processedFile.type);
          console.log('DEBUG FileUpload PDF Converter: OCR дані:', ocrData);
          processedFiles.push(processedFile);
        } catch (error) {
          console.error('DEBUG FileUpload PDF Converter: Помилка обробки файлу:', error);
          processedFiles.push(selectedFiles[i]); // Використовуємо оригінальний файл якщо обробка не вдалася
        }
      }
      
      const formData = new FormData();
      processedFiles.forEach(file => {
        formData.append('files', file);
      });
      formData.append('description', description);
      const response = await fetch(`${API_URL}/api/files/upload/${taskId}`, {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        const result = await response.json();
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
  return (
    <div className="file-upload-container">
      <h3>Файли виконаних робіт</h3>
      {/* Завантаження нових файлів */}
      <div className="upload-section">
        <h4>Завантажити нові файли</h4>
        <div className="upload-methods">
          {/* Вибрати файли */}
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