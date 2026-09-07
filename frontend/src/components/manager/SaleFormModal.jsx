import React, { useState, useEffect, useMemo, useRef } from 'react';
import API_BASE_URL from '../../config';
import { getClients, getUsers, lookupCompanyByEdrpou } from '../../utils/clientsAPI';
import { createSale, updateSale, getSale, getSaleFiles, uploadSaleFiles, getSaleInvoiceFiles, uploadSaleInvoiceFiles, getSaleDealPreviewNumber } from '../../utils/salesAPI';
import { getFileOpenToken } from '../../utils/clientsAPI';
import AdditionalCostsEditor from './AdditionalCostsEditor';
import PaymentsEditor from './PaymentsEditor';
import EquipmentEditor from './EquipmentEditor';
import ProposedEquipmentEditor from './ProposedEquipmentEditor';
import ClientFormModal from './ClientFormModal';
import SaleShipmentRequestModal from './SaleShipmentRequestModal';
import SaleProcurementModal from './SaleProcurementModal';
import './SaleFormModal.css';

const canAssignSaleManager = (role) => ['admin', 'administrator', 'mgradm'].includes((role || '').toLowerCase());

const TENDER_ROLES = new Set(['tender', 'tenderviddil', 'tendervid']);
const ENGINEER_ROLES = new Set(['service', 'regkerivn', 'igeniring', 'engineering', 'ingeniring']);

function userRoleKey(u) {
  return String(u?.role || '').toLowerCase();
}

function isTenderRole(role) {
  const key = String(role || '').toLowerCase();
  return TENDER_ROLES.has(key) || key.includes('tender') || key.includes('тендер');
}

function isEngineerRole(role) {
  const key = String(role || '').toLowerCase();
  return ENGINEER_ROLES.has(key)
    || key.includes('igenir')
    || key.includes('ingenir')
    || key.includes('engineer')
    || key.includes('інженер');
}

function userOptionLabel(u) {
  const name = u.name || u.login || '—';
  const region = String(u.region || '').trim();
  return region ? `${name} · ${region}` : name;
}

function sortUsersByName(list) {
  return [...list].sort((a, b) => (a.name || a.login || '').localeCompare(b.name || b.login || '', 'uk'));
}

const SALES_BONUS_PCT_ID = 'sales_bonus';

function roundMoney(n) {
  const x = typeof n === 'number' ? n : parseFloat(String(n).replace(',', '.'));
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

const SALE_STATUS_OPTIONS = [
  { value: 'in_negotiation', label: 'В процесі домовленості' },
  { value: 'in_realization', label: 'Реалізація угоди' },
  { value: 'success', label: 'Успішно реалізовано' }
];
const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: '— Оберіть —' },
  { value: 'Безготівка', label: 'Безготівка' },
  { value: 'Готівка', label: 'Готівка' },
  { value: 'На карту', label: 'На карту' },
  { value: 'Інше', label: 'Інше' }
];
const STATUS_LABELS_LEGACY = { draft: 'Чернетка', primary_contact: 'Первичний контакт', quote_sent: 'Відправив КП', pnr: 'ПНР', in_negotiation: 'В процесі домовленості', in_realization: 'Реалізація угоди', confirmed: 'Підтверджено', cancelled: 'Скасовано' };
const statusLabel = (v) => SALE_STATUS_OPTIONS.find(o => o.value === v)?.label || STATUS_LABELS_LEGACY[v] || v || '—';

function SaleFormModal({ open, onClose, onSuccess, onRefreshSale, editSale = null, initialClient = null, initialNotes = '', user, viewOnly = false }) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [managers, setManagers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [showEdrpouDropdown, setShowEdrpouDropdown] = useState(false);
  const [edrpouSuggestions, setEdrpouSuggestions] = useState([]);
  const [edrpouLookupLoading, setEdrpouLookupLoading] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [saleFiles, setSaleFiles] = useState([]);
  const [saleInvoiceFiles, setSaleInvoiceFiles] = useState([]);
  const [filesUploading, setFilesUploading] = useState(false);
  const [invoiceFilesUploading, setInvoiceFilesUploading] = useState(false);
  /** З /api/global-calculation-coefficients (sales): «Премія від продажів», % */
  const [salesBonusPercent, setSalesBonusPercent] = useState(null);
  const [showShipmentRequestModal, setShowShipmentRequestModal] = useState(false);
  const [procurementLine, setProcurementLine] = useState(null);
  const [previewDealNumber, setPreviewDealNumber] = useState('');
  const addressMMRef = useRef(null);
  const addressMMAutocompleteRef = useRef(null);
  const formRef = useRef(null);
  const [copiedKey, setCopiedKey] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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
    notes: '',
    addressMM: '',
    buyer: '',
    invoiceNumber: '',
    paymentMethod: '',
    engineer: '',
    warehouseName: '',
    transportCosts: 0,
    pnrCosts: 0,
    representativeCosts: 0,
    discountPercent: 0,
    partner: '',
    partnerContactName: ''
  });

  useEffect(() => {
    if (open) {
      if (editSale) {
        const eqId = editSale.equipmentId?._id || editSale.equipmentId;
        const eqItems = editSale.equipmentItems && editSale.equipmentItems.length > 0
          ? editSale.equipmentItems.map(i => {
              const lid = i.lineId || crypto.randomUUID?.() || `eq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
              return {
                id: lid,
                lineId: lid,
                equipmentId: i.equipmentId?._id || i.equipmentId || '',
                type: i.type || '',
                serialNumber: i.serialNumber || '',
                amount: i.amount || 0,
                shipmentLocked: !!i.shipmentLocked,
                shipmentRequestId: i.shipmentRequestId || null
              };
            })
          : eqId ? [{
              id: crypto.randomUUID?.() || '1',
              lineId: crypto.randomUUID?.() || '1',
              equipmentId: eqId,
              type: editSale.mainProductName || editSale.equipmentId?.type || '',
              serialNumber: editSale.mainProductSerial || editSale.equipmentId?.serialNumber || '',
              amount: editSale.mainProductAmount || 0,
              shipmentLocked: false,
              shipmentRequestId: null
            }] : [{ id: crypto.randomUUID?.() || '1', lineId: crypto.randomUUID?.() || '1', equipmentId: '', type: '', serialNumber: '', amount: 0, shipmentLocked: false, shipmentRequestId: null }];
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
          notes: editSale.notes || '',
          addressMM: editSale.addressMM || '',
          buyer: editSale.buyer || '',
          invoiceNumber: editSale.invoiceNumber || '',
          paymentMethod: editSale.paymentMethod || '',
          engineer: editSale.engineer || '',
          warehouseName: editSale.warehouseName || '',
          transportCosts: parseFloat(editSale.transportCosts) || 0,
          pnrCosts: parseFloat(editSale.pnrCosts) || 0,
          representativeCosts: parseFloat(editSale.representativeCosts) || 0,
          discountPercent: parseFloat(editSale.discountPercent) || 0,
          partner: editSale.partner || '',
          partnerContactName: editSale.partnerContactName || ''
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
          equipmentItems: [{ id: crypto.randomUUID?.() || '1', lineId: crypto.randomUUID?.() || '1', equipmentId: '', type: '', serialNumber: '', amount: 0, shipmentLocked: false, shipmentRequestId: null }],
          additionalCosts: [{ id: crypto.randomUUID?.() || '1', description: '', amount: 0, quantity: 1, notes: '' }],
          payments: [{ id: crypto.randomUUID?.() || '1', date: new Date().toISOString().slice(0, 10), amount: 0, currency: 'UAH', rate: 1 }],
          saleDate: new Date().toISOString().slice(0, 10),
          warrantyMonths: 12,
          status: 'in_negotiation',
          notes: initialNotes || '',
          addressMM: '',
          buyer: '',
          invoiceNumber: '',
          paymentMethod: '',
          engineer: '',
          warehouseName: '',
          transportCosts: 0,
          pnrCosts: 0,
          representativeCosts: 0,
          discountPercent: 0,
          partner: '',
          partnerContactName: ''
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
  }, [open, editSale, initialClient, initialNotes, user?.login]);

  useEffect(() => {
    if (!open || editSale) {
      setPreviewDealNumber('');
      return undefined;
    }
    let cancelled = false;
    getSaleDealPreviewNumber().then((n) => {
      if (!cancelled) setPreviewDealNumber(n || '');
    });
    return () => {
      cancelled = true;
    };
  }, [open, editSale]);

  useEffect(() => {
    if (open && editSale?._id) {
      getSaleFiles(editSale._id).then(setSaleFiles).catch(() => setSaleFiles([]));
      getSaleInvoiceFiles(editSale._id).then(setSaleInvoiceFiles).catch(() => setSaleInvoiceFiles([]));
    } else {
      setSaleFiles([]);
      setSaleInvoiceFiles([]);
    }
  }, [open, editSale?._id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setSalesBonusPercent(null);
          return;
        }
        const res = await fetch(`${API_BASE_URL}/global-calculation-coefficients`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const salesRows = data.sales?.rows || [];
        const bonusRow = salesRows.find((r) => r.id === SALES_BONUS_PCT_ID);
        if (!cancelled) {
          setSalesBonusPercent(
            bonusRow != null && typeof bonusRow.value === 'number' && !Number.isNaN(bonusRow.value)
              ? roundMoney(bonusRow.value)
              : 0
          );
        }
      } catch (_) {
        if (!cancelled) setSalesBonusPercent(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Google Places Autocomplete для адреси ММ (як у заявках)
  useEffect(() => {
    if (!open || !showExtras) return;
    let cancelled = false;
    const initAutocomplete = () => {
      if (cancelled) return;
      if (!addressMMRef.current) {
        setTimeout(initAutocomplete, 100);
        return;
      }
      if (typeof google === 'undefined' || !google.maps?.places) {
        setTimeout(initAutocomplete, 100);
        return;
      }
      const ac = new google.maps.places.Autocomplete(addressMMRef.current, {
        componentRestrictions: { country: 'ua' },
        fields: ['formatted_address'],
        types: ['address']
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (place.formatted_address) {
          setForm(prev => ({ ...prev, addressMM: place.formatted_address }));
        }
      });
      addressMMAutocompleteRef.current = ac;
    };
    const t = setTimeout(initAutocomplete, 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
      addressMMAutocompleteRef.current = null;
    };
  }, [open, showExtras]);

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

  useEffect(() => {
    if (!open) return;
    const has = Boolean(
      editSale?.addressMM
      || editSale?.buyer
      || editSale?.invoiceNumber
      || editSale?.paymentMethod
      || editSale?.partner
      || editSale?.partnerContactName
      || editSale?.warehouseName
    );
    setShowExtras(has || !!viewOnly);
    setShowHistory(!!viewOnly);
    setCopiedKey('');
  }, [open, editSale, viewOnly]);

  useEffect(() => {
    if (!open || viewOnly) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, viewOnly]);

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

  // Склад відвантаження — автопідстановка з першої позиції обладнання
  const warehouseFromEquipment = useMemo(() => {
    const firstWithId = form.equipmentItems.find(i => i.equipmentId);
    if (!firstWithId) return '';
    const eq = equipmentWithSale.find(e => e._id === firstWithId.equipmentId);
    return eq?.currentWarehouseName || eq?.currentWarehouse || '';
  }, [form.equipmentItems, equipmentWithSale]);

  const tenderEmployees = useMemo(
    () => sortUsersByName(allUsers.filter((u) => isTenderRole(userRoleKey(u)))),
    [allUsers]
  );

  const engineerEmployees = useMemo(
    () => sortUsersByName(allUsers.filter((u) => isEngineerRole(userRoleKey(u)))),
    [allUsers]
  );

  const selectedClient = useMemo(() => {
    if (!form.clientId) return null;
    const fromList = clients.find((c) => String(c._id) === String(form.clientId));
    if (fromList) return fromList;
    const fromSale = editSale?.clientId;
    if (fromSale && typeof fromSale === 'object' && String(fromSale._id) === String(form.clientId)) {
      return fromSale;
    }
    return null;
  }, [clients, form.clientId, editSale]);

  const clientPhone = selectedClient?.contactPhone
    || selectedClient?.contacts?.[0]?.phone
    || '';
  const clientPerson = selectedClient?.contactPerson
    || selectedClient?.contacts?.[0]?.person
    || '';

  const dealNumberRaw = editSale?.saleNumber || previewDealNumber || '';
  const dealNumberLabel = dealNumberRaw
    ? `№ ${dealNumberRaw}`
    : (editSale ? 'Буде присвоєно після збереження' : '№ NU-…');

  const extrasFilledCount = [
    form.addressMM,
    form.buyer,
    form.paymentMethod,
    form.invoiceNumber,
    form.partner,
    form.partnerContactName,
    warehouseFromEquipment || form.warehouseName
  ].filter(Boolean).length;

  const copyValue = async (text, key) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((cur) => (cur === key ? '' : cur));
      }, 1600);
    } catch (_) {
      /* ignore */
    }
  };

  const userLabel = (login) => {
    if (!login) return '';
    const u = allUsers.find((x) => x.login === login);
    return u?.name || login;
  };

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

  const handleSaleInvoiceFileUpload = async (e) => {
    if (!editSale?._id || !e.target.files?.length) return;
    setInvoiceFilesUploading(true);
    try {
      const res = await uploadSaleInvoiceFiles(editSale._id, Array.from(e.target.files));
      if (res.files?.length) setSaleInvoiceFiles(prev => [...res.files, ...prev]);
      e.target.value = '';
    } catch (err) {
      alert(err.message || 'Помилка завантаження');
    } finally {
      setInvoiceFilesUploading(false);
    }
  };

  const handleSelectClient = (c) => {
    setForm(prev => ({
      ...prev,
      clientId: c._id,
      clientName: c.name,
      edrpou: c.edrpou || '',
    }));
    setClientSearch(c.name || '');
    setShowClientDropdown(false);
    setShowEdrpouDropdown(false);
  };

  const edrpouSourceLabel = (source) => {
    if (source === 'client') return 'CRM';
    if (source === 'procurement_history') return 'Закупівлі';
    if (source === 'registry') return 'Реєстр';
    return '';
  };

  const handleSelectEdrpouSuggestion = (c) => {
    if (c._id) {
      handleSelectClient(c);
      return;
    }
    setForm((prev) => ({
      ...prev,
      clientId: '',
      clientName: c.name || '',
      edrpou: c.edrpou || prev.edrpou,
    }));
    setClientSearch(c.name || '');
    setShowEdrpouDropdown(false);
  };

  const totalEquipmentAmount = form.equipmentItems.reduce((s, i) => s + (i.amount || 0), 0);
  const additionalCostsTotal = form.additionalCosts.reduce(
    (s, c) => s + (c.amount || 0) * (c.quantity || 1),
    0
  );
  const transport = parseFloat(form.transportCosts) || 0;
  const pnr = parseFloat(form.pnrCosts) || 0;
  const representative = parseFloat(form.representativeCosts) || 0;
  const totalWithAllExpenses = totalEquipmentAmount - transport - pnr - representative - additionalCostsTotal;

  const completedDealPremium = useMemo(() => {
    const pct =
      typeof salesBonusPercent === 'number' && !Number.isNaN(salesBonusPercent) ? salesBonusPercent : 0;
    return roundMoney((pct / 100) * totalWithAllExpenses);
  }, [salesBonusPercent, totalWithAllExpenses]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (viewOnly) return;
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
          lineId: i.lineId || i.id,
          ...(i.equipmentId ? { equipmentId: i.equipmentId } : {}),
          type: (i.type || '').trim(),
          serialNumber: (i.serialNumber || '').trim(),
          amount: parseFloat(i.amount) || 0,
          shipmentLocked: !!i.shipmentLocked,
          ...(i.shipmentRequestId ? { shipmentRequestId: i.shipmentRequestId } : {})
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
        status:
          editSale?.premiumAccruedAt || editSale?.status === 'confirmed'
            ? 'confirmed'
            : form.status,
        notes: form.notes?.trim() || '',
        addressMM: form.addressMM?.trim() || undefined,
        buyer: form.buyer?.trim() || undefined,
        invoiceNumber: form.invoiceNumber?.trim() || undefined,
        paymentMethod: form.paymentMethod?.trim() || undefined,
        engineer: form.engineer?.trim() || undefined,
        warehouseName: (warehouseFromEquipment || form.warehouseName || '')?.trim() || undefined,
        transportCosts: parseFloat(form.transportCosts) || 0,
        pnrCosts: parseFloat(form.pnrCosts) || 0,
        representativeCosts: parseFloat(form.representativeCosts) || 0,
        discountPercent: parseFloat(form.discountPercent) || 0,
        partner: form.partner?.trim() || undefined,
        partnerContactName: form.partnerContactName?.trim() || undefined
      };

      if (!editSale?.premiumAccruedAt) {
        payload.managerPremium = completedDealPremium;
      }

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

  const isViewOnly = !!viewOnly;
  const statusLocked = !!editSale?.premiumAccruedAt;
  const money = (n, digits = 0) =>
    (Number(n) || 0).toLocaleString('uk-UA', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content sale-form-modal${isViewOnly ? ' sale-form-modal--view-only' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header sale-form-header">
          <div className="sale-form-header-top">
            <div className="sale-form-title-wrap">
              <p className="sale-form-kicker">{isViewOnly ? 'Перегляд' : editSale ? 'Редагування' : 'Нова угода'}</p>
              <h3>{isViewOnly ? 'Угода' : editSale ? 'Редагувати продаж' : 'Новий продаж'}</h3>
            </div>
            <div className="sale-deal-badge" title="Номер формується автоматично">
              <span className="sale-deal-badge-label">Номер</span>
              <strong>{dealNumberLabel}</strong>
              {dealNumberRaw ? (
                <button
                  type="button"
                  className="sale-copy-btn"
                  onClick={() => copyValue(dealNumberRaw, 'deal')}
                  title="Скопіювати номер угоди"
                >
                  {copiedKey === 'deal' ? 'Скопійовано' : 'Копіювати'}
                </button>
              ) : null}
            </div>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Закрити">×</button>
          </div>
          <div className="sale-status-pills" role="radiogroup" aria-label="Статус угоди">
            {SALE_STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={form.status === o.value}
                className={`sale-status-pill sale-status-pill--${o.value}${form.status === o.value ? ' is-active' : ''}`}
                onClick={() => setForm((prev) => ({ ...prev, status: o.value }))}
                disabled={isViewOnly || statusLocked}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <form ref={formRef} className="sale-form" onSubmit={handleSubmit}>
          <fieldset className="sale-form-fieldset" disabled={isViewOnly}>
          <div className="modal-body sale-form-body">
            {editSale?.premiumAccruedAt && (
              <div className="sale-premium-accrued-banner">
                <strong>Премію затверджено</strong> бухгалтерією відділу продажів
                {editSale.premiumAccrualPeriod ? ` (період ${editSale.premiumAccrualPeriod})` : ''}.
                {editSale.premiumAccruedByLogin ? ` Користувач: ${editSale.premiumAccruedByLogin}.` : ''}{' '}
                Сума:{' '}
                <strong>
                  {parseFloat(editSale.managerPremium) || 0} ₴
                </strong>
              </div>
            )}

            <section className="sale-section">
              <div className="sale-section-head">
                <h4>Клієнт</h4>
                <p className="sale-section-lead">Пошук за назвою або ЄДРПОУ. Номер угоди присвоює система.</p>
              </div>
              <div className="sale-grid sale-grid-2">
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
                  <div className="client-autocomplete edrpou-autocomplete">
                    <input
                      type="text"
                      value={form.edrpou || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((prev) => ({ ...prev, edrpou: val }));
                        setShowEdrpouDropdown(true);
                        if (!val.trim()) {
                          setForm((prev) => ({ ...prev, clientId: '', clientName: '' }));
                          setClientSearch('');
                        }
                      }}
                      onFocus={() => setShowEdrpouDropdown(true)}
                      onBlur={() => setTimeout(() => setShowEdrpouDropdown(false), 200)}
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
              </div>
              {(form.clientId || form.clientName) && (
                <div className="sale-client-card">
                  <div className="sale-client-card-main">
                    <strong>{form.clientName || selectedClient?.name || 'Клієнт'}</strong>
                    {form.edrpou ? <span>ЄДРПОУ {form.edrpou}</span> : <span className="sale-muted">ЄДРПОУ не вказано</span>}
                  </div>
                  <div className="sale-client-card-meta">
                    {clientPerson ? <span>{clientPerson}</span> : null}
                    {clientPhone ? (
                      <a href={`tel:${clientPhone.replace(/[^\d+]/g, '')}`}>{clientPhone}</a>
                    ) : null}
                    {selectedClient?.region ? <span>{selectedClient.region}</span> : null}
                    {form.edrpou ? (
                      <button
                        type="button"
                        className="sale-copy-btn"
                        onClick={() => copyValue(form.edrpou, 'edrpou')}
                      >
                        {copiedKey === 'edrpou' ? 'ЄДРПОУ скопійовано' : 'Копіювати ЄДРПОУ'}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>

            <section className="sale-section">
              <div className="sale-section-head">
                <h4>Команда</h4>
                <p className="sale-section-lead">Після збереження нові учасники отримають сповіщення «вас долучили до угоди».</p>
              </div>
              <div className="sale-grid sale-grid-2">
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
                    {tenderEmployees.map(u => (
                      <option key={u.login || u._id} value={u.login}>{userOptionLabel(u)}</option>
                    ))}
                    {form.tenderEmployeeLogin && !tenderEmployees.some(u => u.login === form.tenderEmployeeLogin) && (
                      <option value={form.tenderEmployeeLogin}>{userLabel(form.tenderEmployeeLogin)}</option>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Інженер</label>
                  <select
                    value={form.engineer || ''}
                    onChange={e => setForm(prev => ({ ...prev, engineer: e.target.value || '' }))}
                  >
                    <option value="">— Оберіть —</option>
                    {engineerEmployees.map(u => (
                      <option key={u.login || u._id} value={u.name || u.login}>{userOptionLabel(u)}</option>
                    ))}
                    {form.engineer && !engineerEmployees.some(u => (u.name || u.login) === form.engineer) && (
                      <option value={form.engineer}>{form.engineer}</option>
                    )}
                  </select>
                </div>
              </div>
              {(form.managerLogin || form.managerLogin2 || form.tenderEmployeeLogin || form.engineer) && (
                <div className="sale-team-chips">
                  {form.managerLogin ? <span className="sale-chip">Менеджер: {userLabel(form.managerLogin)}</span> : null}
                  {form.managerLogin2 ? <span className="sale-chip">Другий: {userLabel(form.managerLogin2)}</span> : null}
                  {form.tenderEmployeeLogin ? <span className="sale-chip">Тендер: {userLabel(form.tenderEmployeeLogin)}</span> : null}
                  {form.engineer ? <span className="sale-chip">Інженер: {form.engineer}</span> : null}
                </div>
              )}
            </section>

            <section className="sale-section">
              <div className="sale-section-head sale-section-head--toggle">
                <div>
                  <h4>Обʼєкт, оплата і партнер</h4>
                  <p className="sale-section-lead">Адреса ММ, спосіб оплати, накладна, склад і партнер.</p>
                </div>
                <button
                  type="button"
                  className="sale-section-toggle"
                  onClick={() => setShowExtras((v) => !v)}
                  aria-expanded={showExtras}
                >
                  {showExtras ? 'Згорнути' : extrasFilledCount ? `Розгорнути · ${extrasFilledCount}` : 'Розгорнути'}
                </button>
              </div>
              {showExtras && (
                <div className="sale-form-additional-section">
                  <div className="sale-grid sale-grid-2">
                    <div className="form-group autocomplete-wrapper">
                      <label>Адреса ММ (обʼєкт)</label>
                      <input
                        ref={addressMMRef}
                        type="text"
                        value={form.addressMM || ''}
                        onChange={e => setForm(prev => ({ ...prev, addressMM: e.target.value }))}
                        placeholder="Почніть вводити адресу..."
                        autoComplete="off"
                      />
                    </div>
                    <div className="form-group">
                      <label>Фактичний покупець</label>
                      <input
                        type="text"
                        value={form.buyer || ''}
                        onChange={e => setForm(prev => ({ ...prev, buyer: e.target.value }))}
                        placeholder="Якщо відрізняється від клієнта"
                      />
                    </div>
                    <div className="form-group">
                      <label>Спосіб оплати</label>
                      <select
                        value={form.paymentMethod || ''}
                        onChange={e => setForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      >
                        {PAYMENT_METHOD_OPTIONS.map(o => (
                          <option key={o.value || 'empty'} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Номер видаткової накладної / дата</label>
                      <input
                        type="text"
                        value={form.invoiceNumber || ''}
                        onChange={e => setForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                        placeholder="Номер / дата"
                        disabled={form.paymentMethod !== 'Безготівка'}
                      />
                    </div>
                    <div className="form-group">
                      <label>Склад відвантаження</label>
                      <input
                        type="text"
                        value={warehouseFromEquipment || form.warehouseName || ''}
                        readOnly
                        placeholder="Автоматично з обладнання"
                        className="field-readonly"
                      />
                    </div>
                    <div className="form-group">
                      <label>Партнер</label>
                      <input
                        type="text"
                        value={form.partner || ''}
                        onChange={e => setForm(prev => ({ ...prev, partner: e.target.value }))}
                        placeholder="Назва партнера"
                      />
                    </div>
                    <div className="form-group">
                      <label>Контактна особа партнера</label>
                      <input
                        type="text"
                        value={form.partnerContactName || ''}
                        onChange={e => setForm(prev => ({ ...prev, partnerContactName: e.target.value }))}
                        placeholder="ПІБ"
                      />
                    </div>
                  </div>
                  {editSale?._id && (
                    <div className="form-group sale-invoice-files-section">
                      <label>Файли видаткової накладної</label>
                      <div className="sale-files-list">
                        {saleInvoiceFiles.length > 0 ? (
                          saleInvoiceFiles.map(f => (
                            <button key={f.id || f._id} type="button" className="sale-file-link" onClick={() => openSaleFile(f.id || f._id)} title="Відкрити/скачати">
                              {f.originalName || 'Файл'}
                            </button>
                          ))
                        ) : (
                          <span className="sale-no-files">Немає файлів</span>
                        )}
                        <label className="sale-btn-upload">
                          <input type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx" multiple hidden onChange={handleSaleInvoiceFileUpload} />
                          {invoiceFilesUploading ? 'Завантаження...' : '+ Завантажити файл'}
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {form.status === 'in_negotiation' ? (
              <ProposedEquipmentEditor
                items={form.equipmentItems}
                onChange={items => setForm(prev => ({ ...prev, equipmentItems: items }))}
                saleId={editSale?._id || null}
                onRequestProcurement={(item) => setProcurementLine(item)}
              />
            ) : (
              <EquipmentEditor
                items={form.equipmentItems}
                equipment={equipmentWithSale}
                onChange={items => setForm(prev => ({ ...prev, equipmentItems: items }))}
                label="Відвантажене обладнання"
                user={user}
                reserveClientName={form.clientName}
                onEquipmentReserved={loadEquipment}
                saleId={editSale?._id || null}
                showShipmentRequestButton={!!editSale?._id && form.status === 'in_realization'}
                onOpenShipmentRequest={() => setShowShipmentRequestModal(true)}
                onRequestProcurement={(item) => setProcurementLine(item)}
                lockedBypass={canAssignSaleManager(user?.role)}
              />
            )}

            <section className="sale-section">
              <div className="sale-section-head">
                <h4>Умови та витрати</h4>
                <p className="sale-section-lead">Дата, гарантія, знижка і витрати по угоді.</p>
              </div>
              <div className="sale-grid sale-grid-3">
                <div className="form-group">
                  <label>Дата продажу</label>
                  {form.status === 'in_negotiation' ? (
                    <div className="field-placeholder">Доступно після переходу в реалізацію</div>
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
                  <label>Гарантія</label>
                  {form.status === 'in_negotiation' ? (
                    <div className="field-placeholder">Доступно після переходу в реалізацію</div>
                  ) : (
                    <select
                      value={form.warrantyMonths}
                      onChange={e => setForm(prev => ({ ...prev, warrantyMonths: parseInt(e.target.value) }))}
                    >
                      <option value={6}>6 місяців</option>
                      <option value={12}>12 місяців</option>
                      <option value={24}>24 місяці</option>
                      <option value={36}>36 місяців</option>
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label>Знижка, %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.discountPercent || ''}
                    onChange={e => setForm(prev => ({ ...prev, discountPercent: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Транспортні, ₴</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.transportCosts || ''}
                    onChange={e => setForm(prev => ({ ...prev, transportCosts: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>ПНР, ₴</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.pnrCosts || ''}
                    onChange={e => setForm(prev => ({ ...prev, pnrCosts: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Представницькі, ₴</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.representativeCosts || ''}
                    onChange={e => setForm(prev => ({ ...prev, representativeCosts: e.target.value }))}
                  />
                </div>
              </div>
              <AdditionalCostsEditor
                costs={form.additionalCosts}
                onChange={costs => setForm(prev => ({ ...prev, additionalCosts: costs }))}
              />
            </section>

            {form.status === 'in_negotiation' ? (
              <section className="sale-section">
                <div className="sale-section-head">
                  <h4>Платежі</h4>
                </div>
                <div className="field-placeholder">Платежі зʼявляться після переходу в реалізацію угоди</div>
              </section>
            ) : (
              <PaymentsEditor
                payments={form.payments || [{ id: '1', date: new Date().toISOString().slice(0, 10), amount: 0 }]}
                onChange={p => setForm(prev => ({ ...prev, payments: p }))}
              />
            )}

            <section className="sale-section">
              <div className="sale-section-head">
                <h4>Примітки та файли</h4>
              </div>
              <div className="form-group">
                <label>Примітки</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Додаткові примітки для команди"
                  rows={3}
                />
              </div>
              {editSale?._id && (
                <div className="form-group sale-files-section">
                  <label>Файли угоди{saleFiles.length ? ` · ${saleFiles.length}` : ''}</label>
                  <div className="sale-files-list">
                    {saleFiles.length > 0 ? (
                      saleFiles.map(f => (
                        <button key={f.id || f._id} type="button" className="sale-file-link" onClick={() => openSaleFile(f.id || f._id)} title="Відкрити/скачати">
                          {f.originalName || 'Файл'}
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
              {editSale?._id && (editSale.statusHistory || []).length > 0 && (
                <div className="form-group sale-status-history">
                  <button
                    type="button"
                    className="sale-section-toggle sale-section-toggle--inline"
                    onClick={() => setShowHistory((v) => !v)}
                    aria-expanded={showHistory}
                  >
                    Історія статусів · {(editSale.statusHistory || []).length} {showHistory ? '▾' : '▸'}
                  </button>
                  {showHistory && (
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
                  )}
                </div>
              )}
            </section>
          </div>
          </fieldset>

          <div className="modal-footer sale-form-footer">
            <div className="sale-footer-totals" aria-label="Підсумок угоди">
              <div className="sale-footer-total">
                <span>Обладнання</span>
                <strong>{money(totalEquipmentAmount)} ₴</strong>
              </div>
              <div className="sale-footer-total">
                <span>Після витрат</span>
                <strong>{money(totalWithAllExpenses)} ₴</strong>
              </div>
              <div className="sale-footer-total sale-footer-total--accent">
                <span title="«Премія від продажів» з фінансового відділу × сума після витрат">Премія</span>
                <strong>{money(completedDealPremium, 2)} ₴</strong>
              </div>
            </div>
            <div className="sale-footer-actions">
              {isViewOnly ? (
                <button type="button" className="btn-primary" onClick={onClose}>Закрити</button>
              ) : (
                <>
                  <span className="sale-save-hint">Ctrl+S</span>
                  <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>Скасувати</button>
                  <button type="submit" className="btn-primary" disabled={loading || !form.clientId}>
                    {loading ? 'Збереження...' : (editSale ? 'Зберегти' : 'Створити продаж')}
                  </button>
                </>
              )}
            </div>
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

      <SaleProcurementModal
        open={Boolean(procurementLine)}
        onClose={() => setProcurementLine(null)}
        sale={editSale}
        line={procurementLine}
        onCreated={(doc) => {
          alert(`Заявку ${doc.requestNumber || ''} надіслано у відділ закупівель.`);
        }}
      />

      <SaleShipmentRequestModal
        open={showShipmentRequestModal}
        onClose={() => setShowShipmentRequestModal(false)}
        saleId={editSale?._id}
        equipmentItems={form.equipmentItems}
        initialShipmentAddress={form.addressMM || ''}
        onSuccess={async () => {
          try {
            const s = await getSale(editSale._id);
            if (s?.equipmentItems?.length) {
              setForm((prev) => ({
                ...prev,
                equipmentItems: s.equipmentItems.map((i) => {
                  const lid =
                    i.lineId ||
                    crypto.randomUUID?.() ||
                    `eq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                  return {
                    id: lid,
                    lineId: lid,
                    equipmentId: i.equipmentId?._id || i.equipmentId || '',
                    type: i.type || '',
                    serialNumber: i.serialNumber || '',
                    amount: i.amount || 0,
                    shipmentLocked: !!i.shipmentLocked,
                    shipmentRequestId: i.shipmentRequestId || null
                  };
                })
              }));
            }
            onRefreshSale?.(s);
          } catch (_) {
            /* ignore */
          }
          setShowShipmentRequestModal(false);
          onSuccess?.();
        }}
      />
    </div>
  );
}

export default SaleFormModal;
