import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../../config';
import './WarehouseManagement.css';

function WarehouseManagement({ user }) {
  const [warehouses, setWarehouses] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    region: '',
    address: ''
  });
  const [errors, setErrors] = useState([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importDryRun, setImportDryRun] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importCategories, setImportCategories] = useState([]);
  const [categoryListFilter, setCategoryListFilter] = useState('');
  const [nomenclatureSelections, setNomenclatureSelections] = useState({});
  const [mappingSaveMsg, setMappingSaveMsg] = useState(null);
  const [mappingSaveLoading, setMappingSaveLoading] = useState(false);
  /** 1 — вибір файлу / перевірка; 2 — вікно зіставлення категорій (відкривається автоматично, якщо є невідомі позиції) */
  const [importModalStep, setImportModalStep] = useState(1);
  const [importTargetWarehouseId, setImportTargetWarehouseId] = useState('');

  const isAdmin = user?.role === 'admin' || user?.role === 'administrator';

  const sortedImportCategories = useMemo(() => {
    return [...importCategories].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'uk')
    );
  }, [importCategories]);

  const filteredCategoryReference = useMemo(() => {
    const q = categoryListFilter.trim().toLowerCase();
    if (!q) return sortedImportCategories;
    return sortedImportCategories.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        String(c.id || '')
          .toLowerCase()
          .includes(q)
    );
  }, [sortedImportCategories, categoryListFilter]);

  useEffect(() => {
    loadWarehouses();
    loadRegions();
  }, []);

  useEffect(() => {
    if (!importModalOpen || !isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const r = await fetch(`${API_BASE_URL}/categories/for-stock-import`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled) setImportCategories(Array.isArray(data.categories) ? data.categories : []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [importModalOpen, isAdmin]);

  useEffect(() => {
    if (importModalStep === 2 && (!importResult?.needsCategoryMapping?.length)) {
      setImportModalStep(1);
    }
  }, [importModalStep, importResult]);

  useEffect(() => {
    if (!importModalOpen || !warehouses.length) return;
    setImportTargetWarehouseId((prev) => {
      if (prev) return prev;
      const active = warehouses.find((w) => w.isActive !== false);
      return String((active || warehouses[0])._id || '');
    });
  }, [importModalOpen, warehouses]);

  useEffect(() => {
    if (!importResult?.needsCategoryMapping?.length) {
      setNomenclatureSelections({});
      return;
    }
    const existing = importResult.existingNomenclatureCategoryMap || {};
    const init = {};
    importResult.needsCategoryMapping.forEach(({ nome }) => {
      const v = existing[nome];
      init[nome] = v != null && v !== '' ? String(v) : '';
    });
    setNomenclatureSelections(init);
  }, [importResult]);

  const loadRegions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/regions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        // Регіони можуть приходити як масив об'єктів {name} або масив рядків
        const regionNames = data.map(r => r.name || r).filter(r => r && r !== 'Україна');
        setRegions(regionNames);
      } else {
        // Fallback регіони
        setRegions(['Київський', 'Дніпровський', 'Львівський', 'Хмельницький']);
      }
    } catch (error) {
      console.error('Помилка завантаження регіонів:', error);
      // Fallback регіони
      setRegions(['Київський', 'Дніпровський', 'Львівський', 'Хмельницький']);
    }
  };

  const loadWarehouses = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/warehouses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setWarehouses(data);
      }
    } catch (error) {
      console.error('Помилка завантаження складів:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (warehouse = null) => {
    if (warehouse) {
      setEditingWarehouse(warehouse);
      setFormData({
        name: warehouse.name || '',
        region: warehouse.region || '',
        address: warehouse.address || ''
      });
    } else {
      setEditingWarehouse(null);
      setFormData({ name: '', region: '', address: '' });
    }
    setErrors([]);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingWarehouse(null);
    setFormData({ name: '', region: '', address: '' });
    setErrors([]);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);

    if (!formData.name.trim()) {
      setErrors(['Назва складу обов\'язкова']);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const url = editingWarehouse 
        ? `${API_BASE_URL}/warehouses/${editingWarehouse._id}`
        : `${API_BASE_URL}/warehouses`;
      
      const method = editingWarehouse ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        handleCloseModal();
        loadWarehouses();
      } else {
        const error = await response.json();
        setErrors([error.error || 'Помилка збереження']);
      }
    } catch (error) {
      console.error('Помилка збереження:', error);
      setErrors(['Помилка збереження складу']);
    }
  };

  const handleDelete = async (warehouseId) => {
    // Перевірка прав - тільки адміністратори можуть видаляти
    if (user?.role !== 'admin' && user?.role !== 'administrator') {
      alert('Тільки адміністратор може видаляти склади');
      return;
    }
    
    if (!window.confirm('Ви впевнені, що хочете видалити цей склад?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/warehouses/${warehouseId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        loadWarehouses();
      } else {
        const error = await response.json();
        alert(error.error || 'Помилка видалення складу');
      }
    } catch (error) {
      console.error('Помилка видалення:', error);
      alert('Помилка видалення складу');
    }
  };

  const openImportModal = () => {
    setImportModalOpen(true);
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
    setImportDryRun(true);
    setImportCategories([]);
    setCategoryListFilter('');
    setNomenclatureSelections({});
    setMappingSaveMsg(null);
    setImportModalStep(1);
    setImportTargetWarehouseId('');
  };

  const closeImportModal = () => {
    setImportModalOpen(false);
    setImportFile(null);
    setImportResult(null);
    setImportError(null);
    setImportLoading(false);
    setImportCategories([]);
    setCategoryListFilter('');
    setNomenclatureSelections({});
    setMappingSaveMsg(null);
    setImportModalStep(1);
    setImportTargetWarehouseId('');
  };

  const handleSaveNomenclatureMap = async () => {
    const map = {};
    Object.entries(nomenclatureSelections).forEach(([nome, id]) => {
      if (id && String(id).trim()) map[nome] = String(id).trim();
    });
    if (Object.keys(map).length === 0) {
      setMappingSaveMsg({ type: 'err', text: 'Оберіть категорію хоча б для одного рядка справа' });
      return;
    }
    setMappingSaveLoading(true);
    setMappingSaveMsg(null);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API_BASE_URL}/equipment/stock-import-nomenclature-map`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nomenclatureCategoryMap: map }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMappingSaveMsg({ type: 'err', text: data.error || `Помилка ${r.status}` });
        return;
      }
      setMappingSaveMsg({
        type: 'ok',
        text: `Збережено ${data.savedCount} відповідностей (діють для всіх складів). Поверніться до файлу та натисніть «Перевірити» знову або імпортуйте інший склад — ті самі назви вже підставлять категорію.`,
      });
    } catch (err) {
      setMappingSaveMsg({ type: 'err', text: err.message || 'Помилка мережі' });
    } finally {
      setMappingSaveLoading(false);
    }
  };

  const handleImportStock = async () => {
    if (!importFile) {
      setImportError('Оберіть файл .xlsx');
      return;
    }
    if (!importTargetWarehouseId || !String(importTargetWarehouseId).trim()) {
      setImportError('Оберіть склад для імпорту');
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportResult(null);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('file', importFile);
      fd.append('targetWarehouseId', String(importTargetWarehouseId).trim());
      const q = importDryRun ? '?dryRun=1' : '';
      const response = await fetch(`${API_BASE_URL}/equipment/import-stock-xlsx${q}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setImportError(data.error || `Помилка ${response.status}`);
        return;
      }
      setImportResult(data);
      if (Array.isArray(data.needsCategoryMapping) && data.needsCategoryMapping.length > 0) {
        setImportModalStep(2);
      } else {
        setImportModalStep(1);
      }
      if (!importDryRun) {
        loadWarehouses();
      }
    } catch (err) {
      console.error('Імпорт залишків:', err);
      setImportError(err.message || 'Помилка мережі');
    } finally {
      setImportLoading(false);
    }
  };

  const handleToggleActive = async (warehouse) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/warehouses/${warehouse._id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !warehouse.isActive })
      });

      if (response.ok) {
        loadWarehouses();
      }
    } catch (error) {
      console.error('Помилка оновлення:', error);
    }
  };

  return (
    <div className="warehouse-management">
      <div className="management-header">
        <h2>🏢 Управління складами</h2>
        <div className="management-header-actions">
          {isAdmin && (
            <button type="button" className="btn-import-stock" onClick={openImportModal}>
              📥 Імпорт залишків (1С / Excel)
            </button>
          )}
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            ➕ Додати склад
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Завантаження...</div>
      ) : warehouses.length === 0 ? (
        <div className="empty-state">
          <p>Складів не знайдено</p>
          <button className="btn-primary" onClick={() => handleOpenModal()}>
            Додати перший склад
          </button>
        </div>
      ) : (
        <div className="warehouses-grid">
          {warehouses.map(warehouse => (
            <div key={warehouse._id} className={`warehouse-card ${!warehouse.isActive ? 'inactive' : ''}`}>
              <div className="warehouse-card-header">
                <h3>{warehouse.name}</h3>
                <span className={`status-badge ${warehouse.isActive ? 'active' : 'inactive'}`}>
                  {warehouse.isActive ? 'Активний' : 'Неактивний'}
                </span>
              </div>

              <div className="warehouse-card-body">
                {warehouse.region && (
                  <div className="warehouse-info">
                    <span className="info-label">Регіон:</span>
                    <span className="info-value">{warehouse.region}</span>
                  </div>
                )}
                {warehouse.address && (
                  <div className="warehouse-info">
                    <span className="info-label">Адреса:</span>
                    <span className="info-value">{warehouse.address}</span>
                  </div>
                )}
                <div className="warehouse-info">
                  <span className="info-label">Створено:</span>
                  <span className="info-value">
                    {warehouse.createdAt ? new Date(warehouse.createdAt).toLocaleDateString('uk-UA') : '—'}
                  </span>
                </div>
              </div>

              <div className="warehouse-card-actions">
                <button
                  className="btn-action btn-edit"
                  onClick={() => handleOpenModal(warehouse)}
                >
                  ✏️ Редагувати
                </button>
                <button
                  className="btn-action btn-toggle"
                  onClick={() => handleToggleActive(warehouse)}
                >
                  {warehouse.isActive ? '🔒 Деактивувати' : '✅ Активувати'}
                </button>
                {(user?.role === 'admin' || user?.role === 'administrator') && (
                  <button
                    className="btn-action btn-delete"
                    onClick={() => handleDelete(warehouse._id)}
                  >
                    🗑️ Видалити
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {importModalOpen && (
        <div className="modal-overlay import-stock-overlay" onClick={closeImportModal}>
          <div className="modal-content import-stock-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {importModalStep === 2
                  ? '🔗 Зіставлення категорій'
                  : '📥 Імпорт залишків з Excel'}
              </h2>
              <button type="button" className="btn-close" onClick={closeImportModal}>✕</button>
            </div>

            {importModalStep === 1 && (
              <>
                <p className="import-hint">
                  Звіт 1С «Анализ доступности товаров на складах» (.xlsx). Спочатку оберіть{' '}
                  <strong>склад призначення</strong> — усі позиції з файлу потраплять саме туди (незалежно від
                  назви складу в Excel). Далі «Перевірити». Якщо не вистачає категорій — відкриється зіставлення;
                  правила категорій діють для <strong>усіх складів</strong> за однаковою назвою номенклатури.
                </p>
                <div className="import-warehouse-row">
                  <label htmlFor="import-target-warehouse">Склад для імпорту *</label>
                  <select
                    id="import-target-warehouse"
                    className="import-warehouse-select"
                    value={importTargetWarehouseId}
                    onChange={(e) => setImportTargetWarehouseId(e.target.value)}
                  >
                    <option value="">— оберіть склад —</option>
                    {[...warehouses]
                      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'))
                      .map((w) => (
                        <option key={w._id} value={w._id}>
                          {w.name}
                          {w.isActive === false ? ' (неактивний)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="import-file-row">
                  <input
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => {
                      setImportFile(e.target.files?.[0] || null);
                      setImportError(null);
                      setImportResult(null);
                      setImportModalStep(1);
                    }}
                  />
                </div>
                <label className="import-dry-run">
                  <input
                    type="checkbox"
                    checked={importDryRun}
                    onChange={(e) => setImportDryRun(e.target.checked)}
                  />
                  Лише перевірка (нічого не записувати в базу)
                </label>
                {importError && (
                  <div className="error-message import-err" style={{ marginBottom: 12 }}>{importError}</div>
                )}
                {importResult && (
                  <div className="import-result-box">
                    <div><strong>Результат</strong> {importResult.dryRun ? '(перевірка)' : '(імпорт)'}</div>
                    <div>
                      <strong>Склад призначення:</strong> {importResult.warehouseName || '—'}
                      {importResult.warehouseSource === 'ui' && (
                        <span className="import-warehouse-badge"> (обрано вами)</span>
                      )}
                    </div>
                    {importResult.fileWarehouse1c && (
                      <div className="import-file-warehouse-note">
                        Рядок складу в Excel: <code>{importResult.fileWarehouse1c}</code>
                      </div>
                    )}
                    <div>Створено: {importResult.created ?? '—'} · Оновлено: {importResult.updated ?? '—'} · Пропущено: {importResult.skipped ?? '—'}</div>
                    {Array.isArray(importResult.warnings) && importResult.warnings.length > 0 && (
                      <div className="import-warn" style={{ marginTop: 8 }}>
                        <strong>Попередження:</strong>
                        <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                          {importResult.warnings.slice(0, 20).map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                          {importResult.warnings.length > 20 && (
                            <li>… ще {importResult.warnings.length - 20}</li>
                          )}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
                      <div className="import-err" style={{ marginTop: 8 }}>
                        <strong>Помилки рядків:</strong>
                        <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                          {importResult.errors.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {importResult.details?.length > 0 && (
                      <pre style={{ marginTop: 10 }}>
                        {JSON.stringify(importResult.details.slice(0, 25), null, 2)}
                        {importResult.details.length > 25 ? `\n… ще ${importResult.details.length - 25} записів` : ''}
                      </pre>
                    )}
                  </div>
                )}
                {importResult &&
                  Array.isArray(importResult.needsCategoryMapping) &&
                  importResult.needsCategoryMapping.length > 0 && (
                    <div className="import-step-banner">
                      <span>
                        Є {importResult.needsCategoryMapping.length} поз. без категорії — відкрито крок зіставлення.
                        Якщо вікно не перемкнулось, натисніть кнопку.
                      </span>
                      <button type="button" className="btn-import-stock" onClick={() => setImportModalStep(2)}>
                        Відкрити зіставлення категорій
                      </button>
                    </div>
                  )}
                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="btn-secondary" onClick={closeImportModal}>
                    Закрити
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleImportStock}
                    disabled={importLoading}
                  >
                    {importLoading ? 'Завантаження…' : importDryRun ? 'Перевірити' : 'Імпортувати'}
                  </button>
                </div>
              </>
            )}

            {importModalStep === 2 && importResult?.needsCategoryMapping?.length > 0 && (
              <>
                <p className="import-global-rules-note">
                  Правила зберігаються в <code>nomenclatureCategoryMap</code> на сервері і діють для{' '}
                  <strong>будь-якого складу</strong>: якщо назва номенклатури в Excel збігається з рядком, який ви
                  зіставите тут, при імпорті з <strong>іншого складу</strong> категорія підставиться автоматично.
                </p>
                {importFile?.name && (
                  <p className="import-hint" style={{ marginTop: 0 }}>
                    Файл: <strong>{importFile.name}</strong> · імпорт на склад:{' '}
                    <strong>{importResult.warehouseName}</strong>
                    {importResult.fileWarehouse1c && (
                      <>
                        {' '}
                        (у файлі: <code>{importResult.fileWarehouse1c}</code>)
                      </>
                    )}
                  </p>
                )}
                <div className="import-category-split import-category-split--step2">
                  <div className="import-category-col">
                    <div className="import-category-col-head">Категорії проєкту</div>
                    <input
                      type="search"
                      className="import-category-search"
                      placeholder="Пошук за назвою або id…"
                      value={categoryListFilter}
                      onChange={(e) => setCategoryListFilter(e.target.value)}
                    />
                    <div className="import-category-col-scroll">
                      {filteredCategoryReference.length === 0 ? (
                        <div className="import-category-empty">Завантаження або нічого не знайдено</div>
                      ) : (
                        filteredCategoryReference.map((c) => (
                          <div key={c.id} className="import-category-ref-row" title={c.id}>
                            <span className="import-category-ref-name">{c.name}</span>
                            <span className="import-category-ref-meta">
                              {c.itemKind === 'parts' ? 'ЗІП' : 'Товар'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="import-category-col">
                    <div className="import-category-col-head">Не зіставлено з категорією (з файлу)</div>
                    <div className="import-category-col-scroll">
                      {importResult.needsCategoryMapping.map((row) => (
                        <div key={row.nome} className="import-unmatched-block">
                          <div className="import-unmatched-nome" title={row.nome}>
                            {row.nome}
                          </div>
                          {row.ruleHint && (
                            <div className="import-unmatched-hint">Підказка правила: {row.ruleHint}</div>
                          )}
                          <select
                            className="import-unmatched-select"
                            value={nomenclatureSelections[row.nome] ?? ''}
                            onChange={(e) =>
                              setNomenclatureSelections((prev) => ({
                                ...prev,
                                [row.nome]: e.target.value,
                              }))
                            }
                          >
                            <option value="">— оберіть категорію —</option>
                            {sortedImportCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.itemKind === 'parts' ? 'ЗІП' : 'Товар'})
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {mappingSaveMsg && (
                  <div
                    className={mappingSaveMsg.type === 'ok' ? 'import-map-msg ok' : 'import-map-msg err'}
                    role="status"
                  >
                    {mappingSaveMsg.text}
                  </div>
                )}
                <div className="modal-actions import-step2-actions">
                  <button type="button" className="btn-secondary" onClick={() => setImportModalStep(1)}>
                    ← Назад до файлу
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveNomenclatureMap}
                    disabled={mappingSaveLoading || sortedImportCategories.length === 0}
                  >
                    {mappingSaveLoading ? 'Збереження…' : 'Зберегти відповідності (усі склади)'}
                  </button>
                  <button type="button" className="btn-secondary" onClick={closeImportModal}>
                    Закрити
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingWarehouse ? '✏️ Редагувати склад' : '➕ Додати склад'}</h2>
              <button className="btn-close" onClick={handleCloseModal}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="warehouse-form">
              {errors.length > 0 && (
                <div className="errors">
                  {errors.map((err, i) => (
                    <div key={i} className="error-message">{err}</div>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label>Назва складу *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Назва складу"
                  required
                />
              </div>

              <div className="form-group">
                <label>Регіон</label>
                <select
                  value={formData.region}
                  onChange={(e) => handleInputChange('region', e.target.value)}
                >
                  <option value="">Виберіть регіон</option>
                  {regions.map(region => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Адреса</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="Адреса складу"
                  rows="3"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                  Скасувати
                </button>
                <button type="submit" className="btn-primary">
                  {editingWarehouse ? 'Зберегти' : 'Додати'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default WarehouseManagement;

