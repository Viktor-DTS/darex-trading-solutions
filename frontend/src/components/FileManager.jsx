import React, { useState, useEffect } from 'react';
import { filesAPI } from '../utils/filesAPI';

export default function FileManager({ taskId, onFilesChange }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [description, setDescription] = useState('');

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
    const filesArr = Array.from(event.target.files);
    // Фільтруємо по типу і розміру
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const filtered = filesArr.filter(file => {
      if (!allowedTypes.includes(file.type)) {
        alert(`Файл ${file.name} має непідтримуваний тип. Дозволені тільки PDF, JPEG, JPG, PNG.`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`Файл ${file.name} занадто великий. Максимум 10MB.`);
        return false;
      }
      return true;
    });
    setSelectedFiles(filtered);
  };

  const handleUpload = async () => {
    if (!selectedFiles.length || !taskId) return;
    setUploading(true);
    try {
      for (const file of selectedFiles) {
        await filesAPI.uploadFile(taskId, file, description);
      }
      setSelectedFiles([]);
      setDescription('');
      document.getElementById('file-input').value = '';
      await loadFiles();
      alert('Файли успішно завантажено!');
    } catch (error) {
      console.error('Помилка завантаження файлів:', error);
      alert('Помилка завантаження файлів: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цей файл?')) return;
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
    <div style={{ marginTop: 16, padding: 16, background: '#1a2636', borderRadius: 8 }}>
      <h3 style={{ marginTop: 0, marginBottom: 16, color: '#fff' }}>Файли виконаних робіт</h3>
      {/* Форма завантаження */}
      <div style={{ marginBottom: 16, padding: 16, background: 'transparent', borderRadius: 8 }}>
        <h4 style={{ marginTop: 0, marginBottom: 12, color: '#fff' }}>Завантажити нові файли</h4>
        <div style={{ marginBottom: 12 }}>
          <input
            id="file-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            onChange={handleFileSelect}
            style={{ marginBottom: 8, color: '#fff', background: '#22334a', border: '1px solid #444', borderRadius: 4, padding: 8 }}
          />
          {selectedFiles.length > 0 && (
            <div style={{ fontSize: 14, color: '#fff' }}>
              Вибрано: {selectedFiles.map(f => f.name).join(', ')}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, color: '#fff' }}>
            Опис файлу (для всіх):
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Введіть опис файлу (необов'язково)"
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #444', background: '#22334a', color: '#fff' }}
          />
        </div>
        <button
          onClick={handleUpload}
          disabled={!selectedFiles.length || uploading}
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
          {uploading ? 'Завантаження...' : 'Завантажити файли'}
        </button>
      </div>
      {/* Список файлів */}
      <div>
        <h4 style={{ marginTop: 0, marginBottom: 12, color: '#fff' }}>Завантажені файли</h4>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#fff' }}>
            Завантаження файлів...
          </div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#fff' }}>
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
                  background: '#22334a',
                  borderRadius: 6,
                  border: '1px solid #444'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <span style={{ fontSize: 20 }}>{getFileIcon(file.mimetype)}</span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{file.originalName}</div>
                    {file.description && (
                      <div style={{ fontSize: 14, color: '#b6b6b6' }}>{file.description}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#aaa' }}>
                      {formatFileSize(file.size)} • {new Date(file.uploadDate).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={filesAPI.getFileViewUrl(file._id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: '#4CAF50',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 12,
                      textDecoration: 'none',
                      display: 'inline-block',
                      textAlign: 'center'
                    }}
                    title="Переглянути"
                  >
                    👁️
                  </a>
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