import React, { useState } from 'react';

function DocumentUploadModal({
  isOpen,
  onClose,
  task,
  onInvoiceUpload = () => {},
  onActUpload = () => {},
  onInvoiceDelete = () => {},
  onActDelete = () => {},
  uploadingFiles = new Set()
}) {
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [actFile, setActFile] = useState(null);

  if (!isOpen || !task) return null;
  
  // Всі функції тепер мають значення за замовчуванням, тому перевірки не потрібні

  const handleInvoiceFileChange = async (e) => {
    const file = e.target.files[0];
    console.log('DEBUG DocumentUploadModal: Файл рахунку вибрано:', { 
      fileName: file?.name, 
      fileSize: file?.size, 
      fileType: file?.type, 
      taskId: task?.id,
      invoiceRequestId: task?.invoiceRequestId,
      requestNumber: task?.requestNumber
    });
    
    if (file) {
      // Валідація розміру файлу (10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Файл занадто великий. Максимальний розмір: 10MB');
        return;
      }

      // Валідація типу файлу
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        alert('Непідтримуваний тип файлу. Дозволені тільки PDF, JPEG, PNG');
        return;
      }

      setInvoiceFile(file);
      
      // Генеруємо номер рахунку: дата завантаження + назва файлу
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const fileName = file.name.replace(/\.[^/.]+$/, ""); // Без розширення
      const generatedInvoiceNumber = `${currentDate}_${fileName}`;
      
      console.log('DEBUG DocumentUploadModal: Згенеровано номер рахунку:', generatedInvoiceNumber);
      console.log('DEBUG DocumentUploadModal: Викликаємо onInvoiceUpload з параметрами:', { taskId: task.id, invoiceRequestId: task.invoiceRequestId, fileName: file.name });
      alert(`📄 Номер рахунку буде автоматично встановлений: ${generatedInvoiceNumber}`);
      
      // Передаємо invoiceRequestId замість task.id
      const requestId = task.invoiceRequestId || task.id;
      console.log('DEBUG DocumentUploadModal: Використовуємо requestId:', requestId);
      onInvoiceUpload(requestId, file);
    }
  };

  const handleActFileChange = (e) => {
    const file = e.target.files[0];
    console.log('DEBUG DocumentUploadModal: Файл акту вибрано:', { 
      fileName: file?.name, 
      fileSize: file?.size, 
      fileType: file?.type, 
      taskId: task?.id,
      invoiceRequestId: task?.invoiceRequestId,
      requestNumber: task?.requestNumber
    });
    
    if (file) {
      // Валідація розміру файлу (10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Файл занадто великий. Максимальний розмір: 10MB');
        return;
      }

      // Валідація типу файлу
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        alert('Непідтримуваний тип файлу. Дозволені тільки PDF, JPEG, PNG');
        return;
      }

      setActFile(file);
      
      // Передаємо invoiceRequestId замість task.id
      const requestId = task.invoiceRequestId || task.id;
      console.log('DEBUG DocumentUploadModal: Використовуємо requestId для акту:', requestId);
      onActUpload(requestId, file);
    }
  };

  const requestId = task.invoiceRequestId || task.id;
  const isUploading = uploadingFiles.has(requestId);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        backgroundColor: '#22334a',
        padding: '30px',
        borderRadius: '10px',
        width: '90%',
        maxWidth: '700px',
        boxShadow: '0 5px 15px rgba(0, 0, 0, 0.3)',
        color: '#fff',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '25px', textAlign: 'center', color: '#00bfff' }}>
          Завантаження документів для заявки №{task.requestNumber}
        </h3>

        {/* Секція для рахунку */}
        <div style={{ marginBottom: '25px', padding: '20px', backgroundColor: '#1a2636', borderRadius: '8px', border: '1px solid #00bfff' }}>
          <h4 style={{ marginTop: 0, marginBottom: '15px', color: '#00bfff' }}>📄 Файл рахунку:</h4>
          {task.invoiceFile ? (
            <>
              <p style={{ marginBottom: '15px' }}>
                <strong style={{ color: '#fff' }}>Завантажений файл:</strong>{' '}
                <a
                  href={task.invoiceFile}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#00bfff', textDecoration: 'underline' }}
                >
                  {task.invoiceFileName || 'Переглянути файл'}
                </a>
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => window.open(task.invoiceFile, '_blank')}
                  style={{
                    padding: '8px 15px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Переглянути
                </button>
                <button
                  onClick={() => {
                    const requestId = task.invoiceRequestId || task.id;
                    console.log('DEBUG DocumentUploadModal: Видаляємо файл рахунку з requestId:', requestId);
                    onInvoiceDelete(requestId);
                  }}
                  style={{
                    padding: '8px 15px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  🗑️ Видалити
                </button>
              </div>
            </>
          ) : (
            <div style={{ marginTop: '10px' }}>
              {isUploading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '3px solid #f3f3f3',
                    borderTop: '3px solid #00bfff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}></div>
                  <span style={{ color: '#ccc', fontSize: '14px' }}>Завантаження файлу рахунку...</span>
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleInvoiceFileChange}
                    style={{ marginRight: '10px', color: '#fff' }}
                  />
                  <span style={{ color: '#ccc', fontSize: '14px' }}>Завантажте файл рахунку</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Секція для акту виконаних робіт */}
        <div style={{ marginBottom: '25px', padding: '20px', backgroundColor: '#1a2636', borderRadius: '8px', border: '1px solid #00bfff' }}>
          <h4 style={{ marginTop: 0, marginBottom: '15px', color: '#00bfff' }}>📋 Файл акту виконаних робіт:</h4>
          {task.actFile ? (
            <>
              <p style={{ marginBottom: '15px' }}>
                <strong style={{ color: '#fff' }}>Завантажений файл:</strong>{' '}
                <a
                  href={task.actFile}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#00bfff', textDecoration: 'underline' }}
                >
                  {task.actFileName || 'Переглянути файл'}
                </a>
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => window.open(task.actFile, '_blank')}
                  style={{
                    padding: '8px 15px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Переглянути
                </button>
                <button
                  onClick={() => {
                    const requestId = task.invoiceRequestId || task.id;
                    console.log('DEBUG DocumentUploadModal: Видаляємо файл акту з requestId:', requestId);
                    onActDelete(requestId);
                  }}
                  style={{
                    padding: '8px 15px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  🗑️ Видалити
                </button>
              </div>
            </>
          ) : (
            <div style={{ marginTop: '10px' }}>
              {isUploading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '3px solid #f3f3f3',
                    borderTop: '3px solid #00bfff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}></div>
                  <span style={{ color: '#ccc', fontSize: '14px' }}>Завантаження файлу акту...</span>
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleActFileChange}
                    style={{ marginRight: '10px', color: '#fff' }}
                  />
                  <span style={{ color: '#ccc', fontSize: '14px' }}>Завантажте файл акту виконаних робіт</span>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '30px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 25px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
}

export default DocumentUploadModal;
