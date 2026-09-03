/**
 * Візуальні примітиви аналітики.
 *
 * Свої SVG замість графічної бібліотеки: набір діаграм тут невеликий і
 * передбачуваний, а зайва залежність важила б більше за весь цей файл.
 */
import React, { useMemo, useState } from 'react';
import { delta as toDelta, formatBy, int, pct } from './format';

export const PALETTE = [
  '#4f8ef7', '#22c55e', '#f59e0b', '#a855f7', '#ef4444',
  '#14b8a6', '#ec4899', '#6366f1', '#84cc16', '#f97316',
];

export const colorAt = (i) => PALETTE[i % PALETTE.length];

/* ───────────────────────────── Каркас ───────────────────────────── */

/**
 * `span` розтягує панель на кілька колонок, `full` — на всю ширину рядка.
 * Для повної ширини саме `1 / -1`, а не span із числом: у сітці auto-fit
 * завелике число колонок ламало б адаптив на вузьких екранах.
 */
export function Panel({ title, icon, hint, actions, children, span, full, tone, className = '' }) {
  const gridColumn = full ? '1 / -1' : span ? `span ${span}` : undefined;
  return (
    <section
      className={`an-panel ${tone ? `an-panel--${tone}` : ''} ${className}`}
      style={gridColumn ? { gridColumn } : undefined}
    >
      {(title || actions) && (
        <header className="an-panel__head">
          <div className="an-panel__title">
            {icon && <span className="an-panel__icon">{icon}</span>}
            <h3>{title}</h3>
            {hint && <InfoDot text={hint} />}
          </div>
          {actions && <div className="an-panel__actions">{actions}</div>}
        </header>
      )}
      <div className="an-panel__body">{children}</div>
    </section>
  );
}

export function InfoDot({ text }) {
  return (
    <span className="an-info" tabIndex={0} aria-label={text}>
      i
      <span className="an-info__bubble">{text}</span>
    </span>
  );
}

export function Grid({ children, min = 320, gap = 12, className = '' }) {
  return (
    <div
      className={`an-grid ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap }}
    >
      {children}
    </div>
  );
}

export function Empty({ text = 'Немає даних за вибраний період', hint }) {
  return (
    <div className="an-empty">
      <span className="an-empty__icon">◌</span>
      <span>{text}</span>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Skeleton({ rows = 3, height = 14 }) {
  return (
    <div className="an-skel">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="an-skel__row" style={{ height, width: `${100 - i * 8}%` }} />
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="an-error">
      <strong>Не вдалося завантажити</strong>
      <span>{message}</span>
      {onRetry && <button type="button" className="an-btn an-btn--sm" onClick={onRetry}>Спробувати ще</button>}
    </div>
  );
}

/* ───────────────────────────── KPI ───────────────────────────── */

export function Delta({ value, invert = false, suffix }) {
  const d = toDelta(value, { invert });
  if (!d) return null;
  return (
    <span className={`an-delta an-delta--${d.tone}`}>
      {d.tone === 'up' ? '▲' : d.tone === 'down' ? '▼' : '▪'} {d.text}
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

/**
 * KPI-плитка. Компактна за замовчуванням: значення, підпис, за потреби —
 * зміна до попереднього періоду і один рядок контексту.
 */
export function Kpi({ label, value, format = 'int', hint, delta, deltaInvert, tone, note, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`an-kpi ${tone ? `an-kpi--${tone}` : ''} ${onClick ? 'an-kpi--clickable' : ''}`}
      onClick={onClick}
    >
      <span className="an-kpi__label">
        {label}
        {hint && <InfoDot text={hint} />}
      </span>
      <span className="an-kpi__value">{formatBy(format, value)}</span>
      <span className="an-kpi__foot">
        {delta !== undefined && delta !== null && <Delta value={delta} invert={deltaInvert} />}
        {note && <span className="an-kpi__note">{note}</span>}
      </span>
    </Tag>
  );
}

export function KpiRow({ items, min = 150 }) {
  return (
    <div className="an-kpi-row" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>
      {items.filter(Boolean).map((item) => <Kpi key={item.label} {...item} />)}
    </div>
  );
}

/* ───────────────────────────── Списки-стовпчики ───────────────────────────── */

/**
 * Горизонтальний рейтинг. Замінює кругові діаграми там, де важливо порівняти
 * величини і одразу побачити підпис — на пончику з 8 сегментами це неможливо.
 */
export function BarList({ items, valueFormat = 'int', secondaryFormat, limit, total, colorByIndex = false, emptyText }) {
  const [expanded, setExpanded] = useState(false);
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return <Empty text={emptyText} />;

  const shown = limit && !expanded ? list.slice(0, limit) : list;
  const max = Math.max(...list.map((i) => Math.abs(Number(i.value) || 0)), 1);
  const sum = total ?? list.reduce((s, i) => s + (Number(i.value) || 0), 0);

  return (
    <div className="an-bars">
      {shown.map((item, i) => {
        const value = Number(item.value) || 0;
        const width = Math.max((Math.abs(value) / max) * 100, value === 0 ? 0 : 1.5);
        const share = sum > 0 ? (value / sum) * 100 : null;
        return (
          <div
            className={`an-bar ${item.onClick ? 'an-bar--clickable' : ''}`}
            key={item.key || item.label || i}
            onClick={item.onClick}
            role={item.onClick ? 'button' : undefined}
          >
            <div className="an-bar__head">
              <span className="an-bar__label" title={item.label}>
                {item.icon && <span className="an-bar__icon">{item.icon}</span>}
                {item.label}
                {item.badge && <em className={`an-badge an-badge--${item.badgeTone || 'muted'}`}>{item.badge}</em>}
              </span>
              <span className="an-bar__value">
                {formatBy(valueFormat, value)}
                {item.secondary !== undefined && item.secondary !== null && (
                  <small>{formatBy(secondaryFormat || 'int', item.secondary)}</small>
                )}
              </span>
            </div>
            <div className="an-bar__track">
              <div
                className="an-bar__fill"
                style={{
                  width: `${width}%`,
                  background: item.color || (colorByIndex ? colorAt(i) : 'var(--an-accent)'),
                }}
              />
            </div>
            {(item.note || share !== null) && (
              <div className="an-bar__foot">
                {item.note && <span>{item.note}</span>}
                {share !== null && !item.hideShare && <span className="an-bar__share">{pct(share)}</span>}
              </div>
            )}
          </div>
        );
      })}
      {limit && list.length > limit && (
        <button type="button" className="an-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Згорнути' : `Показати всі ${list.length}`}
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── Пончик ───────────────────────────── */

export function Donut({ items, size = 148, thickness = 20, centerLabel, centerValue, valueFormat = 'int' }) {
  const list = (items || []).filter((i) => Number(i.value) > 0);
  const total = list.reduce((s, i) => s + Number(i.value), 0);
  if (!total) return <Empty />;

  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="an-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {list.map((item, i) => {
            const frac = Number(item.value) / total;
            const dash = `${frac * c} ${c}`;
            const el = (
              <circle
                key={item.key || item.label || i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={item.color || colorAt(i)}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset * c}
              >
                <title>{`${item.label}: ${formatBy(valueFormat, item.value)}`}</title>
              </circle>
            );
            offset += frac;
            return el;
          })}
        </g>
        <text className="an-donut__value" x="50%" y="47%" textAnchor="middle">
          {centerValue !== undefined ? formatBy(valueFormat, centerValue) : formatBy(valueFormat, total)}
        </text>
        {centerLabel && (
          <text className="an-donut__label" x="50%" y="61%" textAnchor="middle">{centerLabel}</text>
        )}
      </svg>
      <ul className="an-legend">
        {list.map((item, i) => (
          <li key={item.key || item.label || i}>
            <i style={{ background: item.color || colorAt(i) }} />
            <span className="an-legend__label" title={item.label}>{item.label}</span>
            <span className="an-legend__value">{formatBy(valueFormat, item.value)}</span>
            <span className="an-legend__pct">{pct((Number(item.value) / total) * 100)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────────── Тренд ───────────────────────────── */

/**
 * Стовпчики місяців + лінія попереднього періоду. Один графік замінює два:
 * видно і абсолютну динаміку, і чи краще ми за той самий місяць минулого року.
 */
export function TrendChart({
  data,
  bars = [{ key: 'revenue', label: 'Дохід', format: 'money', color: '#4f8ef7' }],
  line,
  height = 190,
  xKey = 'label',
}) {
  const rows = Array.isArray(data) ? data : [];
  const [hover, setHover] = useState(null);
  const max = useMemo(() => {
    const values = [];
    rows.forEach((row) => {
      bars.forEach((b) => values.push(Number(row[b.key]) || 0));
      if (line) values.push(Number(row[line.key]) || 0);
    });
    return Math.max(...values, 1);
  }, [rows, bars, line]);

  if (!rows.length) return <Empty />;

  const plotH = height - 26;
  const step = 100 / rows.length;
  const linePoints = line
    ? rows.map((row, i) => {
      const v = Number(row[line.key]) || 0;
      return `${step * i + step / 2},${plotH - (v / max) * plotH}`;
    }).join(' ')
    : null;

  return (
    <div className="an-trend" style={{ height }}>
      <div className="an-trend__plot" style={{ height: plotH }}>
        <svg className="an-trend__grid" viewBox={`0 0 100 ${plotH}`} preserveAspectRatio="none">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1="0" x2="100" y1={plotH * f} y2={plotH * f} />
          ))}
        </svg>

        <div className="an-trend__bars">
          {rows.map((row, i) => {
            const active = hover === i;
            return (
              <div
                className={`an-trend__col ${active ? 'is-active' : ''}`}
                key={row[xKey] || i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="an-trend__stack">
                  {bars.map((b) => {
                    const v = Number(row[b.key]) || 0;
                    return (
                      <div
                        key={b.key}
                        className="an-trend__bar"
                        style={{ height: `${(v / max) * 100}%`, background: b.color }}
                      />
                    );
                  })}
                </div>
                {active && (
                  <div className="an-trend__tip">
                    <strong>{row[xKey]}</strong>
                    {bars.map((b) => (
                      <span key={b.key}>
                        <i style={{ background: b.color }} />
                        {b.label}: {formatBy(b.format || 'int', row[b.key])}
                      </span>
                    ))}
                    {line && (
                      <span>
                        <i style={{ background: line.color || '#94a3b8' }} />
                        {line.label}: {formatBy(line.format || 'int', row[line.key])}
                      </span>
                    )}
                    {row.tasks !== undefined && !bars.some((b) => b.key === 'tasks') && (
                      <span className="an-trend__tip-extra">Заявок: {int(row.tasks)}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {linePoints && (
          <svg className="an-trend__line" viewBox={`0 0 100 ${plotH}`} preserveAspectRatio="none">
            <polyline points={linePoints} stroke={line.color || '#94a3b8'} />
          </svg>
        )}
      </div>
      <div className="an-trend__axis">
        {rows.map((row, i) => (
          <span key={row[xKey] || i} className={hover === i ? 'is-active' : ''}>{row.short || row[xKey]}</span>
        ))}
      </div>
      <div className="an-trend__legend">
        {bars.map((b) => (
          <span key={b.key}><i style={{ background: b.color }} />{b.label}</span>
        ))}
        {line && <span><i className="is-line" style={{ background: line.color || '#94a3b8' }} />{line.label}</span>}
      </div>
    </div>
  );
}

/* ───────────────────────────── Таблиця ───────────────────────────── */

/**
 * Компактна таблиця з сортуванням по клацанню на заголовок.
 * columns: [{ key, label, format, align, width, render, sortable }]
 */
export function DataTable({ columns, rows, limit, emptyText, rowKey, onRowClick, initialSort }) {
  const [sort, setSort] = useState(initialSort || null);
  const [expanded, setExpanded] = useState(false);

  const list = Array.isArray(rows) ? rows : [];
  const sorted = useMemo(() => {
    if (!sort) return list;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'uk') * dir;
    });
  }, [list, sort]);

  if (!list.length) return <Empty text={emptyText} />;

  const shown = limit && !expanded ? sorted.slice(0, limit) : sorted;
  const toggle = (col) => {
    if (col.sortable === false) return;
    setSort((prev) => (prev?.key === col.key
      ? { key: col.key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key: col.key, dir: 'desc' }));
  };

  return (
    <div className="an-table-wrap">
      <table className="an-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ textAlign: col.align || 'left', width: col.width }}
                className={`${col.sortable === false ? '' : 'is-sortable'} ${sort?.key === col.key ? 'is-sorted' : ''}`}
                onClick={() => toggle(col)}
              >
                {col.label}
                {sort?.key === col.key && <span className="an-table__sort">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr
              key={rowKey ? row[rowKey] || i : i}
              className={`${onRowClick ? 'is-clickable' : ''} ${row._tone ? `is-${row._tone}` : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                  {col.render ? col.render(row) : formatBy(col.format || 'text', row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {limit && sorted.length > limit && (
        <button type="button" className="an-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Згорнути' : `Показати всі ${sorted.length}`}
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── Дрібниці ───────────────────────────── */

export function Badge({ children, tone = 'muted' }) {
  return <span className={`an-badge an-badge--${tone}`}>{children}</span>;
}

export function StatLine({ label, value, format = 'int', tone, hint }) {
  return (
    <div className={`an-stat ${tone ? `an-stat--${tone}` : ''}`}>
      <span className="an-stat__label">
        {label}
        {hint && <InfoDot text={hint} />}
      </span>
      <span className="an-stat__value">{formatBy(format, value)}</span>
    </div>
  );
}

export function StatList({ items }) {
  return <div className="an-stats">{items.filter(Boolean).map((i) => <StatLine key={i.label} {...i} />)}</div>;
}
