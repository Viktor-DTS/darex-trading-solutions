import React, { useState, useEffect } from 'react';

const AccountantReportsModal = ({ isOpen, onClose, user, tasks, users }) => {
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
      // Використовуємо дані з пропсів (як в робочій версії)
      
      const months = [
        'Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'
      ];
      const monthName = months[personnelFilters.month - 1];
      const reportTitle = `Звіт по табелю часу та виконаних робіт за ${monthName} ${personnelFilters.year}`;
      
      // Отримуємо всіх інженерів (service роль)
      const allEngineers = users.filter(u => u.role === 'service');
      
      // Отримуємо заявки за вказаний місяць/рік
      const startDate = new Date(personnelFilters.year, personnelFilters.month - 1, 1);
      const endDate = new Date(personnelFilters.year, personnelFilters.month, 0, 23, 59, 59);
      
      const monthTasks = tasks.filter(t => {
        if (t.status !== 'Виконано') return false;
        if (!t.date) return false;
        const taskDate = new Date(t.date);
        return taskDate >= startDate && taskDate <= endDate;
      });
      
      
      // Функція для перевірки затвердження
      const isApproved = (value) => value === true || value === 'Підтверджено';
      
      // Фільтруємо заявки з затвердженням
      const approvedTasks = monthTasks.filter(task => 
        isApproved(task.approvedByWarehouse) && 
        isApproved(task.approvedByAccountant)
      );
      
      
      // Групуємо заявки по регіонах
      const regionGroups = {};
      approvedTasks.forEach(task => {
        const region = task.serviceRegion || 'Невідомо';
        if (!regionGroups[region]) {
          regionGroups[region] = [];
        }
        regionGroups[region].push(task);
      });
      
      // Логування для діагностики
      console.log(`[PERSONNEL REPORT] Month: ${personnelFilters.month}, Year: ${personnelFilters.year}`);
      console.log(`[PERSONNEL REPORT] Total tasks found: ${monthTasks.length}`);
      console.log(`[PERSONNEL REPORT] Approved tasks: ${approvedTasks.length}`);
      console.log(`[PERSONNEL REPORT] Engineers found: ${allEngineers.length}`);
      console.log(`[PERSONNEL REPORT] Regions: ${Object.keys(regionGroups).join(', ')}`);
      
      // Генеруємо звіт з групуванням по регіонам
      const generateRegionReport = (region) => {
        const regionTasks = regionGroups[region];
        const regionEngineers = allEngineers.filter(engineer => 
          engineer.region === region || engineer.region === 'Україна'
        );
        
        // Створюємо табель часу
        const engineerHours = {};
        regionEngineers.forEach(engineer => {
          engineerHours[engineer.name] = {};
          for (let day = 1; day <= 31; day++) {
            engineerHours[engineer.name][day] = 0;
          }
        });
        
        // Розподіляємо години по днях
        regionTasks.forEach(task => {
          const taskDate = new Date(task.date);
          const day = taskDate.getDate();
          
          const engineers = [
            task.engineer1,
            task.engineer2,
            task.engineer3,
            task.engineer4,
            task.engineer5,
            task.engineer6
          ].filter(eng => eng && eng.trim().length > 0);
          
          engineers.forEach(engineer => {
            if (engineerHours[engineer]) {
              engineerHours[engineer][day] = 8;
            }
          });
        });
        
        // Підраховуємо загальні години
        Object.keys(engineerHours).forEach(engineer => {
          engineerHours[engineer].total = Object.values(engineerHours[engineer])
            .filter(val => typeof val === 'number')
            .reduce((sum, hours) => sum + hours, 0);
        });
        
        // Розраховуємо зарплати
        const engineerSalaries = {};
        regionEngineers.forEach(engineer => {
          const total = engineerHours[engineer.name]?.total || 0;
          const salary = 25000;
          const bonus = 0;
          const workHours = 168; // Норма робочих годин на місяць
          const overtime = Math.max(0, total - workHours);
          const overtimeRate = workHours > 0 ? (salary / workHours) * 2 : 0;
          const overtimePay = overtime * overtimeRate;
          // Виправляємо розрахунок базової оплати - тільки за фактично відпрацьовані години
          const basePay = Math.round(salary * total / workHours);
          
          // Розрахунок премії за сервісні роботи
          let engineerBonus = 0;
          regionTasks.forEach(task => {
            const workPrice = parseFloat(task.workPrice) || 0;
            const bonusVal = workPrice * 0.25;
            
            const engineers = [
              (task.engineer1 || '').trim(),
              (task.engineer2 || '').trim(),
              (task.engineer3 || '').trim(),
              (task.engineer4 || '').trim(),
              (task.engineer5 || '').trim(),
              (task.engineer6 || '').trim()
            ].filter(eng => eng && eng.length > 0);
            
            if (engineers.includes(engineer.name) && engineers.length > 0) {
              engineerBonus += bonusVal / engineers.length;
            }
          });
          
          const payout = basePay + overtimePay + bonus + engineerBonus;
          
          engineerSalaries[engineer.name] = {
            baseRate: salary,
            totalHours: total,
            overtimeHours: overtime,
            hourlyRate: workHours > 0 ? salary / workHours : 0,
            overtimeRate: overtimeRate,
            overtimePay: overtimePay,
            workedRate: basePay,
            serviceBonus: engineerBonus,
            totalPay: payout
          };
        });
        
        // Фільтруємо інженерів з ненульовими годинами роботи
        const usersWithPayment = regionEngineers.filter(engineer => {
          const total = engineerHours[engineer.name]?.total || 0;
          return total > 0;
        });
        
        const days = Array.from({length: 31}, (_, i) => i + 1);
        
        // Табель часу
        const timesheetTable = `
          <h4>Табель часу - Регіон: ${region}</h4>
          <table>
            <thead>
              <tr>
                <th>ПІБ</th>
                ${days.map(d => {
                  const date = new Date(personnelFilters.year, personnelFilters.month - 1, d);
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  return `<th${isWeekend ? ' class="weekend"' : ''}>${d}</th>`;
                }).join('')}
                <th>Всього годин</th>
              </tr>
            </thead>
            <tbody>
              ${usersWithPayment.map(engineer => `
                <tr>
                  <td>${engineer.name}</td>
                  ${days.map(d => {
                    const date = new Date(personnelFilters.year, personnelFilters.month - 1, d);
                    const dayOfWeek = date.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    return `<td${isWeekend ? ' class="weekend"' : ''}>${engineerHours[engineer.name][d] || 0}</td>`;
                  }).join('')}
                  <td>${engineerHours[engineer.name].total || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        
        // Таблиця нарахування
        const accrualTable = `
          <h4>Таблиця нарахування по персоналу - Регіон: ${region}</h4>
          <table>
            <thead>
              <tr>
                <th>ПІБ</th>
                <th>Ставка</th>
                <th>Фактично відпрацьовано годин</th>
                <th>Понаднормові роботи, год</th>
                <th>Ціна за год, понаднормові</th>
                <th>Доплата за понаднормові</th>
                <th>Відпрацьована ставка, грн</th>
                <th>Премія за виконання сервісних робіт, грн</th>
                <th>Загальна сума по оплаті за місяць</th>
              </tr>
            </thead>
            <tbody>
              ${usersWithPayment.map(engineer => {
                const salary = engineerSalaries[engineer.name];
                return `
                  <tr>
                    <td>${engineer.name}</td>
                    <td>${salary.baseRate}</td>
                    <td>${salary.totalHours}</td>
                    <td>${salary.overtimeHours}</td>
                    <td>${salary.overtimeRate.toFixed(2)}</td>
                    <td>${salary.overtimePay.toFixed(2)}</td>
                    <td>${salary.workedRate}</td>
                    <td>${salary.serviceBonus.toFixed(2)}</td>
                    <td>${salary.totalPay.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
        
        // Деталізація виконаних робіт
        const workDetailsTable = `
          <h4>Деталізація виконаних робіт - Регіон: ${region}</h4>
          <table class="details">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Інженер</th>
                <th>Клієнт</th>
                <th>Адреса</th>
                <th>Обладнання</th>
                <th><b>Найменування робіт</b></th>
                <th>Компанія виконавець</th>
                <th>Загальна сума з матеріалами</th>
                <th>Вартість робіт</th>
                <th>Загальна премія за послугу (Без розподілення)</th>
              </tr>
            </thead>
            <tbody>
              ${regionTasks.map(task => {
                const engineers = [
                  task.engineer1 || '',
                  task.engineer2 || '',
                  task.engineer3 || '',
                  task.engineer4 || '',
                  task.engineer5 || '',
                  task.engineer6 || ''
                ].filter(eng => eng && eng.trim().length > 0);
                
                const workPrice = parseFloat(task.workPrice) || 0;
                const serviceBonus = workPrice * 0.25;
                
                return `
                  <tr>
                    <td>${task.date || ''}</td>
                    <td>${engineers.join(', ')}</td>
                    <td>${task.client || ''}</td>
                    <td>${task.address || ''}</td>
                    <td>${task.equipment || ''}</td>
                    <td>${task.work || ''}</td>
                    <td>${task.company || ''}</td>
                    <td>${task.serviceTotal || ''}</td>
                    <td>${task.workPrice || ''}</td>
                    <td>${serviceBonus ? serviceBonus.toFixed(2) : '0.00'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
        
        return {
          timesheetTable,
          accrualTable,
          workDetailsTable
        };
      };
      
      // Генеруємо HTML для кожного регіону
      const regionsContent = Object.keys(regionGroups).map(region => {
        const regionReport = generateRegionReport(region);
        return `
          <div style="margin-bottom: 40px; page-break-after: always;">
            <h3 style="color: #1976d2; border-bottom: 2px solid #1976d2; padding-bottom: 10px;">Регіон: ${region}</h3>
            ${regionReport.timesheetTable}
            ${regionReport.accrualTable}
            ${regionReport.workDetailsTable}
          </div>
        `;
      }).join('');
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${reportTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f8fafc; color: #222; padding: 24px; }
            h2 { color: #1976d2; }
            h3 { color: #1976d2; margin-top: 30px; }
            h4 { color: #1976d2; margin-top: 20px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
            th, td { border: 1px solid #000; padding: 6px 10px; text-align: center; }
            th { background: #ffe600; color: #222; }
            .details th { background: #e0e0e0; }
            .weekend { background: #e0e0e0 !important; color: #222 !important; }
            @media print {
              .page-break { page-break-after: always; }
            }
          </style>
        </head>
        <body>
          <h2>${reportTitle}</h2>
          ${regionsContent}
        </body>
        </html>
      `;
      
      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
      
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
