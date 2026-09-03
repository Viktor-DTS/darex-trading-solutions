import React, { useMemo, useState } from 'react';
import { STATUS_COLORS } from './healthFormat';

const SCOPE_LABELS = {
  render: 'Render',
  mongodb: 'MongoDB',
  cloudinary: 'Cloudinary',
  project: 'Проєкт',
};

const SEVERITY_LABELS = {
  critical: 'Критично',
  warning: 'Потребує уваги',
  info: 'Варто зробити',
  good: 'Усе гаразд',
};

const SEVERITY_ICONS = {
  critical: '🔴',
  warning: '🟡',
  info: '🔵',
  good: '🟢',
};

export default function RecommendationsPanel({ recommendations, compact = false }) {
  const [severityFilter, setSeverityFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');

  const items = recommendations?.items || [];
  const counts = recommendations?.counts || {};

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (severityFilter === 'all' || item.severity === severityFilter) &&
          (scopeFilter === 'all' || item.scope === scopeFilter),
      ),
    [items, severityFilter, scopeFilter],
  );

  const shown = compact ? visible.filter((item) => item.severity !== 'good').slice(0, 4) : visible;

  return (
    <div className={compact ? 'sh-reco-compact' : 'sh-section'}>
      {!compact && (
        <div className="sh-section-head">
          <h3>
            <span className="sh-dot" style={{ background: '#f472b6' }} /> Рекомендації системи
          </h3>
          <div className="sh-view-tabs">
            <button className={`sh-view-tab ${severityFilter === 'all' ? 'active' : ''}`} onClick={() => setSeverityFilter('all')}>
              Усі ({items.length})
            </button>
            {['critical', 'warning', 'info', 'good'].map((severity) =>
              counts[severity] ? (
                <button
                  key={severity}
                  className={`sh-view-tab ${severityFilter === severity ? 'active' : ''}`}
                  onClick={() => setSeverityFilter(severity)}
                >
                  {SEVERITY_ICONS[severity]} {SEVERITY_LABELS[severity]} ({counts[severity]})
                </button>
              ) : null,
            )}
          </div>
        </div>
      )}

      {!compact && (
        <div className="sh-view-tabs sh-view-tabs-sub">
          <button className={`sh-view-tab ${scopeFilter === 'all' ? 'active' : ''}`} onClick={() => setScopeFilter('all')}>
            Усі джерела
          </button>
          {Object.entries(SCOPE_LABELS).map(([key, label]) => (
            <button key={key} className={`sh-view-tab ${scopeFilter === key ? 'active' : ''}`} onClick={() => setScopeFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="sh-reco-list">
        {shown.map((item) => (
          <div className={`sh-reco sh-reco-${item.severity}`} key={item.id}>
            <div className="sh-reco-side" style={{ background: STATUS_COLORS[item.severity] }} />
            <div className="sh-reco-body">
              <div className="sh-reco-head">
                <span className="sh-reco-icon">{SEVERITY_ICONS[item.severity]}</span>
                <b className="sh-reco-title">{item.title}</b>
                <span className="sh-chip sh-chip-sm">{SCOPE_LABELS[item.scope] || item.scope}</span>
                {item.metric && (
                  <span className="sh-reco-metric" style={{ color: STATUS_COLORS[item.severity] }}>
                    {item.metric.label}: {item.metric.value}
                  </span>
                )}
              </div>
              <p className="sh-reco-detail">{item.detail}</p>
              {item.action && (
                <p className="sh-reco-action">
                  <span>➜</span> {item.action}
                </p>
              )}
              {item.link && (
                <a className="sh-link-btn sh-link-sm" href={item.link} target="_blank" rel="noreferrer">
                  Відкрити ↗
                </a>
              )}
            </div>
          </div>
        ))}
        {!shown.length && <div className="sh-muted sh-pad">Рекомендацій у цій категорії немає</div>}
      </div>
    </div>
  );
}
