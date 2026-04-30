const { mongoose, withJsonTransform } = require('./base.model');
const schema = withJsonTransform(new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  phoneNumber: { type: String, trim: true, default: '' },
  role: { type: String, enum: ['owner', 'super_admin', 'pharmacy_admin', 'support_admin', 'user'], default: 'support_admin' },
  pharmacyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy', default: null },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: true },
  isPhoneVerified: { type: Boolean, default: false },
  lastLoginAt: { type: Date, default: null },
  passwordChangedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}));
schema.virtual('id').get(function () { return this._id.toString(); });
module.exports = mongoose.model('Admin', schema);
