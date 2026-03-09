/**
 * Clients API routes
 * Підключити: app.use('/api/clients', clientsRouter);
 */
const express = require('express');
const router = express.Router();
const Client = require('../models/Client');

const getClientWithAccessControl = (client, user) => {
  if (!client) return null;
  if (['admin', 'administrator', 'regional', 'regkerivn'].includes(user?.role)) {
    return client;
  }
  if (user?.role === 'manager' && client.assignedManagerLogin === user.login) {
    return client;
  }
  return {
    _id: client._id,
    name: client.name,
    contactPhone: client.contactPhone,
    assignedManagerLogin: client.assignedManagerLogin,
    limited: true,
    message: 'Клієнт закріплений за іншим менеджером'
  };
};

router.get('/', async (req, res) => {
  try {
    const user = req.user;
    let query = {};
    if (user?.role === 'manager') {
      query.assignedManagerLogin = user.login;
    }
    const clients = await Client.find(query).sort({ name: 1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const clients = await Client.find({
      $or: [
        { name: new RegExp(q, 'i') },
        { edrpou: new RegExp(q, 'i') },
        { contactPhone: new RegExp(q, 'i') },
        { contactPerson: new RegExp(q, 'i') }
      ]
    }).limit(20).lean();
    const results = clients.map(c => getClientWithAccessControl(c, req.user));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).lean();
    if (!client) return res.status(404).json({ error: 'Клієнта не знайдено' });
    const result = getClientWithAccessControl(client, req.user);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    if (req.user?.role === 'manager') {
      body.assignedManagerLogin = req.user.login;
    }
    const client = await Client.create(body);
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!client) return res.status(404).json({ error: 'Клієнта не знайдено' });
    res.json(client);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
