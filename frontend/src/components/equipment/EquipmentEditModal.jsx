import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import API_BASE_URL from '../../config';
import EquipmentScanner from './EquipmentScanner';
import EquipmentFileUpload from './EquipmentFileUpload';
import EquipmentQRModal from './EquipmentQRModal';
import TechnicalSpecsConstructorBlock from './TechnicalSpecsConstructorBlock';
import { buildPatchesFromProductCard, mergeAttachedFromProductCard, mergeCardSpecsIntoFormRows } from './productCardApply';
import { parsedEquipmentToTechnicalSpecs } from '../../utils/ocrParser';
import EquipmentHistoryModal from './EquipmentHistoryModal';
import './EquipmentEditModal.css';

function flattenCategories(nodes, level = 0) {
  let list = [];
  (nodes || []).forEach((n) => {
    list.push({ ...n, level });
    if (n.children && n.children.length) list = list.concat(flattenCategories(n.children, level + 1));
  });
  return list;
}

function mapEquipmentSpecsToFormRows(specs) {
  const ts = Date.now();
  return (Array.isArray(specs) ? specs : []).map((s, i) => ({
    _key: `eq-spec-${ts}-${i}-${Math.random().toString(36).slice(2, 11)}`,
    name: s?.name != null ? String(s.name) : '',
    value: s?.value != null ? String(s.value) : '',
  }));
}

/** Чи поточний користувач — власник резерву (для кнопки передачі). */
function isMyEquipmentReserve(equipment, user) {
  if (!equipment || !user || equipment.status !== 'reserved') return false;
  const myLogin = (user.login || '').trim();
  if (myLogin && equipment.reservedByLogin && equipment.reservedByLogin === myLogin) return true;
  const rid = equipment.reservedBy != null ? String(equipment.reservedBy) : '';
  const uid = user._id != null ? String(user._id) : '';
  if (rid && uid && rid === uid) return true;
  return false;
}

function isRegionalWarehouseStaffRole(role) {
  return ['warehouse', 'zavsklad'].includes(String(role || '').toLowerCase());
}

/** Файли з карточки продукту, що виглядають як зображення (для прев’ю в формі). */
function productCardImageAttachments(card) {
  if (!card || !Array.isArray(card.attachedFiles)) return [];
  return card.attachedFiles.filter((f) => {
    const url = (f?.cloudinaryUrl && String(f.cloudinaryUrl).trim()) || '';
    if (!url) return false;
    const mt = String(f?.mimetype || '').toLowerCase();
    if (mt.startsWith('image/')) return true;
    return /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url);
  });
}

function bypassesRegionalWarehouseInventoryLock(role) {
  return ['admin', 'administrator', 'mgradm'].includes(String(role || '').toLowerCase());
}

function EquipmentEditModal({
  equipment,
  warehouses,
  user,
  onClose,
  onSuccess,
  readOnly = false,
  onReserve,
  onCancelReserve,
  presetProductCard = null,
}) {
  const [formData, setFormData] = useState({});
  const [categoriesFlat, setCategoriesFlat] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferManagers, setTransferManagers] = useState([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSelectedLogin, setTransferSelectedLogin] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [showTestingInfo, setShowTestingInfo] = useState(false);
  const [testingGalleryOpen, setTestingGalleryOpen] = useState(false);
  const [testingGalleryIndex, setTestingGalleryIndex] = useState(0);
  const [equipmentType, setEquipmentType] = useState('single'); // 'single' або 'batch'
  const [productCardQuery, setProductCardQuery] = useState('');
  const [productCardHits, setProductCardHits] = useState([]);
  const [productCardsLoading, setProductCardsLoading] = useState(false);
  const presetAppliedForIdRef = useRef(null);
  const isNewEquipment = !equipment;

  const regionalForeignReadOnly = useMemo(() => {
    if (!equipment) return false;
    if (bypassesRegionalWarehouseInventoryLock(user?.role)) return false;
    if (!isRegionalWarehouseStaffRole(user?.role)) return false;
    const allowed = new Set((warehouses || []).map((w) => String(w._id)));
    const cw = equipment.currentWarehouse != null ? String(equipment.currentWarehouse) : '';
    return !!cw && !allowed.has(cw);
  }, [equipment, warehouses, user?.role]);

  const effectiveReadOnly = readOnly || regionalForeignReadOnly;

  useEffect(() => {
    if (equipment) {
      setFormData({
        manufacturer: equipment.manufacturer || '',
        type: equipment.type || '',
        serialNumber: equipment.serialNumber || '',
        currentWarehouse: equipment.currentWarehouse || '',
        currentWarehouseName: equipment.currentWarehouseName || '',
        region: equipment.region || '',
        standbyPower: equipment.standbyPower || '',
        primePower: equipment.primePower || '',
        phase: equipment.phase !== undefined ? String(equipment.phase) : '',
        voltage: equipment.voltage || '',
        amperage: equipment.amperage !== undefined ? String(equipment.amperage) : '',
        cosPhi: equipment.cosPhi !== undefined && equipment.cosPhi !== null ? String(equipment.cosPhi) : '',
        frequency: equipment.frequency !== undefined && equipment.frequency !== null ? String(equipment.frequency) : '',
        rpm: equipment.rpm !== undefined ? String(equipment.rpm) : '',
        dimensions: equipment.dimensions || '',
        weight: equipment.weight !== undefined ? String(equipment.weight) : '',
        manufactureDate: equipment.manufactureDate ? new Date(equipment.manufactureDate).toISOString().split('T')[0] : '',
        batchName: equipment.batchName || '',
        batchUnit: equipment.batchUnit || '',
        batchPriceWithVAT: equipment.batchPriceWithVAT !== undefined ? String(equipment.batchPriceWithVAT) : '',
        currency: equipment.currency || 'грн.',
        notes: equipment.notes || '',
        materialValueType: equipment.materialValueType || (equipment.isServiceParts ? 'service' : equipment.isElectroInstallParts ? 'electroinstall' : equipment.isInternalEquipment ? 'internal' : ''),
        categoryId: equipment.categoryId ? (equipment.categoryId._id || equipment.categoryId).toString() : '',
        itemKind: equipment.itemKind || 'equipment',
        productId: equipment.productId
          ? (typeof equipment.productId === 'object'
              ? String(equipment.productId._id || '')
              : String(equipment.productId))
          : '',
        technicalSpecs: mapEquipmentSpecsToFormRows(equipment.technicalSpecs),
      });
      setEquipmentType(equipment.isBatch ? 'batch' : 'single');
      // Завантажуємо існуючі файли з бази даних
      if (equipment.attachedFiles && Array.isArray(equipment.attachedFiles) && equipment.attachedFiles.length > 0) {
        // Перетворюємо файли з бази в формат, який очікує компонент
        const existingFiles = equipment.attachedFiles.map((file, index) => ({
          id: file._id || file.cloudinaryId || `existing-${index}`,
          cloudinaryUrl: file.cloudinaryUrl,
          cloudinaryId: file.cloudinaryId,
          originalName: file.originalName,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: file.uploadedAt
        }));
        setAttachedFiles(existingFiles);
      } else {
        setAttachedFiles([]);
      }
    } else {
      // Ініціалізація для нового обладнання
      setFormData({
        manufacturer: '',
        type: '',
        serialNumber: '',
        quantity: 1,
        currentWarehouse: user?.region || '',
        currentWarehouseName: '',
        region: user?.region || '',
        standbyPower: '',
        primePower: '',
        phase: '',
        voltage: '',
        amperage: '',
        cosPhi: '',
        frequency: '',
        rpm: '',
        dimensions: '',
        weight: '',
        manufactureDate: '',
        batchName: '',
        batchUnit: '',
        batchPriceWithVAT: '',
        currency: 'грн.',
        notes: '',
        materialValueType: '',
        categoryId: '',
        itemKind: 'equipment',
        productId: '',
        technicalSpecs: [],
      });
      setEquipmentType('single');
    }
  }, [equipment, user]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/categories?tree=true`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const tree = await res.json();
        if (!cancelled) setCategoriesFlat(flattenCategories(Array.isArray(tree) ? tree : []));
      } catch (_) {}
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (isNewEquipment) return;
    if (effectiveReadOnly) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setProductCardsLoading(true);
      try {
        const token = localStorage.getItem('token');
        const q = new URLSearchParams({ limit: '120' });
        if (productCardQuery.trim()) q.set('search', productCardQuery.trim());
        const res = await fetch(`${API_BASE_URL}/product-cards?${q}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setProductCardHits(Array.isArray(data) ? data : []);
      } catch (_) {
        if (!cancelled) setProductCardHits([]);
      } finally {
        if (!cancelled) setProductCardsLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [productCardQuery, effectiveReadOnly, isNewEquipment]);

  const productCardSelectOptions = useMemo(() => {
    const pid = formData.productId ? String(formData.productId) : '';
    if (!pid || productCardHits.some((c) => String(c._id) === pid)) return productCardHits;
    if (equipment?.productId && typeof equipment.productId === 'object' && String(equipment.productId._id) === pid) {
      return [equipment.productId, ...productCardHits.filter((c) => String(c._id) !== pid)];
    }
    return [
      { _id: pid, type: `Карточка …${pid.slice(-6)}`, manufacturer: '', isActive: true },
      ...productCardHits.filter((c) => String(c._id) !== pid)
    ];
  }, [formData.productId, productCardHits, equipment]);

  const applyProductCard = useCallback((card) => {
    if (!card) return;
    setFormData((prev) => {
      const { formPatch } = buildPatchesFromProductCard(card, prev);
      return { ...prev, ...formPatch };
    });
    if (card.defaultReceiptMode === 'batch') setEquipmentType('batch');
    else if (card.defaultReceiptMode === 'single') setEquipmentType('single');
    setAttachedFiles((prev) => mergeAttachedFromProductCard(prev, card.attachedFiles));
  }, []);

  useEffect(() => {
    if (equipment) {
      presetAppliedForIdRef.current = null;
      return;
    }
    if (!presetProductCard) {
      presetAppliedForIdRef.current = null;
      return;
    }
    const id = String(presetProductCard._id || '');
    if (presetAppliedForIdRef.current === id) return;
    presetAppliedForIdRef.current = id;
    applyProductCard(presetProductCard);
  }, [equipment, presetProductCard, applyProductCard]);

  const newReceiptSpecRow = () => ({
    _key: `rcv-spec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    name: '',
    value: '',
  });

  const addReceiptSpecRow = () => {
    setFormData((f) => ({ ...f, technicalSpecs: [...(f.technicalSpecs || []), newReceiptSpecRow()] }));
  };
  const removeReceiptSpecRow = (key) => {
    setFormData((f) => ({ ...f, technicalSpecs: (f.technicalSpecs || []).filter((r) => r._key !== key) }));
  };
  const updateReceiptSpecRow = (key, field, val) => {
    setFormData((f) => ({
      ...f,
      technicalSpecs: (f.technicalSpecs || []).map((r) => (r._key === key ? { ...r, [field]: val } : r)),
    }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Якщо змінюється склад, оновлюємо назву складу та регіон
    if (name === 'currentWarehouse') {
      const warehouse = warehouses.find(w => (w._id || w.name) === value);
      if (warehouse) {
        setFormData(prev => ({
          ...prev,
          currentWarehouseName: warehouse.name,
          region: warehouse.region || prev.region || ''
        }));
      }
    }
  };

  const openTransferModal = async () => {
    setShowTransferModal(true);
    setTransferError('');
    setTransferSelectedLogin('');
    setTransferManagers([]);
    setTransferLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/users/managers-for-transfer`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не вдалося завантажити список менеджерів');
      setTransferManagers(Array.isArray(data) ? data : []);
    } catch (e) {
      setTransferError(e.message || 'Помилка завантаження');
    } finally {
      setTransferLoading(false);
    }
  };

  const submitTransferReserve = async () => {
    if (!equipment?._id || !transferSelectedLogin) return;
    setTransferSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/equipment/${equipment._id}/transfer-reserve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetLogin: transferSelectedLogin })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Помилка ${res.status}`);
      setShowTransferModal(false);
      if (onSuccess) onSuccess();
      else onClose();
    } catch (e) {
      alert(e.message || 'Не вдалося передати резерв');
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (effectiveReadOnly) {
      return;
    }
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Підготовка даних для відправки
      const updateData = { ...formData };
      updateData.technicalSpecs = (formData.technicalSpecs || [])
        .map(({ name, value }) => ({
          name: name != null ? String(name).trim() : '',
          value: value != null ? String(value).trim() : '',
        }))
        .filter((r) => r.name || r.value);

      // Додаємо поля для партії (тільки для нового обладнання)
      if (isNewEquipment) {
        updateData.isBatch = equipmentType === 'batch';
        if (equipmentType === 'batch') {
          updateData.quantity = parseInt(formData.quantity) || 1;
          updateData.serialNumber = null; // Партії без серійних номерів
        } else {
          updateData.quantity = 1;
        }
      }
      
      // Додаємо прикріплені файли
      if (attachedFiles.length > 0) {
        updateData.attachedFiles = attachedFiles.map(f => ({
          cloudinaryUrl: f.cloudinaryUrl,
          cloudinaryId: f.cloudinaryId,
          originalName: f.originalName,
          mimetype: f.mimetype,
          size: f.size
        }));
      }
      
      // Обробка дати виробництва - якщо порожня, відправляємо null
      if (!updateData.manufactureDate || updateData.manufactureDate.trim() === '') {
        updateData.manufactureDate = null;
      }
      
      // Очищаємо порожні рядки
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === '' && key !== 'attachedFiles') {
          updateData[key] = null;
        }
      });
      
      // Обробка числових полів
      if (updateData.phase) {
        const phaseNum = parseFloat(updateData.phase);
        updateData.phase = isNaN(phaseNum) ? null : phaseNum;
      }
      if (updateData.amperage) {
        const amperageNum = parseFloat(updateData.amperage);
        updateData.amperage = isNaN(amperageNum) ? null : amperageNum;
      }
      if (updateData.cosPhi) {
        const c = parseFloat(String(updateData.cosPhi).replace(',', '.'));
        updateData.cosPhi = isNaN(c) ? null : c;
      }
      if (updateData.frequency) {
        const f = parseFloat(String(updateData.frequency).replace(',', '.'));
        updateData.frequency = isNaN(f) ? null : f;
      }
      if (updateData.rpm) {
        const rpmNum = parseFloat(updateData.rpm);
        updateData.rpm = isNaN(rpmNum) ? null : rpmNum;
      }
      if (updateData.weight) {
        const weightNum = parseFloat(updateData.weight);
        updateData.weight = isNaN(weightNum) ? null : weightNum;
      }
      if (updateData.batchPriceWithVAT) {
        const priceNum = parseFloat(updateData.batchPriceWithVAT);
        updateData.batchPriceWithVAT = isNaN(priceNum) ? null : priceNum;
      }
      
      console.log('[EDIT] Відправка даних:', updateData);
      
      const url = isNewEquipment 
        ? `${API_BASE_URL}/equipment/scan`
        : `${API_BASE_URL}/equipment/${equipment._id}`;
      const method = isNewEquipment ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(isNewEquipment ? '[ADD] Обладнання додано:' : '[EDIT] Обладнання оновлено:', result);
        onSuccess();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[EDIT] Помилка відповіді:', response.status, errorData);
        let errorMessage = errorData.error || (isNewEquipment ? 'Помилка додавання обладнання' : 'Помилка оновлення обладнання');
        
        // Якщо це помилка дублікату, показуємо детальну інформацію
        if (errorData.existing) {
          errorMessage = `${errorMessage}\n\nІснуюче обладнання:\nТип: ${errorData.existing.type}\nСерійний номер: ${errorData.existing.serialNumber}\nСклад: ${errorData.existing.currentWarehouse || 'Не вказано'}`;
        }
        
        setError(errorMessage);
      }
    } catch (err) {
      setError('Помилка з\'єднання з сервером');
      console.error('[EDIT] Помилка оновлення обладнання:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScannerData = (scannedData) => {
    const specPairs = parsedEquipmentToTechnicalSpecs(scannedData);
    setFormData((prev) => {
      const next = {
        ...prev,
        manufacturer: prev.manufacturer?.trim() ? prev.manufacturer : (scannedData.manufacturer || ''),
        type: prev.type?.trim() ? prev.type : (scannedData.type || ''),
        serialNumber: prev.serialNumber?.trim()
          ? prev.serialNumber
          : (scannedData.serialNumber != null ? String(scannedData.serialNumber) : ''),
        currentWarehouse: prev.currentWarehouse || scannedData.currentWarehouse || '',
        currentWarehouseName: prev.currentWarehouseName || scannedData.currentWarehouseName || '',
        region: prev.region || scannedData.region || '',
        technicalSpecs: mergeCardSpecsIntoFormRows(prev.technicalSpecs, specPairs),
      };
      if (!isNewEquipment) {
        return {
          ...next,
          standbyPower: prev.standbyPower?.trim() ? prev.standbyPower : (scannedData.standbyPower || ''),
          primePower: prev.primePower?.trim() ? prev.primePower : (scannedData.primePower || ''),
          phase:
            prev.phase?.trim()
              ? prev.phase
              : (scannedData.phase !== undefined && scannedData.phase !== null
                  ? String(scannedData.phase)
                  : prev.phase),
          voltage: prev.voltage?.trim() ? prev.voltage : (scannedData.voltage || ''),
          amperage:
            prev.amperage?.trim()
              ? prev.amperage
              : (scannedData.amperage !== undefined && scannedData.amperage !== null
                  ? String(scannedData.amperage)
                  : prev.amperage),
          cosPhi:
            prev.cosPhi?.trim()
              ? prev.cosPhi
              : (scannedData.cosPhi !== undefined && scannedData.cosPhi !== null
                  ? String(scannedData.cosPhi)
                  : prev.cosPhi),
          frequency:
            prev.frequency?.trim()
              ? prev.frequency
              : (scannedData.frequency !== undefined && scannedData.frequency !== null
                  ? String(scannedData.frequency)
                  : prev.frequency),
          rpm:
            prev.rpm?.trim()
              ? prev.rpm
              : (scannedData.rpm !== undefined && scannedData.rpm !== null
                  ? String(scannedData.rpm)
                  : prev.rpm),
          dimensions: prev.dimensions?.trim() ? prev.dimensions : (scannedData.dimensions || ''),
          weight:
            prev.weight?.trim()
              ? prev.weight
              : (scannedData.weight !== undefined && scannedData.weight !== null
                  ? String(scannedData.weight)
                  : prev.weight),
          manufactureDate: prev.manufactureDate?.trim()
            ? prev.manufactureDate
            : (scannedData.manufactureDate || ''),
        };
      }
      return next;
    });
    setShowScanner(false);
  };

  return (
    <div className="equipment-edit-modal-overlay" onClick={onClose}>
      <div className="equipment-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="equipment-edit-header">
          <h2>
            {isNewEquipment
              ? 'Додати обладнання від постачальників'
              : effectiveReadOnly
                ? 'Перегляд обладнання'
                : 'Редагувати обладнання'}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        {showScanner && (
          <EquipmentScanner
            user={user}
            warehouses={warehouses}
            embedded={true}
            onDataScanned={handleScannerData}
            onClose={() => setShowScanner(false)}
          />
        )}
        
        {!showScanner && (
          <form onSubmit={handleSubmit} className="equipment-edit-form">
            {error && (
              <div className="form-error">
                {error}
              </div>
            )}

            {regionalForeignReadOnly && (
              <div
                className="form-error"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  color: 'var(--text-primary, #e6edf3)',
                }}
              >
                <strong>Перегляд:</strong> це обладнання на складі іншого регіону. Редагування номенклатури,
                складу та картки недоступне. Зміни можуть вносити лише користувачі з відповідним доступом
                (наприклад, адміністратор).
              </div>
            )}

            {!effectiveReadOnly && (
              <div className="form-section" style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowScanner(true)}
                  style={{ flex: '1', minWidth: '200px', padding: '12px', fontSize: '16px' }}
                >
                  📷 Сканувати шильдик
                </button>
              {!isNewEquipment && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowQR(true)}
                    style={{ flex: '1', minWidth: '150px', padding: '12px', fontSize: '16px' }}
                  >
                    📱 QR
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowHistory(true)}
                    style={{ flex: '1', minWidth: '150px', padding: '12px', fontSize: '16px' }}
                  >
                    📋 Історія
                  </button>
                </>
              )}
              </div>
            )}
            
            {effectiveReadOnly && !isNewEquipment && (
              <div className="form-section" style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowQR(true)}
                  style={{ padding: '12px 24px', fontSize: '16px' }}
                >
                  📱 QR
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowHistory(true)}
                  style={{ padding: '12px 24px', fontSize: '16px' }}
                >
                  📋 Історія
                </button>
              </div>
            )}

            {isNewEquipment && !effectiveReadOnly && (
              <div
                className="form-section"
                style={{
                  padding: '12px 14px',
                  background: 'rgba(56, 139, 253, 0.08)',
                  borderRadius: 8,
                  border: '1px solid rgba(56, 139, 253, 0.22)',
                }}
              >
                {formData.productId ? (
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.45 }}>
                    <strong>Карточка продукту:</strong> {presetProductCard?.type || formData.type || '—'}
                    {(presetProductCard?.manufacturer || formData.manufacturer)
                      ? ` · ${presetProductCard?.manufacturer || formData.manufacturer}`
                      : ''}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.45 }}>
                    <strong>Прийом без карточки</strong> — тип і характеристики можна задати вручну або через скан шильдика.
                  </p>
                )}
              </div>
            )}

            {(equipment?.productId || !effectiveReadOnly) && !(isNewEquipment && !effectiveReadOnly) && (
              <div className="form-section">
                <h3>Карточка з довідника</h3>
                {effectiveReadOnly && equipment?.productId && typeof equipment.productId === 'object' ? (
                  <div style={{ color: 'var(--text-secondary)' }}>
                    <p style={{ margin: 0 }}>
                      Прив&apos;язано: <strong>{equipment.productId.type || '—'}</strong>
                      {equipment.productId.manufacturer ? ` — ${equipment.productId.manufacturer}` : ''}
                      {equipment.productId.isActive === false ? ' (карточка вимкнена в довіднику)' : ''}
                    </p>
                    {(() => {
                      const imgs = productCardImageAttachments(equipment.productId);
                      if (!imgs.length) return null;
                      return (
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                            Фото з карточки (довідник)
                          </div>
                          <div className="equipment-edit-modal__product-card-images">
                            {imgs.map((f, i) => (
                              <a
                                key={f.cloudinaryId || `${f.cloudinaryUrl}-${i}`}
                                href={f.cloudinaryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="equipment-edit-modal__product-card-image-link"
                                title={f.originalName || 'Відкрити зображення'}
                              >
                                <img
                                  src={f.cloudinaryUrl}
                                  alt={f.originalName || ''}
                                  className="equipment-edit-modal__product-card-image-thumb"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {Array.isArray(equipment.productId.technicalSpecs) &&
                    equipment.productId.technicalSpecs.length > 0 ? (
                      <table style={{ width: '100%', marginTop: '10px', fontSize: '13px', borderCollapse: 'collapse' }}>
                        <tbody>
                          {equipment.productId.technicalSpecs.map((s, i) => (
                            <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                              <td style={{ padding: '6px 8px 6px 0', opacity: 0.85 }}>{s.name || '—'}</td>
                              <td style={{ padding: '6px 0' }}>{s.value || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                ) : effectiveReadOnly && equipment?.productId && typeof equipment.productId !== 'object' ? (
                  <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                    Прив&apos;язано до карточки продукту (id: {String(equipment.productId)}).
                  </p>
                ) : !effectiveReadOnly ? (
                  <>
                    <div className="form-group">
                      <label>Пошук карточки</label>
                      <input
                        type="search"
                        value={productCardQuery}
                        onChange={(e) => setProductCardQuery(e.target.value)}
                        placeholder="Тип або виробник…"
                      />
                    </div>
                    <div className="form-group">
                      <label>
                        Обрати карточку
                        {productCardsLoading ? ' (завантаження…)' : ''}
                      </label>
                      <select
                        name="productId"
                        value={formData.productId || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) {
                            setFormData((prev) => ({ ...prev, productId: '' }));
                            return;
                          }
                          const card = productCardSelectOptions.find((c) => String(c._id) === String(v));
                          if (!card || !card.type) {
                            setFormData((prev) => ({ ...prev, productId: v }));
                            return;
                          }
                          applyProductCard(card);
                        }}
                      >
                        <option value="">— Без карточки —</option>
                        {productCardSelectOptions.map((c) => (
                          <option key={String(c._id)} value={String(c._id)}>
                            {c.type}
                            {c.manufacturer ? ` | ${c.manufacturer}` : ''}
                            {c.isActive === false ? ' (вимкн.)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>
                      Порожні поля форми (у т.ч. технічні за збігом назв у конструкторі карточки) підставляються з карточки; уже
                      заповнені не перезаписуються. Фото з карточки додаються на початок списку файлів.
                    </p>
                    {formData.productId &&
                      (() => {
                        const c = productCardSelectOptions.find((x) => String(x._id) === String(formData.productId));
                        if (!c) return null;
                        const imgs = productCardImageAttachments(c);
                        const specs = c?.technicalSpecs;
                        const hasSpecs = Array.isArray(specs) && specs.length > 0;
                        if (!imgs.length && !hasSpecs) return null;
                        return (
                          <div
                            style={{
                              marginTop: '12px',
                              padding: '10px 12px',
                              borderRadius: '8px',
                              background: 'rgba(255,255,255,0.04)',
                              fontSize: '13px',
                            }}
                          >
                            {imgs.length > 0 ? (
                              <div style={{ marginBottom: hasSpecs ? '14px' : 0 }}>
                                <div style={{ fontWeight: 600, marginBottom: '8px' }}>Фото з карточки (довідник)</div>
                                <div className="equipment-edit-modal__product-card-images">
                                  {imgs.map((f, i) => (
                                    <a
                                      key={f.cloudinaryId || `${f.cloudinaryUrl}-${i}`}
                                      href={f.cloudinaryUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="equipment-edit-modal__product-card-image-link"
                                      title={f.originalName || 'Відкрити зображення'}
                                    >
                                      <img
                                        src={f.cloudinaryUrl}
                                        alt={f.originalName || ''}
                                        className="equipment-edit-modal__product-card-image-thumb"
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {hasSpecs ? (
                              <>
                                <div style={{ fontWeight: 600, marginBottom: '8px' }}>Характеристики з карточки (довідник)</div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <tbody>
                                    {specs.map((s, i) => (
                                      <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                        <td style={{ padding: '6px 8px 6px 0', verticalAlign: 'top', opacity: 0.85 }}>
                                          {s.name || '—'}
                                        </td>
                                        <td style={{ padding: '6px 0', verticalAlign: 'top' }}>{s.value || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            ) : null}
                          </div>
                        );
                      })()}
                  </>
                ) : null}
              </div>
            )}

            {!effectiveReadOnly && (
              <div className="form-section">
                <h3>Тип матеріальних цінностей</h3>
                {isNewEquipment && (
                  <>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="equipmentType"
                          value="single"
                          checked={equipmentType === 'single'}
                          onChange={(e) => setEquipmentType(e.target.value)}
                        />
                        Одиничне обладнання (з серійним номером)
                      </label>
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="equipmentType"
                          value="batch"
                          checked={equipmentType === 'batch'}
                          onChange={(e) => setEquipmentType(e.target.value)}
                        />
                        Партія обладнання (без серійного номера - щитове обладннання для продажу - АВР, ЩР, ЩС, тощо)
                      </label>
                    </div>
                  </>
                )}
                <div className="form-group" style={{ marginTop: isNewEquipment ? '15px' : '0' }}>
                  <label>Група номенклатури (дерево 1С)</label>
                  <select
                    name="categoryId"
                    value={formData.categoryId || ''}
                    onChange={(e) => {
                      const id = e.target.value || '';
                      const cat = categoriesFlat.find(c => (c._id || c.id) === id);
                      setFormData(prev => ({
                        ...prev,
                        categoryId: id,
                        itemKind: cat ? cat.itemKind : (prev.itemKind || 'equipment')
                      }));
                    }}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  >
                    <option value="">— Не обрано —</option>
                    {categoriesFlat.map((c) => (
                      <option key={c._id} value={c._id?.toString?.() || c._id}>
                        {'\u00A0'.repeat((c.level || 0) * 2)}{c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label>Категорія матеріальних цінностей (ЗІП / монтаж / внутрішні)</label>
                  <select
                    name="materialValueType"
                    value={formData.materialValueType || ''}
                    onChange={handleChange}
                    disabled={effectiveReadOnly}
                  >
                    <option value="">— Не обрано —</option>
                    <option value="service">Комплектуючі ЗІП (Сервіс)</option>
                    <option value="electroinstall">Комплектуючі для електромонтажних робіт</option>
                    <option value="internal">Обладнання для внутрішніх потреб</option>
                  </select>
                </div>
              </div>
            )}

            {!isNewEquipment && equipment?.isBatch && (
              <div className="form-section" style={{ backgroundColor: 'var(--surface-dark)', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
                <h3 style={{ color: 'var(--primary)', marginBottom: '10px' }}>📦 Партійне обладнання</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)' }}>
                  <div><strong>Індекс в партії:</strong> {equipment.batchIndex || '—'}</div>
                  <div style={{ fontSize: '12px', marginTop: '5px', color: 'var(--text-secondary)' }}>
                    ⚠️ Це одиниця з партії. Серійний номер не застосовується.
                  </div>
                </div>
              </div>
            )}

            <div className="form-section">
            <h3>Основна інформація</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Виробник</label>
                <input
                  type="text"
                  name="manufacturer"
                  value={formData.manufacturer}
                  onChange={handleChange}
                  readOnly={effectiveReadOnly}
                  disabled={effectiveReadOnly}
                />
              </div>
              <div className="form-group">
                <label>Тип обладнання *</label>
                <input
                  type="text"
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                  readOnly={effectiveReadOnly}
                  disabled={effectiveReadOnly}
                />
              </div>
              <div className="form-group">
                <label>
                  Серійний / заводський номер (з шильдика){' '}
                  {equipmentType === 'single' && isNewEquipment && '*'}
                </label>
                <input
                  type="text"
                  name="serialNumber"
                  value={formData.serialNumber}
                  onChange={handleChange}
                  disabled={(equipmentType === 'batch' && isNewEquipment) || (!isNewEquipment && equipment?.isBatch) || effectiveReadOnly}
                  required={equipmentType === 'single' && isNewEquipment}
                  readOnly={effectiveReadOnly}
                  placeholder={
                    (!isNewEquipment && equipment?.isBatch) 
                      ? 'Не застосовується для партійного обладнання' 
                      : (equipmentType === 'batch' && isNewEquipment) 
                        ? 'Не застосовується для партій' 
                        : 'Номер з заводу / серійний — унікальний для кожної одиниці'
                  }
                />
                {isNewEquipment && equipmentType === 'single' && (
                  <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                    У довіднику «карточка продукту» номер не зберігається: він завжди вводиться тут при прийомі конкретної одиниці.
                  </p>
                )}
              </div>
              {equipmentType === 'batch' && isNewEquipment && (
                <div className="form-group">
                  <label>Кількість одиниць *</label>
                  <input
                    type="number"
                    name="quantity"
                  value={formData.quantity || 1}
                  onChange={handleChange}
                  min="1"
                  required
                  placeholder="Введіть кількість"
                  readOnly={effectiveReadOnly}
                  disabled={effectiveReadOnly}
                />
                </div>
              )}
              <div className="form-group">
                <label>Склад *</label>
                <select
                  name="currentWarehouse"
                  value={formData.currentWarehouse}
                  onChange={handleChange}
                  required
                  disabled={effectiveReadOnly}
                >
                  <option value="">Виберіть склад</option>
                  {warehouses.map(w => (
                    <option key={w._id || w.name} value={w._id || w.name}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Регіон</label>
                <input
                  type="text"
                  name="region"
                  value={formData.region}
                  onChange={handleChange}
                  placeholder="Введіть регіон"
                  readOnly={effectiveReadOnly}
                  disabled={effectiveReadOnly}
                />
              </div>
              {isNewEquipment && (
                <div className="form-group">
                  <label>Дата виробництва</label>
                  <input
                    type="date"
                    name="manufactureDate"
                    value={formData.manufactureDate || ''}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
              )}
              {/* Поля тестування - тільки для існуючого обладнання */}
              {!isNewEquipment && (
                <>
                  <div className="form-group">
                    <label>Статус тестування</label>
                    <input
                      type="text"
                      value={
                        equipment?.testingStatus === 'none' || !equipment?.testingStatus ? 'Не тестувалось' :
                        equipment?.testingStatus === 'requested' ? 'Очікує тестування' :
                        equipment?.testingStatus === 'in_progress' ? 'В роботі' :
                        equipment?.testingStatus === 'completed' ? 'Тест пройдено' :
                        equipment?.testingStatus === 'failed' ? 'Тест не пройдено' : '—'
                      }
                      readOnly
                      disabled
                      style={{
                        backgroundColor: 
                          equipment?.testingStatus === 'completed' ? '#d4edda' :
                          equipment?.testingStatus === 'failed' ? '#f8d7da' :
                          equipment?.testingStatus === 'in_progress' ? '#d1ecf1' :
                          equipment?.testingStatus === 'requested' ? '#fff3cd' : '#e9ecef',
                        color:
                          equipment?.testingStatus === 'completed' ? '#155724' :
                          equipment?.testingStatus === 'failed' ? '#721c24' :
                          equipment?.testingStatus === 'in_progress' ? '#0c5460' :
                          equipment?.testingStatus === 'requested' ? '#856404' : '#495057'
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Дата тестування</label>
                    <input
                      type="text"
                      value={equipment?.testingDate ? new Date(equipment.testingDate).toLocaleDateString('uk-UA', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '—'}
                      readOnly
                      disabled
                    />
                  </div>
                  {/* Кнопка "Інформація по тесту" - активна тільки якщо тест завершено */}
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      type="button"
                      className={equipment?.testingStatus === 'completed' ? 'btn-testing-success' : 'btn-secondary'}
                      onClick={() => setShowTestingInfo(true)}
                      disabled={!equipment?.testingStatus || equipment?.testingStatus === 'none' || equipment?.testingStatus === 'requested' || equipment?.testingStatus === 'in_progress'}
                      style={{
                        width: '100%',
                        padding: '10px',
                        opacity: (equipment?.testingStatus === 'completed' || equipment?.testingStatus === 'failed') ? 1 : 0.5,
                        cursor: (equipment?.testingStatus === 'completed' || equipment?.testingStatus === 'failed') ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s'
                      }}
                    >
                      📋 Інформація по тесту
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Кількісна характеристика - відображається для обох типів */}
          <div className="form-section">
            <h3>Кількісна характеристика</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Одиниця виміру <span className="required">*</span></label>
                <select
                  name="batchUnit"
                  value={formData.batchUnit}
                  onChange={handleChange}
                  required
                  disabled={effectiveReadOnly}
                >
                  <option value="">Виберіть одиницю виміру</option>
                  <option value="шт.">шт.</option>
                  <option value="л.">л.</option>
                  <option value="комплект">комплект</option>
                  <option value="упаковка">упаковка</option>
                  <option value="балон">балон</option>
                  <option value="м.п.">м.п.</option>
                </select>
              </div>
              <div className="form-group">
                <label>Ціна за одиницю з ПДВ</label>
                <input
                  type="number"
                  name="batchPriceWithVAT"
                  value={formData.batchPriceWithVAT}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  readOnly={effectiveReadOnly}
                  disabled={effectiveReadOnly}
                />
              </div>
              <div className="form-group">
                <label>Тип валюти</label>
                <select
                  name="currency"
                  value={formData.currency || 'грн.'}
                  onChange={handleChange}
                  disabled={effectiveReadOnly}
                >
                  <option value="грн.">грн.</option>
                  <option value="USD">USD</option>
                  <option value="EURO">EURO</option>
                </select>
              </div>
            </div>
          </div>

          {isNewEquipment && !effectiveReadOnly && (
            <div className="form-section">
              <TechnicalSpecsConstructorBlock
                rows={formData.technicalSpecs}
                readOnly={effectiveReadOnly}
                onAddRow={addReceiptSpecRow}
                onRemoveRow={removeReceiptSpecRow}
                onUpdateRow={updateReceiptSpecRow}
                hint="Додавайте рядки вручну або через «Сканувати шильдик». Порожні рядки при збереженні відкидаються."
              />
            </div>
          )}

          {/* Технічні характеристики (legacy) — лише при редагуванні існуючої позиції */}
          {!isNewEquipment && !(equipmentType === 'batch' || equipment?.isBatch) && (
            <div className="form-section">
              <h3>Технічні характеристики</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Резервна потужність</label>
                  <input
                    type="text"
                    name="standbyPower"
                    value={formData.standbyPower}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Основна потужність</label>
                  <input
                    type="text"
                    name="primePower"
                    value={formData.primePower}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Фази</label>
                  <input
                    type="text"
                    name="phase"
                    value={formData.phase}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Напруга</label>
                  <input
                    type="text"
                    name="voltage"
                    value={formData.voltage}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Струм (A)</label>
                  <input
                    type="text"
                    name="amperage"
                    value={formData.amperage}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Cos φ</label>
                  <input
                    type="text"
                    name="cosPhi"
                    value={formData.cosPhi}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Частота (Гц)</label>
                  <input
                    type="text"
                    name="frequency"
                    value={formData.frequency}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>RPM</label>
                  <input
                    type="text"
                    name="rpm"
                    value={formData.rpm}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
              </div>
            </div>
          )}

          {!isNewEquipment && (
            <div className="form-section">
              <h3>Фізичні параметри</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Розміри (мм)</label>
                  <input
                    type="text"
                    name="dimensions"
                    value={formData.dimensions}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Вага (кг)</label>
                  <input
                    type="text"
                    name="weight"
                    value={formData.weight}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>Дата виробництва</label>
                  <input
                    type="date"
                    name="manufactureDate"
                    value={formData.manufactureDate}
                    onChange={handleChange}
                    readOnly={effectiveReadOnly}
                    disabled={effectiveReadOnly}
                  />
                </div>
              </div>
            </div>
          )}

          {!isNewEquipment &&
            (!effectiveReadOnly ||
              (formData.technicalSpecs || []).some(
                (r) => String(r.name || '').trim() || String(r.value || '').trim(),
              )) && (
              <div className="form-section">
                <TechnicalSpecsConstructorBlock
                  rows={formData.technicalSpecs}
                  readOnly={effectiveReadOnly}
                  onAddRow={addReceiptSpecRow}
                  onRemoveRow={removeReceiptSpecRow}
                  onUpdateRow={updateReceiptSpecRow}
                  hint="Довільні пари «назва — значення» поруч із класичними полями вище. «Сканувати шильдик» також додає рядки сюди. Порожні рядки при збереженні відкидаються."
                />
              </div>
            )}

          {!effectiveReadOnly && (
            <div className="form-section">
              <h3>Документи та фото</h3>
              <EquipmentFileUpload
                onFilesChange={setAttachedFiles}
                uploadedFiles={attachedFiles}
              />
            </div>
          )}
          {effectiveReadOnly && equipment?.attachedFiles && equipment.attachedFiles.length > 0 && (
            <div className="form-section">
              <h3>Документи та фото ({equipment.attachedFiles.length})</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px', marginTop: '15px' }}>
                {equipment.attachedFiles.map((file, index) => {
                  const isImage = file.mimetype && file.mimetype.startsWith('image/');
                  return (
                    <div key={file._id || file.cloudinaryId || index} style={{ 
                      border: '1px solid #444', 
                      borderRadius: '8px', 
                      padding: '10px', 
                      textAlign: 'center',
                      backgroundColor: '#1a1a1a'
                    }}>
                      {isImage ? (
                        <img 
                          src={file.cloudinaryUrl} 
                          alt={file.originalName || 'Фото'} 
                          style={{ 
                            width: '100%', 
                            height: '120px', 
                            objectFit: 'cover', 
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                          onClick={() => window.open(file.cloudinaryUrl, '_blank')}
                        />
                      ) : (
                        <div style={{ 
                          fontSize: '48px', 
                          marginBottom: '10px',
                          cursor: 'pointer'
                        }}
                        onClick={() => window.open(file.cloudinaryUrl, '_blank')}
                        >
                          📄
                        </div>
                      )}
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#aaa', 
                        marginTop: '8px',
                        wordBreak: 'break-word',
                        cursor: 'pointer'
                      }}
                      onClick={() => window.open(file.cloudinaryUrl, '_blank')}
                      title={file.originalName}
                      >
                        {file.originalName || 'Файл'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {equipment && (equipment.reservedByName || equipment.status === 'reserved') && (
            <div className="form-section" style={{ backgroundColor: 'var(--surface-dark)', padding: '15px', borderRadius: '6px', marginBottom: '15px' }}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '10px' }}>🔒 Резервування</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)' }}>
                <div><strong>Статус:</strong> {equipment.status === 'reserved' ? 'Зарезервовано' : 'Вільне'}</div>
                {equipment.reservationClientName && (
                  <div><strong>Клієнт:</strong> {equipment.reservationClientName}</div>
                )}
                {equipment.reservedByName && (
                  <div><strong>Зарезервував:</strong> {equipment.reservedByName}</div>
                )}
                {equipment.reservedAt && (
                  <div><strong>Дата резервування:</strong> {new Date(equipment.reservedAt).toLocaleDateString('uk-UA')}</div>
                )}
                {equipment.reservationEndDate && (
                  <div><strong>Дата закінчення:</strong> {new Date(equipment.reservationEndDate).toLocaleDateString('uk-UA')}</div>
                )}
                {equipment.reservationNotes && (
                  <div><strong>Примітки:</strong> {equipment.reservationNotes}</div>
                )}
              </div>
            </div>
          )}

          <div className="form-section">
            <h3>Примітки</h3>
            <div className="form-group">
              <textarea
                name="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                placeholder="Введіть примітки (необов'язково)"
                rows="5"
                style={{ width: '100%', minHeight: '120px' }}
                readOnly={effectiveReadOnly}
                disabled={effectiveReadOnly}
              />
            </div>
          </div>

            <div className="equipment-edit-footer">
              {readOnly && onReserve && onCancelReserve && (
                <>
                  {equipment && equipment.status === 'reserved' ? (
                    <>
                      {isMyEquipmentReserve(equipment, user) && (
                        <button type="button" className="btn-transfer-reserve" onClick={openTransferModal}>
                          Передати резерв іншому менеджеру
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => {
                          setConfirmAction('cancel');
                          setShowConfirmModal(true);
                        }}
                      >
                        🔓 Скасувати резервування
                      </button>
                    </>
                  ) : (
                    <button 
                      type="button" 
                      className="btn-save" 
                      onClick={() => {
                        setConfirmAction('reserve');
                        setShowConfirmModal(true);
                      }}
                    >
                      🔒 Зарезервувати
                    </button>
                  )}
                </>
              )}
              <button type="button" className="btn-cancel" onClick={onClose}>
                {effectiveReadOnly ? 'Закрити' : 'Скасувати'}
              </button>
              {!effectiveReadOnly && (
                <button type="submit" className="btn-save" disabled={loading}>
                  {loading ? 'Збереження...' : isNewEquipment ? 'Додати' : 'Зберегти'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Модалки QR та Історії */}
      {showQR && equipment && (
        <EquipmentQRModal
          equipment={equipment}
          onClose={() => setShowQR(false)}
        />
      )}

      {showHistory && equipment && (
        <EquipmentHistoryModal
          equipment={equipment}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Модальне вікно підтвердження резервування */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()} style={{
            maxWidth: '500px',
            padding: '20px',
            backgroundColor: 'var(--surface)',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <div className="modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              paddingBottom: '15px',
              borderBottom: '1px solid var(--border)'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>
                {confirmAction === 'reserve' ? '🔒 Підтвердження резервування' : '🔓 Підтвердження скасування резервування'}
              </h2>
              <button 
                className="btn-close" 
                onClick={() => setShowConfirmModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ marginBottom: '20px', color: 'var(--text)' }}>
              <p style={{ margin: 0, fontSize: '14px' }}>
                {confirmAction === 'reserve' 
                  ? 'Ви впевнені, що хочете зарезервувати це обладнання?'
                  : 'Ви впевнені, що хочете скасувати резервування цього обладнання?'}
              </p>
            </div>
            <div style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowConfirmModal(false)}
                style={{
                  padding: '10px 20px',
                  border: '1px solid var(--border)',
                  borderRadius: '5px',
                  background: 'var(--surface-dark)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Скасувати
              </button>
              <button
                type="button"
                className={confirmAction === 'reserve' ? 'btn-save' : 'btn-cancel'}
                onClick={async () => {
                  setShowConfirmModal(false);
                  if (confirmAction === 'reserve' && onReserve) {
                    await onReserve(equipment._id);
                    onClose();
                  } else if (confirmAction === 'cancel' && onCancelReserve) {
                    await onCancelReserve(equipment._id);
                    onClose();
                  }
                }}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '5px',
                  background: confirmAction === 'reserve' ? 'var(--primary)' : '#dc3545',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                {confirmAction === 'reserve' ? 'Зарезервувати' : 'Скасувати резервування'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && equipment && (
        <div
          className="modal-overlay equipment-transfer-overlay"
          onClick={() => !transferSubmitting && setShowTransferModal(false)}
          style={{ zIndex: 2100 }}
        >
          <div
            className="modal-content confirm-modal equipment-transfer-modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px' }}
          >
            <div className="modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--border)'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>Передати резерв</h2>
              <button
                type="button"
                className="btn-close"
                disabled={transferSubmitting}
                onClick={() => setShowTransferModal(false)}
                aria-label="Закрити"
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Оберіть менеджера. Поле «Клієнт» у резерві буде очищено; термін резерву збережеться. Позицію буде додано до останньої активної угоди отримувача (якщо така є).
            </p>
            {transferLoading ? (
              <p style={{ color: 'var(--text-secondary)' }}>Завантаження списку…</p>
            ) : transferError ? (
              <p style={{ color: '#ef4444', fontSize: '14px' }}>{transferError}</p>
            ) : (
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label htmlFor="transfer-manager-select" style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
                  Менеджер
                </label>
                <select
                  id="transfer-manager-select"
                  className="equipment-transfer-select"
                  value={transferSelectedLogin}
                  onChange={(e) => setTransferSelectedLogin(e.target.value)}
                  disabled={transferSubmitting}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-dark)',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                >
                  <option value="">— Оберіть менеджера —</option>
                  {transferManagers.map((m) => (
                    <option key={m.login} value={m.login}>
                      {m.name && String(m.name).trim() && m.name !== m.login
                        ? `${m.name} (${m.login})`
                        : m.login}
                    </option>
                  ))}
                </select>
                {!transferLoading && transferManagers.length === 0 && !transferError ? (
                  <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Немає інших активних менеджерів у списку.
                  </p>
                ) : null}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                type="button"
                className="btn-cancel"
                disabled={transferSubmitting}
                onClick={() => setShowTransferModal(false)}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="btn-save"
                disabled={transferSubmitting || transferLoading || !transferSelectedLogin || !!transferError}
                onClick={submitTransferReserve}
              >
                {transferSubmitting ? 'Передача…' : 'Передати'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальне вікно інформації по тестуванню */}
      {showTestingInfo && equipment && (
        <div className="modal-overlay" onClick={() => setShowTestingInfo(false)}>
          <div className="modal-content testing-info-modal" onClick={(e) => e.stopPropagation()} style={{
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto',
            padding: '0',
            backgroundColor: 'var(--surface)',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <div className="modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px',
              borderBottom: '1px solid var(--border)',
              position: 'sticky',
              top: 0,
              background: 'var(--surface)',
              zIndex: 10
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>
                📋 Інформація по тестуванню
              </h2>
              <button 
                className="btn-close" 
                onClick={() => setShowTestingInfo(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {/* Обладнання */}
              <div style={{ 
                background: 'var(--surface-dark)', 
                padding: '15px', 
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Тип обладнання:</span>
                    <div style={{ color: 'var(--text)', fontWeight: '500' }}>{equipment.type || '—'}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Серійний номер:</span>
                    <div style={{ color: 'var(--text)', fontWeight: '500' }}>{equipment.serialNumber || '—'}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Виробник:</span>
                    <div style={{ color: 'var(--text)', fontWeight: '500' }}>{equipment.manufacturer || '—'}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Склад:</span>
                    <div style={{ color: 'var(--text)', fontWeight: '500' }}>{equipment.currentWarehouseName || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Висновок тестування */}
              {equipment.testingConclusion && (
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '600',
                    backgroundColor: 
                      equipment.testingConclusion === 'passed' ? '#28a745' :
                      equipment.testingConclusion === 'partial' ? '#ffc107' : '#dc3545',
                    color: equipment.testingConclusion === 'partial' ? '#212529' : 'white'
                  }}>
                    {equipment.testingConclusion === 'passed' && '✅ Тест пройдено повністю'}
                    {equipment.testingConclusion === 'partial' && '⚠️ Тест пройдено частково'}
                    {equipment.testingConclusion === 'failed' && '❌ Тест не пройдено'}
                  </span>
                </div>
              )}

              {/* Інформація про тест */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '15px',
                marginBottom: '20px'
              }}>
                <div style={{ background: 'var(--surface-dark)', padding: '12px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Тестував:</span>
                  <div style={{ color: 'var(--text)', fontWeight: '500' }}>{equipment.testingCompletedByName || '—'}</div>
                </div>
                <div style={{ background: 'var(--surface-dark)', padding: '12px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Дата тестування:</span>
                  <div style={{ color: 'var(--text)', fontWeight: '500' }}>
                    {equipment.testingDate ? new Date(equipment.testingDate).toLocaleDateString('uk-UA', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : '—'}
                  </div>
                </div>
              </div>

              {/* Деталі тестування */}
              {equipment.testingProcedure && (
                <div style={{ 
                  background: 'var(--surface-dark)', 
                  padding: '15px', 
                  borderRadius: '8px',
                  marginBottom: '15px'
                }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--primary)' }}>📋 Процедура тестування</h4>
                  <p style={{ margin: 0, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{equipment.testingProcedure}</p>
                </div>
              )}

              {equipment.testingResult && (
                <div style={{ 
                  background: 'var(--surface-dark)', 
                  padding: '15px', 
                  borderRadius: '8px',
                  marginBottom: '15px'
                }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--primary)' }}>📊 Результат тестування</h4>
                  <p style={{ margin: 0, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{equipment.testingResult}</p>
                </div>
              )}

              {(() => {
                let materials = [];
                // Спочатку перевіряємо нове поле testingMaterialsArray
                if (Array.isArray(equipment.testingMaterialsArray) && equipment.testingMaterialsArray.length > 0) {
                  materials = equipment.testingMaterialsArray;
                } else if (equipment.testingMaterialsJson) {
                  try {
                    materials = JSON.parse(equipment.testingMaterialsJson);
                  } catch (e) { /* ignore */ }
                } else if (Array.isArray(equipment.testingMaterials)) {
                  materials = equipment.testingMaterials;
                }
                
                if (materials.length === 0) return null;
                
                return (
                  <div style={{ 
                    background: 'var(--surface-dark)', 
                    padding: '15px', 
                    borderRadius: '8px',
                    marginBottom: '15px'
                  }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--primary)' }}>🔧 Використані матеріали</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ 
                            padding: '8px 12px', 
                            textAlign: 'left', 
                            borderBottom: '1px solid var(--border)',
                            color: 'var(--text)',
                            fontSize: '13px',
                            fontWeight: '600'
                          }}>Тип матеріалу</th>
                          <th style={{ 
                            padding: '8px 12px', 
                            textAlign: 'left', 
                            borderBottom: '1px solid var(--border)',
                            color: 'var(--text)',
                            fontSize: '13px',
                            fontWeight: '600'
                          }}>Кількість</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materials.map((mat, idx) => (
                          <tr key={idx}>
                            <td style={{ 
                              padding: '8px 12px', 
                              borderBottom: '1px solid var(--border)',
                              color: 'var(--text)',
                              fontSize: '13px'
                            }}>{mat.type || '—'}</td>
                            <td style={{ 
                              padding: '8px 12px', 
                              borderBottom: '1px solid var(--border)',
                              color: 'var(--text)',
                              fontSize: '13px'
                            }}>{mat.quantity} {mat.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {equipment.testingNotes && (
                <div style={{ 
                  background: 'var(--surface-dark)', 
                  padding: '15px', 
                  borderRadius: '8px',
                  marginBottom: '15px'
                }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--primary)' }}>📝 Додаткові примітки</h4>
                  <p style={{ margin: 0, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{equipment.testingNotes}</p>
                </div>
              )}

              {(equipment.testingEngineer1 || equipment.testingEngineer2 || equipment.testingEngineer3) && (
                <div style={{ 
                  background: 'var(--surface-dark)', 
                  padding: '15px', 
                  borderRadius: '8px',
                  marginBottom: '15px'
                }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--primary)' }}>👷 Сервісні інженери</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {equipment.testingEngineer1 && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', minWidth: '30px' }}>№1:</span>
                        <span style={{ color: 'var(--text)', fontSize: '13px' }}>{equipment.testingEngineer1}</span>
                      </div>
                    )}
                    {equipment.testingEngineer2 && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', minWidth: '30px' }}>№2:</span>
                        <span style={{ color: 'var(--text)', fontSize: '13px' }}>{equipment.testingEngineer2}</span>
                      </div>
                    )}
                    {equipment.testingEngineer3 && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', minWidth: '30px' }}>№3:</span>
                        <span style={{ color: 'var(--text)', fontSize: '13px' }}>{equipment.testingEngineer3}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Файли тестування */}
              {equipment.testingFiles && equipment.testingFiles.length > 0 && (
                <div style={{ 
                  background: 'var(--surface-dark)', 
                  padding: '15px', 
                  borderRadius: '8px'
                }}>
                  <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: 'var(--primary)' }}>📎 Файли тестування ({equipment.testingFiles.length})</h4>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: '12px'
                  }}>
                    {equipment.testingFiles.map((file, index) => {
                      const imageFiles = equipment.testingFiles.filter(f => f.mimetype?.startsWith('image/'));
                      const imageIndex = imageFiles.findIndex(f => f.cloudinaryId === file.cloudinaryId || f.cloudinaryUrl === file.cloudinaryUrl);
                      
                      return (
                        <div 
                          key={file.cloudinaryId || index} 
                          style={{ textAlign: 'center', cursor: 'pointer' }}
                          onClick={() => {
                            if (file.mimetype?.startsWith('image/')) {
                              setTestingGalleryIndex(imageIndex >= 0 ? imageIndex : 0);
                              setTestingGalleryOpen(true);
                            } else {
                              window.open(file.cloudinaryUrl, '_blank');
                            }
                          }}
                        >
                          {file.mimetype?.startsWith('image/') ? (
                            <img 
                              src={file.cloudinaryUrl} 
                              alt={file.originalName}
                              style={{
                                width: '100%',
                                height: '80px',
                                objectFit: 'cover',
                                borderRadius: '6px',
                                border: '1px solid var(--border)'
                              }}
                            />
                          ) : (
                            <div style={{
                              width: '100%',
                              height: '80px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'var(--surface)',
                              borderRadius: '6px',
                              border: '1px solid var(--border)',
                              fontSize: '32px'
                            }}>
                              {file.mimetype?.includes('pdf') ? '📕' : 
                               file.mimetype?.includes('excel') || file.mimetype?.includes('spreadsheet') ? '📗' :
                               file.mimetype?.includes('word') || file.mimetype?.includes('document') ? '📘' : '📄'}
                            </div>
                          )}
                          <span style={{
                            display: 'block',
                            marginTop: '6px',
                            fontSize: '10px',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }} title={file.originalName}>
                            {file.originalName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div style={{ 
              padding: '15px 20px', 
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button 
                onClick={() => setShowTestingInfo(false)}
                style={{
                  padding: '10px 24px',
                  border: 'none',
                  borderRadius: '6px',
                  background: 'var(--primary)',
                  color: 'white',
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
      )}

      {/* Галерея для файлів тестування */}
      {testingGalleryOpen && equipment?.testingFiles && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: '20px'
          }}
          onClick={() => setTestingGalleryOpen(false)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '1200px',
              maxHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setTestingGalleryOpen(false)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: 0,
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '40px',
                cursor: 'pointer',
                padding: 0,
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10
              }}
            >
              ×
            </button>
            
            {(() => {
              const imageFiles = equipment.testingFiles.filter(f => f.mimetype?.startsWith('image/'));
              if (imageFiles.length === 0) return null;
              const currentFile = imageFiles[testingGalleryIndex];
              
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flex: 1, minHeight: 0 }}>
                    <button 
                      onClick={() => setTestingGalleryIndex((prev) => (prev - 1 + imageFiles.length) % imageFiles.length)}
                      disabled={imageFiles.length <= 1}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        color: 'white',
                        fontSize: '48px',
                        cursor: imageFiles.length <= 1 ? 'default' : 'pointer',
                        padding: '20px 15px',
                        borderRadius: '8px',
                        opacity: imageFiles.length <= 1 ? 0.3 : 1
                      }}
                    >
                      ‹
                    </button>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, maxHeight: '70vh' }}>
                      <img 
                        src={currentFile?.cloudinaryUrl} 
                        alt={currentFile?.originalName}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '70vh',
                          objectFit: 'contain',
                          borderRadius: '8px',
                          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)'
                        }}
                      />
                    </div>
                    <button 
                      onClick={() => setTestingGalleryIndex((prev) => (prev + 1) % imageFiles.length)}
                      disabled={imageFiles.length <= 1}
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        color: 'white',
                        fontSize: '48px',
                        cursor: imageFiles.length <= 1 ? 'default' : 'pointer',
                        padding: '20px 15px',
                        borderRadius: '8px',
                        opacity: imageFiles.length <= 1 ? 0.3 : 1
                      }}
                    >
                      ›
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', color: 'white' }}>
                    <span style={{ fontSize: '14px', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                      {currentFile?.originalName}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 600, background: 'rgba(255, 255, 255, 0.1)', padding: '6px 12px', borderRadius: '20px' }}>
                      {testingGalleryIndex + 1} / {imageFiles.length}
                    </span>
                  </div>
                  
                  {imageFiles.length > 1 && (
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', padding: '15px 0', overflowX: 'auto', maxWidth: '100%' }}>
                      {imageFiles.map((file, idx) => (
                        <img
                          key={file.cloudinaryId || idx}
                          src={file.cloudinaryUrl}
                          alt={file.originalName}
                          onClick={() => setTestingGalleryIndex(idx)}
                          style={{
                            width: '60px',
                            height: '60px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            opacity: idx === testingGalleryIndex ? 1 : 0.5,
                            border: idx === testingGalleryIndex ? '2px solid var(--primary)' : '2px solid transparent',
                            flexShrink: 0
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default EquipmentEditModal;

