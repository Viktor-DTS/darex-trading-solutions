import React, { useCallback, useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../../config';
import { MonthlySpendChart } from './HealthCharts';
import { formatUsd, formatDate, formatNumber } from './healthFormat';

const RESOURCE_LABELS = {
  render: 'Render',
  mongodb: 'MongoDB Atlas',
  cloudinary: 'Cloudinary',
  other: 'Інше',
};

const STATUS_LABELS = {
  paid: 'Оплачено',
  pending: 'Очікує оплати',
  overdue: 'Прострочено',
  planned: 'Заплановано',
};

const EMPTY_FORM = {
  resource: 'render',
  invoiceNumber: '',
  periodStart: '',
  periodEnd: '',
  amount: '',
  currency: 'USD',
  amountUah: '',
  status: 'paid',
  paidAt: '',
  dueAt: '',
  plan: '',
  method: '',
  comment: '',
  attachmentUrl: '',
};

function toInputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function BillingPanel({ external }) {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [message, setMessage] = useState(null);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/system-health/payments`, { headers: authHeaders });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setPayments(data.payments || []);
      setSummary(data.summary || null);
    } catch (error) {
      setMessage({ type: 'error', text: `Не вдалося завантажити журнал: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    if (!form.amount) {
      setMessage({ type: 'error', text: 'Вкажіть суму' });
      return;
    }
    setSaving(true);
    try {
      const url = editingId
        ? `${API_BASE_URL}/system-health/payments/${editingId}`
        : `${API_BASE_URL}/system-health/payments`;
      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: authHeaders,
        body: JSON.stringify({ ...form, resourceLabel: RESOURCE_LABELS[form.resource] }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setForm(EMPTY_FORM);
      setEditingId(null);
      setMessage({ type: 'ok', text: editingId ? 'Запис оновлено' : 'Запис додано' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: `Помилка збереження: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (payment) => {
    setEditingId(payment._id);
    setForm({
      resource: payment.resource,
      invoiceNumber: payment.invoiceNumber || '',
      periodStart: toInputDate(payment.periodStart),
      periodEnd: toInputDate(payment.periodEnd),
      amount: payment.amount ?? '',
      currency: payment.currency || 'USD',
      amountUah: payment.amountUah ?? '',
      status: payment.status || 'paid',
      paidAt: toInputDate(payment.paidAt),
      dueAt: toInputDate(payment.dueAt),
      plan: payment.plan || '',
      method: payment.method || '',
      comment: payment.comment || '',
      attachmentUrl: payment.attachmentUrl || '',
    });
  };

  const remove = async (id) => {
    if (!window.confirm('Видалити запис із журналу оплат?')) return;
    try {
      await fetch(`${API_BASE_URL}/system-health/payments/${id}`, { method: 'DELETE', headers: authHeaders });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: `Помилка видалення: ${error.message}` });
    }
  };

  const syncFromApi = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/system-health/payments/sync`, { method: 'POST', headers: authHeaders });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setPayments(data.payments || []);
      setSummary(data.summary || null);
      setMessage({
        type: 'ok',
        text: `Підтягнуто рахунків Atlas: ${data.created}. Render і Cloudinary рахунків через API не віддають — додайте вручну.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: `Синхронізація не вдалася: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const visiblePayments = filter === 'all' ? payments : payments.filter((payment) => payment.resource === filter);

  const currentCharges = useMemo(() => {
    const rows = [];
    const renderEstimate = external?.render?.estimate?.monthlyUsd;
    if (renderEstimate != null) {
      rows.push({ resource: 'render', label: 'Render — оцінка за тарифами інстансів', amount: renderEstimate, kind: 'estimate' });
    }
    const pending = external?.mongodb?.pendingInvoice;
    if (pending?.amountUsd != null) {
      rows.push({ resource: 'mongodb', label: 'MongoDB Atlas — поточний накопичений рахунок', amount: pending.amountUsd, kind: 'actual' });
    }
    const cloudinary = external?.cloudinary;
    if (cloudinary?.configured && cloudinary.plan?.usd != null) {
      rows.push({ resource: 'cloudinary', label: `Cloudinary — тариф ${cloudinary.plan.label}`, amount: cloudinary.plan.usd, kind: 'plan' });
    }
    return rows;
  }, [external]);

  const forecastTotal = currentCharges.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <div className="sh-stack">
      <div className="sh-section">
        <div className="sh-section-head">
          <h3>
            <span className="sh-dot" style={{ background: '#f59e0b' }} /> Витрати на інфраструктуру
          </h3>
          <div className="sh-section-actions">
            <button className="sh-btn sh-btn-ghost" onClick={syncFromApi} disabled={saving}>
              ⟳ Підтягнути рахунки Atlas
            </button>
          </div>
        </div>

        <div className="sh-kpi-row">
          <div className="sh-kpi sh-kpi-ok">
            <span className="sh-kpi-label">Прогноз на поточний місяць</span>
            <span className="sh-kpi-value">{formatUsd(forecastTotal)}</span>
            <span className="sh-kpi-hint">за тарифами та накопиченими рахунками</span>
          </div>
          <div className="sh-kpi">
            <span className="sh-kpi-label">Сплачено за 12 міс</span>
            <span className="sh-kpi-value">{formatUsd(summary?.last12mUsd)}</span>
          </div>
          <div className="sh-kpi">
            <span className="sh-kpi-label">Середньомісячно</span>
            <span className="sh-kpi-value">{formatUsd(summary?.avgMonthlyUsd)}</span>
          </div>
          <div className={`sh-kpi ${summary?.pendingUsd ? 'sh-kpi-warning' : ''}`}>
            <span className="sh-kpi-label">Очікує оплати</span>
            <span className="sh-kpi-value">{formatUsd(summary?.pendingUsd)}</span>
          </div>
          <div className="sh-kpi">
            <span className="sh-kpi-label">Записів у журналі</span>
            <span className="sh-kpi-value">{formatNumber(payments.length)}</span>
          </div>
        </div>

        {currentCharges.length > 0 && (
          <div className="sh-charge-row">
            {currentCharges.map((row) => (
              <div className={`sh-charge sh-charge-${row.resource}`} key={row.resource}>
                <span className="sh-charge-label">{row.label}</span>
                <span className="sh-charge-amount">{formatUsd(row.amount)}</span>
                <span className="sh-charge-kind">
                  {row.kind === 'estimate' ? 'оцінка' : row.kind === 'plan' ? 'тариф' : 'факт'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="sh-subpanel-title">Витрати по місяцях</div>
        <MonthlySpendChart monthly={summary?.monthly} />
      </div>

      <div className="sh-section">
        <div className="sh-section-head">
          <h3>{editingId ? 'Редагування запису' : 'Додати рахунок або оплату'}</h3>
          {editingId && (
            <button
              className="sh-btn sh-btn-ghost"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
            >
              Скасувати
            </button>
          )}
        </div>

        <form className="sh-form" onSubmit={submit}>
          <label>
            <span>Ресурс</span>
            <select value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value })}>
              {Object.entries(RESOURCE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Номер рахунку</span>
            <input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} placeholder="INV-2026-08" />
          </label>
          <label>
            <span>Період з</span>
            <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
          </label>
          <label>
            <span>Період по</span>
            <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
          </label>
          <label>
            <span>Сума</span>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </label>
          <label>
            <span>Валюта</span>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="UAH">UAH</option>
            </select>
          </label>
          <label>
            <span>Еквівалент, ₴</span>
            <input type="number" step="0.01" value={form.amountUah} onChange={(e) => setForm({ ...form, amountUah: e.target.value })} />
          </label>
          <label>
            <span>Статус</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Дата оплати</span>
            <input type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} />
          </label>
          <label>
            <span>Оплатити до</span>
            <input type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
          </label>
          <label>
            <span>Тариф</span>
            <input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="Starter / M10 / Plus" />
          </label>
          <label>
            <span>Спосіб оплати</span>
            <input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="Картка ****1234" />
          </label>
          <label className="sh-form-wide">
            <span>Посилання на рахунок</span>
            <input value={form.attachmentUrl} onChange={(e) => setForm({ ...form, attachmentUrl: e.target.value })} placeholder="https://..." />
          </label>
          <label className="sh-form-wide">
            <span>Коментар</span>
            <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </label>
          <div className="sh-form-actions">
            <button className="sh-btn sh-btn-primary" type="submit" disabled={saving}>
              {saving ? 'Збереження…' : editingId ? 'Зберегти зміни' : 'Додати запис'}
            </button>
          </div>
        </form>
        {message && <div className={`sh-message sh-message-${message.type}`}>{message.text}</div>}
      </div>

      <div className="sh-section">
        <div className="sh-section-head">
          <h3>Журнал оплат</h3>
          <div className="sh-view-tabs">
            <button className={`sh-view-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
              Усі
            </button>
            {Object.entries(RESOURCE_LABELS).map(([key, label]) => (
              <button key={key} className={`sh-view-tab ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="sh-muted sh-pad">Завантаження…</div>
        ) : (
          <table className="sh-table">
            <thead>
              <tr>
                <th>Ресурс</th>
                <th>Період</th>
                <th>Рахунок</th>
                <th>Сума</th>
                <th>Статус</th>
                <th>Оплачено</th>
                <th>Джерело</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visiblePayments.map((payment) => (
                <tr key={payment._id}>
                  <td>
                    <span className={`sh-badge sh-badge-${payment.resource}`}>{RESOURCE_LABELS[payment.resource]}</span>
                  </td>
                  <td>
                    {payment.periodStart ? `${formatDate(payment.periodStart)} — ${formatDate(payment.periodEnd)}` : '—'}
                  </td>
                  <td className="sh-mono">{payment.invoiceNumber || '—'}</td>
                  <td>
                    <b>
                      {payment.currency === 'USD' ? formatUsd(payment.amount) : `${payment.amount} ${payment.currency}`}
                    </b>
                    {payment.amountUah ? <span className="sh-muted"> · {formatNumber(payment.amountUah)} ₴</span> : null}
                  </td>
                  <td>
                    <span
                      className={`sh-badge ${
                        payment.status === 'paid'
                          ? 'sh-badge-ok'
                          : payment.status === 'overdue'
                            ? 'sh-badge-critical'
                            : 'sh-badge-warning'
                      }`}
                    >
                      {STATUS_LABELS[payment.status]}
                    </span>
                  </td>
                  <td>{formatDate(payment.paidAt)}</td>
                  <td className="sh-muted">{payment.source === 'api' ? 'API' : 'вручну'}</td>
                  <td className="sh-row-actions">
                    {payment.attachmentUrl && (
                      <a href={payment.attachmentUrl} target="_blank" rel="noreferrer" className="sh-icon-btn" title="Відкрити рахунок">
                        📄
                      </a>
                    )}
                    <button className="sh-icon-btn" onClick={() => startEdit(payment)} title="Редагувати">
                      ✏️
                    </button>
                    <button className="sh-icon-btn sh-icon-danger" onClick={() => remove(payment._id)} title="Видалити">
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {!visiblePayments.length && (
                <tr>
                  <td colSpan={8} className="sh-muted">Записів немає</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
