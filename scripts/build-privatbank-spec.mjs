/**
 * Extract ПриватБанк spec from contract PDF appendix 2.
 * Usage: node scripts/build-privatbank-spec.mjs [path-to-contract.pdf]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2] || path.join(__dirname, '../../Договір.pdf');
const outPath = path.join(__dirname, '../frontend/src/data/estimateSpecs/privatbank-p0156625.json');

const rawText = (await pdfParse(fs.readFileSync(pdfPath))).text;
const startIdx = rawText.indexOf('СПЕЦИФІКАЦІЯ РОБІТ');
const endIdx = rawText.indexOf('Країна походження Послуг');
const specText = startIdx >= 0 ? rawText.slice(startIdx, endIdx > startIdx ? endIdx : undefined) : rawText;

const UNIT_RE = /^(послуга|шт|км|м\.п\.|м)$/i;

function parsePriceToken(tok) {
  if (!tok || /не\s*надається/i.test(tok)) return null;
  const n = parseFloat(String(tok).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function splitGluedPricePair(digits) {
  const s = String(digits).replace(/\D/g, '');
  if (!s) return [null, null];
  if (s.length <= 4) return [parsePriceToken(s), null];
  const candidates = [];
  for (let i = 2; i <= s.length - 2; i++) {
    const le = parsePriceToken(s.slice(0, i));
    const gt = parsePriceToken(s.slice(i));
    if (le != null && gt != null && le >= 30 && le <= 50000 && gt >= 30 && gt <= 50000) {
      candidates.push([le, gt, Math.abs(i - s.length / 2)]);
    }
  }
  if (!candidates.length) return [parsePriceToken(s), null];
  candidates.sort((a, b) => a[2] - b[2]);
  return [candidates[0][0], candidates[0][1]];
}

function extractUnitAndPrices(text) {
  let s = text.trim();
  const unavailable = /не\s*надається/i.test(s);
  if (unavailable) {
    s = s.replace(/послуга\s*не\s*надається\s*не\s*надається/gi, '').trim();
    s = s.replace(/не\s*надається/gi, '').trim();
    return { label: s, unit: 'послуга', le: null, gt: null, unavailable: true };
  }

  let m = s.match(/(послуга|шт|км|м\.п\.|м)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s*$/i);
  if (m) {
    return {
      label: s.slice(0, m.index).trim(),
      unit: m[1].toLowerCase(),
      le: parsePriceToken(m[2]),
      gt: parsePriceToken(m[3]),
      unavailable: false,
    };
  }

  m = s.match(/(послуга|шт|км|м\.п\.|м)(\d[\d.,]*)\s*$/i);
  if (m) {
    const [le, gt] = splitGluedPricePair(m[2]);
    return {
      label: s.slice(0, m.index).trim(),
      unit: m[1].toLowerCase(),
      le,
      gt,
      unavailable: false,
    };
  }

  return { label: s, unit: 'послуга', le: null, gt: null, unavailable: false };
}

const lines = specText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const categories = [];
let currentCategory = null;
let pendingCode = null;
let pendingParts = [];

function flushItem() {
  if (!pendingCode || !currentCategory) return;
  const joined = pendingParts.join(' ').replace(/\s+/g, ' ').trim();
  const parsed = extractUnitAndPrices(joined);
  if (!parsed.label && !parsed.unavailable) return;
  currentCategory.items.push({
    id: `${currentCategory.id}-${pendingCode}-${currentCategory.items.length + 1}`,
    code: pendingCode,
    label: parsed.label || joined,
    unit: parsed.unit,
    prices: {
      le_50kw: parsed.le,
      gt_50kw: parsed.gt,
      unavailable: parsed.unavailable,
    },
  });
  pendingCode = null;
  pendingParts = [];
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^(до 50|50 кВт|№|Од\.|Тариф|Найменування|рідинного|1\. Загальна)/i.test(line)) continue;

  if (/^Категорія/i.test(line)) {
    flushItem();
    if (currentCategory?.items?.length) categories.push(currentCategory);
    let title = line;
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (/^\d+\.\d+/.test(next) || /^Категорія/i.test(next)) break;
      if (/^(до 50|50 кВт|№|Од\.|Тариф|Найменування|рідинного)/i.test(next)) break;
      title += ' ' + next;
      i++;
    }
    currentCategory = { id: `cat-${categories.length + 1}`, title: title.replace(/\s+/g, ' ').trim(), items: [] };
    continue;
  }

  const codeMatch = line.match(/^(\d+\.\d+)\s*(.*)$/);
  if (codeMatch && currentCategory) {
    flushItem();
    pendingCode = codeMatch[1];
    pendingParts = codeMatch[2] ? [codeMatch[2]] : [];
    continue;
  }

  if (pendingCode) {
    if (UNIT_RE.test(line)) {
      pendingParts.push(line);
      if (i + 1 < lines.length && !/^\d+\.\d+/.test(lines[i + 1]) && !/^Категорія/i.test(lines[i + 1])) {
        const n1 = lines[i + 1];
        const n2 = lines[i + 2];
        if (/не\s*надається/i.test(n1)) {
          pendingParts.push('не надається', n2 && /не\s*надається/i.test(n2) ? 'не надається' : '');
          i += n2 && /не\s*надається/i.test(n2) ? 2 : 1;
        } else if (/^\d/.test(n1)) {
          pendingParts.push(n1, n2 && /^\d/.test(n2) ? n2 : '');
          if (n2 && /^\d/.test(n2)) i += 2;
          else i += 1;
        }
      }
      flushItem();
      continue;
    }
    pendingParts.push(line);
  }
}
flushItem();
if (currentCategory?.items?.length) categories.push(currentCategory);

// Post-fix: inherit price from first priced sibling in same category block when sub-items share package
for (const cat of categories) {
  let lastPrice = null;
  for (const item of cat.items) {
    if (item.prices.unavailable) {
      lastPrice = null;
      continue;
    }
    if (item.prices.le_50kw != null || item.prices.gt_50kw != null) {
      lastPrice = { le: item.prices.le_50kw, gt: item.prices.gt_50kw };
    } else if (lastPrice && /^1\.[2-4]$/.test(item.code)) {
      item.prices.le_50kw = lastPrice.le;
      item.prices.gt_50kw = lastPrice.gt;
      item.includedInPackage = true;
    }
  }
}

function mergeCategoryOnePackages(categories) {
  for (const cat of categories) {
    if (!/^Категорія ТО:\s*1\./i.test(cat.title || '')) continue;
    const subItems = cat.items.filter((item) => /^1\.\d+$/.test(item.code));
    if (subItems.length < 2) continue;
    const priced = subItems.find((item) => !item.prices?.unavailable && item.prices?.le_50kw != null);
    if (!priced) continue;
    cat.items = [{
      id: `${cat.id}-package`,
      code: '1',
      label: "Технічний огляд (раз на квартал обов'язково)",
      unit: priced.unit || 'послуга',
      prices: { ...priced.prices },
      subItems: subItems.map(({ code, label }) => ({ code, label })),
    }];
  }
}

mergeCategoryOnePackages(categories);

const spec = {
  id: 'privatbank-p0156625',
  edrpou: '14360570',
  contractNumber: 'П-0156625',
  contractNumberAliases: ['P-0156625', 'П-0156625'],
  title: 'ПриватБанк — специфікація робіт (Додаток №2)',
  powerTiers: [
    { id: 'le_50kw', label: 'до 50 кВт (рідинне охолодження)' },
    { id: 'gt_50kw', label: '50 кВт та більше (рідинне охолодження)' },
  ],
  transportRatePerKm: 35,
  categories,
  itemCount: categories.reduce((n, c) => n + c.items.length, 0),
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(spec, null, 2), 'utf8');
console.log('Wrote', outPath, 'categories:', categories.length, 'items:', spec.itemCount);
const priced = categories.flatMap((c) => c.items).filter((i) => i.prices.le_50kw != null || i.prices.gt_50kw != null);
console.log('priced items:', priced.length);
