const router = require('express').Router();
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validation');
const controller = require('./profile.controller');
const { otpEmailLimiter } = require('../../middleware/security');
const { updateProfileSchema, requestEmailUpdateSchema, confirmEmailUpdateSchema } = require('./profile.validation');

router.use(auth);
router.get('/', controller.getProfile);
router.get('/me', controller.getProfile);
router.patch('/', validate(updateProfileSchema), controller.updateProfile);
router.post('/email/request-otp', otpEmailLimiter, validate(requestEmailUpdateSchema), controller.requestEmailUpdate);
router.post('/email/confirm-otp', validate(confirmEmailUpdateSchema), controller.confirmEmailUpdate);

module.exports = router;
