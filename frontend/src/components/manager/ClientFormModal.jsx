import React, { useState, useEffect } from 'react';
import { createClient, updateClient } from '../../utils/clientsAPI';
import './ClientFormModal.css';

function ClientFormModal({ open, onClose, onSuccess, editClient = null, user }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    edrpou: '',
    name: '',
    address: '',
    contactPerson: '',
    contactPhone: '',
    email: '',
    assignedManagerLogin: '',
    region: '',
    notes: ''
  });

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
          region: '',
          notes: ''
        });
      }
    }
  }, [open, editClient, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      alert('Введіть назву клієнта');
      return;
    }

    setLoading(true);
    try {
      if (editClient) {
        await updateClient(editClient._id, form);
        alert('Клієнта оновлено');
      } else {
        await createClient(form);
        alert('Клієнта створено');
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
      <div className="modal-content client-form-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editClient ? '✏️ Редагувати клієнта' : '👤 Новий клієнт'}</h3>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>ЄДРПОУ</label>
              <input
                type="text"
                value={form.edrpou}
                onChange={e => setForm(prev => ({ ...prev, edrpou: e.target.value }))}
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
