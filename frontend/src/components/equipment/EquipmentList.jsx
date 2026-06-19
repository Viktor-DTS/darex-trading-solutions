import React, { useState, useEffect, useMemo, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import API_BASE_URL from '../../config';
import { authFetch } from '../../utils/authFetch';
import {
  ITEM_KIND_FILTER_FIXED_ASSETS_LABEL,
  findFixedAssetsCategoryIdsFromTree,
  getItemKindFilterSelectOptions
} from '../../utils/equipmentNomenclatureFilter';
import { exportEquipmentToExcel } from '../../utils/equipmentExport';
import EquipmentHistoryModal from './EquipmentHistoryModal';
import EquipmentQRModal from './EquipmentQRModal';
import EquipmentDeleteModal from './EquipmentDeleteModal';
import EquipmentDetailsModal from './EquipmentDetailsModal';
import EquipmentEditModal from './EquipmentEditModal';
import './EquipmentList.css';

// Функції для обробки статусів (винесені за межі компонента)
const getStatusLabel = (status) => {
  const labels = {
    'in_stock': 'На складі',
    'reserved': 'На складі', // Зарезервоване також показуємо як "На складі" в колонці статусу на складі
    'pending_shipment': 'На відвантаженні',
    'shipped': 'Відвантажено',
    'in_transit': 'В дорозі',
    'written_off': 'Списано',
    'deleted': 'Видалено'
  };
  return labels[status] || status || 'На складі';
};

const getReservationStatusLabel = (item) => {
  // Перевіряємо, чи є резервування
  if (item.status === 'reserved' || item.reservedByName || item.reservationClientName) {
    return 'Зарезервовано';
  }
  return 'Вільна';
};

/** Чи прив’язано до карточки продукту (ProductCard). */
function equipmentHasProductCard(item) {
  if (!item) return false;
  const p = item.productId;
  if (p == null || p === '') return false;
  if (typeof p === 'object' && p._id) return true;
  return String(p).trim() !== '';
}

function getEquipmentRowForProductCardCheck(item) {
  if (item?.isGrouped && item.batchItems?.length) return item.batchItems[0];
  if (item?.isNoSerialMerged && item.batchItems?.length) return item.batchItems[0];
  return item;
}

// Визначення всіх колонок
const PAGE_SIZE = 100;

function canLinkProductCardsByName(role) {
  return ['admin', 'administrator', 'warehouse', 'zavsklad'].includes(String(role || '').toLowerCase());
}

const ALL_COLUMNS = [
  { key: 'itemKind', label: 'Тип номенклатури', width: 140 },
  { key: 'status', label: 'Статус на складі', width: 140 },
  { key: 'reservationStatus', label: 'Статус Резерву', width: 140 },
  { key: 'manufacturer', label: 'Виробник', width: 150 },
  { key: 'type', label: 'Тип обладнання', width: 180 },
  { key: 'quantity', label: 'Кількість', width: 100 },
  { key: 'serialNumber', label: 'Серійний номер', width: 150 },
  { key: 'currentWarehouse', label: 'Склад', width: 150 },
  { key: 'reservationClientName', label: 'Клієнт резервування', width: 200 },
  { key: 'reservedByName', label: 'Хто зарезервував', width: 180 },
  { key: 'reservationEndDate', label: 'Кінцева дата резервування', width: 190 },
  { key: 'testingStatus', label: 'Статус тестування', width: 160 },
  { key: 'testingDate', label: 'Дата тестування', width: 140 },
  { key: 'manufactureDate', label: 'Дата виробництва', width: 150 }
];

const canSeeReservationClient = (role) => ['admin', 'administrator', 'mgradm'].includes(role);

function serialNumberIsEmpty(item) {
  const s = item?.serialNumber;
  return s == null || String(s).trim() === '';
}

/**
 * Ключ для об'єднання в таблиці кількох MongoDB-документів «на складі» без серійника
 * (після зняття резерву / часткового резерву залишаються окремі рядки з однаковим типом).
 */
function noSerialStockMergeKey(item) {
  if (item.status !== 'in_stock') return null;
  if (item.isDeleted || item.status === 'deleted') return null;
  if (item.isBatch && item.batchId) return null;
  if (!serialNumberIsEmpty(item)) return null;
  const typ = String(item.type || '').trim();
  if (!typ) return null;
  const wh = String(item.currentWarehouse || item.currentWarehouseName || '').trim();
  const cat = item.categoryId != null ? String(item.categoryId._id || item.categoryId) : '';
  const kind = item.itemKind || 'equipment';
  const unit = String(item.batchUnit || '').trim() || 'шт.';
  const mvt = item.materialValueType || '';
  const mfr = String(item.manufacturer || '').trim();
  const pid =
    item.productId != null
      ? String(item.productId._id || item.productId)
      : '';
  return `ns|${typ}|${wh}|${cat}|${kind}|${unit}|${mvt}|${mfr}|${pid}`;
}

function stableNoSerialMergeRowId(mkey) {
  let h = 2166136261;
  for (let i = 0; i < mkey.length; i++) {
    h ^= mkey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `merged-ns-${(h >>> 0).toString(16)}`;
}

/** Одиниця виміру з картки (batchUnit); для згрупованої партії — з першого рядка, де вона задана */
function getEquipmentBatchUnit(item) {
  if (item?.batchUnit && String(item.batchUnit).trim()) return String(item.batchUnit).trim();
  if (item?.batchItems?.length) {
    const row = item.batchItems.find((b) => b?.batchUnit && String(b.batchUnit).trim());
    if (row) return String(row.batchUnit).trim();
  }
  return 'шт.';
}

/** Число для колонки «Кількість»: для згрупованої партії — сума quantity по рядках */
function getEquipmentQuantityNumber(item) {
  if (item?.isGrouped && item.batchItems?.length) {
    const sum = item.batchItems.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
    if (sum > 0) return sum;
  }
  const q = Number(item?.quantity);
  if (Number.isFinite(q) && q > 0) return q;
  return 1;
}

function formatEquipmentQuantityCell(item) {
  return `${getEquipmentQuantityNumber(item)} ${getEquipmentBatchUnit(item)}`;
}

/** MongoDB _id усіх документів, що відповідають рядку таблиці (включно зі згрупованими). */
function getEquipmentIdsFromRow(item) {
  if (item?.isGrouped && Array.isArray(item.batchItems) && item.batchItems.length) {
    return item.batchItems.map((b) => String(b._id)).filter((id) => id && id !== 'undefined');
  }
  const id = item?._id != null ? String(item._id) : '';
  if (!id || id.startsWith('batch-') || id.startsWith('merged-ns-')) return [];
  return [id];
}

function rowIsFullySelected(item, selectedIds) {
  const ids = getEquipmentIdsFromRow(item);
  return ids.length > 0 && ids.every((id) => selectedIds.has(id));
}

function rowIsPartiallySelected(item, selectedIds) {
  const ids = getEquipmentIdsFromRow(item);
  const n = ids.filter((id) => selectedIds.has(id)).length;
  return n > 0 && n < ids.length;
}

const EquipmentList = forwardRef(({
  user,
  warehouses,
  onMove,
  onShip,
  onReserve,
  onRequestTesting,
  showReserveAction = false,
  categoryId = null,
  includeSubtree = true,
  /** true — фільтр по visibleToManagers (панель менеджера; працює й для адміна під цим контекстом) */
  managerCategoryContext = false,
}, ref) => {
  const isAdmin = user?.role === 'admin' || user?.role === 'administrator';
  const mayLinkProductCards = canLinkProductCardsByName(user?.role);
  const showReservationClientColumn = canSeeReservationClient(user?.role || '');
  const visibleColumns = useMemo(
    () =>
      ALL_COLUMNS.filter((col) => {
        if (col.key === 'reservationClientName' && !showReservationClientColumn) return false;
        if (managerCategoryContext && col.key === 'itemKind') return false;
        return true;
      }),
    [showReservationClientColumn, managerCategoryContext]
  );
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [sortField, setSortField] = useState('type');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showFilters, setShowFilters] = useState(true);
  /** Лише рядки без прив’язки до карточки продукту (productId). */
  const [showWithoutProductCardOnly, setShowWithoutProductCardOnly] = useState(false);
  /** null — дерево ще не завантажено; Set — id категорій гілки необоротних активів */
  const [fixedAssetsCategoryIds, setFixedAssetsCategoryIds] = useState(null);
  const initialLoadDone = useRef(false);
  const [linkingProductCards, setLinkingProductCards] = useState(false);

  // Фільтри колонок
  const [columnFilters, setColumnFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('equipmentTable_filters');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  
  // Глобальний пошук (на сервері, з debounce)
  const [filter, setFilter] = useState(() => {
    try {
      const savedFilter = localStorage.getItem('equipmentTable_filter');
      return savedFilter || '';
    } catch {
      return '';
    }
  });
  const [debouncedFilter, setDebouncedFilter] = useState(filter);
  const [debouncedColumnFilters, setDebouncedColumnFilters] = useState(columnFilters);

  // Зберігаємо фільтри в localStorage
  useEffect(() => {
    try {
      localStorage.setItem('equipmentTable_filters', JSON.stringify(columnFilters));
    } catch (error) {
      console.error('Помилка збереження фільтрів:', error);
    }
  }, [columnFilters]);

  useEffect(() => {
    try {
      localStorage.setItem('equipmentTable_filter', filter);
    } catch (error) {
      console.error('Помилка збереження пошуку:', error);
    }
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(filter), 400);
    return () => clearTimeout(timer);
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedColumnFilters(columnFilters), 400);
    return () => clearTimeout(timer);
  }, [columnFilters]);

  const columnFiltersKey = useMemo(() => JSON.stringify(debouncedColumnFilters), [debouncedColumnFilters]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    categoryId,
    includeSubtree,
    managerCategoryContext,
    debouncedFilter,
    columnFiltersKey,
    showWithoutProductCardOnly,
    showDeleted,
    sortField,
    sortDirection,
  ]);

  const buildListQueryParams = useCallback(
    (pageOverride) => {
      const params = new URLSearchParams();
      params.set('page', String(pageOverride ?? currentPage));
      params.set('limit', String(PAGE_SIZE));
      params.set('sort', sortField);
      params.set('sortDir', sortDirection);
      if (categoryId) {
        params.set('categoryId', categoryId);
        if (includeSubtree) params.set('includeSubtree', 'true');
      }
      if (managerCategoryContext) params.set('managerCategoryContext', '1');
      if (debouncedFilter.trim()) params.set('search', debouncedFilter.trim());
      if (showWithoutProductCardOnly) params.set('withoutProductCard', '1');
      if (showDeleted) params.set('includeDeleted', '1');
      const activeCf = Object.fromEntries(
        Object.entries(debouncedColumnFilters).filter(([, v]) => v != null && String(v).trim() !== '')
      );
      if (Object.keys(activeCf).length) {
        params.set('columnFilters', JSON.stringify(activeCf));
      }
      const fixedAssetsFilter = debouncedColumnFilters.itemKind === ITEM_KIND_FILTER_FIXED_ASSETS_LABEL;
      if (fixedAssetsFilter && fixedAssetsCategoryIds?.size) {
        params.set('fixedAssetsCategoryIds', [...fixedAssetsCategoryIds].join(','));
      }
      return params;
    },
    [
      currentPage,
      sortField,
      sortDirection,
      categoryId,
      includeSubtree,
      managerCategoryContext,
      debouncedFilter,
      debouncedColumnFilters,
      showWithoutProductCardOnly,
      showDeleted,
      fixedAssetsCategoryIds,
    ]
  );

  const loadEquipment = useCallback(
    async (opts = {}) => {
      const page = opts.page ?? currentPage;
      if (!initialLoadDone.current) setLoading(true);
      else setRefreshing(true);
      try {
        const token = localStorage.getItem('token');
        const params = buildListQueryParams(page);
        const response = await authFetch(`${API_BASE_URL}/equipment?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) return;

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            setEquipment(data);
            setTotalItems(data.length);
            setTotalPages(1);
          } else {
            setEquipment(data.items || []);
            setTotalItems(data.total ?? 0);
            setTotalPages(data.pages ?? 1);
          }
          initialLoadDone.current = true;
        }
      } catch (error) {
        console.error('Помилка завантаження обладнання:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildListQueryParams, currentPage]
  );

  useEffect(() => {
    loadEquipment({ page: currentPage });
  }, [currentPage, buildListQueryParams, loadEquipment]);

  useEffect(() => {
    if (managerCategoryContext) {
      setFixedAssetsCategoryIds(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await authFetch(`${API_BASE_URL}/categories/tree`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.status === 401 || !res.ok || cancelled) return;
        const data = await res.json();
        const tree = Array.isArray(data) ? data : [];
        setFixedAssetsCategoryIds(findFixedAssetsCategoryIdsFromTree(tree));
      } catch {
        if (!cancelled) setFixedAssetsCategoryIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [managerCategoryContext]);

  const refreshEquipment = () => {
    loadEquipment({ silent: true });
  };

  const handleLinkProductCardsByName = async () => {
    setLinkingProductCards(true);
    try {
      const token = localStorage.getItem('token');
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const previewRes = await authFetch(`${API_BASE_URL}/equipment/link-product-cards-by-name?dryRun=1`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ dryRun: true }),
      });
      const preview = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) {
        throw new Error(preview.error || 'Не вдалося перевірити збіги');
      }
      if (!preview.linked) {
        window.alert(
          `Збігів для прив’язки не знайдено.\n\n` +
            `Перевірено позицій без карточки: ${preview.scanned ?? 0}\n` +
            `Без відповідної карточки в довіднику: ${preview.noMatch ?? 0}\n` +
            `Декілька карточок на одну назву (пропущено): ${preview.ambiguous ?? 0}`
        );
        return;
      }
      const ok = window.confirm(
        `Прив’язати ${preview.linked} поз. за збігом назви з карточкою продукту?\n\n` +
          `Перевірено: ${preview.scanned ?? 0}\n` +
          `Буде визначено групу товарів: ${preview.groupAssigned ?? 0}\n` +
          `Без збігу в довіднику: ${preview.noMatch ?? 0}\n` +
          `Неоднозначно (залишаться без карточки): ${preview.ambiguous ?? 0}\n\n` +
          `Збіг: назва в залишках = тип або коротка назва карточки (без урахування регістру).\n` +
          `Групу товарів буде взято з карточки (як в оригіналі), якщо вона ще не визначена.`
      );
      if (!ok) return;

      const res = await authFetch(`${API_BASE_URL}/equipment/link-product-cards-by-name`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Помилка прив’язки');

      window.alert(
        `Готово.\n\nПрив’язано: ${data.linked ?? 0}\n` +
          `Визначено групу товарів: ${data.groupAssigned ?? 0}\n` +
          `Без збігу: ${data.noMatch ?? 0}\n` +
          `Неоднозначно: ${data.ambiguous ?? 0}`
      );
      refreshEquipment();
    } catch (e) {
      console.error(e);
      window.alert(e.message || 'Помилка прив’язки за назвою');
    } finally {
      setLinkingProductCards(false);
    }
  };

  const fetchAllEquipmentForExport = async () => {
    const token = localStorage.getItem('token');
    const all = [];
    let page = 1;
    let pages = 1;
    do {
      const params = buildListQueryParams(page);
      params.set('limit', '200');
      const response = await authFetch(`${API_BASE_URL}/equipment?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) break;
      const data = await response.json();
      if (Array.isArray(data)) return data;
      all.push(...(data.items || []));
      pages = data.pages || 1;
      page += 1;
    } while (page <= pages);
    return all;
  };

  // Експортуємо метод оновлення через ref
  useImperativeHandle(ref, () => ({
    refresh: refreshEquipment
  }));

  const handleColumnFilterChange = (columnKey, value) => {
    setColumnFilters(prev => ({
      ...prev,
      [columnKey]: value
    }));
  };

  const clearAllFilters = () => {
    setColumnFilters({});
    setFilter('');
    setShowWithoutProductCardOnly(false);
    try {
      localStorage.removeItem('equipmentTable_filters');
      localStorage.removeItem('equipmentTable_filter');
    } catch (error) {
      console.error('Помилка видалення фільтрів:', error);
    }
  };

  const hasActiveFilters =
    Object.values(columnFilters).some((v) => v && v.trim() !== '') ||
    filter.trim() !== '' ||
    showWithoutProductCardOnly;

  const getFilterType = (columnKey) => {
    if (columnKey === 'manufactureDate' || columnKey === 'reservationEndDate') return 'date';
    if (columnKey === 'currentWarehouse') return 'select';
    if (columnKey === 'status') return 'select';
    if (columnKey === 'reservationStatus') return 'select';
    if (columnKey === 'itemKind') return 'select';
    return 'text';
  };

  const getFilterOptions = (columnKey) => {
    if (columnKey === 'currentWarehouse') {
      const fromProp = (warehouses || []).map((w) => w.name).filter(Boolean);
      const fromPage = equipment.map((eq) => eq.currentWarehouseName || eq.currentWarehouse).filter(Boolean);
      const uniqueWarehouses = [...new Set([...fromProp, ...fromPage])].sort((a, b) =>
        String(a).localeCompare(String(b), 'uk')
      );
      return ['', ...uniqueWarehouses];
    }
    if (columnKey === 'status') {
      return ['', 'На складі', 'На відвантаженні', 'В дорозі', 'Відвантажено'];
    }
    if (columnKey === 'reservationStatus') {
      return ['', 'Всі', 'Вільна', 'Зарезервовано'];
    }
    if (columnKey === 'itemKind') {
      let opts = getItemKindFilterSelectOptions();
      if (managerCategoryContext) {
        opts = opts.filter((o) => o !== ITEM_KIND_FILTER_FIXED_ASSETS_LABEL);
      }
      return opts;
    }
    return [];
  };

  // Фільтрація та сортування
  const filteredAndSortedEquipment = useMemo(() => {
    let result = [...equipment];

    // Фільтр видаленого обладнання
    if (!showDeleted) {
      result = result.filter(item => !item.isDeleted && item.status !== 'deleted');
    }

    // Групування партій (у межах поточної сторінки; фільтри та сортування — на сервері)
    const batchGroups = {};
    const noSerialGroups = {};
    const singleItems = [];

    result.forEach((item) => {
      if (item.isBatch && item.batchId && item.status === 'in_stock') {
        const key = `${item.batchId}-${item.currentWarehouse || item.currentWarehouseName}`;
        if (!batchGroups[key]) {
          batchGroups[key] = {
            ...item,
            _id: `batch-${key}`,
            batchItems: [],
            batchCount: 0,
            isGrouped: true
          };
        }
        batchGroups[key].batchItems.push(item);
        batchGroups[key].batchCount++;
        return;
      }

      const nsk = noSerialStockMergeKey(item);
      if (nsk) {
        if (!noSerialGroups[nsk]) {
          noSerialGroups[nsk] = {
            ...item,
            _id: stableNoSerialMergeRowId(nsk),
            batchItems: [],
            batchCount: 0,
            isGrouped: true,
            isNoSerialMerged: true
          };
        }
        noSerialGroups[nsk].batchItems.push(item);
        noSerialGroups[nsk].batchCount++;
        return;
      }

      singleItems.push(item);
    });

    const noSerialMergedRows = Object.values(noSerialGroups).flatMap((g) =>
      g.batchCount > 1 ? [g] : g.batchItems
    );

    return [...Object.values(batchGroups), ...noSerialMergedRows, ...singleItems];
  }, [equipment, showDeleted]);

  const toggleRowSelection = (item, e) => {
    e?.stopPropagation?.();
    const ids = getEquipmentIdsFromRow(item);
    if (!ids.length) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredAndSortedEquipment.flatMap(getEquipmentIdsFromRow);
    if (!visibleIds.length) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = visibleIds.every((id) => next.has(id));
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const visibleSelectableIds = useMemo(
    () => filteredAndSortedEquipment.flatMap(getEquipmentIdsFromRow),
    [filteredAndSortedEquipment]
  );
  const allVisibleSelected =
    visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    visibleSelectableIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;

  const handleSort = (field) => {
    setCurrentPage(1);
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const goToPage = (page) => {
    const p = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(p);
    setSelectedIds(new Set());
  };

  const formatValue = (value, key) => {
    if (value == null || value === '') return 'не визначено';
    
    if (key === 'manufactureDate' || key === 'reservationEndDate') {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('uk-UA');
        }
      } catch (e) {}
    }
    
    if (key === 'reservationStatus') {
      return value === 'reserved' ? 'Зарезервовано' : 'Вільне';
    }
    
    return String(value);
  };

  const getTestingStatusLabel = (status) => {
    const labels = {
      'none': 'Не тестувалось',
      'requested': 'Очікує',
      'in_progress': 'В роботі',
      'completed': 'Пройдено',
      'failed': 'Не пройшло'
    };
    return labels[status] || status || 'Не тестувалось';
  };

  const getTestingStatusClass = (status) => {
    const classes = {
      'none': 'testing-none',
      'requested': 'testing-requested',
      'in_progress': 'testing-progress',
      'completed': 'testing-completed',
      'failed': 'testing-failed'
    };
    return classes[status] || 'testing-none';
  };

  const getStatusClass = (status) => {
    return `status-${status}`;
  };

  const handleRowClick = (item) => {
    // Якщо це група партії, використовуємо перший елемент з batchItems
    let equipmentToEdit = item;
    if (item.isGrouped && item.batchItems && item.batchItems.length > 0) {
      equipmentToEdit = item.batchItems[0];
    }
    setSelectedEquipment(equipmentToEdit);
    setShowEditModal(true);
  };

  const handleEdit = (item, e) => {
    e.stopPropagation();
    
    // Якщо це група партії, використовуємо перший елемент з batchItems
    if (item.isGrouped && item.batchItems && item.batchItems.length > 0) {
      // Беремо перший елемент партії для редагування
      setSelectedEquipment(item.batchItems[0]);
    } else {
      setSelectedEquipment(item);
    }
    setShowEditModal(true);
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    setSelectedEquipment(null);
    refreshEquipment();
  };

  const handleExport = async () => {
    try {
      setRefreshing(true);
      const rows = await fetchAllEquipmentForExport();
      if (!rows.length) {
        alert('Немає даних для експорту');
        return;
      }
      await exportEquipmentToExcel(rows, 'equipment');
    } catch (e) {
      console.error(e);
      alert('Помилка експорту');
    } finally {
      setRefreshing(false);
    }
  };

  const renderColumnFilter = (col) => {
    const filterType = getFilterType(col.key);
    
    if (filterType === 'date') {
      return (
        <div className="filter-date-range">
          <input
            type="date"
            className="filter-input filter-date"
            value={columnFilters[col.key + 'From'] || ''}
            onChange={(e) => handleColumnFilterChange(col.key + 'From', e.target.value)}
            title={`${col.label} від`}
          />
          <input
            type="date"
            className="filter-input filter-date"
            value={columnFilters[col.key + 'To'] || ''}
            onChange={(e) => handleColumnFilterChange(col.key + 'To', e.target.value)}
            title={`${col.label} до`}
          />
        </div>
      );
    }
    
    if (filterType === 'select') {
      const options = getFilterOptions(col.key);
      return (
        <select
          className="filter-input filter-select"
          value={columnFilters[col.key] || ''}
          onChange={(e) => handleColumnFilterChange(col.key, e.target.value)}
        >
          {options.map(opt => (
            <option key={opt} value={opt}>{opt || 'Всі'}</option>
          ))}
        </select>
      );
    }
    
    return (
      <input
        type="text"
        className="filter-input"
        placeholder="Фільтр..."
        value={columnFilters[col.key] || ''}
        onChange={(e) => handleColumnFilterChange(col.key, e.target.value)}
      />
    );
  };

  if (loading) {
    return (
      <div className="equipment-loading">
        <div className="spinner"></div>
        <p>Завантаження обладнання...</p>
      </div>
    );
  }

  return (
    <div className="equipment-table-container">
      {/* Фільтри та пошук */}
      <div className="equipment-table-toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Пошук по всіх полях..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="search-input"
          />
        </div>
        <label className="equipment-toolbar-no-card-filter">
          <input
            type="checkbox"
            checked={showWithoutProductCardOnly}
            onChange={(e) => setShowWithoutProductCardOnly(e.target.checked)}
          />
          <span>Показати обладнання без картки</span>
        </label>
        {mayLinkProductCards && (
          <button
            type="button"
            className="btn-link-product-cards"
            onClick={handleLinkProductCardsByName}
            disabled={linkingProductCards || refreshing}
            title="Прив’язати позиції без карточки до довідника за точним збігом назви"
          >
            {linkingProductCards ? 'Прив’язка…' : '🔗 Прив’язати за назвою'}
          </button>
        )}
        <div className="toolbar-actions">
          {isAdmin && selectedIds.size > 0 && (
            <button
              type="button"
              className="btn-bulk-delete"
              onClick={() => setShowBulkDeleteModal(true)}
              title="Видалити вибрані позиції"
            >
              🗑️ Видалити вибрані ({selectedIds.size})
            </button>
          )}
          {isAdmin && selectedIds.size > 0 && (
            <button
              type="button"
              className="btn-clear-selection"
              onClick={clearSelection}
              title="Зняти виділення"
            >
              ✖ Зняти вибір
            </button>
          )}
          <button
            className="btn-export-excel"
            onClick={handleExport}
            title="Експортувати таблицю в Excel"
          >
            📊 Експорт
          </button>
          <button
            className={`btn-toggle-filters ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title={showFilters ? 'Сховати фільтри колонок' : 'Показати фільтри колонок'}
          >
            🔽 Фільтри
          </button>
          {hasActiveFilters && (
            <button
              className="btn-clear-filters"
              onClick={clearAllFilters}
              title="Очистити всі фільтри"
            >
              ✖ Очистити
            </button>
          )}
        </div>
        <div className="toolbar-info">
          <span>
            {refreshing ? 'Оновлення… ' : ''}
            Знайдено: {totalItems.toLocaleString('uk-UA')}
            {totalPages > 1 && ` · стор. ${currentPage}/${totalPages}`}
          </span>
        </div>
      </div>

      {/* Таблиця */}
      <div className="equipment-table-wrapper">
        <div className="equipment-table-wrapper-inner">
          <table className="equipment-table">
          <thead>
            {/* Рядок заголовків */}
            <tr>
              {isAdmin && (
                <th className="th-select" style={{ width: '42px', minWidth: '42px' }} rowSpan={showFilters ? 2 : 1}>
                  <input
                    type="checkbox"
                    className="eq-select-checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={toggleSelectAllVisible}
                    title="Вибрати всі на сторінці"
                  />
                </th>
              )}
              <th className="th-actions" style={{ width: '90px', minWidth: '90px' }} rowSpan={showFilters ? 2 : 1}>
                <div className="th-content">Дія</div>
              </th>
              {visibleColumns.map(col => (
                <th
                  key={col.key}
                  style={{ 
                    width: `${col.width}px`,
                    minWidth: '80px'
                  }}
                  onClick={() => handleSort(col.key)}
                  className={`sortable ${sortField === col.key ? `sort-${sortDirection}` : ''}`}
                >
                  <div className="th-content">
                    {col.label}
                    {sortField === col.key && (
                      <span className="sort-indicator">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
            {/* Рядок фільтрів */}
            {showFilters && (
              <tr className="filter-row">
                {visibleColumns.map(col => (
                  <th key={`filter-${col.key}`} className="filter-cell">
                    {renderColumnFilter(col)}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {filteredAndSortedEquipment.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (isAdmin ? 2 : 1)} className="empty-state">
                  Обладнання не знайдено
                </td>
              </tr>
            ) : (
              filteredAndSortedEquipment.map(item => (
                <tr 
                  key={item._id} 
                  onClick={() => handleRowClick(item)}
                  style={{ cursor: 'pointer' }}
                >
                  {isAdmin && (
                    <td className="select-cell" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="eq-select-checkbox"
                        checked={rowIsFullySelected(item, selectedIds)}
                        ref={(el) => {
                          if (el) el.indeterminate = rowIsPartiallySelected(item, selectedIds);
                        }}
                        onChange={(e) => toggleRowSelection(item, e)}
                        title="Вибрати для видалення"
                      />
                    </td>
                  )}
                  <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                    <div className="action-buttons" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '4px' }}>
                      {showReserveAction && onReserve && (
                        <button
                          className="btn-action btn-reserve"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.isGrouped && item.batchItems && item.batchItems.length > 0) {
                              onReserve(item.batchItems[0]);
                            } else {
                              onReserve(item);
                            }
                          }}
                          title="Резервувати"
                          disabled={item.status === 'reserved'}
                          style={{
                            opacity: item.status === 'reserved' ? 0.5 : 1,
                            cursor: item.status === 'reserved' ? 'not-allowed' : 'pointer'
                          }}
                        >
                          🔒
                        </button>
                      )}
                      {showReserveAction && onRequestTesting && (
                        <button
                          className="btn-action btn-test"
                          onClick={(e) => {
                            e.stopPropagation();
                            const eq = item.isGrouped && item.batchItems && item.batchItems.length > 0 
                              ? item.batchItems[0] 
                              : item;
                            onRequestTesting(eq);
                          }}
                          title="На тест"
                          disabled={item.testingStatus === 'requested' || item.testingStatus === 'in_progress'}
                          style={{
                            opacity: (item.testingStatus === 'requested' || item.testingStatus === 'in_progress') ? 0.5 : 1
                          }}
                        >
                          🧪
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          className="btn-action btn-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.isGrouped && item.batchItems && item.batchItems.length > 0) {
                              setSelectedEquipment(item.batchItems[0]);
                            } else {
                              setSelectedEquipment(item);
                            }
                            setShowDeleteModal(true);
                          }}
                          title="Видалити"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                  {!managerCategoryContext && (
                    <td>{item.itemKind === 'parts' ? 'Деталі' : 'Товари'}</td>
                  )}
                  <td>
                    <span className={`status-badge ${getStatusClass(item.status || 'in_stock')}`}>
                      {getStatusLabel(item.status || 'in_stock')}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${getReservationStatusLabel(item) === 'Зарезервовано' ? 'status-reserved' : 'status-in_stock'}`}>
                      {getReservationStatusLabel(item)}
                    </span>
                  </td>
                  <td className="cell-truncate" title={formatValue(item.manufacturer, 'manufacturer')}>
                    {formatValue(item.manufacturer, 'manufacturer')}
                  </td>
                  <td
                    className="cell-truncate"
                    title={
                      item.isGrouped && item.batchCount && !item.isNoSerialMerged
                        ? `${formatValue(item.type, 'type')} × ${item.batchCount} поз. у партії`
                        : item.isNoSerialMerged && item.batchCount > 1
                          ? `${formatValue(item.type, 'type')} — об'єднано ${item.batchCount} рядків без серійного №`
                          : formatValue(item.type, 'type')
                    }
                  >
                    {item.isGrouped && item.batchCount && !item.isNoSerialMerged ? (
                      <span style={{ fontWeight: 'bold' }}>
                        {formatValue(item.type, 'type')} × {item.batchCount} поз.
                      </span>
                    ) : item.isNoSerialMerged && item.batchCount > 1 ? (
                      <span style={{ fontWeight: 'bold' }}>{formatValue(item.type, 'type')}</span>
                    ) : (
                      formatValue(item.type, 'type')
                    )}
                    {!equipmentHasProductCard(getEquipmentRowForProductCardCheck(item)) ? (
                      <span
                        className="equipment-no-product-card-badge"
                        title="Немає прив'язки до карточки продукту в номенклатурі"
                      >
                        без картки
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {getEquipmentQuantityNumber(item) > 1 ? (
                      <span style={{ fontWeight: 'bold' }}>{formatEquipmentQuantityCell(item)}</span>
                    ) : (
                      formatEquipmentQuantityCell(item)
                    )}
                  </td>
                  <td>
                    {item.isGrouped && item.batchCount && !item.isNoSerialMerged ? (
                      <span style={{ fontWeight: 'bold' }}>Партія: {item.batchCount} поз.</span>
                    ) : item.isNoSerialMerged && item.batchCount > 1 ? (
                      <span style={{ fontWeight: 'bold' }} title="Кілька записів залишку без серійного номера в одному рядку таблиці">
                        Без серійного № · {item.batchCount} записів
                      </span>
                    ) : (
                      formatValue(item.serialNumber, 'serialNumber')
                    )}
                  </td>
                  <td className="cell-truncate" title={formatValue(item.currentWarehouseName || item.currentWarehouse, 'currentWarehouse')}>
                    {formatValue(item.currentWarehouseName || item.currentWarehouse, 'currentWarehouse')}
                  </td>
                  {showReservationClientColumn && (
                    <td className="cell-truncate" title={formatValue(item.reservationClientName, 'reservationClientName')}>
                      {formatValue(item.reservationClientName, 'reservationClientName')}
                    </td>
                  )}
                  <td className="cell-truncate" title={formatValue(item.reservedByName, 'reservedByName')}>
                    {formatValue(item.reservedByName, 'reservedByName')}
                  </td>
                  <td
                    className="cell-truncate"
                    title={
                      item.reservationEndDate
                        ? formatValue(item.reservationEndDate, 'reservationEndDate')
                        : formatValue(null, 'reservationEndDate')
                    }
                  >
                    {item.reservationEndDate
                      ? formatValue(item.reservationEndDate, 'reservationEndDate')
                      : formatValue(null, 'reservationEndDate')}
                  </td>
                  <td>
                    <span className={`status-badge ${getTestingStatusClass(item.testingStatus)}`}>
                      {getTestingStatusLabel(item.testingStatus)}
                    </span>
                  </td>
                  <td>
                    {item.testingDate ? new Date(item.testingDate).toLocaleDateString('uk-UA') : '—'}
                  </td>
                  <td>{formatValue(item.manufactureDate, 'manufactureDate')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="equipment-pagination">
          <button
            type="button"
            className="eq-page-btn"
            disabled={currentPage <= 1 || refreshing}
            onClick={() => goToPage(currentPage - 1)}
          >
            ← Попередня
          </button>
          <span className="eq-page-info">
            Сторінка {currentPage} з {totalPages}
            {' · '}
            {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString('uk-UA')}–
            {Math.min(currentPage * PAGE_SIZE, totalItems).toLocaleString('uk-UA')} з{' '}
            {totalItems.toLocaleString('uk-UA')}
          </span>
          <button
            type="button"
            className="eq-page-btn"
            disabled={currentPage >= totalPages || refreshing}
            onClick={() => goToPage(currentPage + 1)}
          >
            Наступна →
          </button>
        </div>
      )}

      {/* Модальні вікна */}
      {showDeleteModal && selectedEquipment && (
        <EquipmentDeleteModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowDeleteModal(false);
            setSelectedEquipment(null);
          }}
          onConfirm={async (reason) => {
            const token = localStorage.getItem('token');
            try {
              const response = await fetch(`${API_BASE_URL}/equipment/${selectedEquipment._id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason })
              });

              if (response.ok) {
                setShowDeleteModal(false);
                setSelectedEquipment(null);
                refreshEquipment();
              } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Помилка видалення');
              }
            } catch (error) {
              console.error('[DELETE] Помилка запиту:', error);
              throw error;
            }
          }}
        />
      )}

      {showBulkDeleteModal && isAdmin && selectedIds.size > 0 && (
        <EquipmentDeleteModal
          equipment={null}
          bulkCount={selectedIds.size}
          onClose={() => setShowBulkDeleteModal(false)}
          onConfirm={async (reason) => {
            const token = localStorage.getItem('token');
            const ids = [...selectedIds];
            const chunkSize = 500;
            let deleted = 0;
            let failed = 0;
            for (let i = 0; i < ids.length; i += chunkSize) {
              const chunk = ids.slice(i, i + chunkSize);
              const response = await fetch(`${API_BASE_URL}/equipment/bulk-delete`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids: chunk, reason }),
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error(data.error || 'Помилка масового видалення');
              }
              deleted += data.deleted || 0;
              failed += data.failed || 0;
            }
            setShowBulkDeleteModal(false);
            clearSelection();
            refreshEquipment();
            if (failed > 0) {
              alert(`Видалено: ${deleted}. Не вдалося: ${failed}.`);
            }
          }}
        />
      )}

      {showHistory && selectedEquipment && (
        <EquipmentHistoryModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowHistory(false);
            setSelectedEquipment(null);
          }}
        />
      )}

      {showQR && selectedEquipment && (
        <EquipmentQRModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowQR(false);
            setSelectedEquipment(null);
          }}
        />
      )}

      {showDetailsModal && selectedEquipment && (
        <EquipmentDetailsModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedEquipment(null);
          }}
        />
      )}

      {showEditModal && selectedEquipment && (
        <EquipmentEditModal
          equipment={selectedEquipment}
          warehouses={warehouses}
          user={user}
          readOnly={showReserveAction}
          onClose={() => {
            setShowEditModal(false);
            setSelectedEquipment(null);
          }}
          onSuccess={handleEditSuccess}
          onReserve={showReserveAction && onReserve ? async (id) => {
            await onReserve(selectedEquipment);
            setShowEditModal(false);
            setSelectedEquipment(null);
          } : null}
          onCancelReserve={showReserveAction && onReserve ? async (id) => {
            // Тут потрібен cancelReserve, але поки використаємо onReserve для toggle
            try {
              const token = localStorage.getItem('token');
              await fetch(`${API_BASE_URL}/equipment/${id}/cancel-reserve`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });
              refreshEquipment();
            } catch (err) {
              console.error('Помилка скасування резервування:', err);
            }
          } : null}
        />
      )}
    </div>
  );
});

export default EquipmentList;
