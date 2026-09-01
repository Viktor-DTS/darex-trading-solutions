import React, { useState, useEffect, useCallback } from 'react';
import { createClient, updateClient, checkEdrpou, getUsers, getClients, lookupCompanyByEdrpou } from '../../utils/clientsAPI';
import './ClientFormModal.css';

const canAssignManager = (role) => ['admin', 'administrator', 'mgradm'].includes((role || '').toLowerCase());

function ClientFormModal({ open, onClose, onSuccess, editClient = null, initialForm = null, user }) {
  const [loading, setLoading] = useState(false);
  const [edrpouConflict, setEdrpouConflict] = useState(null);
  const [edrpouSuggestions, setEdrpouSuggestions] = useState([]);
  const [edrpouLookupLoading, setEdrpouLookupLoading] = useState(false);
  const [showEdrpouDropdown, setShowEdrpouDropdown] = useState(false);
  const [managers, setManagers] = useState([]);
  const [form, setForm] = useState({
    edrpou: '',
    name: '',
    address: '',
    contacts: [{ id: '1', person: '', phone: '' }],
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
        const contacts = (editClient.contacts && editClient.contacts.length > 0)
          ? editClient.contacts.map((c, i) => ({ id: String(i + 1), person: c.person || '', phone: c.phone || '' }))
          : (editClient.contactPerson || editClient.contactPhone)
            ? [{ id: '1', person: editClient.contactPerson || '', phone: editClient.contactPhone || '' }]
            : [{ id: '1', person: '', phone: '' }];
        setForm({
          edrpou: editClient.edrpou || '',
          name: editClient.name || '',
          address: editClient.address || '',
          contacts,
          email: editClient.email || '',
          assignedManagerLogin: editClient.assignedManagerLogin || user?.login || '',
          assignedManagerLogin2: editClient.assignedManagerLogin2 || '',
          region: editClient.region || '',
          notes: editClient.notes || ''
        });
      } else {
        const emptyForm = {
          edrpou: '',
          name: '',
          address: '',
          contacts: [{ id: '1', person: '', phone: '' }],
          email: '',
          assignedManagerLogin: user?.login || '',
          assignedManagerLogin2: '',
          region: user?.region || '',
          notes: '',
        };
        if (initialForm) {
          setForm({
            ...emptyForm,
            ...initialForm,
            contacts: initialForm.contacts?.length
              ? initialForm.contacts.map((c, i) => ({
                id: c.id || String(i + 1),
                person: c.person || '',
                phone: c.phone || '',
              }))
              : emptyForm.contacts,
          });
        } else {
          setForm(emptyForm);
        }
      }
    }
    setEdrpouConflict(null);
    setEdrpouSuggestions([]);
    setEdrpouLookupLoading(false);
    setShowEdrpouDropdown(false);
  }, [open, editClient, initialForm, user]);

  useEffect(() => {
    const q = (form.edrpou || '').trim();
    if (!open || q.length < 2) {
      setEdrpouSuggestions([]);
      setEdrpouLookupLoading(false);
      return undefined;
    }
    setEdrpouLookupLoading(true);
    const timer = setTimeout(async () => {
      try {
        const digits = q.replace(/\D/g, '');
        const data = await getClients({ q, limit: 15 });
        const list = Array.isArray(data) ? data : (data.clients || []);
        const normalized = q.toLowerCase();
        let matched = list.filter((c) => {
          const edrpou = (c.edrpou || '').toLowerCase();
          return edrpou.includes(normalized) || (c.name || '').toLowerCase().includes(normalized);
        });
        if (matched.length === 0 && list.length > 0) matched = list;

        if (digits.length >= 8 && digits.length <= 10) {
          const registry = await lookupCompanyByEdrpou(digits);
          if (registry?.name) {
            const already = matched.some(
              (c) => String(c.edrpou || '').replace(/\D/g, '') === digits
            );
            if (!already) {
              matched = [
                {
                  _id: null,
                  edrpou: registry.edrpou || digits,
                  name: registry.name,
                  lookupSource: registry.source || 'registry',
                  isRegistryHint: true,
                },
                ...matched,
              ];
            }
          }
        }
        setEdrpouSuggestions(matched);
      } catch {
        setEdrpouSuggestions([]);
      } finally {
        setEdrpouLookupLoading(false);
      }
    }, 2000);
    return () => {
      clearTimeout(timer);
    };
  }, [form.edrpou, open]);

  // Автоматично підтягувати регіон першого менеджера
  useEffect(() => {
    if (!open) return;
    const login = form.assignedManagerLogin;
    if (!login) return;
    if (canAssignManager(user?.role)) {
      const m = managers.find(x => (x.login || '') === login);
      if (m?.region) setForm(prev => ({ ...prev, region: m.region }));
    } else {
      if (user?.login === login && user?.region) setForm(prev => ({ ...prev, region: user.region }));
    }
  }, [open, form.assignedManagerLogin, managers, user?.role, user?.login, user?.region]);

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
    setTimeout(() => setShowEdrpouDropdown(false), 200);
    validateEdrpou(form.edrpou);
  };

  const edrpouSourceLabel = (source) => {
    if (source === 'client') return 'CRM';
    if (source === 'procurement_history') return 'Закупівлі';
    if (source === 'registry') return 'Реєстр';
    return '';
  };

  const handleSelectEdrpouSuggestion = (c) => {
    setForm((prev) => ({
      ...prev,
      edrpou: c.edrpou || prev.edrpou,
      name: c.name || prev.name,
    }));
    setShowEdrpouDropdown(false);
    setEdrpouConflict(null);
    if (c._id) {
      validateEdrpou(c.edrpou);
    }
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
      const validContacts = form.contacts
        .filter(c => (c.person || '').trim() || (c.phone || '').trim())
        .map(c => ({ person: (c.person || '').trim(), phone: (c.phone || '').trim() }));
      const payload = {
        ...form,
        contacts: validContacts.length > 0 ? validContacts : [{ person: '', phone: '' }]
      };
      if (editClient) {
        await updateClient(editClient._id, payload);
        alert('Клієнта оновлено');
      } else {
        const newClient = await createClient(payload);
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
              <div className="client-autocomplete edrpou-autocomplete">
                <input
                  type="text"
                  value={form.edrpou}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, edrpou: e.target.value }));
                    setEdrpouConflict(null);
                    setShowEdrpouDropdown(true);
                  }}
                  onFocus={() => setShowEdrpouDropdown(true)}
                  onBlur={handleEdrpouBlur}
                  placeholder="ЄДРПОУ — підказка з CRM та реєстрів"
                  autoComplete="off"
                />
                {edrpouLookupLoading && (
                  <span className="edrpou-lookup-status" aria-live="polite">
                    <span className="edrpou-lookup-spinner" aria-hidden />
                    Шукаємо…
                  </span>
                )}
                {showEdrpouDropdown && (form.edrpou || '').trim().length >= 2 && (
                  <ul className="client-dropdown">
                    {edrpouLookupLoading && edrpouSuggestions.length === 0 && (
                      <li className="empty">Пошук у CRM та реєстрах…</li>
                    )}
                    {!edrpouLookupLoading && edrpouSuggestions.length === 0 && (
                      <li className="empty">За цим ЄДРПОУ нічого не знайдено</li>
                    )}
                    {edrpouSuggestions.slice(0, 10).map((c, idx) => (
                      <li
                        key={c._id || `registry-${c.edrpou}-${idx}`}
                        onMouseDown={() => handleSelectEdrpouSuggestion(c)}
                      >
                        <span className="edrpou-badge">{c.edrpou || '—'}</span>
                        <span>{c.name}</span>
                        {c.lookupSource && (
                          <span className="edrpou-source-badge">{edrpouSourceLabel(c.lookupSource)}</span>
                        )}
                        {c.contactPhone && <span className="client-dropdown-phone">{c.contactPhone}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
            <div className="form-group contacts-section">
              <label>Контакти</label>
              {form.contacts.map((c, idx) => (
                <div key={c.id} className="form-row contact-row">
                  <div className="form-group">
                    <input
                      type="text"
                      value={c.person}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        contacts: prev.contacts.map((ct, i) =>
                          i === idx ? { ...ct, person: e.target.value } : ct
                        )
                      }))}
                      placeholder="Контактна особа"
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="text"
                      value={c.phone}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        contacts: prev.contacts.map((ct, i) =>
                          i === idx ? { ...ct, phone: e.target.value } : ct
                        )
                      }))}
                      placeholder="Телефон"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-remove-contact"
                    onClick={() => setForm(prev => ({
                      ...prev,
                      contacts: prev.contacts.filter((_, i) => i !== idx)
                    }))}
                    disabled={form.contacts.length <= 1}
                    title="Видалити контакт"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-add-contact"
                onClick={() => setForm(prev => ({
                  ...prev,
                  contacts: [...prev.contacts, { id: String(Date.now()), person: '', phone: '' }]
                }))}
              >
                + Додати контакт
              </button>
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
              <label>Регіональний менеджер</label>
              <input
                type="text"
                value={form.region}
                readOnly
                placeholder="Автозаповнення при виборі менеджера"
                title="Заповнюється автоматично з регіону відповідального менеджера"
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
