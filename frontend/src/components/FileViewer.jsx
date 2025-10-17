import React, { useState, useEffect } from 'react';

const FileViewer = ({ fileUrl, fileName, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileType, setFileType] = useState('');

  useEffect(() => {
    if (fileUrl) {
      setLoading(true);
      setError(null);
      
      // Визначаємо тип файлу
      const extension = fileName ? fileName.split('.').pop().toLowerCase() : '';
      if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
        setFileType('image');
      } else if (extension === 'pdf') {
        setFileType('pdf');
      } else {
        setFileType('other');
      }
      
      setLoading(false);
    }
  }, [fileUrl, fileName]);

  const handleDownload = async () => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Помилка завантаження файлу:', error);
      alert('Помилка завантаження файлу');
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    
    if (fileType === 'image') {
      printWindow.document.write(`
        <html>
          <head>
            <title>Друк - ${fileName}</title>
            <style>
              body { 
                margin: 0; 
                padding: 20px; 
                text-align: center; 
                font-family: Arial, sans-serif;
              }
              img { 
                max-width: 100%; 
                max-height: 100vh; 
                object-fit: contain;
              }
              .filename {
                margin-bottom: 20px;
                font-size: 18px;
                font-weight: bold;
              }
              @media print {
                body { padding: 0; }
                .filename { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="filename">${fileName}</div>
            <img src="${fileUrl}" alt="${fileName}" onload="window.print()" />
          </body>
        </html>
      `);
    } else if (fileType === 'pdf') {
      printWindow.document.write(`
        <html>
          <head>
            <title>Друк - ${fileName}</title>
            <style>
              body { 
                margin: 0; 
                padding: 0; 
                font-family: Arial, sans-serif;
              }
              iframe { 
                width: 100vw; 
                height: 100vh; 
                border: none;
              }
            </style>
          </head>
          <body>
            <iframe src="${fileUrl}" onload="window.print()"></iframe>
          </body>
        </html>
      `);
    } else {
      printWindow.document.write(`
        <html>
          <head>
            <title>Друк - ${fileName}</title>
            <style>
              body { 
                margin: 0; 
                padding: 20px; 
                font-family: Arial, sans-serif;
              }
              .filename {
                margin-bottom: 20px;
                font-size: 18px;
                font-weight: bold;
              }
              .content {
                white-space: pre-wrap;
                word-wrap: break-word;
              }
            </style>
          </head>
          <body>
            <div class="filename">${fileName}</div>
            <div class="content">Файл не підтримує друк. Використайте кнопку завантаження.</div>
          </body>
        </html>
      `);
    }
    
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}>
        <div style={{
          color: 'white',
          fontSize: '18px',
          textAlign: 'center'
        }}>
          Завантаження файлу...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}>
        <div style={{
          color: 'white',
          fontSize: '18px',
          textAlign: 'center',
          padding: '20px',
          backgroundColor: 'rgba(220, 53, 69, 0.9)',
          borderRadius: '8px'
        }}>
          <div>Помилка завантаження файлу</div>
          <button 
            onClick={onClose}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Закрити
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 9999
    }}>
      {/* Заголовок з кнопками */}
      <div style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: 'white'
      }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
          {fileName}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleDownload}
            style={{
              padding: '8px 16px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            💾 Зберегти
          </button>
          <button
            onClick={handlePrint}
            style={{
              padding: '8px 16px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🖨️ Друк
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ✕ Закрити
          </button>
        </div>
      </div>

      {/* Контент файлу */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        overflow: 'auto'
      }}>
        {fileType === 'image' ? (
          <img
            src={fileUrl}
            alt={fileName}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
          />
        ) : fileType === 'pdf' ? (
          <iframe
            src={fileUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none'
            }}
            title={fileName}
          />
        ) : (
          <div style={{
            color: 'white',
            textAlign: 'center',
            fontSize: '18px'
          }}>
            <div>Тип файлу не підтримується для перегляду</div>
            <div style={{ marginTop: '10px', fontSize: '14px' }}>
              Використайте кнопку "Зберегти" для завантаження файлу
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileViewer;
