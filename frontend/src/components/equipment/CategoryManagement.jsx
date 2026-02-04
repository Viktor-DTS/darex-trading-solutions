import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './CategoryManagement.css';

function flattenForSelect(nodes, level = 0) {
  let list = [];
  (nodes || []).forEach((n) => {
    list.push({ ...n, level });
    if (n.children?.length) list = list.concat(flattenForSelect(n.children, level + 1));
  });
  return list;
}

export default function CategoryManagement({ user }) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ parentId: '', name: '', itemKind: 'equipment', sortOrder: 0 });
  const [saving, setSaving] = useState(false);
  const [migrateResult, setMigrateResult] = useState('');

  const loadTree = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/categories/tree`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Не вдалося завантажити дерево');
      const data = await res.json();
      setTree(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Помилка');
      setTree([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/categories`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          parentId: form.parentId || null,
          name: form.name.trim(),
          itemKind: form.itemKind,
          sortOrder: Number(form.sortOrder) || 0
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Помилка створення');
      }
      setShowForm(false);
      setForm({ parentId: '', name: '', itemKind: 'equipment', sortOrder: 0 });
      loadTree();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Видалити цю групу? (Повинно не мати дочірніх груп і номенклатури)')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Помилка видалення');
      }
      loadTree();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleMigrate = async () => {
    if (!window.confirm('Прив\'язати все обладнання без групи до кореневих категорій (за типом матеріальних цінностей)?')) return;
    setSaving(true);
    setMigrateResult('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/categories/migrate-equipment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Помилка міграції');
      setMigrateResult(data.message || 'Готово');
      loadTree();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const flatList = flattenForSelect(tree);

  return (
    <div className="category-management">
      <div className="category-management-header">
        <h2>Дерево категорій номенклатури (1С)</h2>
        <p className="category-management-desc">
          Два корені: <strong>Товари</strong> (обладнання для продажу) та <strong>Деталі та комплектуючі</strong>. Додавайте підгрупи для структурування.
        </p>
        <div className="category-management-actions">
          <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
            + Додати підгрупу
          </button>
          <button type="button" className="btn-secondary" onClick={handleMigrate} disabled={saving}>
            Мігрувати обладнання без групи
          </button>
        </div>
        {migrateResult && <p className="category-management-message success">{migrateResult}</p>}
        {error && <p className="category-management-message error">{error}</p>}
      </div>

      {showForm && (
        <form className="category-form" onSubmit={handleCreate}>
          <h3>Нова підгрупа</h3>
          <div className="form-row">
            <label>Батьківська група *</label>
            <select
              value={form.parentId}
              onChange={(e) => {
                const id = e.target.value;
                const cat = flatList.find(c => String(c._id || c.id) === String(id));
                setForm(f => ({
                  ...f,
                  parentId: id,
                  itemKind: cat ? cat.itemKind : f.itemKind
                }));
              }}
              required
            >
              <option value="">— Оберіть батьківську групу —</option>
              {flatList.map((c) => (
                <option key={c._id} value={c._id?.toString?.() || c._id}>
                  {'\u00A0'.repeat((c.level || 0) * 2)}{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Тип гілки</label>
            <select
              value={form.itemKind}
              onChange={(e) => setForm(f => ({ ...f, itemKind: e.target.value }))}
            >
              <option value="equipment">Товари (обладнання для продажу)</option>
              <option value="parts">Деталі та комплектуючі</option>
            </select>
          </div>
          <div className="form-row">
            <label>Назва групи *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="наприклад: Генератори, ЗІП"
              required
            />
          </div>
          <div className="form-row">
            <label>Порядок (число)</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm(f => ({ ...f, sortOrder: e.target.value }))}
            />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? 'Збереження...' : 'Зберегти'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(''); }}>
              Скасувати
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p>Завантаження...</p>
      ) : (
        <div className="category-tree-list">
          {tree.map((root) => (
            <CategoryNode key={root._id} node={root} onDelete={handleDelete} onRefresh={loadTree} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryNode({ node, onDelete, onRefresh, level = 0 }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isRoot = level === 0;

  return (
    <div className="category-node" style={{ marginLeft: level * 20 }}>
      <div className="category-node-row">
        <span className="category-node-toggle" onClick={() => setExpanded(!expanded)}>
          {hasChildren ? (expanded ? '▼' : '▶') : ' '}
        </span>
        <span className="category-node-name">{node.name}</span>
        <span className="category-node-kind">{node.itemKind === 'equipment' ? 'Товари' : 'Деталі'}</span>
        {!isRoot && (
          <button type="button" className="btn-delete-small" onClick={() => onDelete(node._id)} title="Видалити групу">
            Видалити
          </button>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="category-node-children">
          {node.children.map((child) => (
            <CategoryNode key={child._id} node={child} onDelete={onDelete} onRefresh={onRefresh} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
