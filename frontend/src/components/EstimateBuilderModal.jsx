import React, { useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import { getSpecItemPrice } from '../utils/estimate/estimateSpecRegistry';
import {
  buildLowerTableLinesFromTask,
  buildWorkLineFromSpec,
  createEstimateLine,
  getEstimateFileName,
  recalcLine,
} from '../utils/estimate/estimatePrefill';
import { fetchActiveWarehouses, resolveRegionBaseWarehouse } from '../utils/estimate/regionBaseAddress';
import { buildTaskPatchFromEstimate, buildValidation } from '../utils/estimate/estimateValidation';
import {
  buildTransportDistanceCheck,
  buildTransportDistancePatch,
  fetchDrivingDistanceKm,
  getTransportLine,
} from '../utils/estimate/estimateTransportDistance';
import { generateEstimateExcel } from '../utils/estimate/generateEstimateExcel';
import './EstimateBuilderModal.css';

function EstimateBuilderModal({
  open,
  onClose,
  task,
  spec,
  calculations,
  taskId,
  existingFiles = [],
  onTaskUpdated,
  onFilesChanged,
}) {
  const [powerTier, setPowerTier] = useState('');
  const [selectedSpecIds, setSelectedSpecIds] = useState([]);
  const [workLines, setWorkLines] = useState([]);
  const [lowerLines, setLowerLines] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [warehouses, setWarehouses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [distanceState, setDistanceState] = useState({
    loading: false,
    error: '',
    oneWayKm: null,
  });

  useEffect(() => {
    if (!open) return;
    setPowerTier('');
    setSelectedSpecIds([]);
    setWorkLines([]);
    setLowerLines(buildLowerTableLinesFromTask(task, spec));
    const expanded = {};
    (spec?.categories || []).forEach((cat) => { expanded[cat.id] = true; });
    setExpandedCategories(expanded);
    setError('');
    setWarehouses([]);
    setDistanceState({ loading: false, error: '', oneWayKm: null });
    fetchActiveWarehouses()
      .then((list) => setWarehouses(Array.isArray(list) ? list : []))
      .catch(() => setWarehouses([]));
  }, [open, task, spec]);

  useEffect(() => {
    if (!open || !warehouses.length) return;
    setLowerLines((prev) => {
      const fresh = buildLowerTableLinesFromTask(task, spec, warehouses);
      const transportPrev = prev.find((line) => line.id === 'transport' || line.source === 'task-transport');
      if (!transportPrev) return fresh;
      return fresh.map((line) => {
        if (line.id !== 'transport' && line.source !== 'task-transport') return line;
        return { ...line, name: transportPrev.name || line.name };
      });
    });
  }, [open, warehouses, task, spec]);

  const regionBase = useMemo(
    () => resolveRegionBaseWarehouse(task?.serviceRegion, warehouses),
    [task?.serviceRegion, warehouses]
  );

  const regionBaseAddress = regionBase?.address || '';

  const validation = useMemo(
    () => buildValidation(task, workLines, lowerLines, calculations),
    [task, workLines, lowerLines, calculations]
  );

  const transportLine = useMemo(() => getTransportLine(lowerLines), [lowerLines]);

  const distanceCheck = useMemo(() => {
    if (distanceState.oneWayKm == null) return null;
    return buildTransportDistanceCheck({
      oneWayKm: distanceState.oneWayKm,
      transportKm: transportLine?.quantity,
    });
  }, [distanceState.oneWayKm, transportLine?.quantity]);

  useEffect(() => {
    if (!open) return undefined;

    const origin = regionBaseAddress;
    const destination = String(task?.address || '').trim();
    if (!origin || !destination || !transportLine) {
      setDistanceState({ loading: false, error: '', oneWayKm: null });
      return undefined;
    }

    let cancelled = false;
    setDistanceState({ loading: true, error: '', oneWayKm: null });

    fetchDrivingDistanceKm(origin, destination)
      .then((oneWayKm) => {
        if (!cancelled) {
          setDistanceState({ loading: false, error: '', oneWayKm });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDistanceState({
            loading: false,
            error: err.message || 'Не вдалося розрахувати відстань',
            oneWayKm: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, regionBaseAddress, task?.address, transportLine?.id]);

  const selectableItems = useMemo(() => {
    return (spec?.categories || []).flatMap((category) =>
      (category.items || [])
        .filter((item) => !item.includedInPackage && !item.prices?.unavailable)
        .map((item) => ({ category, item }))
    );
  }, [spec]);

  useEffect(() => {
    if (!powerTier) {
      setWorkLines([]);
      return;
    }
    const selected = selectableItems.filter(({ item }) => selectedSpecIds.includes(item.id));
    setWorkLines(
      selected
        .map(({ category, item }) => buildWorkLineFromSpec(category, item, powerTier))
        .filter(Boolean)
    );
  }, [powerTier, selectedSpecIds, selectableItems]);

  const toggleSpecItem = (itemId) => {
    setSelectedSpecIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const updateWorkLine = (id, patch) => {
    setWorkLines((prev) => prev.map((line) => (line.id === id ? recalcLine({ ...line, ...patch }) : line)));
  };

  const updateLowerLine = (id, patch) => {
    setLowerLines((prev) => prev.map((line) => (line.id === id ? recalcLine({ ...line, ...patch }) : line)));
  };

  const removeLowerLine = (id) => {
    setLowerLines((prev) => prev.filter((line) => line.id !== id));
  };

  const addManualWorkLine = () => {
    setWorkLines((prev) => [...prev, createEstimateLine({ name: '', source: 'manual' })]);
  };

  const addManualLowerLine = () => {
    setLowerLines((prev) => [...prev, createEstimateLine({ name: '', unit: 'шт', source: 'manual-lower' })]);
  };

  const removeWorkLine = (id) => {
    setWorkLines((prev) => prev.filter((line) => line.id !== id));
    const specItem = selectableItems.find(({ item }) => item.id === id);
    if (specItem) setSelectedSpecIds((prev) => prev.filter((x) => x !== id));
  };

  const syncTaskFields = async (extraPatch = {}) => {
    const token = localStorage.getItem('token');
    const patch = { ...buildTaskPatchFromEstimate(workLines, lowerLines, validation), ...extraPatch };
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error('Не вдалося оновити заявку');
    const updated = await response.json();
    if (onTaskUpdated) onTaskUpdated({ ...task, ...patch, ...updated });
    return patch;
  };

  const deleteExistingGeneratedFile = async () => {
    const token = localStorage.getItem('token');
    const targetName = getEstimateFileName(task.requestNumber).toLowerCase();
    const existing = (existingFiles || []).filter((file) => {
      const name = String(file.originalName || '').toLowerCase();
      return name === targetName || name.startsWith('сформований кошторис');
    });
    for (const file of existing) {
      const fileId = file.id || file._id;
      if (!fileId) continue;
      await fetch(`${API_BASE_URL}/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  };

  const uploadGeneratedFile = async (blob) => {
    const token = localStorage.getItem('token');
    const fileName = getEstimateFileName(task.requestNumber);
    const formData = new FormData();
    formData.append('files', new File([blob], fileName, { type: blob.type }));
    formData.append('description', 'Автоматично сформований кошторис');
    const response = await fetch(`${API_BASE_URL}/files/upload/${taskId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || data.details || 'Не вдалося зберегти файл кошторису');
    }
    return response.json();
  };

  const applyGoogleTransportKm = () => {
    if (!transportLine || !distanceCheck || distanceCheck.ok) return;
    const patch = buildTransportDistancePatch(transportLine, distanceCheck.expectedKm);
    updateLowerLine(transportLine.id, patch);
    if (onTaskUpdated) {
      onTaskUpdated({
        transportKm: patch.quantity,
        transportSum: patch.total,
      });
    }
  };

  const handleGenerate = async ({ syncTask = false } = {}) => {
    if (!powerTier) {
      setError('Оберіть потужність генератора');
      return;
    }
    if (workLines.length === 0) {
      setError('Додайте хоча б один рядок робіт');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (syncTask) await syncTaskFields();
      await deleteExistingGeneratedFile();
      const blob = await generateEstimateExcel({ task, workLines, lowerLines });
      await uploadGeneratedFile(blob);
      if (onFilesChanged) await onFilesChanged();
      alert('Кошторис збережено у «Файли виконаних робіт».');
      onClose?.({ success: true });
    } catch (e) {
      setError(e.message || 'Помилка формування кошторису');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="estimate-builder-overlay" onClick={() => !busy && onClose?.()}>
      <div className="estimate-builder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="estimate-builder-header">
          <h3>Сформувати кошторис</h3>
          <button type="button" className="estimate-builder-close" onClick={() => onClose?.()} disabled={busy}>×</button>
        </div>

        <div className="estimate-builder-body">
          <div className="estimate-section">
            <h4>Потужність генератора *</h4>
            <div className="estimate-power-options">
              {(spec?.powerTiers || []).map((tier) => (
                <label key={tier.id} className={`estimate-power-option ${powerTier === tier.id ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={powerTier === tier.id}
                    onChange={() => setPowerTier(tier.id)}
                  />
                  {tier.label}
                </label>
              ))}
            </div>
          </div>

          <div className="estimate-section">
            <h4>Роботи зі специфікації договору</h4>
            <div className="estimate-spec-list">
              {(spec?.categories || []).map((category) => (
                <div key={category.id} className="estimate-spec-category">
                  <button
                    type="button"
                    className="estimate-spec-category-title"
                    onClick={() => setExpandedCategories((prev) => ({ ...prev, [category.id]: !prev[category.id] }))}
                  >
                    {expandedCategories[category.id] ? '▼' : '▶'} {category.title}
                  </button>
                  {expandedCategories[category.id] && (
                    <div className="estimate-spec-items">
                      {(category.items || [])
                        .filter((item) => !item.includedInPackage)
                        .map((item) => {
                        const unavailable = item.prices?.unavailable;
                        const price = powerTier ? getSpecItemPrice(item, powerTier) : null;
                        return (
                          <div key={item.id} className={`estimate-spec-item-wrap ${unavailable ? 'disabled' : ''}`}>
                            <label className="estimate-spec-item">
                              <input
                                type="checkbox"
                                disabled={unavailable || !powerTier}
                                checked={selectedSpecIds.includes(item.id)}
                                onChange={() => toggleSpecItem(item.id)}
                              />
                              <span className="estimate-spec-item-text">
                                <strong>{item.code}</strong> {item.label}
                                {unavailable ? ' — не надається' : powerTier && price != null ? ` — ${price} грн` : ''}
                              </span>
                            </label>
                            {item.subItems?.length > 0 && (
                              <ul className="estimate-spec-subitems">
                                {item.subItems.map((sub) => (
                                  <li key={sub.code}>
                                    <strong>{sub.code}</strong> {sub.label}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="estimate-section">
            <div className="estimate-section-head">
              <h4>1. Виконані роботи</h4>
              <button type="button" className="estimate-mini-btn" onClick={addManualWorkLine}>+ Додати рядок</button>
            </div>
            <EstimateLinesEditor lines={workLines} onChange={updateWorkLine} onRemove={removeWorkLine} />
            <div className="estimate-subtotal">Разом роботи: <strong>{validation.worksTotal.toFixed(2)} грн</strong></div>
          </div>

          <div className="estimate-section">
            <div className="estimate-section-head">
              <h4>Матеріали, транспорт та витрати</h4>
              <button type="button" className="estimate-mini-btn" onClick={addManualLowerLine}>+ Додати рядок</button>
            </div>
            {regionBaseAddress && (
              <div className="estimate-region-base-hint">
                База регіону ({task?.serviceRegion || '—'})
                {regionBase?.name ? `: ${regionBase.name}` : ''}
                {regionBase?.source === 'fallback' ? ' (автовибір — призначте базу в адмінці)' : ''}
                {' — '}{regionBaseAddress}
              </div>
            )}
            <EstimateLinesEditor lines={lowerLines} onChange={updateLowerLine} onRemove={removeLowerLine} />
            <div className="estimate-subtotal">Разом нижня таблиця: <strong>{validation.lowerTotal.toFixed(2)} грн</strong></div>
          </div>

          <div className={`estimate-validation ${validation.ok ? 'ok' : 'warn'}`}>
            <div>Перевірка «Вартість робіт»: {validation.worksTotal.toFixed(2)} / {validation.expectedWorkPrice.toFixed(2)} грн {validation.workOk ? '✅' : `⚠️ (${validation.workDiff > 0 ? '+' : ''}${validation.workDiff.toFixed(2)})`}</div>
            <div>Перевірка «Загальна сума послуги»: {validation.grandTotal.toFixed(2)} / {validation.expectedServiceTotal.toFixed(2)} грн {validation.totalOk ? '✅' : `⚠️ (${validation.totalDiff > 0 ? '+' : ''}${validation.totalDiff.toFixed(2)})`}</div>
            {transportLine && distanceState.loading && (
              <div className="estimate-validation-distance">Перевірка «Транспорт, км»: розрахунок маршруту Google Maps...</div>
            )}
            {transportLine && !distanceState.loading && distanceState.error && (
              <div className="estimate-validation-distance">Перевірка «Транспорт, км»: {distanceState.error}</div>
            )}
            {transportLine && distanceCheck && !distanceState.loading && !distanceState.error && (
              <div className={`estimate-validation-distance ${distanceCheck.ok ? 'ok' : 'warn'}`}>
                Перевірка «Транспорт, км»: {distanceCheck.actualKm} / {distanceCheck.expectedKm} км
                {distanceCheck.ok
                  ? ' ✅'
                  : ` ⚠️ (${distanceCheck.diff > 0 ? '+' : ''}${distanceCheck.diff}; маршрут Google Maps ${distanceCheck.expectedKm} км)`}
                {!distanceCheck.ok && (
                  <div className="estimate-distance-actions">
                    <button
                      type="button"
                      className="estimate-mini-btn estimate-distance-apply-btn"
                      onClick={applyGoogleTransportKm}
                      disabled={busy}
                    >
                      Застосувати {distanceCheck.expectedKm} км у заявку
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div className="estimate-error">{error}</div>}
        </div>

        <div className="estimate-builder-footer">
          <button type="button" className="btn-secondary" onClick={() => onClose?.()} disabled={busy}>Скасувати</button>
          {!validation.ok && (
            <button type="button" className="btn-secondary" onClick={() => handleGenerate({ syncTask: true })} disabled={busy || !powerTier}>
              Погодити та виправити заявку
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleGenerate({ syncTask: !validation.ok ? false : false })}
            disabled={busy || !powerTier}
            title={validation.ok ? 'Сформувати кошторис' : 'Сформувати без змін заявки'}
          >
            {busy ? 'Формування...' : validation.ok ? 'Сформувати та зберегти' : 'Сформувати без змін заявки'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EstimateLinesEditor({ lines, onChange, onRemove }) {
  if (!lines.length) return <div className="estimate-empty">Рядків поки немає</div>;
  return (
    <div className="estimate-lines-table-wrap">
      <table className="estimate-lines-table">
        <thead>
          <tr>
            <th>Найменування</th>
            <th>К-ть</th>
            <th>Од.</th>
            <th>Ціна</th>
            <th>Сума</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>
                <input
                  type="text"
                  value={line.name}
                  onChange={(e) => onChange(line.id, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.quantity}
                  onChange={(e) => onChange(line.id, { quantity: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={line.unit}
                  onChange={(e) => onChange(line.id, { unit: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.unitPrice}
                  onChange={(e) => onChange(line.id, { unitPrice: e.target.value })}
                />
              </td>
              <td>{Number(line.total || 0).toFixed(2)}</td>
              <td>
                <button type="button" className="estimate-remove-btn" onClick={() => onRemove(line.id)} title="Видалити">🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default EstimateBuilderModal;
