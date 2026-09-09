const UNSET = new Set(['', 'не визначено', 'не визначений', 'н/д', 'n/a', '-', '—', 'null', 'undefined']);

export function norm(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isBlankLabel(value) {
  const s = String(value ?? '').trim();
  if (!s) return true;
  return UNSET.has(s.toLowerCase());
}

export function displayText(value, fallback = '—') {
  const s = String(value ?? '').trim();
  if (!s || isBlankLabel(s)) return fallback;
  return s;
}

export function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parsePowerKw(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(',', '.').trim();
  if (!s) return null;
  const slash = s.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const lower = s.toLowerCase();
    if (lower.includes('kva') && (lower.includes('kw') || lower.includes('квт'))) return b;
    return Math.max(a, b);
  }
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function parseAmperage(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(',', '.').trim();
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function formatPower(item) {
  const standby = displayText(item?.standbyPower, '');
  const prime = displayText(item?.primePower, '');
  if (standby && prime && standby !== prime) return `${standby} / ${prime}`;
  return standby || prime || '';
}

export function formatAmps(item) {
  const a = displayText(item?.amperage, '');
  if (!a) return '';
  return /а|a|amp/i.test(a) ? a : `${a} А`;
}

export function formatQty(item) {
  const n = Number(item?.quantity);
  const qty = Number.isFinite(n) ? n : 1;
  const unit = displayText(item?.batchUnit, 'шт.');
  return `${qty} ${unit}`;
}

export function qtyOf(item) {
  const n = Number(item?.quantity);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function shortWarehouseName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '—';
  return raw
    .replace(/^склад\s+/i, '')
    .replace(/\s+дарекс.*$/i, '')
    .replace(/\s+дтс.*$/i, '')
    .replace(/\s+енерго.*$/i, '')
    .trim() || raw;
}

/** Назва складу для борду: без префікса «Склад», але з Дарекс/ДТС, щоб два Києва не зливались. */
export function warehouseDisplayName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '—';
  return raw.replace(/^склад\s+/i, '').trim() || raw;
}

export function warehouseLabel(item) {
  return displayText(item?.currentWarehouseName || item?.currentWarehouse, '—');
}

export function productIdOf(item) {
  const p = item?.productId;
  if (p == null || p === '') return '';
  if (typeof p === 'object') return String(p._id || p.id || '');
  return String(p);
}

export function hasProductCard(item) {
  return !!productIdOf(item);
}

export function isReserved(item) {
  if (!item) return false;
  if (item.status === 'reserved') return true;
  if (item.reservedByName || item.reservationClientName) return true;
  return false;
}

export function isMine(item, login) {
  if (!isReserved(item) || !login) return false;
  return String(item.reservedByLogin || '') === String(login);
}

export function isTransit(item) {
  const st = item?.warehouseDisplayStatus || item?.status;
  return st === 'in_transit' || !!item?.transitFromWarehouseName;
}

export function isInStock(item) {
  if (isTransit(item)) return false;
  const st = item?.warehouseDisplayStatus || item?.status || 'in_stock';
  return st === 'in_stock' || st === 'reserved';
}

export function testingKey(item) {
  return String(item?.testingStatus || 'none');
}

export function isTestingActive(item) {
  const s = testingKey(item);
  return s === 'requested' || s === 'in_progress';
}

export function isTested(item) {
  return testingKey(item) === 'completed';
}

export function canRequestTesting(item) {
  return !isTestingActive(item);
}

export function canReserve(item) {
  return !isReserved(item) && isInStock(item);
}

/** Вільна позиція на складі — базове «можна називати клієнту». */
export function isOfferable(item) {
  return canReserve(item) && !isTransit(item);
}

/** Найвища готовність: вільна + на складі + тест пройдено + є картка. */
export function isFullyReady(item) {
  return isOfferable(item) && isTested(item) && hasProductCard(item);
}

export function freesAtLabel(item) {
  if (!isReserved(item) || !item?.reservationEndDate) return '';
  const d = new Date(item.reservationEndDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function testingLabel(status) {
  const map = {
    none: 'Не тестувалось',
    requested: 'Заявка на тест',
    in_progress: 'На тесті',
    completed: 'Протестовано',
    failed: 'Тест не пройдено',
  };
  return map[status] || 'Не тестувалось';
}

export function familyKey(item) {
  const pid = productIdOf(item);
  if (pid) return `p:${pid}`;
  const type = norm(item?.type) || 'без-типу';
  const mfr = norm(item?.manufacturer);
  const kw = parsePowerKw(item?.standbyPower || item?.primePower);
  const amp = parseAmperage(item?.amperage);
  return `t:${type}|${mfr}|${kw ?? ''}|${amp ?? ''}`;
}

export const POWER_BANDS = [
  { id: '<50', label: '< 50 кВт', test: (kw) => kw != null && kw < 50 },
  { id: '50-100', label: '50–100 кВт', test: (kw) => kw >= 50 && kw < 100 },
  { id: '100-200', label: '100–200 кВт', test: (kw) => kw >= 100 && kw < 200 },
  { id: '200-500', label: '200–500 кВт', test: (kw) => kw >= 200 && kw < 500 },
  { id: '500+', label: '500+ кВт', test: (kw) => kw >= 500 },
  { id: 'other', label: 'Без кВт', test: (kw) => kw == null },
];

export const AMP_BANDS = [
  { id: '<100', label: '< 100 А', test: (a) => a != null && a < 100 },
  { id: '100-400', label: '100–400 А', test: (a) => a >= 100 && a < 400 },
  { id: '400-1000', label: '400–1000 А', test: (a) => a >= 400 && a < 1000 },
  { id: '1000+', label: '1000+ А', test: (a) => a >= 1000 },
  { id: 'other', label: 'Без струму', test: (a) => a == null },
];

export function powerBandId(kw) {
  return POWER_BANDS.find((b) => b.test(kw))?.id || 'other';
}

export function ampBandId(amp) {
  return AMP_BANDS.find((b) => b.test(amp))?.id || 'other';
}

export function parseSmartQuery(raw, warehouses = []) {
  let text = String(raw || '').trim();
  const chips = [];
  const result = {
    rest: '',
    chips,
    powerMin: null,
    powerMax: null,
    ampMin: null,
    ampMax: null,
    freeOnly: false,
    testedOnly: false,
    readyOnly: false,
    reservedOnly: false,
    warehouseIds: [],
    warehouseNames: [],
  };

  const take = (re) => {
    const m = text.match(re);
    if (!m) return null;
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
    return m;
  };

  const range = take(/(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(квт|kw|kva|ква)/i);
  if (range) {
    result.powerMin = Number(range[1].replace(',', '.'));
    result.powerMax = Number(range[2].replace(',', '.'));
    chips.push({ id: 'power', label: `${result.powerMin}–${result.powerMax} кВт` });
  } else {
    const p = take(/(\d+(?:[.,]\d+)?)\s*(квт|kw|kva|ква)/i);
    if (p) {
      const n = Number(p[1].replace(',', '.'));
      result.powerMin = n * 0.8;
      result.powerMax = n * 1.2;
      chips.push({ id: 'power', label: `~${n} кВт ±20%` });
    }
  }

  const amp = take(/(\d+(?:[.,]\d+)?)\s*(?:а|a|amp|ампер)/i);
  if (amp) {
    const n = Number(amp[1].replace(',', '.'));
    result.ampMin = n * 0.85;
    result.ampMax = n * 1.15;
    chips.push({ id: 'amp', label: `~${n} А` });
  }

  if (take(/можна\s+пропонуват[а-яА-ЯіїєґІЇЄҐ]*|готов[а-яА-ЯіїєґІЇЄҐ]*/i)) {
    result.readyOnly = true;
    chips.push({ id: 'ready', label: 'Можна пропонувати' });
  }
  if (take(/вільн[а-яА-ЯіїєґІЇЄҐ]*/i)) {
    result.freeOnly = true;
    chips.push({ id: 'free', label: 'Вільні' });
  }
  if (take(/з\s*тест[а-яА-ЯіїєґІЇЄҐ]*|протест[а-яА-ЯіїєґІЇЄҐ]*/i)) {
    result.testedOnly = true;
    chips.push({ id: 'tested', label: 'З тестом' });
  } else if (take(/тест[а-яА-ЯіїєґІЇЄҐ]*/i)) {
    result.testedOnly = true;
    chips.push({ id: 'tested', label: 'З тестом' });
  }
  if (take(/резерв[а-яА-ЯіїєґІЇЄҐ]*/i)) {
    result.reservedOnly = true;
    chips.push({ id: 'reserved', label: 'Резерв' });
  }

  const usedWh = new Set();
  const sortedWh = [...warehouses].sort(
    (a, b) => shortWarehouseName(b.name).length - shortWarehouseName(a.name).length
  );
  for (const wh of sortedWh) {
    const id = String(wh._id || wh.id || '');
    const name = String(wh.name || '');
    const short = shortWarehouseName(name);
    const candidates = [short, name].filter((x) => x && x.length >= 3);
    for (const cand of candidates) {
      const re = new RegExp(escapeRegex(cand), 'i');
      if (re.test(text) && !usedWh.has(id)) {
        text = text.replace(re, ' ');
        usedWh.add(id);
        result.warehouseIds.push(id);
        result.warehouseNames.push(name);
        chips.push({ id: `wh:${id}`, label: short, warehouseId: id, warehouseName: name });
        break;
      }
    }
  }

  result.rest = text.replace(/\s+/g, ' ').trim();
  return result;
}

export function unitMatchesFilters(item, filters, login) {
  if (!item) return false;
  if (filters.freeOnly && !isOfferable(item)) return false;
  if (filters.readyOnly && !isOfferable(item)) return false;
  if (filters.testedOnly && !isTested(item)) return false;
  if (filters.reservedOnly && !isReserved(item)) return false;
  if (filters.myOnly && !isMine(item, login)) return false;
  if (filters.powerMin != null || filters.powerMax != null) {
    const kw = parsePowerKw(item.standbyPower || item.primePower);
    if (kw == null) return false;
    if (filters.powerMin != null && kw < filters.powerMin) return false;
    if (filters.powerMax != null && kw > filters.powerMax) return false;
  }
  if (filters.ampMin != null || filters.ampMax != null) {
    const amp = parseAmperage(item.amperage);
    if (amp == null) return false;
    if (filters.ampMin != null && amp < filters.ampMin) return false;
    if (filters.ampMax != null && amp > filters.ampMax) return false;
  }
  const whIds = filters.warehouseIds || [];
  const whNames = filters.warehouseNames || [];
  if (whIds.length || whNames.length) {
    const id = String(item.currentWarehouse || '');
    const name = String(item.currentWarehouseName || item.currentWarehouse || '');
    const byId = whIds.length && whIds.some((w) => String(w) === id);
    const byName = whNames.length && whNames.some((n) => norm(name).includes(norm(n)) || norm(n).includes(norm(name)));
    if (!byId && !byName) return false;
  }
  return true;
}

export function buildFamilies(items, login) {
  const map = new Map();
  for (const item of items) {
    const key = familyKey(item);
    let fam = map.get(key);
    if (!fam) {
      fam = {
        key,
        productId: productIdOf(item),
        type: displayText(item.type, 'Без назви'),
        manufacturer: displayText(item.manufacturer, ''),
        itemKind: item.itemKind || 'equipment',
        standbyPower: item.standbyPower || '',
        primePower: item.primePower || '',
        amperage: item.amperage || '',
        phase: item.phase || '',
        voltage: item.voltage || '',
        photoUrl: item.photoUrl || '',
        powerKw: parsePowerKw(item.standbyPower || item.primePower),
        amp: parseAmperage(item.amperage),
        units: [],
        totalQty: 0,
        freeQty: 0,
        reservedQty: 0,
        myReservedQty: 0,
        testingQty: 0,
        readyQty: 0,
        warehouses: [],
      };
      map.set(key, fam);
    }
    fam.units.push(item);
    if (!fam.photoUrl && item.photoUrl) fam.photoUrl = item.photoUrl;
    if (!fam.manufacturer && !isBlankLabel(item.manufacturer)) fam.manufacturer = item.manufacturer;
    if (fam.powerKw == null) fam.powerKw = parsePowerKw(item.standbyPower || item.primePower);
    if (fam.amp == null) fam.amp = parseAmperage(item.amperage);
    const q = qtyOf(item);
    fam.totalQty += q;
    if (isReserved(item)) {
      fam.reservedQty += q;
      if (isMine(item, login)) fam.myReservedQty += q;
    } else if (isOfferable(item)) {
      fam.freeQty += q;
    }
    if (isTestingActive(item)) fam.testingQty += q;
    if (isFullyReady(item) || isOfferable(item)) {
      if (isOfferable(item)) fam.readyQty += q;
    }
  }

  for (const fam of map.values()) {
    const byWh = new Map();
    for (const u of fam.units) {
      const name = warehouseLabel(u);
      const id = String(u.currentWarehouse || name);
      const cur = byWh.get(id) || { id, name, short: shortWarehouseName(name), qty: 0, freeQty: 0 };
      const q = qtyOf(u);
      cur.qty += q;
      if (isOfferable(u)) cur.freeQty += q;
      byWh.set(id, cur);
    }
    fam.warehouses = [...byWh.values()].sort((a, b) => b.qty - a.qty);
    fam.units.sort((a, b) => {
      const ra = isOfferable(a) ? 0 : isMine(a, login) ? 1 : 2;
      const rb = isOfferable(b) ? 0 : isMine(b, login) ? 1 : 2;
      if (ra !== rb) return ra - rb;
      return warehouseLabel(a).localeCompare(warehouseLabel(b), 'uk');
    });
  }

  return [...map.values()].sort((a, b) => {
    if (b.freeQty !== a.freeQty) return b.freeQty - a.freeQty;
    if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
    return a.type.localeCompare(b.type, 'uk');
  });
}

export function catalogStats(items, login) {
  let total = 0;
  let free = 0;
  let reserved = 0;
  let mine = 0;
  let testing = 0;
  let ready = 0;
  for (const item of items) {
    const q = qtyOf(item);
    total += q;
    if (isOfferable(item)) free += q;
    if (isReserved(item)) reserved += q;
    if (isMine(item, login)) mine += q;
    if (isTestingActive(item)) testing += q;
    if (isFullyReady(item)) ready += q;
  }
  return { total, free, reserved, mine, testing, ready, rows: items.length };
}

export function findAnalogues(family, families, { tolerance = 0.25, limit = 6 } = {}) {
  if (!family) return [];
  const kw = family.powerKw;
  const amp = family.amp;
  const scored = [];
  for (const other of families) {
    if (other.key === family.key) continue;
    let score = Infinity;
    if (kw != null && other.powerKw != null) {
      const rel = Math.abs(other.powerKw - kw) / Math.max(kw, 1);
      if (rel <= tolerance) score = rel;
    } else if (amp != null && other.amp != null) {
      const rel = Math.abs(other.amp - amp) / Math.max(amp, 1);
      if (rel <= tolerance) score = rel;
    } else if (norm(other.type) && norm(family.type) && norm(other.type) !== norm(family.type)) {
      const a = norm(other.type);
      const b = norm(family.type);
      if (a.includes(b.slice(0, 8)) || b.includes(a.slice(0, 8))) score = 0.9;
    }
    if (score < Infinity) scored.push({ family: other, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || b.family.freeQty - a.family.freeQty)
    .slice(0, limit)
    .map((x) => x.family);
}

export function detectBoardScale(families) {
  let kw = 0;
  let amp = 0;
  for (const f of families) {
    if (f.powerKw != null) kw += 1;
    if (f.amp != null) amp += 1;
  }
  return kw >= amp ? 'kw' : 'amp';
}

export function printOfferHtml(client, items) {
  const name = client?.name || 'Клієнт не вказаний';
  const edrpou = client?.edrpou ? `ЄДРПОУ ${client.edrpou}` : '';
  const rows = items
    .map((item, i) => {
      const power = [formatPower(item), formatAmps(item)].filter(Boolean).join(' · ');
      return `<tr>
        <td>${i + 1}</td>
        <td>${displayText(item.type)}</td>
        <td>${displayText(item.manufacturer)}</td>
        <td>${power || '—'}</td>
        <td>${displayText(item.serialNumber)}</td>
        <td>${warehouseLabel(item)}</td>
        <td>${formatQty(item)}</td>
        <td>${testingLabel(testingKey(item))}</td>
      </tr>`;
    })
    .join('');
  return `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><title>Пропозиція</title>
<style>
  body { font-family: Segoe UI, Arial, sans-serif; color: #111; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: #444; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f3f4f6; }
</style></head>
<body>
  <h1>Пропозиція зі складу</h1>
  <p>${name}${edrpou ? ` · ${edrpou}` : ''} · ${new Date().toLocaleDateString('uk-UA')}</p>
  <table>
    <thead><tr>
      <th>№</th><th>Тип</th><th>Виробник</th><th>Потужність / струм</th>
      <th>Серійний №</th><th>Склад</th><th>К-сть</th><th>Тест</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;
}
