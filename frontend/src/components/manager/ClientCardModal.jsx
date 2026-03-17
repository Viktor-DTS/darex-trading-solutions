import React, { useState, useEffect } from 'react';
import { getClient, getClientInteractions, addClientInteraction } from '../../utils/clientsAPI';
import { getSales } from '../../utils/salesAPI';
import './ClientCardModal.css';

function ClientCardModal({ open, onClose, clientId, onEdit, initialClientFromSearch }) {
  const [client, setClient] = useState(null);
  const [sales, setSales] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [newInteractionNotes, setNewInteractionNotes] = useState('');
  const [newInteractionType, setNewInteractionType] = useState('note');
  const [addingInteraction, setAddingInteraction] = useState(false);

  useEffect(() => {
    if (open && clientId) {
      loadData();
    }
  }, [open, clientId]);

  const loadData = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [clientData, salesData, interactionsData] = await Promise.all([
        getClient(clientId),
        getSales({ clientId, forClientCheck: true }).then(d => Array.isArray(d) ? d : (d?.sales || [])),
        getClientInteractions(clientId)
      ]);
      setClient(clientData);
      setSales(salesData);
      setInteractions(Array.isArray(interactionsData) ? interactionsData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInteraction = async (e) => {
    e?.preventDefault();
    if (!clientId || !client || client.limited) return;
    setAddingInteraction(true);
    try {
      await addClientInteraction(clientId, { type: newInteractionType, notes: newInteractionNotes });
      setNewInteractionNotes('');
      setNewInteractionType('note');
      setShowAddInteraction(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setAddingInteraction(false);
    }
  };

  if (!open) return null;

  const formatCurrency = (v) => new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', minimumFractionDigits: 0 }).format(v || 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content client-card-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>👤 Картка клієнта</h3>
          <div className="modal-header-actions">
            {onEdit && client && !client.limited && (
              <button className="btn-edit" onClick={() => onEdit(client)}>Редагувати</button>
            )}
            <button className="btn-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-indicator">Завантаження...</div>
          ) : client ? (
            <>
              {client.limited && (
                <div className="limited-notice">
                  ⚠️ Клієнт закріплений за іншим менеджером. Показано обмежену інформацію.
                  {(client.assignedManagerName || client.assignedManagerLogin) && (
                    <div className="limited-manager">Менеджер: <strong>{client.assignedManagerName || client.assignedManagerLogin}</strong></div>
                  )}
                </div>
              )}
              <div className="client-info-block">
                <h4>{client.name}</h4>
                {(client.edrpou || initialClientFromSearch?.edrpou) && (
                  <div><strong>ЄДРПОУ:</strong> {client.edrpou || initialClientFromSearch.edrpou}</div>
                )}
                {!client.limited && (
                  <>
                    {client.createdAt && (client.createdByName || client.createdByLogin) && (
                      <div><strong>Створено:</strong> {new Date(client.createdAt).toLocaleDateString('uk-UA')} — {client.createdByName || client.createdByLogin}</div>
                    )}
                    {(client.assignedManagerName || client.assignedManagerLogin) && (
                      <div><strong>Відповідальний:</strong> {client.assignedManagerName || client.assignedManagerLogin}</div>
                    )}
                    {(client.assignedManagerName2 || client.assignedManagerLogin2) && (
                      <div><strong>Другий відповідальний:</strong> {client.assignedManagerName2 || client.assignedManagerLogin2}</div>
                    )}
                  </>
                )}
                {!client.limited && client.address && <div><strong>Адреса:</strong> {client.address}</div>}
                {!client.limited && client.contactPerson && <div><strong>Контакт:</strong> {client.contactPerson}</div>}
                {!client.limited && client.contactPhone && <div><strong>Телефон:</strong> {client.contactPhone}</div>}
                {!client.limited && client.email && <div><strong>Email:</strong> {client.email}</div>}
                {!client.limited && client.region && <div><strong>Регіон:</strong> {client.region}</div>}
                {!client.limited && client.notes && <div><strong>Примітки:</strong> {client.notes}</div>}
              </div>

              {!client.limited && (
                <div className="client-interactions-block">
                  <h4>
                    Історія взаємодій ({interactions.length})
                    {!showAddInteraction && (
                      <button type="button" className="btn-small btn-add-interaction" onClick={() => setShowAddInteraction(true)}>+ Додати</button>
                    )}
                  </h4>
                  {showAddInteraction && (
                    <form className="add-interaction-form" onSubmit={handleAddInteraction}>
                      <select value={newInteractionType} onChange={e => setNewInteractionType(e.target.value)}>
                        <option value="note">Примітка</option>
                        <option value="call">Дзвінок</option>
                        <option value="meeting">Зустріч</option>
                        <option value="email">Email</option>
                        <option value="other">Інше</option>
                      </select>
                      <textarea
                        value={newInteractionNotes}
                        onChange={e => setNewInteractionNotes(e.target.value)}
                        placeholder="Текст примітки..."
                        rows={2}
                      />
                      <div className="interaction-form-actions">
                        <button type="button" className="btn-cancel" onClick={() => { setShowAddInteraction(false); setNewInteractionNotes(''); }}>Скасувати</button>
                        <button type="submit" className="btn-primary" disabled={addingInteraction}>
                          {addingInteraction ? 'Збереження...' : 'Зберегти'}
                        </button>
                      </div>
                    </form>
                  )}
                  {interactions.length === 0 && !showAddInteraction ? (
                    <p className="no-data">Немає записів</p>
                  ) : (
                    <ul className="interactions-list">
                      {interactions.map(i => (
                        <li key={i._id}>
                          <span className="interaction-type">{i.type === 'note' ? 'Примітка' : i.type === 'call' ? 'Дзвінок' : i.type === 'meeting' ? 'Зустріч' : i.type === 'email' ? 'Email' : i.type}</span>
                          <span className="interaction-date">{i.date ? new Date(i.date).toLocaleString('uk-UA') : ''}</span>
                          <span className="interaction-user">{i.userName || i.userLogin}</span>
                          {i.notes && <div className="interaction-notes">{i.notes}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="client-sales-block">
                <h4>Продажі ({sales.length})</h4>
                {sales.length === 0 ? (
                  <p className="no-data">Немає продажів</p>
                ) : (
                  <table className="mini-sales-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Продукт</th>
                        {!client.limited && <th>Сума</th>}
                        <th>Гарантія до</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.slice(0, 10).map(s => (
                        <tr key={s._id}>
                          <td>{s.saleDate ? new Date(s.saleDate).toLocaleDateString('uk-UA') : '—'}</td>
                          <td>{s.mainProductName || '—'}</td>
                          {!client.limited && <td>{formatCurrency(s.totalAmount || s.mainProductAmount)}</td>}
                          <td>{s.warrantyUntil ? new Date(s.warrantyUntil).toLocaleDateString('uk-UA') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="loading-indicator">Клієнта не знайдено</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClientCardModal;
