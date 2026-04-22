import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API_BASE_URL from '../../config';
import { normalizeUomLabel, useUnitsOfMeasure } from '../../hooks/useUnitsOfMeasure';
import EquipmentFileUpload from './EquipmentFileUpload';
import './CategoryManagement.css';

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
    _key: `spec-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    name: '',
    value: '',
  };
}

const emptyForm = () => ({
  displayName: '',
  type: '',
  manufacturer: '',
  categoryId: '',
  itemKind: 'equipment',
  materialValueType: '',
  defaultReceiptMode: 'single',
  defaultBatchUnit: 'шт.',
  defaultCurrency: 'грн.',
  internalNotes: '',
  technicalSpecs: [],
  attachedFiles: [],
  isActive: true,
});

export default function ProductCardManagement() {
  const { units: uomList } = useUnitsOfMeasure();
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

  const batchUnitOptions = useMemo(() => {
    const u = String(form.defaultBatchUnit || '').trim();
    const list = [...(uomList || [])];
    if (u && !list.includes(u)) list.unshift(u);
    return list.length ? list : ['шт.'];
  }, [uomList, form.defaultBatchUnit]);

  const batchUnitSelectValue = useMemo(() => {
    const u = String(form.defaultBatchUnit || '').trim();
    if (batchUnitOptions.includes(u)) return u;
    return batchUnitOptions[0] || 'шт.';
  }, [form.defaultBatchUnit, batchUnitOptions]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
    setError('');
  };

  const openEdit = (row) => {
    setEditing(row);
    const specs = Array.isArray(row.technicalSpecs)
      ? row.technicalSpecs.map((s, i) => ({
          _key: `${row._id}-spec-${i}`,
          name: s.name != null ? String(s.name) : '',
          value: s.value != null ? String(s.value) : '',
        }))
      : [];
    const files = Array.isArray(row.attachedFiles)
      ? row.attachedFiles.map((f, i) => ({
          id: f._id || f.cloudinaryId || `af-${i}`,
          cloudinaryUrl: f.cloudinaryUrl,
          cloudinaryId: f.cloudinaryId,
          originalName: f.originalName,
          mimetype: f.mimetype,
          size: f.size,
          uploadedAt: f.uploadedAt,
        }))
      : [];
    setForm({
      displayName: row.displayName || '',
      type: row.type || '',
      manufacturer: row.manufacturer || '',
      categoryId: row.categoryId ? String(row.categoryId._id || row.categoryId) : '',
      itemKind: row.itemKind || 'equipment',
      materialValueType:
        row.materialValueType && ['service', 'electroinstall', 'internal'].includes(row.materialValueType)
          ? row.materialValueType
          : '',
      defaultReceiptMode: row.defaultReceiptMode === 'batch' ? 'batch' : 'single',
      defaultBatchUnit: row.defaultBatchUnit || 'шт.',
      defaultCurrency: row.defaultCurrency || 'грн.',
      internalNotes: row.internalNotes || '',
      technicalSpecs: specs,
      attachedFiles: files,
      isActive: row.isActive !== false,
    });
    setShowForm(true);
    setError('');
  };

  const addSpecRow = () => {
    setForm((f) => ({ ...f, technicalSpecs: [...(f.technicalSpecs || []), newSpecRow()] }));
  };

  const removeSpecRow = (key) => {
    setForm((f) => ({ ...f, technicalSpecs: (f.technicalSpecs || []).filter((r) => r._key !== key) }));
  };

  const updateSpecRow = (key, field, val) => {
    setForm((f) => ({
      ...f,
      technicalSpecs: (f.technicalSpecs || []).map((r) =>
        r._key === key ? { ...r, [field]: val } : r,
      ),
    }));
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
        defaultBatchUnit: normalizeUomLabel(form.defaultBatchUnit, uomList),
        defaultCurrency: form.defaultCurrency.trim() || 'грн.',
        internalNotes: form.internalNotes,
        technicalSpecs: (form.technicalSpecs || []).map(({ name, value }) => ({
          name: name != null ? String(name) : '',
          value: value != null ? String(value) : '',
        })),
        materialValueType: form.materialValueType || '',
        defaultReceiptMode: form.defaultReceiptMode === 'batch' ? 'batch' : 'single',
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
          Канонічний запис для типу товару: при надходженні на склад обирають карточку — підставляються тип, виробник, група 1С, тип матеріальних цінностей, режим
          одиничне/партія за замовчуванням, технічні характеристики (розпізнавання типових назв), фото з карточки.
          <strong> Серійний / заводський номер конкретної одиниці</strong> завжди вводять лише у формі надходження на склад (у карточці його немає — він унікальний для кожної
          одиниці). Створення та редагування карточок — адміністратор; список для вибору — при додаванні обладнання.
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
            <label>Тип матеріальних цінностей за замовчуванням</label>
            <select
              value={form.materialValueType}
              onChange={(e) => setForm((f) => ({ ...f, materialValueType: e.target.value }))}
            >
              <option value="">— Не задано (оберуть при надходженні або залишиться порожнім) —</option>
              <option value="service">Комплектуючі ЗІП (Сервіс)</option>
              <option value="electroinstall">Комплектуючі для електромонтажних робіт</option>
              <option value="internal">Обладнання для внутрішніх потреб</option>
            </select>
          </div>
          <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label>Режим надходження за замовчуванням</label>
            <p style={{ fontSize: '12px', opacity: 0.85, margin: '0 0 8px' }}>
              Підказка для форми прийому: одиничне (потрібен серійний/заводський номер з шильдика) або партія (кількість без серійника).
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '6px' }}>
              <input
                type="radio"
                name="pcReceiptMode"
                checked={form.defaultReceiptMode === 'single'}
                onChange={() => setForm((f) => ({ ...f, defaultReceiptMode: 'single' }))}
              />
              Одиничне обладнання (з серійним / заводським номером)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="pcReceiptMode"
                checked={form.defaultReceiptMode === 'batch'}
                onChange={() => setForm((f) => ({ ...f, defaultReceiptMode: 'batch' }))}
              />
              Партія (щитове тощо — без серійного номера, за кількістю)
            </label>
          </div>
          <div className="form-row">
            <label>Од. виміру за замовчуванням</label>
            <select
              value={batchUnitSelectValue}
              onChange={(e) => setForm((f) => ({ ...f, defaultBatchUnit: e.target.value }))}
            >
              {batchUnitOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '12px', opacity: 0.8, margin: '6px 0 0', lineHeight: 1.35 }}>
              Список редагується в Адміністратор → «Системні коефіцієнти» → «Одиниці виміру». Нестандартне значення зі
              старої картки тимчасово додається у випадний список.
            </p>
          </div>
          <div className="form-row">
            <label>Валюта за замовчуванням</label>
            <input
              type="text"
              value={form.defaultCurrency}
              onChange={(e) => setForm((f) => ({ ...f, defaultCurrency: e.target.value }))}
            />
          </div>

          <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label>Фото та файли (зразок / паспорт / шильдик)</label>
            <p style={{ fontSize: '12px', opacity: 0.85, margin: '0 0 8px' }}>
              Завантажені файли при надходженні можуть додатися до позиції разом із цими зображеннями.
            </p>
            <EquipmentFileUpload
              uploadedFiles={form.attachedFiles || []}
              onFilesChange={(files) => setForm((f) => ({ ...f, attachedFiles: files }))}
            />
          </div>

          <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <label>Технічні характеристики (конструктор)</label>
            <p
              style={{
                fontSize: '12px',
                opacity: 0.85,
                margin: '0 0 10px',
                lineHeight: 1.45,
              }}
            >
              Додавайте рядки з довільною назвою поля та значенням. Рядки, де порожні і назва, і значення, при збереженні
              відкидаються.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(form.technicalSpecs || []).map((row) => (
                <div
                  key={row._key}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Назва поля (наприклад, Резервна потужність)"
                    value={row.name}
                    onChange={(e) => updateSpecRow(row._key, 'name', e.target.value)}
                    style={{ flex: '1 1 160px', minWidth: '140px', padding: '8px 10px' }}
                  />
                  <input
                    type="text"
                    placeholder="Значення"
                    value={row.value}
                    onChange={(e) => updateSpecRow(row._key, 'value', e.target.value)}
                    style={{ flex: '1 1 160px', minWidth: '140px', padding: '8px 10px' }}
                  />
                  <button
                    type="button"
                    className="btn-delete-small"
                    onClick={() => removeSpecRow(row._key)}
                    title="Прибрати рядок"
                  >
                    Видалити
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '12px', alignSelf: 'flex-start' }}
              onClick={addSpecRow}
            >
              + Додати характеристику
            </button>
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
                      {Array.isArray(row.technicalSpecs) && row.technicalSpecs.length > 0 ? (
                        <div style={{ fontSize: '11px', opacity: 0.65, marginTop: '4px' }}>
                          Характеристик: {row.technicalSpecs.length}
                        </div>
                      ) : null}
                      {Array.isArray(row.attachedFiles) && row.attachedFiles.length > 0 ? (
                        <div style={{ fontSize: '11px', opacity: 0.65, marginTop: '2px' }}>
                          Файлів: {row.attachedFiles.length}
                        </div>
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
