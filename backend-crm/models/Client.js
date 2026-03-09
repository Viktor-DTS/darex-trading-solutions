/**
 * CRM Client model
 * Додати до існуючого backend (Node.js + MongoDB)
 * npm install — не потрібно, використовується mongoose
 */
const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
  edrpou: { type: String, unique: true, sparse: true },
  name: { type: String, required: true },
  address: String,
  contactPerson: String,
  contactPhone: String,
  email: String,
  assignedManagerLogin: { type: String, required: true },
  region: String,
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ClientSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Client', ClientSchema);
