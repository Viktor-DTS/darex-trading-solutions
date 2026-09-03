import React, { useId, useMemo } from 'react';
import { STATUS_COLORS, formatNumber, formatMs, formatDateTime } from './healthFormat';

/** Кільцевий індикатор заповнення ресурсу. */
export function Gauge({ percent, status = 'ok', label, value, size = 96, thickness = 9, marker = null }) {
  const clamped = percent == null ? 0 : Math.max(0, Math.min(100, Number(percent)));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  const markerAngle = marker == null ? null : (Math.max(0, Math.min(100, marker)) / 100) * 360 - 90;

  return (
    <div className="sh-gauge" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1b2a3d" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        {markerAngle != null && (
          <line
            x1={size / 2 + (radius - thickness / 2 - 2) * Math.cos((markerAngle * Math.PI) / 180)}
            y1={size / 2 + (radius - thickness / 2 - 2) * Math.sin((markerAngle * Math.PI) / 180)}
            x2={size / 2 + (radius + thickness / 2 + 2) * Math.cos((markerAngle * Math.PI) / 180)}
            y2={size / 2 + (radius + thickness / 2 + 2) * Math.sin((markerAngle * Math.PI) / 180)}
            stroke="#e2e8f0"
            strokeWidth="2"
          />
        )}
      </svg>
      <div className="sh-gauge-center">
        <span className="sh-gauge-value" style={{ color }}>{value}</span>
        {label && <span className="sh-gauge-label">{label}</span>}
      </div>
    </div>
  );
}

/** Горизонтальна смуга використання з підписом і порогами. */
export function UsageBar({ label, percent, valueText, hintText, status }) {
  const clamped = percent == null ? null : Math.max(0, Math.min(100, Number(percent)));
  const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  return (
    <div className="sh-usage">
      <div className="sh-usage-head">
        <span className="sh-usage-label">{label}</span>
        <span className="sh-usage-value" style={{ color }}>{valueText}</span>
      </div>
      <div className="sh-usage-track">
        <div className="sh-usage-fill" style={{ width: `${clamped ?? 0}%`, background: color }} />
        <span className="sh-usage-tick" style={{ left: '70%' }} />
        <span className="sh-usage-tick sh-usage-tick-danger" style={{ left: '90%' }} />
      </div>
      {hintText && <div className="sh-usage-hint">{hintText}</div>}
    </div>
  );
}

/** Компактний графік лінією з заливкою. */
export function Sparkline({ points, color = '#60a5fa', height = 44, width = 240, formatValue }) {
  const gradientId = useId();
  const path = useMemo(() => {
    const values = (points || []).map((p) => Number(p.value) || 0);
    if (values.length < 2) return null;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    const step = width / (values.length - 1);
    const coords = values.map((value, index) => [index * step, height - ((value - min) / span) * (height - 6) - 3]);
    const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area, max, min, last: values[values.length - 1] };
  }, [points, width, height]);

  if (!path) return <div className="sh-spark-empty">Недостатньо точок</div>;

  return (
    <div className="sh-spark">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path.area} fill={`url(#${gradientId})`} />
        <path d={path.line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <div className="sh-spark-legend">
        <span>мін {formatValue ? formatValue(path.min) : formatNumber(path.min)}</span>
        <span>макс {formatValue ? formatValue(path.max) : formatNumber(path.max)}</span>
      </div>
    </div>
  );
}

/**
 * Стовпчики навантаження в часі: висота — кількість запитів, червона частина — помилки,
 * лінія зверху — середня затримка. Один графік відповідає на «коли і чому було повільно».
 */
export function TrafficChart({ series, height = 150 }) {
  const data = (series || []).filter(Boolean);
  if (data.length < 2) return <div className="sh-spark-empty">Недостатньо даних для графіка навантаження</div>;

  const width = 800;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const maxLatency = Math.max(...data.map((d) => d.avgMs), 1);
  const barWidth = width / data.length;

  const latencyPath = data
    .map((d, index) => {
      const x = index * barWidth + barWidth / 2;
      const y = height - (d.avgMs / maxLatency) * (height - 20) - 4;
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="sh-traffic">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1="0" x2={width} y1={height * ratio} y2={height * ratio} stroke="#1b2a3d" strokeWidth="1" />
        ))}
        {data.map((point, index) => {
          const barHeight = (point.count / maxCount) * (height - 16);
          const errorHeight = point.count ? (point.errors / point.count) * barHeight : 0;
          const x = index * barWidth;
          return (
            <g key={point.ts}>
              <title>
                {`${formatDateTime(point.ts)} · ${point.count} запитів · ${point.errors} помилок · ${formatMs(point.avgMs)}`}
              </title>
              <rect x={x + 0.5} y={height - barHeight} width={Math.max(1, barWidth - 1)} height={barHeight} fill="#3b82f6" opacity="0.55" />
              {errorHeight > 0 && (
                <rect x={x + 0.5} y={height - errorHeight} width={Math.max(1, barWidth - 1)} height={errorHeight} fill="#ef4444" />
              )}
            </g>
          );
        })}
        <path d={latencyPath} fill="none" stroke="#f59e0b" strokeWidth="1.8" />
      </svg>
      <div className="sh-traffic-legend">
        <span><i style={{ background: '#3b82f6' }} /> запити</span>
        <span><i style={{ background: '#ef4444' }} /> помилки</span>
        <span><i style={{ background: '#f59e0b' }} /> середня затримка</span>
        <span className="sh-traffic-range">
          {formatDateTime(data[0].ts)} — {formatDateTime(data[data.length - 1].ts)}
        </span>
      </div>
    </div>
  );
}

const RESOURCE_COLORS = { render: '#8b5cf6', mongodb: '#10b981', cloudinary: '#38bdf8', other: '#64748b' };

/** Витрати по місяцях у розрізі ресурсів. */
export function MonthlySpendChart({ monthly, height = 160 }) {
  const data = monthly || [];
  if (!data.length) return <div className="sh-spark-empty">Ще немає записів про оплати</div>;
  const max = Math.max(...data.map((row) => row.total), 1);

  return (
    <div className="sh-spend">
      <div className="sh-spend-bars" style={{ height }}>
        {data.map((row) => (
          <div className="sh-spend-col" key={row.month} title={`${row.month}: $${row.total.toFixed(2)}`}>
            <div className="sh-spend-stack">
              {['render', 'mongodb', 'cloudinary', 'other'].map((key) =>
                row[key] > 0 ? (
                  <div
                    key={key}
                    className="sh-spend-seg"
                    style={{ height: `${(row[key] / max) * 100}%`, background: RESOURCE_COLORS[key] }}
                  />
                ) : null,
              )}
            </div>
            <span className="sh-spend-total">${Math.round(row.total)}</span>
            <span className="sh-spend-month">{row.month.slice(2)}</span>
          </div>
        ))}
      </div>
      <div className="sh-traffic-legend">
        {Object.entries(RESOURCE_COLORS).map(([key, color]) => (
          <span key={key}><i style={{ background: color }} /> {key}</span>
        ))}
      </div>
    </div>
  );
}

/** Рядок-смуга для рейтингів (найдорожчі маршрути, найбільші колекції). */
export function RankBar({ percent, color = '#60a5fa' }) {
  return (
    <div className="sh-rank">
      <div className="sh-rank-fill" style={{ width: `${Math.max(2, Math.min(100, percent || 0))}%`, background: color }} />
    </div>
  );
}
