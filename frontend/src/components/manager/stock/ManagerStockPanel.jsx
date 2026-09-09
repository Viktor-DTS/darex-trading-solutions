import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import API_BASE_URL from '../../../config';
import { authFetch } from '../../../utils/authFetch';
import { getClients } from '../../../utils/clientsAPI';
import { Button, Badge, Modal } from '../../ui';
import EquipmentList from '../../equipment/EquipmentList';
import SaleFormModal from '../SaleFormModal';
import {
  ampBandId,
  AMP_BANDS,
  attachIncomingLots,
  buildFamilies,
  canRequestTesting,
  canReserve,
  catalogStats,
  detectBoardScale,
  displayText,
  familyKey,
  findAnalogues,
  findComplements,
  formatAmps,
  formatArrivalDate,
  formatPower,
  formatPowerCompact,
  formatQty,
  freesAtLabel,
  horizonStatusLabel,
  incomingLotMatchesFilters,
  incomingLotToItem,
  isDieselGenerator,
  isFullyReady,
  isIncomingItem,
  isMine,
  isOfferable,
  isReserved,
  isTestingActive,
  isTested,
  isTransit,
  powerBandId,
  POWER_BANDS,
  printOfferHtml,
  qtyOf,
  shortWarehouseName,
  testingLabel,
  testingKey,
  unitMatchesFilters,
  warehouseDisplayName,
  warehouseLabel,
} from './stockUtils';
import './ManagerStockPanel.css';

const VIEW_KEY = 'managerStock.viewMode';
const SESSION_KEY = 'managerStock.clientSession';

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const ManagerStockPanel = forwardRef(function ManagerStockPanel(
  {
    user,
    warehouses = [],
    categoryId = null,
    includeSubtree = true,
    onReserve,
    onRequestTesting,
  },
  ref
) {
  const listRef = useRef(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem(VIEW_KEY) || 'pick');
  const [boardKind, setBoardKind] = useState('geo');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [powerKw, setPowerKw] = useState('');
  const [powerTol, setPowerTol] = useState(50);
  const [kindFilter, setKindFilter] = useState('all');
  const [freeOnly, setFreeOnly] = useState(false);
  const [includeExpected, setIncludeExpected] = useState(false);
  const [incomingLots, setIncomingLots] = useState([]);
  const [testedOnly, setTestedOnly] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [myOnly, setMyOnly] = useState(false);
  const [client, setClient] = useState(readSession);
  const [clientQ, setClientQ] = useState('');
  const [clientHits, setClientHits] = useState([]);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [basket, setBasket] = useState([]);
  const [incomingKpNote, setIncomingKpNote] = useState('');
  const [compare, setCompare] = useState([]);
  const [familyModalKey, setFamilyModalKey] = useState(null);
  const [showAllAvr, setShowAllAvr] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailFull, setDetailFull] = useState(null);
  const [showSale, setShowSale] = useState(false);
  const [saleItems, setSaleItems] = useState(null);

  const login = user?.login || '';

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      if (client) sessionStorage.setItem(SESSION_KEY, JSON.stringify(client));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, [client]);

  const loadIncoming = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await authFetch(`${API_BASE_URL}/ved/incoming-for-managers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setIncomingLots([]);
        return;
      }
      const data = await res.json();
      setIncomingLots(Array.isArray(data.lots) ? data.lots : []);
    } catch (err) {
      console.error(err);
      setIncomingLots([]);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.set('managerCategoryContext', '1');
      if (categoryId) {
        params.set('categoryId', categoryId);
        if (includeSubtree) params.set('includeSubtree', 'true');
      }
      const res = await authFetch(`${API_BASE_URL}/equipment/manager-catalog?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data.items) ? data.items : []);
        setTruncated(!!data.truncated);
        return;
      }
      const fallback = await authFetch(`${API_BASE_URL}/equipment?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!fallback.ok) {
        setItems([]);
        return;
      }
      const data = await fallback.json();
      const list = Array.isArray(data) ? data : data.items || [];
      setItems(list);
      setTruncated(false);
    } catch (err) {
      console.error(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [categoryId, includeSubtree]);

  useEffect(() => {
    if (viewMode === 'registry') return undefined;
    loadCatalog();
    loadIncoming();
    return undefined;
  }, [loadCatalog, loadIncoming, viewMode]);

  useImperativeHandle(ref, () => ({
    refresh: () => {
      loadCatalog();
      loadIncoming();
      listRef.current?.refresh?.();
    },
  }));

  const powerFilter = useMemo(() => {
    const n = Number(String(powerKw).replace(',', '.'));
    const rawTol = Number(powerTol);
    const tol = powerTol === '' || !Number.isFinite(rawTol) || rawTol < 0 ? 50 : rawTol;
    if (!Number.isFinite(n) || n <= 0) {
      return { powerMin: null, powerMax: null, target: null, tol };
    }
    return {
      target: n,
      tol,
      powerMin: Math.max(0, n - tol),
      powerMax: n + tol,
    };
  }, [powerKw, powerTol]);

  const filters = useMemo(
    () => ({
      powerMin: powerFilter.powerMin,
      powerMax: powerFilter.powerMax,
      freeOnly,
      testedOnly,
      readyOnly,
      myOnly,
      group: kindFilter,
    }),
    [powerFilter, freeOnly, testedOnly, readyOnly, myOnly, kindFilter]
  );

  const visibleItems = useMemo(
    () => items.filter((item) => unitMatchesFilters(item, filters, login)),
    [items, filters, login]
  );

  const dguIncomingLots = useMemo(
    () => incomingLots.filter((lot) => lot.sheetType !== 'zip'),
    [incomingLots]
  );
  const stockFamilies = useMemo(() => buildFamilies(visibleItems, login), [visibleItems, login]);
  const stats = useMemo(() => catalogStats(visibleItems, login), [visibleItems, login]);
  const allStockFamilies = useMemo(() => buildFamilies(items, login), [items, login]);
  const allFamilies = useMemo(
    () =>
      attachIncomingLots(allStockFamilies, dguIncomingLots, {
        includeOrphans: true,
        includeIncomingUnits: true,
      }).families,
    [allStockFamilies, dguIncomingLots]
  );
  const families = useMemo(() => {
    const attached = attachIncomingLots(stockFamilies, dguIncomingLots, {
      includeOrphans: includeExpected,
      includeIncomingUnits: includeExpected,
    }).families;
    if (!includeExpected) return attached.filter((f) => !f.incomingOnly);
    return attached.filter((f) => {
      if (!f.incomingOnly) return true;
      return incomingLotMatchesFilters(f.incomingLots[0], filters);
    });
  }, [stockFamilies, dguIncomingLots, includeExpected, filters]);
  const soonFamilies = useMemo(() => {
    const kindPower = {
      group: filters.group,
      powerMin: filters.powerMin,
      powerMax: filters.powerMax,
    };
    return allFamilies.filter(
      (f) =>
        f.incomingQty > 0 &&
        (f.incomingLots || []).some(
          (lot) => lot.sheetType !== 'zip' && incomingLotMatchesFilters(lot, kindPower)
        )
    );
  }, [allFamilies, filters.group, filters.powerMin, filters.powerMax]);
  const familyModal = useMemo(
    () =>
      familyModalKey
        ? families.find((f) => f.key === familyModalKey)
          || allFamilies.find((f) => f.key === familyModalKey)
          || null
        : null,
    [allFamilies, families, familyModalKey]
  );
  const openFamilyModal = useCallback((key) => {
    if (key) {
      setShowAllAvr(false);
      setFamilyModalKey(key);
    }
  }, []);
  const closeFamilyModal = useCallback(() => {
    if (detail || detailFull) return;
    setFamilyModalKey(null);
  }, [detail, detailFull]);

  const inBasket = useCallback(
    (id) => basket.some((x) => String(x._id) === String(id)),
    [basket]
  );
  const inCompare = useCallback(
    (id) => compare.some((x) => String(x._id) === String(id)),
    [compare]
  );

  const addToBasket = (unit) => {
    if (!unit?._id || inBasket(unit._id)) return;
    if (isIncomingItem(unit) && !unit.canPromise) {
      alert('Цю партію ще не можна ставити в КП — ВЕД не підтвердив «можна обіцяти»');
      return;
    }
    setBasket((prev) => [...prev, unit]);
  };

  const addFamilyToBasket = (family) => {
    const fromUnits = (family.units || []).filter(
      (u) => isOfferable(u) || (isIncomingItem(u) && u.canPromise)
    );
    const fromLots = (family.incomingLots || [])
      .filter((lot) => lot.canPromise)
      .map(incomingLotToItem);
    const pick = [...fromUnits];
    const seen = new Set(pick.map((x) => String(x._id)));
    for (const u of fromLots) {
      if (!seen.has(String(u._id))) pick.push(u);
    }
    if (!pick.length) {
      pick.push(...(family.units || []).filter((u) => !isIncomingItem(u)));
    }
    setBasket((prev) => {
      const have = new Set(prev.map((x) => String(x._id)));
      const next = [...prev];
      for (const u of pick) {
        if (!have.has(String(u._id))) next.push(u);
      }
      return next;
    });
  };

  const incomingAction = async (lot, action, method = 'POST') => {
    if (!lot?.lotKey) return;
    try {
      const token = localStorage.getItem('token');
      const res = await authFetch(`${API_BASE_URL}/ved/incoming-for-managers/${lot.lotKey}/${action}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: method === 'DELETE' ? undefined : JSON.stringify({
          clientId: client?._id || null,
          clientName: client?.name || '',
          productName: lot.productName,
          qty: lot.quantity,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося оновити очікувану партію');
        return;
      }
      await loadIncoming();
    } catch (err) {
      console.error(err);
      alert('Помилка з\'єднання з сервером');
    }
  };

  const removeFromBasket = (id) => {
    setBasket((prev) => prev.filter((x) => String(x._id) !== String(id)));
  };

  const toggleCompare = (unit) => {
    if (!unit?._id) return;
    setCompare((prev) => {
      if (prev.some((x) => String(x._id) === String(unit._id))) {
        return prev.filter((x) => String(x._id) !== String(unit._id));
      }
      if (prev.length >= 4) return prev;
      return [...prev, unit];
    });
  };

  const reservePreset = useMemo(
    () =>
      client
        ? { clientName: client.name || '', edrpou: client.edrpou || '', clientId: client._id }
        : {},
    [client]
  );

  const cancelReserve = async (unit) => {
    if (!unit?._id) return;
    if (!window.confirm(`Зняти резерв з «${displayText(unit.type)}»?`)) return;
    try {
      const token = localStorage.getItem('token');
      const res = await authFetch(`${API_BASE_URL}/equipment/${unit._id}/cancel-reserve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Не вдалося зняти резерв');
        return;
      }
      setDetail(null);
      setDetailFull(null);
      loadCatalog();
    } catch (err) {
      console.error(err);
      alert('Помилка з\'єднання з сервером');
    }
  };

  const openReserve = (unit) => {
    if (!unit) return;
    onReserve?.(unit, reservePreset);
  };

  const reserveBasket = () => {
    const free = basket.filter(canReserve);
    if (!free.length) {
      alert('У кошику немає вільних позицій для резерву');
      return;
    }
    onReserve?.(free[0], { ...reservePreset, batchItems: free });
  };

  const openKp = () => {
    if (!basket.length) return;
    setFamilyModalKey(null);
    const stock = basket.filter((item) => !isIncomingItem(item));
    const incoming = basket.filter(isIncomingItem);
    setIncomingKpNote(
      incoming
        .map((item) => {
          const when = formatArrivalDate(item.expectedArrivalDate) || horizonStatusLabel(item.horizonStatus);
          return `${displayText(item.type)} × ${qtyOf(item)} (очікується ${when})`;
        })
        .join('; ')
    );
    setSaleItems(
      stock.map((item) => ({
        equipmentId: item._id,
        type: item.type || '',
        serialNumber: item.serialNumber || '',
        amount: 0,
      }))
    );
    setShowSale(true);
  };

  const printKp = () => {
    if (!basket.length) return;
    const html = printOfferHtml(client, basket);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const openDetail = async (unit) => {
    if (!unit || isIncomingItem(unit)) return;
    setDetail(unit);
    setDetailFull(null);
    try {
      const token = localStorage.getItem('token');
      const res = await authFetch(`${API_BASE_URL}/equipment/${unit._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDetailFull(await res.json());
    } catch {
      /* keep list snapshot */
    }
  };

  const searchClients = async (q) => {
    setClientQ(q);
    if (!q.trim()) {
      setClientHits([]);
      return;
    }
    const data = await getClients({ q: q.trim(), limit: 12 });
    const list = Array.isArray(data) ? data : data.clients || [];
    setClientHits(list);
    setShowClientDrop(true);
  };

  const pickClient = (c) => {
    setClient({ _id: c._id, name: c.name || '', edrpou: c.edrpou || '', region: c.region || '' });
    setClientQ('');
    setShowClientDrop(false);
  };

  const onDragStart = (e, unit) => {
    e.dataTransfer.setData('text/plain', String(unit._id));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onBasketDrop = (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const unit = items.find((x) => String(x._id) === String(id));
    if (unit) addToBasket(unit);
  };

  const familyAnalogues = (family) => findAnalogues(family, allFamilies);

  const familyBadge = (family) => {
    const week = family.incomingWeekQty > 0
      ? <Badge tone="warning">+{family.incomingWeekQty} за тиждень</Badge>
      : family.incomingQty > 0
        ? <Badge tone="info">+{family.incomingQty} від ВЕД</Badge>
        : null;
    const main = family.readyQty > 0
      ? <Badge tone="success">Можна пропонувати</Badge>
      : family.myReservedQty > 0
        ? <Badge tone="info">Ваш резерв</Badge>
        : family.incomingOnly
          ? <Badge tone="warning">Очікується</Badge>
          : <Badge>Немає вільних</Badge>;
    return (
      <span className="msp-badges">
        {main}
        {week}
      </span>
    );
  };

  const renderFamilyCard = (family, { compact = false } = {}) => {
    const power = formatPower(family) || formatAmps(family);
    const isActive = familyModalKey === family.key;
    return (
      <article
        key={family.key}
        className={`msp-card ${isActive ? 'is-open' : ''}`}
        onClick={() => openFamilyModal(family.key)}
      >
        <div className="msp-card-top">
          <div>
            <h3>{family.type}</h3>
            {family.manufacturer ? <p className="msp-mfr">{family.manufacturer}</p> : null}
          </div>
          {familyBadge(family)}
        </div>
        {power ? <div className="msp-spec">{power}{family.phase ? ` · ${family.phase}` : ''}</div> : null}
        <div className="msp-wh-line">
          {family.warehouses.map((w) => (
            <span key={w.id} className="msp-wh-pill" title={w.name}>
              {warehouseDisplayName(w.name)} · {w.freeQty}/{w.qty}
            </span>
          ))}
        </div>
        <div className="msp-meta">
          <span className="msp-dot"><i className="free" /> {family.freeQty} вільн.</span>
          <span className="msp-dot"><i className="res" /> {family.reservedQty} резерв</span>
          {family.testingQty > 0 ? (
            <span className="msp-dot"><i className="test" /> {family.testingQty} тест</span>
          ) : null}
          <span>{family.totalQty} разом</span>
        </div>
        <div className="msp-actions" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="secondary" onClick={() => openFamilyModal(family.key)}>
            {compact ? 'Одиниці' : `Одиниці (${family.units.length})`}
          </Button>
          <Button
            size="sm"
            variant={compact ? 'secondary' : 'primary'}
            onClick={() => addFamilyToBasket(family)}
            disabled={!family.units.length && !(family.incomingLots || []).some((l) => l.canPromise)}
          >
            {compact ? 'У кошик' : 'У кошик КП'}
          </Button>
        </div>
      </article>
    );
  };

  const renderPick = () => {
    if (loading) return <div className="msp-empty">Завантаження вітрини…</div>;
    if (!families.length) {
      return (
        <div className="msp-empty">
          Нічого не знайдено. Змініть потужність, відхилення, тип або скиньте фільтри.
        </div>
      );
    }
    return <div className="msp-grid">{families.map((f) => renderFamilyCard(f))}</div>;
  };

  const renderGeoBoard = () => {
    const cols = warehouses.length
      ? warehouses.map((w) => ({
          id: String(w._id),
          name: w.name,
          title: warehouseDisplayName(w.name),
        }))
      : [...new Map(visibleItems.map((i) => {
          const name = warehouseLabel(i);
          return [String(i.currentWarehouse || name), { id: String(i.currentWarehouse || name), name, title: warehouseDisplayName(name) }];
        })).values()];
    const transitCol = {
      id: 'transit',
      name: 'В дорозі',
      title: 'В дорозі',
    };
    const soonCol = {
      id: 'soon',
      name: 'Скоро',
      title: 'Скоро',
    };
    const allCols = [...cols, transitCol, soonCol];
    return (
      <div className="msp-board is-geo">
        {allCols.map((col) => {
          const colFams = col.id === 'soon'
            ? soonFamilies
            : families
              .map((f) => {
                const units = f.units.filter((u) => {
                  if (isIncomingItem(u)) return false;
                  if (col.id === 'transit') return isTransit(u);
                  return String(u.currentWarehouse || '') === String(col.id) || warehouseLabel(u) === col.name;
                });
                if (!units.length) return null;
                return { ...f, units, freeQty: units.filter(isOfferable).reduce((s, u) => s + qtyOf(u), 0), totalQty: units.reduce((s, u) => s + qtyOf(u), 0) };
              })
              .filter(Boolean);
          return (
            <section key={col.id} className={`msp-col${col.id === 'soon' ? ' is-soon' : ''}`}>
              <div className="msp-col-h" title={col.name}>
                {col.title}
                <span>{colFams.length}</span>
              </div>
              <div className="msp-col-b">
                {colFams.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className="msp-mini"
                    onClick={() => openFamilyModal(f.key)}
                    onDoubleClick={() => addFamilyToBasket(f)}
                  >
                    <strong>{f.type}</strong>
                    <em>
                      {col.id === 'soon'
                        ? `${formatPowerCompact(f) || formatAmps(f) || '—'} · +${f.incomingQty} від ВЕД${f.incomingWeekQty ? ` · ${f.incomingWeekQty} за тиждень` : ''}`
                        : `${formatPowerCompact(f) || formatAmps(f) || '—'} · вільних ${f.freeQty} / ${f.totalQty}`}
                    </em>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderPowerBoard = () => {
    const scale = detectBoardScale(families);
    const bands = scale === 'kw' ? POWER_BANDS : AMP_BANDS;
    return (
      <div className="msp-board is-power">
        {bands.map((band) => {
          const list = families.filter((f) =>
            scale === 'kw' ? powerBandId(f.powerKw) === band.id : ampBandId(f.amp) === band.id
          );
          return (
            <section key={band.id} className="msp-col">
              <div className="msp-col-h">
                {band.label}
                <span>{list.length}</span>
              </div>
              <div className="msp-col-b">
                {list.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className="msp-mini"
                    onClick={() => openFamilyModal(f.key)}
                    onDoubleClick={() => addFamilyToBasket(f)}
                  >
                    <strong>{f.type}</strong>
                    <em>
                      {formatPowerCompact(f) || formatAmps(f) || '—'} · {f.warehouses.map((w) => warehouseDisplayName(w.name)).join(', ')}
                    </em>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderOpsBoard = () => {
    const cols = [
      { id: 'free', label: 'Вільні', test: isOfferable },
      { id: 'mine', label: 'Мої резерви', test: (u) => isMine(u, login) },
      { id: 'other', label: 'Чужі резерви', test: (u) => isReserved(u) && !isMine(u, login) },
      { id: 'test', label: 'На тесті', test: isTestingActive },
    ];
    return (
      <div className="msp-board is-ops">
        {cols.map((col) => {
          const units = visibleItems.filter(col.test);
          return (
            <section key={col.id} className="msp-col">
              <div className="msp-col-h">
                {col.label}
                <span>{units.length}</span>
              </div>
              <div className="msp-col-b">
                {units.map((u) => (
                  <button
                    key={u._id}
                    type="button"
                    className="msp-mini"
                    draggable
                    onDragStart={(e) => onDragStart(e, u)}
                    onClick={() => openDetail(u)}
                  >
                    <strong>{displayText(u.type)}</strong>
                    <em>
                      {shortWarehouseName(warehouseLabel(u))} · {displayText(u.serialNumber)}
                      {freesAtLabel(u) ? ` · до ${freesAtLabel(u)}` : ''}
                    </em>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const shown = detailFull || detail;
  const shownFamily = shown ? allFamilies.find((f) => f.key === familyKey(shown)) : null;
  const analogues = shownFamily ? findAnalogues(shownFamily, allFamilies) : [];
  const modalAnalogues = familyModal ? familyAnalogues(familyModal) : [];
  const modalComplements = familyModal
    ? findComplements(familyModal, allFamilies, { showAll: showAllAvr })
    : [];
  const showComplements = !!(familyModal && isDieselGenerator(familyModal));
  const modalPower = familyModal
    ? [formatPower(familyModal) || formatAmps(familyModal), familyModal.phase].filter(Boolean).join(' · ')
    : '';
  const familyInBasket = (family) =>
    (family.units || []).some((u) => inBasket(u._id)) ||
    (family.incomingLots || []).some((lot) => inBasket(`incoming:${lot.lotKey}`));

  return (
    <div className="msp">
      <div className="msp-head">
        <div className="msp-head-row">
          <h2 className="msp-title">
            Підбір зі складу
            {truncated ? <span>показано перші 5000 позицій</span> : null}
          </h2>
          <div className="msp-view-switch">
            <span className="msp-view-hint">Режим перегляду залишків</span>
            <div className="msp-modes" role="tablist">
              {[
                ['pick', 'Підбір'],
                ['board', 'Борд'],
                ['registry', 'Реєстр'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={viewMode === id ? 'is-on' : ''}
                  onClick={() => setViewMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="msp-head-row">
          <div className="msp-session">
            {client ? (
              <div className="msp-session-chip">
                Підбираю для: <b>{client.name}</b>
                {client.edrpou ? <span>{client.edrpou}</span> : null}
                <button type="button" onClick={() => setClient(null)} title="Скинути клієнта">×</button>
              </div>
            ) : (
              <input
                value={clientQ}
                onChange={(e) => searchClients(e.target.value)}
                onFocus={() => clientHits.length && setShowClientDrop(true)}
                onBlur={() => setTimeout(() => setShowClientDrop(false), 180)}
                placeholder="Клієнт для підбору (назва або ЄДРПОУ)"
              />
            )}
            {showClientDrop && clientHits.length ? (
              <ul className="msp-drop">
                {clientHits.map((c) => (
                  <li key={c._id} onMouseDown={() => pickClient(c)}>
                    {c.name || c.edrpou}
                    <small>{[c.edrpou, c.region].filter(Boolean).join(' · ')}</small>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {viewMode !== 'registry' ? (
            <div className="msp-filters">
              <label className="msp-field">
                <span>Номінальна потужність</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={powerKw}
                  onChange={(e) => setPowerKw(e.target.value)}
                  placeholder="кВт"
                />
              </label>
              <label className="msp-field msp-field--tol">
                <span>Відхилення ±</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={powerTol}
                  onChange={(e) => setPowerTol(e.target.value)}
                />
              </label>
              <label className="msp-check msp-check--filter">
                <input
                  type="checkbox"
                  checked={freeOnly}
                  onChange={(e) => setFreeOnly(e.target.checked)}
                />
                Показати тільки вільне обладнання
              </label>
              <label className="msp-check msp-check--filter">
                <input
                  type="checkbox"
                  checked={includeExpected}
                  onChange={(e) => setIncludeExpected(e.target.checked)}
                />
                Включити очікувані
              </label>
              <label className="msp-field msp-field--select">
                <span>Список</span>
                <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
                  <option value="all">Показати все</option>
                  <option value="avr">АВР</option>
                  <option value="generator">Дизель генератор</option>
                </select>
              </label>
              {powerFilter.target != null ? (
                <span className="msp-chip">
                  {powerFilter.powerMin}–{powerFilter.powerMax} кВт
                </span>
              ) : null}
              <Button
                size="sm"
                variant="danger"
                className="msp-reset"
                onClick={() => {
                  setPowerKw('');
                  setPowerTol(50);
                  setKindFilter('all');
                  setFreeOnly(false);
                  setIncludeExpected(false);
                  setTestedOnly(false);
                  setReadyOnly(false);
                  setMyOnly(false);
                }}
              >
                Скинути фільтр
              </Button>
            </div>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => { loadCatalog(); loadIncoming(); }}>Оновити</Button>
        </div>
        {viewMode !== 'registry' ? (
          <div className="msp-toggles">
            <button type="button" className={readyOnly ? 'is-on' : ''} onClick={() => setReadyOnly((v) => !v)}>Можна пропонувати</button>
            <button type="button" className={testedOnly ? 'is-on' : ''} onClick={() => setTestedOnly((v) => !v)}>Протестовані</button>
            <button type="button" className={myOnly ? 'is-on' : ''} onClick={() => setMyOnly((v) => !v)}>Мій резерв</button>
          </div>
        ) : null}
      </div>

      {viewMode !== 'registry' ? (
        <div className="msp-kpis">
          <div className="msp-kpi"><b>{stats.rows}</b><span>позицій</span></div>
          <div className="msp-kpi"><b>{families.length}</b><span>сімейств</span></div>
          <div className="msp-kpi is-free"><b>{stats.free}</b><span>вільних</span></div>
          <div className="msp-kpi is-res"><b>{stats.reserved}</b><span>у резерві</span></div>
          <div className="msp-kpi is-test"><b>{stats.testing}</b><span>на тесті</span></div>
          <div className="msp-kpi is-ready"><b>{stats.ready}</b><span>повністю готові</span></div>
          {dguIncomingLots.length ? (
            <div className="msp-kpi is-soon"><b>{dguIncomingLots.length}</b><span>очікуваних ВЕД</span></div>
          ) : null}
        </div>
      ) : null}

      {viewMode === 'registry' ? (
        <div className="msp-registry">
          <EquipmentList
            ref={listRef}
            user={user}
            warehouses={warehouses}
            onReserve={(eq) => onReserve?.(eq, reservePreset)}
            onRequestTesting={onRequestTesting}
            showReserveAction
            categoryId={categoryId}
            includeSubtree
            managerCategoryContext
          />
        </div>
      ) : (
        <div className="msp-body">
          <div className="msp-main">
            {viewMode === 'board' ? (
              <>
                <div className="msp-board-switch">
                  {[
                    ['geo', 'По складах'],
                    ['power', 'Номінальна потужність'],
                    ['ops', 'Що я контролюю'],
                  ].map(([id, label]) => (
                    <Button
                      key={id}
                      size="sm"
                      variant={boardKind === id ? 'primary' : 'secondary'}
                      onClick={() => setBoardKind(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {boardKind === 'geo' ? renderGeoBoard() : boardKind === 'power' ? renderPowerBoard() : renderOpsBoard()}
              </>
            ) : (
              renderPick()
            )}
          </div>
          <aside
            className="msp-basket"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onBasketDrop}
          >
            <h3>Кошик КП · {basket.length}</h3>
            <div className="msp-basket-list">
              {basket.length === 0 ? (
                <div className="msp-empty">Перетягніть одиницю сюди або натисніть «У кошик КП».</div>
              ) : (
                basket.map((item) => (
                  <div key={item._id} className="msp-basket-item">
                    <button type="button" onClick={() => removeFromBasket(item._id)} title="Прибрати">×</button>
                    <b>{displayText(item.type)}</b>
                    <div>
                      {isIncomingItem(item)
                        ? `Очікується ${formatArrivalDate(item.expectedArrivalDate) || horizonStatusLabel(item.horizonStatus)} · ${shortWarehouseName(warehouseLabel(item))}`
                        : `${displayText(item.serialNumber)} · ${shortWarehouseName(warehouseLabel(item))}`}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="msp-basket-foot">
              <Button variant="primary" disabled={!basket.length} onClick={openKp}>
                Створити угоду / КП
              </Button>
              <Button disabled={!basket.length} onClick={printKp}>Друкувати пропозицію</Button>
              <Button disabled={!basket.some(canReserve)} onClick={reserveBasket}>
                Резерв усіх вільних
              </Button>
              <Button variant="ghost" disabled={!basket.length} onClick={() => setBasket([])}>Очистити</Button>
            </div>
          </aside>
        </div>
      )}

      {compare.length > 0 ? (
        <div className="msp-compare">
          <table>
            <thead>
              <tr>
                <th>Порівняння</th>
                {compare.map((u) => (
                  <th key={u._id}>
                    {displayText(u.type)}
                    <Button size="sm" variant="ghost" onClick={() => toggleCompare(u)}>Прибрати</Button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Виробник', (u) => displayText(u.manufacturer)],
                ['Потужність', (u) => formatPower(u) || '—'],
                ['Струм', (u) => formatAmps(u) || '—'],
                ['Фаза / напруга', (u) => [u.phase, u.voltage].filter(Boolean).join(' · ') || '—'],
                ['Склад', (u) => warehouseLabel(u)],
                ['Серійний №', (u) => displayText(u.serialNumber)],
                ['К-сть', (u) => formatQty(u)],
                ['Резерв', (u) => (isReserved(u) ? `До ${freesAtLabel(u) || '—'}` : 'Вільна')],
                ['Тест', (u) => testingLabel(testingKey(u))],
              ].map(([label, fn]) => (
                <tr key={label}>
                  <th>{label}</th>
                  {compare.map((u) => (
                    <td key={u._id}>{fn(u)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={!!familyModal}
        onClose={closeFamilyModal}
        size="xl"
        className="msp-family-modal"
        title={familyModal?.type || 'Обладнання'}
        subtitle={[familyModal?.manufacturer, modalPower].filter(Boolean).join(' · ')}
        footer={familyModal ? (
          <>
            <Button variant="ghost" onClick={closeFamilyModal}>Закрити</Button>
            <Button
              variant="primary"
              disabled={!familyModal.units.length && !(familyModal.incomingLots || []).some((l) => l.canPromise)}
              onClick={() => addFamilyToBasket(familyModal)}
            >
              У кошик КП
            </Button>
          </>
        ) : null}
      >
        {familyModal ? (
          <div className="msp-family-modal-body">
            <div className="msp-card-top">
              {familyBadge(familyModal)}
            </div>
            {modalPower ? <div className="msp-spec">{modalPower}</div> : null}
            <div className="msp-wh-line">
              {familyModal.warehouses.map((w) => (
                <span key={w.id} className="msp-wh-pill" title={w.name}>
                  {warehouseDisplayName(w.name)} · {w.freeQty}/{w.qty}
                </span>
              ))}
            </div>
            <div className="msp-meta">
              <span className="msp-dot"><i className="free" /> {familyModal.freeQty} вільн.</span>
              <span className="msp-dot"><i className="res" /> {familyModal.reservedQty} резерв</span>
              {familyModal.testingQty > 0 ? (
                <span className="msp-dot"><i className="test" /> {familyModal.testingQty} тест</span>
              ) : null}
              <span>{familyModal.totalQty} разом</span>
            </div>
            <div className="msp-horizon">
              <strong>Горизонт</strong>
              <div className="msp-horizon-grid">
                <span>
                  На складі
                  <b>
                    {familyModal.units.filter((u) => !isIncomingItem(u) && !isTransit(u)).reduce((s, u) => s + qtyOf(u), 0)}
                  </b>
                </span>
                <span>
                  Між складами
                  <b>
                    {familyModal.units.filter((u) => !isIncomingItem(u) && isTransit(u)).reduce((s, u) => s + qtyOf(u), 0)}
                  </b>
                </span>
                <span>
                  Від ВЕД
                  <b>{familyModal.incomingQty || 0}</b>
                </span>
              </div>
            </div>
            <div className="msp-units">
              {familyModal.units.filter((unit) => !isIncomingItem(unit)).map((unit) => (
                <UnitRow
                  key={unit._id}
                  unit={unit}
                  login={login}
                  inBasket={inBasket(unit._id)}
                  inCompare={inCompare(unit._id)}
                  onOpen={() => openDetail(unit)}
                  onBasket={() => addToBasket(unit)}
                  onCompare={() => toggleCompare(unit)}
                  onReserve={() => openReserve(unit)}
                  onTest={() => onRequestTesting?.(unit)}
                  onDragStart={(e) => onDragStart(e, unit)}
                />
              ))}
            </div>
            {(familyModal.incomingLots || []).length ? (
              <div className="msp-analog is-incoming">
                <strong>Очікувані партії ВЕД</strong>
                {familyModal.incomingLots.map((lot) => (
                  <IncomingLotRow
                    key={lot.lotKey}
                    lot={lot}
                    inBasket={inBasket(`incoming:${lot.lotKey}`)}
                    onBasket={() => addToBasket(incomingLotToItem(lot))}
                    onInterest={() => incomingAction(lot, 'interest', lot.myInterest ? 'DELETE' : 'POST')}
                    onSoftReserve={() => incomingAction(lot, 'soft-reserve', lot.mySoftReserve ? 'DELETE' : 'POST')}
                  />
                ))}
              </div>
            ) : null}
            {modalAnalogues.length ? (
              <div className="msp-analog is-analogues">
                <strong>Аналоги</strong>
                {modalAnalogues.map((a) => (
                  <RelatedFamilyRow
                    key={a.key}
                    family={a}
                    inBasket={familyInBasket(a)}
                    onOpen={() => openFamilyModal(a.key)}
                    onBasket={() => addFamilyToBasket(a)}
                  />
                ))}
              </div>
            ) : null}
            {showComplements ? (
              <div className="msp-analog is-complements">
                <div className="msp-related-head">
                  <strong>Комплектація</strong>
                  <label className="msp-check">
                    <input
                      type="checkbox"
                      checked={showAllAvr}
                      onChange={(e) => setShowAllAvr(e.target.checked)}
                    />
                    Показати всі АВР
                  </label>
                </div>
                {modalComplements.length ? (
                  modalComplements.map((a) => (
                    <RelatedFamilyRow
                      key={a.key}
                      family={a}
                      inBasket={familyInBasket(a)}
                      onOpen={() => openFamilyModal(a.key)}
                      onBasket={() => addFamilyToBasket(a)}
                    />
                  ))
                ) : (
                  <div className="msp-related-empty">
                    {showAllAvr ? 'АВР на складі немає' : 'Немає АВР з більшою потужністю'}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {shown ? (
        <div className="msp-drawer-back" onClick={() => { setDetail(null); setDetailFull(null); }}>
          <div className="msp-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="msp-drawer-h">
              <div>
                <h3>{displayText(shown.type)}</h3>
                <p className="msp-mfr">{displayText(shown.manufacturer)}</p>
              </div>
              <Button variant="ghost" onClick={() => { setDetail(null); setDetailFull(null); }}>Закрити</Button>
            </div>
            <div className="msp-drawer-b">
              {shown.photoUrl ? <img className="msp-photo" src={shown.photoUrl} alt="" /> : null}
              <div className="msp-actions">
                {isFullyReady(shown) ? <Badge tone="success">Можна пропонувати</Badge> : null}
                {isOfferable(shown) && !isFullyReady(shown) ? <Badge tone="info">Вільна</Badge> : null}
                {isReserved(shown) ? <Badge tone="warning">Резерв до {freesAtLabel(shown) || '—'}</Badge> : null}
                {isTested(shown) ? <Badge tone="success">Протестовано</Badge> : null}
              </div>
              <dl className="msp-dl">
                <dt>Серійний №</dt><dd>{displayText(shown.serialNumber)}</dd>
                <dt>Склад</dt><dd>{warehouseLabel(shown)}</dd>
                <dt>Кількість</dt><dd>{formatQty(shown)}</dd>
                <dt>Потужність</dt><dd>{formatPower(shown) || '—'}</dd>
                <dt>Струм</dt><dd>{formatAmps(shown) || '—'}</dd>
                <dt>Фаза / напруга</dt><dd>{[shown.phase, shown.voltage].filter(Boolean).join(' · ') || '—'}</dd>
                <dt>Тест</dt><dd>{testingLabel(testingKey(shown))}</dd>
                <dt>Резерв</dt>
                <dd>
                  {isReserved(shown)
                    ? `${isMine(shown, login) ? 'Ваш' : displayText(shown.reservedByName, 'чужий')} · до ${freesAtLabel(shown) || '—'}`
                    : 'Вільна'}
                </dd>
              </dl>
              <div className="msp-actions">
                <Button variant="primary" disabled={!canReserve(shown)} onClick={() => openReserve(shown)}>Резерв</Button>
                {isMine(shown, login) ? (
                  <Button variant="ghost" onClick={() => cancelReserve(shown)}>Зняти резерв</Button>
                ) : null}
                <Button disabled={!canRequestTesting(shown)} onClick={() => onRequestTesting?.(shown)}>На тест</Button>
                <Button onClick={() => addToBasket(shown)}>У кошик КП</Button>
                <Button variant="ghost" onClick={() => toggleCompare(shown)}>
                  {inCompare(shown._id) ? 'Прибрати з порівняння' : 'Порівняти'}
                </Button>
              </div>
              {analogues.length ? (
                <div className="msp-analog is-analogues">
                  <strong>Аналоги на складі</strong>
                  {analogues.map((a) => (
                    <RelatedFamilyRow
                      key={a.key}
                      family={a}
                      inBasket={familyInBasket(a)}
                      onOpen={() => {
                        const next = a.units.find(isOfferable) || a.units[0];
                        if (next) openDetail(next);
                      }}
                      onBasket={() => addFamilyToBasket(a)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showSale ? (
        <SaleFormModal
          open={showSale}
          onClose={() => { setShowSale(false); setSaleItems(null); setIncomingKpNote(''); }}
          onSuccess={() => { setShowSale(false); setSaleItems(null); setBasket([]); setIncomingKpNote(''); }}
          user={user}
          initialClient={client}
          initialNotes={[
            client ? `Підбір зі складу для ${client.name}` : 'Підбір зі складу',
            incomingKpNote ? `Очікувані партії ВЕД: ${incomingKpNote}` : '',
          ].filter(Boolean).join('. ')}
          initialEquipmentItems={saleItems}
        />
      ) : null}
    </div>
  );
});

function IncomingLotRow({ lot, inBasket, onBasket, onInterest, onSoftReserve }) {
  const when = formatArrivalDate(lot.expectedArrivalDate) || horizonStatusLabel(lot.horizonStatus);
  const warehouse = lot.arrivalWarehouse || 'ВЕД';
  return (
    <div className={`msp-related msp-incoming-row ${inBasket ? 'is-in' : ''}`}>
      <div className="msp-related-main">
        <b>{lot.productName}</b>
        <small>
          {formatQty(incomingLotToItem(lot))} · {when} · {warehouseDisplayName(warehouse)}
          {' · '}
          {horizonStatusLabel(lot.horizonStatus)}
          {lot.canPromise ? ' · можна обіцяти' : ' · поки не обіцяти'}
          {lot.interestCount ? ` · інтерес ${lot.interestCount}` : ''}
          {lot.softReservedByOther ? ` · м’який резерв (${lot.otherSoftReserveName})` : ''}
          {lot.mySoftReserve ? ' · ваш м’який резерв' : ''}
        </small>
      </div>
      <div className="msp-unit-btns">
        <Button size="sm" variant="ghost" onClick={onInterest}>
          {lot.myInterest ? 'Не слідкувати' : 'Слідкувати'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!lot.canPromise || (lot.softReservedByOther && !lot.mySoftReserve)}
          onClick={onSoftReserve}
        >
          {lot.mySoftReserve ? 'Зняти м’який резерв' : 'М’який резерв'}
        </Button>
        <Button size="sm" variant="ghost" disabled={!lot.canPromise} onClick={onBasket}>
          {inBasket ? 'У кошику' : 'КП'}
        </Button>
      </div>
    </div>
  );
}

function RelatedFamilyRow({ family, inBasket, onOpen, onBasket }) {
  const warehouses = family.warehouses || [];
  return (
    <div className={`msp-related ${inBasket ? 'is-in' : ''}`}>
      <button type="button" className="msp-related-main" onClick={onOpen}>
        <b>{family.type}</b>
        <small>
          {formatPower(family) || formatAmps(family) || '—'} · вільних {family.freeQty}
          {family.totalQty != null ? ` з ${family.totalQty}` : ''}
          {family.incomingQty ? ` · +${family.incomingQty} від ВЕД` : ''}
          {family.incomingWeekQty ? ` (${family.incomingWeekQty} за тиждень)` : ''}
        </small>
        {warehouses.length ? (
          <span className="msp-wh-line">
            {warehouses.map((w) => (
              <span key={w.id} className="msp-wh-pill" title={w.name}>
                {warehouseDisplayName(w.name)} · {w.freeQty}/{w.qty}
              </span>
            ))}
          </span>
        ) : null}
      </button>
      <Button size="sm" variant="ghost" disabled={!family.units.length && !(family.incomingLots || []).some((l) => l.canPromise)} onClick={onBasket}>
        {inBasket ? 'У кошику' : 'КП'}
      </Button>
    </div>
  );
}

function UnitRow({
  unit,
  login,
  inBasket,
  inCompare,
  onOpen,
  onBasket,
  onCompare,
  onReserve,
  onTest,
  onDragStart,
}) {
  return (
    <div
      className={`msp-unit ${inBasket ? 'is-in' : ''}`}
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      role="button"
      tabIndex={0}
    >
      <div>
        <b>{displayText(unit.serialNumber, 'без серійного №')} · {formatQty(unit)}</b>
        <small>
          {shortWarehouseName(warehouseLabel(unit))}
          {isReserved(unit) ? ` · резерв до ${freesAtLabel(unit) || '—'}${isMine(unit, login) ? ' (ваш)' : ''}` : ' · вільна'}
          {isTestingActive(unit) ? ' · на тесті' : isTested(unit) ? ' · протестовано' : ''}
        </small>
      </div>
      <div className="msp-unit-btns" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="ghost" disabled={!canReserve(unit)} onClick={onReserve}>Резерв</Button>
        <Button size="sm" variant="ghost" disabled={!canRequestTesting(unit)} onClick={onTest}>Тест</Button>
        <Button size="sm" variant="ghost" onClick={onBasket}>{inBasket ? 'У кошику' : 'КП'}</Button>
        <Button size="sm" variant="ghost" onClick={onCompare}>{inCompare ? '−' : '+'}</Button>
      </div>
    </div>
  );
}

export default ManagerStockPanel;
