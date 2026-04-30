const router = require('express').Router();
const auth = require('../../middleware/auth');
const controller = require('./notifications.controller');
const { notificationPollingLimiter } = require('../../middleware/security');

router.use(auth);
router.get('/', notificationPollingLimiter, controller.list);

module.exports = router;
