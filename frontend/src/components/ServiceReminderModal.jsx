import React from 'react';

const ServiceReminderModal = ({ isOpen, onClose, tasks, user }) => {
  if (!isOpen) return null;

  // Фільтруємо заявки по регіону користувача
  const requestTasks = tasks.filter(task => {
    if (task.status !== 'Заявка') return false;
    
    // Якщо користувач має регіон "Україна", показуємо всі заявки
    if (user?.region === 'Україна') return true;
    
    // Інакше показуємо тільки заявки свого регіону
    return task.serviceRegion === user?.region;
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '800px',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
        position: 'relative'
      }}>
        {/* Заголовок */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '2px solid #22334a',
          paddingBottom: '10px'
        }}>
          <h2 style={{
            margin: 0,
            color: '#22334a',
            fontSize: '24px',
            fontWeight: 'bold'
          }}>
            ⚠️ Нагадування про заявки
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '5px',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#f0f0f0'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            ✕
          </button>
        </div>

        {/* Інформація про кількість заявок */}
        <div style={{
          backgroundColor: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <p style={{
            margin: 0,
            fontSize: '16px',
            color: '#856404',
            fontWeight: '500'
          }}>
            У вас є <strong>{requestTasks.length}</strong> заявка{requestTasks.length === 1 ? '' : requestTasks.length < 5 ? 'и' : ''} зі статусом "Заявка", які потребують уваги.
          </p>
        </div>

        {/* Список заявок */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{
            margin: '0 0 16px 0',
            color: '#22334a',
            fontSize: '18px',
            fontWeight: '600'
          }}>
            Деталі заявок:
          </h3>
          
          {requestTasks.map((task, index) => (
            <div key={task.id || index} style={{
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '12px',
              backgroundColor: '#fafafa'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                fontSize: '14px'
              }}>
                <div>
                  <strong style={{ color: '#22334a' }}>Дата заявки:</strong>
                  <div style={{ color: '#666', marginTop: '4px' }}>
                    {task.requestDate || 'Не вказано'}
                  </div>
                </div>
                
                <div>
                  <strong style={{ color: '#22334a' }}>Компанія виконавець:</strong>
                  <div style={{ color: '#666', marginTop: '4px' }}>
                    {task.serviceRegion || 'Не вказано'}
                  </div>
                </div>
                
                <div>
                  <strong style={{ color: '#22334a' }}>Замовник:</strong>
                  <div style={{ color: '#666', marginTop: '4px' }}>
                    {task.client || 'Не вказано'}
                  </div>
                </div>
                
                <div>
                  <strong style={{ color: '#22334a' }}>Адреса:</strong>
                  <div style={{ color: '#666', marginTop: '4px' }}>
                    {task.address || 'Не вказано'}
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: '12px' }}>
                <strong style={{ color: '#22334a' }}>Опис заявки:</strong>
                <div style={{ 
                  color: '#666', 
                  marginTop: '4px',
                  backgroundColor: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #e0e0e0',
                  minHeight: '40px'
                }}>
                  {task.requestDesc || task.work || 'Опис не вказано'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Кнопки */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          borderTop: '1px solid #e0e0e0',
          paddingTop: '20px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              border: '1px solid #22334a',
              backgroundColor: 'white',
              color: '#22334a',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#f0f0f0'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
          >
            Закрити
          </button>
          
          <button
            onClick={() => {
              onClose();
              // Тут можна додати логіку для переходу до таблиці заявок
            }}
            style={{
              padding: '10px 20px',
              border: 'none',
              backgroundColor: '#22334a',
              color: 'white',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#1a2636'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#22334a'}
          >
            Переглянути заявки
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServiceReminderModal; 