import React, { useState, useEffect, useMemo } from 'react';
import API_BASE_URL from '../../config';
import { getClients } from '../../utils/clientsAPI';
import { createSale, updateSale } from '../../utils/salesAPI';
import AdditionalCostsEditor from './AdditionalCostsEditor';
import EquipmentEditor from './EquipmentEditor';
import ClientFormModal from './ClientFormModal';
import './SaleFormModal.css';

function SaleFormModal({ open, onClose, onSuccess, editSale = null, user }) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);

  const [form, setForm] = useState({
    clientId: '',
    clientName: '',
    edrpou: '',
    equipmentItems: [{ id: crypto.randomUUID?.() || '1', equipmentId: '', type: '', serialNumber: '', amount: 0 }],
    additionalCosts: [{ id: crypto.randomUUID?.() || '1', description: '', amount: 0, quantity: 1, notes: '' }],
    saleDate: new Date().toISOString().slice(0, 10),
    warrantyMonths: 12,
    status: 'confirmed',
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
          saleDate: editSale.saleDate ? new Date(editSale.saleDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          warrantyMonths: editSale.warrantyMonths || 12,
          status: editSale.status || 'confirmed',
          notes: editSale.notes || ''
        });
      } else {
        setForm({
          clientId: '',
          clientName: '',
          edrpou: '',
          equipmentItems: [{ id: crypto.randomUUID?.() || '1', equipmentId: '', type: '', serialNumber: '', amount: 0 }],
          additionalCosts: [{ id: crypto.randomUUID?.() || '1', description: '', amount: 0, quantity: 1, notes: '' }],
          saleDate: new Date().toISOString().slice(0, 10),
          warrantyMonths: 12,
          status: 'confirmed',
          notes: ''
        });
      }
      if (editSale) {
        setClientSearch(editSale.clientId?.name || editSale.clientName || '');
      } else {
        setClientSearch('');
      }
      loadClients();
      loadEquipment();
    }
  }, [open, editSale]);

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
    const validEquipment = form.equipmentItems.filter(i => i.equipmentId && (i.amount || 0) > 0);
    if (validEquipment.length === 0) {
      alert('Додайте щонайменше одну позицію обладнання з сумою');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        clientId: form.clientId,
        edrpou: form.edrpou,
        managerLogin: user?.login,
        equipmentItems: validEquipment.map(i => ({
          equipmentId: i.equipmentId,
          type: i.type,
          serialNumber: i.serialNumber,
          amount: parseFloat(i.amount) || 0
        })),
        mainProductAmount: validEquipment.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
        additionalCosts: form.additionalCosts
          .filter(c => c.description?.trim())
          .map(c => ({
            description: c.description.trim(),
            amount: parseFloat(c.amount) || 0,
            quantity: parseInt(c.quantity) || 1,
            notes: c.notes?.trim() || ''
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

            <EquipmentEditor
              items={form.equipmentItems}
              equipment={equipmentWithSale}
              onChange={items => setForm(prev => ({ ...prev, equipmentItems: items }))}
            />

            <div className="form-row">
              <div className="form-group">
                <label>Дата продажу</label>
                <input
                  type="date"
                  value={form.saleDate}
                  onChange={e => setForm(prev => ({ ...prev, saleDate: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label>Гарантія (місяців)</label>
                <select
                  value={form.warrantyMonths}
                  onChange={e => setForm(prev => ({ ...prev, warrantyMonths: parseInt(e.target.value) }))}
                >
                  <option value={6}>6</option>
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                  <option value={36}>36</option>
                </select>
              </div>
            </div>

            <AdditionalCostsEditor
              costs={form.additionalCosts}
              onChange={costs => setForm(prev => ({ ...prev, additionalCosts: costs }))}
            />

            <div className="form-group">
              <label>Примітки</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Додаткові примітки"
                rows={2}
              />
            </div>

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
