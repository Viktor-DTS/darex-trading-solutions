/**
 * Запити сервісу на переміщення між складами (без прямої інтеграції 1С).
 */
const mongoose = require('mongoose');
const { sendWarehouseTransferTelegram } = require('./warehouseTransferTelegram');

const TRANSFER_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

const warehouseTransferRequestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: TRANSFER_STATUSES, default: 'pending', index: true },
    requesterLogin: { type: String, trim: true, default: '' },
    requesterName: { type: String, trim: true, default: '' },
    requesterRegion: { type: String, trim: true, default: '' },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    taskNumber: { type: String, trim: true, default: '' },
    nomenclature: { type: String, trim: true, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCard', default: null },
    quantity: { type: Number, required: true },
    unitOfMeasure: { type: String, trim: true, default: 'шт.' },
    fromWarehouseId: { type: String, trim: true, default: '' },
    fromWarehouseName: { type: String, trim: true, required: true },
    toWarehouseId: { type: String, trim: true, default: '' },
    toWarehouseName: { type: String, trim: true, required: true },
    comment: { type: String, trim: true, default: '' },
    sourceApproverLogin: { type: String, trim: true, default: '' },
    sourceApproverName: { type: String, trim: true, default: '' },
    sourceApprovedAt: { type: Date, default: null },
    sourceRejectReason: { type: String, trim: true, default: '' },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

warehouseTransferRequestSchema.index({ requesterLogin: 1, createdAt: -1 });
warehouseTransferRequestSchema.index({ fromWarehouseName: 1, status: 1, createdAt: -1 });

const WarehouseTransferRequest =
  mongoose.models.WarehouseTransferRequest ||
  mongoose.model('WarehouseTransferRequest', warehouseTransferRequestSchema);

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isNationalRegion(regionRaw) {
  const r = String(regionRaw || '').trim().toLowerCase();
  return !r || r === 'україна' || r === 'ukraine';
}

function canCreateTransferRequest(user) {
  const role = String(user?.role || '').toLowerCase();
  return ['service', 'regional', 'regkerivn', 'admin', 'administrator', 'warehouse', 'zavsklad'].includes(
    role,
  );
}

function canProcessTransferInbox(user) {
  const role = String(user?.role || '').toLowerCase();
  return ['warehouse', 'zavsklad', 'admin', 'administrator'].includes(role);
}

async function getNextTransferRequestNumber(Counter) {
  const c = await Counter.findOneAndUpdate(
    { _id: 'warehouseTransfer' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  const n = c.seq || 1;
  return `TR-${String(n).padStart(5, '0')}`;
}

async function findWarehouseByNameOrId(Warehouse, fromWarehouseId, fromWarehouseName) {
  if (fromWarehouseId && mongoose.isValidObjectId(fromWarehouseId)) {
    const byId = await Warehouse.findById(fromWarehouseId).lean();
    if (byId) return byId;
  }
  const name = String(fromWarehouseName || '').trim();
  if (!name) return null;
  return Warehouse.findOne({
    isActive: { $ne: false },
    name: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
  }).lean();
}

async function findWarehouseStaffLogins(User, warehouseRegion) {
  const region = String(warehouseRegion || '').trim();
  const filter = {
    dismissed: { $ne: true },
    role: { $in: ['warehouse', 'zavsklad', 'admin', 'administrator'] },
  };
  if (!isNationalRegion(region)) {
    filter.region = { $regex: new RegExp(`^${escapeRegExp(region)}$`, 'i') };
  }
  const rows = await User.find(filter).select('login').lean();
  return rows.map((r) => String(r.login || '').trim()).filter(Boolean);
}

async function notifyTransferEvent(deps, tr, kind, recipientLogins) {
  const { createManagerNotificationDeduped } = deps;
  const titles = {
    warehouse_transfer_requested: 'Новий запит на переміщення між складами',
    warehouse_transfer_approved: 'Запит на переміщення підтверджено',
    warehouse_transfer_rejected: 'Запит на переміщення відхилено',
  };
  const bodyLines = [
    `№ ${tr.requestNumber}`,
    `${tr.nomenclature} — ${tr.quantity} ${tr.unitOfMeasure || 'шт.'}`,
    `${tr.fromWarehouseName} → ${tr.toWarehouseName}`,
    tr.taskNumber ? `Заявка: ${tr.taskNumber}` : '',
    tr.comment ? `Коментар: ${tr.comment}` : '',
    tr.sourceRejectReason ? `Причина відмови: ${tr.sourceRejectReason}` : '',
  ].filter(Boolean);

  for (const login of recipientLogins) {
    if (!login) continue;
    await createManagerNotificationDeduped({
      recipientLogin: login,
      kind,
      title: titles[kind] || 'Запит на переміщення',
      body: bodyLines.join('\n'),
      requestNumber: tr.requestNumber,
      warehouseTransferRequestId: tr._id,
      taskId: tr.taskId || undefined,
      read: false,
      dedupeKey: `${kind}:${String(tr._id)}:${login}:${Date.now()}`,
    });
  }

  const tgEvent =
    kind === 'warehouse_transfer_requested'
      ? 'requested'
      : kind === 'warehouse_transfer_approved'
        ? 'approved'
        : kind === 'warehouse_transfer_rejected'
          ? 'rejected'
          : null;
  if (tgEvent) {
    await sendWarehouseTransferTelegram(deps, tr, tgEvent, recipientLogins);
  }
}

function registerWarehouseTransferRoutes(app, deps) {
  const {
    authenticateToken,
    Counter,
    Warehouse,
    User,
    createManagerNotificationDeduped,
    telegramService,
    NotificationLog,
  } = deps;

  const notifyDeps = { ...deps, createManagerNotificationDeduped };

  app.post('/api/warehouse-transfer-requests', authenticateToken, async (req, res) => {
    try {
      if (!canCreateTransferRequest(req.user)) {
        return res.status(403).json({ error: 'Немає прав на створення запиту' });
      }

      const nomenclature = String(req.body?.nomenclature || '').trim();
      const fromWarehouseName = String(req.body?.fromWarehouseName || '').trim();
      const toWarehouseName = String(req.body?.toWarehouseName || '').trim();
      const quantity = Number(req.body?.quantity);
      if (!nomenclature || !fromWarehouseName || !toWarehouseName) {
        return res.status(400).json({ error: 'Заповніть номенклатуру та склади' });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ error: 'Некоректна кількість' });
      }
      if (fromWarehouseName.toLowerCase() === toWarehouseName.toLowerCase()) {
        return res.status(400).json({ error: 'Склади джерела та отримувача мають відрізнятися' });
      }

      const fromWh = await findWarehouseByNameOrId(
        Warehouse,
        req.body?.fromWarehouseId,
        fromWarehouseName,
      );
      const toWh = await findWarehouseByNameOrId(
        Warehouse,
        req.body?.toWarehouseId,
        toWarehouseName,
      );
      if (!fromWh) return res.status(400).json({ error: 'Склад-джерело не знайдено' });
      if (!toWh) return res.status(400).json({ error: 'Склад-отримувач не знайдено' });

      const dbUser = await User.findOne({ login: req.user.login })
        .select('name region login')
        .lean();
      const requesterRegion = String(dbUser?.region || req.user.region || '').trim();
      if (!isNationalRegion(requesterRegion)) {
        const toRegion = String(toWh.region || '').trim();
        if (toRegion.toLowerCase() !== requesterRegion.toLowerCase()) {
          return res.status(400).json({ error: 'Цільовий склад має бути у вашому регіоні' });
        }
      }

      const requestNumber = await getNextTransferRequestNumber(Counter);
      const doc = await WarehouseTransferRequest.create({
        requestNumber,
        status: 'pending',
        requesterLogin: String(dbUser?.login || req.user.login || '').trim(),
        requesterName: String(dbUser?.name || req.user.name || '').trim(),
        requesterRegion: String(dbUser?.region || req.user.region || '').trim(),
        taskId: req.body?.taskId && mongoose.isValidObjectId(req.body.taskId) ? req.body.taskId : null,
        taskNumber: String(req.body?.taskNumber || '').trim(),
        nomenclature,
        productId:
          req.body?.productId && mongoose.isValidObjectId(req.body.productId)
            ? req.body.productId
            : null,
        quantity,
        unitOfMeasure: String(req.body?.unitOfMeasure || 'шт.').trim() || 'шт.',
        fromWarehouseId: String(fromWh._id),
        fromWarehouseName: fromWh.name,
        toWarehouseId: String(toWh._id),
        toWarehouseName: toWh.name,
        comment: String(req.body?.comment || '').trim(),
      });

      const recipients = await findWarehouseStaffLogins(User, fromWh.region);
      await notifyTransferEvent(notifyDeps, doc.toObject(), 'warehouse_transfer_requested', recipients);

      res.status(201).json(doc);
    } catch (error) {
      console.error('[warehouse-transfer] POST:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/warehouse-transfer-requests', authenticateToken, async (req, res) => {
    try {
      const mine = ['1', 'true', 'yes'].includes(String(req.query.mine || '').toLowerCase());
      const inbox = ['1', 'true', 'yes'].includes(String(req.query.inbox || '').toLowerCase());

      if (mine) {
        const login = String(req.user.login || '').trim();
        const list = await WarehouseTransferRequest.find({ requesterLogin: login })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean();
        return res.json(list);
      }

      if (inbox) {
        if (!canProcessTransferInbox(req.user)) {
          return res.status(403).json({ error: 'Немає доступу до вхідних запитів' });
        }
        const dbUser = await User.findOne({ login: req.user.login }).select('region').lean();
        const userRegion = String(dbUser?.region || req.user.region || '').trim();
        const whFilter = { isActive: { $ne: false } };
        if (!isNationalRegion(userRegion)) {
          whFilter.region = { $regex: new RegExp(`^${escapeRegExp(userRegion)}$`, 'i') };
        }
        const regionalWarehouses = await Warehouse.find(whFilter).select('name').lean();
        const names = regionalWarehouses.map((w) => w.name).filter(Boolean);
        const list = await WarehouseTransferRequest.find({
          status: 'pending',
          fromWarehouseName: { $in: names },
        })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean();
        return res.json(list);
      }

      if (!['admin', 'administrator'].includes(String(req.user.role || '').toLowerCase())) {
        return res.status(403).json({ error: 'Немає доступу' });
      }
      const list = await WarehouseTransferRequest.find({})
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      return res.json(list);
    } catch (error) {
      console.error('[warehouse-transfer] GET:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/warehouse-transfer-requests/:id/approve', authenticateToken, async (req, res) => {
    try {
      if (!canProcessTransferInbox(req.user)) {
        return res.status(403).json({ error: 'Немає прав на підтвердження' });
      }
      const doc = await WarehouseTransferRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Запит не знайдено' });
      if (doc.status !== 'pending') {
        return res.status(400).json({ error: 'Запит уже оброблено' });
      }

      doc.status = 'approved';
      doc.sourceApproverLogin = String(req.user.login || '').trim();
      doc.sourceApproverName = String(req.user.name || '').trim();
      doc.sourceApprovedAt = new Date();
      await doc.save();

      const tr = doc.toObject();
      const notifyLogins = [tr.requesterLogin].filter(Boolean);
      const toWh = await Warehouse.findById(tr.toWarehouseId).select('region').lean();
      const destStaff = await findWarehouseStaffLogins(User, toWh?.region);
      for (const l of destStaff) {
        if (!notifyLogins.includes(l)) notifyLogins.push(l);
      }

      await notifyTransferEvent(notifyDeps, tr, 'warehouse_transfer_approved', notifyLogins);
      res.json(tr);
    } catch (error) {
      console.error('[warehouse-transfer] approve:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/warehouse-transfer-requests/:id/reject', authenticateToken, async (req, res) => {
    try {
      if (!canProcessTransferInbox(req.user)) {
        return res.status(403).json({ error: 'Немає прав на відхилення' });
      }
      const reason = String(req.body?.reason || req.body?.comment || '').trim();
      if (!reason) return res.status(400).json({ error: 'Вкажіть причину відмови' });

      const doc = await WarehouseTransferRequest.findById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Запит не знайдено' });
      if (doc.status !== 'pending') {
        return res.status(400).json({ error: 'Запит уже оброблено' });
      }

      doc.status = 'rejected';
      doc.sourceRejectReason = reason;
      doc.rejectedAt = new Date();
      doc.sourceApproverLogin = String(req.user.login || '').trim();
      doc.sourceApproverName = String(req.user.name || '').trim();
      await doc.save();

      const tr = doc.toObject();
      await notifyTransferEvent(
        notifyDeps,
        tr,
        'warehouse_transfer_rejected',
        [tr.requesterLogin].filter(Boolean),
      );
      res.json(tr);
    } catch (error) {
      console.error('[warehouse-transfer] reject:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = {
  WarehouseTransferRequest,
  registerWarehouseTransferRoutes,
};
