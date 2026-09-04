import React, { useState, useEffect, useMemo } from 'react';
import { getClient, getClientInteractions, addClientInteraction, getInteractionFiles, uploadInteractionFiles, getFileOpenToken } from '../../utils/clientsAPI';
import API_BASE_URL from '../../config';
import { getSales, getSaleProgress } from '../../utils/salesAPI';
import { saleStatusLabel } from '../../utils/saleStatusUtils';
import NextActionModal from './NextActionModal';
import './ClientCardModal.css';

const INTERACTION_TYPES = {
  note: 'Примітка',
  call: 'Дзвінок',
  meeting: 'Зустріч',
  email: 'Email',
  commercial_proposal: 'Подана комерційна пропозиція',
  other: 'Інше',
};

const ACTION_ICONS = { call: '📞', meeting: '🤝', email: '✉️', quote: '📄', other: '📌' };
const FIELD_LABELS = {
  edrpou: 'ЄДРПОУ',
  contactPerson: 'контактна особа',
  contactPhone: 'телефон',
  email: 'email',
  address: 'адреса',
  region: 'регіон',
};

const FILES_BASE_URL = (API_BASE_URL || '').replace(/\/api\/?$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');

function saleIdStr(value) {
  if (!value) return '';
  return typeof value === 'object' && value._id ? String(value._id) : String(value);
}

function nextActionState(client) {
  if (!client?.nextActionAt) return null;
  const date = new Date(client.nextActionAt);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  const icon = ACTION_ICONS[client.nextActionType] || ACTION_ICONS.other;
  const title = `${date.toLocaleDateString('uk-UA')}${client.nextActionNote ? ` — ${client.nextActionNote}` : ''}`;
  if (diff < 0) return { tone: 'overdue', text: `Прострочено ${-diff} дн.`, icon, title };
  if (diff === 0) return { tone: 'today', text: 'Сьогодні', icon, title };
  if (diff === 1) return { tone: 'soon', text: 'Завтра', icon, title };
  return { tone: 'future', text: date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }), icon, title };
}

function ClientCardModal({ open, onClose, clientId, onEdit, onOpenSale, initialClientFromSearch, user }) {
  const [client, setClient] = useState(null);
  const [sales, setSales] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [interactionFiles, setInteractionFiles] = useState({});
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState(null);
  const [timelineFilter, setTimelineFilter] = useState('all');
  const [showAddInteraction, setShowAddInteraction] = useState(false);
  const [newInteractionNotes, setNewInteractionNotes] = useState('');
  const [newInteractionType, setNewInteractionType] = useState('note');
  const [newInteractionScope, setNewInteractionScope] = useState('deal');
  const [newInteractionFiles, setNewInteractionFiles] = useState([]);
  const [addingInteraction, setAddingInteraction] = useState(false);
  const [uploadingForId, setUploadingForId] = useState(null);
  const [showNextAction, setShowNextAction] = useState(false);

  useEffect(() => {
    if (open && clientId) {
      loadData();
    } else if (!open) {
      setSelectedSaleId(null);
      setShowAddInteraction(false);
      setProgress(null);
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
      let resolvedId = null;
      if (nextId && salesList.some((s) => String(s._id) === String(nextId))) {
        resolvedId = String(nextId);
      } else if (salesList.length > 0) {
        resolvedId = String(salesList[0]._id);
      }
      setSelectedSaleId(resolvedId);
      if (resolvedId) {
        setProgress(await getSaleProgress(resolvedId));
      } else {
        setProgress(null);
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

  useEffect(() => {
    if (!open || !selectedSaleId) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    getSaleProgress(selectedSaleId).then((p) => {
      if (!cancelled) setProgress(p);
    });
    return () => { cancelled = true; };
  }, [open, selectedSaleId]);

  const timeline = useMemo(() => {
    const rows = interactions.map((i) => {
      const sid = saleIdStr(i.saleId);
      const sale = sid ? sales.find((s) => String(s._id) === sid) : null;
      return { ...i, _saleId: sid, _saleNumber: sale?.saleNumber || '' };
    });
    rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (timelineFilter === 'deal' && selectedSaleId) {
      return rows.filter((i) => i._saleId === String(selectedSaleId));
    }
    if (timelineFilter === 'general') {
      return rows.filter((i) => !i._saleId);
    }
    return rows;
  }, [interactions, sales, timelineFilter, selectedSaleId]);

  const handleAddInteraction = async (e) => {
    e?.preventDefault();
    if (!clientId || !client || client.limited) return;
    const attachToDeal = newInteractionScope === 'deal' && selectedSaleId;
    setAddingInteraction(true);
    try {
      const created = await addClientInteraction(clientId, {
        type: newInteractionType,
        notes: newInteractionNotes,
        saleId: attachToDeal ? selectedSaleId : undefined,
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
    onOpenSale?.(sale || null, client);
  };

  const handleSelectDeal = (id) => {
    setSelectedSaleId(String(id));
    setTimelineFilter('all');
  };

  const renderRibbon = () => {
    if (!selectedSale) return null;
    const shipment = progress?.shipments?.[0];
    const shipmentDone = progress?.shipments?.some((s) => s.status === 'fulfilled');
    const shipmentPending = progress?.shipments?.some((s) => s.status === 'pending');
    const reserved = (progress?.reservedCount || 0) > 0 || (progress?.lockedLines || 0) > 0;
    const status = selectedSale.status;
    const negotiationDone = !['draft', 'primary_contact'].includes(status);
    const realization = ['in_realization', 'success', 'confirmed', 'pnr'].includes(status);
    const closed = ['success', 'confirmed'].includes(status);
    const premium = Boolean(progress?.premiumAccruedAt || status === 'confirmed');

    const steps = [
      { key: 'talk', label: 'Переговори', done: negotiationDone || realization || closed, current: status === 'in_negotiation' || status === 'quote_sent' || status === 'in_progress' },
      { key: 'stock', label: reserved ? `Резерв (${progress?.reservedCount || progress?.lockedLines || 0})` : 'Склад', done: reserved || shipmentDone || closed, current: reserved && !shipmentDone && !closed },
      { key: 'ship', label: shipment ? shipment.requestNumber : 'Відвантаження', done: shipmentDone || closed, current: shipmentPending && !shipmentDone, warn: progress?.shipments?.some((s) => s.status === 'cancelled') },
      { key: 'money', label: premium ? 'Премія ✓' : 'Премія', done: premium, current: status === 'success' && !premium },
    ];

    return (
      <ol className="deal-ribbon" aria-label="Етапи угоди">
        {steps.map((s) => (
          <li
            key={s.key}
            className={`deal-ribbon__step ${s.done ? 'is-done' : ''} ${s.current ? 'is-current' : ''} ${s.warn ? 'is-warn' : ''}`}
          >
            {s.label}
          </li>
        ))}
      </ol>
    );
  };

  if (!open) return null;

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('uk-UA') : '—');
  const action = nextActionState(client);
  const completeness = client?.stats?.completeness;
  const missing = (client?.stats?.missingFields || []).map((f) => FIELD_LABELS[f] || f).join(', ');

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

              {!client.limited && (
                <div className="client-card-toolbar">
                  <div className="client-next-strip">
                    <span className="client-next-strip__label">Наступний крок</span>
                    {action ? (
                      <button type="button" className={`ct-next-inline ct-next-inline--${action.tone}`} title={action.title} onClick={() => setShowNextAction(true)}>
                        <span aria-hidden="true">{action.icon}</span> {action.text}
                        {client.nextActionNote ? <em> — {client.nextActionNote}</em> : null}
                      </button>
                    ) : (
                      <button type="button" className="ct-next-inline ct-next-inline--empty" onClick={() => setShowNextAction(true)}>
                        + Запланувати дзвінок або зустріч
                      </button>
                    )}
                  </div>
                  {completeness != null && completeness < 100 && (
                    <span className="client-completeness" title={`Не вистачає: ${missing}`}>
                      Картка заповнена на {completeness}%
                    </span>
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
                    {!client.limited && client.email && <div><strong>Email:</strong> {client.email}</div>}
                    {!client.limited && client.region && <div><strong>Регіон:</strong> {client.region}</div>}
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
                                onClick={() => handleSelectDeal(s._id)}
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
                            {progress?.tenderEmployeeLogin ? ' · тендер залучено' : ''}
                          </p>
                        </div>
                        <button type="button" className="btn-small" onClick={() => openSaleEditor(selectedSale)}>
                          Відкрити угоду
                        </button>
                      </div>
                      {renderRibbon()}
                      {progress?.procurements?.length > 0 && (
                        <p className="deal-proc-hint">
                          Закупівлі: {progress.procurements.map((p) => p.requestNumber).join(', ')}
                        </p>
                      )}

                      <div className="client-interactions-block">
                        <h4>
                          Історія ({timeline.length})
                          {!showAddInteraction && (
                            <button type="button" className="btn-small btn-add-interaction" onClick={() => setShowAddInteraction(true)}>+ Додати</button>
                          )}
                        </h4>
                        <div className="timeline-filters">
                          <button type="button" className={timelineFilter === 'all' ? 'is-active' : ''} onClick={() => setTimelineFilter('all')}>Усе</button>
                          <button type="button" className={timelineFilter === 'deal' ? 'is-active' : ''} onClick={() => setTimelineFilter('deal')}>Ця угода</button>
                          <button type="button" className={timelineFilter === 'general' ? 'is-active' : ''} onClick={() => setTimelineFilter('general')}>Загальне</button>
                        </div>
                        {showAddInteraction && (
                          <form className="add-interaction-form" onSubmit={handleAddInteraction}>
                            <select value={newInteractionType} onChange={(e) => setNewInteractionType(e.target.value)}>
                              {Object.entries(INTERACTION_TYPES).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                            <select value={newInteractionScope} onChange={(e) => setNewInteractionScope(e.target.value)}>
                              <option value="deal">До цієї угоди{selectedSale.saleNumber ? ` (${selectedSale.saleNumber})` : ''}</option>
                              <option value="general">Загальне по клієнту</option>
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
                          {timeline.length === 0 ? (
                            <p className="no-data">{showAddInteraction ? null : 'Немає записів'}</p>
                          ) : (
                            <ul className="interactions-list">
                              {timeline.map((i) => {
                                const files = interactionFiles[i._id] || [];
                                return (
                                  <li key={i._id}>
                                    <div className="interaction-meta">
                                      <span className="interaction-type">{INTERACTION_TYPES[i.type] || i.type}</span>
                                      {i._saleNumber
                                        ? <span className="interaction-sale-chip">{i._saleNumber}</span>
                                        : <span className="interaction-sale-chip is-general">загальне</span>}
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

      <NextActionModal
        open={showNextAction}
        onClose={() => setShowNextAction(false)}
        onSaved={() => loadData(selectedSaleId)}
        clients={client ? [client] : []}
      />
    </div>
  );
}

export default ClientCardModal;
