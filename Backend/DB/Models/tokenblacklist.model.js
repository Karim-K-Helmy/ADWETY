const { mongoose, withJsonTransform } = require('./base.model');

const schema = withJsonTransform(new mongoose.Schema({
  jti: { type: String, required: true, unique: true, index: true },
  subject: { type: String, default: '' },
  tokenType: { type: String, default: '' },
  reason: { type: String, default: 'logout' },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
}));

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TokenBlacklist', schema);
