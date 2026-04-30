const { mongoose, withJsonTransform } = require('./base.model');
const schema = withJsonTransform(new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  phoneNumber: { type: String, trim: true },
  profileImage: { type: String, default: null },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  lastLoginAt: { type: Date, default: null },
  passwordChangedAt: { type: Date, default: null },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }));
schema.virtual('id').get(function () { return this._id.toString(); });
module.exports = mongoose.model('User', schema);
