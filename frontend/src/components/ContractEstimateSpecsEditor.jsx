import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchEstimateContractSpecsList,
  fetchEstimateContractSpecById,
  saveEstimateContractSpec,
  createEstimateContractSpec,
  uploadEstimateTemplate,
  deleteEstimateTemplate,
  downloadDefaultEstimateTemplate,
  downloadEstimateTemplate,
} from '../utils/estimate/estimateSpecsAPI';
import { invalidateEstimateSpecsCache, loadEstimateSpecs } from '../utils/estimate/estimateSpecRegistry';
import './ContractEstimateSpecsEditor.css';

function canEditSpecs(role) {
  const r = String(role || '').toLowerCase();
  return ['admin', 'administrator', 'finance', 'buhgalteria', 'golovnkervserv'].includes(r);
}

function formatUpdatedAt(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('uk-UA');
  } catch {
    return String(value);
  }
}

function cloneSpec(spec) {
  return JSON.parse(JSON.stringify(spec));
}

function parsePriceInput(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function EstimateTemplatePanel({ spec, editable, onTemplateUpdated }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const hasCustom = !!String(spec?.estimateTemplateUrl || '').trim();

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !spec?.id) return;
    setUploading(true);
    try {
      const updated = await uploadEstimateTemplate(spec.id, file);
      invalidateEstimateSpecsCache();
      await loadEstimateSpecs(true);
      onTemplateUpdated(updated);
    } catch (err) {
      alert(err.message || 'Не вдалося завантажити шаблон');
    } finally {
      setUploading(false);
    }
  };

  const handleReset = async () => {
    if (!spec?.id) return;
    if (!window.confirm('Повернути типовий шаблон кошторису для цього контрагента?')) return;
    setUploading(true);
    try {
      const updated = await deleteEstimateTemplate(spec.id);
      invalidateEstimateSpecsCache();
      await loadEstimateSpecs(true);
      onTemplateUpdated(updated);
    } catch (err) {
      alert(err.message || 'Не вдалося скинути шаблон');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadCurrent = async () => {
    try {
      if (hasCustom) {
        await downloadEstimateTemplate(spec.estimateTemplateUrl, spec.estimateTemplateName || 'estimate-template.xlsx');
      } else {
        await downloadDefaultEstimateTemplate();
      }
    } catch (err) {
      alert(err.message || 'Не вдалося завантажити шаблон');
    }
  };

  return (
    <div className="ces-template-panel">
      <div className="ces-template-head">
        <div>
          <div className="ces-template-title">Шаблон Excel кошторису</div>
          <div className="ces-template-status">
            {hasCustom
              ? `Власний: ${spec.estimateTemplateName || 'шаблон.xlsx'}`
              : 'Типовий шаблон системи'}
          </div>
        </div>
        <div className="ces-template-actions">
          <button type="button" className="ces-back-btn" onClick={handleDownloadCurrent}>
            Завантажити
          </button>
          <button type="button" className="ces-back-btn" onClick={() => downloadDefaultEstimateTemplate().catch((err) => alert(err.message))}>
            Типовий шаблон
          </button>
          {editable && (
            <>
              <button
                type="button"
                className="ces-add-btn"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Завантаження…' : 'Завантажити .xlsx'}
              </button>
              {hasCustom && (
                <button type="button" className="ces-back-btn" disabled={uploading} onClick={handleReset}>
                  Скинути до типового
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <p className="ces-template-hint">
        Завантажте Excel-файл з оформленням кошторису для цього контрагента. Структура має відповідати типовому шаблону (рядки заголовків, таблиці робіт і матеріалів).
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        hidden
        onChange={handleUpload}
      />
    </div>
  );
}

function ContractEstimateSpecEditor({ spec, editable, saving, onChange, onSave, onBack, onTemplateUpdated }) {
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const next = {};
    (spec?.categories || []).forEach((cat) => { next[cat.id] = true; });
    setExpanded(next);
  }, [spec?.id]);

  const filterLower = filter.trim().toLowerCase();

  const filteredCategories = useMemo(() => {
    if (!filterLower) return spec?.categories || [];
    return (spec?.categories || [])
      .map((cat) => {
        const items = (cat.items || []).filter((item) => {
          const hay = `${item.code} ${item.label} ${cat.title}`.toLowerCase();
          const subHay = (item.subItems || []).some((sub) => `${sub.code} ${sub.label}`.toLowerCase().includes(filterLower));
          return hay.includes(filterLower) || subHay;
        });
        return items.length ? { ...cat, items } : null;
      })
      .filter(Boolean);
  }, [spec?.categories, filterLower]);

  const updateCategory = (catIndex, patch) => {
    onChange((prev) => {
      const next = cloneSpec(prev);
      next.categories[catIndex] = { ...next.categories[catIndex], ...patch };
      return next;
    });
  };

  const updateItem = (catIndex, itemIndex, patch) => {
    onChange((prev) => {
      const next = cloneSpec(prev);
      const items = [...(next.categories[catIndex].items || [])];
      items[itemIndex] = { ...items[itemIndex], ...patch };
      next.categories[catIndex] = { ...next.categories[catIndex], items };
      return next;
    });
  };

  const updateItemPrice = (catIndex, itemIndex, tierId, value) => {
    onChange((prev) => {
      const next = cloneSpec(prev);
      const item = { ...(next.categories[catIndex].items[itemIndex] || {}) };
      const prices = { ...(item.prices || {}), [tierId]: parsePriceInput(value) };
      item.prices = prices;
      const items = [...(next.categories[catIndex].items || [])];
      items[itemIndex] = item;
      next.categories[catIndex] = { ...next.categories[catIndex], items };
      return next;
    });
  };

  const updateSubItem = (catIndex, itemIndex, subIndex, patch) => {
    onChange((prev) => {
      const next = cloneSpec(prev);
      const item = { ...(next.categories[catIndex].items[itemIndex] || {}) };
      const subItems = [...(item.subItems || [])];
      subItems[subIndex] = { ...subItems[subIndex], ...patch };
      item.subItems = subItems;
      const items = [...(next.categories[catIndex].items || [])];
      items[itemIndex] = item;
      next.categories[catIndex] = { ...next.categories[catIndex], items };
      return next;
    });
  };

  if (!spec) return null;

  return (
    <div className="ces-editor">
      <div className="ces-editor-toolbar">
        <button type="button" className="ces-back-btn" onClick={onBack}>← До списку</button>
        <div className="ces-editor-title-block">
          <h2 className="ces-editor-title">{spec.clientName || spec.title}</h2>
          <div className="ces-editor-meta">
            ЄДРПОУ: {spec.edrpou} · Договір: {spec.contractNumber}
            {spec.updatedAt ? ` · Оновлено: ${formatUpdatedAt(spec.updatedAt)}${spec.updatedByLogin ? ` — ${spec.updatedByLogin}` : ''}` : ''}
          </div>
        </div>
        {editable && (
          <button type="button" className="ces-save-btn" onClick={onSave} disabled={saving}>
            {saving ? 'Збереження…' : 'Зберегти'}
          </button>
        )}
      </div>

      {!editable && (
        <div className="ces-readonly-banner">Режим перегляду — немає прав на редагування.</div>
      )}

      <EstimateTemplatePanel
        spec={spec}
        editable={editable}
        onTemplateUpdated={onTemplateUpdated}
      />

      <div className="ces-filter-row">
        <input
          type="search"
          className="ces-filter-input"
          placeholder="Пошук за кодом або текстом роботи…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="ces-categories">
        {filteredCategories.map((category) => {
          const catIndex = (spec.categories || []).findIndex((c) => c.id === category.id);
          return (
            <div key={category.id} className="ces-category">
              <button
                type="button"
                className="ces-category-title"
                onClick={() => setExpanded((prev) => ({ ...prev, [category.id]: !prev[category.id] }))}
              >
                {expanded[category.id] ? '▼' : '▶'} {category.title}
              </button>
              {expanded[category.id] && (
                <div className="ces-category-body">
                  {editable && (
                    <label className="ces-field ces-category-title-field">
                      <span>Назва категорії</span>
                      <input
                        type="text"
                        value={category.title || ''}
                        onChange={(e) => updateCategory(catIndex, { title: e.target.value })}
                      />
                    </label>
                  )}
                  {(category.items || []).map((item, itemIndex) => (
                    <div key={item.id || `${category.id}-${itemIndex}`} className="ces-item-card">
                      <div className="ces-item-head">
                        <span className="ces-item-code">{item.code}</span>
                        <label className="ces-unavailable">
                          <input
                            type="checkbox"
                            checked={!!item.prices?.unavailable}
                            disabled={!editable}
                            onChange={(e) => updateItem(catIndex, itemIndex, {
                              prices: { ...(item.prices || {}), unavailable: e.target.checked },
                            })}
                          />
                          Не надається
                        </label>
                      </div>
                      <label className="ces-field">
                        <span>Текст роботи</span>
                        <textarea
                          rows={3}
                          value={item.label || ''}
                          readOnly={!editable}
                          onChange={(e) => updateItem(catIndex, itemIndex, { label: e.target.value })}
                        />
                      </label>
                      <div className="ces-prices-row">
                        {(spec.powerTiers || []).map((tier) => (
                          <label key={tier.id} className="ces-field ces-price-field">
                            <span>{tier.label}</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.prices?.[tier.id] ?? ''}
                              readOnly={!editable || item.prices?.unavailable}
                              onChange={(e) => updateItemPrice(catIndex, itemIndex, tier.id, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                      {(item.subItems || []).length > 0 && (
                        <div className="ces-subitems">
                          <div className="ces-subitems-title">Підпункти</div>
                          {(item.subItems || []).map((sub, subIndex) => (
                            <div key={sub.code || subIndex} className="ces-subitem">
                              <span className="ces-item-code">{sub.code}</span>
                              <textarea
                                rows={2}
                                value={sub.label || ''}
                                readOnly={!editable}
                                onChange={(e) => updateSubItem(catIndex, itemIndex, subIndex, { label: e.target.value })}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreateSpecModal({ open, onClose, existingSpecs, onCreated }) {
  const [clientName, setClientName] = useState('');
  const [edrpou, setEdrpou] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [sourceSpecId, setSourceSpecId] = useState('');
  const [copyTemplate, setCopyTemplate] = useState(true);
  const [templateFile, setTemplateFile] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClientName('');
    setEdrpou('');
    setContractNumber('');
    setSourceSpecId(existingSpecs[0]?.id || '');
    setCopyTemplate(true);
    setTemplateFile(null);
  }, [open, existingSpecs]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await createEstimateContractSpec({
        clientName: clientName.trim(),
        edrpou: edrpou.trim(),
        contractNumber: contractNumber.trim(),
        sourceSpecId: sourceSpecId || undefined,
        copyTemplate: sourceSpecId ? copyTemplate : false,
      });
      let result = created;
      if (templateFile) {
        result = await uploadEstimateTemplate(created.id, templateFile);
      }
      onCreated(result);
      onClose();
    } catch (err) {
      alert(err.message || 'Не вдалося створити специфікацію');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="ces-modal-overlay" onClick={onClose}>
      <div className="ces-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ces-modal-header">
          <h3>Нова специфікація</h3>
          <button type="button" className="ces-modal-close" onClick={onClose} aria-label="Закрити">×</button>
        </div>
        <form className="ces-modal-body" onSubmit={handleSubmit}>
          <label className="ces-field">
            <span>Контрагент *</span>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Наприклад: ТОВ «Компанія»"
              required
              autoFocus
            />
          </label>
          <label className="ces-field">
            <span>ЄДРПОУ *</span>
            <input
              type="text"
              inputMode="numeric"
              value={edrpou}
              onChange={(e) => setEdrpou(e.target.value.replace(/\D/g, ''))}
              placeholder="8 цифр"
              required
              maxLength={10}
            />
          </label>
          <label className="ces-field">
            <span>Номер договору *</span>
            <input
              type="text"
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
              placeholder="Наприклад: П-0123456"
              required
            />
          </label>
          <label className="ces-field">
            <span>Скопіювати позиції з</span>
            <select
              value={sourceSpecId}
              onChange={(e) => setSourceSpecId(e.target.value)}
            >
              <option value="">Порожній шаблон (1 категорія)</option>
              {existingSpecs.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  {spec.clientName || spec.title} — {spec.contractNumber} ({spec.itemCount ?? 0} поз.)
                </option>
              ))}
            </select>
          </label>
          {sourceSpecId && (
            <label className="ces-unavailable ces-copy-template-check">
              <input
                type="checkbox"
                checked={copyTemplate}
                onChange={(e) => setCopyTemplate(e.target.checked)}
              />
              Також скопіювати Excel-шаблон кошторису
            </label>
          )}
          <label className="ces-field">
            <span>Шаблон Excel (необов&apos;язково)</span>
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
            />
          </label>
          <p className="ces-modal-hint">
            Можна завантажити власний шаблон одразу або пізніше в редакторі.{' '}
            <button
              type="button"
              className="ces-link-btn"
              onClick={() => downloadDefaultEstimateTemplate().catch((err) => alert(err.message))}
            >
              Завантажити типовий шаблон
            </button>
            {' '}для редагування в Excel.
          </p>
          <p className="ces-modal-hint">
            Після створення відкриється редактор — там можна змінити тексти робіт та ціни.
          </p>
          <div className="ces-modal-footer">
            <button type="button" className="ces-back-btn" onClick={onClose} disabled={creating}>
              Скасувати
            </button>
            <button type="submit" className="ces-save-btn" disabled={creating}>
              {creating ? 'Створення…' : 'Створити'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ContractEstimateSpecsEditor({ user }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const editable = canEditSpecs(user?.role);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const specs = await fetchEstimateContractSpecsList();
      setList(specs);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Не вдалося завантажити специфікації');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openSpec = async (id) => {
    try {
      setLoading(true);
      const spec = await fetchEstimateContractSpecById(id);
      setDraft(cloneSpec(spec));
      setSelectedId(id);
    } catch (e) {
      alert(e.message || 'Не вдалося відкрити специфікацію');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!draft || !editable) return;
    setSaving(true);
    try {
      const saved = await saveEstimateContractSpec(draft.id, draft);
      invalidateEstimateSpecsCache();
      await loadEstimateSpecs(true);
      setDraft(cloneSpec(saved));
      await loadList();
      alert('Специфікацію збережено. Кошторис використовуватиме оновлені тексти та ціни.');
    } catch (e) {
      alert(e.message || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setSelectedId('');
    setDraft(null);
  };

  const handleCreated = async (created) => {
    invalidateEstimateSpecsCache();
    await loadEstimateSpecs(true);
    await loadList();
    setDraft(cloneSpec(created));
    setSelectedId(created.id);
  };

  const handleTemplateUpdated = async (updated) => {
    setDraft(cloneSpec(updated));
    await loadList();
  };

  if (selectedId && draft) {
    return (
      <ContractEstimateSpecEditor
        spec={draft}
        editable={editable}
        saving={saving}
        onChange={setDraft}
        onSave={handleSave}
        onBack={handleBack}
        onTemplateUpdated={handleTemplateUpdated}
      />
    );
  }

  return (
    <div className="ces-list-wrap">
      <div className="ces-list-header">
        <p className="ces-list-desc">
          Специфікації робіт для автоматичного формування кошторису. Натисніть рядок, щоб редагувати текст та ціни.
        </p>
        {editable && (
          <button
            type="button"
            className="ces-add-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + Додати специфікацію
          </button>
        )}
      </div>
      {loading ? (
        <div className="ces-loading">Завантаження…</div>
      ) : (
        <div className="ces-table-wrap">
          <table className="ces-table">
            <thead>
              <tr>
                <th>Контрагент</th>
                <th>ЄДРПОУ</th>
                <th>Номер договору</th>
                <th>Позицій</th>
                <th>Шаблон Excel</th>
                <th>Оновлено</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="ces-empty">Специфікацій поки немає</td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr
                    key={row.id}
                    className="ces-table-row-clickable"
                    onClick={() => openSpec(row.id)}
                  >
                    <td>{row.clientName || row.title || '—'}</td>
                    <td>{row.edrpou || '—'}</td>
                    <td>{row.contractNumber || '—'}</td>
                    <td>{row.itemCount ?? '—'}</td>
                    <td>{row.hasCustomTemplate ? 'Власний' : 'Типовий'}</td>
                    <td>{formatUpdatedAt(row.updatedAt) || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <CreateSpecModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        existingSpecs={list}
        onCreated={handleCreated}
      />
    </div>
  );
}

export default ContractEstimateSpecsEditor;
