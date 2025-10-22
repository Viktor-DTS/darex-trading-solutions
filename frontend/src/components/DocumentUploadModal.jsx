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
  const [selectedInvoiceFile, setSelectedInvoiceFile] = useState(null);
  const [selectedActFile, setSelectedActFile] = useState(null);

  if (!isOpen || !task) return null;
  
  // Логування для діагностики
  console.log('DEBUG DocumentUploadModal: Модальне вікно відкрито з даними завдання:', {
    isOpen,
    task: task ? {
      id: task.id,
      _id: task._id,
      invoiceRequestId: task.invoiceRequestId,
      requestNumber: task.requestNumber,
      needInvoice: task.needInvoice,
      needAct: task.needAct,
      invoiceFile: task.invoiceFile,
      actFile: task.actFile,
      invoiceFileName: task.invoiceFileName,
      actFileName: task.actFileName
    } : null,
    uploadingFiles: Array.from(uploadingFiles)
  });
  
  // Додаткове детальне логування
  if (task) {
    console.log('DEBUG DocumentUploadModal: Повні дані завдання:', task);
    console.log('DEBUG DocumentUploadModal: requestId для завантаження:', task.invoiceRequestId || task.id);
    console.log('DEBUG DocumentUploadModal: needInvoice:', task.needInvoice);
    console.log('DEBUG DocumentUploadModal: needAct:', task.needAct);
  }
  
  // Всі функції тепер мають значення за замовчуванням, тому перевірки не потрібні

  const handleInvoiceFileChange = (e) => {
    console.log('🚀 DEBUG DocumentUploadModal: handleInvoiceFileChange викликано, event:', e);
    console.log('🚀 DEBUG DocumentUploadModal: e.target.files:', e.target.files);
    console.log('🚀 DEBUG DocumentUploadModal: e.target.files.length:', e.target.files?.length);
    
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

      // Тільки зберігаємо файл, не завантажуємо одразу
      setSelectedInvoiceFile(file);
      console.log('DEBUG DocumentUploadModal: Файл рахунку вибрано, чекаємо на збереження');
    }
  };

  const handleActFileChange = (e) => {
    console.log('DEBUG DocumentUploadModal: handleActFileChange викликано, event:', e);
    console.log('DEBUG DocumentUploadModal: e.target.files:', e.target.files);
    console.log('DEBUG DocumentUploadModal: e.target.files.length:', e.target.files?.length);
    
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

      // Тільки зберігаємо файл, не завантажуємо одразу
      setSelectedActFile(file);
      console.log('DEBUG DocumentUploadModal: Файл акту вибрано, чекаємо на збереження');
    }
  };

  const requestId = task.invoiceRequestId || task.id;
  const isUploading = uploadingFiles.has(requestId);
  
  // Функція збереження файлів
  const handleSave = async () => {
    try {
      if (selectedInvoiceFile) {
        console.log('💾 DEBUG DocumentUploadModal: Зберігаємо файл рахунку:', selectedInvoiceFile.name);
        onInvoiceUpload(requestId, selectedInvoiceFile);
      }
      
      if (selectedActFile) {
        console.log('💾 DEBUG DocumentUploadModal: Зберігаємо файл акту:', selectedActFile.name);
        onActUpload(requestId, selectedActFile);
      }
      
      // Очищаємо вибрані файли
      setSelectedInvoiceFile(null);
      setSelectedActFile(null);
      
      // Закриваємо модальне вікно
      onClose();
    } catch (error) {
      console.error('Помилка збереження файлів:', error);
      alert('Помилка збереження файлів: ' + error.message);
    }
  };
  
  // Діагностика isUploading
  console.log('🔍 DEBUG DocumentUploadModal: isUploading діагностика:', {
    requestId,
    uploadingFiles: Array.from(uploadingFiles),
    isUploading,
    hasRequestId: uploadingFiles.has(requestId)
  });

  // Логування при рендерингу
  console.log('🔍 DEBUG DocumentUploadModal: Рендеринг компонента, isOpen:', isOpen);
  console.log('🔍 DEBUG DocumentUploadModal: task:', task);
  console.log('🔍 DEBUG DocumentUploadModal: onInvoiceUpload:', typeof onInvoiceUpload);
  console.log('🔍 DEBUG DocumentUploadModal: onActUpload:', typeof onActUpload);

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

        {/* Секція для рахунку - показуємо завжди */}
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
              {(() => {
                console.log('🔍 DEBUG DocumentUploadModal: Перевіряємо isUploading для рахунку:', isUploading);
                return isUploading;
              })() ? (
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
                  {selectedInvoiceFile ? (
                    <div style={{ marginBottom: '10px' }}>
                      <p style={{ color: '#00bfff', marginBottom: '10px' }}>
                        📄 Вибрано файл: {selectedInvoiceFile.name}
                      </p>
                      <button
                        onClick={() => setSelectedInvoiceFile(null)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Скасувати
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleInvoiceFileChange}
                        style={{ marginRight: '10px', color: '#fff' }}
                      />
                      <span style={{ color: '#ccc', fontSize: '14px' }}>Виберіть файл рахунку</span>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Секція для акту виконаних робіт - показуємо завжди */}
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
              {(() => {
                console.log('🔍 DEBUG DocumentUploadModal: Перевіряємо isUploading для акту:', isUploading);
                return isUploading;
              })() ? (
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
                  {selectedActFile ? (
                    <div style={{ marginBottom: '10px' }}>
                      <p style={{ color: '#00bfff', marginBottom: '10px' }}>
                        📋 Вибрано файл: {selectedActFile.name}
                      </p>
                      <button
                        onClick={() => setSelectedActFile(null)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Скасувати
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleActFileChange}
                        style={{ marginRight: '10px', color: '#fff' }}
                      />
                      <span style={{ color: '#ccc', fontSize: '14px' }}>Виберіть файл акту виконаних робіт</span>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '30px' }}>
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
            Скасувати
          </button>
          
          {(selectedInvoiceFile || selectedActFile) && (
            <button
              onClick={handleSave}
              style={{
                padding: '10px 25px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '16px',
              }}
            >
              💾 Зберегти файли
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentUploadModal;
