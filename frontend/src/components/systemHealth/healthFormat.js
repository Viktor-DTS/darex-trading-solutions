/** Форматування чисел, розмірів і часу для вкладки «Аналіз роботи системи». */

export const STATUS_COLORS = {
  ok: '#10b981',
  good: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
  info: '#60a5fa',
  unknown: '#64748b',
};

export const STATUS_LABELS = {
  ok: 'Норма',
  good: 'Норма',
  warning: 'Увага',
  critical: 'Критично',
  info: 'Інформація',
  unknown: 'Немає даних',
};

export function formatBytes(bytes, digits = 1) {
  const value = Number(bytes || 0);
  if (!value) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : digits)} ${units[index]}`;
}

export function formatNumber(value, digits = 0) {
  const num = Number(value || 0);
  return num.toLocaleString('uk-UA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatMs(ms) {
  const value = Number(ms || 0);
  if (value >= 10_000) return `${(value / 1000).toFixed(1)} с`;
  return `${Math.round(value)} мс`;
}

export function formatUsd(value) {
  return `$${Number(value || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)}%`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days} дн ${hours} год`;
  if (hours) return `${hours} год ${minutes} хв`;
  return `${minutes} хв`;
}

/** Колір за відсотком використання ресурсу: зелений → жовтий → червоний. */
export function percentStatus(percent, { warn = 70, critical = 88 } = {}) {
  if (percent == null || Number.isNaN(Number(percent))) return 'unknown';
  if (percent >= critical) return 'critical';
  if (percent >= warn) return 'warning';
  return 'ok';
}

export function latencyStatus(ms) {
  if (ms == null) return 'unknown';
  if (ms >= 2000) return 'critical';
  if (ms >= 900) return 'warning';
  return 'ok';
}
