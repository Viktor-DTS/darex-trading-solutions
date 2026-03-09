/**
 * Equipment model stub для CRM
 * Якщо у вашому backend вже є модель Equipment — видаліть цей файл
 * і оновіть шлях у routes/sales.js
 *
 * Ця схема мінімальна: дозволяє оновлювати поля при продажу.
 */
const mongoose = require('mongoose');

const EquipmentSchema = new mongoose.Schema({
  type: String,
  serialNumber: String,
  status: {
    type: String,
    enum: ['in_stock', 'reserved', 'testing', 'shipped', 'in_transit', 'written_off', 'deleted', 'sold'],
    default: 'in_stock'
  },
  currentWarehouse: String,
  currentWarehouseName: String,
  saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },
  soldDate: Date,
  soldToClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  saleAmount: Number,
  warrantyUntil: Date,
  warrantyMonths: Number,
  isDeleted: { type: Boolean, default: false }
}, { strict: false, collection: 'equipment' });

module.exports = mongoose.model('Equipment', EquipmentSchema);
