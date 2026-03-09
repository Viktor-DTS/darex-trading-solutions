/**
 * CRM Sale model з додатковими витратами
 * Додати до існуючого backend
 */
const mongoose = require('mongoose');

const AdditionalCostSchema = new mongoose.Schema({
  id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  notes: String
}, { _id: false });

const SaleSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  edrpou: { type: String, required: true },
  managerLogin: { type: String, required: true },
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment', required: true },
  mainProductName: String,
  mainProductSerial: String,
  mainProductAmount: { type: Number, required: true },
  additionalCosts: [AdditionalCostSchema],
  saleDate: { type: Date, required: true },
  warrantyMonths: { type: Number, default: 12 },
  warrantyUntil: Date,
  totalAmount: Number,
  status: { type: String, enum: ['draft', 'confirmed'], default: 'confirmed' },
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

SaleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  const addSum = (this.additionalCosts || []).reduce(
    (s, c) => s + (c.amount || 0) * (c.quantity || 1),
    0
  );
  this.totalAmount = (this.mainProductAmount || 0) + addSum;
  if (this.saleDate && this.warrantyMonths) {
    const d = new Date(this.saleDate);
    d.setMonth(d.getMonth() + this.warrantyMonths);
    this.warrantyUntil = d;
  }
  next();
});

module.exports = mongoose.model('Sale', SaleSchema);
