import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../../config';
import { parsedEquipmentToTechnicalSpecs } from '../../utils/ocrParser';
import EquipmentScanner from './EquipmentScanner';
import EquipmentFileUpload from './EquipmentFileUpload';
import { mergeCardSpecsIntoFormRows } from './productCardApply';
import './CategoryManagement.css';
import './ProductCardQuickCreateModal.css';

function flattenCategories(nodes, level = 0) {
  let list = [];
  (nodes || []).forEach((n) => {
    list.push({ ...n, level });
    if (n.children?.length) list = list.concat(flattenCategories(n.children, level + 1));
  });
  return list;
}

function newSpecRow() {
  return {
    _key: `pc-spec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    name: '',
    value: '',
  };
}

function emptyForm() {
  return {
    displayName: '',
    type: '',
    manufacturer: '',
    categoryId: '',
    itemKind: 'equipment',
    materialValueType: '',
    defaultBatchUnit: 'шт.',
    defaultCurrency: 'грн.',
    internalNotes: '',
    technicalSpecs: [],
    attachedFiles: [],
    isActive: true,
  };
}

export default function ProductCardQuickCreateModal({ user, warehouses, onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm);
  const [categoriesFlat, setCategoriesFlat] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/categories?tree=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const tree = await res.json();
      setCategoriesFlat(flattenCategories(Array.isArray(tree) ? tree : []));
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const addSpecRow = () => {
    setForm((f) => ({ ...f, technicalSpecs: [...(f.technicalSpecs || []), newSpecRow()] }));
  };
  const removeSpecRow = (key) => {
    setForm((f) => ({ ...f, technicalSpecs: (f.technicalSpecs || []).filter((r) => r._key !== key) }));
  };
  const updateSpecRow = (key, field, val) => {
    setForm((f) => ({
      ...f,
      technicalSpecs: (f.technicalSpecs || []).map((r) => (r._key === key ? { ...r, [field]: val } : r)),
    }));
  };

  const handleScanData = (data) => {
    const specPairs = parsedEquipmentToTechnicalSpecs(data);
    setForm((f) => ({
      ...f,
      type: f.type?.trim() ? f.type : (data.type || ''),
      manufacturer: f.manufacturer?.trim() ? f.manufacturer : (data.manufacturer || ''),
      technicalSpecs: mergeCardSpecsIntoFormRows(f.technicalSpecs, specPairs),
    }));
    setShowScanner(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.type.trim()) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const body = {
        displayName: form.displayName.trim(),
        type: form.type.trim(),
        manufacturer: form.manufacturer.trim(),
        categoryId: form.categoryId || null,
        itemKind: form.itemKind,
        materialValueType: form.materialValueType || '',
        defaultReceiptMode: form.defaultReceiptMode === 'batch' ? 'batch' : 'single',
        defaultBatchUnit: form.defaultBatchUnit.trim() || 'шт.',
        defaultCurrency: form.defaultCurrency.trim() || 'грн.',
        internalNotes: form.internalNotes,
        technicalSpecs: (form.technicalSpecs || []).map(({ name, value }) => ({
          name: name != null ? String(name) : '',
          value: value != null ? String(value) : '',
        })),
        attachedFiles: (form.attachedFiles || [])
          .map((f) => ({
            cloudinaryUrl: f.cloudinaryUrl,
            cloudinaryId: f.cloudinaryId,
            originalName: f.originalName,
            mimetype: f.mimetype,
            size: f.size,
            uploadedAt: f.uploadedAt,
          }))
          .filter((f) => f.cloudinaryUrl),
        isActive: !!form.isActive,
      };
      const res = await fetch(`${API_BASE_URL}/product-cards`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const err = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(err.error || 'Помилка створення');
      onCreated(err);
      onClose();
    } catch (e) {
      setError(e.message || 'Помилка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="product-card-quick-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="product-card-quick-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="product-card-quick-header">
          <h3>Нова карточка продукту</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>
        <p className="product-card-quick-intro">
          Конструктор як у адмінці. <strong>Скан шильдика</strong> додає рядки характеристик за розпізнаними полями (тип і
          виробник теж підставляються, якщо порожні).
        </p>
        {error && <p className="category-management-message error">{error}</p>}

        {showScanner ? (
          <EquipmentScanner
            user={user}
            warehouses={warehouses}
            embedded
            onDataScanned={handleScanData}
            onClose={() => setShowScanner(false)}
          />
        ) : (
          <form className="category-form product-card-quick-form" onSubmit={handleSubmit}>
            <div className="form-actions" style={{ marginBottom: '12px' }}>
              <button type="button" className="btn-primary" onClick={() => setShowScanner(true)}>
                📷 Сканувати шильдик (авто-рядки характеристик)
              </button>
            </div>
            <div className="form-row">
              <label>Коротка назва для списку</label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label>Тип / найменування *</label>
              <input
                type="text"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                required
              />
            </div>
            <div className="form-row">
              <label>Виробник</label>
              <input
                type="text"
                value={form.manufacturer}
                onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label>Група номенклатури (1С)</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">— Не обрано —</option>
                {categoriesFlat.map((c) => (
                  <option key={c._id} value={c._id?.toString?.() || c._id}>
                    {'\u00A0'.repeat((c.level || 0) * 2)}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Вид</label>
              <select value={form.itemKind} onChange={(e) => setForm((f) => ({ ...f, itemKind: e.target.value }))}>
                <option value="equipment">Товари (обладнання)</option>
                <option value="parts">Деталі та комплектуючі</option>
              </select>
            </div>
            <div className="form-row">
              <label>Тип матеріальних цінностей за замовчуванням</label>
              <select
                value={form.materialValueType}
                onChange={(e) => setForm((f) => ({ ...f, materialValueType: e.target.value }))}
              >
                <option value="">— Не задано —</option>
                <option value="service">ЗІП (Сервіс)</option>
                <option value="electroinstall">Електромонтаж</option>
                <option value="internal">Внутрішні потреби</option>
              </select>
            </div>
            <div className="form-row">
              <label>Од. виміру / валюта</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  style={{ flex: 1, minWidth: '100px' }}
                  value={form.defaultBatchUnit}
                  onChange={(e) => setForm((f) => ({ ...f, defaultBatchUnit: e.target.value }))}
                  placeholder="шт."
                />
                <input
                  style={{ flex: 1, minWidth: '100px' }}
                  value={form.defaultCurrency}
                  onChange={(e) => setForm((f) => ({ ...f, defaultCurrency: e.target.value }))}
                  placeholder="грн."
                />
              </div>
            </div>
            <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <label>Фото / файли</label>
              <EquipmentFileUpload
                uploadedFiles={form.attachedFiles || []}
                onFilesChange={(files) => setForm((f) => ({ ...f, attachedFiles: files }))}
              />
            </div>
            <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <label>Технічні характеристики (конструктор)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(form.technicalSpecs || []).map((row) => (
                  <div key={row._key} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Назва поля"
                      value={row.name}
                      onChange={(e) => updateSpecRow(row._key, 'name', e.target.value)}
                      style={{ flex: '1 1 140px', padding: '8px' }}
                    />
                    <input
                      type="text"
                      placeholder="Значення"
                      value={row.value}
                      onChange={(e) => updateSpecRow(row._key, 'value', e.target.value)}
                      style={{ flex: '1 1 140px', padding: '8px' }}
                    />
                    <button type="button" className="btn-delete-small" onClick={() => removeSpecRow(row._key)}>
                      Видалити
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-secondary" style={{ marginTop: '10px', alignSelf: 'flex-start' }} onClick={addSpecRow}>
                + Додати рядок
              </button>
            </div>
            <div className="form-row">
              <label>Внутрішні примітки</label>
              <textarea
                rows={2}
                value={form.internalNotes}
                onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
              />
            </div>
            <div className="form-row form-row-checkbox">
              <label className="category-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <span>Активна</span>
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" disabled={saving || !form.type.trim()}>
                {saving ? 'Збереження…' : 'Створити карточку'}
              </button>
              <button type="button" onClick={onClose}>
                Скасувати
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
