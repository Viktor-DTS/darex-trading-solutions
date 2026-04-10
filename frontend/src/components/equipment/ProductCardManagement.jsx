import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../../config';
import './CategoryManagement.css';

function flattenCategories(nodes, level = 0) {
  let list = [];
  (nodes || []).forEach((n) => {
    list.push({ ...n, level });
    if (n.children?.length) list = list.concat(flattenCategories(n.children, level + 1));
  });
  return list;
}

const emptyForm = () => ({
  displayName: '',
  type: '',
  manufacturer: '',
  categoryId: '',
  itemKind: 'equipment',
  defaultBatchUnit: 'шт.',
  defaultCurrency: 'грн.',
  internalNotes: '',
  isActive: true,
});

export default function ProductCardManagement() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [categoriesFlat, setCategoriesFlat] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => emptyForm());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

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

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const q = new URLSearchParams();
      if (debouncedSearch) q.set('search', debouncedSearch);
      if (includeInactive) q.set('includeInactive', '1');
      q.set('limit', '300');
      const res = await fetch(`${API_BASE_URL}/product-cards?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Не вдалося завантажити карточки');
      }
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Помилка');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, includeInactive]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
    setError('');
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      displayName: row.displayName || '',
      type: row.type || '',
      manufacturer: row.manufacturer || '',
      categoryId: row.categoryId ? String(row.categoryId._id || row.categoryId) : '',
      itemKind: row.itemKind || 'equipment',
      defaultBatchUnit: row.defaultBatchUnit || 'шт.',
      defaultCurrency: row.defaultCurrency || 'грн.',
      internalNotes: row.internalNotes || '',
      isActive: row.isActive !== false,
    });
    setShowForm(true);
    setError('');
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
        defaultBatchUnit: form.defaultBatchUnit.trim() || 'шт.',
        defaultCurrency: form.defaultCurrency.trim() || 'грн.',
        internalNotes: form.internalNotes,
        isActive: !!form.isActive,
      };
      const url = editing
        ? `${API_BASE_URL}/product-cards/${editing._id}`
        : `${API_BASE_URL}/product-cards`;
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Помилка збереження');
      }
      setShowForm(false);
      setEditing(null);
      loadList();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Видалити карточку «${row.type}»? Можливо лише якщо немає залишків на складі за цією карточкою.`)) return;
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/product-cards/${row._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Помилка видалення');
      }
      loadList();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="category-management">
      <div className="category-management-header">
        <h2>Карточки продуктів (довідник номенклатури)</h2>
        <p className="category-management-desc">
          Канонічний запис для типу товару: при надходженні на склад можна обрати карточку — підставляться тип, виробник, група 1С та вид номенклатури.
          Створення та редагування — лише для адміністратора; перегляд списку доступний усім, хто має доступ до API (наприклад, при додаванні обладнання).
        </p>
        <div className="category-management-actions" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <button type="button" className="btn-primary" onClick={openCreate}>
            + Нова карточка
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Показувати неактивні
          </label>
          <input
            type="search"
            placeholder="Пошук за типом, виробником, назвою для списку…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: '240px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color, #444)' }}
          />
        </div>
        {error && <p className="category-management-message error">{error}</p>}
      </div>

      {showForm && (
        <form className="category-form" onSubmit={handleSubmit}>
          <h3>{editing ? 'Редагувати карточку' : 'Нова карточка'}</h3>
          <div className="form-row">
            <label>Коротка назва для списку (необов’язково)</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="наприклад: DE-50 для швидкого пошуку"
            />
          </div>
          <div className="form-row">
            <label>Тип / найменування *</label>
            <input
              type="text"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              required
              placeholder="як у 1С / на шильдику"
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
                  {'\u00A0'.repeat((c.level || 0) * 2)}{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Вид</label>
            <select
              value={form.itemKind}
              onChange={(e) => setForm((f) => ({ ...f, itemKind: e.target.value }))}
            >
              <option value="equipment">Товари (обладнання)</option>
              <option value="parts">Деталі та комплектуючі</option>
            </select>
          </div>
          <div className="form-row">
            <label>Од. виміру за замовчуванням</label>
            <input
              type="text"
              value={form.defaultBatchUnit}
              onChange={(e) => setForm((f) => ({ ...f, defaultBatchUnit: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label>Валюта за замовчуванням</label>
            <input
              type="text"
              value={form.defaultCurrency}
              onChange={(e) => setForm((f) => ({ ...f, defaultCurrency: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label>Внутрішні примітки</label>
            <textarea
              value={form.internalNotes}
              onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="form-row form-row-checkbox">
            <label className="category-checkbox-label">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              <span>Активна (можна обирати при надходженні)</span>
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving || !form.type.trim()}>
              {saving ? 'Збереження…' : 'Зберегти'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                setError('');
              }}
            >
              Скасувати
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p>Завантаження…</p>
      ) : (
        <div className="category-tree-list" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color, #444)' }}>
                <th style={{ padding: '8px' }}>Тип</th>
                <th style={{ padding: '8px' }}>Виробник</th>
                <th style={{ padding: '8px' }}>Група</th>
                <th style={{ padding: '8px' }}>Вид</th>
                <th style={{ padding: '8px' }}>Статус</th>
                <th style={{ padding: '8px' }} />
              </tr>
            </thead>
            <tbody>
              {list.map((row) => {
                const cat = row.categoryId;
                const catName = cat && typeof cat === 'object' ? cat.name : '—';
                return (
                  <tr key={row._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '8px' }}>
                      <div>{row.type}</div>
                      {row.displayName ? (
                        <div style={{ fontSize: '12px', opacity: 0.75 }}>{row.displayName}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: '8px' }}>{row.manufacturer || '—'}</td>
                    <td style={{ padding: '8px' }}>{catName}</td>
                    <td style={{ padding: '8px' }}>{row.itemKind === 'parts' ? 'Деталі' : 'Товари'}</td>
                    <td style={{ padding: '8px' }}>{row.isActive === false ? 'Вимкнено' : 'Активна'}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn-edit-small" onClick={() => openEdit(row)}>
                        Редагувати
                      </button>{' '}
                      <button type="button" className="btn-delete-small" onClick={() => handleDelete(row)}>
                        Видалити
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <p style={{ marginTop: '16px', opacity: 0.8 }}>Нічого не знайдено.</p>}
        </div>
      )}
    </div>
  );
}
