/**
 * Спільна обгортка вкладки: стан завантаження, помилка і рядок «звідки цифри».
 * Кожна вкладка інакше повторювала б цей код вісім разів.
 */
import React from 'react';
import { ErrorBox, Skeleton } from '../primitives';

export function TabShell({ loading, error, reload, meta, children, skeletonPanels = 4 }) {
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  if (loading) {
    return (
      <div className="an-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {Array.from({ length: skeletonPanels }).map((_, i) => (
          <div key={i} className="an-panel"><div className="an-panel__body"><Skeleton rows={4} /></div></div>
        ))}
      </div>
    );
  }

  return (
    <>
      {children}
      {meta && <MetaLine meta={meta} />}
    </>
  );
}

/**
 * Підпис про походження даних. Без нього неможливо зрозуміти, чому дві вкладки
 * показують різні числа: одна може бути з кешу, інша порахована щойно.
 */
export function MetaLine({ meta }) {
  if (!meta) return null;
  const parts = [];
  if (meta.contextLabel) parts.push(meta.contextLabel);
  if (meta.basis?.label) parts.push(`база: ${meta.basis.label.toLowerCase()}`);
  if (meta.tookMs != null) parts.push(meta.cached ? 'з кешу' : `розраховано за ${meta.tookMs} мс`);
  if (meta.fetchedAt) {
    parts.push(`станом на ${new Date(meta.fetchedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`);
  }
  return <div className="an-meta-line">{parts.join(' · ')}</div>;
}

export function Section({ title, children }) {
  return (
    <>
      <div className="an-section-title">{title}</div>
      {children}
    </>
  );
}
