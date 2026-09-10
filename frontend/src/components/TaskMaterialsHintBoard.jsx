import React, { useEffect, useMemo, useState } from 'react';
import API_BASE_URL from '../config';
import { useNomenclatureStock } from '../hooks/useNomenclatureStock';

const REGION_STOCK_NEEDLES = {
  Київський: ['київ', 'киев', 'kyiv'],
  Дніпровський: ['дніпр', 'днепр', 'dnipro'],
  Львівський: ['львів', 'львов', 'lviv'],
  Хмельницький: ['хмельниц'],
  Одеський: ['одес'],
  Кропивницький: ['кропивниц', 'кіровоград'],
};

export function formatHintQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return String(Math.round(n * 100) / 100);
}

export function slotHintUnit(slot) {
  return slot?.liquid ? 'л' : 'шт';
}

export function formatHintQtyWithUnit(value, unit) {
  const qty = formatHintQty(value);
  if (!qty) return '';
  return unit ? `${qty} ${unit}` : qty;
}

export function formatHintQtyRange(min, max, unit) {
  const suffix = unit ? ` ${unit}` : '';
  if (min == null && max == null) return 'кількість не вказана';
  if (min != null && max != null && min !== max) {
    return `від ${formatHintQty(min)} до ${formatHintQty(max)}${suffix}`;
  }
  return `${formatHintQty(max ?? min)}${suffix}`;
}

function stockWarehouseInRegion(row, warehouses, region) {
  if (!region) return true;
  const regionName = String(region).trim();
  const rowName = String(row?.warehouseName || '').trim();
  const meta = (warehouses || []).find((w) => String(w.name || '').trim() === rowName);
  if (meta?.region && String(meta.region).trim() === regionName) return true;
  const haystack = `${rowName} ${meta?.name || ''} ${meta?.region || ''}`.toLowerCase();
  const needles = REGION_STOCK_NEEDLES[regionName] || [
    regionName.toLowerCase().replace(/ський$/i, '').replace(/цький$/i, ''),
  ];
  return needles.some((needle) => needle && haystack.includes(needle));
}

function stockKey(name) {
  return String(name || '').trim().toLowerCase();
}

export default function TaskMaterialsHintBoard({
  equipment,
  currentTaskId,
  requestNumber,
  requestAuthor,
  region,
  warehouses = [],
  authHeaders = {},
  disabled = false,
  onApplySlot,
  onApplyAll,
}) {
  const equipmentValue = String(equipment || '').trim();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [appliedKey, setAppliedKey] = useState('');
  const [activeCategory, setActiveCategory] = useState('');

  useEffect(() => {
    if (equipmentValue.length < 2) {
      setData(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const q = new URLSearchParams({ equipment: equipmentValue });
        if (currentTaskId) q.set('excludeTaskId', String(currentTaskId));
        const res = await fetch(`${API_BASE_URL}/tasks/equipment-material-hints?${q}`, {
          headers: authHeaders,
        });
        if (!res.ok) throw new Error('hint fetch failed');
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          const firstLabel = json?.slots?.[0]?.label || '';
          setActiveCategory(firstLabel);
        }
      } catch (e) {
        console.error('[materials-hint]', e);
        if (!cancelled) {
          setData(null);
          setError('Не вдалося завантажити аналіз матеріалів.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [equipmentValue, currentTaskId, authHeaders]);

  const hintNames = useMemo(() => {
    const items = [];
    const seen = new Set();
    for (const slot of data?.slots || []) {
      for (const analogue of slot.analogues || []) {
        const name = String(analogue.name || '').trim();
        const key = stockKey(name);
        if (name.length < 2 || seen.has(key)) continue;
        seen.add(key);
        items.push({ name, productId: '' });
      }
    }
    return items;
  }, [data]);

  const { items: stockItems, loading: stockLoading } = useNomenclatureStock(hintNames, {
    authHeaders,
    warehouses,
    enabled: hintNames.length > 0,
    debounceMs: 200,
  });

  const stockByName = useMemo(() => {
    const map = new Map();
    for (const item of stockItems || []) {
      const regional = (item.warehouses || []).filter((row) =>
        stockWarehouseInRegion(row, warehouses, region),
      );
      const qty = regional.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
      map.set(stockKey(item.label), {
        qty,
        warehouses: regional.filter((row) => Number(row.quantity) > 0),
      });
    }
    return map;
  }, [stockItems, warehouses, region]);

  const markApplied = (key) => {
    setAppliedKey(key);
    window.setTimeout(() => {
      setAppliedKey((prev) => (prev === key ? '' : prev));
    }, 1400);
  };

  const applySlot = (slot, analogue) => {
    if (disabled || !onApplySlot) return;
    onApplySlot(slot, analogue);
    markApplied(`${slot.id}:${analogue?.name || slot.primaryName}`);
  };

  const categories = useMemo(() => {
    const labels = [];
    const seen = new Set();
    for (const slot of data?.slots || []) {
      const label = String(slot.label || '').trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
    return labels;
  }, [data]);

  const visibleSlots = useMemo(
    () => (data?.slots || []).filter((slot) => slot.label === activeCategory),
    [data, activeCategory],
  );

  const applyAll = () => {
    const slots = visibleSlots.length ? visibleSlots : data?.slots;
    if (disabled || !onApplyAll || !slots?.length) return;
    onApplyAll(slots);
    markApplied('all');
  };

  const renderStock = (name, unit) => {
    const stock = stockByName.get(stockKey(name));
    if (stockLoading && !stock) {
      return <div className="task-materials-hint-stock is-muted">залишки…</div>;
    }
    if (!stock || stock.qty <= 0) {
      return <div className="task-materials-hint-stock is-empty">немає в регіоні</div>;
    }
    return (
      <div className="task-materials-hint-stock is-ok">
        <span>В вашому регіоні {formatHintQtyWithUnit(stock.qty, unit)}</span>
        {stock.warehouses.map((row) => (
          <span key={`${row.warehouseId || ''}-${row.warehouseName}`}>
            {row.warehouseName}: {formatHintQtyWithUnit(row.quantity, unit)}
          </span>
        ))}
      </div>
    );
  };

  const renderHintRow = (slot, analogue) => {
    const unit = slotHintUnit(slot);
    const applied = appliedKey === `${slot.id}:${analogue.name}`;
    return (
      <div key={`${slot.id}:${analogue.name}`} className="task-materials-hint-row">
        <div>
          <b>
            {analogue.name}{' '}
            {formatHintQtyRange(analogue.qtyMin, analogue.qtyMax, unit)}
            {' · '}
            {analogue.uses} заяв.
          </b>
          {renderStock(analogue.name, unit)}
        </div>
        {!disabled ? (
          <button
            type="button"
            className="task-materials-hint-apply"
            onClick={() => applySlot(slot, analogue)}
          >
            {applied ? 'Підставлено' : 'Підставити'}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <aside className="task-materials-hint-board" onClick={(e) => e.stopPropagation()}>
      <strong className="task-materials-hint-title">Підказка по матеріалах</strong>
      <div className="task-materials-hint-meta">
        <span>
          <small>Номер заявки/наряду</small>
          <b>{requestNumber || '—'}</b>
        </span>
        <span>
          <small>Автор заявки</small>
          <b>{requestAuthor || '—'}</b>
        </span>
        <span className="task-materials-hint-meta-model">
          <small>Модель обладнання по якій здійснюється пошук</small>
          <b>{equipmentValue || '—'}</b>
        </span>
      </div>
      <p className="task-materials-hint-lead">
        Аналіз за полем «Тип обладнання». Підстановка записує назву і кількість у заявку —
        для рідин із діапазоном береться максимум.
      </p>

      {equipmentValue.length < 2 ? (
        <ol className="task-materials-hint-guide">
          <li>
            Вкажіть <b>тип обладнання</b>. Система знайде заявки з таким самим типом
            і збере матеріали, які там ставили.
          </li>
          <li>
            Для кожної позиції побачите <b>назву</b> і <b>кількість</b>. Якщо кількість різна —
            покажемо діапазон «від — до».
          </li>
          <li>
            Різні назви на одну роль (наприклад масляний фільтр) відобразяться як <b>аналоги</b>.
          </li>
          <li>
            Поруч — <b>залишки на складах вашого регіону</b>.
          </li>
          <li>
            Кнопка <b>Підставити</b> запише назву й кількість у поля заявки. Після цього все
            можна змінити вручну.
          </li>
        </ol>
      ) : loading ? (
        <p className="task-materials-hint-status">Аналізуємо заявки з типом «{equipmentValue}»…</p>
      ) : error ? (
        <p className="task-materials-hint-status is-error">{error}</p>
      ) : !data?.slots?.length ? (
        <p className="task-materials-hint-status">
          Немає історії матеріалів для типу «{equipmentValue}». Перевірте написання або
          дочекайтесь виконаних заявок з цим типом.
        </p>
      ) : (
        <>
          <div className="task-materials-hint-toolbar">
            <p className="task-materials-hint-status">
              {data.matchedTasks} заявок · {data.slots.length} позицій
            </p>
            {!disabled && visibleSlots.length ? (
              <button
                type="button"
                className="task-materials-hint-apply is-all"
                onClick={applyAll}
              >
                {appliedKey === 'all' ? 'Підставлено' : 'Підставити категорію'}
              </button>
            ) : null}
          </div>
          <div className="task-materials-hint-cats" role="tablist" aria-label="Категорії матеріалів">
            {categories.map((label) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={activeCategory === label}
                className={`task-materials-hint-cat${activeCategory === label ? ' is-active' : ''}`}
                onClick={() => setActiveCategory(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="task-materials-hint-slots">
            {visibleSlots.map((slot) => {
              const [primary, ...rest] = slot.analogues || [];
              return (
                <section key={slot.id} className="task-materials-hint-slot">
                  {primary ? renderHintRow(slot, primary) : null}
                  {rest.length ? (
                    <div className="task-materials-hint-analogues">
                      <em>Аналоги</em>
                      {rest.map((analogue) => renderHintRow(slot, analogue))}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
