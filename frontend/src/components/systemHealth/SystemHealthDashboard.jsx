import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API_BASE_URL from '../../config';
import ExternalResourcesPanel from './ExternalResourcesPanel';
import ProjectAnalysisPanel from './ProjectAnalysisPanel';
import BillingPanel from './BillingPanel';
import RecommendationsPanel from './RecommendationsPanel';
import { Gauge } from './HealthCharts';
import { STATUS_COLORS, STATUS_LABELS, formatDateTime } from './healthFormat';
import './SystemHealthDashboard.css';

const SUB_TABS = [
  { id: 'external', label: '☁️ Зовнішні ресурси', hint: 'Render · MongoDB Atlas · Cloudinary' },
  { id: 'project', label: '🧩 Проєкт', hint: 'навантаження, вузькі місця, база даних' },
  { id: 'billing', label: '🧾 Рахунки та оплати', hint: 'журнал витрат по кожному ресурсу' },
  { id: 'recommendations', label: '💡 Рекомендації', hint: 'що робити прямо зараз' },
];

const PERIODS = [
  { id: 1, label: '1 год' },
  { id: 6, label: '6 год' },
  { id: 24, label: '24 год' },
  { id: 72, label: '3 дні' },
  { id: 168, label: '7 днів' },
];

const AUTO_REFRESH_MS = 60_000;

function BoardCard({ board, onClick, active }) {
  const color = STATUS_COLORS[board.status] || STATUS_COLORS.unknown;
  return (
    <button className={`sh-board sh-board-${board.status} ${active ? 'sh-board-active' : ''}`} onClick={onClick} type="button">
      <div className="sh-board-glow" style={{ background: color }} />
      <div className="sh-board-head">
        <div>
          <div className="sh-board-title">{board.title}</div>
          <div className="sh-board-subtitle">{board.subtitle}</div>
        </div>
        <span className="sh-board-status" style={{ color, borderColor: color }}>
          {STATUS_LABELS[board.status]}
        </span>
      </div>
      <div className="sh-board-body">
        <Gauge
          percent={board.primary?.percent}
          status={board.status}
          value={board.primary?.value ?? '—'}
          label={board.primary?.label}
          size={86}
          thickness={8}
        />
        <div className="sh-board-metrics">
          {(board.secondary || []).map((metric) => (
            <div className="sh-board-metric" key={metric.label}>
              <span>{metric.label}</span>
              <b style={metric.percent != null && metric.percent >= 85 ? { color: STATUS_COLORS.critical } : undefined}>
                {metric.value}
              </b>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

export default function SystemHealthDashboard() {
  const [activeTab, setActiveTab] = useState('external');
  const [hours, setHours] = useState(24);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef(null);

  const load = useCallback(
    async ({ force = false, silent = false } = {}) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `${API_BASE_URL}/system-health/overview?hours=${hours}${force ? '&refresh=1' : ''}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        setData(await response.json());
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [hours],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (!autoRefresh) return undefined;
    timerRef.current = setInterval(() => load({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, load]);

  const counts = data?.recommendations?.counts || {};
  const alertText = useMemo(() => {
    if (counts.critical) return { level: 'critical', text: `${counts.critical} критичних проблем потребують дії` };
    if (counts.warning) return { level: 'warning', text: `${counts.warning} попереджень: система працює, але з ризиком` };
    return { level: 'ok', text: 'Критичних проблем не виявлено' };
  }, [counts]);

  if (loading && !data) {
    return <div className="sh-loading">⏳ Збираємо метрики Render, MongoDB, Cloudinary та бекенду…</div>;
  }

  return (
    <div className="sh-root">
      <div className="sh-topbar">
        <div className={`sh-alert sh-alert-${alertText.level}`}>
          <span className="sh-alert-dot" />
          {alertText.text}
        </div>
        <div className="sh-topbar-controls">
          <div className="sh-period">
            {PERIODS.map((period) => (
              <button
                key={period.id}
                className={`sh-period-btn ${hours === period.id ? 'active' : ''}`}
                onClick={() => setHours(period.id)}
              >
                {period.label}
              </button>
            ))}
          </div>
          <label className="sh-auto">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            автооновлення
          </label>
          <span className="sh-updated">оновлено {formatDateTime(data?.generatedAt)}</span>
          <button className="sh-btn sh-btn-primary" onClick={() => load({ force: true })} disabled={refreshing}>
            {refreshing ? '⏳' : '⟳'} Оновити
          </button>
        </div>
      </div>

      {error && <div className="sh-message sh-message-error">Помилка завантаження: {error}</div>}
      {(data?.errors || []).map((item) => (
        <div className="sh-message sh-message-warning" key={item.scope}>
          {item.scope}: {item.error}
        </div>
      ))}

      <div className="sh-boards">
        {(data?.boards || []).map((board) => (
          <BoardCard
            key={board.key}
            board={board}
            active={
              (activeTab === 'project' && board.key === 'project') ||
              (activeTab === 'external' && board.key !== 'project')
            }
            onClick={() => setActiveTab(board.key === 'project' ? 'project' : 'external')}
          />
        ))}
      </div>

      {(counts.critical > 0 || counts.warning > 0) && activeTab !== 'recommendations' && (
        <RecommendationsPanel recommendations={data?.recommendations} compact />
      )}

      <div className="sh-subtabs">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            className={`sh-subtab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="sh-subtab-label">{tab.label}</span>
            <span className="sh-subtab-hint">{tab.hint}</span>
          </button>
        ))}
      </div>

      <div className="sh-body">
        {activeTab === 'external' && <ExternalResourcesPanel external={data?.external} />}
        {activeTab === 'project' && <ProjectAnalysisPanel project={data?.project} />}
        {activeTab === 'billing' && <BillingPanel external={data?.external} />}
        {activeTab === 'recommendations' && <RecommendationsPanel recommendations={data?.recommendations} />}
      </div>
    </div>
  );
}
