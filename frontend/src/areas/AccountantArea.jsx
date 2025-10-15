import React, { useState, useEffect } from 'react';
import ModalTaskForm, { fields as allTaskFields } from '../ModalTaskForm';
import TaskTable from '../components/TaskTable';
import AccountantReportsModal from '../components/AccountantReportsModal';
import { tasksAPI } from '../utils/tasksAPI';
import { processFileForUpload } from '../utils/pdfConverter';
import { useLazyData } from '../hooks/useLazyData';
import * as XLSX from 'xlsx-js-style';
const initialTask = {
  id: null,
  status: '',
  requestDate: '',
  requestDesc: '',
  serviceRegion: '',
  address: '',
  equipmentSerial: '',
  equipment: '',
  work: '',
  date: '',
  paymentDate: '',
  engineer1: '',
  engineer2: '',
  client: '',
  requestNumber: '',
  invoice: '',
  paymentType: '',
  serviceTotal: '',
  approvedByWarehouse: null,
  warehouseComment: '',
  approvedByAccountant: null,
  accountantComment: '',
  accountantComments: '',
  approvedByRegionalManager: null,
  regionalManagerComment: '',
  comments: '',
  oilType: '',
  oilUsed: '',
  oilPrice: '',
  oilTotal: '',
  filterName: '',
  filterCount: '',
  filterPrice: '',
  filterSum: '',
  fuelFilterName: '',
  fuelFilterCount: '',
  fuelFilterPrice: '',
  fuelFilterSum: '',
  antifreezeType: '',
  antifreezeL: '',
  antifreezePrice: '',
  antifreezeSum: '',
  otherMaterials: '',
  otherSum: '',
  workPrice: '',
  perDiem: '',
  living: '',
  otherExp: '',
  carNumber: '',
  transportKm: '',
  transportSum: '',
};
export default function AccountantArea({ user }) {
  // Перевіряємо чи користувач завантажений
  if (!user) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '200px',
        fontSize: '16px',
        color: '#666'
      }}>
        Завантаження даних користувача...
      </div>
    );
  }

  // Використовуємо хук useLazyData для оптимізації
  const { data: tasks, loading, error, activeTab, setActiveTab, refreshData, getTabCount } = useLazyData(user, 'pending');
  const [users, setUsers] = useState([]);
  
  // Додаткове логування для відстеження змін стану
  useEffect(() => {
    console.log('[DEBUG] AccountantArea - стан tasks змінився, кількість заявок:', tasks.length);
  }, [tasks]);

  // Завантажуємо users з localStorage
  useEffect(() => {
    const savedUsers = localStorage.getItem('users');
    if (savedUsers) {
      setUsers(JSON.parse(savedUsers));
    }
  }, []);
  const [loading, setLoading] = useState(true);
  // Ініціалізую filters з усіма можливими ключами для фільтрації
  const allFilterKeys = allTaskFields
    .map(f => f.name)
    .reduce((acc, key) => {
      acc[key] = '';
      if (["date", "requestDate", "paymentDate"].includes(key)) {
        acc[key + 'From'] = '';
        acc[key + 'To'] = '';
      }
      return acc;
    }, {});
  const [filters, setFilters] = useState(allFilterKeys);
  
  // Логування для діагностики створення фільтрів
  console.log('[DEBUG] AccountantArea - створені фільтри:', {
    allFilterKeys: Object.keys(allFilterKeys),
    paymentDateFilters: {
      paymentDate: allFilterKeys.paymentDate,
      paymentDateFrom: allFilterKeys.paymentDateFrom,
      paymentDateTo: allFilterKeys.paymentDateTo
    },
    hasPaymentDateFrom: 'paymentDateFrom' in allFilterKeys,
    hasPaymentDateTo: 'paymentDateTo' in allFilterKeys,
    allFilterKeysValues: allFilterKeys
  });
  const [approvalFilter, setApprovalFilter] = useState('all'); // 'all', 'approved', 'not_approved'
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  // tab state видалено - тепер використовуємо activeTab з useLazyData
  const [invoiceRequests, setInvoiceRequests] = useState([]);
  const [invoiceRequestsLoading, setInvoiceRequestsLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(new Set());
  const [reportsModalOpen, setReportsModalOpen] = useState(false);
  const [taskInfoModalOpen, setTaskInfoModalOpen] = useState(false);
  const [selectedTaskInfo, setSelectedTaskInfo] = useState(null);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [tableKey, setTableKey] = useState(0);
  const region = user?.region || '';
  
  // Функція для ручного оновлення кешу
  const refreshCache = async () => {
    try {
      console.log('[DEBUG] AccountantArea refreshCache - початок оновлення кешу...');
      console.log('[DEBUG] AccountantArea refreshCache - поточний стан tasks:', tasks.length);
      
      setLoading(true);
      console.log('[DEBUG] AccountantArea refreshCache - викликаємо tasksAPI.getAll()...');
      
      const freshTasks = await tasksAPI.getAll();
      console.log('[DEBUG] AccountantArea refreshCache - отримано з API:', freshTasks.length, 'заявок');
      console.log('[DEBUG] AccountantArea refreshCache - перші 3 заявки:', freshTasks.slice(0, 3));
      
      console.log('[DEBUG] AccountantArea refreshCache - встановлюємо новий стан...');
      
      // Примусове оновлення стану - створюємо новий масив
      setTasks([...freshTasks]);
      setTableKey(prev => prev + 1); // Примусово перерендерюємо таблицю
      
      console.log('[DEBUG] AccountantArea refreshCache - кеш оновлено успішно!');
      console.log('[DEBUG] AccountantArea refreshCache - новий масив створено, довжина:', freshTasks.length);
      console.log('[DEBUG] AccountantArea refreshCache - tableKey збільшено для примусового перерендеру');
      
      // Додаткова перевірка через setTimeout
      setTimeout(() => {
        console.log('[DEBUG] AccountantArea refreshCache - перевірка стану через 1 сек:', tasks.length);
      }, 1000);
      
    } catch (error) {
      console.error('[ERROR] AccountantArea refreshCache - помилка оновлення кешу:', error);
      console.error('[ERROR] AccountantArea refreshCache - деталі помилки:', error.message, error.stack);
      alert('Помилка оновлення даних: ' + error.message);
    } finally {
      setLoading(false);
      console.log('[DEBUG] AccountantArea refreshCache - завершено, loading = false');
    }
  };
  
  // Функція для завантаження запитів на рахунки
  const loadInvoiceRequests = async () => {
    try {
      setInvoiceRequestsLoading(true);
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      const url = showAllInvoices 
        ? `${API_BASE_URL}/invoice-requests?showAll=true`
        : `${API_BASE_URL}/invoice-requests`;
        
      const response = await fetch(url);
      if (response.ok) {
        const result = await response.json();
        setInvoiceRequests(result.data || []);
      } else {
        console.error('Помилка завантаження запитів на рахунки');
      }
    } catch (error) {
      console.error('Помилка завантаження запитів на рахунки:', error);
    } finally {
      setInvoiceRequestsLoading(false);
    }
  };
  
  // Функція для видалення запиту на рахунок
  const deleteInvoiceRequest = async (requestId) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цей запит на рахунок?')) {
      return;
    }
    
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Видаляємо з локального стану
        setInvoiceRequests(prev => prev.filter(req => req._id !== requestId));
        alert('Запит на рахунок успішно видалено');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Помилка видалення запиту');
      }
    } catch (error) {
      console.error('Помилка видалення запиту на рахунок:', error);
      alert(`Помилка: ${error.message}`);
    }
  };
  
  // Функція для оновлення статусу запиту на рахунок
  const updateInvoiceRequestStatus = async (requestId, status, comments = '', rejectionReason = '') => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comments, rejectionReason })
      });
      
      if (response.ok) {
        // Оновлюємо локальний стан
        setInvoiceRequests(prev => 
          prev.map(req => 
            req._id === requestId 
              ? { ...req, status, comments, rejectionReason }
              : req
          )
        );
        
        // Якщо запит відхилено і не показуємо всі заявки, ховаємо його
        if (status === 'rejected' && !showAllInvoices) {
          setInvoiceRequests(prev => 
            prev.filter(req => req._id !== requestId)
          );
        }
        
        alert('Статус запиту оновлено успішно');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Помилка оновлення статусу');
      }
    } catch (error) {
      console.error('Помилка оновлення статусу запиту:', error);
      alert(`Помилка: ${error.message}`);
    }
  };
  
  // Функція для завантаження файлу рахунку
  const uploadInvoiceFile = async (requestId, file) => {
    try {
      // Додаємо requestId до списку завантажуваних файлів
      setUploadingFiles(prev => new Set([...prev, requestId]));
      
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      // Конвертуємо PDF в JPG якщо потрібно
      const { file: processedFile, ocrData } = await processFileForUpload(file);
      console.log('DEBUG PDF Converter Invoice: Оброблений файл:', processedFile.name, processedFile.type);
      console.log('DEBUG PDF Converter Invoice: OCR дані:', ocrData);
      
      const formData = new FormData();
      formData.append('invoiceFile', processedFile);
      
      // OCR функціональність тимчасово відключена
      console.log('DEBUG AccountantArea Invoice: OCR функціональність тимчасово відключена');
      // Додаємо OCR дані якщо вони є (тимчасово відключено)
      // if (ocrData && ocrData.success) {
      //   console.log('DEBUG AccountantArea Invoice: OCR дані для відправки:', ocrData);
      //   if (ocrData.invoiceNumber) {
      //     formData.append('invoiceNumber', ocrData.invoiceNumber);
      //     console.log('DEBUG AccountantArea Invoice: Додано invoiceNumber до formData:', ocrData.invoiceNumber);
      //     alert(`🤖 Система визначила номер рахунку: ${ocrData.invoiceNumber}\n\nВін буде автоматично встановлений в поле "Номер рахунку".\nЯкщо дані не вірні, змініть вручну в даному полі.`);
      //   }
      //   if (ocrData.invoiceDate) {
      //     formData.append('invoiceDate', ocrData.invoiceDate);
      //     console.log('DEBUG AccountantArea Invoice: Додано invoiceDate до formData:', ocrData.invoiceDate);
      //     alert(`📅 Система визначила дату рахунку: ${ocrData.invoiceDate}\n\nВона буде автоматично встановлена в поле "Дата рахунку".\nЯкщо дані не вірні, змініть вручну в даному полі.`);
      //   }
      // } else {
      //   console.log('DEBUG AccountantArea Invoice: OCR дані відсутні або невдалі:', ocrData);
      // }
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        // Оновлюємо локальний стан
        setInvoiceRequests(prev => 
          prev.map(req => 
            req._id === requestId 
              ? { ...req, status: 'completed', invoiceFile: result.data.invoiceFile, invoiceFileName: result.data.invoiceFileName }
              : req
          )
        );
        alert('Файл рахунку завантажено успішно');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Помилка завантаження файлу');
      }
    } catch (error) {
      console.error('Помилка завантаження файлу рахунку:', error);
      alert(`Помилка: ${error.message}`);
    } finally {
      // Видаляємо requestId зі списку завантажуваних файлів
      setUploadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  // Функція для видалення файлу рахунку
  const deleteInvoiceFile = async (requestId) => {
    if (!confirm('Ви впевнені, що хочете видалити цей файл рахунку?')) {
      return;
    }
    
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/file`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Оновлюємо локальний стан
        setInvoiceRequests(prev => prev.map(req => 
          req._id === requestId 
            ? { ...req, invoiceFile: '', invoiceFileName: '' }
            : req
        ));
        
        alert('Файл успішно видалено!');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Помилка видалення файлу');
      }
      
    } catch (error) {
      console.error('Помилка видалення файлу:', error);
      alert('Помилка видалення файлу: ' + error.message);
    }
  };

  // Функція для завантаження файлу акту виконаних робіт
  const uploadActFile = async (requestId, file) => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      // Конвертуємо PDF в JPG якщо потрібно
      const { file: processedFile, ocrData } = await processFileForUpload(file);
      console.log('DEBUG PDF Converter Act: Оброблений файл:', processedFile.name, processedFile.type);
      console.log('DEBUG PDF Converter Act: OCR дані:', ocrData);
      
      const formData = new FormData();
      formData.append('actFile', processedFile);
      
      // OCR функціональність тимчасово відключена
      console.log('DEBUG AccountantArea Act: OCR функціональність тимчасово відключена');
      // Додаємо OCR дані якщо вони є (тимчасово відключено)
      // if (ocrData && ocrData.success) {
      //   console.log('DEBUG AccountantArea Act: OCR дані для відправки:', ocrData);
      //   if (ocrData.invoiceNumber) {
      //     formData.append('invoiceNumber', ocrData.invoiceNumber);
      //     console.log('DEBUG AccountantArea Act: Додано invoiceNumber до formData:', ocrData.invoiceNumber);
      //     alert(`🤖 Система визначила номер рахунку: ${ocrData.invoiceNumber}\n\nВін буде автоматично встановлений в поле "Номер рахунку".\nЯкщо дані не вірні, змініть вручну в даному полі.`);
      //   }
      //   if (ocrData.invoiceDate) {
      //     formData.append('invoiceDate', ocrData.invoiceDate);
      //     console.log('DEBUG AccountantArea Act: Додано invoiceDate до formData:', ocrData.invoiceDate);
      //     alert(`📅 Система визначила дату рахунку: ${ocrData.invoiceDate}\n\nВона буде автоматично встановлена в поле "Дата рахунку".\nЯкщо дані не вірні, змініть вручну в даному полі.`);
      //   }
      // } else {
      //   console.log('DEBUG AccountantArea Act: OCR дані відсутні або невдалі:', ocrData);
      // }
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/upload-act`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        // Оновлюємо локальний стан
        setInvoiceRequests(prev => prev.map(req => 
          req._id === requestId 
            ? { ...req, actFile: result.data.fileUrl, actFileName: result.data.fileName }
            : req
        ));
        alert('Файл акту завантажено успішно');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Помилка завантаження файлу акту');
      }
    } catch (error) {
      console.error('Помилка завантаження файлу акту:', error);
      alert(`Помилка: ${error.message}`);
    }
  };

  // Функція для скачування файлу акту виконаних робіт
  const downloadActFile = async (requestId) => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/download-act`);
      
      if (response.ok) {
        const result = await response.json();
        // Відкриваємо файл в новій вкладці
        window.open(result.data.fileUrl, '_blank');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Помилка завантаження файлу акту');
      }
    } catch (error) {
      console.error('Помилка завантаження файлу акту:', error);
      alert(`Помилка: ${error.message}`);
    }
  };

  // Функція для видалення файлу акту виконаних робіт
  const deleteActFile = async (requestId) => {
    if (!confirm('Ви впевнені, що хочете видалити цей файл акту?')) {
      return;
    }
    
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : 'https://darex-trading-solutions.onrender.com/api');
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests/${requestId}/act-file`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Оновлюємо локальний стан
        setInvoiceRequests(prev => prev.map(req => 
          req._id === requestId 
            ? { ...req, actFile: '', actFileName: '' }
            : req
        ));
        alert('Файл акту успішно видалено!');
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Помилка видалення файлу акту');
      }
      
    } catch (error) {
      console.error('Помилка видалення файлу акту:', error);
      alert('Помилка видалення файлу акту: ' + error.message);
    }
  };

  // Функція для завантаження інформації про заявку
  const loadTaskInfo = async (taskId) => {
    try {
      console.log('[DEBUG] loadTaskInfo - taskId:', taskId);
      
      // Показуємо індикатор завантаження
      setLoading(true);
      
      // Спочатку спробуємо знайти заявку за ID
      let task;
      try {
        task = await tasksAPI.getById(taskId);
        console.log('[DEBUG] loadTaskInfo - знайдено за ID:', task);
        
        // Перевіряємо, чи заявка містить всі необхідні дані
        if (!task || !task.id) {
          throw new Error('Заявка не містить необхідних даних');
        }
        
        // Перевіряємо наявність ключових полів
        const requiredFields = ['requestNumber', 'client', 'serviceRegion'];
        const missingFields = requiredFields.filter(field => !task[field]);
        
        if (missingFields.length > 0) {
          console.log('[DEBUG] loadTaskInfo - відсутні поля:', missingFields);
          // Спробуємо оновити дані з сервера
          const freshTasks = await tasksAPI.getAll();
          const freshTask = freshTasks.find(t => t.id === taskId || t._id === taskId || t.requestNumber === taskId);
          if (freshTask) {
            task = freshTask;
            console.log('[DEBUG] loadTaskInfo - оновлено зі свіжих даних:', task);
          }
        }
        
      } catch (idError) {
        console.log('[DEBUG] loadTaskInfo - не знайдено за ID, шукаємо в локальних заявках');
        
        // Якщо не знайдено за ID, шукаємо в локальних заявках
        const localTask = tasks.find(t => t.id === taskId || t._id === taskId || t.requestNumber === taskId);
        if (localTask) {
          task = localTask;
          console.log('[DEBUG] loadTaskInfo - знайдено в локальних заявках:', task);
        } else {
          throw new Error('Заявка не знайдена');
        }
      }
      
      // Додаткова перевірка на повноту даних
      if (!task.requestNumber) {
        console.warn('[DEBUG] loadTaskInfo - відсутній номер заявки, намагаємося оновити дані');
        // Спробуємо оновити дані з сервера
        try {
          const freshTasks = await tasksAPI.getAll();
          const freshTask = freshTasks.find(t => t.id === taskId || t._id === taskId);
          if (freshTask) {
            task = freshTask;
            console.log('[DEBUG] loadTaskInfo - оновлено зі свіжих даних (fallback):', task);
          }
        } catch (updateError) {
          console.warn('[DEBUG] loadTaskInfo - не вдалося оновити дані:', updateError);
        }
      }
      
      setSelectedTaskInfo(task);
      setTaskInfoModalOpen(true);
      
    } catch (error) {
      console.error('Помилка завантаження інформації про заявку:', error);
      alert('Помилка завантаження інформації про заявку: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Додаємо useEffect для оновлення filters при зміні allTaskFields
  // але зберігаємо вже введені користувачем значення
  useEffect(() => {
    const newFilterKeys = allTaskFields
      .map(f => f.name)
      .reduce((acc, key) => {
        acc[key] = '';
        if (["date", "requestDate", "paymentDate"].includes(key)) {
          acc[key + 'From'] = '';
          acc[key + 'To'] = '';
        }
        return acc;
      }, {});
    // Оновлюємо filters, зберігаючи вже введені значення
    setFilters(prevFilters => {
      const updatedFilters = { ...newFilterKeys };
      // Зберігаємо вже введені значення
      Object.keys(prevFilters).forEach(key => {
        if (prevFilters[key] && prevFilters[key] !== '') {
          updatedFilters[key] = prevFilters[key];
        }
      });
      return updatedFilters;
    });
  }, [allTaskFields]); // Залежність від allTaskFields
  // Старі useEffect видалені - тепер використовуємо useLazyData
  
  // Завантаження запитів на рахунки
  useEffect(() => {
    if (tab === 'invoices') {
      loadInvoiceRequests();
    }
  }, [tab, showAllInvoices]);
  // Автоматичне оновлення даних при фокусі на вкладку браузера
  useEffect(() => {
    const handleFocus = () => {
      console.log('[DEBUG] AccountantArea handleFocus - оновлення при фокусі вікна...');
      tasksAPI.getAll().then(freshTasks => {
        console.log('[DEBUG] AccountantArea handleFocus - оновлено заявок:', freshTasks.length);
        setTasks([...freshTasks]);
        setTableKey(prev => prev + 1); // Примусово перерендерюємо таблицю
      }).catch(error => {
        console.error('[ERROR] AccountantArea - помилка оновлення при фокусі:', error);
      });
    };
    // Старі useEffect видалені - тепер використовуємо useLazyData
  const handleApprove = async (id, approved, comment) => {
    try {
      const t = tasks.find(t => t.id === id);
      if (!t) {
        console.error('[ERROR] AccountantArea handleApprove - заявка не знайдена:', id);
        return;
      }
      
      let next = {
        ...t,
        approvedByAccountant: approved,
        accountantComment: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.accountantComment),
        accountantComments: approved === 'Підтверджено' ? `Погоджено, претензій не маю. ${user?.name || 'Користувач'}` : (comment !== undefined ? comment : t.accountantComments)
      };
      
      let bonusApprovalDate = t.bonusApprovalDate;
      if (
        next.status === 'Виконано' &&
        (next.approvedByWarehouse === 'Підтверджено' || next.approvedByWarehouse === true) &&
        (next.approvedByAccountant === 'Підтверджено' || next.approvedByAccountant === true)
      ) {
        const d = new Date();
        bonusApprovalDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      }
      
      const updated = await tasksAPI.update(id, {
        ...next,
        bonusApprovalDate
      });
      
      console.log('[DEBUG] AccountantArea handleApprove - заявка підтверджена:', updated);
      
      // Оновлюємо дані через refreshData
      await refreshData(activeTab);
      setTableKey(prev => prev + 1); // Примусово перерендерюємо таблицю
      
    } catch (error) {
      console.error('[ERROR] AccountantArea handleApprove - помилка підтвердження заявки:', error);
      alert('Помилка підтвердження заявки: ' + error.message);
    }
  };
  const handleFilter = e => {
    const newFilters = { ...filters, [e.target.name]: e.target.value };
    setFilters(newFilters);
  };
  const handleEdit = t => {
    const isReadOnly = t._readOnly;
    const taskData = { ...t };
    delete taskData._readOnly; // Видаляємо прапорець з даних завдання
    
    // Якщо це вкладка заборгованості, обмежуємо редагування тільки полем заборгованості
    if (tab === 'debt') {
      taskData._debtEditOnly = true; // Прапорець для обмеження редагування
    }
    
    setEditTask(taskData);
    setModalOpen(true);
    // Передаємо readOnly в ModalTaskForm
    if (isReadOnly) {
      // Встановлюємо прапорець для ModalTaskForm
      setEditTask(prev => ({ ...prev, _readOnly: true }));
    }
  };
  const handleSave = async (task) => {
    setLoading(true);
    let updatedTask = null;
    
    try {
      if (editTask && editTask.id) {
        updatedTask = await tasksAPI.update(editTask.id, task);
        console.log('[DEBUG] AccountantArea handleSave - заявка оновлена:', updatedTask);
      } else {
        updatedTask = await tasksAPI.add(task);
        console.log('[DEBUG] AccountantArea handleSave - заявка створена:', updatedTask);
      }
      
      // Оновлюємо дані з бази після збереження
      console.log('[DEBUG] AccountantArea handleSave - оновлюємо кеш з бази даних...');
      console.log('[DEBUG] AccountantArea handleSave - поточний стан tasks перед оновленням:', tasks.length);
      
      const freshTasks = await tasksAPI.getAll();
      console.log('[DEBUG] AccountantArea handleSave - отримано з API:', freshTasks.length, 'заявок');
      
      // Примусове оновлення стану - створюємо новий масив
      setTasks([...freshTasks]);
      setTableKey(prev => prev + 1); // Примусово перерендерюємо таблицю
      console.log('[DEBUG] AccountantArea handleSave - кеш оновлено, завантажено заявок:', freshTasks.length);
      
      // Додатково оновлюємо локальний стан для швидшого відображення
      if (editTask && editTask.id) {
        setTasks(prevTasks => 
          prevTasks.map(t => t.id === editTask.id ? updatedTask : t)
        );
      } else {
        setTasks(prevTasks => [...prevTasks, updatedTask]);
      }
      
    } catch (error) {
      console.error('[ERROR] AccountantArea handleSave - помилка збереження або оновлення даних:', error);
      alert('Помилка збереження заявки: ' + error.message);
    } finally {
      // Закриваємо модальне вікно
      setModalOpen(false);
      setEditTask(null);
      setLoading(false);
    }
  };
  const filtered = tasks.filter(t => {
    for (const key in filters) {
      const value = filters[key];
      if (!value) continue;
      if (key.endsWith('From')) {
        const field = key.replace('From', '');
        if (!t[field] || t[field] < value) return false;
      } else if (key.endsWith('To')) {
        const field = key.replace('To', '');
        if (!t[field] || t[field] > value) return false;
      } else if ([
        'approvedByRegionalManager', 'approvedByWarehouse', 'approvedByAccountant', 'paymentType', 'status'
      ].includes(key)) {
        if (t[key]?.toString() !== value.toString()) return false;
      } else if ([
        'airFilterCount', 'airFilterPrice', 'serviceBonus'
      ].includes(key)) {
        if (Number(t[key]) !== Number(value)) return false;
      } else if ([
        'bonusApprovalDate'
      ].includes(key)) {
        if (t[key] !== value) return false;
      } else if ([
        'regionalManagerComment', 'airFilterName'
      ].includes(key)) {
        if (!t[key] || !t[key].toString().toLowerCase().includes(value.toLowerCase())) return false;
      } else if (typeof t[key] === 'string' || typeof t[key] === 'number') {
        if (!t[key]?.toString().toLowerCase().includes(value.toLowerCase())) return false;
      }
    }
    return true;
  });
  
  // Логування для діагностики filtered
  console.log('[DEBUG] AccountantArea - filtered оновлено:', {
    tasksLength: tasks.length,
    filteredLength: filtered.length,
    filters: Object.keys(filters).filter(key => filters[key]).length,
    paymentDateFilters: {
      paymentDateFrom: filters.paymentDateFrom,
      paymentDateTo: filters.paymentDateTo,
      hasPaymentDateFrom: !!filters.paymentDateFrom,
      hasPaymentDateTo: !!filters.paymentDateTo
    }
  });
  const pending = filtered.filter(t => {
    // Базовий фільтр: заявки на підтвердженні
    const isPendingApproval = t.status === 'Виконано' && 
      isApproved(t.approvedByWarehouse) && (
      t.approvedByAccountant === null ||
      t.approvedByAccountant === undefined ||
      t.approvedByAccountant === 'На розгляді' ||
      t.approvedByAccountant === false ||
      t.approvedByAccountant === 'Відмова'
    );
    
    // Якщо чекбокс "Відобразити всі заявки" активний, додаємо заявки зі статусом "Заявка" та "В роботі"
    if (showAllTasks) {
      const isNewOrInProgress = t.status === 'Заявка' || t.status === 'В роботі';
      return isPendingApproval || isNewOrInProgress;
    }
    
    return isPendingApproval;
  });
  
  // Логування для діагностики pending
  console.log('[DEBUG] AccountantArea - pending оновлено:', {
    pendingLength: pending.length,
    showAllTasks,
    filteredLength: filtered.length
  });
  function isApproved(v) {
    return v === true || v === 'Підтверджено';
  }
  const archive = filtered.filter(t => t.status === 'Виконано' && isApproved(t.approvedByAccountant));
  const tableData = activeTab === 'pending' ? pending : archive;
  
  // Логування для діагностики tableData
  console.log('[DEBUG] AccountantArea - tableData оновлено:', {
    tab,
    tableDataLength: tableData.length,
    pendingLength: pending.length,
    archiveLength: archive.length,
    filteredLength: filtered.length,
    tasksLength: tasks.length
  });
  const columns = allTaskFields.map(f => ({
    key: f.name,
    label: f.label,
    filter: true
  }));
  
  // Додаємо логування для діагностики проблеми з колонками
  console.log('[DEBUG] AccountantArea - user:', user);
  console.log('[DEBUG] AccountantArea - user.login:', user?.login);
  console.log('[DEBUG] AccountantArea - role: accountant');
  console.log('[DEBUG] AccountantArea - columns:', columns);

  // --- Формування звіту ---
  const handleFormReport = () => {
    // Фільтруємо виконані заявки за діапазоном дат, регіоном та статусом затвердження
    const filteredTasks = tasks.filter(t => {
      if (t.status !== 'Виконано') return false;
      if (filters.dateFrom && (!t.date || t.date < filters.dateFrom)) return false;
      if (filters.dateTo && (!t.date || t.date > filters.dateTo)) return false;
      if (filters.region && filters.region !== 'Україна' && t.serviceRegion !== filters.region) return false;
      // Фільтр по статусу затвердження
      if (approvalFilter === 'approved') {
        if (!isApproved(t.approvedByAccountant)) return false;
      } else if (approvalFilter === 'not_approved') {
        if (isApproved(t.approvedByAccountant)) return false;
      }
      // Якщо approvalFilter === 'all', то показуємо всі
      return true;
    });
    // Деталізація по кожній заявці
    const details = filteredTasks.map(t => {
      const materials = [];
      if (t.oilType && t.oilUsed) materials.push({ label: 'Олива', type: t.oilType, qty: Number(t.oilUsed), price: Number(t.oilPrice)||0 });
      if (t.filterName && t.filterCount) materials.push({ label: 'Фільтр масл', type: t.filterName, qty: Number(t.filterCount), price: Number(t.filterPrice)||0 });
      if (t.fuelFilterName && t.fuelFilterCount) materials.push({ label: 'Фільтр палив', type: t.fuelFilterName, qty: Number(t.fuelFilterCount), price: Number(t.fuelFilterPrice)||0 });
      if (t.airFilterName && t.airFilterCount) materials.push({ label: 'Фільтр повітряний', type: t.airFilterName, qty: Number(t.airFilterCount), price: Number(t.airFilterPrice)||0 });
      if (t.antifreezeType && t.antifreezeL) materials.push({ label: 'Антифриз', type: t.antifreezeType, qty: Number(t.antifreezeL), price: Number(t.antifreezePrice)||0 });
      if (t.otherMaterials) materials.push({ label: 'Інші матеріали', type: t.otherMaterials, qty: '', price: Number(t.otherSum)||0 });
      materials.forEach(m => { m.totalSum = (Number(m.qty) || 0) * (Number(m.price) || 0); });
      return {
        date: t.date,
        region: t.serviceRegion,
        company: t.company,
        work: t.work,
        client: t.client || '',
        address: t.address || '',
        engineers: [t.engineer1, t.engineer2].filter(Boolean).join(', '),
        workPrice: Number(t.workPrice) || 0,
        serviceTotal: Number(t.serviceTotal) || 0,
        perDiem: Number(t.perDiem) || 0,
        living: Number(t.living) || 0,
        otherExp: Number(t.otherExp) || 0,
        otherSum: Number(t.otherSum) || 0,
        otherMaterials: t.otherMaterials || '',
        materials,
      };
    });
    // --- Підсумки по матеріалах для кожної компанії (і регіону, якщо Україна) ---
    let regionGroups = {};
    if (filters.region === 'Україна' || !filters.region) {
      details.forEach(d => {
        const region = d.region || 'Невідомо';
        if (!regionGroups[region]) regionGroups[region] = [];
        regionGroups[region].push(d);
      });
    } else {
      regionGroups[filters.region] = details;
    }
    // Для кожного регіону: підсумки по компаніях
    const regionSummaries = {};
    Object.entries(regionGroups).forEach(([region, dets]) => {
      const companyGroups = {};
      dets.forEach(d => {
        const company = d.company || 'Невідомо';
        if (!companyGroups[company]) companyGroups[company] = [];
        companyGroups[company].push(...d.materials);
      });
      // Для кожної компанії: підсумок по матеріалах
      const companySummaries = {};
      Object.entries(companyGroups).forEach(([company, mats]) => {
        const summary = {};
        mats.forEach(m => {
          const key = `${m.label} - ${m.type}`;
          if (!summary[key]) summary[key] = { label: m.label, type: m.type, totalQty: 0, totalSum: 0 };
          summary[key].totalQty += Number(m.qty) || 0;
          summary[key].totalSum += (Number(m.qty) || 0) * (Number(m.price) || 0);
        });
        companySummaries[company] = summary;
      });
      regionSummaries[region] = companySummaries;
    });
    // --- Формуємо HTML для нового вікна ---
    let html = `
      <html>
      <head>
        <title>Звіт по матеріалах (Бухгалтерія)</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; color: #222; padding: 24px; }
          h2 { color: #1976d2; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
          th, td { border: 1px solid #000; padding: 6px 10px; text-align: center; }
          th { background: #ffe600; color: #222; }
        </style>
      </head>
      <body>
        <h2>Звіт по матеріалах (Бухгалтерія)</h2>
        <div style="margin-bottom: 16px; padding: 12px; background: #f0f0f0; border-radius: 4px;">
          <strong>Фільтри:</strong><br/>
          ${filters.dateFrom || filters.dateTo ? `Період: ${filters.dateFrom || 'з початку'} - ${filters.dateTo || 'до кінця'}<br/>` : ''}
          ${filters.region ? `Регіон: ${filters.region}<br/>` : ''}
          Статус затвердження: ${
            approvalFilter === 'all' ? 'Всі звіти' : 
            approvalFilter === 'approved' ? 'Тільки затверджені' : 
            'Тільки незатверджені'
          }
        </div>
        <h3>Підсумок по матеріалах:</h3>
        ${Object.entries(regionSummaries).map(([region, companySummaries]) => `
          <div style="margin-bottom:24px;">
            <div style="font-weight:600;margin-bottom:8px;color:#1976d2;">Регіон: ${region}</div>
            ${Object.entries(companySummaries).map(([company, summary]) => `
              <div style="font-weight:600;margin-bottom:8px;">${company}</div>
              <table>
                <thead>
                  <tr>
                    <th>Матеріал</th>
                    <th>Тип</th>
                    <th>Загальна кількість</th>
                    <th>Загальна вартість, грн.</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.values(summary).map(item => `
                    <tr>
                      <td>${item.label}</td>
                      <td>${item.type}</td>
                      <td>${item.totalQty}</td>
                      <td>${item.totalSum}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `).join('')}
          </div>
        `).join('')}
        <h3>Деталізація по заявках:</h3>
        ${details.map(detail => `
          <div style="margin-bottom:24px;">
            <div style="font-weight:600;margin-bottom:8px;color:#1976d2;">
              ${detail.date} - ${detail.region} - ${detail.company} - ${detail.work}
            </div>
            ${detail.client ? `<div style="margin-bottom:8px;color:#666;">Замовник: ${detail.client}</div>` : ''}
            ${detail.address ? `<div style="margin-bottom:8px;color:#666;">Адреса: ${detail.address}</div>` : ''}
            <div style="margin-bottom:8px;color:#666;">Інженери: ${detail.engineers}</div>
            <div style="margin-bottom:8px;color:#666;">Вартість робіт: ${detail.workPrice} грн.</div>
            <div style="margin-bottom:8px;color:#666;">Загальна сума послуги: ${detail.serviceTotal} грн.</div>
            ${detail.perDiem > 0 ? `<div style="margin-bottom:8px;color:#666;">Добові: ${detail.perDiem} грн.</div>` : ''}
            ${detail.living > 0 ? `<div style="margin-bottom:8px;color:#666;">Проживання: ${detail.living} грн.</div>` : ''}
            ${detail.otherExp > 0 ? `<div style="margin-bottom:8px;color:#666;">Інші витрати: ${detail.otherExp} грн.</div>` : ''}
            ${detail.otherSum > 0 ? `<div style="margin-bottom:8px;color:#666;">Загальна ціна інших матеріалів: ${detail.otherSum} грн.</div>` : ''}
            ${detail.otherMaterials ? `<div style="margin-bottom:8px;color:#666;">Опис інших матеріалів: ${detail.otherMaterials}</div>` : ''}
            ${detail.materials.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>Матеріал</th>
                    <th>Тип</th>
                    <th>Кількість</th>
                    <th>Вартість</th>
                    <th>Загальна вартість, грн.</th>
                  </tr>
                </thead>
                <tbody>
                  ${detail.materials.map(material => `
                    <tr>
                      <td>${material.label}</td>
                      <td>${material.type}</td>
                      <td>${material.qty}</td>
                      <td>${material.price}</td>
                      <td>${material.totalSum}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}
          </div>
        `).join('')}
      </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };
  // --- Експорт у Excel з урахуванням фільтрів звіту ---
  const exportFilteredToExcel = () => {
    // Використовуємо ту ж логіку фільтрації, що й у handleFormReport
    const filteredTasks = tasks.filter(t => {
      if (t.status !== 'Виконано') return false;
      if (filters.dateFrom && (!t.date || t.date < filters.dateFrom)) return false;
      if (filters.dateTo && (!t.date || t.date > filters.dateTo)) return false;
      if (filters.region && filters.region !== 'Україна' && t.serviceRegion !== filters.region) return false;
      // Фільтр по статусу затвердження
      if (approvalFilter === 'approved') {
        if (!isApproved(t.approvedByAccountant)) return false;
      } else if (approvalFilter === 'not_approved') {
        if (isApproved(t.approvedByAccountant)) return false;
      }
      // Якщо approvalFilter === 'all', то показуємо всі
      return true;
    });
    // Створюємо дані для експорту
    const exportData = filteredTasks.map(task => {
      const row = {};
      allTaskFields.forEach(field => {
        row[field.label] = task[field.name] ?? '';
      });
      return row;
    });
    // Формуємо worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    // Додаємо стилі до заголовків
    const headerLabels = allTaskFields.map(f => f.label);
    headerLabels.forEach((label, idx) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: idx });
      if (!worksheet[cellAddress]) return;
      worksheet[cellAddress].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "FFFDEB46" } }, // Яскраво-жовтий
        alignment: { wrapText: true, vertical: "center", horizontal: "center" }
      };
    });
    // Додаємо wrapText для всіх клітинок
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let R = 1; R <= range.e.r; ++R) {
      for (let C = 0; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        if (worksheet[cellAddress]) {
          worksheet[cellAddress].s = {
            ...worksheet[cellAddress].s,
            alignment: { wrapText: true, vertical: "center" }
          };
        }
      }
    }
    // Автоматична ширина колонок
    worksheet['!cols'] = headerLabels.map(() => ({ wch: 20 }));
    // Формуємо workbook
    const workbook = XLSX.utils.book_new();
    // Створюємо назву файлу з урахуванням фільтрів
    let fileName = 'Звіт_по_заявках';
    if (filters.dateFrom || filters.dateTo) {
      fileName += `_${filters.dateFrom || 'з_початку'}_${filters.dateTo || 'до_кінця'}`;
    }
    if (filters.region) {
      fileName += `_${filters.region}`;
    }
    if (approvalFilter !== 'all') {
      fileName += `_${approvalFilter === 'approved' ? 'затверджені' : 'незатверджені'}`;
    }
    fileName += '.xlsx';
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Заявки');
    XLSX.writeFile(workbook, fileName);
  };
  // Функція для створення звіту по замовнику
  const openClientReport = (clientName) => {
    const clientTasks = tasks.filter(task => task.client === clientName);
    if (clientTasks.length === 0) {
      alert('Немає даних для даного замовника');
      return;
    }
    // Сортуємо завдання за датою (від найновішої до найстарішої)
    const sortedTasks = clientTasks.sort((a, b) => {
      const dateA = new Date(a.date || a.requestDate || 0);
      const dateB = new Date(b.date || b.requestDate || 0);
      return dateB - dateA;
    });
    // Створюємо HTML звіт
    const reportHTML = `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Звіт по замовнику: ${clientName}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
          }
          .header {
            background: #22334a;
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
          }
          .task-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .task-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #22334a;
          }
          .task-date {
            font-size: 18px;
            font-weight: bold;
            color: #22334a;
          }
          .task-status {
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
          }
          .status-completed { background: #4caf50; color: white; }
          .status-in-progress { background: #ff9800; color: white; }
          .status-new { background: #2196f3; color: white; }
          .status-blocked { background: #f44336; color: white; }
          .materials-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
            margin-top: 15px;
          }
          .material-section {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #22334a;
          }
          .material-section h4 {
            margin: 0 0 10px 0;
            color: #22334a;
            font-size: 14px;
            text-transform: uppercase;
          }
          .material-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            padding: 5px 0;
            border-bottom: 1px solid #eee;
          }
          .material-item:last-child {
            border-bottom: none;
          }
          .material-label {
            font-weight: 500;
            color: #555;
          }
          .material-value {
            font-weight: bold;
            color: #22334a;
          }
          .task-info {
            margin-bottom: 15px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }
          .info-label {
            font-weight: 500;
            color: #666;
          }
          .info-value {
            font-weight: bold;
            color: #22334a;
          }
          .summary {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 6px;
            margin-top: 20px;
            border-left: 4px solid #2196f3;
          }
          .summary h3 {
            margin: 0 0 10px 0;
            color: #1976d2;
          }
          .print-button {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #22334a;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          }
          .print-button:hover {
            background: #1a2636;
          }
          @media print {
            .print-button { display: none; }
            body { background: white; }
          }
        </style>
      </head>
      <body>
        <button class="print-button" onclick="window.print()">🖨️ Друкувати</button>
        <div class="header">
          <h1>Звіт по замовнику: ${clientName}</h1>
          <p>Кількість проведених робіт: ${sortedTasks.length}</p>
          <p>Дата створення звіту: ${new Date().toLocaleDateString('uk-UA')}</p>
        </div>
        ${sortedTasks.map(task => `
          <div class="task-card">
            <div class="task-header">
              <div class="task-date">Дата проведення робіт: ${task.date || 'Не вказано'}</div>
              <div class="task-status status-${task.status === 'Виконано' ? 'completed' : task.status === 'В роботі' ? 'in-progress' : task.status === 'Новий' ? 'new' : 'blocked'}">
                ${task.status || 'Невідомо'}
              </div>
            </div>
            <div class="task-info">
              <div class="info-row">
                <span class="info-label">Дата заявки:</span>
                <span class="info-value">${task.requestDate || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Замовник:</span>
                <span class="info-value">${task.client || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Адреса:</span>
                <span class="info-value">${task.address || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Найменування робіт:</span>
                <span class="info-value">${task.work || 'Не вказано'}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Сервісні інженери:</span>
                <span class="info-value">${task.engineer1 || ''} ${task.engineer2 ? ', ' + task.engineer2 : ''}</span>
              </div>
            </div>
            <div class="materials-grid">
              ${task.oilType || task.oilUsed || task.oilPrice ? `
                <div class="material-section">
                  <h4>Олива</h4>
                  ${task.oilType ? `<div class="material-item"><span class="material-label">Тип оливи:</span><span class="material-value">${task.oilType}</span></div>` : ''}
                  ${task.oilUsed ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.oilUsed} л</span></div>` : ''}
                  ${task.oilPrice ? `<div class="material-item"><span class="material-label">Ціна за л:</span><span class="material-value">${task.oilPrice} грн</span></div>` : ''}
                  ${task.oilTotal ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.oilTotal} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.filterName || task.filterCount || task.filterPrice ? `
                <div class="material-section">
                  <h4>Масляний фільтр</h4>
                  ${task.filterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.filterName}</span></div>` : ''}
                  ${task.filterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.filterCount} шт</span></div>` : ''}
                  ${task.filterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.filterPrice} грн</span></div>` : ''}
                  ${task.filterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.filterSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.airFilterName || task.airFilterCount || task.airFilterPrice ? `
                <div class="material-section">
                  <h4>Повітряний фільтр</h4>
                  ${task.airFilterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.airFilterName}</span></div>` : ''}
                  ${task.airFilterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.airFilterCount} шт</span></div>` : ''}
                  ${task.airFilterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.airFilterPrice} грн</span></div>` : ''}
                  ${task.airFilterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.airFilterSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.antifreezeType || task.antifreezeL || task.antifreezePrice ? `
                <div class="material-section">
                  <h4>Антифриз</h4>
                  ${task.antifreezeType ? `<div class="material-item"><span class="material-label">Тип:</span><span class="material-value">${task.antifreezeType}</span></div>` : ''}
                  ${task.antifreezeL ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.antifreezeL} л</span></div>` : ''}
                  ${task.antifreezePrice ? `<div class="material-item"><span class="material-label">Ціна за л:</span><span class="material-value">${task.antifreezePrice} грн</span></div>` : ''}
                  ${task.antifreezeSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.antifreezeSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.fuelFilterName || task.fuelFilterCount || task.fuelFilterPrice ? `
                <div class="material-section">
                  <h4>Паливний фільтр</h4>
                  ${task.fuelFilterName ? `<div class="material-item"><span class="material-label">Назва:</span><span class="material-value">${task.fuelFilterName}</span></div>` : ''}
                  ${task.fuelFilterCount ? `<div class="material-item"><span class="material-label">Кількість:</span><span class="material-value">${task.fuelFilterCount} шт</span></div>` : ''}
                  ${task.fuelFilterPrice ? `<div class="material-item"><span class="material-label">Ціна за шт:</span><span class="material-value">${task.fuelFilterPrice} грн</span></div>` : ''}
                  ${task.fuelFilterSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.fuelFilterSum} грн</span></div>` : ''}
                </div>
              ` : ''}
              ${task.otherMaterials || task.otherSum ? `
                <div class="material-section">
                  <h4>Інші матеріали</h4>
                  ${task.otherMaterials ? `<div class="material-item"><span class="material-label">Опис:</span><span class="material-value">${task.otherMaterials}</span></div>` : ''}
                  ${task.otherSum ? `<div class="material-item"><span class="material-label">Загальна сума:</span><span class="material-value">${task.otherSum} грн</span></div>` : ''}
                </div>
              ` : ''}
            </div>
            ${task.serviceTotal ? `
              <div class="summary">
                <h3>Загальна сума послуги: ${task.serviceTotal} грн</h3>
              </div>
            ` : ''}
          </div>
        `).join('')}
        <div class="summary">
          <h3>Підсумок по замовнику ${clientName}</h3>
          <p>Всього проведено робіт: ${sortedTasks.length}</p>
          <p>Загальна вартість всіх послуг: ${sortedTasks.reduce((sum, task) => sum + (parseFloat(task.serviceTotal) || 0), 0).toFixed(2)} грн</p>
        </div>
      </body>
      </html>
    `;
    // Відкриваємо нове вікно з звітом
    const newWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    newWindow.document.write(reportHTML);
    newWindow.document.close();
  };
  return (
    <div style={{padding:32}}>
      <h2>Завдання для затвердження (Бухгалтер)</h2>
      {loading && <div>Завантаження...</div>}
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button onClick={()=>setActiveTab('pending')} style={{width:220,padding:'10px 0',background:activeTab==='pending'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='pending'?700:400,cursor:'pointer'}}>Заявка на підтвердженні ({getTabCount('pending')})</button>
        <button onClick={()=>setActiveTab('archive')} style={{width:220,padding:'10px 0',background:activeTab==='archive'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='archive'?700:400,cursor:'pointer'}}>Архів виконаних заявок ({getTabCount('archive')})</button>
        <button onClick={()=>setActiveTab('debt')} style={{width:220,padding:'10px 0',background:activeTab==='debt'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='debt'?700:400,cursor:'pointer'}}>Заборгованість по документам ({getTabCount('debt')})</button>
        <button onClick={()=>setActiveTab('invoices')} style={{width:220,padding:'10px 0',background:activeTab==='invoices'?'#00bfff':'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:activeTab==='invoices'?700:400,cursor:'pointer'}}>📄 Запити на рахунки ({getTabCount('invoices')})</button>
        <button onClick={()=>setReportsModalOpen(true)} style={{width:220,padding:'10px 0',background:'#22334a',color:'#fff',border:'none',borderRadius:8,fontWeight:400,cursor:'pointer'}}>📊 Бухгалтерські звіти</button>
        <button onClick={exportFilteredToExcel} style={{background:'#43a047',color:'#fff',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:600,cursor:'pointer'}}>Експорт у Excel</button>
        <button onClick={() => {
          console.log('[DEBUG] AccountantArea - кнопка "Оновити дані" натиснута');
          refreshCache();
        }} disabled={loading} style={{
          background: loading ? '#6c757d' : '#17a2b8',
          color:'#fff',
          border:'none',
          borderRadius:6,
          padding:'8px 20px',
          fontWeight:600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1
        }}>
          {loading ? '⏳ Оновлення...' : '🔄 Оновити дані'}
        </button>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <label style={{display:'flex',alignItems:'center',gap:4}}>
          Дата виконаних робіт з:
          <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilter} />
          по
          <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilter} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:4}}>
          Дата оплати з:
          <input type="date" name="paymentDateFrom" value={filters.paymentDateFrom || ''} onChange={handleFilter} />
          по
          <input type="date" name="paymentDateTo" value={filters.paymentDateTo || ''} onChange={handleFilter} />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:4}}>
          Регіон:
          <input type="text" name="region" value={filters.region || ''} onChange={handleFilter} placeholder="Україна або регіон" />
        </label>
        <label style={{display:'flex',alignItems:'center',gap:4}}>
          Статус затвердження:
          <select 
            value={approvalFilter} 
            onChange={(e) => setApprovalFilter(e.target.value)}
            style={{padding:'4px 8px',borderRadius:'4px',border:'1px solid #ccc'}}
          >
            <option value="all">Всі звіти</option>
            <option value="approved">Тільки затверджені</option>
            <option value="not_approved">Тільки незатверджені</option>
          </select>
        </label>
        <button onClick={handleFormReport} style={{background:'#00bfff',color:'#fff',border:'none',borderRadius:6,padding:'8px 20px',fontWeight:600,cursor:'pointer'}}>Сформувати звіт</button>
      </div>
      <ModalTaskForm 
        open={modalOpen} 
        onClose={async ()=>{
          console.log('[DEBUG] AccountantArea - модальне вікно закривається...');
          setModalOpen(false);
          setEditTask(null);
          // Оновлюємо кеш при закритті модального вікна
          console.log('[DEBUG] AccountantArea - оновлюємо кеш при закритті модального вікна...');
          await refreshCache();
        }} 
        onSave={handleSave} 
        initialData={editTask || {}} 
        mode="accountant" 
        user={user} 
        readOnly={editTask?._readOnly || false} 
      />
      
      {/* Вкладка запитів на рахунки */}
      {tab === 'invoices' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#333' }}>Запити на рахунки</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showAllInvoices}
                  onChange={(e) => setShowAllInvoices(e.target.checked)}
                  style={{ margin: 0 }}
                />
                <span style={{ color: '#fff', fontSize: '14px' }}>Показати всі заявки (включно з виконаними та відхиленими)</span>
              </label>
            </div>
          </div>
          {invoiceRequestsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Завантаження запитів...</div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {invoiceRequests.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: '8px',
                  color: '#666'
                }}>
                  Немає запитів на рахунки
                </div>
              ) : (
                invoiceRequests.map(request => (
                  <div key={request._id} style={{
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '20px',
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 8px 0', color: '#333' }}>
                          Запит від {request.requesterName}
                        </h4>
                        <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
                          Номер заявки: {request.requestNumber || 'Н/Д'} | Створено: {new Date(request.createdAt).toLocaleDateString('uk-UA')}
                        </p>
                        <button 
                          onClick={() => loadTaskInfo(request.taskId)}
                          disabled={loading}
                          style={{
                            marginTop: '8px',
                            padding: '6px 12px',
                            backgroundColor: loading ? '#6c757d' : '#17a2b8',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            opacity: loading ? 0.6 : 1
                          }}
                        >
                          {loading ? '⏳ Завантаження...' : 'ℹ️ Інформація по заявці'}
                        </button>
                      </div>
                      <div style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: 
                          request.status === 'pending' ? '#fff3cd' :
                          request.status === 'processing' ? '#d1ecf1' :
                          request.status === 'completed' ? '#d4edda' :
                          '#f8d7da',
                        color: 
                          request.status === 'pending' ? '#856404' :
                          request.status === 'processing' ? '#0c5460' :
                          request.status === 'completed' ? '#155724' :
                          '#721c24'
                      }}>
                        {request.status === 'pending' ? 'Очікує' :
                         request.status === 'processing' ? 'В обробці' :
                         request.status === 'completed' ? 'Виконано' :
                         'Відхилено'}
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <h5 style={{ margin: '0 0 8px 0', color: '#333' }}>Реквізити компанії:</h5>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px', color: '#000' }}>
                        <div><strong>Компанія:</strong> {request.companyDetails.companyName}</div>
                        <div><strong>ЄДРПОУ:</strong> {request.companyDetails.edrpou}</div>
                        <div><strong>Контактна особа:</strong> {request.companyDetails.contactPerson}</div>
                        <div><strong>Телефон:</strong> {request.companyDetails.phone}</div>
                        <div style={{ gridColumn: '1 / -1' }}><strong>Адреса:</strong> {request.companyDetails.address}</div>
                        <div style={{ gridColumn: '1 / -1' }}><strong>Банківські реквізити:</strong> {request.companyDetails.bankDetails}</div>
                        {request.companyDetails.email && (
                          <div style={{ gridColumn: '1 / -1' }}><strong>Email:</strong> {request.companyDetails.email}</div>
                        )}
                      </div>
                    </div>
                    
                    {/* Відображення типу документів */}
                    <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #ddd' }}>
                      <h5 style={{ margin: '0 0 8px 0', color: '#000', fontWeight: 'bold' }}>Тип документів:</h5>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {request.needInvoice && (
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            padding: '6px 12px',
                            backgroundColor: '#e8f5e8',
                            color: '#000',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            border: '1px solid #28a745'
                          }}>
                            📄 Потрібен рахунок
                          </span>
                        )}
                        {request.needAct && (
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            padding: '6px 12px',
                            backgroundColor: '#e6f3ff',
                            color: '#000',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            border: '1px solid #17a2b8'
                          }}>
                            📋 Потрібен акт виконаних робіт
                          </span>
                        )}
                        {!request.needInvoice && !request.needAct && (
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '4px',
                            padding: '6px 12px',
                            backgroundColor: '#ffe6e6',
                            color: '#000',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            border: '1px solid #dc3545'
                          }}>
                            ⚠️ Тип документів не вказано
                          </span>
                        )}
                        {request.companyDetails.comments && (
                          <div style={{ gridColumn: '1 / -1', color: '#000' }}><strong>Коментарі:</strong> {request.companyDetails.comments}</div>
                        )}
                      </div>
                    </div>
                    
                    {/* Файл рахунку */}
                    {request.status === 'completed' && request.needInvoice && (
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#e8f5e8', borderRadius: '4px' }}>
                        <strong style={{ color: '#000' }}>📄 Файл рахунку:</strong>
                        {request.invoiceFile ? (
                          <>
                            <span style={{ color: '#000' }}> {request.invoiceFileName}</span>
                            <div style={{ marginTop: '8px' }}>
                              <button 
                                onClick={() => window.open(request.invoiceFile, '_blank')}
                                style={{
                                  marginRight: '8px',
                                  padding: '4px 8px',
                                  backgroundColor: '#17a2b8',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                Переглянути файл
                              </button>
                              <button 
                                onClick={() => window.open(request.invoiceFile, '_blank')}
                                style={{
                                  marginRight: '8px',
                                  padding: '4px 8px',
                                  backgroundColor: '#28a745',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                Завантажити файл
                              </button>
                              <button 
                                onClick={() => deleteInvoiceFile(request._id)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                🗑️ Видалити файл
                              </button>
                            </div>
                          </>
                        ) : (
                          <div style={{ marginTop: '8px' }}>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => {
                                if (e.target.files[0]) {
                                  uploadInvoiceFile(request._id, e.target.files[0]);
                                }
                              }}
                              style={{ marginRight: '8px' }}
                            />
                            <span style={{ color: '#666', fontSize: '12px' }}>Завантажте файл рахунку</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {request.status === 'completed' && request.needAct && (
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#e6f3ff', borderRadius: '4px' }}>
                        <strong style={{ color: '#000' }}>📋 Файл акту виконаних робіт:</strong>
                        {request.actFile ? (
                          <>
                            <span style={{ color: '#000' }}> {request.actFileName}</span>
                            <div style={{ marginTop: '8px' }}>
                              <button 
                                onClick={() => downloadActFile(request._id)}
                                style={{
                                  marginRight: '8px',
                                  padding: '4px 8px',
                                  backgroundColor: '#17a2b8',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                Переглянути файл
                              </button>
                              <button 
                                onClick={() => downloadActFile(request._id)}
                                style={{
                                  marginRight: '8px',
                                  padding: '4px 8px',
                                  backgroundColor: '#28a745',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                Завантажити файл
                              </button>
                              <button 
                                onClick={() => deleteActFile(request._id)}
                                style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                🗑️ Видалити файл
                              </button>
                            </div>
                          </>
                        ) : (
                          <div style={{ marginTop: '8px' }}>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => {
                                if (e.target.files[0]) {
                                  uploadActFile(request._id, e.target.files[0]);
                                }
                              }}
                              style={{ marginRight: '8px' }}
                            />
                            <span style={{ color: '#666', fontSize: '12px' }}>Завантажте файл акту виконаних робіт</span>
                          </div>
                        )}
                        {request.actFile && (
                          <div style={{ marginTop: '8px' }}>
                            <button
                              onClick={() => {
                                const comments = prompt('Додайте коментарі (необов\'язково):');
                                updateInvoiceRequestStatus(request._id, 'completed', comments || '');
                              }}
                              style={{
                                padding: '8px 16px',
                                backgroundColor: '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px'
                              }}
                            >
                              Завершити заявку
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {request.comments && (
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                        <strong style={{ color: '#000' }}>Коментарі бухгалтера:</strong> <span style={{ color: '#000' }}>{request.comments}</span>
                      </div>
                    )}
                    
                    {request.rejectionReason && (
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
                        <strong style={{ color: '#000' }}>Причина відмови:</strong> <span style={{ color: '#000' }}>{request.rejectionReason}</span>
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {request.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updateInvoiceRequestStatus(request._id, 'processing')}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#17a2b8',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '14px'
                            }}
                          >
                            Взяти в обробку
                          </button>
                          <button
                            onClick={() => {
                              const reason = prompt('Введіть причину відмови:');
                              if (reason) {
                                updateInvoiceRequestStatus(request._id, 'rejected', '', reason);
                              }
                            }}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '14px'
                            }}
                          >
                            Відхилити
                          </button>
                        </>
                      )}
                      
                      {request.status === 'processing' && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            disabled={uploadingFiles.has(request._id)}
                            onChange={(e) => {
                              const file = e.target.files[0];
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
                                
                                uploadInvoiceFile(request._id, file);
                              }
                            }}
                            style={{ 
                              fontSize: '14px',
                              opacity: uploadingFiles.has(request._id) ? 0.6 : 1
                            }}
                          />
                          {uploadingFiles.has(request._id) && (
                            <span style={{ 
                              fontSize: '12px', 
                              color: '#17a2b8',
                              fontWeight: '600'
                            }}>
                              📤 Завантаження...
                            </span>
                          )}
                          <button
                            onClick={() => {
                              const comments = prompt('Додайте коментарі (необов\'язково):');
                              updateInvoiceRequestStatus(request._id, 'completed', comments || '');
                            }}
                            disabled={uploadingFiles.has(request._id)}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: uploadingFiles.has(request._id) ? '#6c757d' : '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: uploadingFiles.has(request._id) ? 'not-allowed' : 'pointer',
                              fontSize: '14px',
                              opacity: uploadingFiles.has(request._id) ? 0.6 : 1
                            }}
                          >
                            Завершити без файлу
                          </button>
                          {request.invoiceFile && (
                            <button
                              onClick={() => {
                                const comments = prompt('Додайте коментарі (необов\'язково):');
                                updateInvoiceRequestStatus(request._id, 'completed', comments || '');
                              }}
                              disabled={uploadingFiles.has(request._id)}
                              style={{
                                padding: '8px 16px',
                                backgroundColor: uploadingFiles.has(request._id) ? '#6c757d' : '#28a745',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: uploadingFiles.has(request._id) ? 'not-allowed' : 'pointer',
                                fontSize: '14px',
                                opacity: uploadingFiles.has(request._id) ? 0.6 : 1
                              }}
                            >
                              Завершити заявку
                            </button>
                          )}
                        </div>
                      )}
                      
                      {/* Кнопка для повернення відхилених заявок в роботу */}
                      {request.status === 'rejected' && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => {
                              if (window.confirm('Ви впевнені, що хочете повернути цей запит в роботу?')) {
                                updateInvoiceRequestStatus(request._id, 'pending', '', '');
                              }
                            }}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#17a2b8',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '14px'
                            }}
                          >
                            🔄 Повернути в роботу
                          </button>
                          
                          {/* Можливість завантаження файлів для відхилених заявок */}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              disabled={uploadingFiles.has(request._id)}
                              onChange={(e) => {
                                const file = e.target.files[0];
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
                                  
                                  uploadInvoiceFile(request._id, file);
                                }
                              }}
                              style={{ 
                                fontSize: '14px',
                                opacity: uploadingFiles.has(request._id) ? 0.6 : 1
                              }}
                            />
                            {uploadingFiles.has(request._id) && (
                              <span style={{ 
                                fontSize: '12px', 
                                color: '#17a2b8',
                                fontWeight: '600'
                              }}>
                                📤 Завантаження...
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Файл рахунку - повторне завантаження для виконаних запитів без файлу */}
                      {request.status === 'completed' && !request.invoiceFile && request.needInvoice && (
                        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#e8f5e8', borderRadius: '4px' }}>
                          <strong style={{ color: '#000' }}>📄 Файл рахунку:</strong>
                          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              disabled={uploadingFiles.has(request._id)}
                              onChange={(e) => {
                                const file = e.target.files[0];
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
                                  
                                  uploadInvoiceFile(request._id, file);
                                }
                              }}
                              style={{ 
                                fontSize: '14px',
                                opacity: uploadingFiles.has(request._id) ? 0.6 : 1
                              }}
                            />
                            {uploadingFiles.has(request._id) && (
                              <span style={{ 
                                fontSize: '12px', 
                                color: '#17a2b8',
                                fontWeight: '600'
                              }}>
                                📤 Завантаження...
                              </span>
                            )}
                            <span style={{ 
                              fontSize: '12px', 
                              color: '#666',
                              fontStyle: 'italic'
                            }}>
                              Файл було видалено. Можна завантажити новий.
                            </span>
                            <button
                              onClick={() => deleteInvoiceRequest(request._id)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                marginLeft: '8px'
                              }}
                            >
                              🗑️ Видалити заявку
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ) : tab === 'debt' ? (
        <div>
          {console.log('[DEBUG] Debt tab - all tasks:', tableData.length)}
          {console.log('[DEBUG] Debt tab - tasks with debtStatus:', tableData.filter(t => t.debtStatus).length)}
          {console.log('[DEBUG] Debt tab - tasks with paymentType:', tableData.filter(t => t.paymentType).length)}
          <TaskTable
          key={tableKey}
          tasks={tableData.filter(task => {
            console.log('[DEBUG] Debt tab - task:', task.requestNumber, 'debtStatus:', task.debtStatus, 'paymentType:', task.paymentType);
            // Показуємо завдання, які потребують встановлення статусу заборгованості:
            // 1. Не мають встановленого debtStatus (undefined або порожнє)
            // 2. Мають paymentType (не порожнє)
            // 3. paymentType не є 'Готівка'
            const hasPaymentType = task.paymentType && task.paymentType.trim() !== '';
            const isNotCash = !['Готівка'].includes(task.paymentType);
            const needsDebtStatus = !task.debtStatus || task.debtStatus === undefined || task.debtStatus === '';
            
            const shouldShow = needsDebtStatus && hasPaymentType && isNotCash;
            console.log('[DEBUG] Debt filter - shouldShow:', shouldShow, 'needsDebtStatus:', needsDebtStatus, 'hasPaymentType:', hasPaymentType, 'isNotCash:', isNotCash);
            
            return shouldShow;
          })}
        allTasks={tasks}
        onApprove={handleApprove}
        onEdit={handleEdit}
        role="accountant"
        filters={filters}
        onFilterChange={handleFilter}
        columns={columns}
        allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
        approveField="approvedByAccountant"
        commentField="accountantComment"
        user={user}
        isArchive={false}
        onHistoryClick={openClientReport}
      />
        </div>
      ) : (
        <div>
          {/* Чекбокс "Відобразити всі заявки" тільки для вкладки "Заявка на підтвердженні" */}
          {tab === 'pending' && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-start', 
              alignItems: 'center', 
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              border: '1px solid #dee2e6'
            }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                color: '#495057'
              }}>
                <input
                  type="checkbox"
                  checked={showAllTasks}
                  onChange={(e) => setShowAllTasks(e.target.checked)}
                  style={{ 
                    margin: 0,
                    transform: 'scale(1.2)',
                    cursor: 'pointer'
                  }}
                />
                <span>Відобразити всі заявки (включно зі статусом "Заявка" та "В роботі")</span>
              </label>
            </div>
          )}
          
          <TaskTable
            key={tableKey}
            tasks={tableData}
            allTasks={tasks}
            onApprove={handleApprove}
            onEdit={handleEdit}
            role="accountant"
            filters={filters}
            onFilterChange={handleFilter}
            columns={columns}
            allColumns={allTaskFields.map(f => ({ key: f.name, label: f.label }))}
            approveField="approvedByAccountant"
            commentField="accountantComment"
            user={user}
            isArchive={activeTab === 'archive'}
            onHistoryClick={openClientReport}
          />
        </div>
      )}
      
      {/* Модальне вікно бухгалтерських звітів */}
      <AccountantReportsModal 
        isOpen={reportsModalOpen}
        onClose={() => setReportsModalOpen(false)}
        user={user}
        tasks={tasks}
        users={users}
      />
      
      {/* Модальне вікно інформації про заявку */}
      {taskInfoModalOpen && selectedTaskInfo && (
        <ModalTaskForm 
          open={taskInfoModalOpen}
          onClose={() => {
            setTaskInfoModalOpen(false);
            setSelectedTaskInfo(null);
          }}
          onSave={() => {}} // Тільки для перегляду
          initialData={selectedTaskInfo}
          mode="accountant"
          user={user}
          readOnly={true}
        />
      )}
      
      {/* Індикатор завантаження для модального вікна */}
      {loading && (
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
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ marginBottom: '10px' }}>⏳</div>
            <div>Завантаження інформації про заявку...</div>
          </div>
        </div>
      )}
    </div>
  );
} 