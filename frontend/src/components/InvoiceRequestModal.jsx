import React, { useState } from 'react';

const InvoiceRequestModal = ({ 
  isOpen, 
  onClose, 
  task, 
  user, 
  onSubmit 
}) => {
  const [formData, setFormData] = useState({
    companyName: task?.client || '',
    edrpou: task?.edrpou || '',
    address: task?.address || '',
    bankDetails: '',
    contactPerson: '',
    phone: '',
    email: '',
    comments: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Очищаємо помилку для цього поля
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.companyName.trim()) {
      newErrors.companyName = 'Назва компанії обов\'язкова';
    }
    
    if (!formData.edrpou.trim()) {
      newErrors.edrpou = 'ЄДРПОУ обов\'язковий';
    } else if (!/^\d{8}$/.test(formData.edrpou.trim())) {
      newErrors.edrpou = 'ЄДРПОУ повинен містити 8 цифр';
    }
    
    if (!formData.address.trim()) {
      newErrors.address = 'Адреса обов\'язкова';
    }
    
    if (!formData.bankDetails.trim()) {
      newErrors.bankDetails = 'Банківські реквізити обов\'язкові';
    }
    
    if (!formData.contactPerson.trim()) {
      newErrors.contactPerson = 'Контактна особа обов\'язкова';
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'Телефон обов\'язковий';
    } else if (!/^[\+]?[0-9\s\-\(\)]{10,}$/.test(formData.phone.trim())) {
      newErrors.phone = 'Невірний формат телефону';
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Невірний формат email';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    try {
      await onSubmit({
        taskId: task.id,
        requesterId: user.login,
        requesterName: user.name,
        companyDetails: formData,
        status: 'pending'
      });
      onClose();
    } catch (error) {
      console.error('Помилка створення запиту:', error);
      alert('Помилка створення запиту на рахунок');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

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
        padding: '24px',
        borderRadius: '8px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid #e0e0e0'
        }}>
          <h2 style={{ margin: 0, color: '#333' }}>
            📄 Запит на рахунок
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
            <strong>Заявка:</strong> {task?.requestDesc || 'Без опису'}
          </p>
          <p style={{ margin: '0', fontSize: '14px', color: '#666' }}>
            <strong>Дата виконання:</strong> {task?.date ? new Date(task.date).toLocaleDateString('uk-UA') : 'Не вказано'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gap: '16px' }}>
            {/* Назва компанії */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
                Назва компанії *
              </label>
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${errors.companyName ? '#dc3545' : '#ddd'}`,
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                placeholder="Введіть назву компанії"
              />
              {errors.companyName && (
                <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                  {errors.companyName}
                </div>
              )}
            </div>

            {/* ЄДРПОУ */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
                ЄДРПОУ *
              </label>
              <input
                type="text"
                name="edrpou"
                value={formData.edrpou}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${errors.edrpou ? '#dc3545' : '#ddd'}`,
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                placeholder="12345678"
                maxLength="8"
              />
              {errors.edrpou && (
                <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                  {errors.edrpou}
                </div>
              )}
            </div>

            {/* Адреса */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
                Адреса *
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${errors.address ? '#dc3545' : '#ddd'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '60px',
                  resize: 'vertical'
                }}
                placeholder="Введіть повну адресу компанії"
              />
              {errors.address && (
                <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                  {errors.address}
                </div>
              )}
            </div>

            {/* Банківські реквізити */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
                Банківські реквізити *
              </label>
              <textarea
                name="bankDetails"
                value={formData.bankDetails}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${errors.bankDetails ? '#dc3545' : '#ddd'}`,
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
                placeholder="Назва банку, IBAN, МФО тощо"
              />
              {errors.bankDetails && (
                <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                  {errors.bankDetails}
                </div>
              )}
            </div>

            {/* Контактна особа */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
                Контактна особа *
              </label>
              <input
                type="text"
                name="contactPerson"
                value={formData.contactPerson}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${errors.contactPerson ? '#dc3545' : '#ddd'}`,
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                placeholder="ПІБ контактної особи"
              />
              {errors.contactPerson && (
                <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                  {errors.contactPerson}
                </div>
              )}
            </div>

            {/* Телефон */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
                Телефон *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${errors.phone ? '#dc3545' : '#ddd'}`,
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                placeholder="+380501234567"
              />
              {errors.phone && (
                <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                  {errors.phone}
                </div>
              )}
            </div>

            {/* Email */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: `1px solid ${errors.email ? '#dc3545' : '#ddd'}`,
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                placeholder="example@company.com"
              />
              {errors.email && (
                <div style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px' }}>
                  {errors.email}
                </div>
              )}
            </div>

            {/* Коментарі */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', color: '#333' }}>
                Додаткові коментарі
              </label>
              <textarea
                name="comments"
                value={formData.comments}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  minHeight: '60px',
                  resize: 'vertical'
                }}
                placeholder="Додаткова інформація для бухгалтера"
              />
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid #e0e0e0'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 20px',
                backgroundColor: loading ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Відправка...' : 'Відправити запит'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InvoiceRequestModal;
