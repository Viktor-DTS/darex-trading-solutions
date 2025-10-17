import React, { useState, useEffect } from 'react';
import FileViewer from './FileViewer';
// PDF конвертація тепер виконується на сервері

const InvoiceRequestBlock = ({ task, user, onRequest, onFileUploaded }) => {
  const [showModal, setShowModal] = useState(false);
  const [invoiceRequest, setInvoiceRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [needInvoice, setNeedInvoice] = useState(true); // За замовчуванням активний
  const [needAct, setNeedAct] = useState(false); // За замовчуванням неактивний
  const [fileViewer, setFileViewer] = useState({ open: false, fileUrl: '', fileName: '' });

  // Логування отриманих даних
  console.log('[DEBUG] InvoiceRequestBlock - отримано task:', {
    id: task.id,
    _id: task._id,
    invoiceFile: task.invoiceFile,
    invoiceFileName: task.invoiceFileName,
    invoiceStatus: task.invoiceStatus,
    actFile: task.actFile,
    actFileName: task.actFileName,
    actStatus: task.actStatus,
    invoiceRequestId: task.invoiceRequestId,
    status: task.status
  });

  // Функція для завантаження інформації про запит на рахунок
  const loadInvoiceRequest = async () => {
    console.log('DEBUG InvoiceRequestBlock: loadInvoiceRequest викликано');
    console.log('DEBUG InvoiceRequestBlock: task =', task);
    console.log('DEBUG InvoiceRequestBlock: task.id =', task.id);
    console.log('DEBUG InvoiceRequestBlock: task._id =', task._id);
    console.log('DEBUG InvoiceRequestBlock: task.requestNumber =', task.requestNumber);
    
    if (!task.id && !task._id && !task.requestNumber) {
      console.log('DEBUG InvoiceRequestBlock: немає ідентифікатора завдання');
      return;
    }
    
    const taskIdentifier = task.id || task._id || task.requestNumber;
    console.log('DEBUG InvoiceRequestBlock: використовуємо ідентифікатор =', taskIdentifier);
    
    setLoading(true);
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests?taskId=${taskIdentifier}`);
      if (response.ok) {
        const data = await response.json();
        console.log('DEBUG InvoiceRequestBlock: отримано відповідь', data);
        if (data.success && data.data && data.data.length > 0) {
          const request = data.data[0];
          console.log('DEBUG InvoiceRequestBlock: знайдено запит', request);
          console.log('DEBUG InvoiceRequestBlock: invoiceFile =', request.invoiceFile);
          console.log('DEBUG InvoiceRequestBlock: actFile =', request.actFile);
          console.log('DEBUG InvoiceRequestBlock: needInvoice =', request.needInvoice);
          console.log('DEBUG InvoiceRequestBlock: needAct =', request.needAct);
          setInvoiceRequest(request);
        } else {
          console.log('DEBUG InvoiceRequestBlock: запит не знайдено');
          setInvoiceRequest(null);
        }
      } else {
        console.error('Помилка HTTP:', response.status);
      }
    } catch (error) {
      console.error('Помилка завантаження запиту на рахунок:', error);
    } finally {
      setLoading(false);
    }
  };

  // Завантажуємо інформацію про запит при зміні task
  useEffect(() => {
    const taskIdentifier = task.id || task._id || task.requestNumber;
    if (taskIdentifier) {
      console.log('DEBUG InvoiceRequestBlock: useEffect викликано з taskIdentifier =', taskIdentifier);
      loadInvoiceRequest();
    }
  }, [task.id, task._id, task.requestNumber]); // Додаємо залежності від всіх можливих ідентифікаторів

  // Перевіряємо, чи можна показувати блок
  const canShowBlock = () => {
    const canShow = (
      (task.status === 'Виконано' || task.status === 'Заявка' || task.status === 'В роботі') && 
      (user?.role === 'Керівник сервісної служби' || 
       user?.role === 'Оператор' || 
       user?.role === 'Адміністратор' ||
       user?.role === 'Регіональний керівник' ||
       user?.role === 'administrator' ||
       user?.role === 'service' ||
       user?.role === 'operator' ||
       user?.role === 'admin' ||
       user?.role === 'regional_manager' ||
       user?.role === 'regkerivn')
    );
    
    console.log('DEBUG InvoiceRequestBlock:', {
      taskStatus: task.status,
      userRole: user?.role,
      invoiceRequested: task.invoiceRequested,
      canShow: canShow
    });
    
    return canShow;
  };

  const handleRequest = async (invoiceData) => {
    try {
      // Додаткова перевірка поля "Реквізити отримувача рахунку в паперовому вигляді"
      const recipientDetails = task.invoiceRecipientDetails;
      
      if (!recipientDetails || recipientDetails.trim() === '') {
        alert('Не заповнене поле "Реквізити отримувача рахунку в паперовому вигляді".\n\nПрошу заповнити це поле реквізитами отримувача документів в паперовому вигляді.\nЯкщо не потрібно, прошу описати причину.');
        return;
      }
      
      // Додаємо дані чекбоксів до запиту
      const requestData = {
        ...invoiceData,
        needInvoice: needInvoice,
        needAct: needAct
      };
      await onRequest(requestData);
      setShowModal(false);
      // Перезавантажуємо інформацію про запит тільки після створення
      setTimeout(() => {
        loadInvoiceRequest();
      }, 1000); // Затримка 1 секунда
    } catch (error) {
      console.error('Помилка створення запиту на рахунок:', error);
    }
  };

  // Функція для оновлення даних після завантаження файлу
  const handleFileUploaded = (fileType, fileData) => {
    console.log('[DEBUG] InvoiceRequestBlock - файл завантажено:', fileType, fileData);
    
    // Оновлюємо локальний стан
    if (fileType === 'invoice') {
      setInvoiceRequest(prev => prev ? {
        ...prev,
        invoiceFile: fileData.invoiceFile,
        invoiceFileName: fileData.invoiceFileName,
        status: 'completed'
      } : null);
    } else if (fileType === 'act') {
      setInvoiceRequest(prev => prev ? {
        ...prev,
        actFile: fileData.actFile,
        actFileName: fileData.actFileName,
        status: 'completed'
      } : null);
    }
    
    // Викликаємо callback для оновлення батьківського компонента
    if (onFileUploaded) {
      onFileUploaded(fileType, fileData);
    }
  };

  // Функція для перегляду файлу рахунку
  const viewInvoiceFile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const fileUrl = task.invoiceFile || invoiceRequest?.invoiceFile;
    const fileName = task.invoiceFileName || invoiceRequest?.invoiceFileName;
    
    if (fileUrl) {
      // Для Cloudinary URL додаємо параметри для кращого відображення
      let finalFileUrl = fileUrl;
      if (finalFileUrl.includes('cloudinary.com')) {
        // Додаємо параметри для кращого відображення PDF
        if (finalFileUrl.includes('.pdf')) {
          finalFileUrl = finalFileUrl.replace('/upload/', '/upload/fl_attachment/');
        }
      }
      
      setFileViewer({
        open: true,
        fileUrl: finalFileUrl,
        fileName: fileName || 'Файл рахунку'
      });
    }
  };

  // Функція для завантаження файлу рахунку
  const downloadInvoiceFile = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const fileUrl = task.invoiceFile || invoiceRequest?.invoiceFile;
    const fileName = task.invoiceFileName || invoiceRequest?.invoiceFileName;
    
    if (!fileUrl) return;
    
    try {
      // Завантажуємо файл через fetch для правильного завантаження
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      
      // Створюємо URL для blob
      const url = window.URL.createObjectURL(blob);
      
      // Створюємо тимчасовий елемент <a> для завантаження
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'invoice.pdf';
      // НЕ додаємо target='_blank' для завантаження
      document.body.appendChild(link);
      link.click();
      
      // Очищаємо
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Помилка завантаження файлу:', error);
      alert('Помилка завантаження файлу');
    }
  };

  // Якщо не можна показувати блок, повертаємо null
  if (!canShowBlock()) {
    return null;
  }

  return (
    <>
      <div style={{
        marginTop: '20px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '2px solid #e9ecef'
      }}>
        <h4 style={{
          margin: '0 0 15px 0',
          color: '#495057',
          fontSize: '16px',
          fontWeight: '600'
        }}>
          📄 Запит на рахунок
        </h4>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <span style={{ color: '#6c757d' }}>Завантаження інформації...</span>
          </div>
        ) : invoiceRequest ? (
          <div>
            {/* Індикатор стану запиту */}
            <div style={{ marginBottom: '15px' }}>
              <div style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '600',
                backgroundColor: 
                  invoiceRequest.status === 'pending' ? '#fff3cd' :
                  invoiceRequest.status === 'processing' ? '#d1ecf1' :
                  invoiceRequest.status === 'completed' ? '#d4edda' :
                  '#f8d7da',
                color: 
                  invoiceRequest.status === 'pending' ? '#856404' :
                  invoiceRequest.status === 'processing' ? '#0c5460' :
                  invoiceRequest.status === 'completed' ? '#155724' :
                  '#721c24'
              }}>
                {invoiceRequest.status === 'pending' ? '⏳ Очікує обробки' :
                 invoiceRequest.status === 'processing' ? '🔄 В обробці' :
                 invoiceRequest.status === 'completed' ? '✅ Виконано' :
                 '❌ Відхилено'}
              </div>
            </div>

            {/* Інформація про запит */}
            <div style={{ marginBottom: '15px', fontSize: '14px', color: '#495057' }}>
              <div><strong>Створено:</strong> {new Date(invoiceRequest.createdAt).toLocaleDateString('uk-UA')}</div>
              {invoiceRequest.comments && (
                <div style={{ marginTop: '8px' }}>
                  <strong>Коментарі бухгалтера:</strong> {invoiceRequest.comments}
                </div>
              )}
              {invoiceRequest.rejectionReason && (
                <div style={{ marginTop: '8px', color: '#dc3545' }}>
                  <strong>Причина відмови:</strong> {invoiceRequest.rejectionReason}
                </div>
              )}
            </div>

            {/* Файл рахунку */}
            {(() => {
              console.log('DEBUG InvoiceRequestBlock: перевірка умов для файлу рахунку');
              console.log('DEBUG InvoiceRequestBlock: invoiceRequest =', invoiceRequest);
              console.log('DEBUG InvoiceRequestBlock: task =', task);
              
              // Перевіряємо файл рахунку з InvoiceRequest або з task
              const hasInvoiceFileFromRequest = invoiceRequest && 
                                               invoiceRequest.status === 'completed' && 
                                               invoiceRequest.invoiceFile && 
                                               invoiceRequest.needInvoice;
              
              const hasInvoiceFileFromTask = task.invoiceFile && task.invoiceFileName;
              
              console.log('DEBUG InvoiceRequestBlock: hasInvoiceFileFromRequest =', hasInvoiceFileFromRequest);
              console.log('DEBUG InvoiceRequestBlock: hasInvoiceFileFromTask =', hasInvoiceFileFromTask);
              
              return hasInvoiceFileFromRequest || hasInvoiceFileFromTask;
            })() && (
              <div style={{
                marginBottom: '15px',
                padding: '12px',
                backgroundColor: '#e8f5e8',
                borderRadius: '4px',
                border: '1px solid #c3e6cb'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#000' }}>📄 Файл рахунку:</strong> 
                  <span style={{ color: '#000', marginLeft: '8px' }}>
                    {task.invoiceFileName || invoiceRequest.invoiceFileName}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button"
                    onClick={viewInvoiceFile}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    👁️ Переглянути файл
                  </button>
                  <button 
                    type="button"
                    onClick={downloadInvoiceFile}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    📥 Завантажити файл
                  </button>
                </div>
              </div>
            )}

            {/* Файл акту виконаних робіт */}
            {(() => {
              console.log('DEBUG InvoiceRequestBlock: перевірка умов для файлу акту');
              console.log('DEBUG InvoiceRequestBlock: invoiceRequest =', invoiceRequest);
              console.log('DEBUG InvoiceRequestBlock: task =', task);
              
              // Перевіряємо файл акту з InvoiceRequest або з task
              const hasActFileFromRequest = invoiceRequest && 
                                          invoiceRequest.status === 'completed' && 
                                          invoiceRequest.actFile && 
                                          invoiceRequest.needAct;
              
              const hasActFileFromTask = task.actFile && task.actFileName;
              
              console.log('DEBUG InvoiceRequestBlock: hasActFileFromRequest =', hasActFileFromRequest);
              console.log('DEBUG InvoiceRequestBlock: hasActFileFromTask =', hasActFileFromTask);
              
              return hasActFileFromRequest || hasActFileFromTask;
            })() && (
              <div style={{
                marginBottom: '15px',
                padding: '12px',
                backgroundColor: '#e6f3ff',
                borderRadius: '4px',
                border: '1px solid #b8daff'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#000' }}>📋 Файл акту виконаних робіт:</strong>
                  {(task.actFile || invoiceRequest.actFile) ? (
                    <>
                      <span style={{ color: '#000', marginLeft: '8px' }}>
                        {task.actFileName || invoiceRequest.actFileName}
                      </span>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const fileUrl = task.actFile || invoiceRequest?.actFile;
                            const fileName = task.actFileName || invoiceRequest?.actFileName;
                            
                            if (fileUrl) {
                              // Для Cloudinary URL додаємо параметри для кращого відображення
                              let finalFileUrl = fileUrl;
                              if (finalFileUrl.includes('cloudinary.com')) {
                                // Додаємо параметри для кращого відображення PDF
                                if (finalFileUrl.includes('.pdf')) {
                                  finalFileUrl = finalFileUrl.replace('/upload/', '/upload/fl_attachment/');
                                }
                              }
                              
                              setFileViewer({
                                open: true,
                                fileUrl: finalFileUrl,
                                fileName: fileName || 'Файл акту виконаних робіт'
                              });
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#17a2b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600'
                          }}
                        >
                          👁️ Переглянути файл
                        </button>
                        <button 
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const fileUrl = task.actFile || invoiceRequest?.actFile;
                            const fileName = task.actFileName || invoiceRequest?.actFileName;
                            
                            if (!fileUrl) return;
                            
                            try {
                              // Завантажуємо файл через fetch для правильного завантаження
                              const response = await fetch(fileUrl);
                              const blob = await response.blob();
                              
                              // Створюємо URL для blob
                              const url = window.URL.createObjectURL(blob);
                              
                              // Створюємо тимчасовий елемент <a> для завантаження
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = fileName || 'act.pdf';
                              document.body.appendChild(link);
                              link.click();
                              
                              // Очищаємо
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Помилка завантаження файлу акту:', error);
                              alert('Помилка завантаження файлу акту');
                            }
                          }}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600'
                          }}
                        >
                          📥 Завантажити файл
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ marginTop: '8px', color: '#6c757d', fontSize: '14px' }}>
                      Файл акту ще не завантажено бухгалтером
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Кнопка для повторного запиту (якщо відхилено) */}
            {invoiceRequest.status === 'rejected' && (
              <button 
                type="button"
                onClick={() => setShowModal(true)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#138496'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#17a2b8'}
              >
                🔄 Подати запит знову
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Показуємо файли якщо вони є в task, але немає InvoiceRequest */}
            {task.invoiceFile && task.invoiceFileName && (
              <div style={{
                marginBottom: '15px',
                padding: '12px',
                backgroundColor: '#e8f5e8',
                borderRadius: '4px',
                border: '1px solid #c3e6cb'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#000' }}>📄 Файл рахунку:</strong> 
                  <span style={{ color: '#000', marginLeft: '8px' }}>
                    {task.invoiceFileName}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (task.invoiceFile) {
                        let fileUrl = task.invoiceFile;
                        if (fileUrl.includes('cloudinary.com') && fileUrl.includes('.pdf')) {
                          fileUrl = fileUrl.replace('/upload/', '/upload/fl_attachment/');
                        }
                        window.open(fileUrl, '_blank');
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    👁️ Переглянути файл
                  </button>
                  <button 
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!task.invoiceFile) return;
                      
                      try {
                        const response = await fetch(task.invoiceFile);
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = task.invoiceFileName || 'invoice.pdf';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                      } catch (error) {
                        console.error('Помилка завантаження файлу:', error);
                        alert('Помилка завантаження файлу');
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    📥 Завантажити файл
                  </button>
                </div>
              </div>
            )}
            
            {/* Показуємо файл акту якщо він є в task, але немає InvoiceRequest */}
            {task.actFile && task.actFileName && (
              <div style={{
                marginBottom: '15px',
                padding: '12px',
                backgroundColor: '#e6f3ff',
                borderRadius: '4px',
                border: '1px solid #b8daff'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#000' }}>📋 Файл акту виконаних робіт:</strong> 
                  <span style={{ color: '#000', marginLeft: '8px' }}>
                    {task.actFileName}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (task.actFile) {
                        let fileUrl = task.actFile;
                        if (fileUrl.includes('cloudinary.com') && fileUrl.includes('.pdf')) {
                          fileUrl = fileUrl.replace('/upload/', '/upload/fl_attachment/');
                        }
                        
                        setFileViewer({
                          open: true,
                          fileUrl: fileUrl,
                          fileName: task.actFileName || 'Файл акту виконаних робіт'
                        });
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    👁️ Переглянути файл
                  </button>
                  <button 
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!task.actFile) return;
                      
                      try {
                        const response = await fetch(task.actFile);
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = task.actFileName || 'act.pdf';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(url);
                      } catch (error) {
                        console.error('Помилка завантаження файлу акту:', error);
                        alert('Помилка завантаження файлу акту');
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '600'
                    }}
                  >
                    📥 Завантажити файл
                  </button>
                </div>
              </div>
            )}
            
            <p style={{
              margin: '0 0 20px 0', 
              fontSize: '14px', 
              color: '#6c757d',
              lineHeight: '1.5'
            }}>
              Заявка виконана. Ви можете подати запит на отримання рахунку від бухгалтера 
              для клієнта <strong>{task.client || 'не вказано'}</strong> (ЄДРПОУ: {task.edrpou || 'не вказано'}).
            </p>
            
            <button 
              type="button"
              onClick={() => {
                // Перевіряємо поле "Реквізити отримувача рахунку в паперовому вигляді"
                const recipientDetails = task.invoiceRecipientDetails;
                
                if (!recipientDetails || recipientDetails.trim() === '') {
                  alert('Не заповнене поле "Реквізити отримувача рахунку в паперовому вигляді".\n\nПрошу заповнити це поле реквізитами отримувача документів в паперовому вигляді.\nЯкщо не потрібно, прошу описати причину.');
                  return;
                }
                
                // Якщо поле заповнене, відкриваємо модальне вікно
                setShowModal(true);
              }}
              style={{
                padding: '12px 24px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#218838'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#28a745'}
            >
              Запросити рахунок
            </button>
          </div>
        )}
      </div>

      {/* Модальне вікно для запиту рахунку */}
      {showModal && (
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
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
              Запит на рахунок для заявки №{task.requestNumber}
            </h3>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              
              // Перевіряємо поле "Реквізити отримувача рахунку в паперовому вигляді"
              const recipientDetails = task.invoiceRecipientDetails;
              
              if (!recipientDetails || recipientDetails.trim() === '') {
                alert('Не заповнене поле "Реквізити отримувача рахунку в паперовому вигляді".\n\nПрошу заповнити це поле реквізитами отримувача документів в паперовому вигляді.\nЯкщо не потрібно, прошу описати причину.');
                return false;
              }
              
              const formData = new FormData(e.target);
              console.log('[DEBUG] InvoiceRequestBlock - task.id:', task.id);
              const invoiceData = {
                taskId: task.id,
                requesterId: user.login,
                requesterName: user.name,
                companyDetails: {
                  companyName: formData.get('companyName'),
                  edrpou: formData.get('edrpou'),
                  address: formData.get('address'),
                  bankDetails: formData.get('bankDetails'),
                  comments: formData.get('comments')
                }
              };
              handleRequest(invoiceData);
              return false;
            }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#000' }}>
                  Назва компанії *
                </label>
                <input 
                  type="text" 
                  name="companyName" 
                  defaultValue={task.client || ''}
                  required 
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', color: '#000', backgroundColor: '#fff' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#000' }}>
                  ЄДРПОУ *
                </label>
                <input 
                  type="text" 
                  name="edrpou" 
                  defaultValue={task.edrpou || ''}
                  required 
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', color: '#000', backgroundColor: '#fff' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#000' }}>
                  Юридична адреса компанії
                </label>
                <textarea 
                  name="address" 
                  rows="3"
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', color: '#000', backgroundColor: '#fff' }}
                  placeholder="Введіть повну юридичну адресу компанії"
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#000' }}>
                  Реквізити отримувача рахунку в паперовому вигляді
                </label>
                <textarea 
                  name="bankDetails" 
                  rows="3"
                  defaultValue={task.invoiceRecipientDetails || ''}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', color: '#000', backgroundColor: '#fff' }}
                  placeholder="ПІБ, контактний телефон, місто, номер відділення Нової Пошти тощо"
                />
              </div>

              {/* Чекбокси для вибору типу документів */}
              <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f0f0f0', borderRadius: '8px', border: '2px solid #ccc' }}>
                <h4 style={{ margin: '0 0 16px 0', color: '#000', fontSize: '18px', fontWeight: 'bold' }}>Тип документів:</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #ddd' }}>
                    <input
                      type="checkbox"
                      checked={needInvoice}
                      onChange={(e) => setNeedInvoice(e.target.checked)}
                      style={{ margin: 0, width: '20px', height: '20px' }}
                    />
                    <span style={{ fontSize: '16px', color: '#000', fontWeight: 'bold' }}>
                      📄 Потрібен рахунок
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #ddd' }}>
                    <input
                      type="checkbox"
                      checked={needAct}
                      onChange={(e) => setNeedAct(e.target.checked)}
                      style={{ margin: 0, width: '20px', height: '20px' }}
                    />
                    <span style={{ fontSize: '16px', color: '#000', fontWeight: 'bold' }}>
                      📋 Потрібен акт виконаних робіт
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', color: '#000' }}>
                  Коментарі
                </label>
                <textarea 
                  name="comments" 
                  rows="3"
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', color: '#000', backgroundColor: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Скасувати
                </button>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Перевіряємо поле "Реквізити отримувача рахунку в паперовому вигляді"
                    const recipientDetails = task.invoiceRecipientDetails;
                    
                    if (!recipientDetails || recipientDetails.trim() === '') {
                      alert('Не заповнене поле "Реквізити отримувача рахунку в паперовому вигляді".\n\nПрошу заповнити це поле реквізитами отримувача документів в паперовому вигляді.\nЯкщо не потрібно, прошу описати причину.');
                      return;
                    }
                    
                    const form = e.target.closest('form');
                    const formData = new FormData(form);
                    console.log('[DEBUG] InvoiceRequestBlock (2) - task.id:', task.id);
                    const invoiceData = {
                      taskId: task.id,
                      requesterId: user.login,
                      requesterName: user.name,
                      companyDetails: {
                        companyName: formData.get('companyName'),
                        edrpou: formData.get('edrpou'),
                        address: formData.get('address'),
                        bankDetails: formData.get('bankDetails'),
                        comments: formData.get('comments')
                      }
                    };
                    handleRequest(invoiceData);
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Відправити запит
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* FileViewer для перегляду файлів */}
      {fileViewer.open && (
        <FileViewer
          fileUrl={fileViewer.fileUrl}
          fileName={fileViewer.fileName}
          onClose={() => setFileViewer({ open: false, fileUrl: '', fileName: '' })}
        />
      )}
    </>
  );
};

export default InvoiceRequestBlock;
