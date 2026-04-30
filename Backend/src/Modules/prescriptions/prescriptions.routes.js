const router = require('express').Router();
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validation');
const upload = require('../../middleware/upload');
const { uploadLimiter, scanUserLimiter } = require('../../middleware/security');
const auditAction = require('../../middleware/audit');
const controller = require('./prescriptions.controller');
const { scanSchema } = require('./prescriptions.validation');

router.post('/scan', auth, uploadLimiter, scanUserLimiter, ...upload.secureSingle('prescription_image'), validate(scanSchema), auditAction('prescription.scan'), controller.scan);
router.post('/scan-auth', auth, uploadLimiter, scanUserLimiter, ...upload.secureSingle('prescription_image'), validate(scanSchema), auditAction('prescription.scan'), controller.scan);

module.exports = router;
