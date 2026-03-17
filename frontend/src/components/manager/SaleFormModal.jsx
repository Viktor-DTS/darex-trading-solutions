import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../../config';
import { getClients, getUsers } from '../../utils/clientsAPI';
import { createSale, updateSale, getSaleFiles, uploadSaleFiles } from '../../utils/salesAPI';
import { getFileOpenToken } from '../../utils/clientsAPI';
import AdditionalCostsEditor from './AdditionalCostsEditor';
import PaymentsEditor from './PaymentsEditor';
import EquipmentEditor from './EquipmentEditor';
import ProposedEquipmentEditor from './ProposedEquipmentEditor';
import ClientFormModal from './ClientFormModal';
import './SaleFormModal.css';

const canAssignSaleManager = (role) => ['admin', 'administrator', 'mgradm'].includes((role || '').toLowerCase());

const SALE_STATUS_OPTIONS = [
  { value: 'in_negotiation', label: 'В процесі домовленості' },
  { value: 'in_realization', label: 'Реалізація угоди' },
  { value: 'success', label: 'Успішно реалізовано' }
];
const STATUS_LABELS_LEGACY = { draft: 'Чернетка', primary_contact: 'Первичний контакт', quote_sent: 'Відправив КП', pnr: 'ПНР', in_negotiation: 'В процесі домовленості', in_realization: 'Реалізація угоди', confirmed: 'Підтверджено', cancelled: 'Скасовано' };
const statusLabel = (v) => SALE_STATUS_OPTIONS.find(o => o.value === v)?.label || STATUS_LABELS_LEGACY[v] || v || '—';

function SaleFormModal({ open, onClose, onSuccess, editSale = null, initialClient = null, user }) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [managers, setManagers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [saleFiles, setSaleFiles] = useState([]);
  const [filesUploading, setFilesUploading] = useState(false);

  const [form, setForm] = useState({
    clientId: '',
    clientName: '',
    edrpou: '',
    managerLogin: '',
    managerLogin2: '',
    tenderEmployeeLogin: '',
    equipmentItems: [{ id: crypto.randomUUID?.() || '1', equipmentId: '', type: '', serialNumber: '', amount: 0 }],
    additionalCosts: [{ id: crypto.randomUUID?.() || '1', description: '', amount: 0, quantity: 1, notes: '' }],
    payments: [{ id: crypto.randomUUID?.() || '1', date: new Date().toISOString().slice(0, 10), amount: 0, currency: 'UAH', rate: 1 }],
    saleDate: new Date().toISOString().slice(0, 10),
    warrantyMonths: 12,
    status: 'primary_contact',
    notes: ''
  });

  useEffect(() => {
    if (open) {
      if (editSale) {
        const eqId = editSale.equipmentId?._id || editSale.equipmentId;
        const eqItems = editSale.equipmentItems && editSale.equipmentItems.length > 0
          ? editSale.equipmentItems.map(i => ({
              id: crypto.randomUUID?.() || Date.now().toString(),
              equipmentId: i.equipmentId?._id || i.equipmentId || '',
              type: i.type || '',
              serialNumber: i.serialNumber || '',
              amount: i.amount || 0
            }))
          : eqId ? [{
              id: crypto.randomUUID?.() || '1',
              equipmentId: eqId,
              type: editSale.mainProductName || editSale.equipmentId?.type || '',
              serialNumber: editSale.mainProductSerial || editSale.equipmentId?.serialNumber || '',
              amount: editSale.mainProductAmount || 0
            }] : [{ id: crypto.randomUUID?.() || '1', equipmentId: '', type: '', serialNumber: '', amount: 0 }];
        setForm({
          clientId: editSale.clientId?._id || editSale.clientId || '',
          clientName: editSale.clientId?.name || editSale.clientName || '',
          edrpou: editSale.edrpou || editSale.clientId?.edrpou || '',
          managerLogin: editSale.managerLogin || user?.login || '',
          managerLogin2: editSale.managerLogin2 || '',
          tenderEmployeeLogin: editSale.tenderEmployeeLogin || '',
          equipmentItems: eqItems,
          additionalCosts: (editSale.additionalCosts || []).length
            ? editSale.additionalCosts.map(c => ({
                id: c.id || crypto.randomUUID?.(),
                description: c.description || '',
                amount: c.amount || 0,
                quantity: c.quantity || 1,
                notes: c.notes || ''
              }))
            : [{ id: crypto.randomUUID?.() || '1', description: '', amount: 0, quantity: 1, notes: '' }],
          payments: (editSale.payments || []).length
            ? editSale.payments.map(p => ({
                id: p.id || crypto.randomUUID?.(),
                date: p.date ? new Date(p.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                amount: p.amount || 0,
                currency: p.currency || 'UAH',
                rate: p.rate ?? 1
              }))
            : [{ id: crypto.randomUUID?.() || '1', date: new Date().toISOString().slice(0, 10), amount: 0, currency: 'UAH', rate: 1 }],
          saleDate: editSale.saleDate ? new Date(editSale.saleDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          warrantyMonths: editSale.warrantyMonths || 12,
          status: ['in_negotiation', 'in_realization', 'success'].includes(editSale.status) ? editSale.status : (['success', 'confirmed'].includes(editSale.status) ? 'success' : editSale.status === 'in_progress' ? 'in_realization' : 'in_negotiation'),
          notes: editSale.notes || ''
        });
      } else {
        const client = initialClient || {};
        setForm({
          clientId: client._id || '',
          clientName: client.name || '',
          edrpou: client.edrpou || '',
          managerLogin: user?.login || '',
          managerLogin2: '',
          tenderEmployeeLogin: '',
          equipmentItems: [{ id: crypto.randomUUID?.() || '1', equipmentId: '', type: '', serialNumber: '', amount: 0 }],
          additionalCosts: [{ id: crypto.randomUUID?.() || '1', description: '', amount: 0, quantity: 1, notes: '' }],
          payments: [{ id: crypto.randomUUID?.() || '1', date: new Date().toISOString().slice(0, 10), amount: 0, currency: 'UAH', rate: 1 }],
          saleDate: new Date().toISOString().slice(0, 10),
          warrantyMonths: 12,
          status: 'in_negotiation',
          notes: ''
        });
        setClientSearch(client.name || '');
      }
      if (editSale) {
        setClientSearch(editSale.clientId?.name || editSale.clientName || '');
      } else if (!initialClient) {
        setClientSearch('');
      }
      loadClients();
      loadEquipment();
    }
  }, [open, editSale]);

  useEffect(() => {
    if (open && editSale?._id) {
      getSaleFiles(editSale._id).then(setSaleFiles).catch(() => setSaleFiles([]));
    } else {
      setSaleFiles([]);
    }
  }, [open, editSale?._id]);

  useEffect(() => {
    if (open) {
      getUsers().then(list => {
        const users = list || [];
        setAllUsers(users.filter(u => !u.dismissed));
        if (canAssignSaleManager(user?.role)) {
          setManagers(users.filter(u => (u.role || '').toLowerCase() === 'manager'));
        }
      });
    }
  }, [open, user?.role]);

  const loadClients = async () => {
    try {
      const data = await getClients();
      setClients(Array.isArray(data) ? data : data.clients || []);
    } catch (err) {
      console.error(err);
      setClients([]);
    }
  };

  const loadEquipment = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/for-sale`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEquipment(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
      setEquipment([]);
    }
  };

  const equipmentWithSale = useMemo(() => {
    if (!editSale || !open) return equipment;
    const fromSale = [];
    if (editSale.equipmentItems?.length) {
      editSale.equipmentItems.forEach(i => {
        const eq = i.equipmentId;
        if (eq) fromSale.push(typeof eq === 'object' ? eq : { _id: eq, type: i.type, serialNumber: i.serialNumber });
      });
    } else if (editSale.equipmentId) {
      const eq = editSale.equipmentId;
      if (eq) fromSale.push(typeof eq === 'object' ? eq : { _id: eq, type: editSale.mainProductName, serialNumber: editSale.mainProductSerial });
    }
    const existingIds = new Set(equipment.map(e => e._id));
    const toAdd = fromSale.filter(eq => eq && !existingIds.has(eq._id));
    return [...toAdd, ...equipment];
  }, [equipment, editSale, open]);

  const filteredClients = clients.filter(c =>
    (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.edrpou || '').includes(clientSearch)
  );

  const openSaleFile = async (fileId) => {
    try {
      const token = await getFileOpenToken(fileId);
      const base = API_BASE_URL.replace(/\/api\/?$/, '') || window.location.origin;
      const url = `${base}/files/open/${fileId}?token=${encodeURIComponent(token)}`;
      window.open(url, '_blank');
    } catch (err) {
      alert(err.message || 'Помилка відкриття файлу');
    }
  };

  const handleSaleFileUpload = async (e) => {
    if (!editSale?._id || !e.target.files?.length) return;
    setFilesUploading(true);
    try {
      const res = await uploadSaleFiles(editSale._id, Array.from(e.target.files));
      if (res.files?.length) setSaleFiles(prev => [...res.files, ...prev]);
      e.target.value = '';
    } catch (err) {
      alert(err.message || 'Помилка завантаження');
    } finally {
      setFilesUploading(false);
    }
  };

  const handleSelectClient = (c) => {
    setForm(prev => ({
      ...prev,
      clientId: c._id,
      clientName: c.name,
      edrpou: c.edrpou
    }));
    setClientSearch(c.name);
    setShowClientDropdown(false);
  };


  const totalEquipmentAmount = form.equipmentItems.reduce((s, i) => s + (i.amount || 0), 0);
  const totalAmount = totalEquipmentAmount + form.additionalCosts.reduce(
    (s, c) => s + (c.amount || 0) * (c.quantity || 1),
    0
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clientId) {
      alert('Оберіть клієнта');
      return;
    }
    const requiresEquipment = ['in_negotiation', 'in_realization', 'success'].includes(form.status);
    const isProposedEquipment = form.status === 'in_negotiation';
    const validEquipment = isProposedEquipment
      ? form.equipmentItems.filter(i => ((i.type || '').trim() || (i.serialNumber || '').trim()) && (i.amount || 0) > 0)
      : form.equipmentItems.filter(i => i.equipmentId && (i.amount || 0) > 0);
    if (requiresEquipment && validEquipment.length === 0) {
      alert(isProposedEquipment ? 'Додайте щонайменше одну позицію запропонованого обладнання з сумою' : 'Додайте щонайменше одну позицію відвантаженого обладнання зі складу');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        clientId: form.clientId,
        edrpou: form.edrpou,
        managerLogin: canAssignSaleManager(user?.role) ? (form.managerLogin || user?.login) : user?.login,
        managerLogin2: canAssignSaleManager(user?.role) ? (form.managerLogin2 || undefined) : undefined,
        tenderEmployeeLogin: form.tenderEmployeeLogin || undefined,
        equipmentItems: validEquipment.length > 0 ? validEquipment.map(i => ({
          ...(i.equipmentId ? { equipmentId: i.equipmentId } : {}),
          type: (i.type || '').trim(),
          serialNumber: (i.serialNumber || '').trim(),
          amount: parseFloat(i.amount) || 0
        })) : [],
        mainProductAmount: validEquipment.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
        additionalCosts: form.additionalCosts
          .filter(c => c.description?.trim())
          .map(c => ({
            description: c.description.trim(),
            amount: parseFloat(c.amount) || 0,
            quantity: parseInt(c.quantity) || 1,
            notes: c.notes?.trim() || ''
          })),
        payments: (form.payments || [])
          .filter(p => (p.amount || 0) > 0)
          .map(p => ({
            id: p.id,
            date: p.date,
            amount: parseFloat(p.amount) || 0
          })),
        saleDate: form.saleDate,
        warrantyMonths: parseInt(form.warrantyMonths) || 12,
        status: form.status,
        notes: form.notes?.trim() || ''
      };

      if (editSale) {
        await updateSale(editSale._id, payload);
        alert('Продаж оновлено');
      } else {
        await createSale(payload);
        alert('Продаж створено');
      }
      onSuccess?.();
      onClose?.();
    } catch (err) {
      alert(err.message || 'Помилка збереження');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sale-form-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editSale ? '✏️ Редагувати продаж' : '💰 Новий продаж'}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body sale-form-body">
            <div className="form-group">
              <label>Клієнт <span className="required">*</span></label>
              <div className="client-autocomplete-with-btn">
                <div className="client-autocomplete">
                  <input
                    type="text"
                    value={clientSearch}
                    onChange={e => {
                      setClientSearch(e.target.value);
                      setShowClientDropdown(true);
                      if (!e.target.value) setForm(prev => ({ ...prev, clientId: '', clientName: '', edrpou: '' }));
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                    placeholder="Пошук за назвою або ЄДРПОУ"
                  />
                  {showClientDropdown && (
                    <ul className="client-dropdown">
                      {filteredClients.slice(0, 10).map(c => (
                        <li key={c._id} onMouseDown={() => handleSelectClient(c)}>
                          <span>{c.name}</span>
                          {c.edrpou && <span className="edrpou-badge">{c.edrpou}</span>}
                        </li>
                      ))}
                      {filteredClients.length === 0 && <li className="empty">Клієнтів не знайдено</li>}
                      <li className="add-client-item" onMouseDown={() => { setShowClientDropdown(false); setShowClientForm(true); }}>
                        <span className="add-client-btn">+ Створити нового клієнта</span>
                      </li>
                    </ul>
                  )}
                </div>
                <button type="button" className="btn-add-client" onClick={() => setShowClientForm(true)} title="Створити клієнта">
                  + Клієнт
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>ЄДРПОУ</label>
              <input
                type="text"
                value={form.edrpou || ''}
                onChange={e => setForm(prev => ({ ...prev, edrpou: e.target.value }))}
                placeholder="Заповниться з клієнта (порожньо для приватним осіб)"
              />
            </div>

            {canAssignSaleManager(user?.role) && (
              <>
                <div className="form-group">
                  <label>Відповідальний менеджер <span className="required">*</span></label>
                  <select
                    value={form.managerLogin}
                    onChange={e => setForm(prev => ({ ...prev, managerLogin: e.target.value }))}
                    required
                  >
                    <option value="">— Оберіть менеджера —</option>
                    {managers.map(m => (
                      <option key={m.login || m._id} value={m.login}>{m.name || m.login}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Другий відповідальний</label>
                  <select
                    value={form.managerLogin2 || ''}
                    onChange={e => setForm(prev => ({ ...prev, managerLogin2: e.target.value || '' }))}
                  >
                    <option value="">— Немає —</option>
                    {managers.filter(m => m.login !== form.managerLogin).map(m => (
                      <option key={m.login || m._id} value={m.login}>{m.name || m.login}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="form-group">
              <label>Співробітник тендерного відділу</label>
              <select
                value={form.tenderEmployeeLogin || ''}
                onChange={e => setForm(prev => ({ ...prev, tenderEmployeeLogin: e.target.value || '' }))}
              >
                <option value="">— Немає —</option>
                {allUsers.map(u => (
                  <option key={u.login || u._id} value={u.login}>{u.name || u.login}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Статус угоди</label>
              <select
                value={form.status || 'in_negotiation'}
                onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
              >
                {SALE_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {form.status === 'in_negotiation' ? (
              <ProposedEquipmentEditor
                items={form.equipmentItems}
                onChange={items => setForm(prev => ({ ...prev, equipmentItems: items }))}
              />
            ) : (
              <EquipmentEditor
                items={form.equipmentItems}
                equipment={equipmentWithSale}
                onChange={items => setForm(prev => ({ ...prev, equipmentItems: items }))}
                label="Відвантажене обладнання"
              />
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Дата продажу</label>
                {form.status === 'in_negotiation' ? (
                  <div className="field-placeholder">—</div>
                ) : (
                  <input
                    type="date"
                    value={form.saleDate}
                    onChange={e => setForm(prev => ({ ...prev, saleDate: e.target.value }))}
                    required
                  />
                )}
              </div>
              <div className="form-group">
                <label>Гарантія (місяців)</label>
                {form.status === 'in_negotiation' ? (
                  <div className="field-placeholder">—</div>
                ) : (
                  <select
                    value={form.warrantyMonths}
                    onChange={e => setForm(prev => ({ ...prev, warrantyMonths: parseInt(e.target.value) }))}
                  >
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                    <option value={36}>36</option>
                  </select>
                )}
              </div>
            </div>

            <AdditionalCostsEditor
              costs={form.additionalCosts}
              onChange={costs => setForm(prev => ({ ...prev, additionalCosts: costs }))}
            />

            {form.status === 'in_negotiation' ? (
              <div className="form-group">
                <label>Платежі</label>
                <div className="field-placeholder">—</div>
              </div>
            ) : (
              <PaymentsEditor
                payments={form.payments || [{ id: '1', date: new Date().toISOString().slice(0, 10), amount: 0 }]}
                onChange={p => setForm(prev => ({ ...prev, payments: p }))}
              />
            )}

            <div className="form-group">
              <label>Примітки</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Додаткові примітки"
                rows={2}
              />
            </div>

            {editSale?._id && (editSale.statusHistory || []).length > 0 && (
              <div className="form-group sale-status-history">
                <label>Історія зміни статусів</label>
                <ul className="status-history-list">
                  {(editSale.statusHistory || []).map((h, idx) => (
                    <li key={idx}>
                      <span className="status-from">{statusLabel(h.from)}</span>
                      <span className="status-arrow">→</span>
                      <span className="status-to">{statusLabel(h.to)}</span>
                      <span className="status-meta">
                        {h.date ? new Date(h.date).toLocaleString('uk-UA') : ''}
                        {h.userLogin && ` · ${h.userLogin}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {editSale?._id && (
              <div className="form-group sale-files-section">
                <label>Файли угоди</label>
                <div className="sale-files-list">
                  {saleFiles.length > 0 ? (
                    saleFiles.map(f => (
                      <button key={f.id || f._id} type="button" className="sale-file-link" onClick={() => openSaleFile(f.id || f._id)} title="Відкрити/скачати">
                        📎 {f.originalName || 'Файл'}
                      </button>
                    ))
                  ) : (
                    <span className="sale-no-files">Немає файлів</span>
                  )}
                  <label className="sale-btn-upload">
                    <input type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx" multiple hidden onChange={handleSaleFileUpload} />
                    {filesUploading ? 'Завантаження...' : '+ Завантажити файл'}
                  </label>
                </div>
              </div>
            )}

            <div className="sale-total-block">
              <strong>Загальна сума: {totalAmount.toLocaleString('uk-UA')} ₴</strong>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>Скасувати</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Збереження...' : (editSale ? 'Зберегти' : '💰 Створити продаж')}
            </button>
          </div>
        </form>
      </div>

      <ClientFormModal
        open={showClientForm}
        onClose={() => setShowClientForm(false)}
        onSuccess={(newClient) => {
          loadClients();
          if (newClient) handleSelectClient(newClient);
          setShowClientForm(false);
        }}
        user={user}
      />
    </div>
  );
}

export default SaleFormModal;
