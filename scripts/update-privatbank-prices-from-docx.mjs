/**
 * Update PrivatBank spec prices from addendum docx (Додаткова угода №1).
 * Preserves item structure; updates prices only.
 *
 * Usage: node scripts/update-privatbank-prices-from-docx.mjs [path-to.docx]
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function resolveDefaultDocxPath() {
  const root = path.join(__dirname, '..');
  const tmpPrefix = String.fromCharCode(126, 36);
  const files = fs.readdirSync(root).filter((f) => f.endsWith('.docx') && !f.startsWith(tmpPrefix));
  const match = files.find((f) => /\u0434\u043e\u043f\s+\u0443\u0433\u043e\u0434\u0430\s+\u21161\s+\u0414\u0410\u0420\u0415\u041a\u0421/i.test(f)) || files[0];
  return match ? path.join(root, match) : path.join(root, '\u0434\u043e\u043f \u0443\u0433\u043e\u0434\u0430  \u21161  \u0414\u0410\u0420\u0415\u041a\u0421.docx');
}

const docxPath = process.argv[2] || resolveDefaultDocxPath();

const outPaths = [
  path.join(__dirname, '../backend/data/estimateSpecs/privatbank-p0156625.json'),
  path.join(__dirname, '../frontend/src/data/estimateSpecs/privatbank-p0156625.json'),
];

function parsePrice(val) {
  if (!val || /не\s*надається/i.test(String(val))) return null;
  const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normCategory(title) {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .replace(/:\s*/g, ': ')
    .replace(/обслуговуванн\s*я/g, 'обслуговування')
    .trim()
    .toLowerCase()
    .replace(/\s/g, '');
}

function readDocxXml(docxFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-'));
  const zipPath = path.join(tmp, 'archive.zip');
  const extractDir = path.join(tmp, 'extract');
  fs.copyFileSync(docxFile, zipPath);
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
    { stdio: 'pipe' }
  );
  const xmlPath = path.join(extractDir, 'word', 'document.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8');
  fs.rmSync(tmp, { recursive: true, force: true });
  return xml;
}

function cellTextsFromXml(cellXml) {
  return [...cellXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => m[1])
    .join('')
    .trim();
}

function readDocxTableRows(docxFile) {
  const xml = readDocxXml(docxFile);
  const tables = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((m) => m[1]);
  const mainTable = tables[1];
  if (!mainTable) throw new Error('Expected tariff table at index 1 in docx');

  const rows = [...mainTable.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((m) => {
    const rowXml = m[0];
    return rowXml.slice(rowXml.indexOf('>') + 1, rowXml.lastIndexOf('<'));
  });
  let currentCategory = '';
  const priceRows = [];

  for (const row of rows.slice(1)) {
    const cells = [...row.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map((m) => {
    const cellXml = m[0];
    const inner = cellXml.slice(cellXml.indexOf('>') + 1, cellXml.lastIndexOf('<'));
    return cellTextsFromXml(inner);
  });
    if (cells.length < 6) continue;

    const [catOrEmpty, code, label, unit, leRaw, gtRaw] = cells;
    if (catOrEmpty && /категор/i.test(catOrEmpty)) {
      currentCategory = catOrEmpty.replace(/\s+/g, ' ').trim();
      if (!/^\d+(\.\d+)?$/.test(code || '')) continue;
    }
    if (!/^\d+(\.\d+)?$/.test(code || '')) continue;

    const le = parsePrice(leRaw);
    const gt = parsePrice(gtRaw);
    const unavailable = /не\s*надається/i.test(`${leRaw}${gtRaw}`);

    priceRows.push({
      category: currentCategory,
      code,
      label,
      unit: unit || 'послуга',
      le,
      gt,
      unavailable,
    });
  }

  return priceRows;
}

function lookupPriceRow(priceMap, catTitle, code) {
  const catNorm = normCategory(catTitle);
  const direct = priceMap.get(`${catNorm}::${code}`);
  if (direct) return direct;
  for (const [key, row] of priceMap) {
    if (key.endsWith(`::${code}`) && key.startsWith(catNorm)) return row;
  }
  return null;
}

function buildPriceMap(priceRows) {
  const map = new Map();
  for (const row of priceRows) {
    const key = `${normCategory(row.category)}::${row.code}`;
    map.set(key, row);
  }
  return map;
}

function applyPrices(spec, priceMap) {
  let updated = 0;
  const missing = [];

  for (const cat of spec.categories) {
    const catNorm = normCategory(cat.title);

    for (const item of cat.items) {
      if (item.code === '1' && item.subItems?.length) {
        const src = lookupPriceRow(priceMap, cat.title, '1.1');
        if (src) {
          item.prices.le_50kw = src.le;
          item.prices.gt_50kw = src.gt;
          item.prices.unavailable = src.unavailable;
          updated++;
        } else {
          missing.push(`${cat.title} :: 1 (package)`);
        }
        continue;
      }

      const src = lookupPriceRow(priceMap, cat.title, item.code);
      if (!src) {
        missing.push(`${cat.title} :: ${item.code}`);
        continue;
      }

      item.prices.le_50kw = src.le;
      item.prices.gt_50kw = src.gt;
      item.prices.unavailable = src.unavailable;
      if (src.unit) item.unit = src.unit;
      updated++;
    }
  }

  const transport = priceMap.get(`${normCategory('Категорія ІНШІ РОБОТИ:')}::6.6`);
  if (transport?.le != null) {
    spec.transportRatePerKm = transport.le;
  }

  spec.generatedAt = new Date().toISOString();
  return { updated, missing };
}

function main() {
  if (!fs.existsSync(docxPath)) {
    console.error('Docx not found:', docxPath);
    process.exit(1);
  }

  const priceRows = readDocxTableRows(docxPath);
  const priceMap = buildPriceMap(priceRows);
  console.log('Parsed', priceRows.length, 'price rows from docx');

  const specPath = outPaths[0];
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const { updated, missing } = applyPrices(spec, priceMap);

  for (const out of outPaths) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(spec, null, 2), 'utf8');
    console.log('Wrote', out);
  }

  console.log('Updated', updated, 'items');
  if (missing.length) {
    console.warn('Missing mappings (' + missing.length + '):');
    missing.forEach((m) => console.warn('  -', m));
    process.exitCode = 1;
  }

  const cat1 = spec.categories.find((c) => /ТО:\s*1\./i.test(c.title));
  const pkg = cat1?.items?.[0];
  console.log('Package 1 prices:', pkg?.prices);
  console.log('transportRatePerKm:', spec.transportRatePerKm);
}

main();
