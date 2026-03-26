import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './CategoryTree.css';

function CategoryTreeNode({ node, selectedId, onSelect, level = 0 }) {
  const [expanded, setExpanded] = useState(level < 1);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId && (node._id === selectedId || node._id === selectedId.toString());

  return (
    <div className="category-tree-node" style={{ marginLeft: level * 14 }}>
      <div
        className={`category-tree-row ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelect(node._id, node.itemKind)}
      >
        <span
          className="category-tree-toggle"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          aria-hidden
        >
          {hasChildren ? (expanded ? '▼' : '▶') : ' '}
        </span>
        <span className="category-tree-label" title={node.name}>
          {node.name}
        </span>
      </div>
      {hasChildren && expanded && (
        <div className="category-tree-children">
          {node.children.map((child) => (
            <CategoryTreeNode
              key={child._id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryTree({
  selectedId,
  onSelectCategory,
  showAllOption = true,
  /** true — дерево як у панелі менеджера (лише групи з прапорцем visibleToManagers); для адміна в «Менеджери» теж потрібно */
  managerCategoryContext = false,
}) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const q = managerCategoryContext ? '?managerCategoryContext=1' : '';
        const res = await fetch(`${API_BASE_URL}/categories/tree${q}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Не вдалося завантажити дерево категорій');
        const data = await res.json();
        if (!cancelled) setTree(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Помилка завантаження');
          setTree([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [managerCategoryContext]);

  if (loading) {
    return (
      <div className="category-tree category-tree-loading">
        <div className="category-tree-header">
          <div className="category-tree-title">Номенклатура</div>
        </div>
        <div className="category-tree-scroll">Завантаження...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="category-tree category-tree-error">
        <div className="category-tree-header">
          <div className="category-tree-title">Номенклатура</div>
        </div>
        <div className="category-tree-scroll">{error}</div>
      </div>
    );
  }

  return (
    <div className="category-tree">
      <div className="category-tree-header">
        <div className="category-tree-title">Номенклатура</div>
        {showAllOption && (
          <div
            className={`category-tree-row ${!selectedId ? 'selected' : ''}`}
            onClick={() => onSelectCategory(null, null)}
          >
            <span className="category-tree-toggle"> </span>
            <span className="category-tree-label">Всі</span>
          </div>
        )}
      </div>
      <div className="category-tree-scroll">
        {tree.map((root) => (
          <CategoryTreeNode
            key={root._id}
            node={root}
            selectedId={selectedId}
            onSelect={onSelectCategory}
          />
        ))}
      </div>
    </div>
  );
}
