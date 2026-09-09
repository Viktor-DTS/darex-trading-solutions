/**
 * Очікувані партії ВЕД для підбору менеджера.
 * Наміри (інтерес / м’який резерв / «можна обіцяти») живуть окремо від VedProductOrder,
 * бо імпорт Excel робить deleteMany + insertMany.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');

const HORIZON_VISIBLE = new Set(['confirmed', 'ready', 'en_route']);

const interestSchema = new mongoose.Schema(
  {
    login: { type: String, required: true },
    name: { type: String, default: '' },
    clientId: { type: mongoose.Schema.Types.ObjectId, default: null },
    clientName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const softReserveSchema = new mongoose.Schema(
  {
    login: { type: String, required: true },
    name: { type: String, default: '' },
    clientId: { type: mongoose.Schema.Types.ObjectId, default: null },
    clientName: { type: String, default: '' },
    qty: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const vedIncomingIntentSchema = new mongoose.Schema(
  {
    lotKey: { type: String, required: true, unique: true, index: true },
    sheetType: { type: String, enum: ['dgu', 'zip'], default: 'dgu' },
    productName: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
    canPromise: { type: Boolean, default: true },
    canPromiseManual: { type: Boolean, default: false },
    lastExpectedArrivalDate: { type: Date, default: null },
    lastSupplierReadyDate: { type: Date, default: null },
    lastHorizonStatus: { type: String, default: '' },
    interests: { type: [interestSchema], default: [] },
    softReserves: { type: [softReserveSchema], default: [] },
  },
  { timestamps: true }
);

let VedIncomingIntent;
try {
  VedIncomingIntent = mongoose.model('VedIncomingIntent');
} catch {
  VedIncomingIntent = mongoose.model('VedIncomingIntent', vedIncomingIntentSchema);
}

let incomingNotify = null;

function bindVedIncomingNotifications(fn) {
  incomingNotify = typeof fn === 'function' ? fn : null;
}

function getVedProductOrder() {
  try {
    return mongoose.model('VedProductOrder');
  } catch {
    return null;
  }
}

function normKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-z0-9а-яіїєґ]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function lotKeyFromOrder(order) {
  const delivery = normKey(order?.deliveryNumber || order?.deliveryCode);
  const parts = [
    String(order?.sheetType || ''),
    normKey(order?.productName),
    normKey(order?.arrivalWarehouse),
    delivery,
    order?.quantity == null || order?.quantity === '' ? '' : String(order.quantity),
  ];
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

function textHas(value, re) {
  return re.test(String(value || '').toLowerCase());
}

function isCancelledOrder(order) {
  return (
    textHas(order?.orderStatus, /отмен|скасов|cancel|аннул/) ||
    textHas(order?.productStatus, /отмен|скасов|cancel|аннул/)
  );
}

function isArrivedOrder(order) {
  return (
    textHas(order?.productStatus, /приб|оприход|на склад[іеу]|получ|arrived|прийнят|оприбут/) ||
    textHas(order?.orderStatus, /выполнен|завершен|закрит|закрыт|прийнято|оприбут/)
  );
}

function horizonStatus(order) {
  if (isCancelledOrder(order)) return 'cancelled';
  if (isArrivedOrder(order)) return 'arrived';
  const exp = order?.expectedArrivalDate ? new Date(order.expectedArrivalDate).getTime() : NaN;
  if (Number.isFinite(exp)) {
    const days = (exp - Date.now()) / 86400000;
    if (days <= 3) return 'en_route';
  }
  if (order?.supplierReadyDate) return 'ready';
  return 'confirmed';
}

function inferCanPromise(order) {
  if (String(order?.customerName || '').trim()) return false;
  const dest = String(order?.destination || '').toLowerCase();
  if (/резерв|заказчик|замовник|клієнт|клиент|оплат/.test(dest)) return false;
  return true;
}

function ymd(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function looksLikeWarehouse(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (/резерв|заказчик|замовник|клієнт|клиент|оплат/i.test(s)) return '';
  return s;
}

function sanitizeLot(order, intent, login) {
  const lotKey = intent?.lotKey || lotKeyFromOrder(order);
  const myLogin = String(login || '').trim();
  const interests = Array.isArray(intent?.interests) ? intent.interests : [];
  const softReserves = Array.isArray(intent?.softReserves) ? intent.softReserves : [];
  const myInterest = interests.some((x) => String(x.login) === myLogin);
  const mySoft = softReserves.find((x) => String(x.login) === myLogin) || null;
  const otherSoft = softReserves.find((x) => String(x.login) !== myLogin) || null;
  const warehouse = looksLikeWarehouse(order.arrivalWarehouse) || looksLikeWarehouse(order.destination);
  const canPromise = intent?.canPromiseManual ? !!intent.canPromise : inferCanPromise(order);
  return {
    lotKey,
    sheetType: order.sheetType || 'dgu',
    productName: String(order.productName || '').trim(),
    productCharacteristics: String(order.productCharacteristics || '').trim(),
    quantity: Number.isFinite(Number(order.quantity)) ? Number(order.quantity) : 1,
    arrivalWarehouse: warehouse,
    expectedArrivalDate: order.expectedArrivalDate || null,
    supplierReadyDate: order.supplierReadyDate || null,
    horizonStatus: horizonStatus(order),
    canPromise,
    interestCount: interests.length,
    softReserveCount: softReserves.length,
    myInterest,
    mySoftReserve: !!mySoft,
    softReservedByOther: !!otherSoft,
    otherSoftReserveName: otherSoft ? String(otherSoft.name || otherSoft.login || '') : '',
  };
}

function normalizeRole(role) {
  return String(role || '').toLowerCase();
}

function isVedStaffRole(role) {
  return ['admin', 'administrator', 'ved', 'vidved'].includes(normalizeRole(role));
}

function isVedManagerRole(role) {
  const r = normalizeRole(role);
  return ['manager', 'mgradm'].includes(r) || isVedStaffRole(r);
}

async function notifyIncoming(doc) {
  if (!incomingNotify) return;
  try {
    await incomingNotify(doc);
  } catch (e) {
    console.error('[ved incoming] notify:', e.message);
  }
}

function watchersOf(intent) {
  const map = new Map();
  for (const row of [...(intent.interests || []), ...(intent.softReserves || [])]) {
    const login = String(row.login || '').trim();
    if (!login || map.has(login)) continue;
    map.set(login, row);
  }
  return [...map.values()];
}

async function upsertIntentFromOrder(order, { markActive = true } = {}) {
  const lotKey = lotKeyFromOrder(order);
  if (!normKey(order?.productName)) return null;
  let intent = await VedIncomingIntent.findOne({ lotKey });
  const inferred = inferCanPromise(order);
  if (!intent) {
    intent = await VedIncomingIntent.create({
      lotKey,
      sheetType: order.sheetType || 'dgu',
      productName: String(order.productName || '').trim(),
      active: markActive,
      canPromise: inferred,
      canPromiseManual: false,
      lastExpectedArrivalDate: order.expectedArrivalDate || null,
      lastSupplierReadyDate: order.supplierReadyDate || null,
      lastHorizonStatus: horizonStatus(order),
    });
    return intent;
  }
  intent.sheetType = order.sheetType || intent.sheetType;
  intent.productName = String(order.productName || intent.productName || '').trim();
  if (markActive) intent.active = true;
  if (!intent.canPromiseManual) {
    intent.canPromise = inferred;
  }
  intent.lastExpectedArrivalDate = order.expectedArrivalDate || null;
  intent.lastSupplierReadyDate = order.supplierReadyDate || null;
  intent.lastHorizonStatus = horizonStatus(order);
  await intent.save();
  return intent;
}

async function listIncomingForManagers(login) {
  const VedProductOrder = getVedProductOrder();
  if (!VedProductOrder) return { lots: [], syncedAt: null };
  const orders = await VedProductOrder.find({})
    .select(
      'sheetType productName productCharacteristics quantity arrivalWarehouse destination expectedArrivalDate supplierReadyDate orderStatus productStatus customerName deliveryNumber deliveryCode'
    )
    .lean();
  const visible = orders.filter((o) => HORIZON_VISIBLE.has(horizonStatus(o)) && normKey(o.productName));
  const keys = [...new Set(visible.map(lotKeyFromOrder))];
  const intents = keys.length
    ? await VedIncomingIntent.find({ lotKey: { $in: keys } }).lean()
    : [];
  const intentMap = new Map(intents.map((x) => [x.lotKey, x]));
  const lots = visible.map((order) => sanitizeLot(order, intentMap.get(lotKeyFromOrder(order)), login));
  lots.sort((a, b) => {
    const da = a.expectedArrivalDate ? new Date(a.expectedArrivalDate).getTime() : Infinity;
    const db = b.expectedArrivalDate ? new Date(b.expectedArrivalDate).getTime() : Infinity;
    if (da !== db) return da - db;
    return String(a.productName).localeCompare(String(b.productName), 'uk');
  });
  const latest = orders.reduce((acc, o) => {
    const t = o.expectedArrivalDate || o.supplierReadyDate;
    return t && (!acc || new Date(t) > new Date(acc)) ? t : acc;
  }, null);
  return { lots, count: lots.length, syncedAt: latest };
}

async function reconcileIncomingAfterImport(prevOrders, newOrders) {
  const prevList = Array.isArray(prevOrders) ? prevOrders : [];
  const nextList = Array.isArray(newOrders) ? newOrders : [];
  const prevByKey = new Map();
  for (const order of prevList) {
    const key = lotKeyFromOrder(order);
    if (!prevByKey.has(key)) prevByKey.set(key, order);
  }
  const nextKeys = new Set();
  for (const order of nextList) {
    const key = lotKeyFromOrder(order);
    if (!normKey(order.productName)) continue;
    nextKeys.add(key);
    const prev = prevByKey.get(key);
    const intent = await upsertIntentFromOrder(order, { markActive: HORIZON_VISIBLE.has(horizonStatus(order)) });
    if (!intent) continue;
    const watchers = watchersOf(intent);
    if (!watchers.length) continue;

    const oldDate = ymd(prev?.expectedArrivalDate || intent.lastExpectedArrivalDate);
    const newDate = ymd(order.expectedArrivalDate);
    const name = String(order.productName || intent.productName || 'партія').trim();
    const status = horizonStatus(order);

    if (oldDate && newDate && oldDate !== newDate) {
      for (const w of watchers) {
        await notifyIncoming({
          recipientLogin: w.login,
          kind: 'ved_incoming_date_shift',
          title: `Зсув дати надходження: ${name}`,
          body: `Очікувана дата змінилася з ${oldDate} на ${newDate}.`,
          requestNumber: key.slice(0, 10),
          dedupeKey: `ved_incoming_shift:${key}:${oldDate}:${newDate}:${w.login}`,
        });
      }
    }

    if (status !== 'cancelled' && status !== 'arrived' && newDate) {
      const exp = new Date(order.expectedArrivalDate).getTime();
      const days = (exp - Date.now()) / 86400000;
      if (days >= -1 && days <= 7) {
        for (const w of watchers) {
          await notifyIncoming({
            recipientLogin: w.login,
            kind: 'ved_incoming_week',
            title: `Надходження цього тижня: ${name}`,
            body: `Очікувана дата ${newDate}. Можна готувати КП${intent.canPromise ? '' : ' (поки не можна обіцяти дату)'}.`,
            requestNumber: key.slice(0, 10),
            dedupeKey: `ved_incoming_week:${key}:${newDate}:${w.login}`,
          });
        }
      }
    }
  }

  if (nextKeys.size) {
    await VedIncomingIntent.updateMany({ lotKey: { $nin: [...nextKeys] } }, { $set: { active: false } });
  } else {
    await VedIncomingIntent.updateMany({}, { $set: { active: false } });
  }
}

async function getOrderById(id) {
  const VedProductOrder = getVedProductOrder();
  if (!VedProductOrder || !mongoose.isValidObjectId(id)) return null;
  return VedProductOrder.findById(id).lean();
}

async function findVisibleOrderByLotKey(lotKey) {
  const VedProductOrder = getVedProductOrder();
  if (!VedProductOrder || !lotKey) return null;
  const orders = await VedProductOrder.find({})
    .select(
      'sheetType productName productCharacteristics quantity arrivalWarehouse destination expectedArrivalDate supplierReadyDate orderStatus productStatus customerName deliveryNumber deliveryCode'
    )
    .lean();
  return (
    orders.find(
      (order) => lotKeyFromOrder(order) === lotKey && HORIZON_VISIBLE.has(horizonStatus(order))
    ) || null
  );
}

function actorName(user) {
  return String(user?.name || user?.login || '').trim();
}

function registerVedIncomingRoutes(app, deps = {}) {
  const { authenticateToken } = deps;
  if (!app || !authenticateToken) return;

  app.get('/api/ved/incoming-for-managers', authenticateToken, async (req, res) => {
    try {
      if (!isVedManagerRole(req.user?.role)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const data = await listIncomingForManagers(req.user?.login);
      res.json(data);
    } catch (e) {
      console.error('[ved incoming] GET list:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/ved/incoming-for-managers/by-order/:id', authenticateToken, async (req, res) => {
    try {
      if (!isVedStaffRole(req.user?.role)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const order = await getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });
      const lotKey = lotKeyFromOrder(order);
      const intent = await VedIncomingIntent.findOne({ lotKey }).lean();
      res.json({
        lotKey,
        horizonStatus: horizonStatus(order),
        canPromise: intent ? !!intent.canPromise : inferCanPromise(order),
        canPromiseManual: !!intent?.canPromiseManual,
        interestCount: intent?.interests?.length || 0,
        softReserveCount: intent?.softReserves?.length || 0,
        visibleToManagers: HORIZON_VISIBLE.has(horizonStatus(order)),
      });
    } catch (e) {
      console.error('[ved incoming] GET by-order:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/ved/incoming-for-managers/by-order/:id/can-promise', authenticateToken, async (req, res) => {
    try {
      if (!isVedStaffRole(req.user?.role)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const order = await getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });
      const canPromise = !!req.body?.canPromise;
      const intent = await upsertIntentFromOrder(order, {
        markActive: HORIZON_VISIBLE.has(horizonStatus(order)),
      });
      if (!intent) return res.status(400).json({ error: 'Немає найменування товару' });
      intent.canPromise = canPromise;
      intent.canPromiseManual = true;
      await intent.save();
      res.json({
        lotKey: intent.lotKey,
        canPromise: intent.canPromise,
        canPromiseManual: true,
      });
    } catch (e) {
      console.error('[ved incoming] PATCH can-promise:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/incoming-for-managers/:lotKey/interest', authenticateToken, async (req, res) => {
    try {
      if (!isVedManagerRole(req.user?.role)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const lotKey = String(req.params.lotKey || '').trim();
      if (!/^[a-f0-9]{40}$/i.test(lotKey)) {
        return res.status(400).json({ error: 'Некоректний ключ партії' });
      }
      const order = await findVisibleOrderByLotKey(lotKey);
      if (!order) return res.status(404).json({ error: 'Партію не знайдено в очікуваних' });
      const login = String(req.user.login || '').trim();
      const intent = await upsertIntentFromOrder(order);
      if (!intent) return res.status(400).json({ error: 'Немає найменування товару' });
      intent.interests = (intent.interests || []).filter((x) => String(x.login) !== login);
      intent.interests.push({
        login,
        name: actorName(req.user),
        clientId: req.body?.clientId || null,
        clientName: String(req.body?.clientName || '').trim(),
      });
      await intent.save();
      res.json({ ok: true, myInterest: true, interestCount: intent.interests.length });
    } catch (e) {
      console.error('[ved incoming] POST interest:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/ved/incoming-for-managers/:lotKey/interest', authenticateToken, async (req, res) => {
    try {
      if (!isVedManagerRole(req.user?.role)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const lotKey = String(req.params.lotKey || '').trim();
      const login = String(req.user.login || '').trim();
      const intent = await VedIncomingIntent.findOneAndUpdate(
        { lotKey },
        { $pull: { interests: { login } } },
        { new: true }
      );
      res.json({
        ok: true,
        myInterest: false,
        interestCount: intent?.interests?.length || 0,
      });
    } catch (e) {
      console.error('[ved incoming] DELETE interest:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ved/incoming-for-managers/:lotKey/soft-reserve', authenticateToken, async (req, res) => {
    try {
      if (!isVedManagerRole(req.user?.role)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const lotKey = String(req.params.lotKey || '').trim();
      if (!/^[a-f0-9]{40}$/i.test(lotKey)) {
        return res.status(400).json({ error: 'Некоректний ключ партії' });
      }
      const order = await findVisibleOrderByLotKey(lotKey);
      if (!order) return res.status(404).json({ error: 'Партію не знайдено в очікуваних' });
      const intent = await upsertIntentFromOrder(order);
      if (!intent) return res.status(400).json({ error: 'Немає найменування товару' });
      const canPromise = intent.canPromiseManual ? !!intent.canPromise : inferCanPromise(order);
      if (!canPromise) {
        return res.status(409).json({ error: 'Цю партію ще не можна обіцяти клієнту' });
      }
      const login = String(req.user.login || '').trim();
      const other = (intent.softReserves || []).find((x) => String(x.login) !== login);
      if (other) {
        return res.status(409).json({
          error: `Вже є м’який резерв (${other.name || other.login})`,
        });
      }
      intent.softReserves = (intent.softReserves || []).filter((x) => String(x.login) !== login);
      const qty = Number(req.body?.qty);
      intent.softReserves.push({
        login,
        name: actorName(req.user),
        clientId: req.body?.clientId || null,
        clientName: String(req.body?.clientName || '').trim(),
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      });
      await intent.save();
      res.json({ ok: true, mySoftReserve: true, softReserveCount: intent.softReserves.length });
    } catch (e) {
      console.error('[ved incoming] POST soft-reserve:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/ved/incoming-for-managers/:lotKey/soft-reserve', authenticateToken, async (req, res) => {
    try {
      if (!isVedManagerRole(req.user?.role)) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const lotKey = String(req.params.lotKey || '').trim();
      const login = String(req.user.login || '').trim();
      const isStaff = isVedStaffRole(req.user?.role);
      const intent = await VedIncomingIntent.findOne({ lotKey });
      if (!intent) return res.json({ ok: true, mySoftReserve: false, softReserveCount: 0 });
      intent.softReserves = (intent.softReserves || []).filter((x) => {
        if (isStaff && req.body?.all) return false;
        return String(x.login) !== login;
      });
      await intent.save();
      res.json({
        ok: true,
        mySoftReserve: false,
        softReserveCount: intent.softReserves.length,
      });
    } catch (e) {
      console.error('[ved incoming] DELETE soft-reserve:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
}

module.exports = {
  VedIncomingIntent,
  lotKeyFromOrder,
  horizonStatus,
  inferCanPromise,
  listIncomingForManagers,
  reconcileIncomingAfterImport,
  bindVedIncomingNotifications,
  registerVedIncomingRoutes,
  HORIZON_VISIBLE,
};
