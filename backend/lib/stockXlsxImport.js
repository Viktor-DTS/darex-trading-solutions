/**
 * Парсинг звіту 1С «Анализ доступности товаров на складах» та імпорт у Equipment.
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DEFAULT_RULES = {
  warehouse1cToName: {
    'СКЛАД Белая Церковь СОЛЮШН': 'Склад Біла Церква ДТС',
  },
  categoryRules: [
    { pattern: 'дизель-генератор|\\bDE-\\d', categoryName: 'Генератори', itemKind: 'equipment' },
    { pattern: '^АВР\\s|\\bАВР\\b', categoryName: 'АВР', itemKind: 'equipment' },
    { pattern: 'автовимикач|щитов|модульний\\s+NB', categoryName: 'Щитове обладнання', itemKind: 'equipment' },
    { pattern: 'антифриз|антифріз|охолоджуюч|G12|G-12', categoryName: 'Антифріз', itemKind: 'parts' },
    { pattern: 'масло|олива|10W|CASTROL|CASTLE|GASOLINE', categoryName: 'Олива', itemKind: 'parts' },
    { pattern: 'датчик', categoryName: 'Датчики', itemKind: 'parts' },
    { pattern: 'клапан|хомут', categoryName: 'Інші елетрокомплектуючі до генераторів', itemKind: 'parts' },
    { pattern: 'АКБ|акб|6CT', categoryName: 'Інші елетрокомплектуючі до генераторів', itemKind: 'parts' },
    { pattern: 'фільтр|фильтр', categoryName: 'Інші фільтра', itemKind: 'parts' },
  ],
  unitRules: [
    { pattern: 'масло|олива|антифриз|антифріз|рідина|охолоджуюч|G12|G-12|л\\b', batchUnit: 'л.' },
    { pattern: 'м\\.п|мп\\b|метр', batchUnit: 'м.п.' },
    { pattern: 'кг\\b', batchUnit: 'кг' },
    { pattern: 'комплект', batchUnit: 'комплект' },
    { pattern: 'упак', batchUnit: 'упаковка' },
  ],
  defaultBatchUnit: 'шт.',
  /** Зіставлення: назва з правила (categoryName) → точна назва категорії в MongoDB (як у UI) */
  categoryAliases: {},
  /** Точна назва номенклатури з Excel → Mongo categoryId (або точна name категорії) */
  nomenclatureCategoryMap: {},
};

function loadRules() {
  const configPath = path.join(__dirname, '..', 'config', 'stock-import-rules.json');
  try {
    if (fs.existsSync(configPath)) {
      const file = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return {
        ...DEFAULT_RULES,
        ...file,
        warehouse1cToName: { ...DEFAULT_RULES.warehouse1cToName, ...(file.warehouse1cToName || {}) },
        categoryRules: file.categoryRules || DEFAULT_RULES.categoryRules,
        unitRules: file.unitRules || DEFAULT_RULES.unitRules,
        categoryAliases: { ...DEFAULT_RULES.categoryAliases, ...(file.categoryAliases || {}) },
        nomenclatureCategoryMap: {
          ...DEFAULT_RULES.nomenclatureCategoryMap,
          ...(file.nomenclatureCategoryMap || {}),
        },
      };
    }
  } catch (e) {
    console.warn('[stockXlsxImport] config/stock-import-rules.json:', e.message);
  }
  return { ...DEFAULT_RULES };
}

function cellStr(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function isEmptyRow(row) {
  if (!row || !row.length) return true;
  return row.every((c) => cellStr(c) === '');
}

function pickQty(row, freeIdx) {
  if (!row || !row.length) return 0;
  const prefer = row[freeIdx];
  const fallback = row[1];
  const v = prefer !== undefined && prefer !== '' && prefer !== null ? prefer : fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Рядок рівня «серія / заводський номер»: у колонці A є будь-який непорожній текст
 * (цифри та/або літери, довільна довжина). Порожній A у наступному рядку = партія в 1С.
 * Підряд читаємо лише поки не вичерпано кількість «Свободный остаток» з рядка номенклатури,
 * щоб не з’їсти наступну номенклатуру.
 */
function isSerialContinuationRow(rawA) {
  const t = cellStr(rawA);
  if (!t) return false;
  if (/^итог$/i.test(t)) return false;
  if (/^склад$/i.test(t)) return false;
  if (/склад/i.test(t) && t.length > 12) return false;
  if (t === 'Номенклатура' || t.startsWith('Серия номенклатуры') || t === 'Серія номенклатури') {
    return false;
  }
  return true;
}

function serialFromCell(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.round(v));
  return String(v).trim();
}

function findHeaderRow(rows) {
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    if (!r || !r.length) continue;
    const c0 = cellStr(r[0]);
    const c1 = cellStr(r[1]);
    if (c0 === 'Склад' && /статок|залишок/i.test(c1)) {
      let freeIdx = 6;
      for (let c = 0; c < r.length; c++) {
        if (/свободн|свобідн|вільн/i.test(cellStr(r[c]))) freeIdx = c;
      }
      return { rowIndex: ri, freeIdx };
    }
  }
  return null;
}

function skipSubheaders(rows, startIdx) {
  let i = startIdx;
  while (i < rows.length) {
    const c0 = cellStr(rows[i][0]);
    if (c0 === 'Номенклатура' || c0.startsWith('Серия номенклатуры') || c0 === 'Серія номенклатури') {
      i++;
      continue;
    }
    if (isEmptyRow(rows[i])) {
      i++;
      continue;
    }
    break;
  }
  return i;
}

/**
 * Розбір рядків аркуша (масив масивів).
 */
function parseAvailabilityRows(rows) {
  const hdr = findHeaderRow(rows);
  if (!hdr) {
    throw new Error('Не знайдено заголовок таблиці (рядок «Склад» / «Остаток»). Очікується звіт доступності 1С.');
  }
  let i = skipSubheaders(rows, hdr.rowIndex + 1);
  const items = [];
  let warehouse1c = null;

  while (i < rows.length) {
    const row = rows[i] || [];
    const a = cellStr(row[0]);
    const free = pickQty(row, hdr.freeIdx);

    if (/^итог$/i.test(a)) break;

    if (/склад/i.test(a) && a.length > 8) {
      warehouse1c = a.trim();
      i++;
      continue;
    }

    if (!a) {
      i++;
      continue;
    }

    const next = rows[i + 1];
    const na = next ? cellStr(next[0]) : '';

    if (isSerialContinuationRow(next ? next[0] : '')) {
      const serials = [];
      let j = i + 1;
      let remain = free > 0 ? free : 1;
      while (j < rows.length && remain > 0) {
        const rr = rows[j] || [];
        if (!isSerialContinuationRow(rr[0])) break;
        const rowQty = pickQty(rr, hdr.freeIdx) || 1;
        serials.push({ serial: serialFromCell(rr[0]), qty: rowQty });
        remain -= rowQty;
        j++;
      }
      items.push({ kind: 'serialized', nome: a.trim(), free, serials });
      i = j;
      continue;
    }

    if (!na && next && !isEmptyRow(next)) {
      items.push({ kind: 'batch', nome: a.trim(), qty: free });
      i += 2;
      continue;
    }

    items.push({ kind: 'batch', nome: a.trim(), qty: free });
    i += 1;
  }

  return { warehouse1c, items, freeColumnIndex: hdr.freeIdx };
}

function parseXlsxBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('У файлі немає аркушів');
  const sh = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  return { sheetName, rows };
}

function resolveBatchUnit(nome, rules) {
  const name = nome || '';
  for (const r of rules.unitRules || []) {
    try {
      if (new RegExp(r.pattern, 'i').test(name)) return r.batchUnit;
    } catch (_) {
      /* ignore bad regex */
    }
  }
  const m = name.match(/,\s*(шт\.?|л\.?|кг\.?|м\.?п\.?|комплект|упаковка)\s*$/i);
  if (m) {
    const u = m[1].toLowerCase();
    if (u.startsWith('л')) return 'л.';
    if (u.startsWith('кг')) return 'кг';
    if (u.startsWith('м')) return 'м.п.';
    if (u.startsWith('комплект')) return 'комплект';
    if (u.startsWith('упак')) return 'упаковка';
    return 'шт.';
  }
  return rules.defaultBatchUnit || 'шт.';
}

function buildCategoryIndex(categories) {
  const byName = new Map();
  const byNameLower = new Map();
  for (const c of categories) {
    const key = (c.name || '').trim();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, c);
    const lk = key.toLowerCase();
    if (!byNameLower.has(lk)) byNameLower.set(lk, c);
  }
  return { byName, byNameLower, all: categories };
}

function isObjectIdString(s) {
  return typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s.trim());
}

/**
 * Правило може містити categoryId (Mongo) або categoryName (+ опційно categoryAliases у rules).
 */
function findCategoryForRule(rule, index, aliases) {
  const { byName, byNameLower, all } = index;
  const aliasesMap = aliases || {};

  if (rule.categoryId && isObjectIdString(rule.categoryId)) {
    const id = rule.categoryId.trim();
    const found = all.find((c) => String(c._id) === id);
    if (found) return found;
  }

  const key = rule.categoryName;
  if (!key || !String(key).trim()) return null;
  const nm = String(key).trim();

  let cat = byName.get(nm) || byNameLower.get(nm.toLowerCase());
  if (cat) return cat;

  const alias = aliasesMap[nm] ?? aliasesMap[key];
  if (alias != null && String(alias).trim()) {
    const t = String(alias).trim();
    return byName.get(t) || byNameLower.get(t.toLowerCase());
  }

  return null;
}

function resolveCategory(nome, rules, index) {
  const name = (nome || '').trim();
  const nomMap = rules.nomenclatureCategoryMap || {};
  if (name && Object.prototype.hasOwnProperty.call(nomMap, name)) {
    const rawVal = nomMap[name];
    if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '') {
      const raw = String(rawVal).trim();
      const { all, byName, byNameLower } = index;
      if (isObjectIdString(raw)) {
        const cat = all.find((c) => String(c._id) === raw);
        if (cat) return { categoryId: cat._id, itemKind: cat.itemKind, unmatchedRule: null };
        return { categoryId: null, itemKind: 'parts', unmatchedRule: `id:${raw}` };
      }
      const cat = byName.get(raw) || byNameLower.get(raw.toLowerCase());
      if (cat) return { categoryId: cat._id, itemKind: cat.itemKind, unmatchedRule: null };
      return { categoryId: null, itemKind: 'parts', unmatchedRule: `map:${raw}` };
    }
  }

  const aliases = rules.categoryAliases || {};
  for (const rule of rules.categoryRules || []) {
    try {
      if (new RegExp(rule.pattern, 'i').test(name)) {
        const cat = findCategoryForRule(rule, index, aliases);
        if (cat) {
          return { categoryId: cat._id, itemKind: cat.itemKind };
        }
        const label = rule.categoryName || rule.categoryId || '—';
        return { categoryId: null, itemKind: rule.itemKind || 'parts', unmatchedRule: label };
      }
    } catch (_) {
      /* ignore */
    }
  }
  return { categoryId: null, itemKind: 'parts', unmatchedRule: null };
}

function batchSearchQuery(type, warehouseId, region) {
  return {
    type,
    currentWarehouse: warehouseId,
    region: region || '',
    status: { $ne: 'deleted' },
    isDeleted: { $ne: true },
    $and: [
      {
        $or: [{ serialNumber: null }, { serialNumber: { $exists: false } }, { serialNumber: '' }],
      },
      {
        $or: [{ manufacturer: null }, { manufacturer: { $exists: false } }, { manufacturer: '' }],
      },
    ],
  };
}

/**
 * @param {object} params
 * @param {import('mongoose').Model} params.Equipment
 * @param {import('mongoose').Model} params.Category
 * @param {import('mongoose').Model} params.Warehouse
 * @param {import('mongoose').Model} params.EventLog
 * @param {Buffer} params.buffer
 * @param {object} params.adminUser — { _id, login, name, role }
 * @param {boolean} params.dryRun
 * @param {string} [params.targetWarehouseId] — якщо задано, імпорт на цей склад (UI); інакше склад з файлу + warehouse1cToName
 */
async function runStockImport({
  Equipment,
  Category,
  Warehouse,
  EventLog,
  buffer,
  adminUser,
  dryRun,
  targetWarehouseId,
}) {
  const rules = loadRules();
  const { sheetName, rows } = parseXlsxBuffer(buffer);
  const { warehouse1c, items } = parseAvailabilityRows(rows);

  if (!warehouse1c) {
    throw new Error('У файлі не виявлено рядок складу (колонка «Склад»).');
  }

  let warehouseDoc;
  let ourWarehouseName;
  let warehouseSource;

  const targetId = targetWarehouseId && String(targetWarehouseId).trim();
  if (targetId) {
    warehouseDoc = await Warehouse.findById(targetId);
    if (!warehouseDoc) {
      throw new Error(`Склад не знайдено (id: ${targetId}). Оновіть сторінку та оберіть склад зі списку.`);
    }
    ourWarehouseName = warehouseDoc.name;
    warehouseSource = 'ui';
  } else {
    const mapped =
      rules.warehouse1cToName[warehouse1c] || rules.warehouse1cToName[warehouse1c.trim()];
    if (!mapped) {
      throw new Error(
        `Немає відповідності складу в config: «${warehouse1c}». Додайте ключ у warehouse1cToName у config/stock-import-rules.json або передайте targetWarehouseId з UI.`
      );
    }
    ourWarehouseName = mapped;
    warehouseDoc = await Warehouse.findOne({ name: ourWarehouseName });
    if (!warehouseDoc) {
      throw new Error(`Склад «${ourWarehouseName}» не знайдено в базі (колекція Warehouse).`);
    }
    warehouseSource = 'config';
  }

  const categories = await Category.find({}).lean();
  const categoryIndex = buildCategoryIndex(categories);

  const summary = {
    sheetName,
    warehouse1c,
    fileWarehouse1c: warehouse1c,
    warehouseName: ourWarehouseName,
    warehouseId: String(warehouseDoc._id),
    warehouseSource,
    dryRun: !!dryRun,
    created: 0,
    updated: 0,
    skipped: 0,
    warnings: [],
    errors: [],
    details: [],
    needsCategoryMapping: [],
    existingNomenclatureCategoryMap: { ...(rules.nomenclatureCategoryMap || {}) },
  };

  const region = warehouseDoc.region || '';
  const unmatchedNomes = new Map();

  for (const item of items) {
    if (item.kind === 'serialized') {
      if (!item.serials || !item.serials.length) {
        summary.warnings.push(`Немає рядків серій для: ${item.nome}`);
        summary.skipped++;
        continue;
      }
    }
    if (item.kind === 'batch') {
      if (item.qty === undefined || item.qty === null || item.qty <= 0) {
        summary.skipped++;
        continue;
      }
    }

    const nome = item.nome;
    const batchUnit = resolveBatchUnit(nome, rules);
    const { categoryId, itemKind, unmatchedRule } = resolveCategory(nome, rules, categoryIndex);

    if (unmatchedRule && !categoryId) {
      summary.warnings.push(`Категорія «${unmatchedRule}» не знайдена в БД для: ${nome}`);
    }
    if (!categoryId) {
      summary.warnings.push(`Без categoryId (додайте категорію або правило): ${nome}`);
      if (!unmatchedNomes.has(nome)) {
        unmatchedNomes.set(nome, { kind: item.kind, ruleHint: unmatchedRule || null });
      }
    }

    try {
      if (item.kind === 'batch') {
        const qty = Math.max(1, Math.round(item.qty * 1000) / 1000);
        const existing = await Equipment.findOne(batchSearchQuery(nome, String(warehouseDoc._id), region));

        if (dryRun) {
          summary.details.push({
            action: existing ? 'update' : 'create',
            kind: 'batch',
            type: nome,
            quantity: qty,
            batchUnit,
            categoryId: categoryId ? String(categoryId) : null,
            itemKind,
          });
          if (existing) summary.updated++;
          else summary.created++;
          continue;
        }

        if (existing) {
          existing.quantity = qty;
          existing.batchUnit = batchUnit;
          existing.categoryId = categoryId || existing.categoryId;
          existing.itemKind = itemKind || existing.itemKind;
          existing.currentWarehouse = String(warehouseDoc._id);
          existing.currentWarehouseName = warehouseDoc.name;
          existing.region = region;
          existing.status = 'in_stock';
          existing.lastModified = new Date();
          if (!existing.batchName) existing.batchName = nome;
          await existing.save();
          summary.updated++;
          summary.details.push({ action: 'update', kind: 'batch', type: nome, id: String(existing._id), quantity: qty });
        } else {
          const doc = await Equipment.create({
            type: nome,
            isBatch: false,
            quantity: qty,
            batchUnit,
            batchName: nome,
            categoryId: categoryId || null,
            itemKind: itemKind || 'parts',
            addedBy: String(adminUser._id),
            addedByName: adminUser.name || adminUser.login,
            currentWarehouse: String(warehouseDoc._id),
            currentWarehouseName: warehouseDoc.name,
            region,
            status: 'in_stock',
            notes: `Імпорт залишків 1С (${sheetName})`,
          });
          summary.created++;
          summary.details.push({ action: 'create', kind: 'batch', type: nome, id: String(doc._id), quantity: qty });
        }
      } else {
        for (const s of item.serials) {
          const serialNumber = s.serial;
          const q = Math.max(1, Math.round((s.qty || 1) * 1000) / 1000);
          if (q !== 1) {
            summary.warnings.push(`Серія ${serialNumber} («${nome}») має кількість ${q} у файлі — у системі одна одиниця на серійник, оброблено як 1`);
          }
          const existing = await Equipment.findOne({
            type: nome,
            serialNumber,
            isDeleted: { $ne: true },
          });

          if (dryRun) {
            summary.details.push({
              action: existing ? 'update' : 'create',
              kind: 'serialized',
              type: nome,
              serialNumber,
              batchUnit,
              categoryId: categoryId ? String(categoryId) : null,
              itemKind,
            });
            if (existing) summary.updated++;
            else summary.created++;
            continue;
          }

          if (existing) {
            existing.batchUnit = batchUnit;
            existing.categoryId = categoryId || existing.categoryId;
            existing.itemKind = itemKind || existing.itemKind;
            existing.currentWarehouse = String(warehouseDoc._id);
            existing.currentWarehouseName = warehouseDoc.name;
            existing.region = region;
            existing.status = 'in_stock';
            existing.quantity = 1;
            existing.lastModified = new Date();
            await existing.save();
            summary.updated++;
            summary.details.push({
              action: 'update',
              kind: 'serialized',
              type: nome,
              serialNumber,
              id: String(existing._id),
            });
          } else {
            const doc = await Equipment.create({
              type: nome,
              serialNumber,
              isBatch: false,
              quantity: 1,
              batchUnit,
              categoryId: categoryId || null,
              itemKind: itemKind || 'equipment',
              addedBy: String(adminUser._id),
              addedByName: adminUser.name || adminUser.login,
              currentWarehouse: String(warehouseDoc._id),
              currentWarehouseName: warehouseDoc.name,
              region,
              status: 'in_stock',
              notes: `Імпорт залишків 1С (${sheetName})`,
            });
            summary.created++;
            summary.details.push({
              action: 'create',
              kind: 'serialized',
              type: nome,
              serialNumber,
              id: String(doc._id),
            });
          }
        }
      }
    } catch (err) {
      summary.errors.push(`${nome}: ${err.message}`);
    }
  }

  summary.needsCategoryMapping = Array.from(unmatchedNomes.entries())
    .map(([n, meta]) => ({ nome: n, kind: meta.kind, ruleHint: meta.ruleHint }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'uk'));

  if (!dryRun && (summary.created > 0 || summary.updated > 0) && EventLog) {
    try {
      await EventLog.create({
        userId: String(adminUser._id),
        userName: adminUser.name || adminUser.login,
        userRole: adminUser.role,
        action: 'import',
        entityType: 'equipment',
        entityId: 'bulk',
        description: `Імпорт залишків з Excel (1С): створено ${summary.created}, оновлено ${summary.updated}`,
        details: { sheetName, warehouse: ourWarehouseName, warnings: summary.warnings.slice(0, 50) },
      });
    } catch (e) {
      console.warn('[stockXlsxImport] EventLog:', e.message);
    }
  }

  return summary;
}

module.exports = {
  loadRules,
  parseAvailabilityRows,
  parseXlsxBuffer,
  resolveBatchUnit,
  resolveCategory,
  runStockImport,
};
