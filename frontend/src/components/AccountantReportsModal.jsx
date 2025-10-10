import React, { useState, useEffect } from 'react';

const AccountantReportsModal = ({ isOpen, onClose, user }) => {
  const [reportFilters, setReportFilters] = useState({
    dateFrom: '',
    dateTo: '',
    region: '',
    detailed: false
  });
  const [personnelFilters, setPersonnelFilters] = useState({
    month: new Date().getMonth() + 1, // Поточний місяць
    year: new Date().getFullYear() // Поточний рік
  });
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState('financial'); // 'financial' або 'personnel'

  useEffect(() => {
    if (isOpen) {
      loadRegions();
      // Встановлюємо поточну дату як за замовчуванням
      const today = new Date().toISOString().split('T')[0];
      setReportFilters(prev => ({
        ...prev,
        dateFrom: today,
        dateTo: today
      }));
    }
  }, [isOpen]);

  const loadRegions = async () => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      const response = await fetch(`${API_BASE_URL}/tasks`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // Отримуємо унікальні регіони
          const uniqueRegions = [...new Set(data.data.map(task => task.serviceRegion).filter(Boolean))];
          console.log('DEBUG: Завантажено регіонів:', uniqueRegions);
          setRegions(uniqueRegions);
        } else {
          console.log('DEBUG: Немає даних в відповіді:', data);
          // Якщо немає даних, встановлюємо стандартні регіони
          setRegions(['Київський', 'Дніпровський', 'Львівський', 'Харківський', 'Одеський']);
        }
      } else {
        console.error('Помилка HTTP при завантаженні регіонів:', response.status);
        // Якщо помилка, встановлюємо стандартні регіони
        setRegions(['Київський', 'Дніпровський', 'Львівський', 'Харківський', 'Одеський']);
      }
    } catch (error) {
      console.error('Помилка завантаження регіонів:', error);
      // Якщо помилка, встановлюємо стандартні регіони
      setRegions(['Київський', 'Дніпровський', 'Львівський', 'Харківський', 'Одеський']);
    }
  };

  const handleFilterChange = (field, value) => {
    setReportFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const generateReport = async (format) => {
    if (!reportFilters.dateFrom || !reportFilters.dateTo) {
      alert('Будь ласка, вкажіть період для звіту');
      return;
    }

    setLoading(true);
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      console.log('[REPORTS] Frontend - параметри перед відправкою:', {
        dateFrom: reportFilters.dateFrom,
        dateTo: reportFilters.dateTo,
        region: reportFilters.region,
        detailed: reportFilters.detailed,
        detailedType: typeof reportFilters.detailed,
        format: format
      });
      
      const params = new URLSearchParams({
        dateFrom: reportFilters.dateFrom,
        dateTo: reportFilters.dateTo,
        region: reportFilters.region,
        detailed: reportFilters.detailed ? reportFilters.detailed.toString() : 'false',
        format: format
      });
      
      console.log('[REPORTS] Frontend - URL параметри:', params.toString());

      if (format === 'html') {
        // Відкриваємо HTML звіт в новій вкладці
        const htmlUrl = `${API_BASE_URL}/reports/financial?${params}`;
        console.log('[REPORTS] Frontend - відкриваємо HTML звіт:', htmlUrl);
        window.open(htmlUrl, '_blank');
      } else if (format === 'excel') {
        // Завантажуємо Excel файл
        console.log('[REPORTS] Frontend - відправляємо запит на Excel:', `${API_BASE_URL}/reports/financial?${params}`);
        const response = await fetch(`${API_BASE_URL}/reports/financial?${params}`);
        console.log('[REPORTS] Frontend - отримано відповідь:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        });
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `financial_report_${reportFilters.dateFrom}_${reportFilters.dateTo}.xlsx`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        } else {
          alert('Помилка генерації звіту');
        }
      }
    } catch (error) {
      console.error('Помилка генерації звіту:', error);
      alert('Помилка генерації звіту');
    } finally {
      setLoading(false);
    }
  };

  const generatePersonnelReport = async () => {
    if (!personnelFilters.month || !personnelFilters.year) {
      alert('Будь ласка, вкажіть місяць та рік для звіту');
      return;
    }

    setLoading(true);
    try {
      // Використовуємо frontend логіку замість backend endpoint
      alert('Використовуйте кнопку "👥 Звіт по персоналу" в основній панелі бухгалтера для генерації звіту');
      
    } catch (error) {
      console.error('Помилка генерації звіту по персоналу:', error);
      alert('Помилка генерації звіту по персоналу');
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
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '24px',
        width: '90%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          borderBottom: '2px solid #f0f0f0',
          paddingBottom: '16px'
        }}>
          <h2 style={{ margin: 0, color: '#333', fontSize: '24px', fontWeight: '600' }}>
            📊 Бухгалтерські звіти
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '4px',
              borderRadius: '4px'
            }}
          >
            ×
          </button>
        </div>

        {/* Перемикач звітів */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          borderBottom: '1px solid #e0e0e0',
          paddingBottom: '16px'
        }}>
          <button
            onClick={() => setActiveReport('financial')}
            style={{
              padding: '12px 24px',
              backgroundColor: activeReport === 'financial' ? '#007bff' : '#f8f9fa',
              color: activeReport === 'financial' ? 'white' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
          >
            💰 Фінансовий звіт
          </button>
          <button
            onClick={() => setActiveReport('personnel')}
            style={{
              padding: '12px 24px',
              backgroundColor: activeReport === 'personnel' ? '#007bff' : '#f8f9fa',
              color: activeReport === 'personnel' ? 'white' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
          >
            👥 Табель персоналу
          </button>
        </div>

        {/* Фінансовий звіт */}
        {activeReport === 'financial' && (
        <div style={{
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
          border: '1px solid #e9ecef'
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            color: '#333', 
            fontSize: '18px',
            fontWeight: '600',
            borderBottom: '2px solid #007bff',
            paddingBottom: '8px'
          }}>
            Загальний звіт по руху фінансів
          </h3>

          {/* Фільтри */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#333' }}>
                Дата виконаних робіт з:
              </label>
              <input
                type="date"
                value={reportFilters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#333' }}>
                Дата виконаних робіт по:
              </label>
              <input
                type="date"
                value={reportFilters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#333' }}>
              Регіон:
            </label>
            <select
              value={reportFilters.region}
              onChange={(e) => handleFilterChange('region', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#fff'
              }}
            >
              <option value="">Всі регіони</option>
              {regions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={reportFilters.detailed}
                onChange={(e) => handleFilterChange('detailed', e.target.checked)}
                style={{ transform: 'scale(1.2)' }}
              />
              <span style={{ fontWeight: '500', color: '#333' }}>
                Деталізація по звіту
              </span>
            </label>
          </div>

          {/* Кнопки формування звіту */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => generateReport('html')}
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {loading ? '⏳' : '📄'} Формування звіту в HTML
            </button>
            <button
              onClick={() => generateReport('excel')}
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {loading ? '⏳' : '📊'} Експорт Excel
            </button>
          </div>
        </div>
        )}

        {/* Звіт по персоналу */}
        {activeReport === 'personnel' && (
        <div style={{
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
          border: '1px solid #e9ecef'
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0', 
            color: '#333', 
            fontSize: '18px',
            fontWeight: '600',
            borderBottom: '2px solid #007bff',
            paddingBottom: '8px'
          }}>
            Табель персоналу
          </h3>

          {/* Фільтри для персоналу */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#333' }}>
                Місяць:
              </label>
              <select
                value={personnelFilters.month}
                onChange={(e) => setPersonnelFilters(prev => ({ ...prev, month: parseInt(e.target.value) }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: '#fff'
                }}
              >
                <option value={1}>Січень</option>
                <option value={2}>Лютий</option>
                <option value={3}>Березень</option>
                <option value={4}>Квітень</option>
                <option value={5}>Травень</option>
                <option value={6}>Червень</option>
                <option value={7}>Липень</option>
                <option value={8}>Серпень</option>
                <option value={9}>Вересень</option>
                <option value={10}>Жовтень</option>
                <option value={11}>Листопад</option>
                <option value={12}>Грудень</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', color: '#333' }}>
                Рік:
              </label>
              <select
                value={personnelFilters.year}
                onChange={(e) => setPersonnelFilters(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: '#fff'
                }}
              >
                <option value={2023}>2023</option>
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>
            </div>
          </div>

          {/* Кнопка формування звіту */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={generatePersonnelReport}
              disabled={loading}
              style={{
                padding: '12px 24px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: loading ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {loading ? '⏳' : '📄'} Сформувати звіт
            </button>
          </div>
        </div>
        )}

        {/* Кнопка закриття */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountantReportsModal;
