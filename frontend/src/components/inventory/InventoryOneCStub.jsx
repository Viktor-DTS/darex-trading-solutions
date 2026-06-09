import React from 'react';
import './InventoryOneCStub.css';

/**
 * Заглушка вкладок складського обліку, які тимчасово ведуться в 1С.
 */
export default function InventoryOneCStub({ title, icon = '📋' }) {
  return (
    <div className="inventory-onec-stub">
      <div className="inventory-onec-stub-card">
        <div className="inventory-onec-stub-icon" aria-hidden>
          {icon}
        </div>
        <h2>{title}</h2>
        <p className="inventory-onec-stub-lead">
          Цей розділ тимчасово <strong>не використовується в DTS</strong>. Оформлення руху товару (надходження,
          переміщення, відвантаження, списання, інвентаризація) виконується в <strong>1С</strong>.
        </p>
        <p>
          У DTS залишаються <strong>залишки на складах</strong> (імпорт з «Ведомости»), <strong>журнал руху</strong> та{' '}
          <strong>звірка з 1С</strong>. Контроль списання витратних матеріалів по сервісних заявках — у панелі{' '}
          <strong>Зав. склад</strong> (колонка «Дії» та дані 1С у формі заявки).
        </p>
      </div>
    </div>
  );
}
