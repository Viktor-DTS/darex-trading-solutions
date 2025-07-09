import React, { useState, useEffect } from 'react';
import { filesAPI } from '../utils/filesAPI';

export default function FileManager({ taskId, onFilesChange }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [description, setDescription] = useState('');

  // Завантаження файлів при зміні taskId
  useEffect(() => {
    if (taskId) {
      loadFiles();
    }
  }, [taskId]);

  const loadFiles = async () => {
    if (!taskId) return;
    
    setLoading(true);
    try {
      const filesData = await filesAPI.getTaskFiles(taskId);
      setFiles(filesData);
      if (onFilesChange) {
        onFilesChange(filesData);
      }
    } catch (error) {
      console.error('Помилка завантаження файлів:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Перевіряємо тип файлу
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        alert('Непідтримуваний тип файлу. Дозволені тільки PDF, JPEG, JPG та PNG.');
        event.target.value = '';
        return;
      }
      
      // Перевіряємо розмір файлу (10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Файл занадто великий. Максимальний розмір: 10MB.');
        event.target.value = '';
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !taskId) return;

    setUploading(true);
    try {
      await filesAPI.uploadFile(taskId, selectedFile, description);
      
      // Очищаємо форму
      setSelectedFile(null);
      setDescription('');
      document.getElementById('file-input').value = '';
      
      // Перезавантажуємо список файлів
      await loadFiles();
      
      alert('Файл успішно завантажено!');
    } catch (error) {
      console.error('Помилка завантаження файлу:', error);
      alert('Помилка завантаження файлу: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId) => {
    if (!confirm('Ви впевнені, що хочете видалити цей файл?')) return;

    try {
      await filesAPI.deleteFile(fileId);
      await loadFiles();
      alert('Файл успішно видалено!');
    } catch (error) {
      console.error('Помилка видалення файлу:', error);
      alert('Помилка видалення файлу: ' + error.message);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimetype) => {
    if (mimetype === 'application/pdf') return '📄';
    if (mimetype.startsWith('image/')) return '🖼️';
    return '📎';
  };

  return (
    <div style={{ marginTop: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>Файли виконаних робіт</h3>
      
      {/* Форма завантаження */}
      <div style={{ marginBottom: 16, padding: 16, background: '#fff', borderRadius: 8 }}>
        <h4 style={{ marginTop: 0, marginBottom: 12 }}>Завантажити новий файл</h4>
        
        <div style={{ marginBottom: 12 }}>
          <input
            id="file-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFileSelect}
            style={{ marginBottom: 8 }}
          />
          {selectedFile && (
            <div style={{ fontSize: 14, color: '#666' }}>
              Вибрано: {selectedFile.name} ({formatFileSize(selectedFile.size)})
            </div>
          )}
        </div>
        
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
            Опис файлу:
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Введіть опис файлу (необов'язково)"
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
          />
        </div>
        
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          style={{
            background: uploading ? '#ccc' : '#00bfff',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '8px 16px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontWeight: 600
          }}
        >
          {uploading ? 'Завантаження...' : 'Завантажити файл'}
        </button>
      </div>

      {/* Список файлів */}
      <div>
        <h4 style={{ marginTop: 0, marginBottom: 12 }}>Завантажені файли</h4>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
            Завантаження файлів...
          </div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
            Файлів ще немає
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map((file) => (
              <div
                key={file._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  background: '#fff',
                  borderRadius: 6,
                  border: '1px solid #ddd'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <span style={{ fontSize: 20 }}>{getFileIcon(file.mimetype)}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{file.originalName}</div>
                    {file.description && (
                      <div style={{ fontSize: 14, color: '#666' }}>{file.description}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {formatFileSize(file.size)} • {new Date(file.uploadDate).toLocaleString()}
                    </div>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => filesAPI.viewFile(file._id)}
                    style={{
                      background: '#4CAF50',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                    title="Переглянути"
                  >
                    👁️
                  </button>
                  
                  <button
                    onClick={() => filesAPI.downloadFile(file._id, file.originalName)}
                    style={{
                      background: '#2196F3',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                    title="Завантажити"
                  >
                    ⬇️
                  </button>
                  
                  <button
                    onClick={() => handleDelete(file._id)}
                    style={{
                      background: '#f44336',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 12
                    }}
                    title="Видалити"
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
} 