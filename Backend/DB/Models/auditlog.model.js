const { mongoose, withJsonTransform } = require('./base.model');

const schema = withJsonTransform(new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  actorType: { type: String, default: 'unknown' },
  actorRole: { type: String, default: 'unknown' },
  action: { type: String, required: true, trim: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  statusCode: { type: Number, default: 0 },
  ip: { type: String, default: '' },
  success: { type: Boolean, default: true },
  userAgent: { type: String, default: '', trim: true },
  createdAt: { type: Date, default: Date.now },
}));

schema.virtual('id').get(function () { return this._id.toString(); });
module.exports = mongoose.model('AuditLog', schema);
