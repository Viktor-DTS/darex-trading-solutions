import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getClients, getClientsFilters, getClientsStats, getClientDuplicates, bulkUpdateClients } from '../../utils/clientsAPI';
import { exportClientsToExcel } from '../../utils/clientsExport';
import { Button, Badge } from '../ui';
import ClientFormModal from './ClientFormModal';
import ClientCardModal from './ClientCardModal';
import NextActionModal from './NextActionModal';
import DuplicatesModal from './DuplicatesModal';
import './ManagerTabs.css';
import './ClientsTab.css';

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE_OPTIONS = [20, 30, 50, 100];
const EXPORT_LIMIT = 1000;
const PREFS_KEY = 'clientsTab.prefs.v1';

const SORT_OPTIONS = [
  { value: 'nextActionAt', label: 'За датою наступного кроку' },
  { value: 'name', label: 'Назва: А → Я' },
  { value: '-name', label: 'Назва: Я → А' },
  { value: '-createdAt', label: 'Спочатку нові' },
  { value: 'createdAt', label: 'Спочатку давні' },
  { value: '-updatedAt', label: 'Нещодавно оновлені' },
];

const AVATAR_TONES = ['a', 'b', 'c', 'd', 'e', 'f'];

const ACTION_ICONS = { call: '📞', meeting: '🤝', email: '✉️', quote: '📄', other: '📌' };

const FIELD_LABELS = {
  edrpou: 'ЄДРПОУ',
  contactPerson: 'контактна особа',
  contactPhone: 'телефон',
  email: 'email',
  address: 'адреса',
  region: 'регіон',
};

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  const letters = words
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] || '');
  return letters.join('').toUpperCase() || '—';
}

function avatarTone(key) {
  const str = String(key || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function telHref(phone) {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

function pluralUa(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Відносна давність активності + тон для кольорового кодування «прохолодних» клієнтів. */
function relativeActivity(value) {
  if (!value) return { text: 'Немає активності', tone: 'none' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { text: '—', tone: 'none' };
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  const tone = days <= 14 ? 'fresh' : days <= 45 ? 'warm' : 'cold';
  let text;
  if (days <= 0) text = 'Сьогодні';
  else if (days === 1) text = 'Вчора';
  else if (days < 30) text = `${days} ${pluralUa(days, 'день', 'дні', 'днів')} тому`;
  else if (days < 365) {
    const months = Math.floor(days / 30);
    text = `${months} ${pluralUa(months, 'місяць', 'місяці', 'місяців')} тому`;
  } else {
    const years = Math.floor(days / 365);
    text = `${years} ${pluralUa(years, 'рік', 'роки', 'років')} тому`;
  }
  return { text, tone, title: date.toLocaleString('uk-UA') };
}

/** Стан запланованого наступного кроку відносно сьогоднішнього дня. */
function nextActionState(client) {
  if (!client.nextActionAt) return null;
  const date = new Date(client.nextActionAt);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  const icon = ACTION_ICONS[client.nextActionType] || ACTION_ICONS.other;
  const title = `${date.toLocaleDateString('uk-UA')}${client.nextActionNote ? ` — ${client.nextActionNote}` : ''}`;
  if (diff < 0) return { tone: 'overdue', text: `Прострочено ${-diff} ${pluralUa(-diff, 'день', 'дні', 'днів')}`, icon, title };
  if (diff === 0) return { tone: 'today', text: 'Сьогодні', icon, title };
  if (diff === 1) return { tone: 'soon', text: 'Завтра', icon, title };
  return { tone: 'future', text: date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }), icon, title };
}

function ClientsTab({ user }) {
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => readPrefs().pageSize || 30);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [flag, setFlag] = useState('');
  const [sort, setSort] = useState(() => readPrefs().sort || 'name');
  const [filterOptions, setFilterOptions] = useState({ regions: [], managers: [] });

  const [stats, setStats] = useState(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);
  const [viewMode, setViewMode] = useState(() => readPrefs().viewMode || 'table');
  const [compact, setCompact] = useState(() => Boolean(readPrefs().compact));
  const [copiedKey, setCopiedKey] = useState('');

  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [showFormModal, setShowFormModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [nextActionTargets, setNextActionTargets] = useState(null);
  const [editClient, setEditClient] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);

  const searchRef = useRef(null);
  const selectAllRef = useRef(null);

  const isAdmin = Boolean(user?.role && ['admin', 'administrator', 'mgradm'].includes(user.role));
  const showManagerColumn = user?.role !== 'manager';

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ pageSize, sort, viewMode, compact }));
    } catch {
      /* налаштування виду — не критичні */
    }
  }, [pageSize, sort, viewMode, compact]);

  const loadFilters = useCallback(async () => {
    if (!isAdmin) return;
    setFilterOptions(await getClientsFilters());
  }, [isAdmin]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchApplied(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const baseParams = useMemo(() => ({
    q: searchApplied || undefined,
    region: isAdmin ? (regionFilter || undefined) : undefined,
    manager: isAdmin ? (managerFilter || undefined) : undefined,
  }), [searchApplied, regionFilter, managerFilter, isAdmin]);

  const listParams = useMemo(() => ({
    ...baseParams,
    sort,
    flag: flag || undefined,
    withStats: 1,
  }), [baseParams, sort, flag]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getClients({ ...listParams, page, limit: pageSize });
      const list = Array.isArray(data) ? data : (data.clients || []);
      setClients(list);
      setTotal(data.total ?? list.length);
    } catch (err) {
      console.error(err);
      setClients([]);
      setTotal(0);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [listParams, page, pageSize]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const loadStats = useCallback(async () => {
    setStats(await getClientsStats(baseParams));
  }, [baseParams]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Дублікати шукаємо один раз при відкритті вкладки — вибірка не залежить від фільтрів
  useEffect(() => {
    let cancelled = false;
    getClientDuplicates().then((d) => {
      if (!cancelled) setDuplicateCount(d.total || 0);
    });
    return () => { cancelled = true; };
  }, []);

  const refreshAll = useCallback(() => {
    loadClients();
    loadStats();
  }, [loadClients, loadStats]);

  // Вибір скидаємо при зміні вибірки, щоб не застосувати дію до невидимих рядків
  useEffect(() => {
    setSelectedIds([]);
  }, [listParams, page, pageSize]);

  // «/» фокусує пошук — менеджер працює з клавіатури, не тягнучись до миші
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (showFormModal || showCardModal || showDuplicates || nextActionTargets) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showFormModal, showCardModal, showDuplicates, nextActionTargets]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allOnPageSelected = clients.length > 0 && clients.every((c) => selectedSet.has(c._id));
  const someOnPageSelected = clients.some((c) => selectedSet.has(c._id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someOnPageSelected && !allOnPageSelected;
    }
  }, [someOnPageSelected, allOnPageSelected]);

  const toggleOne = (id) => {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const toggleAllOnPage = () => {
    setSelectedIds((cur) => {
      if (allOnPageSelected) {
        const pageIds = new Set(clients.map((c) => c._id));
        return cur.filter((id) => !pageIds.has(id));
      }
      return [...new Set([...cur, ...clients.map((c) => c._id)])];
    });
  };

  const selectedClients = useMemo(
    () => clients.filter((c) => selectedSet.has(c._id)),
    [clients, selectedSet],
  );

  const copyToClipboard = async (text, key) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(String(text));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? '' : k)), 1400);
    } catch {
      /* буфер обміну недоступний — тихо ігноруємо */
    }
  };

  const applyFlag = (nextFlag) => {
    setFlag((cur) => (cur === nextFlag ? '' : nextFlag));
    setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setSearchApplied('');
    setRegionFilter('');
    setManagerFilter('');
    setFlag('');
    setPage(1);
  };

  const handleOpenCard = (id) => {
    setSelectedClientId(id);
    setShowCardModal(true);
  };

  const handleEdit = (client) => {
    setEditClient(client);
    setShowCardModal(false);
    setShowFormModal(true);
  };

  const handleAddNew = () => {
    setEditClient(null);
    setShowFormModal(true);
  };

  const runBulk = async (action, value, confirmText) => {
    if (selectedIds.length === 0) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setBulkBusy(true);
    try {
      const res = await bulkUpdateClients(selectedIds, action, value);
      if (res.skipped > 0) {
        alert(`Змінено ${res.modified}. Пропущено ${res.skipped} — немає доступу.`);
      }
      setSelectedIds([]);
      refreshAll();
    } catch (err) {
      alert(err.message || 'Не вдалося виконати дію');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExport = async (onlySelected) => {
    setExporting(true);
    try {
      const rows = onlySelected
        ? selectedClients
        : (await getClients({ ...listParams, page: 1, limit: EXPORT_LIMIT })).clients || [];
      if (rows.length === 0) {
        alert('Немає даних для експорту');
        return;
      }
      await exportClientsToExcel(rows, onlySelected ? 'clients_selected' : 'clients');
    } catch (err) {
      alert(err.message || 'Не вдалося експортувати');
    } finally {
      setExporting(false);
    }
  };

  const kpiCards = useMemo(() => ([
    { id: '', label: 'Всього клієнтів', value: stats?.total, icon: '🗂', tone: 'neutral', hint: 'За поточним пошуком' },
    { id: 'overdue', label: 'Прострочені кроки', value: stats?.overdueTasks, icon: '⏰', tone: 'danger', hint: 'Термін уже минув' },
    { id: 'today', label: 'Заплановано сьогодні', value: stats?.todayTasks, icon: '📅', tone: 'info', hint: 'План на день' },
    { id: 'sleeping', label: 'Втрачаємо контакт', value: stats?.sleeping, icon: '💤', tone: 'warning', hint: 'Понад 60 днів тиші' },
    { id: 'noDeals', label: 'Без жодної угоди', value: stats?.clientsWithoutDeals, icon: '🎯', tone: 'warning', hint: 'Потребують опрацювання' },
    { id: 'incomplete', label: 'Неповні дані', value: stats?.incomplete, icon: '📝', tone: 'neutral', hint: 'Картку не дозаповнено' },
  ]), [stats]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, total);
  const hasFilters = Boolean(searchApplied || regionFilter || managerFilter || flag);

  const activeChips = [
    searchApplied && { key: 'q', label: `Пошук: «${searchApplied}»`, clear: () => { setSearch(''); setSearchApplied(''); } },
    regionFilter && { key: 'region', label: `Регіон: ${regionFilter}`, clear: () => setRegionFilter('') },
    managerFilter && {
      key: 'manager',
      label: `Менеджер: ${filterOptions.managers?.find((m) => m.login === managerFilter)?.name || managerFilter}`,
      clear: () => setManagerFilter(''),
    },
    flag && { key: 'flag', label: kpiCards.find((c) => c.id === flag)?.label || flag, clear: () => setFlag('') },
  ].filter(Boolean);

  const renderCompleteness = (client) => {
    const pct = client.stats?.completeness;
    if (pct === undefined || pct >= 100) return null;
    const missing = (client.stats.missingFields || []).map((f) => FIELD_LABELS[f] || f).join(', ');
    return (
      <span
        className="ct-ring"
        style={{ '--pct': pct }}
        title={`Картку заповнено на ${pct}%. Не вистачає: ${missing}`}
        aria-label={`Заповненість ${pct} відсотків`}
      >
        {pct}
      </span>
    );
  };

  const renderPhone = (client) => {
    const phone = client.contactPhone;
    if (!phone) return <span className="ct-missing">не вказано</span>;
    const href = telHref(phone);
    const key = `phone-${client._id}`;
    return (
      <div className="ct-phone" onClick={(e) => e.stopPropagation()}>
        {href ? <a className="ct-phone__link" href={href}>{phone}</a> : <span>{phone}</span>}
        <button
          type="button"
          className="ct-icon-btn"
          title="Скопіювати телефон"
          aria-label="Скопіювати телефон"
          onClick={() => copyToClipboard(phone, key)}
        >
          {copiedKey === key ? '✓' : '⧉'}
        </button>
      </div>
    );
  };

  const renderDeals = (client) => {
    const s = client.stats;
    if (!s || s.dealsTotal === 0) return <span className="ct-missing">немає угод</span>;
    return (
      <div className="ct-deals">
        {s.dealsOpen > 0 && <span className="ct-pill ct-pill--open" title="Відкриті угоди">{s.dealsOpen} в роботі</span>}
        {s.dealsWon > 0 && <span className="ct-pill ct-pill--won" title="Успішно закриті угоди">{s.dealsWon} ✓</span>}
        {s.dealsOpen === 0 && s.dealsWon === 0 && <span className="ct-pill">{s.dealsTotal}</span>}
      </div>
    );
  };

  const renderNextAction = (client) => {
    const state = nextActionState(client);
    return (
      <div className="ct-next" onClick={(e) => e.stopPropagation()}>
        {state ? (
          <button
            type="button"
            className={`ct-next__badge ct-next__badge--${state.tone}`}
            title={state.title}
            onClick={() => setNextActionTargets([client])}
          >
            <span aria-hidden="true">{state.icon}</span>{state.text}
          </button>
        ) : (
          <button
            type="button"
            className="ct-next__add"
            title="Запланувати наступний крок"
            onClick={() => setNextActionTargets([client])}
          >
            + запланувати
          </button>
        )}
      </div>
    );
  };

  const renderManagers = (client) => {
    const names = [
      client.assignedManagerName || client.assignedManagerLogin,
      client.assignedManagerName2 || client.assignedManagerLogin2,
    ].filter(Boolean);
    if (names.length === 0) return <span className="ct-missing">—</span>;
    return (
      <div className="ct-managers">
        {names.map((n) => (
          <span key={n} className="ct-chip" title={n}>{n}</span>
        ))}
      </div>
    );
  };

  const renderSkeleton = () => (
    <div className="ct-skeleton" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div className="ct-skeleton__row" key={i}>
          <span className="ct-skeleton__avatar" />
          <span className="ct-skeleton__bar" style={{ width: '28%' }} />
          <span className="ct-skeleton__bar" style={{ width: '18%' }} />
          <span className="ct-skeleton__bar" style={{ width: '14%' }} />
          <span className="ct-skeleton__bar" style={{ width: '12%' }} />
        </div>
      ))}
    </div>
  );

  const renderEmpty = () => (
    <div className="ct-empty">
      <div className="ct-empty__icon">{hasFilters ? '🔍' : '👥'}</div>
      <h3>{hasFilters ? 'Нічого не знайдено' : 'Тут поки порожньо'}</h3>
      <p>
        {hasFilters
          ? 'Спробуйте змінити пошуковий запит або зняти частину фільтрів.'
          : 'Додайте першого клієнта — і його угоди та історія взаємодій зберуться в одній картці.'}
      </p>
      {hasFilters
        ? <Button variant="ghost" onClick={resetFilters}>Скинути фільтри</Button>
        : <Button variant="primary" onClick={handleAddNew}>+ Додати клієнта</Button>}
    </div>
  );

  const renderClientCell = (c) => {
    const edrpouKey = `edrpou-${c._id}`;
    const meta = [c.edrpou ? `ЄДРПОУ ${c.edrpou}` : 'без ЄДРПОУ', c.region].filter(Boolean).join(' · ');
    return (
      <div className="ct-client">
        <span className={`ct-avatar ct-avatar--${avatarTone(c._id || c.name)}`}>{initials(c.name)}</span>
        <div className="ct-client__text">
          <span className="ct-client__row">
            <span className="ct-client__name" title={c.name}>{c.name || '—'}</span>
            {renderCompleteness(c)}
          </span>
          <button
            type="button"
            className={`ct-edrpou ${c.edrpou ? '' : 'ct-edrpou--missing'}`}
            title={c.edrpou ? 'Скопіювати ЄДРПОУ' : undefined}
            disabled={!c.edrpou}
            onClick={(e) => { e.stopPropagation(); copyToClipboard(c.edrpou, edrpouKey); }}
          >
            {copiedKey === edrpouKey ? 'скопійовано ✓' : meta}
          </button>
        </div>
      </div>
    );
  };

  const renderTable = () => (
    <div className="ct-table-scroll">
      <table className={`ct-table ${compact ? 'ct-table--compact' : ''}`}>
        <thead>
          <tr>
            <th className="ct-col-check">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleAllOnPage}
                aria-label="Вибрати всіх на сторінці"
              />
            </th>
            <th className="ct-col-client">Клієнт</th>
            <th>Контактна особа</th>
            <th>Телефон</th>
            <th>Угоди</th>
            <th>Наступний крок</th>
            <th>Активність</th>
            {showManagerColumn && <th>Менеджер</th>}
            <th className="ct-col-actions" aria-label="Дії" />
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => {
            const activity = relativeActivity(c.stats?.lastInteractionAt || c.stats?.lastDealDate || c.updatedAt);
            const isSelected = selectedSet.has(c._id);
            return (
              <tr
                key={c._id}
                className={`ct-row ${isSelected ? 'is-selected' : ''}`}
                onClick={() => handleOpenCard(c._id)}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') handleOpenCard(c._id); }}
              >
                <td className="ct-col-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(c._id)}
                    aria-label={`Вибрати ${c.name}`}
                  />
                </td>
                <td className="ct-col-client">{renderClientCell(c)}</td>
                <td>
                  {c.contactPerson || <span className="ct-missing">не вказано</span>}
                  {c.email && <div className="ct-subtle">{c.email}</div>}
                </td>
                <td>{renderPhone(c)}</td>
                <td>{renderDeals(c)}</td>
                <td>{renderNextAction(c)}</td>
                <td>
                  <span className={`ct-activity ct-activity--${activity.tone}`} title={activity.title}>
                    {activity.text}
                  </span>
                </td>
                {showManagerColumn && <td>{renderManagers(c)}</td>}
                <td className="ct-col-actions">
                  <button
                    type="button"
                    className="ct-icon-btn ct-row-action"
                    title="Редагувати клієнта"
                    aria-label="Редагувати клієнта"
                    onClick={(e) => { e.stopPropagation(); handleEdit(c); }}
                  >
                    ✎
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderCards = () => (
    <div className="ct-cards">
      {clients.map((c) => {
        const activity = relativeActivity(c.stats?.lastInteractionAt || c.stats?.lastDealDate || c.updatedAt);
        const isSelected = selectedSet.has(c._id);
        return (
          <article
            key={c._id}
            className={`ct-card ${isSelected ? 'is-selected' : ''}`}
            onClick={() => handleOpenCard(c._id)}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') handleOpenCard(c._id); }}
          >
            <header className="ct-card__head">
              <input
                type="checkbox"
                checked={isSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleOne(c._id)}
                aria-label={`Вибрати ${c.name}`}
              />
              <span className={`ct-avatar ct-avatar--${avatarTone(c._id || c.name)}`}>{initials(c.name)}</span>
              <div className="ct-card__title">
                <span className="ct-client__row">
                  <span className="ct-client__name">{c.name || '—'}</span>
                  {renderCompleteness(c)}
                </span>
                <span className="ct-subtle">{c.edrpou ? `ЄДРПОУ ${c.edrpou}` : 'без ЄДРПОУ'}</span>
              </div>
              <button
                type="button"
                className="ct-icon-btn"
                title="Редагувати клієнта"
                aria-label="Редагувати клієнта"
                onClick={(e) => { e.stopPropagation(); handleEdit(c); }}
              >
                ✎
              </button>
            </header>
            <dl className="ct-card__grid">
              <div><dt>Контакт</dt><dd>{c.contactPerson || <span className="ct-missing">не вказано</span>}</dd></div>
              <div><dt>Телефон</dt><dd>{renderPhone(c)}</dd></div>
              <div><dt>Угоди</dt><dd>{renderDeals(c)}</dd></div>
              <div><dt>Наступний крок</dt><dd>{renderNextAction(c)}</dd></div>
            </dl>
            <footer className="ct-card__foot">
              <span className={`ct-activity ct-activity--${activity.tone}`} title={activity.title}>{activity.text}</span>
              {showManagerColumn && renderManagers(c)}
            </footer>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="manager-tab-content manager-crm-tab clients-page">
      <header className="ct-head">
        <div className="ct-head__title">
          <span className="ct-head__icon" aria-hidden="true">👥</span>
          <div>
            <h2>Мої клієнти</h2>
            <p className="ct-head__sub">
              {loading
                ? 'Завантаження…'
                : total > 0
                  ? `Показано ${rangeFrom}–${rangeTo} з ${total} ${pluralUa(total, 'клієнта', 'клієнтів', 'клієнтів')}`
                  : 'Клієнтів не знайдено'}
            </p>
          </div>
        </div>
        <div className="ct-head__actions">
          <Button variant="ghost" onClick={() => handleExport(false)} loading={exporting} title="Експортувати поточну вибірку">
            ⬇ Excel
          </Button>
          <Button variant="ghost" onClick={refreshAll}>↻ Оновити</Button>
          <Button variant="primary" onClick={handleAddNew}>+ Додати клієнта</Button>
        </div>
      </header>

      <div className="ct-kpis">
        {kpiCards.map((card) => (
          <button
            key={card.id || 'all'}
            type="button"
            className={`ct-kpi ct-kpi--${card.tone} ${flag === card.id ? 'is-active' : ''}`}
            onClick={() => applyFlag(card.id)}
            title={card.id ? 'Натисніть, щоб відфільтрувати список' : 'Показати всіх клієнтів'}
          >
            <span className="ct-kpi__icon" aria-hidden="true">{card.icon}</span>
            <span className="ct-kpi__body">
              <span className="ct-kpi__value">{stats ? (card.value ?? 0) : '—'}</span>
              <span className="ct-kpi__label">{card.label}</span>
              <span className="ct-kpi__hint">{card.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {duplicateCount > 0 && !duplicatesDismissed && (
        <div className="ct-banner">
          <Badge tone="warning">⚠️ Дублікати</Badge>
          <span>
            Знайдено {duplicateCount} {pluralUa(duplicateCount, 'групу', 'групи', 'груп')} клієнтів зі схожими реквізитами.
          </span>
          <span className="ct-banner__spacer" />
          <Button size="sm" variant="secondary" onClick={() => setShowDuplicates(true)}>Переглянути</Button>
          <button type="button" className="ct-icon-btn" aria-label="Приховати" onClick={() => setDuplicatesDismissed(true)}>×</button>
        </div>
      )}

      <div className="ct-toolbar">
        <div className="ct-search">
          <span className="ct-search__icon" aria-hidden="true">🔍</span>
          <input
            ref={searchRef}
            type="search"
            className="ct-search__input"
            placeholder="Пошук за назвою, ЄДРПОУ, контактом або телефоном"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Пошук клієнтів"
          />
          {search
            ? <button type="button" className="ct-search__clear" onClick={() => setSearch('')} aria-label="Очистити пошук">×</button>
            : <kbd className="ct-search__kbd">/</kbd>}
        </div>

        {isAdmin && filterOptions.regions?.length > 0 && (
          <select className="ct-select" value={regionFilter} onChange={(e) => { setRegionFilter(e.target.value); setPage(1); }} aria-label="Регіон">
            <option value="">Усі регіони</option>
            {filterOptions.regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}

        {isAdmin && filterOptions.managers?.length > 0 && (
          <select className="ct-select" value={managerFilter} onChange={(e) => { setManagerFilter(e.target.value); setPage(1); }} aria-label="Менеджер">
            <option value="">Усі менеджери</option>
            {filterOptions.managers.map((m) => <option key={m.login} value={m.login}>{m.name}</option>)}
          </select>
        )}

        <select className="ct-select" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Сортування">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div className="ct-spacer" />

        <div className="ct-segmented" role="group" aria-label="Вигляд списку">
          <button type="button" className={viewMode === 'table' ? 'is-active' : ''} onClick={() => setViewMode('table')} title="Таблиця">▤</button>
          <button type="button" className={viewMode === 'cards' ? 'is-active' : ''} onClick={() => setViewMode('cards')} title="Картки">▦</button>
        </div>

        <Button
          variant="ghost"
          className={compact ? 'is-active' : ''}
          onClick={() => setCompact((v) => !v)}
          title="Щільність рядків"
        >
          {compact ? '↕ Звичайно' : '↕ Компактно'}
        </Button>
      </div>

      {activeChips.length > 0 && (
        <div className="ct-chips-row">
          {activeChips.map((chip) => (
            <button key={chip.key} type="button" className="ct-filter-chip" onClick={chip.clear}>
              {chip.label}<span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="ct-chips-reset" onClick={resetFilters}>Скинути все</button>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="ct-bulk">
          <strong>Вибрано {selectedIds.length}</strong>
          <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => setNextActionTargets(selectedClients)}>
            ⏰ Запланувати крок
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => runBulk('clearNextAction', undefined, `Зняти нагадування у ${selectedIds.length} клієнтів?`)}>
            Зняти нагадування
          </Button>

          {filterOptions.regions?.length > 0 && (
            <select
              className="ct-select ct-select--sm"
              value=""
              disabled={bulkBusy}
              onChange={(e) => { if (e.target.value) runBulk('setRegion', e.target.value, `Встановити регіон «${e.target.value}» для ${selectedIds.length} клієнтів?`); }}
              aria-label="Змінити регіон"
            >
              <option value="">Змінити регіон…</option>
              {filterOptions.regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          {isAdmin && filterOptions.managers?.length > 0 && (
            <select
              className="ct-select ct-select--sm"
              value=""
              disabled={bulkBusy}
              onChange={(e) => {
                const m = filterOptions.managers.find((x) => x.login === e.target.value);
                if (m) runBulk('assignManager', m.login, `Переназначити ${selectedIds.length} клієнтів на «${m.name}»?`);
              }}
              aria-label="Переназначити менеджера"
            >
              <option value="">Переназначити менеджера…</option>
              {filterOptions.managers.map((m) => <option key={m.login} value={m.login}>{m.name}</option>)}
            </select>
          )}

          <Button size="sm" variant="ghost" disabled={bulkBusy} loading={exporting} onClick={() => handleExport(true)}>
            ⬇ Експорт вибраних
          </Button>
          <span className="ct-bulk__spacer" />
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Зняти вибір</Button>
        </div>
      )}

      <section className="ct-panel">
        <div className="ct-panel__body">
          {loading
            ? renderSkeleton()
            : loadError
              ? (
                <div className="ct-empty">
                  <div className="ct-empty__icon">⚠️</div>
                  <h3>Не вдалося завантажити клієнтів</h3>
                  <p>Перевірте з’єднання та спробуйте ще раз.</p>
                  <Button variant="primary" onClick={refreshAll}>Повторити</Button>
                </div>
              )
              : clients.length === 0
                ? renderEmpty()
                : viewMode === 'table' ? renderTable() : renderCards()}
        </div>

        {!loading && clients.length > 0 && (
          <footer className="ct-pagination">
            <div className="ct-pagination__info">
              Показано <strong>{rangeFrom}–{rangeTo}</strong> з <strong>{total}</strong>
              <select
                className="ct-select ct-select--sm"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                aria-label="Рядків на сторінці"
              >
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} на стор.</option>)}
              </select>
            </div>
            <div className="ct-pagination__nav">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Попередня</Button>
              <span className="ct-pagination__page">{page} / {totalPages}</span>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Наступна ›</Button>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </footer>
        )}
      </section>

      <ClientFormModal
        open={showFormModal}
        onClose={() => { setShowFormModal(false); setEditClient(null); }}
        onSuccess={refreshAll}
        editClient={editClient}
        user={user}
      />

      <ClientCardModal
        open={showCardModal}
        onClose={() => { setShowCardModal(false); setSelectedClientId(null); }}
        clientId={selectedClientId}
        onEdit={handleEdit}
        user={user}
      />

      <NextActionModal
        open={Boolean(nextActionTargets)}
        onClose={() => setNextActionTargets(null)}
        onSaved={refreshAll}
        clients={nextActionTargets || []}
      />

      <DuplicatesModal
        open={showDuplicates}
        onClose={() => setShowDuplicates(false)}
        onOpenClient={handleOpenCard}
      />
    </div>
  );
}

export default ClientsTab;
