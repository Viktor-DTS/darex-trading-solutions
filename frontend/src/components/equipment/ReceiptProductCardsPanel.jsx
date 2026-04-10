import React from 'react';
import TechnicalSpecsConstructorBlock from './TechnicalSpecsConstructorBlock';
import './ReceiptProductCardsPanel.css';

/**
 * Права панель надходження: таблиця карточок продукту + пошук + створення нової + конструктор характеристик.
 */
export default function ReceiptProductCardsPanel({
  query,
  onQueryChange,
  cards,
  loading,
  selectedProductId,
  onSelectCard,
  onCreateCard,
  showSpecsConstructor = false,
  specsRows,
  specsReadOnly = false,
  onSpecsAddRow,
  onSpecsRemoveRow,
  onSpecsUpdateRow,
}) {
  const asideClass = [
    'receipt-product-cards-panel',
    showSpecsConstructor && 'receipt-product-cards-panel--with-specs',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={asideClass}>
      <h4 className="receipt-product-cards-panel__title">Карточки продукту</h4>
      <p className="receipt-product-cards-panel__hint">
        Оберіть рядок — дані підставляться у форму зліва. Можна створити нову карточку без переходу в адмінку.
      </p>
      <input
        type="search"
        className="receipt-product-cards-panel__search"
        placeholder="Пошук: тип, виробник…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <button type="button" className="btn-primary receipt-product-cards-panel__create" onClick={onCreateCard}>
        + Створити карточку продукту
      </button>
      <div className="receipt-product-cards-panel__table-wrap">
        {loading ? (
          <p className="receipt-product-cards-panel__muted">Завантаження…</p>
        ) : !cards?.length ? (
          <p className="receipt-product-cards-panel__muted">Нічого не знайдено. Спробуйте інший запит або створіть карточку.</p>
        ) : (
          <table className="receipt-product-cards-panel__table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Виробник</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((row) => {
                const id = String(row._id);
                const active = selectedProductId && String(selectedProductId) === id;
                return (
                  <tr
                    key={id}
                    className={active ? 'receipt-product-cards-panel__row--active' : ''}
                    onClick={() => onSelectCard(row)}
                    title="Натисніть, щоб застосувати карточку"
                  >
                    <td>
                      <div className="receipt-product-cards-panel__type">{row.type || '—'}</div>
                      {row.displayName ? (
                        <div className="receipt-product-cards-panel__sub">{row.displayName}</div>
                      ) : null}
                    </td>
                    <td>{row.manufacturer || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {showSpecsConstructor && onSpecsAddRow && onSpecsRemoveRow && onSpecsUpdateRow ? (
        <div className="receipt-product-cards-panel__specs">
          <TechnicalSpecsConstructorBlock
            compact
            title="Характеристики позиції"
            hint="Один список з формою: «Сканувати шильдик» зліва також додає рядки. Порожні рядки не зберігаються."
            rows={specsRows}
            readOnly={specsReadOnly}
            onAddRow={onSpecsAddRow}
            onRemoveRow={onSpecsRemoveRow}
            onUpdateRow={onSpecsUpdateRow}
          />
        </div>
      ) : null}
    </aside>
  );
}
