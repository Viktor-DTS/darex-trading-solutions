import React, { useState, useEffect, useCallback } from 'react';
import API_BASE_URL from '../../config';
import { authFetch } from '../../utils/authFetch';
import './BulkCreateProductCardsModal.css';

export default function BulkCreateProductCardsModal({ onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [limit, setLimit] = useState(15);
  const [importImages, setImportImages] = useState(true);
  const [linkAfter, setLinkAfter] = useState(true);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const token = localStorage.getItem('token');
      const res = await authFetch(`${API_BASE_URL}/equipment/bulk-create-product-cards?dryRun=1`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dryRun: true, limit: 50 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не вдалося завантажити попередній перегляд');
      setPreview(data);
    } catch (e) {
      setPreviewError(e.message || 'Помилка');
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const runBatch = async () => {
    setRunning(true);
    setResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await authFetch(`${API_BASE_URL}/equipment/bulk-create-product-cards`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          limit: Number(limit) || 15,
          importImages,
          linkAfter,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Помилка масового створення');
      setResult(data);
      if (onDone) onDone(data);
    } catch (e) {
      setResult({ error: e.message || 'Помилка' });
    } finally {
      setRunning(false);
    }
  };

  const pendingCount = preview?.pendingWithoutCard ?? 0;
  const nothingToDo = !previewLoading && pendingCount === 0;

  return (
    <div className="bulk-pc-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="bulk-pc-modal"
        role="dialog"
        aria-labelledby="bulk-pc-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bulk-pc-modal-header">
          <h2 id="bulk-pc-title">Масове створення карточок</h2>
          <button type="button" className="bulk-pc-close" onClick={onClose} aria-label="Закрити">
            ×
          </button>
        </div>

        <div className="bulk-pc-modal-body">
          <p className="bulk-pc-intro">
            Для кожної <strong>унікальної назви</strong> залишків без карточки система викличе асистент
            (GPT-4o mini + пошук), створить <strong>чернетку</strong> карточки та за бажанням прив’яже залишки.
            Обов’язково перевірте характеристики та фото після масового наповнення.
          </p>

          {previewLoading && <p className="bulk-pc-muted">Завантаження списку…</p>}
          {previewError && <p className="bulk-pc-error">{previewError}</p>}

          {preview && !previewLoading && (
            <div className="bulk-pc-stats">
              <div>
                <span className="bulk-pc-stat-label">Унікальних назв без карточки</span>
                <strong>{preview.pendingWithoutCard ?? 0}</strong>
              </div>
              <div>
                <span className="bulk-pc-stat-label">Уже є карточка в довіднику</span>
                <strong>{preview.skippedExistingCard ?? 0}</strong>
              </div>
              <div>
                <span className="bulk-pc-stat-label">Рядків без назви</span>
                <strong>{preview.emptyTypeRows ?? 0}</strong>
              </div>
            </div>
          )}

          {preview?.samples?.length > 0 && (
            <div className="bulk-pc-samples">
              <h3>Приклади (найбільші партії спочатку)</h3>
              <ul>
                {preview.samples.slice(0, 12).map((s) => (
                  <li key={s.type}>
                    <span className="bulk-pc-sample-name">{s.type}</span>
                    <span className="bulk-pc-sample-meta">
                      {s.equipmentCount} поз.
                      {s.manufacturer ? ` · ${s.manufacturer}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!nothingToDo && (
            <div className="bulk-pc-options">
              <label>
                Кількість за один запуск
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} disabled={running}>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <label className="bulk-pc-check">
                <input
                  type="checkbox"
                  checked={importImages}
                  onChange={(e) => setImportImages(e.target.checked)}
                  disabled={running}
                />
                Імпортувати перше фото з асистента (повільніше)
              </label>
              <label className="bulk-pc-check">
                <input
                  type="checkbox"
                  checked={linkAfter}
                  onChange={(e) => setLinkAfter(e.target.checked)}
                  disabled={running}
                />
                Після створення прив’язати залишки за назвою
              </label>
            </div>
          )}

          {result && !result.error && (
            <div className="bulk-pc-result">
              <h3>Результат</h3>
              <p>
                Створено: <strong>{result.created ?? 0}</strong>
                {' · '}
                Помилок: <strong>{result.failed ?? 0}</strong>
                {' · '}
                Залишилось: <strong>{result.remaining ?? 0}</strong>
              </p>
              {result.linkSummary && (
                <p className="bulk-pc-muted">
                  Прив’язано залишків: {result.linkSummary.linked ?? 0}
                </p>
              )}
              {result.items?.length > 0 && (
                <ul className="bulk-pc-result-list">
                  {result.items.map((it) => (
                    <li key={it.type} className={`bulk-pc-result-${it.status}`}>
                      <span>{it.type}</span>
                      <span>
                        {it.status === 'created' && `✓ ${it.specsCount} хар.`}
                        {it.status === 'failed' && `✗ ${it.error}`}
                        {it.status === 'skipped_existing' && 'пропущено (вже є)'}
                        {it.imageImported ? ' · фото' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {result?.error && <p className="bulk-pc-error">{result.error}</p>}

          {nothingToDo && !previewError && (
            <p className="bulk-pc-muted">Немає унікальних назв без карточки — спочатку перевірте «Прив’язати за назвою».</p>
          )}
        </div>

        <div className="bulk-pc-modal-footer">
          <button type="button" className="bulk-pc-btn secondary" onClick={onClose} disabled={running}>
            Закрити
          </button>
          {!nothingToDo && (
            <button
              type="button"
              className="bulk-pc-btn primary"
              onClick={runBatch}
              disabled={running || previewLoading}
            >
              {running
                ? 'Створення…'
                : result?.remaining > 0
                  ? `Створити наступні ${Math.min(Number(limit) || 15, result.remaining)}`
                  : `Створити до ${limit} карточок`}
            </button>
          )}
          {result?.remaining > 0 && !running && (
            <button type="button" className="bulk-pc-btn secondary" onClick={loadPreview} disabled={previewLoading}>
              Оновити список
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
