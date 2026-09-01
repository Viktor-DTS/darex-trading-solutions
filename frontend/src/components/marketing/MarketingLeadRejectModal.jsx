import React, { useEffect, useState } from 'react';
import '../marketing/MarketingLeads.css';

function MarketingLeadRejectModal({ open, onClose, onConfirm, saving = false, title = 'Причина відхилення заявки з реклами' }) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <div className="marketing-modal-overlay" onClick={onClose}>
      <div className="marketing-modal card-vip" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={handleSubmit} className="marketing-form">
          <label>
            Опишіть причину відхилення *
            <textarea
              className="marketing-input"
              rows={4}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Наприклад: дублікат, нецільовий запит, некоректний номер..."
            />
          </label>
          <div className="marketing-modal-actions">
            <button type="button" className="marketing-btn marketing-btn-ghost" onClick={onClose} disabled={saving}>
              Скасувати
            </button>
            <button type="submit" className="marketing-btn marketing-btn-primary" disabled={saving || !reason.trim()}>
              {saving ? '...' : 'Відхилити заявку'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MarketingLeadRejectModal;
