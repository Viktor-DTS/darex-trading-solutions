import React, { useState } from 'react';

function NewDocumentUploadModal({
  isOpen,
  onClose,
  task,
  onInvoiceUpload = () => {},
  onActUpload = () => {},
  onInvoiceDelete = () => {},
  onActDelete = () => {},
  uploadingFiles = new Set()
}) {
  const [selectedInvoiceFile, setSelectedInvoiceFile] = useState(null);
  const [selectedActFile, setSelectedActFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  if (!isOpen || !task) return null;
  
  console.log('🔄 NEW DocumentUploadModal: Модальне вікно відкрито', {
    isOpen,
    task: task ? {
      id: task.id,
      _id: task._id,
      invoiceRequestId: task.invoiceRequestId,
      requestNumber: task.requestNumber,
      needInvoice: task.needInvoice,
      needAct: task.needAct,
      invoiceFile: task.invoiceFile,
      actFile: task.actFile
    } : null
  });

  const handleInvoiceFileChange = (e) => {
    const file = e.target.files[0];
    console.log('🔄 NEW DocumentUploadModal: Файл рахунку вибрано:', file?.name);
    
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

      setSelectedInvoiceFile(file);
      console.log('🔄 NEW DocumentUploadModal: Файл рахунку збережено для завантаження');
    }
  };

  const handleActFileChange = (e) => {
    const file = e.target.files[0];
    console.log('🔄 NEW DocumentUploadModal: Файл акту вибрано:', file?.name);
    
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

      setSelectedActFile(file);
      console.log('🔄 NEW DocumentUploadModal: Файл акту збережено для завантаження');
    }
  };

  const handleSave = async () => {
    if (!selectedInvoiceFile && !selectedActFile) {
      alert('Виберіть хоча б один файл для завантаження');
      return;
    }

    setIsUploading(true);
    console.log('🔄 NEW DocumentUploadModal: Початок завантаження файлів');

    try {
      const requestId = task.invoiceRequestId || task.id;
      
      if (selectedInvoiceFile) {
        console.log('🔄 NEW DocumentUploadModal: Завантажуємо файл рахунку:', selectedInvoiceFile.name);
        await onInvoiceUpload(requestId, selectedInvoiceFile);
      }

      if (selectedActFile) {
        console.log('🔄 NEW DocumentUploadModal: Завантажуємо файл акту:', selectedActFile.name);
        await onActUpload(requestId, selectedActFile);
      }

      // Очищуємо вибрані файли
      setSelectedInvoiceFile(null);
      setSelectedActFile(null);
      
      console.log('🔄 NEW DocumentUploadModal: Файли успішно завантажено');
      onClose();
      
    } catch (error) {
      console.error('🔄 NEW DocumentUploadModal: Помилка завантаження:', error);
      alert('Помилка завантаження файлів: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const requestId = task.invoiceRequestId || task.id;
  const needInvoice = task.needInvoice;
  const needAct = task.needAct;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '30px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
      }}>
        <h2 style={{ 
          marginBottom: '20px', 
          color: '#333',
          textAlign: 'center',
          fontSize: '24px'
        }}>
          📄 Завантаження документів
        </h2>
        
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <p style={{ color: '#666', margin: '0 0 10px 0' }}>
            <strong>Заявка:</strong> {task.requestNumber || 'N/A'}
          </p>
          <p style={{ color: '#666', margin: '0' }}>
            <strong>ID:</strong> {requestId}
          </p>
        </div>

        {/* Секція для рахунку */}
        {needInvoice && (
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{ color: '#333', marginBottom: '15px', fontSize: '18px' }}>
              💰 Файл рахунку
            </h3>
            
            {task.invoiceFile ? (
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '5px',
                border: '1px solid #e9ecef'
              }}>
                <p style={{ margin: '0 0 10px 0', color: '#28a745' }}>
                  ✅ Рахунок вже завантажено
                </p>
                <p style={{ margin: '0 0 15px 0', color: '#666' }}>
                  Файл: {task.invoiceFileName || 'Невідомо'}
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
                      fontSize: '14px'
                    }}
                  >
                    👁️ Переглянути
                  </button>
                  <button
                    onClick={() => {
                      console.log('🔄 NEW DocumentUploadModal: Видаляємо файл рахунку');
                      onInvoiceDelete(requestId);
                    }}
                    style={{
                      padding: '8px 15px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    🗑️ Видалити
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {selectedInvoiceFile ? (
                  <div style={{ 
                    padding: '15px', 
                    backgroundColor: '#e3f2fd', 
                    borderRadius: '5px',
                    border: '1px solid #2196f3',
                    marginBottom: '10px'
                  }}>
                    <p style={{ margin: '0 0 10px 0', color: '#1976d2' }}>
                      📄 Вибрано файл: {selectedInvoiceFile.name}
                    </p>
                    <button
                      onClick={() => setSelectedInvoiceFile(null)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Скасувати
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleInvoiceFileChange}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px dashed #007bff',
                        borderRadius: '5px',
                        backgroundColor: '#f8f9fa',
                        cursor: 'pointer'
                      }}
                    />
                    <p style={{ 
                      fontSize: '12px', 
                      color: '#666', 
                      marginTop: '5px',
                      textAlign: 'center'
                    }}>
                      Підтримувані формати: PDF, JPEG, PNG (макс. 10MB)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Секція для акту */}
        {needAct && (
          <div style={{ marginBottom: '25px' }}>
            <h3 style={{ color: '#333', marginBottom: '15px', fontSize: '18px' }}>
              📋 Файл акту виконаних робіт
            </h3>
            
            {task.actFile ? (
              <div style={{ 
                padding: '15px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '5px',
                border: '1px solid #e9ecef'
              }}>
                <p style={{ margin: '0 0 10px 0', color: '#28a745' }}>
                  ✅ Акт вже завантажено
                </p>
                <p style={{ margin: '0 0 15px 0', color: '#666' }}>
                  Файл: {task.actFileName || 'Невідомо'}
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
                      fontSize: '14px'
                    }}
                  >
                    👁️ Переглянути
                  </button>
                  <button
                    onClick={() => {
                      console.log('🔄 NEW DocumentUploadModal: Видаляємо файл акту');
                      onActDelete(requestId);
                    }}
                    style={{
                      padding: '8px 15px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    🗑️ Видалити
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {selectedActFile ? (
                  <div style={{ 
                    padding: '15px', 
                    backgroundColor: '#e3f2fd', 
                    borderRadius: '5px',
                    border: '1px solid #2196f3',
                    marginBottom: '10px'
                  }}>
                    <p style={{ margin: '0 0 10px 0', color: '#1976d2' }}>
                      📋 Вибрано файл: {selectedActFile.name}
                    </p>
                    <button
                      onClick={() => setSelectedActFile(null)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Скасувати
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleActFileChange}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '2px dashed #007bff',
                        borderRadius: '5px',
                        backgroundColor: '#f8f9fa',
                        cursor: 'pointer'
                      }}
                    />
                    <p style={{ 
                      fontSize: '12px', 
                      color: '#666', 
                      marginTop: '5px',
                      textAlign: 'center'
                    }}>
                      Підтримувані формати: PDF, JPEG, PNG (макс. 10MB)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Кнопки управління */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '15px', 
          marginTop: '30px',
          paddingTop: '20px',
          borderTop: '1px solid #e9ecef'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 25px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Скасувати
          </button>
          
          {(selectedInvoiceFile || selectedActFile) && (
            <button
              onClick={handleSave}
              disabled={isUploading}
              style={{
                padding: '12px 25px',
                backgroundColor: isUploading ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: isUploading ? 'not-allowed' : 'pointer',
                fontSize: '16px'
              }}
            >
              {isUploading ? '⏳ Завантаження...' : '💾 Зберегти файли'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default NewDocumentUploadModal;
