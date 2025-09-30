import React, { useState } from 'react';

const InvoiceRequestBlock = ({ task, user, onRequest }) => {
  const [showModal, setShowModal] = useState(false);

  // Перевіряємо, чи можна показувати блок
  const canShowBlock = () => {
    const canShow = (
      task.status === 'Виконано' && 
      (user?.role === 'Керівник сервісної служби' || 
       user?.role === 'Оператор' || 
       user?.role === 'Адміністратор' ||
       user?.role === 'service' ||
       user?.role === 'operator' ||
       user?.role === 'admin') && 
      !task.invoiceRequested
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
      await onRequest(invoiceData);
      setShowModal(false);
    } catch (error) {
      console.error('Помилка створення запиту на рахунок:', error);
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
              const formData = new FormData(e.target);
              const invoiceData = {
                taskId: task.id,
                requesterId: user.login,
                requesterName: user.name,
                companyDetails: {
                  companyName: formData.get('companyName'),
                  edrpou: formData.get('edrpou'),
                  address: formData.get('address'),
                  bankDetails: formData.get('bankDetails'),
                  contactPerson: formData.get('contactPerson'),
                  phone: formData.get('phone'),
                  email: formData.get('email'),
                  comments: formData.get('comments')
                }
              };
              handleRequest(invoiceData);
            }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Назва компанії *
                </label>
                <input 
                  type="text" 
                  name="companyName" 
                  defaultValue={task.client || ''}
                  required 
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  ЄДРПОУ *
                </label>
                <input 
                  type="text" 
                  name="edrpou" 
                  defaultValue={task.edrpou || ''}
                  required 
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Адреса *
                </label>
                <input 
                  type="text" 
                  name="address" 
                  required 
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Банківські реквізити *
                </label>
                <textarea 
                  name="bankDetails" 
                  required 
                  rows="3"
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Контактна особа *
                </label>
                <input 
                  type="text" 
                  name="contactPerson" 
                  required 
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Телефон *
                </label>
                <input 
                  type="tel" 
                  name="phone" 
                  required 
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Email
                </label>
                <input 
                  type="email" 
                  name="email" 
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
                  Коментарі
                </label>
                <textarea 
                  name="comments" 
                  rows="3"
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
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
                  type="submit"
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
