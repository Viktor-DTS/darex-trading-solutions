import React, { useState, useEffect, useCallback } from 'react';
import {
  searchTenders,
  saveTenderToWatchlist,
  getTenderMeta,
  getProzorroTender,
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

const DEFAULT_FILTERS = {
  q: '',
  region: '',
  category: '',
  minBudget: '',
  maxBudget: '',
  source: 'all',
  sortBy: 'score',
  recommendedOnly: false,
};

function scoreClass(score) {
  if (score >= 70) return 'tender-score--high';
  if (score >= 45) return 'tender-score--mid';
  return 'tender-score--low';
}

function TenderSearchTab({ onSaved }) {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [directLookup, setDirectLookup] = useState(false);

  useEffect(() => {
    getTenderMeta().then(setMeta).catch(() => {});
  }, []);

  const handleSelectTender = useCallback(async (tender) => {
    setSelected(tender);
    setDetailLoading(true);
    try {
      const full = await getProzorroTender(tender.prozorroId, tender.source || 'prozorro');
      setSelected({ ...tender, ...full, analysis: full.analysis || tender.analysis });
    } catch (e) {
      console.warn('Tender detail fetch failed', e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    setDirectLookup(false);
    try {
      const data = await searchTenders({
        q: filters.q.trim(),
        region: filters.region.trim(),
        category: filters.category,
        minBudget: filters.minBudget || undefined,
        maxBudget: filters.maxBudget || undefined,
        source: filters.source || 'all',
        sortBy: filters.sortBy || 'score',
        minScore: filters.recommendedOnly ? 70 : undefined,
        limit: 30,
      });
      const nextItems = data.items || [];
      setItems(nextItems);
      setDirectLookup(!!data.directLookup);
      if (nextItems.length > 0) {
        handleSelectTender(nextItems[0]);
      } else {
        setSelected(null);
      }
      if (data.warning) {
        setError(data.warning);
      } else if (nextItems.length === 0) {
        setError('За вашими критеріями тендерів не знайдено. Спробуйте інший запит, UA-номер або посилання.');
      } else {
        setError('');
      }
    } catch (e) {
      console.error(e);
      setItems([]);
      setSelected(null);
      setError(e.message || 'Майданчик тимчасово недоступний. Спробуйте через кілька хвилин.');
    } finally {
      setLoading(false);
    }
  }, [filters, handleSelectTender]);

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
      dg: 'дизель-генератор, дизельний генератор',
      service: 'техобслуговування генератор, технічного обслуговування дизель',
      mounting: 'монтаж генератор, пусконалагодження',
      ups: 'UPS, ДБЖ, безперебійне',
    };
    setFilters((p) => ({
      ...p,
      q: presets[preset] || '',
      category: preset,
      recommendedOnly: false,
    }));
  };

  return (
    <div className="tender-search-tab">
      <div className="tender-presets">
        <span className="tender-presets-label">Швидкий фільтр:</span>
        <button type="button" className="tender-preset-btn" onClick={() => applyNichePreset('dg')}>ДГ / ДЕС</button>
        <button type="button" className="tender-preset-btn" onClick={() => applyNichePreset('service')}>Сервіс / ТО</button>
        <button type="button" className="tender-preset-btn" onClick={() => applyNichePreset('mounting')}>Монтаж / ПНР</button>
        <button type="button" className="tender-preset-btn" onClick={() => applyNichePreset('ups')}>ДБЖ / UPS</button>
        <button type="button" className="tender-preset-btn tender-preset-btn--all" onClick={() => setFilters(DEFAULT_FILTERS)}>
          Скинути
        </button>
      </div>

      <div className="tender-toolbar">
        <input
          type="text"
          className="tender-input"
          placeholder="Пошук, UA-2026-..., посилання DZO/Prozorro"
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
        <select
          className="tender-select"
          value={filters.sortBy}
          onChange={(e) => setFilters((p) => ({ ...p, sortBy: e.target.value }))}
        >
          <option value="score">Сортування: score</option>
          <option value="deadline">Сортування: дедлайн</option>
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

      <div className="tender-toolbar tender-toolbar--secondary">
        <label className="tender-checkbox">
          <input
            type="checkbox"
            checked={filters.recommendedOnly}
            onChange={(e) => setFilters((p) => ({ ...p, recommendedOnly: e.target.checked }))}
          />
          <span>Тільки рекомендовані (score ≥ 70)</span>
        </label>
      </div>

      {meta?.defaultKeywords && (
        <p className="tender-hint">
          За замовчуванням шукаємо: {meta.defaultKeywords.slice(0, 6).join(', ')}… · Можна вставити UA-номер або URL тендера
        </p>
      )}

      {directLookup && !loading && items.length > 0 && (
        <div className="tender-alert tender-alert--info">Знайдено тендер за номером або посиланням</div>
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
                <li key={`${t.source || 'x'}-${t.prozorroId}`}>
                  <button
                    type="button"
                    className={`tender-list-item ${selected?.prozorroId === t.prozorroId && selected?.source === t.source ? 'active' : ''}`}
                    onClick={() => handleSelectTender(t)}
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
          {detailLoading && selected ? (
            <div className="tender-loading">Завантаження документів…</div>
          ) : selected ? (
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
