import React, { useState, useEffect } from 'react';
import { Modal, Button } from '../ui';
import { createSaleProcurementRequest } from '../../utils/salesAPI';
import './NextActionModal.css';

/** Заявка у відділ закупівель з рядка обладнання угоди. */
function SaleProcurementModal({ open, onClose, onCreated, sale, line }) {
  const [kind, setKind] = useState('price_determination');
  const [priority, setPriority] = useState('7_workdays');
  const [payer, setPayer] = useState('dts');
  const [warehouse, setWarehouse] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setKind(sale?.warehouseName ? 'purchase' : 'price_determination');
    setWarehouse(sale?.warehouseName || '');
    setQty('1');
    setNotes('');
    setPayer('dts');
    setPriority('7_workdays');
  }, [open, sale]);

  const name = line?.type || line?.name || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sale?._id || !name) {
      setError('Немає назви обладнання');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const created = await createSaleProcurementRequest(sale._id, {
        name,
        quantity: Number(qty) || 1,
        applicationKind: kind,
        priority,
        desiredWarehouse: warehouse,
        payerCompany: payer,
        notes,
      });
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      setError(err.message || 'Не вдалося створити заявку');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Замовити в закупівлі"
      subtitle={name ? `${name}${sale?.saleNumber ? ` · ${sale.saleNumber}` : ''}` : ''}
      size="sm"
    >
      <form className="na-form" onSubmit={handleSubmit}>
        <label className="na-field">
          <span>Тип заявки</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="purchase">Закупівля</option>
            <option value="price_determination">Визначення ціни</option>
          </select>
        </label>
        <label className="na-field">
          <span>Пріоритет</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="1_workday">1 робочий день</option>
            <option value="5_workdays">5 робочих днів</option>
            <option value="7_workdays">7 робочих днів</option>
            <option value="more_than_7_workdays">Більше 7 днів</option>
          </select>
        </label>
        {kind === 'purchase' && (
          <>
            <label className="na-field">
              <span>Платник</span>
              <select value={payer} onChange={(e) => setPayer(e.target.value)}>
                <option value="dts">ДТС</option>
                <option value="dareks_energo">Дарекс Енерго</option>
              </select>
            </label>
            <label className="na-field">
              <span>Бажаний склад</span>
              <input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="Назва складу" />
            </label>
          </>
        )}
        <label className="na-field">
          <span>Кількість</span>
          <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="na-field">
          <span>Коментар для закупівель</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Необовʼязково" />
        </label>
        {error && <p className="na-error">{error}</p>}
        <div className="na-actions">
          <span className="na-actions__spacer" />
          <Button variant="ghost" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button variant="primary" type="submit" loading={saving}>Надіслати в закупівлі</Button>
        </div>
      </form>
    </Modal>
  );
}

export default SaleProcurementModal;
