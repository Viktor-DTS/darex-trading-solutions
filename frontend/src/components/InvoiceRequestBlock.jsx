import React, { useState, useEffect } from 'react';

const InvoiceRequestBlock = ({ task, user, onRequest }) => {
  const [showModal, setShowModal] = useState(false);
  const [invoiceRequest, setInvoiceRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [needInvoice, setNeedInvoice] = useState(true); // За замовчуванням активний
  const [needAct, setNeedAct] = useState(false); // За замовчуванням неактивний

  // Функція для завантаження інформації про запит на рахунок
  const loadInvoiceRequest = async () => {
    if (!task.id) {
      console.log('DEBUG InvoiceRequestBlock: task.id відсутній', task);
      return;
    }
    
    console.log('DEBUG InvoiceRequestBlock: завантажуємо запит для task.id =', task.id);
    
    setLoading(true);
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests?taskId=${task.id}`);
      if (response.ok) {
        const data = await response.json();
        console.log('DEBUG InvoiceRequestBlock: отримано відповідь', data);
        if (data.success && data.data && data.data.length > 0) {
          setInvoiceRequest(data.data[0]);
        } else {
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

  // Завантажуємо інформацію про запит при зміні task.id
  useEffect(() => {
    if (task.id) {
      loadInvoiceRequest();
    }
  }, [task.id]); // Додаємо залежність тільки від task.id

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

  // Функція для перегляду файлу рахунку
  const viewInvoiceFile = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (invoiceRequest?.invoiceFile) {
      window.open(invoiceRequest.invoiceFile, '_blank');
    }
  };

  // Функція для завантаження файлу рахунку
  const downloadInvoiceFile = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!invoiceRequest?.invoiceFile) return;
    
    try {
      // Завантажуємо файл через fetch для правильного завантаження
      const response = await fetch(invoiceRequest.invoiceFile);
      const blob = await response.blob();
      
      // Створюємо URL для blob
      const url = window.URL.createObjectURL(blob);
      
      // Створюємо тимчасовий елемент <a> для завантаження
      const link = document.createElement('a');
      link.href = url;
      link.download = invoiceRequest.invoiceFileName || 'invoice.pdf';
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
            {invoiceRequest.status === 'completed' && invoiceRequest.invoiceFile && (
              <div style={{
                marginBottom: '15px',
                padding: '12px',
                backgroundColor: '#e8f5e8',
                borderRadius: '4px',
                border: '1px solid #c3e6cb'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#000' }}>📄 Файл рахунку:</strong> 
                  <span style={{ color: '#000', marginLeft: '8px' }}>{invoiceRequest.invoiceFileName}</span>
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
              onClick={() => setShowModal(true)}
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
    </>
  );
};

export default InvoiceRequestBlock;
