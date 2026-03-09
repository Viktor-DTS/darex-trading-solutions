/**
 * Sales API routes
 * Підключити: app.use('/api/sales', salesRouter);
 * 
 * Потрібно також оновити Equipment model:
 * - status: додати 'sold'
 * - saleId, soldDate, soldToClientId, saleAmount, warrantyUntil, warrantyMonths
 */
const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');

let Equipment;
try {
  Equipment = require('../models/Equipment');
} catch {
  try {
    Equipment = require('../../models/Equipment');
  } catch {
    Equipment = null;
  }
}

router.get('/', async (req, res) => {
  try {
    const { clientId, managerLogin } = req.query;
    let query = {};
    if (req.user?.role === 'manager') {
      query.managerLogin = req.user.login;
    }
    if (clientId) query.clientId = clientId;
    if (managerLogin) query.managerLogin = managerLogin;
    
    const sales = await Sale.find(query)
      .populate('clientId', 'name edrpou contactPhone')
      .populate('equipmentId', 'type serialNumber')
      .sort({ saleDate: -1 });
    
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('clientId')
      .populate('equipmentId');
    if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    if (req.user?.role === 'manager') {
      body.managerLogin = req.user.login;
    }
    const sale = await Sale.create(body);
    
    // Оновити Equipment при confirmed
    if (Equipment && sale.status === 'confirmed' && sale.equipmentId) {
      try {
        await Equipment.findByIdAndUpdate(sale.equipmentId, {
          status: 'sold',
          saleId: sale._id,
          soldDate: sale.saleDate,
          soldToClientId: sale.clientId,
          saleAmount: sale.totalAmount,
          warrantyUntil: sale.warrantyUntil,
          warrantyMonths: sale.warrantyMonths
        });
      } catch (eqErr) {
        console.warn('Equipment update on sale:', eqErr);
      }
    }
    
    res.json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function computeSaleTotals(body) {
  const main = parseFloat(body.mainProductAmount) || 0;
  const addSum = (body.additionalCosts || []).reduce(
    (s, c) => s + (c.amount || 0) * (c.quantity || 1),
    0
  );
  const total = main + addSum;
  let warrantyUntil = null;
  if (body.saleDate && body.warrantyMonths) {
    const d = new Date(body.saleDate);
    d.setMonth(d.getMonth() + parseInt(body.warrantyMonths) || 12);
    warrantyUntil = d;
  }
  return { ...body, totalAmount: total, warrantyUntil };
}

router.put('/:id', async (req, res) => {
  try {
    const body = computeSaleTotals(req.body);
    const sale = await Sale.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    );
    if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
    
    if (Equipment && sale.status === 'confirmed' && sale.equipmentId) {
      try {
        await Equipment.findByIdAndUpdate(sale.equipmentId, {
          status: 'sold',
          saleId: sale._id,
          soldDate: sale.saleDate,
          soldToClientId: sale.clientId,
          saleAmount: sale.totalAmount,
          warrantyUntil: sale.warrantyUntil,
          warrantyMonths: sale.warrantyMonths
        });
      } catch (eqErr) {
        console.warn('Equipment update on sale:', eqErr);
      }
    }
    
    res.json(sale);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Продаж не знайдено' });
    if (sale.status !== 'draft') {
      return res.status(400).json({ error: 'Можна видалити тільки чернетку' });
    }
    await Sale.findByIdAndDelete(req.params.id);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
