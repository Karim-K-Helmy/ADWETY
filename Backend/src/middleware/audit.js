const AuditLog = require('../../DB/Models/auditlog.model');

function auditAction(action) {
  return (req, res, next) => {
    res.on('finish', () => {
      const shouldLog = res.statusCode < 400 || [401, 403, 404, 429].includes(res.statusCode);
      if (!shouldLog) return;
      AuditLog.create({
        actorId: req.authUser?._id || null,
        actorType: req.authMeta?.type || 'unknown',
        actorRole: req.authRole || 'unknown',
        action,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        ip: req.ip || req.socket.remoteAddress || '',
        success: res.statusCode < 400,
        userAgent: req.headers['user-agent'] || '',
      }).catch(() => {});
    });
    next();
  };
}

module.exports = auditAction;
