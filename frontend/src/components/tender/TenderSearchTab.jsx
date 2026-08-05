import React, { useState, useEffect, useCallback } from 'react';
import {
  searchTenders,
  saveTenderToWatchlist,
  getTenderMeta,
} from '../../utils/tenderAPI';
import TenderDetailPanel from './TenderDetailPanel';
import './TenderDepartment.css';

const CATEGORY_OPTIONS = [
  { value: '', label: 'Усі категорії' },
  { value: 'dg', label: 'Дизель-генератори' },
  { value: 'service', label: 'Сервіс / ТО' },
  { value: 'mounting', label: 'Монтаж / ПНР' },
  { value: 'ups', label: 'ДБЖ / UPS' },
  { value: 'mixed', label: 'Комплексні' },
];

function scoreClass(score) {
  if (score >= 70) return 'tender-score--high';
  if (score >= 45) return 'tender-score--mid';
  return 'tender-score--low';
}

function TenderSearchTab({ onSaved }) {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({
    q: '',
    region: '',
    category: '',
    minBudget: '',
    maxBudget: '',
    source: 'all',
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTenderMeta().then(setMeta).catch(() => {});
  }, []);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await searchTenders({
        q: filters.q.trim(),
        region: filters.region.trim(),
        category: filters.category,
        minBudget: filters.minBudget || undefined,
        maxBudget: filters.maxBudget || undefined,
        source: filters.source || 'all',
        limit: 30,
      });
      setItems(data.items || []);
      if (data.warning) {
        setError(data.warning);
      } else if ((data.items || []).length === 0) {
        setError('За вашими критеріями тендерів не знайдено. Спробуйте інший запит або регіон.');
      } else {
        setError('');
      }
    } catch (e) {
      console.error(e);
      setItems([]);
      setError(e.message || 'Майданчик тимчасово недоступний. Спробуйте через кілька хвилин.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    runSearch();
  }, []);

  const handleSave = async (tender) => {
    setSaving(true);
    try {
      await saveTenderToWatchlist({
        prozorroId: tender.prozorroId,
        source: tender.source || 'prozorro',
        tender,
        analysis: tender.analysis,
      });
      onSaved?.();
      alert('Тендер додано до робочого списку');
    } catch (e) {
      if (e.message?.includes('409') || e.message?.includes('вже')) {
        alert('Цей тендер уже в робочому списку');
      } else {
        alert(e.message || 'Помилка збереження');
      }
    } finally {
      setSaving(false);
    }
  };

  const applyNichePreset = (preset) => {
    const presets = {
      dg: 'дизель генератор',
      service: 'техобслуговування генератор',
      mounting: 'монтаж генератор пусконалагодження',
      ups: 'UPS ДБЖ безперебійне',
    };
    setFilters((p) => ({ ...p, q: presets[preset] || '', category: preset === 'dg' ? 'dg' : p.category }));
  };

  return (
    <div className="tender-search-tab">
      <div className="tender-presets">
        <span className="tender-presets-label">Швидкий фільтр:</span>
        <button type="button" className="tender-preset-btn" onClick={() => applyNichePreset('dg')}>ДГ / ДЕС</button>
        <button type="button" className="tender-preset-btn" onClick={() => applyNichePreset('service')}>Сервіс / ТО</button>
        <button type="button" className="tender-preset-btn" onClick={() => applyNichePreset('mounting')}>Монтаж / ПНР</button>
        <button type="button" className="tender-preset-btn" onClick={() => applyNichePreset('ups')}>ДБЖ / UPS</button>
        <button type="button" className="tender-preset-btn tender-preset-btn--all" onClick={() => setFilters({ q: '', region: '', category: '', minBudget: '', maxBudget: '', source: 'all' })}>
          Скинути
        </button>
      </div>

      <div className="tender-toolbar">
        <input
          type="text"
          className="tender-input"
          placeholder="Пошук: генератор, монтаж, UPS..."
          value={filters.q}
          onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
        />
        <input
          type="text"
          className="tender-input tender-input--sm"
          placeholder="Регіон"
          value={filters.region}
          onChange={(e) => setFilters((p) => ({ ...p, region: e.target.value }))}
        />
        <select
          className="tender-select"
          value={filters.source}
          onChange={(e) => setFilters((p) => ({ ...p, source: e.target.value }))}
        >
          <option value="all">Усі майданчики</option>
          <option value="prozorro">Prozorro</option>
          <option value="dzo">DZO (dzo.com.ua)</option>
        </select>
        <select
          className="tender-select"
          value={filters.category}
          onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="number"
          className="tender-input tender-input--xs"
          placeholder="Бюджет від"
          value={filters.minBudget}
          onChange={(e) => setFilters((p) => ({ ...p, minBudget: e.target.value }))}
        />
        <input
          type="number"
          className="tender-input tender-input--xs"
          placeholder="Бюджет до"
          value={filters.maxBudget}
          onChange={(e) => setFilters((p) => ({ ...p, maxBudget: e.target.value }))}
        />
        <button type="button" className="tender-btn tender-btn-primary" onClick={runSearch} disabled={loading}>
          {loading ? 'Пошук...' : '🔍 Знайти тендери'}
        </button>
      </div>

      {meta?.defaultKeywords && (
        <p className="tender-hint">
          За замовчуванням шукаємо: {meta.defaultKeywords.slice(0, 6).join(', ')}…
        </p>
      )}

      {error && !loading && <div className="tender-alert">{error}</div>}

      <div className="tender-search-layout">
        <div className="tender-list-wrap">
          {loading ? (
            <div className="tender-loading">Завантаження тендерів...</div>
          ) : items.length === 0 ? (
            <div className="tender-empty">Немає результатів</div>
          ) : (
            <ul className="tender-list">
              {items.map((t) => (
                <li key={t.prozorroId}>
                  <button
                    type="button"
                    className={`tender-list-item ${selected?.prozorroId === t.prozorroId ? 'active' : ''}`}
                    onClick={() => setSelected(t)}
                  >
                    <div className="tender-list-item-top">
                      <span className={`tender-score ${scoreClass(t.analysis?.score)}`}>
                        {t.analysis?.score ?? '—'}
                      </span>
                      <span className="tender-list-status">{t.sourceLabel || t.statusLabel}</span>
                    </div>
                    <div className="tender-list-title">{t.title || 'Без назви'}</div>
                    <div className="tender-list-meta">
                      <span>{t.budgetFormatted}</span>
                      <span>{t.region || '—'}</span>
                      <span>{t.deadlineFormatted}</span>
                    </div>
                    {t.analysis?.categoryLabel && (
                      <span className="tender-tag">{t.analysis.categoryLabel}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tender-detail-wrap">
          {selected ? (
            <TenderDetailPanel
              tender={selected}
              analysis={selected.analysis}
              onSave={() => handleSave(selected)}
              saving={saving}
              mode="search"
            />
          ) : (
            <div className="tender-detail-placeholder">
              <p>Оберіть тендер зі списку для детального аналізу</p>
              <ul>
                <li>Предмет закупівлі та потужність</li>
                <li>Бюджет і дедлайн подачі</li>
                <li>Регіон / адреса поставки</li>
                <li>Необхідні документи</li>
                <li>Оцінка конкурентоспроможності</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TenderSearchTab;
