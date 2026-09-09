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
import { Button, Badge } from '../../ui';
import EquipmentList from '../../equipment/EquipmentList';
import SaleFormModal from '../SaleFormModal';
import {
  ampBandId,
  AMP_BANDS,
  buildFamilies,
  canRequestTesting,
  canReserve,
  catalogStats,
  detectBoardScale,
  displayText,
  familyKey,
  findAnalogues,
  formatAmps,
  formatPower,
  formatPowerCompact,
  formatQty,
  freesAtLabel,
  isFullyReady,
  isMine,
  isOfferable,
  isReserved,
  isTestingActive,
  isTested,
  isTransit,
  parseSmartQuery,
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
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [testedOnly, setTestedOnly] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [myOnly, setMyOnly] = useState(false);
  const [client, setClient] = useState(readSession);
  const [clientQ, setClientQ] = useState('');
  const [clientHits, setClientHits] = useState([]);
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [basket, setBasket] = useState([]);
  const [compare, setCompare] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [detail, setDetail] = useState(null);
  const [detailFull, setDetailFull] = useState(null);
  const [showSale, setShowSale] = useState(false);
  const [saleItems, setSaleItems] = useState(null);

  const login = user?.login || '';

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 280);
    return () => clearTimeout(t);
  }, [query]);

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

  const parsed = useMemo(
    () => parseSmartQuery(debouncedQuery, warehouses),
    [debouncedQuery, warehouses]
  );

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
      if (parsed.rest) params.set('search', parsed.rest);
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
  }, [categoryId, includeSubtree, parsed.rest]);

  useEffect(() => {
    if (viewMode === 'registry') return undefined;
    loadCatalog();
    return undefined;
  }, [loadCatalog, viewMode]);

  useImperativeHandle(ref, () => ({
    refresh: () => {
      loadCatalog();
      listRef.current?.refresh?.();
    },
  }));

  const filters = useMemo(
    () => ({
      powerMin: parsed.powerMin,
      powerMax: parsed.powerMax,
      ampMin: parsed.ampMin,
      ampMax: parsed.ampMax,
      warehouseIds: parsed.warehouseIds,
      warehouseNames: parsed.warehouseNames,
      freeOnly: freeOnly || parsed.freeOnly,
      testedOnly: testedOnly || parsed.testedOnly,
      readyOnly: readyOnly || parsed.readyOnly,
      reservedOnly: parsed.reservedOnly,
      myOnly,
    }),
    [parsed, freeOnly, testedOnly, readyOnly, myOnly]
  );

  const visibleItems = useMemo(
    () => items.filter((item) => unitMatchesFilters(item, filters, login)),
    [items, filters, login]
  );

  const families = useMemo(() => buildFamilies(visibleItems, login), [visibleItems, login]);
  const stats = useMemo(() => catalogStats(visibleItems, login), [visibleItems, login]);
  const allFamilies = useMemo(() => buildFamilies(items, login), [items, login]);

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
    setBasket((prev) => [...prev, unit]);
  };

  const addFamilyToBasket = (family) => {
    const ready = family.units.filter(isOfferable);
    const pick = ready.length ? ready : family.units;
    setBasket((prev) => {
      const have = new Set(prev.map((x) => String(x._id)));
      const next = [...prev];
      for (const u of pick) {
        if (!have.has(String(u._id))) next.push(u);
      }
      return next;
    });
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
    setSaleItems(
      basket.map((item) => ({
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

  const renderFamilyCard = (family, { compact = false } = {}) => {
    const open = !!expanded[family.key];
    const power = formatPower(family) || formatAmps(family);
    return (
      <article key={family.key} className={`msp-card ${open ? 'is-open' : ''}`}>
        <div className="msp-card-top">
          <div>
            <h3>{family.type}</h3>
            {family.manufacturer ? <p className="msp-mfr">{family.manufacturer}</p> : null}
          </div>
          {family.readyQty > 0 ? (
            <Badge tone="success">Можна пропонувати</Badge>
          ) : family.myReservedQty > 0 ? (
            <Badge tone="info">Ваш резерв</Badge>
          ) : (
            <Badge>Немає вільних</Badge>
          )}
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
        {!compact ? (
          <div className="msp-actions">
            <Button size="sm" variant="secondary" onClick={() => setExpanded((s) => ({ ...s, [family.key]: !s[family.key] }))}>
              {open ? 'Сховати одиниці' : `Одиниці (${family.units.length})`}
            </Button>
            <Button size="sm" variant="primary" onClick={() => addFamilyToBasket(family)} disabled={!family.units.length}>
              У кошик КП
            </Button>
          </div>
        ) : (
          <div className="msp-actions">
            <Button size="sm" variant="secondary" onClick={() => setExpanded((s) => ({ ...s, [family.key]: true }))}>
              Одиниці
            </Button>
            <Button size="sm" onClick={() => addFamilyToBasket(family)}>У кошик</Button>
          </div>
        )}
        {open ? (
          <div className="msp-units">
            {family.units.map((unit) => (
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
            {familyAnalogues(family).length ? (
              <div className="msp-analog">
                <strong>Аналоги</strong>
                {familyAnalogues(family).slice(0, 3).map((a) => (
                  <button key={a.key} type="button" onClick={() => setExpanded((s) => ({ ...s, [a.key]: true }))}>
                    {a.type} · {formatPower(a) || formatAmps(a) || '—'} · вільних {a.freeQty}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  const renderPick = () => {
    if (loading) return <div className="msp-empty">Завантаження вітрини…</div>;
    if (!families.length) {
      return (
        <div className="msp-empty">
          Нічого не знайдено. Спробуйте «200 кВт Київ вільний» або скиньте фільтри.
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
    const allCols = [...cols, transitCol];
    return (
      <div className="msp-board is-geo">
        {allCols.map((col) => {
          const colFams = families
            .map((f) => {
              const units = f.units.filter((u) => {
                if (col.id === 'transit') return isTransit(u);
                return String(u.currentWarehouse || '') === String(col.id) || warehouseLabel(u) === col.name;
              });
              if (!units.length) return null;
              return { ...f, units, freeQty: units.filter(isOfferable).reduce((s, u) => s + qtyOf(u), 0), totalQty: units.reduce((s, u) => s + qtyOf(u), 0) };
            })
            .filter(Boolean);
          return (
            <section key={col.id} className="msp-col">
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
                    onClick={() => setExpanded((s) => ({ ...s, [f.key]: true }))}
                    onDoubleClick={() => addFamilyToBasket(f)}
                  >
                    <strong>{f.type}</strong>
                    <em>{formatPowerCompact(f) || formatAmps(f) || '—'} · вільних {f.freeQty} / {f.totalQty}</em>
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
                    onClick={() => setExpanded((s) => ({ ...s, [f.key]: true }))}
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

  return (
    <div className="msp">
      <div className="msp-head">
        <div className="msp-head-row">
          <h2 className="msp-title">
            Підбір зі складу
            {truncated ? <span>показано перші 5000 позицій</span> : null}
          </h2>
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
            <div className="msp-search">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="200 кВт Київ вільний з тестом · АВР 2000А"
              />
            </div>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => loadCatalog()}>Оновити</Button>
        </div>
        {viewMode !== 'registry' ? (
          <>
            {parsed.chips.length ? (
              <div className="msp-chips">
                {parsed.chips.map((c) => (
                  <span key={c.id} className="msp-chip">{c.label}</span>
                ))}
              </div>
            ) : null}
            <div className="msp-toggles">
              <button type="button" className={freeOnly ? 'is-on' : ''} onClick={() => setFreeOnly((v) => !v)}>Вільні</button>
              <button type="button" className={readyOnly ? 'is-on' : ''} onClick={() => setReadyOnly((v) => !v)}>Можна пропонувати</button>
              <button type="button" className={testedOnly ? 'is-on' : ''} onClick={() => setTestedOnly((v) => !v)}>Протестовані</button>
              <button type="button" className={myOnly ? 'is-on' : ''} onClick={() => setMyOnly((v) => !v)}>Мій резерв</button>
            </div>
          </>
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
                {boardKind !== 'ops' ? (
                  <div className="msp-grid" style={{ marginTop: 12 }}>
                    {families.filter((f) => expanded[f.key]).map((f) => renderFamilyCard(f))}
                  </div>
                ) : null}
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
                    <div>{displayText(item.serialNumber)} · {shortWarehouseName(warehouseLabel(item))}</div>
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
                <div className="msp-analog">
                  <strong>Аналоги на складі</strong>
                  {analogues.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => {
                        const next = a.units.find(isOfferable) || a.units[0];
                        if (next) openDetail(next);
                      }}
                    >
                      {a.type} · {formatPower(a) || formatAmps(a) || '—'} · вільних {a.freeQty} з {a.totalQty}
                    </button>
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
          onClose={() => { setShowSale(false); setSaleItems(null); }}
          onSuccess={() => { setShowSale(false); setSaleItems(null); setBasket([]); }}
          user={user}
          initialClient={client}
          initialNotes={client ? `Підбір зі складу для ${client.name}` : 'Підбір зі складу'}
          initialEquipmentItems={saleItems}
        />
      ) : null}
    </div>
  );
});

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
