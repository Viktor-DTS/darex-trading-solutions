import React, { useState, useEffect } from 'react';
import { Modal, Button, Badge, EmptyState, Skeleton } from '../ui';
import { getClientDuplicates } from '../../utils/clientsAPI';
import './DuplicatesModal.css';

const REASON_TONE = { edrpou: 'danger', phone: 'warning', name: 'info' };

/** Список ймовірних дублікатів клієнтів зі швидким переходом у картку. */
function DuplicatesModal({ open, onClose, onOpenClient }) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getClientDuplicates().then((data) => {
      if (cancelled) return;
      setGroups(data.groups || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('uk-UA') : '—');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ймовірні дублікати"
      subtitle="Клієнти зі спільним ЄДРПОУ, телефоном або дуже схожою назвою"
      size="lg"
      footer={<Button variant="ghost" onClick={onClose}>Закрити</Button>}
    >
      {loading ? (
        <div className="dup-skeleton">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={64} radius={10} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Дублікатів не знайдено"
          description="Усі ваші клієнти мають унікальні реквізити."
        />
      ) : (
        <div className="dup-groups">
          {groups.map((g) => (
            <section className="dup-group" key={`${g.reason}-${g.matchedValue}`}>
              <header className="dup-group__head">
                <Badge tone={REASON_TONE[g.reason] || 'neutral'}>{g.label}</Badge>
                {g.reason !== 'name' && <code className="dup-group__value">{g.matchedValue}</code>}
                <span className="dup-group__count">{g.clients.length} записи</span>
              </header>
              <ul className="dup-list">
                {g.clients.map((c) => (
                  <li key={c._id}>
                    <button
                      type="button"
                      className="dup-item"
                      onClick={() => { onOpenClient?.(c._id); onClose?.(); }}
                    >
                      <span className="dup-item__name">{c.name}</span>
                      <span className="dup-item__meta">
                        {c.edrpou ? `ЄДРПОУ ${c.edrpou}` : 'без ЄДРПОУ'}
                        {c.contactPhone ? ` · ${c.contactPhone}` : ''}
                        {c.region ? ` · ${c.region}` : ''}
                      </span>
                      <span className="dup-item__date">створено {formatDate(c.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default DuplicatesModal;
