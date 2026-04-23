import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../config';
import AddTaskModal from './AddTaskModal';
import TaskTable from './TaskTable';
import ManagerNotificationsTab from './manager/ManagerNotificationsTab';
import './RegionalDashboard.css';

function getTaskRecordId(task) {
  return String(task?._id || task?.id || '');
}

function sanitizeWindowsDirName(name) {
  if (!name || typeof name !== 'string') return '';
  const cleaned = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+$/, '')
    .trim();
  return cleaned.slice(0, 200) || 'folder';
}

/** Назва папки: інвент. № від замовника; якщо порожньо — резерв за номером заявки / id */
function getExportFolderBaseName(task) {
  const inv = (task.customerEquipmentNumber || '').trim();
  if (inv) return sanitizeWindowsDirName(inv);
  const rn = String(task.requestNumber ?? '').trim();
  if (rn) return sanitizeWindowsDirName(`Заявка_${rn}`);
  return sanitizeWindowsDirName(`Заявка_${getTaskRecordId(task)}`);
}

function allocateUniqueFolderName(base, usedSet) {
  const raw = (base || 'folder').trim() || 'folder';
  let name = raw;
  if (!usedSet.has(name)) {
    usedSet.add(name);
    return name;
  }
  let i = 2;
  while (usedSet.has(`${raw}_${i}`)) i += 1;
  name = `${raw}_${i}`;
  usedSet.add(name);
  return name;
}

/** Як у /api/tasks/filter?status=accountantPending — виконано, завсклад підтвердив, бухгалтер ще ні */
function isTaskOnAccountantApproval(task) {
  if (!task || task.status !== 'Виконано') return false;
  const wh = task.approvedByWarehouse;
  if (wh !== 'Підтверджено' && wh !== true) return false;
  const acc = task.approvedByAccountant;
  if (acc === 'Підтверджено' || acc === true) return false;
  return true;
}

/** id коефіцієнта «Базовий відсоток за виконану роботу» (як у backend) */
const SERVICE_WORK_BONUS_COEFFICIENT_ID = 'service_work_completion_pct';
const SERVICE_REPAIR_WORK_BONUS_COEFFICIENT_ID = 'service_repair_work_completion_pct';
/** Якщо з БД немає дійсного відсотка — як раніше 25% */
const FALLBACK_SERVICE_BONUS_PERCENT = 25;
/** Премія за ремонтні заявки — від цієї дати включно за полем «Дата проведення робіт» */
const SERVICE_REPAIR_BONUS_EFFECTIVE_YMD = '2026-05-01';

const REPAIR_SERVICE_WORK_NAMES = new Set([
  'Ремонт в цеху',
  'Ремонт на місці',
  'Ремонт на місті',
  'Діагностика+ремонт',
  'Ремонт в цеху (волонтерство)'
]);

function parseTaskDateToYmd(dateVal) {
  if (dateVal == null) return '';
  const s = String(dateVal).trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function taskUsesRepairServiceBonusCoefficient(task, repairPct) {
  if (typeof repairPct !== 'number' || Number.isNaN(repairPct) || repairPct <= 0) return false;
  const workName = String(task?.work || '').trim();
  if (!REPAIR_SERVICE_WORK_NAMES.has(workName)) return false;
  const ymd = parseTaskDateToYmd(task?.date);
  if (!ymd || ymd < SERVICE_REPAIR_BONUS_EFFECTIVE_YMD) return false;
  return true;
}

function effectiveServiceBonusPercentForTask(task, standardPct, repairPct) {
  const std =
    typeof standardPct === 'number' && !Number.isNaN(standardPct) && standardPct > 0
      ? standardPct
      : FALLBACK_SERVICE_BONUS_PERCENT;
  if (taskUsesRepairServiceBonusCoefficient(task, repairPct)) return repairPct;
  return std;
}

function effectiveServiceBonusFractionForTask(task, standardPct, repairPct) {
  return effectiveServiceBonusPercentForTask(task, standardPct, repairPct) / 100;
}

function RegionalDashboard({ user }) {
  const [allTasks, setAllTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Вкладки
  const [activeTab, setActiveTab] = useState('personnel'); // 'personnel' | 'debt' | 'paymentDebt' | 'notifications'
  
  // Стан для модального вікна перегляду заявки
  const [viewingTask, setViewingTask] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  
  // Фільтри для таблиці заборгованості
  const [debtFilters, setDebtFilters] = useState({
    requestNumber: '',
    date: '',
    client: '',
    edrpou: '',
    address: '',
    equipment: '',
    paymentType: '',
    serviceTotal: '',
    serviceRegion: ''
  });
  
  // Стан для табеля персоналу
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showDismissed, setShowDismissed] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(''); // Фільтр по регіону
  const [timesheetData, setTimesheetData] = useState({});
  const [payData, setPayData] = useState({});
  const [timesheetLoading, setTimesheetLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved', 'error'
  /** Відсоток премії з /api/global-calculation-coefficients (service); null = ще не завантажено */
  const [serviceBonusPercentFromApi, setServiceBonusPercentFromApi] = useState(null);
  const [serviceRepairBonusPercentFromApi, setServiceRepairBonusPercentFromApi] = useState(null);

  /** Вивантаження заявок (папка + файли через File System Access API) */
  const [exportRootDirHandle, setExportRootDirHandle] = useState(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSelectedIds, setExportSelectedIds] = useState(() => new Set());
  const [exportBusy, setExportBusy] = useState(false);
  const [exportSearch, setExportSearch] = useState('');
  /** true: номер заявки від більшого до меншого; false: навпаки */
  const [exportSortDesc, setExportSortDesc] = useState(true);
  
  // Ref для дебаунсу збереження
  const saveTimeoutRef = useRef(null);
  const pendingSaveRef = useRef(null);

  const months = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 
                  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  const years = [2024, 2025, 2026, 2027];

  // Кількість днів у місяці
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Кількість робочих днів та годин
  const workDaysInfo = useMemo(() => {
    let workDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) workDays++;
    }
    return { workDays, workHours: workDays * 8 };
  }, [year, month, daysInMonth]);

  // Всі доступні регіони (для селектора)
  const availableRegions = useMemo(() => {
    if (!users.length) return [];
    const serviceUsers = users.filter(u => u.role === 'service');
    const uniqueRegions = [...new Set(serviceUsers.map(u => u.region || 'Без регіону'))];
    return uniqueRegions.sort();
  }, [users]);

  // Визначаємо регіон для фільтрації
  const effectiveRegion = useMemo(() => {
    // Якщо користувач НЕ з України - використовуємо його регіон
    if (user?.region && user.region !== 'Україна') {
      return user.region;
    }
    // Якщо вибрано конкретний регіон - використовуємо його
    if (selectedRegion && selectedRegion !== 'ALL') {
      return selectedRegion;
    }
    // Якщо вибрано "Показати всі" - повертаємо null
    if (selectedRegion === 'ALL') {
      return null;
    }
    // Інакше - перший доступний регіон
    return availableRegions[0] || '';
  }, [user?.region, selectedRegion, availableRegions]);

  // Встановлюємо регіон за замовчуванням
  useEffect(() => {
    if (user?.region && user.region !== 'Україна') {
      setSelectedRegion(user.region);
    } else if (!selectedRegion && availableRegions.length > 0) {
      setSelectedRegion(availableRegions[0]);
    }
  }, [user?.region, availableRegions, selectedRegion]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/global-calculation-coefficients`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const svcRows = data.service?.rows || [];
        const row = svcRows.find((r) => r.id === SERVICE_WORK_BONUS_COEFFICIENT_ID);
        if (row != null && typeof row.value === 'number' && !Number.isNaN(row.value)) {
          setServiceBonusPercentFromApi(row.value);
        }
        const rowRepair = svcRows.find((r) => r.id === SERVICE_REPAIR_WORK_BONUS_COEFFICIENT_ID);
        if (rowRepair != null && typeof rowRepair.value === 'number' && !Number.isNaN(rowRepair.value)) {
          setServiceRepairBonusPercentFromApi(rowRepair.value);
        }
      } catch (_) {
        /* залишаємо null → фолбек 25% */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Фільтровані користувачі (регіональні інженери)
  const filteredUsers = useMemo(() => {
    if (!users.length) return [];
    return users.filter(u => {
      // Фільтр по регіону (якщо не "всі")
      if (effectiveRegion && u.region !== effectiveRegion) return false;
      // Фільтр по ролі (тільки сервісні інженери)
      if (u.role !== 'service') return false;
      // Фільтр звільнених
      if (!showDismissed && (u.dismissed === true || u.dismissed === 'true')) return false;
      return true;
    });
  }, [users, effectiveRegion, showDismissed]);

  // Регіони для відображення
  const regions = useMemo(() => {
    // Якщо вибрано "Показати всі" - повертаємо всі регіони
    if (selectedRegion === 'ALL' || !effectiveRegion) {
      return availableRegions;
    }
    return effectiveRegion ? [effectiveRegion] : [];
  }, [effectiveRegion, selectedRegion, availableRegions]);

  // Заявки з заборгованістю по документам (для вкладки debt)
  const debtTasks = useMemo(() => {
    const isApproved = (v) => v === true || v === 'Підтверджено';
    
    return allTasks.filter(task => {
      // 1. Статус = 'Виконано'
      if (task.status !== 'Виконано') return false;
      
      // 2. Затверджено бухгалтером
      if (!isApproved(task.approvedByAccountant)) return false;
      
      // 3. paymentType не 'Готівка' і не 'Інше'
      const pt = task.paymentType || '';
      if (!pt || pt === '' || pt === 'не вибрано' || pt === 'Готівка' || pt === 'Інше') return false;
      
      // 4. debtStatus = 'Заборгованість' або не встановлено
      const ds = task.debtStatus;
      if (ds && ds !== '' && ds !== 'Заборгованість') return false;
      
      // 5. Фільтрація по регіону (для користувачів не з України)
      if (user?.region && user.region !== 'Україна') {
        if (task.serviceRegion !== user.region) return false;
      }
      
      return true;
    });
  }, [allTasks, user?.region]);

  // Відфільтровані заявки з заборгованістю (з урахуванням фільтрів по колонкам)
  const filteredDebtTasks = useMemo(() => {
    return debtTasks.filter(task => {
      // Фільтр по номеру заявки
      if (debtFilters.requestNumber && !(task.requestNumber || '').toLowerCase().includes(debtFilters.requestNumber.toLowerCase())) {
        return false;
      }
      // Фільтр по даті
      if (debtFilters.date && !(task.date || task.requestDate || '').toLowerCase().includes(debtFilters.date.toLowerCase())) {
        return false;
      }
      // Фільтр по замовнику
      if (debtFilters.client && !(task.client || '').toLowerCase().includes(debtFilters.client.toLowerCase())) {
        return false;
      }
      // Фільтр по ЄДРПОУ
      if (debtFilters.edrpou && !(task.edrpou || '').toLowerCase().includes(debtFilters.edrpou.toLowerCase())) {
        return false;
      }
      // Фільтр по адресі
      if (debtFilters.address && !(task.address || '').toLowerCase().includes(debtFilters.address.toLowerCase())) {
        return false;
      }
      // Фільтр по обладнанню
      if (debtFilters.equipment && !(task.equipment || '').toLowerCase().includes(debtFilters.equipment.toLowerCase())) {
        return false;
      }
      // Фільтр по виду оплати
      if (debtFilters.paymentType && !(task.paymentType || '').toLowerCase().includes(debtFilters.paymentType.toLowerCase())) {
        return false;
      }
      // Фільтр по сумі
      if (debtFilters.serviceTotal && !(String(task.serviceTotal) || '').toLowerCase().includes(debtFilters.serviceTotal.toLowerCase())) {
        return false;
      }
      // Фільтр по регіону
      if (debtFilters.serviceRegion && !(task.serviceRegion || '').toLowerCase().includes(debtFilters.serviceRegion.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [debtTasks, debtFilters]);

  const exportApprovalPool = useMemo(() => {
    if (!allTasks.length) return [];
    let list;
    if (user?.region && user.region !== 'Україна') {
      list = allTasks.filter((t) => t.serviceRegion === user.region);
    } else if (selectedRegion === 'ALL') {
      const set = new Set(availableRegions);
      list = allTasks.filter((t) => set.has(t.serviceRegion || 'Без регіону'));
    } else {
      const er = effectiveRegion;
      if (!er) list = [...allTasks];
      else list = allTasks.filter((t) => (t.serviceRegion || 'Без регіону') === er);
    }
    return list.filter(isTaskOnAccountantApproval);
  }, [allTasks, user?.region, selectedRegion, effectiveRegion, availableRegions]);

  const visibleExportTasks = useMemo(() => {
    const q = exportSearch.trim().toLowerCase();
    let rows = exportApprovalPool;
    if (q) {
      rows = rows.filter((t) => String(t.requestNumber || '').toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      const na = String(a.requestNumber || '');
      const nb = String(b.requestNumber || '');
      const cmp = na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
      return exportSortDesc ? -cmp : cmp;
    });
  }, [exportApprovalPool, exportSearch, exportSortDesc]);

  const exportHiddenSelectedCount = useMemo(() => {
    if (exportSelectedIds.size === 0) return 0;
    const visibleIds = new Set(visibleExportTasks.map((t) => getTaskRecordId(t)));
    let n = 0;
    exportSelectedIds.forEach((id) => {
      if (!visibleIds.has(id)) n += 1;
    });
    return n;
  }, [exportSelectedIds, visibleExportTasks]);

  const handleStartApplicationExport = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      alert(
        'Вибір папки для збереження недоступний у цьому браузері. Використайте Google Chrome або Microsoft Edge.'
      );
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      setExportRootDirHandle(handle);
      setExportSelectedIds(new Set());
      setExportSearch('');
      setExportSortDesc(true);
      setExportModalOpen(true);
    } catch (e) {
      if (e && e.name !== 'AbortError') {
        console.error(e);
        alert('Не вдалося отримати доступ до папки. Перевірте дозволи браузера.');
      }
    }
  }, []);

  const handleCloseExportModal = useCallback(() => {
    if (exportBusy) return;
    setExportModalOpen(false);
    setExportRootDirHandle(null);
    setExportSearch('');
  }, [exportBusy]);

  const toggleExportTask = useCallback((id) => {
    setExportSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisibleExport = useCallback(() => {
    setExportSelectedIds((prev) => {
      const next = new Set(prev);
      visibleExportTasks.forEach((t) => next.add(getTaskRecordId(t)));
      return next;
    });
  }, [visibleExportTasks]);

  const clearExportSelection = useCallback(() => {
    setExportSelectedIds(new Set());
  }, []);

  const runApplicationExport = useCallback(async () => {
    if (!exportRootDirHandle || exportSelectedIds.size === 0) {
      alert('Оберіть принаймні одну заявку');
      return;
    }
    const token = localStorage.getItem('token');
    setExportBusy(true);
    const usedFolders = new Set();
    const errors = [];
    let savedFiles = 0;
    try {
      for (const taskId of exportSelectedIds) {
        const task = exportApprovalPool.find((t) => getTaskRecordId(t) === taskId);
        if (!task) continue;
        const folderName = allocateUniqueFolderName(getExportFolderBaseName(task), usedFolders);
        let dirHandle;
        try {
          dirHandle = await exportRootDirHandle.getDirectoryHandle(folderName, { create: true });
        } catch (e) {
          errors.push(`Папка «${folderName}»: ${e.message || e}`);
          continue;
        }
        let files = [];
        try {
          const res = await fetch(`${API_BASE_URL}/files/task/${taskId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            files = await res.json();
          } else {
            errors.push(`Заявка ${task.requestNumber || taskId}: не вдалося отримати список файлів`);
          }
        } catch (e) {
          errors.push(`Заявка ${task.requestNumber || taskId}: ${e.message || e}`);
          continue;
        }
        const list = Array.isArray(files) ? files : [];
        const usedFileNames = new Map();
        for (const f of list) {
          const url = f.cloudinaryUrl;
          if (!url) continue;
          try {
            const originalName = f.originalName || 'file';
            let fileName = originalName;
            const count = (usedFileNames.get(fileName) || 0) + 1;
            usedFileNames.set(fileName, count);
            if (count > 1) {
              const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
              const baseName = ext ? fileName.slice(0, -(ext.length + 1)) : fileName;
              fileName = ext ? `${baseName}_${count}.${ext}` : `${baseName}_${count}`;
            }
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const fh = await dirHandle.getFileHandle(fileName, { create: true });
            const writable = await fh.createWritable();
            await writable.write(blob);
            await writable.close();
            savedFiles += 1;
          } catch (e) {
            errors.push(`Файл «${f.originalName || 'file'}» (заявка ${task.requestNumber || taskId}): ${e.message || e}`);
          }
        }
      }
      if (errors.length) {
        console.error('[EXPORT APPLICATIONS]', errors);
        alert(
          `Вивантажено файлів: ${savedFiles}.\nДеякі кроки з помилками:\n${errors.slice(0, 8).join('\n')}${
            errors.length > 8 ? '\n…' : ''
          }`
        );
      } else {
        alert(`Готово. Збережено файлів: ${savedFiles}.`);
      }
      setExportModalOpen(false);
      setExportRootDirHandle(null);
      setExportSelectedIds(new Set());
    } finally {
      setExportBusy(false);
    }
  }, [exportRootDirHandle, exportSelectedIds, exportApprovalPool]);

  // Обробник зміни фільтра
  const handleDebtFilterChange = useCallback((field, value) => {
    setDebtFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  // Скидання фільтрів
  const clearDebtFilters = useCallback(() => {
    setDebtFilters({
      requestNumber: '',
      date: '',
      client: '',
      edrpou: '',
      address: '',
      equipment: '',
      paymentType: '',
      serviceTotal: '',
      serviceRegion: ''
    });
  }, []);

  // Обробник відкриття заявки для перегляду
  const handleViewTask = useCallback((task) => {
    setViewingTask(task);
    setShowViewModal(true);
  }, []);

  // Обробник закриття модального вікна
  const handleCloseViewModal = useCallback(() => {
    setViewingTask(null);
    setShowViewModal(false);
  }, []);

  const fetchRegionalNotificationsUnread = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/manager-notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotificationsUnreadCount(typeof data.count === 'number' ? data.count : 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchRegionalNotificationsUnread();
    const id = setInterval(fetchRegionalNotificationsUnread, 60000);
    return () => clearInterval(id);
  }, [fetchRegionalNotificationsUnread]);

  const handleOpenTaskFromNotification = useCallback(async (taskId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        alert('Не вдалося завантажити заявку');
        return;
      }
      const task = await res.json();
      setViewingTask(task);
      setShowViewModal(true);
    } catch {
      alert('Помилка завантаження заявки');
    }
  }, []);

  // Завантаження даних
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Паралельне завантаження (включно зі звільненими користувачами)
      const [tasksRes, usersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/tasks/filter?status=Виконано`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/users?includeDismissed=true`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setAllTasks(tasksData);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }
    } catch (error) {
      console.error('Помилка завантаження даних:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Завантаження даних табеля з сервера
  const loadTimesheetData = useCallback(async (regionsToLoad, usersToLoad) => {
    if (!regionsToLoad.length || !usersToLoad.length) return;
    
    try {
      setTimesheetLoading(true);
      const token = localStorage.getItem('token');
      
      // Завантажуємо дані для всіх регіонів
      const regionPromises = regionsToLoad.map(region =>
        fetch(`${API_BASE_URL}/timesheet?region=${encodeURIComponent(region)}&year=${year}&month=${month}&type=regular`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.json())
      );

      const results = await Promise.all(regionPromises);
      
      let mergedData = {};
      let mergedPayData = {};
      
      results.forEach(result => {
        if (result.success && result.timesheet) {
          console.log('[TIMESHEET] Дані з сервера:', {
            dataKeys: Object.keys(result.timesheet.data || {}),
            payDataKeys: Object.keys(result.timesheet.payData || {})
          });
          mergedData = { ...mergedData, ...result.timesheet.data };
          mergedPayData = { ...mergedPayData, ...result.timesheet.payData };
        }
      });

      console.log('[TIMESHEET] Користувачі:', usersToLoad.map(u => ({ id: u.id, _id: u._id, name: u.name })));
      console.log('[TIMESHEET] Merged data keys:', Object.keys(mergedData));

      // Для користувачів без даних - створюємо за замовчуванням
      // Також перевіряємо різні формати ключів (id, _id, string)
      usersToLoad.forEach(u => {
        const userId = u.id || u._id;
        const userIdStr = String(userId);
        
        // Перевіряємо чи є дані з різними форматами ключа
        let existingData = mergedData[userId] || mergedData[userIdStr];
        
        // Якщо дані знайдені під іншим ключем - копіюємо під правильний
        if (!mergedData[userId] && existingData) {
          mergedData[userId] = existingData;
        }
        
        if (!mergedData[userId]) {
          console.log('[TIMESHEET] Створюємо дефолтні дані для:', userId, u.name);
          mergedData[userId] = {};
          days.forEach(d => {
            const date = new Date(year, month - 1, d);
            const dayOfWeek = date.getDay();
            mergedData[userId][d] = (dayOfWeek === 0 || dayOfWeek === 6) ? 0 : 8;
          });
          mergedData[userId].total = days.reduce((sum, d) => sum + (mergedData[userId][d] || 0), 0);
        }
      });

      setTimesheetData(mergedData);
      setPayData(mergedPayData);
    } catch (error) {
      console.error('Помилка завантаження табеля:', error);
    } finally {
      setTimesheetLoading(false);
    }
  }, [year, month, days]);

  // Завантажуємо табель коли змінюється рік/місяць або регіон
  useEffect(() => {
    if (filteredUsers.length > 0 && regions.length > 0) {
      loadTimesheetData(regions, filteredUsers);
    }
  }, [year, month, selectedRegion, filteredUsers.length, regions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Збереження табеля на сервер з дебаунсом
  const saveTimesheetToServer = useCallback(async (dataToSave, payDataToSave) => {
    if (!user?.id && !user?._id) return;
    
    try {
      setSaveStatus('saving');
      const token = localStorage.getItem('token');
      
      // Групуємо дані по регіонах
      const dataByRegion = {};
      const payDataByRegion = {};
      
      filteredUsers.forEach(u => {
        const userId = u.id || u._id;
        const region = u.region || 'Без регіону';
        
        if (!dataByRegion[region]) {
          dataByRegion[region] = {};
          payDataByRegion[region] = {};
        }
        
        if (dataToSave[userId]) {
          dataByRegion[region][userId] = dataToSave[userId];
        }
        if (payDataToSave[userId]) {
          payDataByRegion[region][userId] = payDataToSave[userId];
        }
      });

      // Зберігаємо для кожного регіону
      const savePromises = Object.keys(dataByRegion).map(region =>
        fetch(`${API_BASE_URL}/timesheet`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            region,
            year,
            month,
            type: 'regular',
            data: dataByRegion[region],
            payData: payDataByRegion[region],
            summary: workDaysInfo,
            createdBy: `${user.name || user.login} (${user.id || user._id})`
          })
        })
      );

      await Promise.all(savePromises);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (error) {
      console.error('Помилка збереження табеля:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  }, [user, filteredUsers, year, month, workDaysInfo]);

  // Дебаунс збереження (2 секунди після останньої зміни)
  const debouncedSave = useCallback((newData, newPayData) => {
    pendingSaveRef.current = { data: newData, payData: newPayData };
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      if (pendingSaveRef.current) {
        saveTimesheetToServer(pendingSaveRef.current.data, pendingSaveRef.current.payData);
        pendingSaveRef.current = null;
      }
    }, 2000);
  }, [saveTimesheetToServer]);

  // Обробник зміни годин в табелі
  const handleTimesheetChange = useCallback((userId, day, value) => {
    if (!userId) return;
    
    setTimesheetData(prev => {
      const userData = prev[userId] || {};
      const newUserData = { ...userData, [day]: value === '' ? 0 : Number(value) };
      const total = days.reduce((sum, d) => sum + (Number(newUserData[d]) || 0), 0);
      newUserData.total = total;
      
      const newData = { ...prev, [userId]: newUserData };
      debouncedSave(newData, payData);
      return newData;
    });
  }, [days, payData, debouncedSave]);

  // Обробник зміни ставки
  const handlePayDataChange = useCallback((userId, field, value) => {
    if (!userId) return;
    
    setPayData(prev => {
      const userData = prev[userId] || {};
      const newUserData = { ...userData, [field]: value === '' ? 0 : Number(value) };
      
      const newPayData = { ...prev, [userId]: newUserData };
      debouncedSave(timesheetData, newPayData);
      return newPayData;
    });
  }, [timesheetData, debouncedSave]);

  // Розрахунок премії для інженера
  const calculateEngineerBonus = useCallback((engineerName) => {
    let bonus = 0;
    
    allTasks.forEach(t => {
      if (
        t.status === 'Виконано' &&
        (t.approvedByWarehouse === 'Підтверджено' || t.approvedByWarehouse === true) &&
        (t.approvedByAccountant === 'Підтверджено' || t.approvedByAccountant === true)
      ) {
        let bonusApprovalDate = t.bonusApprovalDate;
        
        // Конвертація формату YYYY-MM-DD в MM-YYYY
        if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
          const [y, m] = bonusApprovalDate.split('-');
          bonusApprovalDate = `${m}-${y}`;
        }
        
        if (!t.date || !bonusApprovalDate) return;
        
        const workDate = new Date(t.date);
        const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
        const approvalMonth = parseInt(approvalMonthStr);
        const approvalYear = parseInt(approvalYearStr);
        const workMonth = workDate.getMonth() + 1;
        const workYear = workDate.getFullYear();
        
        // Визначаємо місяць для нарахування премії
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
        
        if (bonusMonth === month && bonusYear === year) {
          const workPrice = parseFloat(t.workPrice) || 0;
          const frac = effectiveServiceBonusFractionForTask(
            t,
            serviceBonusPercentFromApi,
            serviceRepairBonusPercentFromApi
          );
          const taskBonus = workPrice * frac;
          
          const engineers = [
            (t.engineer1 || '').trim(),
            (t.engineer2 || '').trim(),
            (t.engineer3 || '').trim(),
            (t.engineer4 || '').trim(),
            (t.engineer5 || '').trim(),
            (t.engineer6 || '').trim()
          ].filter(eng => eng && eng.length > 0);
          
          if (engineers.includes(engineerName) && engineers.length > 0) {
            bonus += taskBonus / engineers.length;
          }
        }
      }
    });
    
    return bonus;
  }, [allTasks, month, year, serviceBonusPercentFromApi, serviceRepairBonusPercentFromApi]);

  // Розрахунок зарплати для користувача
  const calculateUserPay = useCallback((userId, userName) => {
    const userData = timesheetData[userId] || {};
    const userPayData = payData[userId] || {};
    const total = userData.total || 0;
    const salary = Number(userPayData.salary) || 25000;
    const customBonus = Number(userPayData.bonus) || 0;
    
    let overtime = 0;
    let weekendHours = 0;
    let workDaysTotal = 0;
    
    days.forEach(d => {
      const dayHours = parseFloat(userData[d]) || 0;
      const date = new Date(year, month - 1, d);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      if (!isWeekend) {
        workDaysTotal += dayHours;
        if (dayHours > 8) overtime += (dayHours - 8);
      }
      
      if (isWeekend && dayHours > 0) {
        weekendHours += dayHours;
      }
    });
    
    const overtimeRate = workDaysInfo.workHours > 0 ? (salary / workDaysInfo.workHours) * 2 : 0;
    const overtimePay = overtime * overtimeRate;
    const weekendPay = weekendHours * overtimeRate;
    const normalHours = workDaysTotal - overtime;
    const basePay = Math.round(salary * Math.min(normalHours, workDaysInfo.workHours) / workDaysInfo.workHours);
    const engineerBonus = calculateEngineerBonus(userName);
    const totalPay = basePay + overtimePay + customBonus + engineerBonus + weekendPay;
    
    return {
      total,
      salary,
      normalHours,
      overtime,
      overtimeRate,
      overtimePay,
      basePay,
      engineerBonus,
      weekendHours,
      weekendPay,
      totalPay
    };
  }, [timesheetData, payData, days, year, month, workDaysInfo, calculateEngineerBonus]);

  // Функція формування звіту
  const handleFormReport = useCallback(() => {
    const monthName = months[month - 1];
    const reportTitle = `Звіт по табелю часу та виконаних робіт за ${monthName} ${year}`;
    
    // Визначаємо регіони для звіту
    const reportRegions = selectedRegion === 'ALL' ? availableRegions : [selectedRegion];
    
    // Генеруємо HTML для кожного регіону
    const generateRegionReport = (region) => {
      const regionUsers = filteredUsers.filter(u => (u.region || 'Без регіону') === region);
      
      // Фільтруємо користувачів з ненульовою оплатою
      const usersWithPayment = regionUsers.filter(u => {
        const calc = calculateUserPay(u.id || u._id, u.name);
        return calc.totalPay > 0;
      });
      
      if (usersWithPayment.length === 0) return null;
      
      // Таблиця табеля часу
      const timesheetTable = `
        <h4>Табель часу - Регіон: ${region}</h4>
        <table>
          <thead>
            <tr>
              <th>ПІБ</th>
              ${days.map(d => {
                const date = new Date(year, month - 1, d);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return `<th${isWeekend ? ' class="weekend"' : ''}>${d}</th>`;
              }).join('')}
              <th>Всього</th>
            </tr>
          </thead>
          <tbody>
            ${usersWithPayment.map(u => {
              const userId = u.id || u._id;
              return `
                <tr>
                  <td>${u.name}</td>
                  ${days.map(d => {
                    const date = new Date(year, month - 1, d);
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    return `<td${isWeekend ? ' class="weekend"' : ''}>${timesheetData[userId]?.[d] || 0}</td>`;
                  }).join('')}
                  <td><strong>${timesheetData[userId]?.total || 0}</strong></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
      
      // Таблиця нарахувань
      const accrualTable = `
        <h4>Таблиця нарахування - Регіон: ${region}</h4>
        <table>
          <thead>
            <tr>
              <th>ПІБ</th>
              <th>Ставка</th>
              <th>Відпрац. год</th>
              <th>Понаднорм.</th>
              <th>Ціна/год понадн.</th>
              <th>Доплата понадн.</th>
              <th>Базова ЗП</th>
              <th>Премія за роботи</th>
              <th>Год. вихідних</th>
              <th>Доплата вих.</th>
              <th>Загальна сума</th>
            </tr>
          </thead>
          <tbody>
            ${usersWithPayment.map(u => {
              const calc = calculateUserPay(u.id || u._id, u.name);
              return `
                <tr>
                  <td>${u.name}</td>
                  <td>${calc.salary}</td>
                  <td>${calc.normalHours}</td>
                  <td>${calc.overtime}</td>
                  <td>${calc.overtimeRate.toFixed(2)}</td>
                  <td>${calc.overtimePay.toFixed(2)}</td>
                  <td>${calc.basePay}</td>
                  <td class="bonus">${calc.engineerBonus.toFixed(2)}</td>
                  <td>${calc.weekendHours}</td>
                  <td>${calc.weekendPay.toFixed(2)}</td>
                  <td class="total">${calc.totalPay.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
      
      // Деталізація виконаних робіт для регіону (логіка як в оригіналі)
      const isApproved = (v) => v === true || v === 'Підтверджено';
      
      // Фільтруємо заявки для деталізації по bonusApprovalDate
      const regionTasksForDetails = allTasks.filter(t => {
        // Базові перевірки
        if (t.status !== 'Виконано') return false;
        if (!t.date) return false;
        if (!t.bonusApprovalDate) return false; // Обов'язково потрібен bonusApprovalDate
        if (!isApproved(t.approvedByWarehouse)) return false;
        if (!isApproved(t.approvedByAccountant)) return false;
        
        // Фільтрація по регіону
        if (t.serviceRegion !== region) return false;
        
        // Перевіряємо чи інженер є серед користувачів з ненульовою оплатою
        const engineer1 = (t.engineer1 || '').trim();
        const engineer2 = (t.engineer2 || '').trim();
        const hasEngineer1 = usersWithPayment.some(u => (u.name || '').trim() === engineer1);
        const hasEngineer2 = usersWithPayment.some(u => (u.name || '').trim() === engineer2);
        
        if (!hasEngineer1 && !hasEngineer2) return false;
        
        // Автоконвертація bonusApprovalDate
        let bonusApprovalDate = t.bonusApprovalDate;
        if (/^\d{4}-\d{2}-\d{2}$/.test(bonusApprovalDate)) {
          const [y, m] = bonusApprovalDate.split('-');
          bonusApprovalDate = `${m}-${y}`;
        }
        
        // Визначення місяця премії
        const workDate = new Date(t.date);
        const [approvalMonthStr, approvalYearStr] = bonusApprovalDate.split('-');
        const approvalMonth = parseInt(approvalMonthStr);
        const approvalYear = parseInt(approvalYearStr);
        const workMonth = workDate.getMonth() + 1;
        const workYear = workDate.getFullYear();
        
        let bonusMonth, bonusYear;
        if (workMonth === approvalMonth && workYear === approvalYear) {
          // Якщо місяць роботи = місяць затвердження - премія за цей місяць
          bonusMonth = workMonth;
          bonusYear = workYear;
        } else {
          // Інакше - премія за попередній місяць від місяця затвердження
          if (approvalMonth === 1) {
            bonusMonth = 12;
            bonusYear = approvalYear - 1;
          } else {
            bonusMonth = approvalMonth - 1;
            bonusYear = approvalYear;
          }
        }
        
        // Перевіряємо чи співпадає з вибраним місяцем/роком
        return bonusMonth === month && bonusYear === year;
      });
      
      // Розраховуємо загальні суми
      let totalServiceSum = 0;
      let totalWorkPrice = 0;
      let totalBonus = 0;
      
      regionTasksForDetails.forEach(t => {
        const serviceTotal = parseFloat(t.serviceTotal) || 0;
        const workPrice = parseFloat(t.workPrice) || 0;
        const bonus =
          workPrice *
          effectiveServiceBonusFractionForTask(
            t,
            serviceBonusPercentFromApi,
            serviceRepairBonusPercentFromApi
          );
        
        totalServiceSum += serviceTotal;
        totalWorkPrice += workPrice;
        totalBonus += bonus;
      });
      
      // Формуємо таблицю деталізації
      const detailsTable = regionTasksForDetails.length > 0 ? `
        <h4>Деталізація виконаних робіт - Регіон: ${region}</h4>
        <table class="details">
          <thead>
            <tr>
              <th>№</th>
              <th>Номер заявки</th>
              <th>Дата</th>
              <th>Інженер</th>
              <th>Клієнт</th>
              <th>Адреса</th>
              <th>Обладнання</th>
              <th><b>Найменування робіт</b></th>
              <th>Компанія виконавець</th>
              <th>Загальна сума з матеріалами</th>
              <th>Вартість робіт</th>
              <th>% премії</th>
              <th>Загальна премія</th>
            </tr>
          </thead>
          <tbody>
            ${regionTasksForDetails.map((t, index) => {
              const workPrice = parseFloat(t.workPrice) || 0;
              const pctUsed = effectiveServiceBonusPercentForTask(
                t,
                serviceBonusPercentFromApi,
                serviceRepairBonusPercentFromApi
              );
              const bonus = workPrice * (pctUsed / 100);
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${t.requestNumber || ''}</td>
                  <td>${t.date || ''}</td>
                  <td>${[
                    t.engineer1 || '',
                    t.engineer2 || '',
                    t.engineer3 || '',
                    t.engineer4 || '',
                    t.engineer5 || '',
                    t.engineer6 || ''
                  ].filter(eng => eng && eng.trim().length > 0).join(', ')}</td>
                  <td>${t.client || ''}</td>
                  <td>${t.address || ''}</td>
                  <td>${t.equipment || ''}</td>
                  <td>${t.work || ''}</td>
                  <td>${t.company || ''}</td>
                  <td>${t.serviceTotal || ''}</td>
                  <td>${workPrice.toFixed(2)}</td>
                  <td>${pctUsed}%</td>
                  <td>${bonus.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
            <tr class="summary-row">
              <td colspan="9" style="text-align: right;"><strong>ЗАГАЛЬНА СУМА:</strong></td>
              <td><strong>${totalServiceSum.toFixed(2)}</strong></td>
              <td><strong>${totalWorkPrice.toFixed(2)}</strong></td>
              <td>—</td>
              <td><strong>${totalBonus.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
      ` : '';
      
      return { timesheetTable, accrualTable, detailsTable };
    };
    
    // Генеруємо контент для всіх регіонів
    const regionsContent = reportRegions.map(region => {
      const report = generateRegionReport(region);
      if (!report) return '';
      return `
        <div style="margin-bottom: 40px; page-break-after: always;">
          <h3 style="color: #1976d2; border-bottom: 2px solid #1976d2; padding-bottom: 10px;">Регіон: ${region}</h3>
          ${report.timesheetTable}
          ${report.accrualTable}
          ${report.detailsTable}
        </div>
      `;
    }).filter(Boolean).join('');
    
    // Формуємо повний HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle}</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; background: #f8fafc; color: #222; padding: 24px; }
          h2 { color: #1976d2; text-align: center; }
          h3 { color: #1976d2; margin-top: 30px; }
          h4 { color: #1976d2; margin-top: 20px; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 24px; font-size: 12px; }
          th, td { border: 1px solid #000; padding: 4px 6px; text-align: center; }
          th { background: #ffe600; color: #222; }
          .weekend { background: #ffcccc !important; }
          .bonus { background: #ffe066; font-weight: bold; }
          .total { background: #b6ffb6; font-weight: bold; }
          .amount { text-align: right; font-family: monospace; }
          .details th { background: #e0e0e0; }
          .summary-row { background: #1976d2 !important; color: white !important; }
          .summary-row td { color: white; border-color: #1976d2; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
          .print-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 24px;
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <button class="print-btn no-print" onclick="window.print()">🖨️ Друк</button>
        <h2>${reportTitle}</h2>
        <p style="text-align: center; color: #666;">Робочих днів: ${workDaysInfo.workDays} | Норма годин: ${workDaysInfo.workHours}</p>
        ${regionsContent}
      </body>
      </html>
    `;
    
    // Відкриваємо в новому вікні
    const newWindow = window.open('', '_blank');
    newWindow.document.write(html);
    newWindow.document.close();
  }, [
    month,
    year,
    months,
    selectedRegion,
    availableRegions,
    filteredUsers,
    days,
    timesheetData,
    calculateUserPay,
    workDaysInfo,
    allTasks,
    serviceBonusPercentFromApi,
    serviceRepairBonusPercentFromApi
  ]);

  if (loading) {
    return <div className="loading">Завантаження...</div>;
  }

  return (
    <div className="regional-dashboard">
      {/* Вкладки */}
      <div className="regional-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          🔔 Системні сповіщення
          {notificationsUnreadCount > 0 ? (
            <span className="regional-tab-count">
              {notificationsUnreadCount > 99 ? '99+' : notificationsUnreadCount}
            </span>
          ) : null}
        </button>
        <button 
          type="button"
          className={`tab-btn ${activeTab === 'personnel' ? 'active' : ''}`}
          onClick={() => setActiveTab('personnel')}
        >
          👥 Звіт по персоналу
        </button>
        <button 
          type="button"
          className={`tab-btn ${activeTab === 'debt' ? 'active' : ''}`}
          onClick={() => setActiveTab('debt')}
        >
          💰 Заборгованість по документам ({debtTasks.length})
        </button>
        <button 
          type="button"
          className={`tab-btn ${activeTab === 'paymentDebt' ? 'active' : ''}`}
          onClick={() => setActiveTab('paymentDebt')}
        >
          💳 Заборгованість по оплаті
        </button>
      </div>

      {activeTab === 'notifications' && (
        <div className="regional-notifications-wrap debt-section">
          <ManagerNotificationsTab
            onUnreadCountChange={fetchRegionalNotificationsUnread}
            onOpenTask={handleOpenTaskFromNotification}
          />
        </div>
      )}

      {/* Вкладка заборгованості по оплаті */}
      {activeTab === 'paymentDebt' && (
        <div className="debt-section payment-debt-section">
          <div className="debt-header">
            <h3>💳 Заборгованість по оплаті</h3>
            <p className="debt-description">
              Виконані заявки без заповненої дати оплати (вид оплати Готівка, Безготівка, На карту, Інше), без внутрішніх робіт
            </p>
          </div>
          <TaskTable
            user={user}
            status="paymentDebt"
            onRowClick={handleViewTask}
            columnsArea="service"
          />
        </div>
      )}

      {/* Вкладка заборгованості по документам */}
      {activeTab === 'debt' && (
        <div className="debt-section">
          <div className="debt-header">
            <h3>💰 Заборгованість по документам</h3>
            <div className="debt-stats">
              <span className="stat-item">Всього: {debtTasks.length}</span>
              <span className="stat-item">Відфільтровано: {filteredDebtTasks.length}</span>
              {Object.values(debtFilters).some(v => v) && (
                <button className="btn-clear-filters" onClick={clearDebtFilters}>
                  🗑️ Скинути фільтри
                </button>
              )}
            </div>
          </div>
          <p className="debt-description">
            Заявки зі статусом "Виконано", затверджені бухгалтером, з видом оплати Безготівка/На карту, де відсутні оригінали актів виконаних робіт
          </p>
          
          {debtTasks.length === 0 ? (
            <div className="no-debt-tasks">
              ✅ Немає заявок із заборгованістю по документам
            </div>
          ) : (
            <div className="debt-table-wrapper">
              <table className="debt-table">
                <thead>
                  <tr>
                    <th>№ заявки</th>
                    <th>Дата</th>
                    <th>Замовник</th>
                    <th>ЄДРПОУ</th>
                    <th>Адреса</th>
                    <th>Обладнання</th>
                    <th>Вид оплати</th>
                    <th>Сума</th>
                    <th>Регіон</th>
                  </tr>
                  {/* Рядок фільтрів */}
                  <tr className="filter-row">
                    <th>
                      <input 
                        type="text" 
                        placeholder="Фільтр..." 
                        value={debtFilters.requestNumber}
                        onChange={e => handleDebtFilterChange('requestNumber', e.target.value)}
                        className="filter-input"
                      />
                    </th>
                    <th>
                      <input 
                        type="text" 
                        placeholder="Фільтр..." 
                        value={debtFilters.date}
                        onChange={e => handleDebtFilterChange('date', e.target.value)}
                        className="filter-input"
                      />
                    </th>
                    <th>
                      <input 
                        type="text" 
                        placeholder="Фільтр..." 
                        value={debtFilters.client}
                        onChange={e => handleDebtFilterChange('client', e.target.value)}
                        className="filter-input"
                      />
                    </th>
                    <th>
                      <input 
                        type="text" 
                        placeholder="Фільтр..." 
                        value={debtFilters.edrpou}
                        onChange={e => handleDebtFilterChange('edrpou', e.target.value)}
                        className="filter-input"
                      />
                    </th>
                    <th>
                      <input 
                        type="text" 
                        placeholder="Фільтр..." 
                        value={debtFilters.address}
                        onChange={e => handleDebtFilterChange('address', e.target.value)}
                        className="filter-input"
                      />
                    </th>
                    <th>
                      <input 
                        type="text" 
                        placeholder="Фільтр..." 
                        value={debtFilters.equipment}
                        onChange={e => handleDebtFilterChange('equipment', e.target.value)}
                        className="filter-input"
                      />
                    </th>
                    <th>
                      <input 
                        type="text" 
                        placeholder="Фільтр..." 
                        value={debtFilters.paymentType}
                        onChange={e => handleDebtFilterChange('paymentType', e.target.value)}
                        className="filter-input"
                      />
                    </th>
                    <th>
                      <input 
                        type="text" 
                        placeholder="Фільтр..." 
                        value={debtFilters.serviceTotal}
                        onChange={e => handleDebtFilterChange('serviceTotal', e.target.value)}
                        className="filter-input"
                      />
                    </th>
                    <th>
                      <input 
                        type="text" 
                        placeholder="Фільтр..." 
                        value={debtFilters.serviceRegion}
                        onChange={e => handleDebtFilterChange('serviceRegion', e.target.value)}
                        className="filter-input"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDebtTasks.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="no-results">
                        Немає заявок за заданими фільтрами
                      </td>
                    </tr>
                  ) : (
                    filteredDebtTasks.map(task => (
                      <tr 
                        key={task._id || task.id} 
                        className="clickable-row"
                        onClick={() => handleViewTask(task)}
                      >
                        <td>{task.requestNumber || '-'}</td>
                        <td>{task.date || task.requestDate || '-'}</td>
                        <td>{task.client || '-'}</td>
                        <td>{task.edrpou || '-'}</td>
                        <td className="address-cell">{task.address || '-'}</td>
                        <td>{task.equipment || '-'}</td>
                        <td>{task.paymentType || '-'}</td>
                        <td className="amount-cell">{task.serviceTotal || '-'}</td>
                        <td>{task.serviceRegion || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Модальне вікно перегляду заявки (тільки для читання) */}
      {showViewModal && viewingTask && (
        <AddTaskModal
          open={showViewModal}
          onClose={handleCloseViewModal}
          initialData={viewingTask}
          user={user}
          panelType="regional"
          readOnly={true}
          hideDebtFields={true}
          onSave={(savedTask, options) => {
            if (!options?.keepModalOpen) handleCloseViewModal();
          }}
        />
      )}

      {/* Вкладка звіту по персоналу */}
      {activeTab === 'personnel' && (
      <div className="personnel-report">
          <h3>👥 Табель персоналу</h3>
          
          <div className="report-controls">
            <div className="date-selectors">
              <label>
                Регіон:
                <select 
                  value={selectedRegion} 
                  onChange={e => setSelectedRegion(e.target.value)}
                  disabled={user?.region && user.region !== 'Україна'}
                >
                  <option value="ALL">📋 Показати всі</option>
                  {availableRegions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label>
                Місяць:
                <select value={month} onChange={e => setMonth(Number(e.target.value))}>
                  {months.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label>
                Рік:
                <select value={year} onChange={e => setYear(Number(e.target.value))}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
            </div>
            
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={showDismissed}
                onChange={e => setShowDismissed(e.target.checked)}
              />
              Показати звільнених працівників
            </label>
            
            <button className="btn-form-report" onClick={handleFormReport}>
              📊 Сформувати звіт
            </button>

            <button type="button" className="btn-export-applications" onClick={handleStartApplicationExport}>
              📥 Вивантажити заявки
            </button>
            
            {saveStatus && (
              <span className={`save-status ${saveStatus}`}>
                {saveStatus === 'saving' && '💾 Збереження...'}
                {saveStatus === 'saved' && '✅ Збережено'}
                {saveStatus === 'error' && '❌ Помилка збереження'}
              </span>
            )}
          </div>

          <div className="summary-info">
            <div className="summary-item work-days">
              Робочих днів: {workDaysInfo.workDays}
            </div>
            <div className="summary-item work-hours">
              Норма годин: {workDaysInfo.workHours}
            </div>
          </div>

          {timesheetLoading ? (
            <div className="loading">Завантаження табеля...</div>
          ) : (
            regions.map(region => {
              const regionUsers = filteredUsers.filter(u => (u.region || 'Без регіону') === region);
              if (regionUsers.length === 0) return null;
              
              return (
                <div key={region} className="region-section">
                  <h4 className="region-title">Регіон: {region}</h4>
                  
                  {/* Таблиця годин */}
                  <div className="timesheet-wrapper">
                    <table className="timesheet-table">
                      <thead>
                        <tr>
                          <th className="col-num">№</th>
                          <th className="col-name">ПІБ</th>
                          {days.map(d => {
                            const date = new Date(year, month - 1, d);
                            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                            return (
                              <th key={d} className={`col-day ${isWeekend ? 'weekend' : ''}`}>{d}</th>
                            );
                          })}
                          <th className="col-total">Всього</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regionUsers.map((u, idx) => {
                          const userId = u.id || u._id;
                          return (
                            <tr key={userId}>
                              <td className="col-num">{idx + 1}</td>
                              <td className="col-name">{u.name}</td>
                              {days.map(d => {
                                const date = new Date(year, month - 1, d);
                                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                return (
                                  <td key={d} className={`col-day ${isWeekend ? 'weekend' : ''}`}>
                                    <input
                                      type="number"
                                      value={timesheetData[userId]?.[d] ?? ''}
                                      onChange={e => handleTimesheetChange(userId, d, e.target.value)}
                                      min="0"
                                      max="24"
                                    />
                                  </td>
                                );
                              })}
                              <td className="col-total">{timesheetData[userId]?.total || 0}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Таблиця нарахувань */}
                  <div className="pay-table-wrapper">
                    <table className="pay-table">
                      <thead>
                        <tr>
                          <th>ПІБ</th>
                          <th>Ставка</th>
                          <th>Відпрац. год</th>
                          <th>Понаднорм.</th>
                          <th>Ціна/год понадн.</th>
                          <th>Доплата понадн.</th>
                          <th>Базова ЗП</th>
                          <th className="bonus-col">Премія за роботи</th>
                          <th>Год. вихідних</th>
                          <th>Доплата вих.</th>
                          <th className="total-col">Всього</th>
                        </tr>
                      </thead>
                      <tbody>
                        {regionUsers.map(u => {
                          const userId = u.id || u._id;
                          const calc = calculateUserPay(userId, u.name);
                          
                          return (
                            <tr key={userId}>
                              <td>{u.name}</td>
                              <td>
                                <input
                                  type="number"
                                  value={payData[userId]?.salary || 25000}
                                  onChange={e => handlePayDataChange(userId, 'salary', e.target.value)}
                                  className="salary-input"
                                />
                              </td>
                              <td>{calc.normalHours}</td>
                              <td>{calc.overtime}</td>
                              <td>{calc.overtimeRate.toFixed(2)}</td>
                              <td>{calc.overtimePay.toFixed(2)}</td>
                              <td>{calc.basePay}</td>
                              <td className="bonus-col">{calc.engineerBonus.toFixed(2)}</td>
                              <td>{calc.weekendHours}</td>
                              <td>{calc.weekendPay.toFixed(2)}</td>
                              <td className="total-col">{calc.totalPay.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {exportModalOpen && (
        <div className="export-applications-overlay" role="presentation" onClick={handleCloseExportModal}>
          <div
            className="export-applications-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-applications-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="export-applications-title">Вивантаження заявок</h3>
            <p className="export-applications-hint">
              Лише заявки в статусі «на затвердженні бухгалтером» (виконано, підтверджено завскладом, бухгалтер ще не
              підтвердив). У вибраній папці створюються підпапки за полем «Інвент. № обладнання від замовника» (якщо
              порожнє — за номером заявки), у кожну підпапку зберігаються всі файли заявки. Пошук не знімає галочки з
              уже обраних заявок.
            </p>
            <div className="export-applications-filters">
              <label className="export-applications-search-label">
                <span>Пошук за № заявки</span>
                <input
                  type="search"
                  className="export-applications-search"
                  value={exportSearch}
                  onChange={(e) => setExportSearch(e.target.value)}
                  placeholder="Наприклад KV-0000988"
                  disabled={exportBusy}
                  autoComplete="off"
                />
              </label>
              <div className="export-applications-sort">
                <span className="export-applications-sort-label">Сортування за номером:</span>
                <button
                  type="button"
                  className={`btn-export-sort ${exportSortDesc ? 'active' : ''}`}
                  onClick={() => setExportSortDesc(true)}
                  disabled={exportBusy}
                >
                  Від більшого до меншого
                </button>
                <button
                  type="button"
                  className={`btn-export-sort ${!exportSortDesc ? 'active' : ''}`}
                  onClick={() => setExportSortDesc(false)}
                  disabled={exportBusy}
                >
                  Від меншого до більшого
                </button>
              </div>
            </div>
            <div className="export-applications-toolbar">
              <button type="button" className="btn-export-secondary" onClick={selectAllVisibleExport} disabled={exportBusy}>
                Обрати всі (на екрані)
              </button>
              <button type="button" className="btn-export-secondary" onClick={clearExportSelection} disabled={exportBusy}>
                Скинути
              </button>
              <span className="export-applications-count">
                Обрано: {exportSelectedIds.size} з {exportApprovalPool.length}
                {visibleExportTasks.length !== exportApprovalPool.length ? (
                  <span className="export-applications-shown"> · показано: {visibleExportTasks.length}</span>
                ) : null}
              </span>
            </div>
            {exportHiddenSelectedCount > 0 ? (
              <p className="export-applications-hidden-note">
                Обрано заявок поза поточним списком (пошук): {exportHiddenSelectedCount}
              </p>
            ) : null}
            <div className="export-applications-list">
              {exportApprovalPool.length === 0 ? (
                <p className="export-applications-empty">Немає заявок на затвердженні для поточного фільтра регіону.</p>
              ) : visibleExportTasks.length === 0 ? (
                <p className="export-applications-empty">Нічого не знайдено за запитом пошуку.</p>
              ) : (
                visibleExportTasks.map((task) => {
                  const id = getTaskRecordId(task);
                  return (
                    <label key={id} className="export-applications-row">
                      <input
                        type="checkbox"
                        checked={exportSelectedIds.has(id)}
                        onChange={() => toggleExportTask(id)}
                        disabled={exportBusy}
                      />
                      <span className="export-applications-row-main">№ {task.requestNumber || id}</span>
                      <span className="export-applications-row-meta">
                        {(task.customerEquipmentNumber || '').trim() || '— інвент. № не вказано'}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="export-applications-actions">
              <button type="button" className="btn-export-secondary" onClick={handleCloseExportModal} disabled={exportBusy}>
                Скасувати
              </button>
              <button type="button" className="btn-form-report" onClick={runApplicationExport} disabled={exportBusy}>
                {exportBusy ? 'Збереження…' : 'Сформувати вивантаження'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegionalDashboard;
