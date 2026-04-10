import React from 'react';
import './TechnicalSpecsConstructorBlock.css';

/**
 * Довільні пари «назва — значення» для technicalSpecs обладнання / карточки.
 */
export default function TechnicalSpecsConstructorBlock({
  rows = [],
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  readOnly = false,
  compact = false,
  title = 'Характеристики (конструктор)',
  hint,
  className = '',
}) {
  const rootClass = [
    'technical-specs-constructor',
    compact && 'technical-specs-constructor--compact',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const hasVisibleRows = (rows || []).some(
    (r) => String(r.name || '').trim() || String(r.value || '').trim(),
  );
  if (readOnly && !hasVisibleRows) return null;

  return (
    <div className={rootClass}>
      {compact ? <h4 className="technical-specs-constructor__heading">{title}</h4> : <h3>{title}</h3>}
      {hint ? <p className="technical-specs-constructor__hint">{hint}</p> : null}
      <div className="technical-specs-constructor__rows">
        {(rows || []).map((row) => (
          <div key={row._key} className="technical-specs-constructor__row">
            <input
              type="text"
              className="technical-specs-constructor__input"
              placeholder="Назва поля"
              value={row.name}
              onChange={(e) => onUpdateRow(row._key, 'name', e.target.value)}
              readOnly={readOnly}
              disabled={readOnly}
            />
            <input
              type="text"
              className="technical-specs-constructor__input"
              placeholder="Значення"
              value={row.value}
              onChange={(e) => onUpdateRow(row._key, 'value', e.target.value)}
              readOnly={readOnly}
              disabled={readOnly}
            />
            {!readOnly && (
              <button
                type="button"
                className="btn-delete-small technical-specs-constructor__remove"
                onClick={() => onRemoveRow(row._key)}
              >
                Видалити
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && onAddRow && (
        <button type="button" className="btn-secondary technical-specs-constructor__add" onClick={onAddRow}>
          + Додати рядок
        </button>
      )}
    </div>
  );
}
