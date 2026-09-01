import React, { useState, useEffect, useMemo } from 'react';
import { getClient, getClientInteractions, addClientInteraction, getInteractionFiles, uploadInteractionFiles, getFileOpenToken } from '../../utils/clientsAPI';
import API_BASE_URL from '../../config';
import { getSales } from '../../utils/salesAPI';
import { saleStatusLabel } from '../../utils/saleStatusUtils';
import SaleFormModal from './SaleFormModal';
import './ClientCardModal.css';

const INTERACTION_TYPES = {
  note: 'Примітка',
  call: 'Дзвінок',
  meeting: 'Зустріч',
  email: 'Email',
  commercial_proposal: 'Подана комерційна пропозиція',
  other: 'Інше',
};

const FILES_BASE_URL = (API_BASE_URL || '').replace(/\/api\/?$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');

function saleIdStr(value) {
  if (!value) return '';
  return typeof value === 'object' && value._id ? String(value._id) : String(value);
}

function ClientCardModal({ open, onClose, clientId, onEdit, initialClientFromSearch, user }) {
  const [client, setClient] = useState(null);
  const [sales, setSales] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [interactionFiles, setInteractionFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState(null);
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
    } else if (!open) {
      setSelectedSaleId(null);
      setShowAddInteraction(false);
    }
  }, [open, clientId]);

  const loadData = async (keepSaleId) => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [clientData, salesData, interactionsData] = await Promise.all([
        getClient(clientId),
        getSales({ clientId, forClientCheck: true }).then((d) => (Array.isArray(d) ? d : (d?.sales || []))),
        getClientInteractions(clientId),
      ]);
      setClient(clientData);
      const salesList = Array.isArray(salesData) ? salesData : [];
      setSales(salesList);
      const ints = Array.isArray(interactionsData) ? interactionsData : [];
      setInteractions(ints);
      const cpIds = ints.filter((i) => i.type === 'commercial_proposal').map((i) => i._id);
      const filesMap = {};
      await Promise.all(cpIds.map(async (id) => {
        try {
          const files = await getInteractionFiles(clientId, id);
          filesMap[id] = Array.isArray(files) ? files : [];
        } catch { filesMap[id] = []; }
      }));
      setInteractionFiles(filesMap);

      const nextId = keepSaleId || selectedSaleId;
      if (nextId && salesList.some((s) => String(s._id) === String(nextId))) {
        setSelectedSaleId(nextId);
      } else if (salesList.length > 0) {
        setSelectedSaleId(String(salesList[0]._id));
      } else {
        setSelectedSaleId(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectedSale = useMemo(
    () => sales.find((s) => String(s._id) === String(selectedSaleId)) || null,
    [sales, selectedSaleId],
  );

  const dealInteractions = useMemo(() => {
    if (!selectedSaleId) return [];
    const sid = String(selectedSaleId);
    return interactions.filter((i) => saleIdStr(i.saleId) === sid);
  }, [interactions, selectedSaleId]);

  const generalInteractions = useMemo(
    () => interactions.filter((i) => !saleIdStr(i.saleId)),
    [interactions],
  );

  const handleAddInteraction = async (e) => {
    e?.preventDefault();
    if (!clientId || !client || client.limited || !selectedSaleId) return;
    setAddingInteraction(true);
    try {
      const created = await addClientInteraction(clientId, {
        type: newInteractionType,
        notes: newInteractionNotes,
        saleId: selectedSaleId,
      });
      if (newInteractionType === 'commercial_proposal' && newInteractionFiles?.length > 0 && created?._id) {
        await uploadInteractionFiles(clientId, created._id, newInteractionFiles);
      }
      setNewInteractionNotes('');
      setNewInteractionType('note');
      setNewInteractionFiles([]);
      setShowAddInteraction(false);
      loadData(selectedSaleId);
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
      loadData(selectedSaleId);
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

  const openSaleEditor = (sale) => {
    setEditSale(sale || null);
    setShowSaleFormModal(true);
  };

  const renderInteractionsList = (list, emptyText) => {
    if (list.length === 0) {
      return emptyText ? <p className="no-data">{emptyText}</p> : null;
    }
    return (
      <ul className="interactions-list">
        {list.map((i) => {
          const files = interactionFiles[i._id] || [];
          return (
            <li key={i._id}>
              <div className="interaction-meta">
                <span className="interaction-type">{INTERACTION_TYPES[i.type] || i.type}</span>
                <span className="interaction-date">{i.date ? new Date(i.date).toLocaleString('uk-UA') : ''}</span>
                <span className="interaction-user">{i.userName || i.userLogin}</span>
              </div>
              {i.notes && <div className="interaction-notes">{i.notes}</div>}
              {i.type === 'commercial_proposal' && (
                <div className="interaction-files">
                  {files.length > 0 ? (
                    files.map((f) => (
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
                      onChange={(e) => handleUploadMoreFiles(i._id, e.target)}
                    />
                    {uploadingForId === i._id ? 'Завантаження...' : '+ Завантажити файл'}
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  if (!open) return null;

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('uk-UA') : '—');

  return (
    <div className="modal-overlay client-card-overlay" onClick={onClose}>
      <div className="modal-content client-card-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>👤 Картка клієнта</h3>
          <div className="modal-header-actions">
            {onEdit && client && !client.limited && (
              <button type="button" className="btn-edit" onClick={() => onEdit(client)}>Редагувати</button>
            )}
            <button type="button" className="btn-close" onClick={onClose}>×</button>
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

              <div className="client-card-split">
                <div className="client-card-left">
                  <div className="client-info-block">
                    <h4>{client.name}</h4>
                    {(client.edrpou || initialClientFromSearch?.edrpou) && (
                      <div><strong>ЄДРПОУ:</strong> {client.edrpou || initialClientFromSearch.edrpou}</div>
                    )}
                    {!client.limited && (client.assignedManagerName || client.assignedManagerLogin) && (
                      <div><strong>Відповідальний:</strong> {client.assignedManagerName || client.assignedManagerLogin}</div>
                    )}
                    {!client.limited && client.address && <div><strong>Адреса:</strong> {client.address}</div>}
                    {!client.limited && client.contactPerson && <div><strong>Контакт:</strong> {client.contactPerson}</div>}
                    {!client.limited && client.contactPhone && <div><strong>Телефон:</strong> {client.contactPhone}</div>}
                  </div>

                  <div className="client-sales-block">
                    <h4>
                      Угоди ({sales.length})
                      {!client.limited && (
                        <button type="button" className="btn-small btn-add-sale" onClick={() => openSaleEditor(null)}>
                          + Нова угода
                        </button>
                      )}
                    </h4>
                    {sales.length === 0 ? (
                      <p className="no-data">Немає угод</p>
                    ) : (
                      <div className="client-deals-table-wrap">
                        <table className="mini-sales-table client-deals-table">
                          <thead>
                            <tr>
                              <th>№</th>
                              <th>Статус</th>
                              <th>Створено</th>
                              <th>Коментар</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sales.map((s) => (
                              <tr
                                key={s._id}
                                className={`clickable-row ${String(selectedSaleId) === String(s._id) ? 'selected' : ''}`}
                                onClick={() => setSelectedSaleId(String(s._id))}
                                onDoubleClick={() => !client.limited && openSaleEditor(s)}
                              >
                                <td>{s.saleNumber || '—'}</td>
                                <td>
                                  <span className={`sale-status-pill sale-status-pill--${s.status || 'draft'}`}>
                                    {saleStatusLabel(s.status)}
                                  </span>
                                </td>
                                <td>{formatDate(s.createdAt || s.saleDate)}</td>
                                <td className="deal-notes-cell">{s.notes || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="client-card-right">
                  {!client.limited && selectedSale ? (
                    <>
                      <div className="deal-panel-header">
                        <div>
                          <h4>Угода {selectedSale.saleNumber || ''}</h4>
                          <p className="deal-panel-sub">
                            {saleStatusLabel(selectedSale.status)} · {formatDate(selectedSale.createdAt || selectedSale.saleDate)}
                          </p>
                        </div>
                        <button type="button" className="btn-small" onClick={() => openSaleEditor(selectedSale)}>
                          Відкрити угоду
                        </button>
                      </div>

                      <div className="client-interactions-block">
                        <h4>
                          Історія взаємодій ({dealInteractions.length})
                          {!showAddInteraction && (
                            <button type="button" className="btn-small btn-add-interaction" onClick={() => setShowAddInteraction(true)}>+ Додати</button>
                          )}
                        </h4>
                        {showAddInteraction && (
                          <form className="add-interaction-form" onSubmit={handleAddInteraction}>
                            <select value={newInteractionType} onChange={(e) => setNewInteractionType(e.target.value)}>
                              {Object.entries(INTERACTION_TYPES).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                            <textarea
                              value={newInteractionNotes}
                              onChange={(e) => setNewInteractionNotes(e.target.value)}
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
                                  onChange={(e) => setNewInteractionFiles(Array.from(e.target.files || []))}
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
                        <div className="interactions-scroll-area">
                          {renderInteractionsList(dealInteractions, showAddInteraction ? null : 'Немає записів по цій угоді')}
                          {generalInteractions.length > 0 && (
                            <div className="general-interactions-block">
                              <h5>Загальна історія клієнта ({generalInteractions.length})</h5>
                              {renderInteractionsList(generalInteractions)}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : !client.limited && sales.length === 0 ? (
                    <div className="deal-panel-empty">
                      <p>Створіть першу угоду для цього клієнта</p>
                      <button type="button" className="btn-small btn-add-sale" onClick={() => openSaleEditor(null)}>+ Нова угода</button>
                    </div>
                  ) : !client.limited ? (
                    <div className="deal-panel-empty">
                      <p>Оберіть угоду зі списку зліва</p>
                    </div>
                  ) : (
                    <div className="deal-panel-empty">
                      <p>Обмежений перегляд — історія недоступна</p>
                    </div>
                  )}
                </div>
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
          onSuccess={() => { loadData(selectedSaleId); }}
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
