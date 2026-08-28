import React from 'react';
import './NomenclatureStockPanel.css';

/**
 * @param {{
 *   items: Array<{ label: string, productId?: string, totalQuantity: number, warehouses: Array<{ warehouseId?: string, warehouseName: string, quantity: number }> }>,
 *   loading?: boolean,
 *   emptyHint?: string,
 *   title?: string,
 *   note?: string,
 *   onRequestTransfer?: (payload: { label: string, productId?: string, fromWarehouseName: string, fromWarehouseId?: string, availableQty: number }) => void,
 *   canRequestTransfer?: boolean,
 * }} props
 */
export default function NomenclatureStockPanel({
  items = [],
  loading = false,
  emptyHint = 'Введіть назву матеріалу (мінімум 2 символи).',
  title = 'Залишки на складах',
  note = 'Регіональні склади зі списку відділу закупівель (без ЗІП/особистих).',
  onRequestTransfer,
  canRequestTransfer = false,
}) {
  return (
    <aside className="nomenclature-stock-panel" aria-label={title}>
      <h3 className="nomenclature-stock-panel-title">{title}</h3>
      {note ? <p className="nomenclature-stock-panel-note">{note}</p> : null}
      {loading ? (
        <p className="nomenclature-stock-panel-empty">Завантаження…</p>
      ) : !items.length ? (
        <p className="nomenclature-stock-panel-empty">{emptyHint}</p>
      ) : (
        <div className="nomenclature-stock-list">
          {items.map((item) => (
            <section
              key={`${item.label}-${item.productId || ''}`}
              className="nomenclature-stock-item"
            >
              <p className="nomenclature-stock-item-name">{item.label}</p>
              {item.totalQuantity > 0 ? (
                <>
                  <p className="nomenclature-stock-item-total">
                    Загалом: <strong>{item.totalQuantity}</strong>
                  </p>
                  <div className="nomenclature-stock-wrap">
                    <table className="nomenclature-stock-table">
                      <thead>
                        <tr>
                          <th>Склад</th>
                          <th>Кількість</th>
                          {canRequestTransfer ? <th /> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {item.warehouses.map((w) => (
                          <tr key={`${item.label}-${w.warehouseId}-${w.warehouseName}`}>
                            <td>{w.warehouseName}</td>
                            <td>{w.quantity}</td>
                            {canRequestTransfer ? (
                              <td className="nomenclature-stock-action">
                                {onRequestTransfer ? (
                                  <button
                                    type="button"
                                    className="btn-transfer-request"
                                    onClick={() =>
                                      onRequestTransfer({
                                        label: item.label,
                                        productId: item.productId,
                                        fromWarehouseName: w.warehouseName,
                                        fromWarehouseId: w.warehouseId,
                                        availableQty: Number(w.quantity) || 0,
                                      })
                                    }
                                  >
                                    Запросити переміщення
                                  </button>
                                ) : null}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="nomenclature-stock-panel-empty">Залишків не знайдено</p>
              )}
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}
