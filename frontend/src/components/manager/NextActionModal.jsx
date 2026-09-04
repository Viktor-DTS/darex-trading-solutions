import React, { useState, useEffect } from 'react';
import { Modal, Button } from '../ui';
import { setClientNextAction, bulkUpdateClients } from '../../utils/clientsAPI';
import './NextActionModal.css';

const ACTION_TYPES = [
  { value: 'call', label: '📞 Дзвінок' },
  { value: 'meeting', label: '🤝 Зустріч' },
  { value: 'email', label: '✉️ Email' },
  { value: 'quote', label: '📄 Комерційна пропозиція' },
  { value: 'other', label: '📌 Інше' },
];

function toInputDate(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function daysFromNow(days) {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

const PRESETS = [
  { label: 'Завтра', days: 1 },
  { label: 'Через 3 дні', days: 3 },
  { label: 'Через тиждень', days: 7 },
  { label: 'Через місяць', days: 30 },
];

/** Планування наступного кроку для одного або кількох клієнтів. */
function NextActionModal({ open, onClose, onSaved, clients = [] }) {
  const single = clients.length === 1 ? clients[0] : null;

  const [date, setDate] = useState('');
  const [type, setType] = useState('call');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setDate(single?.nextActionAt ? toInputDate(single.nextActionAt) : toInputDate(daysFromNow(1)));
    setType(single?.nextActionType || 'call');
    setNote(single?.nextActionNote || '');
  }, [open, single]);

  const apply = async (payload) => {
    setSaving(true);
    setError('');
    try {
      if (clients.length === 1) {
        await setClientNextAction(clients[0]._id, payload);
      } else {
        const action = payload.at ? 'setNextAction' : 'clearNextAction';
        await bulkUpdateClients(clients.map((c) => c._id), action, payload.at ? payload : undefined);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Не вдалося зберегти');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!date) {
      setError('Оберіть дату');
      return;
    }
    // 09:00 локального дня — щоб нагадування спрацювало зранку
    const at = new Date(`${date}T09:00:00`);
    apply({ at: at.toISOString(), type, note: note.trim() });
  };

  const title = single ? 'Наступний крок' : `Наступний крок для ${clients.length} клієнтів`;
  const subtitle = single ? single.name : 'Дію буде застосовано до всіх вибраних клієнтів';

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} size="sm">
      <form className="na-form" onSubmit={handleSave}>
        <div className="na-presets">
          {PRESETS.map((p) => (
            <Button
              key={p.days}
              variant="ghost"
              size="sm"
              onClick={() => setDate(toInputDate(daysFromNow(p.days)))}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <label className="na-field">
          <span>Дата</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <label className="na-field">
          <span>Тип</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {ACTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="na-field">
          <span>Нотатка</span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Про що домовились, що треба зробити…"
          />
        </label>

        {error && <p className="na-error">{error}</p>}

        <div className="na-actions">
          {single?.nextActionAt && (
            <Button variant="danger" size="sm" disabled={saving} onClick={() => apply({ at: null })}>
              Зняти нагадування
            </Button>
          )}
          <span className="na-actions__spacer" />
          <Button variant="ghost" onClick={onClose} disabled={saving}>Скасувати</Button>
          <Button variant="primary" type="submit" loading={saving}>Зберегти</Button>
        </div>
      </form>
    </Modal>
  );
}

export default NextActionModal;
