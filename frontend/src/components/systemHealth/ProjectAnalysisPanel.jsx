import React, { useState } from 'react';
import { TrafficChart, RankBar, Gauge } from './HealthCharts';
import {
  formatBytes,
  formatNumber,
  formatMs,
  formatPercent,
  formatDateTime,
  formatDuration,
  latencyStatus,
  percentStatus,
  STATUS_COLORS,
} from './healthFormat';

function Kpi({ label, value, hint, status = 'ok' }) {
  return (
    <div className={`sh-kpi sh-kpi-${status}`}>
      <span className="sh-kpi-label">{label}</span>
      <span className="sh-kpi-value">{value}</span>
      {hint && <span className="sh-kpi-hint">{hint}</span>}
    </div>
  );
}

function RouteTable({ rows, columns, emptyText, barKey, barColor = '#60a5fa' }) {
  if (!rows?.length) return <div className="sh-muted sh-pad">{emptyText}</div>;
  const maxBar = barKey ? Math.max(...rows.map((row) => Number(row[barKey]) || 0), 1) : 1;
  return (
    <table className="sh-table sh-table-routes">
      <thead>
        <tr>
          <th>Маршрут</th>
          {columns.map((column) => (
            <th key={column.key}>{column.label}</th>
          ))}
          {barKey && <th className="sh-col-bar">Вага</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td className="sh-mono sh-route-cell">
              <span className={`sh-method sh-method-${row.method?.toLowerCase()}`}>{row.method}</span>
              {row.path}
            </td>
            {columns.map((column) => (
              <td key={column.key} style={column.color ? { color: column.color(row) } : undefined}>
                {column.render(row)}
              </td>
            ))}
            {barKey && (
              <td className="sh-col-bar">
                <RankBar percent={((Number(row[barKey]) || 0) / maxBar) * 100} color={barColor} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ROUTE_VIEWS = [
  {
    id: 'hot',
    label: '🔥 Найдорожчі',
    hint: 'Маршрути, що з’їдають найбільше сумарного часу процесора. Оптимізація верхніх трьох дає найбільший приріст швидкості.',
    barKey: 'totalTimeMs',
    barColor: '#f59e0b',
    columns: [
      { key: 'count', label: 'Викликів', render: (r) => formatNumber(r.count) },
      { key: 'avgMs', label: 'Середня', render: (r) => formatMs(r.avgMs) },
      { key: 'p95Ms', label: 'p95', render: (r) => formatMs(r.p95Ms), color: (r) => STATUS_COLORS[latencyStatus(r.p95Ms)] },
      { key: 'totalTimeMs', label: 'Разом', render: (r) => `${(r.totalTimeMs / 1000).toFixed(1)} с` },
      { key: 'share', label: 'Частка', render: (r) => `${r.share}%` },
    ],
  },
  {
    id: 'slow',
    label: '🐢 Найповільніші',
    hint: 'Сортування за p95: саме ці запити користувач відчуває як «зависання».',
    barKey: 'p95Ms',
    barColor: '#ef4444',
    columns: [
      { key: 'count', label: 'Викликів', render: (r) => formatNumber(r.count) },
      { key: 'p95Ms', label: 'p95', render: (r) => formatMs(r.p95Ms), color: (r) => STATUS_COLORS[latencyStatus(r.p95Ms)] },
      { key: 'p99Ms', label: 'p99', render: (r) => formatMs(r.p99Ms) },
      { key: 'maxMs', label: 'Максимум', render: (r) => formatMs(r.maxMs) },
      { key: 'slow', label: `Повільних`, render: (r) => formatNumber(r.slow) },
    ],
  },
  {
    id: 'errors',
    label: '💥 З помилками',
    hint: 'Маршрути з відмовами сервера або високою часткою помилок — тут ламається бізнес-логіка.',
    barKey: 'errorRate',
    barColor: '#ef4444',
    columns: [
      { key: 'count', label: 'Викликів', render: (r) => formatNumber(r.count) },
      { key: 'errors4xx', label: '4xx', render: (r) => formatNumber(r.errors4xx) },
      { key: 'errors5xx', label: '5xx', render: (r) => formatNumber(r.errors5xx), color: () => STATUS_COLORS.critical },
      { key: 'errorRate', label: 'Частка', render: (r) => formatPercent(r.errorRate, 1) },
      { key: 'lastStatus', label: 'Останній код', render: (r) => r.lastStatus },
    ],
  },
  {
    id: 'chatty',
    label: '📣 Найчастіші',
    hint: 'Найбільш викликані маршрути. Якщо дані змінюються рідко — це кандидати на кешування.',
    barKey: 'count',
    barColor: '#8b5cf6',
    columns: [
      { key: 'count', label: 'Викликів', render: (r) => formatNumber(r.count) },
      { key: 'avgMs', label: 'Середня', render: (r) => formatMs(r.avgMs) },
      { key: 'totalTimeMs', label: 'Разом', render: (r) => `${(r.totalTimeMs / 1000).toFixed(1)} с` },
      { key: 'lastAt', label: 'Останній', render: (r) => formatDateTime(r.lastAt) },
    ],
  },
  {
    id: 'heavyPayload',
    label: '📦 Важкі відповіді',
    hint: 'Великі JSON-відповіді довго йдуть по мережі й гальмують рендер у браузері. Потрібна пагінація та проекції полів.',
    barKey: 'avgPayloadKb',
    barColor: '#38bdf8',
    columns: [
      { key: 'avgPayloadKb', label: 'Середній розмір', render: (r) => `${formatNumber(r.avgPayloadKb)} КБ` },
      { key: 'count', label: 'Викликів', render: (r) => formatNumber(r.count) },
      { key: 'avgMs', label: 'Середня', render: (r) => formatMs(r.avgMs) },
    ],
  },
];

export default function ProjectAnalysisPanel({ project }) {
  const [routeView, setRouteView] = useState('hot');
  if (!project) return <div className="sh-muted sh-pad">Дані аналізу проєкту недоступні</div>;

  const totals = project.totals || {};
  const runtime = project.runtime || {};
  const database = project.database || {};
  const view = ROUTE_VIEWS.find((item) => item.id === routeView) || ROUTE_VIEWS[0];
  const rows = project.routes?.[view.id] || [];
  const memPercent = runtime.systemTotalMb ? (runtime.rssMb / runtime.systemTotalMb) * 100 : null;

  return (
    <div className="sh-stack">
      <div className="sh-section">
        <div className="sh-section-head">
          <h3>
            <span className="sh-dot" style={{ background: '#60a5fa' }} /> Здоровʼя бекенду DTS
          </h3>
          <span className="sh-muted">
            вибірка: {formatNumber(totals.requests)} запитів за {formatDuration(project.sampleWindow?.uptimeSec)} роботи процесу
          </span>
        </div>

        <div className="sh-score-row">
          <Gauge
            percent={project.score}
            status={project.score == null ? 'unknown' : project.score >= 80 ? 'ok' : project.score >= 55 ? 'warning' : 'critical'}
            value={project.score == null ? '—' : `${project.score}`}
            label="індекс здоровʼя"
            size={132}
            thickness={12}
          />
          <div className="sh-score-parts">
            {(project.scoreParts || []).map((part) => (
              <div className="sh-score-part" key={part.label}>
                <span>{part.label}</span>
                <RankBar
                  percent={part.score}
                  color={part.score >= 80 ? STATUS_COLORS.ok : part.score >= 55 ? STATUS_COLORS.warning : STATUS_COLORS.critical}
                />
                <b>{part.score}</b>
              </div>
            ))}
            {!project.scoreParts?.length && (
              <div className="sh-muted">
                Індекс зʼявиться після 10+ запитів. Метрики живуть у памʼяті процесу й обнуляються після деплою.
              </div>
            )}
          </div>
        </div>

        <div className="sh-kpi-row">
          <Kpi label="Середня відповідь" value={formatMs(totals.avgMs)} status={latencyStatus(totals.avgMs)} />
          <Kpi label="p95" value={formatMs(totals.p95Ms)} status={latencyStatus(totals.p95Ms)} hint="95% запитів швидші" />
          <Kpi label="p99" value={formatMs(totals.p99Ms)} status={latencyStatus(totals.p99Ms)} />
          <Kpi
            label="Помилки 5xx"
            value={formatPercent(totals.serverErrorRate, 2)}
            status={totals.serverErrorRate >= 3 ? 'critical' : totals.serverErrorRate >= 1 ? 'warning' : 'ok'}
            hint={`${formatNumber(totals.errors5xx)} шт.`}
          />
          <Kpi label="Помилки 4xx" value={formatNumber(totals.errors4xx)} status={totals.errorRate >= 20 ? 'warning' : 'ok'} />
          <Kpi label="Запитів/хв" value={formatNumber(totals.requestsPerMin, 1)} />
          <Kpi
            label="Event loop p99"
            value={formatMs(runtime.eventLoop?.p99Ms)}
            status={runtime.eventLoop?.p99Ms >= 250 ? 'critical' : runtime.eventLoop?.p99Ms >= 100 ? 'warning' : 'ok'}
            hint="затримка циклу подій Node"
          />
          <Kpi
            label="Памʼять процесу"
            value={`${runtime.rssMb} МБ`}
            status={percentStatus(memPercent, { warn: 70, critical: 85 })}
            hint={`heap ${runtime.heapUsedMb}/${runtime.heapTotalMb} МБ`}
          />
          <Kpi label="CPU процесу" value={formatPercent(runtime.cpuPercent)} status={percentStatus(runtime.cpuPercent, { warn: 70, critical: 90 })} />
          <Kpi
            label="Пік паралельних"
            value={formatNumber(project.concurrency?.peak)}
            hint={`зараз ${project.concurrency?.current || 0}`}
          />
          <Kpi
            label="Запитів до Mongo"
            value={formatNumber(database.queriesPerRequest, 2)}
            status={database.queriesPerRequest >= 8 ? 'warning' : 'ok'}
            hint="на один HTTP-запит"
          />
          <Kpi label="Віддано даних" value={formatBytes(totals.bytesOut)} />
        </div>
      </div>

      <div className="sh-section">
        <div className="sh-section-head">
          <h3>Навантаження в часі</h3>
          <span className="sh-muted">похвилинно, останні 2 години</span>
        </div>
        <TrafficChart series={project.minuteSeries} />
        {project.hourSeries?.length > 2 && (
          <>
            <div className="sh-subpanel-title">Погодинно, до 48 годин</div>
            <TrafficChart series={project.hourSeries} height={110} />
          </>
        )}
      </div>

      <div className="sh-section">
        <div className="sh-section-head">
          <h3>Маршрути API</h3>
          <div className="sh-view-tabs">
            {ROUTE_VIEWS.map((item) => (
              <button
                key={item.id}
                className={`sh-view-tab ${routeView === item.id ? 'active' : ''}`}
                onClick={() => setRouteView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <p className="sh-note">{view.hint}</p>
        <RouteTable
          rows={rows}
          columns={view.columns}
          barKey={view.barKey}
          barColor={view.barColor}
          emptyText="У цій категорії поки що порожньо — і це добре."
        />
      </div>

      <div className="sh-section">
        <div className="sh-section-head">
          <h3>База даних у розрізі проєкту</h3>
          <span className="sh-muted">
            {database.monitoring
              ? `${formatNumber(database.totals?.count)} операцій · сер. ${formatMs(database.totals?.avgMs)} · повільних ${formatNumber(database.totals?.slow)}`
              : 'моніторинг команд вимкнено'}
          </span>
        </div>

        {database.slowCommands?.length > 0 && (
          <>
            <div className="sh-subpanel-title">Найважчі операції</div>
            <table className="sh-table">
              <thead>
                <tr>
                  <th>Колекція</th>
                  <th>Операція</th>
                  <th>Викликів</th>
                  <th>Середня</th>
                  <th>Максимум</th>
                  <th>Разом</th>
                </tr>
              </thead>
              <tbody>
                {database.slowCommands.map((command) => (
                  <tr key={command.key}>
                    <td className="sh-mono">{command.collection}</td>
                    <td>{command.command}</td>
                    <td>{formatNumber(command.count)}</td>
                    <td style={{ color: command.avgMs >= 200 ? STATUS_COLORS.warning : undefined }}>{formatMs(command.avgMs)}</td>
                    <td>{formatMs(command.maxMs)}</td>
                    <td>{(command.durationMs / 1000).toFixed(1)} с</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {database.riskyCollections?.length > 0 && (
          <>
            <div className="sh-subpanel-title">Колекції із зауваженнями</div>
            <div className="sh-risk-list">
              {database.riskyCollections.map((collection) => (
                <div className="sh-risk-item" key={collection.name}>
                  <div className="sh-risk-head">
                    <b className="sh-mono">{collection.name}</b>
                    <span className="sh-muted">
                      {formatNumber(collection.count)} док. · {formatBytes(collection.dataSizeBytes)} даних ·{' '}
                      {collection.indexCount} індексів
                    </span>
                  </div>
                  <ul>
                    {collection.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                  {collection.unusedIndexes?.length > 0 && (
                    <div className="sh-risk-tags">
                      {collection.unusedIndexes.map((index) => (
                        <code key={index}>{index}</code>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="sh-two-col">
        <div className="sh-section">
          <div className="sh-section-head">
            <h3>Останні повільні запити</h3>
            <span className="sh-muted">&gt; {project.thresholds?.slowRequestMs} мс</span>
          </div>
          <div className="sh-log-list">
            {(project.recentSlow || []).map((item, index) => (
              <div className="sh-log-row" key={`${item.at}-${index}`}>
                <span className="sh-log-time">{formatDateTime(item.at)}</span>
                <span className={`sh-method sh-method-${item.method?.toLowerCase()}`}>{item.method}</span>
                <span className="sh-mono sh-log-path">{item.path}</span>
                <span className="sh-log-dur" style={{ color: STATUS_COLORS[latencyStatus(item.durationMs)] }}>
                  {formatMs(item.durationMs)}
                </span>
                {item.user && <span className="sh-chip sh-chip-sm">{item.user}</span>}
              </div>
            ))}
            {!project.recentSlow?.length && <div className="sh-muted sh-pad">Повільних запитів не зафіксовано</div>}
          </div>
        </div>

        <div className="sh-section">
          <div className="sh-section-head">
            <h3>Останні серверні помилки</h3>
            <span className="sh-muted">коди 5xx</span>
          </div>
          <div className="sh-log-list">
            {(project.recentErrors || []).map((item, index) => (
              <div className="sh-log-row" key={`${item.at}-${index}`}>
                <span className="sh-log-time">{formatDateTime(item.at)}</span>
                <span className="sh-badge sh-badge-critical">{item.status}</span>
                <span className={`sh-method sh-method-${item.method?.toLowerCase()}`}>{item.method}</span>
                <span className="sh-mono sh-log-path">{item.path}</span>
                {item.user && <span className="sh-chip sh-chip-sm">{item.user}</span>}
              </div>
            ))}
            {!project.recentErrors?.length && <div className="sh-muted sh-pad">Серверних помилок немає 🎉</div>}
          </div>
        </div>
      </div>

      <p className="sh-note">ℹ️ {project.sampleWindow?.note}</p>
    </div>
  );
}
