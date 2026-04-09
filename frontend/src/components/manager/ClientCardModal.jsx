import React, { useState, useEffect } from 'react';
import { getClient, getClientInteractions, addClientInteraction, getInteractionFiles, uploadInteractionFiles, getFileOpenToken } from '../../utils/clientsAPI';
import API_BASE_URL from '../../config';
import { getSales } from '../../utils/salesAPI';
import SaleFormModal from './SaleFormModal';
import './ClientCardModal.css';

const INTERACTION_TYPES = {
  note: 'Примітка',
  call: 'Дзвінок',
  meeting: 'Зустріч',
  email: 'Email',
  commercial_proposal: 'Подана комерційна пропозиція',
  other: 'Інше'
};

const FILES_BASE_URL = (API_BASE_URL || '').replace(/\/api\/?$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');

function ClientCardModal({ open, onClose, clientId, onEdit, initialClientFromSearch, user }) {
  const [client, setClient] = useState(null);
  const [sales, setSales] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [interactionFiles, setInteractionFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [newInteractionNotes, setNewInteractionNotes] = useState('');
  const [newInteractionType, setNewInteractionType] = useState('note');
  const [newInteractionFiles, setNewInteractionFiles] = useState([]);
  const [addingInteraction, setAddingInteraction] = useState(false);
  const [uploadingForId, setUploadingForId] = useState(null);
  const [showSaleFormModal, setShowSaleFormModal] = useState(false);
  const [editSale, setEditSale] = useState(null);

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
      const ints = Array.isArray(interactionsData) ? interactionsData : [];
      setInteractions(ints);
      const cpIds = ints.filter(i => i.type === 'commercial_proposal').map(i => i._id);
      const filesMap = {};
      await Promise.all(cpIds.map(async (id) => {
        try {
          const files = await getInteractionFiles(clientId, id);
          filesMap[id] = Array.isArray(files) ? files : [];
        } catch { filesMap[id] = []; }
      }));
      setInteractionFiles(filesMap);
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
      const created = await addClientInteraction(clientId, { type: newInteractionType, notes: newInteractionNotes });
      if (newInteractionType === 'commercial_proposal' && newInteractionFiles?.length > 0 && created?._id) {
        await uploadInteractionFiles(clientId, created._id, newInteractionFiles);
      }
      setNewInteractionNotes('');
      setNewInteractionType('note');
      setNewInteractionFiles([]);
      setShowAddInteraction(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Помилка');
    } finally {
      setAddingInteraction(false);
    }
  };

  const handleUploadMoreFiles = async (interactionId, fileInput) => {
    const files = fileInput?.files;
    if (!files?.length || !clientId) return;
    setUploadingForId(interactionId);
    try {
      await uploadInteractionFiles(clientId, interactionId, Array.from(files));
      loadData();
    } catch (err) {
      alert(err.message || 'Помилка завантаження');
    } finally {
      setUploadingForId(null);
      if (fileInput) fileInput.value = '';
    }
  };

  const openFile = async (fileId) => {
    try {
      const token = await getFileOpenToken(fileId);
      window.open(`${FILES_BASE_URL}/files/open/${fileId}?token=${encodeURIComponent(token)}`, '_blank');
    } catch (err) {
      alert(err.message || 'Не вдалося відкрити файл');
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
                        {Object.entries(INTERACTION_TYPES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <textarea
                        value={newInteractionNotes}
                        onChange={e => setNewInteractionNotes(e.target.value)}
                        placeholder="Текст примітки..."
                        rows={2}
                      />
                      {newInteractionType === 'commercial_proposal' && (
                        <div className="form-group">
                          <label>Файли (JPEG, PDF, Word)</label>
                          <input
                            type="file"
                            accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                            multiple
                            onChange={e => setNewInteractionFiles(Array.from(e.target.files || []))}
                          />
                          {newInteractionFiles.length > 0 && (
                            <span className="files-count">{newInteractionFiles.length} файл(ів) обрано</span>
                          )}
                        </div>
                      )}
                      <div className="interaction-form-actions">
                        <button type="button" className="btn-cancel" onClick={() => { setShowAddInteraction(false); setNewInteractionNotes(''); setNewInteractionFiles([]); }}>Скасувати</button>
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
                      {interactions.map(i => {
                        const files = interactionFiles[i._id] || [];
                        return (
                          <li key={i._id}>
                            <span className="interaction-type">{INTERACTION_TYPES[i.type] || i.type}</span>
                            <span className="interaction-date">{i.date ? new Date(i.date).toLocaleString('uk-UA') : ''}</span>
                            <span className="interaction-user">{i.userName || i.userLogin}</span>
                            {i.notes && <div className="interaction-notes">{i.notes}</div>}
                            {i.type === 'commercial_proposal' && (
                              <div className="interaction-files">
                                {files.length > 0 ? (
                                  files.map(f => (
                                    <button key={f._id} type="button" className="file-link" onClick={() => openFile(f._id)} title="Відкрити/скачати">
                                      📎 {f.originalName || 'Файл'}
                                    </button>
                                  ))
                                ) : (
                                  <span className="no-files">Немає файлів</span>
                                )}
                                <label className="btn-upload-more">
                                  <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                                    multiple
                                    hidden
                                    onChange={e => handleUploadMoreFiles(i._id, e.target)}
                                  />
                                  {uploadingForId === i._id ? 'Завантаження...' : '+ Завантажити файл'}
                                </label>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              <div className="client-sales-block">
                <h4>
                  Продажі ({sales.length})
                  {!client.limited && (
                    <button type="button" className="btn-small btn-add-sale" onClick={() => { setEditSale(null); setShowSaleFormModal(true); }}>
                      + Новий продаж
                    </button>
                  )}
                </h4>
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
                        <tr key={s._id} onClick={() => { setEditSale(s); setShowSaleFormModal(true); }} className="clickable-row" style={{ cursor: 'pointer' }}>
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

      {user && (
        <SaleFormModal
          open={showSaleFormModal}
          onClose={() => { setShowSaleFormModal(false); setEditSale(null); }}
          onSuccess={() => { loadData(); }}
          onRefreshSale={(s) => setEditSale(s)}
          editSale={editSale}
          initialClient={!editSale && client ? client : null}
          user={user}
        />
      )}
    </div>
  );
}

export default ClientCardModal;
