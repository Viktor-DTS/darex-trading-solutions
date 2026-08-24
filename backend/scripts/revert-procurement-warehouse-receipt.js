/**
 * One-off: повернути заявку закупівель з awaiting_documents на awaiting_warehouse.
 * Usage: node scripts/revert-procurement-warehouse-receipt.js VZ-01524
 */
require('dotenv').config({ path: './config.env' });
const mongoose = require('mongoose');

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://darexuser:viktor22@cluster0.yaec2av.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';

const requestNumber = process.argv[2] || 'VZ-01524';

function expectedQty(line) {
  if (!line || line.rejected) return 0;
  let main = 0;
  if (line.quantity != null && Number.isFinite(Number(line.quantity))) {
    main = Math.max(0, Number(line.quantity));
  }
  let analog = 0;
  if (line.analogShipped && line.analogName && Number.isFinite(Number(line.analogQuantity))) {
    analog = Math.max(0, Number(line.analogQuantity));
  }
  if (line.analogShipped && analog > 0) return analog;
  return main;
}

function sumEvents(line) {
  if (!Array.isArray(line.warehouseReceiptEvents)) return 0;
  return line.warehouseReceiptEvents.reduce((s, e) => s + (Number(e.acceptedQuantity) || 0), 0);
}

function lineWarehouse(line, pr) {
  const w = String(line.actualWarehouse || '').trim();
  if (w) return w;
  return String(pr.actualWarehouse || '').trim();
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveWarehouse(whCol, name) {
  const n = String(name || '').trim();
  if (!n) return null;
  return (
    (await whCol.findOne({ isActive: true, name: n })) ||
    (await whCol.findOne({ isActive: true, name: new RegExp(`^${escapeRegExp(n)}$`, 'i') })) ||
    null
  );
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('[revert] Connected to MongoDB');

  const db = mongoose.connection.db;
  const prCol = db.collection('procurementrequests');
  const eqCol = db.collection('equipments');
  const whCol = db.collection('warehouses');
  const pcCol = db.collection('productcards');

  const pr = await prCol.findOne({ requestNumber });
  if (!pr) {
    console.error(`[revert] Заявку ${requestNumber} не знайдено`);
    process.exit(1);
  }

  console.log('[revert] Found:', pr.requestNumber, 'status:', pr.status);
  if (pr.status !== 'awaiting_documents') {
    console.error('[revert] Очікувався статус awaiting_documents, зараз:', pr.status);
    process.exit(1);
  }

  const stockByWh = new Map();
  for (const line of pr.materials || []) {
    const exp = expectedQty(line);
    if (line.rejected || exp <= 0) continue;
    let r = Number(line.receivedQuantity);
    const evSum = sumEvents(line);
    if ((!Number.isFinite(r) || r <= 0) && evSum > 0) r = evSum;
    if (!Number.isFinite(r) || r <= 0) continue;

    const typeLabel =
      line.analogShipped && String(line.analogName || '').trim()
        ? String(line.analogName).trim()
        : String(line.name || '').trim();
    const wname = lineWarehouse(line, pr);
    if (!wname) continue;
    if (!stockByWh.has(wname)) stockByWh.set(wname, []);
    stockByWh.get(wname).push({ qty: r, productId: line.productId, typeLabel: typeLabel || 'Без назви' });
  }

  console.log(
    '[revert] Stock lines:',
    [...stockByWh.entries()].map(([w, l]) => `${w}: ${l.map((x) => `${x.typeLabel} x${x.qty}`).join(', ')}`)
  );

  for (const [wname, lines] of stockByWh) {
    const wh = await resolveWarehouse(whCol, wname);
    if (!wh) throw new Error(`Склад «${wname}» не знайдено`);
    const warehouseId = String(wh._id);
    const region = String(wh.region || '').trim();

    for (const line of lines) {
      let equipmentType = line.typeLabel;
      let productOid = null;
      let manufacturer = null;
      if (line.productId && mongoose.isValidObjectId(String(line.productId))) {
        const card = await pcCol.findOne({
          _id: new mongoose.Types.ObjectId(String(line.productId)),
          isActive: true
        });
        if (card) {
          productOid = card._id;
          equipmentType = String(card.type || '').trim() || line.typeLabel;
          if (String(card.manufacturer || '').trim()) manufacturer = String(card.manufacturer).trim();
        }
      }

      const query = {
        currentWarehouse: new mongoose.Types.ObjectId(warehouseId),
        region,
        status: { $ne: 'deleted' },
        $or: [{ serialNumber: null }, { serialNumber: { $exists: false } }, { serialNumber: '' }]
      };
      if (productOid) {
        query.productId = productOid;
      } else {
        query.type = equipmentType;
        if (manufacturer) query.manufacturer = manufacturer;
      }

      const eq = await eqCol.findOne(query);
      if (!eq) throw new Error(`Залишок «${line.typeLabel}» на «${wname}» не знайдено`);
      const currentQty = Number(eq.quantity) || 0;
      if (currentQty < line.qty) {
        throw new Error(`Недостатньо «${line.typeLabel}» на «${wname}»: є ${currentQty}, зняти ${line.qty}`);
      }
      const newQty = currentQty - line.qty;
      const update = { lastModified: new Date() };
      if (newQty <= 0) {
        update.quantity = 0;
        update.status = 'deleted';
      } else {
        update.quantity = newQty;
      }
      await eqCol.updateOne({ _id: eq._id }, { $set: update });
      console.log(`[revert] Stock: ${line.typeLabel} on ${wname}: ${currentQty} -> ${newQty <= 0 ? 0 : newQty}`);
    }
  }

  const materials = (pr.materials || []).map((line) => ({
    ...line,
    receivedQuantity: null,
    warehouseReceiptEvents: []
  }));

  await prCol.updateOne(
    { _id: pr._id },
    {
      $set: {
        status: 'awaiting_warehouse',
        receiptOutcome: 'pending',
        warehouseReceivedAt: null,
        warehouseConfirmerLogin: '',
        warehouseConfirmerName: '',
        warehouseConfirmerActions: [],
        executorDocumentsConfirmedAt: null,
        materials,
        updatedAt: new Date()
      }
    }
  );

  const updated = await prCol.findOne({ _id: pr._id });
  console.log('[revert] Done. New status:', updated.status);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('[revert] FAILED:', e);
  process.exit(1);
});
