import React, { useState, useEffect } from 'react';
import { tasksAPI } from '../utils/tasksAPI';
import { authenticatedFetch } from '../utils/api.js';

const AccountantReportsModal = ({ isOpen, onClose, user, tasks, users }) => {
  const [reportFilters, setReportFilters] = useState({
    dateFrom: '',
    dateTo: '',
    region: '',
    detailed: false
  });
  const [personnelFilters, setPersonnelFilters] = useState({
    month: new Date().getMonth() + 1, // Поточний місяць
    year: new Date().getFullYear(), // Поточний рік
    showDismissed: false // Чекбокс для показу звільнених працівників
  });
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState('financial'); // 'financial' або 'personnel'
  
  // Стан для зберігання даних про зарплати
  const [payData, setPayData] = useState(() => {
    const saved = localStorage.getItem(`payData_${personnelFilters.year}_${personnelFilters.month}`);
    return saved ? JSON.parse(saved) : {};
  });

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

  // Оновлення payData при зміні місяця/року
  useEffect(() => {
    const saved = localStorage.getItem(`payData_${personnelFilters.year}_${personnelFilters.month}`);
    setPayData(saved ? JSON.parse(saved) : {});
  }, [personnelFilters.year, personnelFilters.month]);

  // Збереження payData в localStorage
  useEffect(() => {
    localStorage.setItem(`payData_${personnelFilters.year}_${personnelFilters.month}`, JSON.stringify(payData));
  }, [payData, personnelFilters.year, personnelFilters.month]);

  const loadRegions = async () => {
    try {
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001/api'
        : 'https://darex-trading-solutions.onrender.com/api';
      
      const response = await authenticatedFetch(`${API_BASE_URL}/tasks`);
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

  // Функція для зміни параметрів виплат
  const handlePayChange = (userId, field, value) => {
    setPayData(prev => {
      const userPay = prev[userId] || { salary: '', bonus: '' };
      const newUserPay = { ...userPay, [field]: value };
      return { ...prev, [userId]: newUserPay };
    });
  };

  const generateReport = async (format) => {
    if (!reportFilters.dateFrom || !reportFilters.dateTo) {
      alert('Будь ласка, вкажіть період для звіту');
      return;
    }

    setLoading(true);
    try {
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001/api'
        : 'https://darex-trading-solutions.onrender.com/api';
      
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
        // Отримуємо HTML звіт через authenticatedFetch
        console.log('[REPORTS] Frontend - відправляємо запит на HTML:', `${API_BASE_URL}/reports/financial?${params}`);
        const response = await authenticatedFetch(`${API_BASE_URL}/reports/financial?${params}`);
        console.log('[REPORTS] Frontend - отримано відповідь:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries())
        });
        if (response.ok) {
          const html = await response.text();
          // Відкриваємо HTML звіт в новій вкладці
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(html);
            win.document.close();
          } else {
            alert('Будь ласка, дозвольте спливаючі вікна для перегляду звіту');
          }
        } else {
          alert('Помилка генерації звіту');
        }
      } else if (format === 'excel') {
        // Завантажуємо Excel файл
        console.log('[REPORTS] Frontend - відправляємо запит на Excel:', `${API_BASE_URL}/reports/financial?${params}`);
        const response = await authenticatedFetch(`${API_BASE_URL}/reports/financial?${params}`);
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
    console.log('[PERSONNEL REPORT] Starting generation...');
    console.log('[PERSONNEL REPORT] Filters:', personnelFilters);
    
    if (!personnelFilters.month || !personnelFilters.year) {
      console.log('[PERSONNEL REPORT] Missing month or year');
      alert('Будь ласка, вкажіть місяць та рік для звіту');
      return;
    }

    setLoading(true);
    try {
      console.log('[PERSONNEL REPORT] Запит до бази даних для отримання всіх завдань...');
      
      // ЗАПИТ ДО БАЗИ ДАНИХ: Отримуємо всі завдання з API (з великим лімітом для звіту)
      const allTasksFromDB = await tasksAPI.getAllForReport();
      console.log('[PERSONNEL REPORT] Завдання завантажено з БД:', allTasksFromDB.length);
      
      // Переконуємось, що month є числом
      // Важливо: personnelFilters.month має бути числом 1-12 від користувача
      let monthNum = personnelFilters.month;
      if (typeof monthNum === 'string') {
        monthNum = parseInt(monthNum, 10);
      }
      monthNum = Number(monthNum); // Гарантуємо, що це число
      
      console.log('[PERSONNEL REPORT] DEBUG: Raw month from filter:', personnelFilters.month, 'Type:', typeof personnelFilters.month);
      console.log('[PERSONNEL REPORT] DEBUG: Converted monthNum:', monthNum, 'Type:', typeof monthNum);
      
      const months = [
        'Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'
      ];
      const monthIndex = monthNum - 1;
      const monthName = months[monthIndex] || months[0];
      const reportTitle = `Звіт по табелю часу та виконаних робіт за ${monthName} ${personnelFilters.year}`;
      console.log('[PERSONNEL REPORT] DEBUG: monthIndex:', monthIndex, 'monthName:', monthName);
      console.log('[PERSONNEL REPORT] Report title:', reportTitle);
      
      // Отримуємо всіх інженерів (service роль)
      // Якщо чекбокс "Показати всіх працівників" не активований, виключаємо звільнених
      const allEngineers = users.filter(u => {
        if (u.role !== 'service') return false;
        const isDismissed = u.dismissed === true || u.dismissed === 'true' || u.dismissed === 1;
        // Якщо чекбокс не активований, виключаємо звільнених
        if (isDismissed && !personnelFilters.showDismissed) {
          return false;
        }
        return true;
      });
      console.log('[PERSONNEL REPORT] All engineers found:', allEngineers.length);
      console.log('[PERSONNEL REPORT] All users roles:', users.map(u => ({name: u.name, role: u.role})));
      console.log('[PERSONNEL REPORT] Engineers details:', allEngineers.map(e => ({name: e.name, region: e.region, id: e.id || e._id})));
      
      // Отримуємо заявки за вказаний місяць/рік
      // Важливо: monthNum - це число 1-12 від користувача, але Date() використовує місяці 0-11
      // Створюємо дати в локальному часовому поясі
      const startDate = new Date(personnelFilters.year, monthNum - 1, 1);
      startDate.setHours(0, 0, 0, 0); // Початок дня (локальний час)
      
      // Останній день вибраного місяця
      const endDate = new Date(personnelFilters.year, monthNum, 0); // День 0 = останній день попереднього місяця
      endDate.setHours(23, 59, 59, 999); // Кінець дня (локальний час)
      
      console.log('[PERSONNEL REPORT] Selected month:', monthNum, '(', monthName, ')');
      console.log('[PERSONNEL REPORT] Date range (local):', startDate.toString(), 'to', endDate.toString());
      
      // Розраховуємо кількість робочих днів та норму годин
      const daysInMonth = new Date(personnelFilters.year, monthNum, 0).getDate();
      let workDays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(personnelFilters.year, monthNum - 1, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) workDays++;
      }
      const workHoursNorm = workDays * 8;
      
      // Отримуємо табель з localStorage (якщо є)
      const storageKey = `timesheetData_${personnelFilters.year}_${monthNum}`;
      const serviceStorageKey = `serviceTimesheetData_${personnelFilters.year}_${monthNum}`;
      const timesheetDataFromStorage = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const serviceTimesheetDataFromStorage = JSON.parse(localStorage.getItem(serviceStorageKey) || '{}');
      
      const monthTasks = allTasksFromDB.filter(t => {
        if (t.status !== 'Виконано') return false;
        if (!t.date) return false;
        
        // Парсимо дату завдання та нормалізуємо до початку дня в локальному часі
        let taskDate = new Date(t.date);
        // Якщо дата прийшла як рядок типу "YYYY-MM-DD", парсимо її правильно
        if (typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
          const [year, month, day] = t.date.split('-').map(Number);
          taskDate = new Date(year, month - 1, day);
        }
        taskDate.setHours(0, 0, 0, 0); // Нормалізуємо до початку дня в локальному часі
        
        // Додаткова перевірка: переконуємося, що місяць та рік співпадають
        const taskMonth = taskDate.getMonth() + 1; // getMonth() повертає 0-11
        const taskYear = taskDate.getFullYear();
        const monthMatches = taskMonth === monthNum;
        const yearMatches = taskYear === personnelFilters.year;
        
        // Порівнюємо дати (обидві в локальному часі) та перевіряємо місяць/рік
        const isInRange = taskDate >= startDate && taskDate <= endDate && monthMatches && yearMatches;
        if (isInRange) {
          console.log(`[PERSONNEL REPORT] Task date in range: ${t.date} (parsed as ${taskDate.toString()}, month: ${taskMonth}, year: ${taskYear})`);
        } else {
          console.log(`[PERSONNEL REPORT] Task date OUT of range: ${t.date} (parsed as ${taskDate.toString()}, month: ${taskMonth}, year: ${taskYear}, expected month: ${monthNum}, expected year: ${personnelFilters.year})`);
        }
        return isInRange;
      });
      console.log('[PERSONNEL REPORT] Month tasks found:', monthTasks.length);
      
      // ДЛЯ ПРЕМІЙ: Беремо заявки тільки за ВИБРАНИЙ МІСЯЦЬ з перевіркою дати затвердження
      // Важливо: премії нараховуються за попередній місяць, тобто якщо вибрано Жовтень,
      // то премії за Жовтень були затверджені в Листопаді. Тому додаємо +1 до місяця
      let approvalMonth = monthNum + 1; // Місяць затвердження (наступний місяць)
      let approvalYear = personnelFilters.year;
      if (approvalMonth > 12) {
        approvalMonth = 1;
        approvalYear = personnelFilters.year + 1;
      }
      
      console.log('[PERSONNEL REPORT] Selected month:', monthNum, '(', monthName, ')');
      console.log('[PERSONNEL REPORT] Looking for bonuses approved in:', approvalMonth, '(', months[approvalMonth - 1], ')', approvalYear);
      
      const allTasksForBonuses = allTasksFromDB.filter(t => {
        if (t.status !== 'Виконано') return false;
        if (!t.date) return false;
        
        // Перевіряємо дату затвердження премії
        let bonusMonth = approvalMonth;
        let bonusYear = approvalYear;
        
        if (t.bonusApprovalDate) {
          let bonusDate;
          // Обробляємо різні формати дат
          if (/^\d{4}-\d{2}-\d{2}$/.test(t.bonusApprovalDate)) {
            // Формат YYYY-MM-DD
            const [year, month] = t.bonusApprovalDate.split('-');
            bonusDate = new Date(parseInt(year), parseInt(month) - 1, 1);
          } else if (/^\d{2}-\d{4}$/.test(t.bonusApprovalDate)) {
            // Формат MM-YYYY
            const [month, year] = t.bonusApprovalDate.split('-');
            bonusDate = new Date(parseInt(year), parseInt(month) - 1, 1);
          } else {
            // Спробуємо стандартний парсинг
            bonusDate = new Date(t.bonusApprovalDate);
          }
          
          if (!isNaN(bonusDate.getTime())) {
            bonusMonth = bonusDate.getMonth() + 1;
            bonusYear = bonusDate.getFullYear();
          }
        } else if (t.approvedByAccountantDate) {
          const approvalDate = new Date(t.approvedByAccountantDate);
          if (!isNaN(approvalDate.getTime())) {
            bonusMonth = approvalDate.getMonth() + 1;
            bonusYear = approvalDate.getFullYear();
          }
        } else {
          // Якщо немає bonusApprovalDate та approvedByAccountantDate, 
          // використовуємо дату виконання робіт як запасний варіант
          const workDate = new Date(t.date);
          if (!isNaN(workDate.getTime())) {
            bonusMonth = workDate.getMonth() + 1;
            bonusYear = workDate.getFullYear();
          }
        }
        
        // Нараховуємо премію тільки якщо дата затвердження відповідає наступному місяцю від вибраного
        // (бо премії за місяць X затверджуються в місяці X+1)
        return bonusMonth === approvalMonth && bonusYear === approvalYear;
      });
      console.log('[PERSONNEL REPORT] Tasks for bonuses (with approval date check) found:', allTasksForBonuses.length);
      
      
      // Функція для перевірки затвердження
      const isApproved = (value) => value === true || value === 'Підтверджено';
      
      // Фільтруємо заявки з затвердженням (для табелю часу - тільки за місяць)
      const approvedTasks = monthTasks.filter(task => 
        isApproved(task.approvedByWarehouse) && 
        isApproved(task.approvedByAccountant)
      );
      
      // Фільтруємо заявки з затвердженням (для премій - за весь рік)
      const approvedTasksForBonuses = allTasksForBonuses.filter(task => 
        isApproved(task.approvedByWarehouse) && 
        isApproved(task.approvedByAccountant)
      );
      
      
      // Групуємо заявки по регіонах (для табелю часу - тільки за місяць)
      const regionGroups = {};
      approvedTasks.forEach(task => {
        const region = task.serviceRegion || 'Невідомо';
        if (!regionGroups[region]) {
          regionGroups[region] = [];
        }
        regionGroups[region].push(task);
      });
      
      // Групуємо заявки по регіонах (для премій - за весь рік)
      const regionGroupsForBonuses = {};
      approvedTasksForBonuses.forEach(task => {
        const region = task.serviceRegion || 'Невідомо';
        if (!regionGroupsForBonuses[region]) {
          regionGroupsForBonuses[region] = [];
        }
        regionGroupsForBonuses[region].push(task);
      });
      
      // Групуємо заявки по регіонах для деталізації (як у регіонального керівника - по вибраному місяцю)
      // Фільтруємо заявки для деталізації по bonusApprovalDate, але використовуємо вибраний місяць, а не наступний
      const regionGroupsForDetails = {};
      const approvedTasksForDetails = allTasksFromDB.filter(t => {
        if (t.status !== 'Виконано') return false;
        if (!t.date) return false;
        if (!isApproved(t.approvedByWarehouse) || !isApproved(t.approvedByAccountant)) return false;
        
        // Використовуємо ту саму логіку, що й у регіонального керівника
        let bonusApprovalDate = t.bonusApprovalDate;
        if (!bonusApprovalDate) {
          if (t.approvedByAccountantDate) {
            const approvalDate = new Date(t.approvedByAccountantDate);
            if (!isNaN(approvalDate.getTime())) {
              const month = String(approvalDate.getMonth() + 1).padStart(2, '0');
              const year = approvalDate.getFullYear();
              bonusApprovalDate = `${month}-${year}`;
            }
          } else {
            return false; // Якщо немає bonusApprovalDate, не показуємо в деталізації
          }
        }
        
        // Конвертуємо формат дати
        if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
          const [year, month] = bonusApprovalDate.split('-');
          bonusApprovalDate = `${month}-${year}`;
        }
        
        const workDate = new Date(t.date);
        const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
        const approvalMonth = parseInt(approvalMonthStr);
        const approvalYear = parseInt(approvalYearStr);
        const workMonth = workDate.getMonth() + 1;
        const workYear = workDate.getFullYear();
        let bonusMonth, bonusYear;
        if (workMonth === approvalMonth && workYear === approvalYear) {
          bonusMonth = workMonth;
          bonusYear = workYear;
        } else {
          if (approvalMonth === 1) {
            bonusMonth = 12;
            bonusYear = approvalYear - 1;
          } else {
            bonusMonth = approvalMonth - 1;
            bonusYear = approvalYear;
          }
        }
        // Використовуємо вибраний місяць, а не наступний (як у регіонального керівника)
        return bonusMonth === monthNum && bonusYear === personnelFilters.year;
      });
      
      approvedTasksForDetails.forEach(task => {
        const region = task.serviceRegion || 'Невідомо';
        if (!regionGroupsForDetails[region]) {
          regionGroupsForDetails[region] = [];
        }
        regionGroupsForDetails[region].push(task);
      });
      
      // Логування для діагностики
      console.log(`[PERSONNEL REPORT] Month: ${personnelFilters.month}, Year: ${personnelFilters.year}`);
      console.log(`[PERSONNEL REPORT] Total tasks found: ${monthTasks.length}`);
      console.log(`[PERSONNEL REPORT] Approved tasks: ${approvedTasks.length}`);
      console.log(`[PERSONNEL REPORT] Engineers found: ${allEngineers.length}`);
      console.log(`[PERSONNEL REPORT] Regions: ${Object.keys(regionGroups).join(', ')}`);
      
      // Генеруємо звіт з групуванням по регіонам
      const generateRegionReport = (region) => {
        console.log(`[PERSONNEL REPORT] Generating report for region: ${region}`);
        const regionTasks = regionGroups[region] || [];
        const regionTasksForBonuses = regionGroupsForBonuses[region] || [];
        const regionTasksForDetails = regionGroupsForDetails[region] || [];
        // Фільтруємо інженерів по регіону
        // Якщо чекбокс "Показати всіх працівників" не активований, виключаємо звільнених
        const regionEngineers = allEngineers.filter(engineer => {
          const matchesRegion = engineer.region === region || engineer.region === 'Україна';
          const isDismissed = engineer.dismissed === true || engineer.dismissed === 'true' || engineer.dismissed === 1;
          // Якщо чекбокс не активований, виключаємо звільнених
          if (isDismissed && !personnelFilters.showDismissed) {
            return false;
          }
          return matchesRegion;
        });
        console.log(`[PERSONNEL REPORT] Region ${region}: tasks=${regionTasks.length}, tasksForBonuses=${regionTasksForBonuses.length}, engineers=${regionEngineers.length}`);
        console.log(`[PERSONNEL REPORT] Region ${region}: engineers details:`, regionEngineers.map(e => ({name: e.name, region: e.region})));
        console.log(`[PERSONNEL REPORT] Region ${region}: Using monthly tasks for both timesheet and bonuses (like regional manager)`);
        console.log(`[PERSONNEL REPORT] Region ${region}: Tasks for bonuses dates:`, regionTasksForBonuses.map(t => ({date: t.date, bonusApprovalDate: t.bonusApprovalDate, approvedByAccountantDate: t.approvedByAccountantDate})));
        console.log(`[PERSONNEL REPORT] Region ${region}: Engineers in tasks:`, regionTasks.map(t => ({
          requestNumber: t.requestNumber,
          engineers: [
            (t.engineer1 || '').trim(),
            (t.engineer2 || '').trim(),
            (t.engineer3 || '').trim(),
            (t.engineer4 || '').trim(),
            (t.engineer5 || '').trim(),
            (t.engineer6 || '').trim()
          ].filter(eng => eng && eng.length > 0)
        })));
        
        // Розраховуємо кількість робочих днів та норму годин для конкретного місяця (як у регіонального керівника)
        const daysInMonth = new Date(personnelFilters.year, monthNum, 0).getDate();
        let workDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(personnelFilters.year, monthNum - 1, d);
          const dayOfWeek = date.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) workDays++;
        }
        const workHoursNorm = workDays * 8; // Норма робочих годин на місяць (робочі дні * 8 годин)
        
        // Якщо немає інженерів з роллю service, спробуємо знайти їх в завданнях
        let usersWithPayment = regionEngineers;
        if (usersWithPayment.length === 0) {
          console.log(`[PERSONNEL REPORT] No engineers with 'service' role found for region ${region}, looking in tasks...`);
          
          // Збираємо всіх унікальних інженерів з завдань регіону
          const engineersFromTasks = new Set();
          regionTasks.forEach(task => {
            [
              (task.engineer1 || '').trim(),
              (task.engineer2 || '').trim(),
              (task.engineer3 || '').trim(),
              (task.engineer4 || '').trim(),
              (task.engineer5 || '').trim(),
              (task.engineer6 || '').trim()
            ].filter(eng => eng && eng.length > 0).forEach(eng => engineersFromTasks.add(eng));
          });
          
          console.log(`[PERSONNEL REPORT] Engineers found in tasks:`, Array.from(engineersFromTasks));
          
          // Створюємо об'єкти інженерів для тих, хто згадується в завданнях
          // Якщо чекбокс "Показати всіх працівників" не активований, виключаємо звільнених
          usersWithPayment = Array.from(engineersFromTasks)
            .filter(engineerName => {
              const user = users.find(u => (u.name || '').trim() === engineerName);
              const isDismissed = user?.dismissed === true || user?.dismissed === 'true' || user?.dismissed === 1;
              // Якщо чекбокс не активований, виключаємо звільнених
              if (isDismissed && !personnelFilters.showDismissed) {
                return false;
              }
              return true; // Показуємо всіх, якщо чекбокс активований або користувач не звільнений
            })
            .map(engineerName => ({
              name: engineerName,
              region: region,
              id: `temp_${engineerName.replace(/\s+/g, '_')}`,
              role: 'service' // Призначаємо ролю service для відображення
            }));
          
          console.log(`[PERSONNEL REPORT] Created engineer objects:`, usersWithPayment);
        }
        
        // Створюємо табель часу - використовуємо дані з localStorage, якщо є, інакше розраховуємо з завдань
        const engineerHours = {};
        usersWithPayment.forEach(engineer => {
          engineerHours[engineer.name] = {};
          const engineerId = engineer.id || engineer._id;
          
          // Перевіряємо, чи є дані в localStorage (спочатку serviceTimesheetData, потім timesheetData)
          const serviceData = serviceTimesheetDataFromStorage[engineerId];
          const regularData = timesheetDataFromStorage[engineerId];
          const userTimesheetData = serviceData || regularData;
          
          if (userTimesheetData && userTimesheetData.total) {
            // Використовуємо дані з localStorage
            for (let day = 1; day <= daysInMonth; day++) {
              engineerHours[engineer.name][day] = Number(userTimesheetData[day]) || 0;
            }
            engineerHours[engineer.name].total = Number(userTimesheetData.total) || 0;
          } else {
            // Якщо немає даних в localStorage, розраховуємо з завдань
            for (let day = 1; day <= daysInMonth; day++) {
              engineerHours[engineer.name][day] = 0;
            }
            engineerHours[engineer.name].total = 0;
          }
        });
        
        // Якщо дані не були взяті з localStorage, розраховуємо години з завдань
        usersWithPayment.forEach(engineer => {
          if (engineerHours[engineer.name].total === 0) {
            // Перевіряємо, чи є завдання для цього інженера
            const normalizedEngineerName = (engineer.name || '').trim();
            const engineerTasks = regionTasks.filter(task => {
              const engineers = [
                (task.engineer1 || '').trim(),
                (task.engineer2 || '').trim(),
                (task.engineer3 || '').trim(),
                (task.engineer4 || '').trim(),
                (task.engineer5 || '').trim(),
                (task.engineer6 || '').trim()
              ];
              return engineers.includes(normalizedEngineerName);
            });
            
            if (engineerTasks.length > 0) {
              // СТАБІЛЬНА МОДЕЛЬ (як у регіонального керівника):
              // якщо інженер має хоча б одне завдання в місяці, ставимо 8 годин у ВСІ робочі дні місяця
              for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(personnelFilters.year, monthNum - 1, d);
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                engineerHours[engineer.name][d] = isWeekend ? 0 : 8;
              }
              // Перераховуємо загальні години
              engineerHours[engineer.name].total = Object.values(engineerHours[engineer.name])
                .filter(val => typeof val === 'number' && val !== engineerHours[engineer.name].total)
                .reduce((sum, hours) => sum + hours, 0);
            }
          }
        });
        
        // Розраховуємо зарплати (логіка як у регіонального керівника)
        const engineerSalaries = {};
        console.log(`[PERSONNEL REPORT] Region ${region}: Processing ${usersWithPayment.length} engineers for bonus calculation:`, usersWithPayment.map(e => e.name));
        usersWithPayment.forEach(engineer => {
          // Нормалізуємо ім'я інженера для порівнянь
          const normalizedEngineerName = (engineer.name || '').trim();
          
          // Використовуємо реальну суму годин з табелю
          const total = engineerHours[engineer.name]?.total || 0;
          const salary = Number(payData[engineer.id || engineer._id]?.salary) || 25000;
          const bonus = Number(payData[engineer.id || engineer._id]?.bonus) || 0;
          const overtime = Math.max(0, total - workHoursNorm);
          const overtimeRate = workHoursNorm > 0 ? (salary / workHoursNorm) * 2 : 0; // 2x як у регіонального керівника
          const overtimePay = overtime * overtimeRate;
          // Розраховуємо пропорційну ставку (як у регіонального керівника)
          const basePay = Math.round(salary * Math.min(total, workHoursNorm) / workHoursNorm);
          
          // Розрахунок премії за сервісні роботи (як у регіонального керівника - по вибраному місяцю)
          let engineerBonus = 0;
          // Використовуємо allTasksFromDB з фільтрацією по вибраному місяцю, як у регіонального керівника
          allTasksFromDB.forEach(task => {
            // Діагностичне логування для заявки KV-0000080
            const isDebugTask = task.requestNumber === 'KV-0000080';
            
            if (task.status !== 'Виконано') {
              if (isDebugTask) console.log(`[DEBUG BONUS] ${task.requestNumber}: статус не "Виконано": ${task.status}`);
              return;
            }
            if (!task.date) {
              if (isDebugTask) console.log(`[DEBUG BONUS] ${task.requestNumber}: немає дати`);
              return;
            }
            if (!isApproved(task.approvedByWarehouse)) {
              if (isDebugTask) console.log(`[DEBUG BONUS] ${task.requestNumber}: не затверджено завскладом: ${task.approvedByWarehouse}`);
              return;
            }
            if (!isApproved(task.approvedByAccountant)) {
              if (isDebugTask) console.log(`[DEBUG BONUS] ${task.requestNumber}: не затверджено бухгалтером: ${task.approvedByAccountant}`);
              return;
            }
            if (task.serviceRegion !== region) {
              if (isDebugTask) console.log(`[DEBUG BONUS] ${task.requestNumber}: регіон не співпадає: ${task.serviceRegion} !== ${region}`);
              return;
            }
            
            // Використовуємо ту саму логіку, що й у регіонального керівника
            let bonusApprovalDate = task.bonusApprovalDate;
            if (!bonusApprovalDate) {
              if (task.approvedByAccountantDate) {
                const approvalDate = new Date(task.approvedByAccountantDate);
                if (!isNaN(approvalDate.getTime())) {
                  const month = String(approvalDate.getMonth() + 1).padStart(2, '0');
                  const year = approvalDate.getFullYear();
                  bonusApprovalDate = `${month}-${year}`;
                } else {
                  if (isDebugTask) console.log(`[DEBUG BONUS] ${task.requestNumber}: невалідна дата затвердження бухгалтером`);
                  return; // Якщо немає дати затвердження, пропускаємо
                }
              } else {
                if (isDebugTask) console.log(`[DEBUG BONUS] ${task.requestNumber}: немає bonusApprovalDate та approvedByAccountantDate`);
                return; // Якщо немає bonusApprovalDate, пропускаємо
              }
            }
            
            // Конвертуємо формат дати
            if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
              const [year, month] = bonusApprovalDate.split('-');
              bonusApprovalDate = `${month}-${year}`;
            }
            
            const workDate = new Date(task.date);
            const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
            const approvalMonth = parseInt(approvalMonthStr);
            const approvalYear = parseInt(approvalYearStr);
            const workMonth = workDate.getMonth() + 1;
            const workYear = workDate.getFullYear();
            let bonusMonth, bonusYear;
            if (workMonth === approvalMonth && workYear === approvalYear) {
              bonusMonth = workMonth;
              bonusYear = workYear;
            } else {
              if (approvalMonth === 1) {
                bonusMonth = 12;
                bonusYear = approvalYear - 1;
              } else {
                bonusMonth = approvalMonth - 1;
                bonusYear = approvalYear;
              }
            }
            
            if (isDebugTask) {
              console.log(`[DEBUG BONUS] ${task.requestNumber}:`, {
                date: task.date,
                bonusApprovalDate: task.bonusApprovalDate,
                workMonth,
                approvalMonth,
                bonusMonth,
                bonusYear,
                monthNum,
                personnelFiltersYear: personnelFilters.year,
                matches: bonusMonth === monthNum && bonusYear === personnelFilters.year
              });
            }
            
            // Фільтруємо по вибраному місяцю, як у регіонального керівника
            if (bonusMonth === monthNum && bonusYear === personnelFilters.year) {
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
              
              if (isDebugTask) {
                console.log(`[DEBUG BONUS] ${task.requestNumber}:`, {
                  engineers,
                  engineerName: engineer.name,
                  normalizedEngineerName,
                  includes: engineers.includes(normalizedEngineerName),
                  workPrice,
                  bonusVal,
                  bonusPerEngineer: bonusVal / engineers.length
                });
              }
              
              if (engineers.includes(normalizedEngineerName) && engineers.length > 0) {
                engineerBonus += bonusVal / engineers.length;
                if (isDebugTask) {
                  console.log(`[DEBUG BONUS] ${task.requestNumber}: премія додана для ${normalizedEngineerName}, сума: ${bonusVal / engineers.length}`);
                }
              } else if (isDebugTask) {
                console.log(`[DEBUG BONUS] ${task.requestNumber}: інженер ${normalizedEngineerName} не знайдено в списку:`, engineers);
              }
            } else {
              if (isDebugTask) {
                console.log(`[DEBUG BONUS] ${task.requestNumber}: не співпадає місяць: bonusMonth=${bonusMonth} !== monthNum=${monthNum} або bonusYear=${bonusYear} !== year=${personnelFilters.year}`);
              }
            }
          });
          
          const payout = basePay + overtimePay + bonus + engineerBonus;
          
          engineerSalaries[engineer.name] = {
            baseRate: salary,
            totalHours: total,
            overtimeHours: overtime,
            hourlyRate: workHoursNorm > 0 ? salary / workHoursNorm : 0,
            overtimeRate: overtimeRate,
            overtimePay: overtimePay,
            workedRate: basePay,
            serviceBonus: engineerBonus,
            totalPay: payout
          };
        });
        
        const days = Array.from({length: 31}, (_, i) => i + 1);
        
        // Табель часу
        const timesheetTable = `
          <h4>Табель часу - Регіон: ${region}</h4>
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>ПІБ</th>
                ${days.map(d => {
                  const date = new Date(personnelFilters.year, monthNum - 1, d);
                  const dayOfWeek = date.getDay();
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  return `<th${isWeekend ? ' class="weekend"' : ''}>${d}</th>`;
                }).join('')}
                <th>Всього годин</th>
              </tr>
            </thead>
            <tbody>
              ${usersWithPayment.map((engineer, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${engineer.name}</td>
                  ${days.map(d => {
                    const date = new Date(personnelFilters.year, monthNum - 1, d);
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
                <th>№</th>
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
              ${usersWithPayment.map((engineer, index) => {
                const salaryData = engineerSalaries[engineer.name];
                // Перевіряємо, чи існують дані про зарплату (якщо інженер не має завдань, salaryData може бути undefined)
                if (!salaryData) {
                  // Якщо немає даних, створюємо порожні значення
                  const currentSalary = Number(payData[engineer.id || engineer._id]?.salary) || 25000;
                  const total = 0;
                  return `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${engineer.name}</td>
                      <td><input type="number" value="${currentSalary}" onchange="window.handlePayChange('${engineer.id || engineer._id}', 'salary', this.value)" style="width:90px; border: 1px solid #ccc; padding: 4px;" /></td>
                      <td>${total}</td>
                      <td>0</td>
                      <td>${workHoursNorm > 0 ? ((currentSalary / workHoursNorm) * 2).toFixed(2) : '0.00'}</td>
                      <td>0.00</td>
                      <td>0</td>
                      <td>0.00</td>
                      <td>0.00</td>
                    </tr>
                  `;
                }
                const currentSalary = Number(payData[engineer.id || engineer._id]?.salary) || 25000;
                return `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${engineer.name}</td>
                    <td><input type="number" value="${currentSalary}" onchange="window.handlePayChange('${engineer.id || engineer._id}', 'salary', this.value)" style="width:90px; border: 1px solid #ccc; padding: 4px;" /></td>
                    <td>${salaryData.totalHours}</td>
                    <td>${salaryData.overtimeHours}</td>
                    <td>${salaryData.overtimeRate.toFixed(2)}</td>
                    <td>${salaryData.overtimePay.toFixed(2)}</td>
                    <td>${salaryData.workedRate}</td>
                    <td>${salaryData.serviceBonus.toFixed(2)}</td>
                    <td>${salaryData.totalPay.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top: 16px; font-size: 14px; color: #666;">
            <p><strong>Кількість робочих днів у місяці:</strong> ${workDays}</p>
            <p><strong>Норма робочих годин у місяці:</strong> ${workHoursNorm}</p>
          </div>
        `;
        
        // Групуємо завдання по номеру заявки для деталізації
        // Використовуємо regionTasksForDetails (фільтровані по bonusApprovalDate для вибраного місяця), як у регіонального керівника
        const tasksByRequestNumber = {};
        regionTasksForDetails.forEach(task => {
          const requestNumber = task.requestNumber || 'Без номера';
          if (!tasksByRequestNumber[requestNumber]) {
            tasksByRequestNumber[requestNumber] = [];
          }
          tasksByRequestNumber[requestNumber].push(task);
        });
        
        // Обчислюємо загальні суми по регіону
        let totalServiceTotal = 0;
        let totalWorkPrice = 0;
        let totalServiceBonus = 0;
        let totalEngineerBonuses = 0;
        let requestNumberIndex = 0; // Лічильник для нумерації заявок
        
        // Деталізація виконаних робіт з групуванням по номеру заявки
        const requestNumberSections = Object.keys(tasksByRequestNumber).map(requestNumber => {
          requestNumberIndex++; // Збільшуємо номер заявки
          const tasksForRequest = tasksByRequestNumber[requestNumber];
          
          // Обчислюємо суми по номеру заявки
          let requestServiceTotal = 0;
          let requestWorkPrice = 0;
          let requestServiceBonus = 0;
          let requestEngineerBonuses = 0;
          let engineerIndex = 0; // Лічильник для нумерації інженерів в межах заявки
          
          const requestRows = tasksForRequest.map(task => {
            const engineers = [
              (task.engineer1 || '').trim(),
              (task.engineer2 || '').trim(),
              (task.engineer3 || '').trim(),
              (task.engineer4 || '').trim(),
              (task.engineer5 || '').trim(),
              (task.engineer6 || '').trim()
            ].filter(eng => eng && eng.length > 0);
            
            const workPrice = parseFloat(task.workPrice) || 0;
            const serviceBonus = workPrice * 0.25;
            const bonusPerEngineer = engineers.length > 0 ? serviceBonus / engineers.length : 0;
            const serviceTotal = parseFloat(task.serviceTotal) || 0;
            
            // Додаємо до сум
            requestServiceTotal += serviceTotal;
            requestWorkPrice += workPrice;
            requestServiceBonus += serviceBonus;
            requestEngineerBonuses += bonusPerEngineer * engineers.length;
            
            // Форматуємо дату затвердження премії для відображення
            let bonusApprovalDateDisplay = '';
            if (task.bonusApprovalDate) {
              // Якщо формат MM-YYYY, залишаємо як є
              if (/^\d{2}-\d{4}$/.test(task.bonusApprovalDate)) {
                bonusApprovalDateDisplay = task.bonusApprovalDate;
              } else if (/^\d{4}-\d{2}-\d{2}$/.test(task.bonusApprovalDate)) {
                // Якщо формат YYYY-MM-DD, конвертуємо в MM-YYYY
                const [year, month] = task.bonusApprovalDate.split('-');
                bonusApprovalDateDisplay = `${month}-${year}`;
              } else {
                bonusApprovalDateDisplay = task.bonusApprovalDate;
              }
            } else if (task.approvedByAccountantDate) {
              // Якщо немає bonusApprovalDate, використовуємо approvedByAccountantDate
              const approvalDate = new Date(task.approvedByAccountantDate);
              if (!isNaN(approvalDate.getTime())) {
                const month = String(approvalDate.getMonth() + 1).padStart(2, '0');
                const year = approvalDate.getFullYear();
                bonusApprovalDateDisplay = `${month}-${year}`;
              }
            } else if (task.date) {
              // Якщо немає жодної дати затвердження, використовуємо дату виконання
              const workDate = new Date(task.date);
              if (!isNaN(workDate.getTime())) {
                const month = String(workDate.getMonth() + 1).padStart(2, '0');
                const year = workDate.getFullYear();
                bonusApprovalDateDisplay = `${month}-${year}`;
              }
            }
            
            // Створюємо рядок для кожного інженера окремо
            return engineers.map(engineer => {
              engineerIndex++; // Збільшуємо номер інженера в межах заявки
              const rowNumber = engineerIndex === 1 ? requestNumberIndex : `${requestNumberIndex}.${engineerIndex - 1}`;
              return `
                <tr>
                  <td>${rowNumber}</td>
                  <td>${bonusApprovalDateDisplay}</td>
                  <td>${task.requestNumber || ''}</td>
                  <td>${task.date || ''}</td>
                  <td>${engineer}</td>
                  <td>${task.client || ''}</td>
                  <td>${task.address || ''}</td>
                  <td>${task.equipment || ''}</td>
                  <td>${task.work || ''}</td>
                  <td>${task.company || ''}</td>
                  <td>${serviceTotal.toFixed(2)}</td>
                  <td>${workPrice.toFixed(2)}</td>
                  <td>${serviceBonus.toFixed(2)}</td>
                  <td style="font-weight:600;">${bonusPerEngineer.toFixed(2)}</td>
                </tr>
              `;
            }).join('');
          }).join('');
          
          // Додаємо до загальних сум регіону
          totalServiceTotal += requestServiceTotal;
          totalWorkPrice += requestWorkPrice;
          totalServiceBonus += requestServiceBonus;
          totalEngineerBonuses += requestEngineerBonuses;
          
          // Створюємо секцію для номера заявки з підсумками
          return `
            <tr style="background-color: #f0f0f0; font-weight: bold;">
              <td colspan="10" style="text-align: left; padding-left: 20px;">
                <strong>Номер заявки: ${requestNumber}</strong>
              </td>
              <td style="font-weight: bold;">${requestServiceTotal.toFixed(2)}</td>
              <td style="font-weight: bold;">${requestWorkPrice.toFixed(2)}</td>
              <td style="font-weight: bold;">${requestServiceBonus.toFixed(2)}</td>
              <td style="font-weight: bold;">${requestEngineerBonuses.toFixed(2)}</td>
            </tr>
            ${requestRows}
          `;
        }).join('');
        
        const workDetailsTable = `
          <h4>Деталізація виконаних робіт - Регіон: ${region}</h4>
          <table class="details">
            <thead>
              <tr>
                <th>№</th>
                <th>Дата затвердження премії</th>
                <th>Номер заявки</th>
                <th>Дата виконання</th>
                <th>Інженер</th>
                <th>Клієнт</th>
                <th>Адреса</th>
                <th>Обладнання</th>
                <th><b>Найменування робіт</b></th>
                <th>Компанія виконавець</th>
                <th>Загальна сума з матеріалами</th>
                <th>Вартість робіт</th>
                <th>Загальна премія за послугу</th>
                <th>Премія інженера</th>
              </tr>
            </thead>
            <tbody>
              ${requestNumberSections}
              <tr style="background-color: #ffe600; font-weight: bold; font-size: 1.1em;">
                <td colspan="10" style="text-align: left; padding-left: 20px;">
                  <strong>ВСЬОГО ПО РЕГІОНУ: ${region}</strong>
                </td>
                <td style="font-weight: bold;">${totalServiceTotal.toFixed(2)}</td>
                <td style="font-weight: bold;">${totalWorkPrice.toFixed(2)}</td>
                <td style="font-weight: bold;">${totalServiceBonus.toFixed(2)}</td>
                <td style="font-weight: bold;">${totalEngineerBonuses.toFixed(2)}</td>
              </tr>
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
          <script>
            // Функція для оновлення зарплати
            window.handlePayChange = function(userId, field, value) {
              // Оновлюємо localStorage
              const currentData = JSON.parse(localStorage.getItem('payData_${personnelFilters.year}_${personnelFilters.month}') || '{}');
              if (!currentData[userId]) {
                currentData[userId] = { salary: '', bonus: '' };
              }
              currentData[userId][field] = value;
              localStorage.setItem('payData_${personnelFilters.year}_${personnelFilters.month}', JSON.stringify(currentData));
              
              // Оновлюємо розрахунки в реальному часі
              const salary = parseFloat(value) || 0;
              const workHours = 176;
              const overtimeRate = workHours > 0 ? (salary / workHours) * 1.5 : 0;
              
              // Знаходимо рядок з цим input
              const input = event.target;
              const row = input.closest('tr');
              const cells = row.querySelectorAll('td');
              
              // Оновлюємо ціну за годину понаднормові (колонка 5)
              if (cells[4]) cells[4].textContent = overtimeRate.toFixed(2);
              // Оновлюємо відпрацьовану ставку (колонка 7)
              if (cells[6]) cells[6].textContent = salary;
              // Оновлюємо загальну суму (ставка + премія) (колонка 9)
              const serviceBonus = parseFloat(cells[7].textContent) || 0;
              if (cells[8]) cells[8].textContent = (salary + serviceBonus).toFixed(2);
            };
          </script>
        </body>
        </html>
      `;
      
      const win = window.open('', '_blank');
      if (!win) {
        alert('Будь ласка, дозвольте спливаючі вікна для перегляду звіту');
        return;
      }
      win.document.write(html);
      win.document.close();
      
    } catch (error) {
      console.error('[PERSONNEL REPORT] Error generating report:', error);
      console.error('[PERSONNEL REPORT] Error stack:', error.stack);
      console.error('[PERSONNEL REPORT] Error details:', {
        message: error.message,
        name: error.name,
        filters: personnelFilters,
        tasksCount: tasks.length,
        usersCount: users.length
      });
      alert(`Помилка генерації звіту по персоналу: ${error.message}`);
    } finally {
      setLoading(false);
      console.log('[PERSONNEL REPORT] Generation completed');
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
                onChange={(e) => {
                const monthValue = parseInt(e.target.value, 10);
                console.log('[PERSONNEL REPORT] Select changed - value:', e.target.value, 'parsed:', monthValue);
                setPersonnelFilters(prev => ({ ...prev, month: monthValue }));
              }}
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

          {/* Чекбокс для показу звільнених працівників */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#333' }}>
              <input 
                type="checkbox" 
                checked={personnelFilters.showDismissed || false}
                onChange={(e) => setPersonnelFilters(prev => ({ ...prev, showDismissed: e.target.checked }))}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer'
                }}
              />
              <span style={{ fontWeight: '500' }}>Показати всіх працівників (включно зі звільненими)</span>
            </label>
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
