import React, { useState, useEffect, useCallback } from 'react';
import { createClient, updateClient, checkEdrpou, getUsers } from '../../utils/clientsAPI';
import './ClientFormModal.css';

const canAssignManager = (role) => ['admin', 'administrator', 'mgradm'].includes((role || '').toLowerCase());

function ClientFormModal({ open, onClose, onSuccess, editClient = null, user }) {
  const [loading, setLoading] = useState(false);
  const [edrpouConflict, setEdrpouConflict] = useState(null);
  const [managers, setManagers] = useState([]);
  const [form, setForm] = useState({
    edrpou: '',
    name: '',
    address: '',
    contactPerson: '',
    contactPhone: '',
    email: '',
    assignedManagerLogin: '',
    assignedManagerLogin2: '',
    region: '',
    notes: ''
  });

  useEffect(() => {
    if (open && canAssignManager(user?.role)) {
      getUsers().then(list => {
        const mgrs = (list || []).filter(u => (u.role || '').toLowerCase() === 'manager');
        setManagers(mgrs);
      });
    }
  }, [open, user?.role]);

  useEffect(() => {
    if (open) {
      if (editClient) {
        setForm({
          edrpou: editClient.edrpou || '',
          name: editClient.name || '',
          address: editClient.address || '',
          contactPerson: editClient.contactPerson || '',
          contactPhone: editClient.contactPhone || '',
          email: editClient.email || '',
          assignedManagerLogin: editClient.assignedManagerLogin || user?.login || '',
          assignedManagerLogin2: editClient.assignedManagerLogin2 || '',
          region: editClient.region || '',
          notes: editClient.notes || ''
        });
      } else {
        setForm({
          edrpou: '',
          name: '',
          address: '',
          contactPerson: '',
          contactPhone: '',
          email: '',
          assignedManagerLogin: user?.login || '',
          assignedManagerLogin2: '',
          region: '',
          notes: ''
        });
      }
    }
    setEdrpouConflict(null);
  }, [open, editClient, user]);

  const validateEdrpou = useCallback(async (edrpouVal) => {
    const trimmed = (edrpouVal || '').trim();
    setEdrpouConflict(null);
    if (!trimmed) return null;
    const result = await checkEdrpou(trimmed, editClient?._id);
    if (result.exists && !result.sameManager) {
      const conflict = {
        managerName: result.assignedManagerName || result.assignedManagerLogin,
        clientName: result.clientName
      };
      setEdrpouConflict(conflict);
      return conflict;
    }
    return null;
  }, [editClient?._id]);

  const handleEdrpouBlur = () => {
    validateEdrpou(form.edrpou);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      alert('Введіть назву клієнта');
      return;
    }
    const conflict = await validateEdrpou(form.edrpou);
    if (conflict) {
      alert(`Клієнт з ЄДРПОУ ${form.edrpou} вже закріплений за менеджером ${conflict.managerName}${conflict.clientName ? ` (${conflict.clientName})` : ''}. Неможливо створити дублікат.`);
      return;
    }

    setLoading(true);
    try {
      if (editClient) {
        await updateClient(editClient._id, form);
        alert('Клієнта оновлено');
      } else {
        const newClient = await createClient(form);
        alert('Клієнта створено');
        onSuccess?.(newClient);
      }
      if (editClient) onSuccess?.();
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
      <div className="modal-content client-form-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editClient ? '✏️ Редагувати клієнта' : '👤 Новий клієнт'}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {edrpouConflict && (
              <div className="edrpou-conflict-notice">
                ⚠️ Клієнт з цим ЄДРПОУ вже закріплений за менеджером <strong>{edrpouConflict.managerName}</strong>
                {edrpouConflict.clientName && ` (${edrpouConflict.clientName})`}.
              </div>
            )}
            <div className="form-group">
              <label>ЄДРПОУ</label>
              <input
                type="text"
                value={form.edrpou}
                onChange={e => { setForm(prev => ({ ...prev, edrpou: e.target.value })); setEdrpouConflict(null); }}
                onBlur={handleEdrpouBlur}
                placeholder="12345678"
              />
            </div>
            <div className="form-group">
              <label>Назва <span className="required">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Назва компанії"
                required
              />
            </div>
            <div className="form-group">
              <label>Адреса</label>
              <input
                type="text"
                value={form.address}
                onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Адреса"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Контактна особа</label>
                <input
                  type="text"
                  value={form.contactPerson}
                  onChange={e => setForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                  placeholder="ПІБ"
                />
              </div>
              <div className="form-group">
                <label>Телефон</label>
                <input
                  type="text"
                  value={form.contactPhone}
                  onChange={e => setForm(prev => ({ ...prev, contactPhone: e.target.value }))}
                  placeholder="+380..."
                />
              </div>
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            {canAssignManager(user?.role) && (
              <>
                <div className="form-group">
                  <label>Відповідальний менеджер <span className="required">*</span></label>
                  <select
                    value={form.assignedManagerLogin}
                    onChange={e => setForm(prev => ({ ...prev, assignedManagerLogin: e.target.value }))}
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
                    value={form.assignedManagerLogin2 || ''}
                    onChange={e => setForm(prev => ({ ...prev, assignedManagerLogin2: e.target.value || '' }))}
                  >
                    <option value="">— Немає —</option>
                    {managers.filter(m => m.login !== form.assignedManagerLogin).map(m => (
                      <option key={m.login || m._id} value={m.login}>{m.name || m.login}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="form-group">
              <label>Регіон</label>
              <input
                type="text"
                value={form.region}
                onChange={e => setForm(prev => ({ ...prev, region: e.target.value }))}
                placeholder="Регіон"
              />
            </div>
            <div className="form-group">
              <label>Примітки</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Додаткові примітки"
                rows={3}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>Скасувати</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Збереження...' : (editClient ? 'Зберегти' : 'Додати клієнта')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ClientFormModal;
