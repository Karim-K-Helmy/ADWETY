const router = require('express').Router();
const auth = require('../../middleware/auth');
const auditAction = require('../../middleware/audit');
const validate = require('../../middleware/validation');
const controller = require('./approval-requests.controller');
const { listSchema, actionSchema, rejectSchema } = require('./approval-requests.validation');
const { authorize } = auth;

router.use(auth, authorize(['owner']));
router.get('/', validate(listSchema), controller.list);
router.patch('/:id/approve', validate(actionSchema), auditAction('approval_request.approve'), controller.approve);
router.patch('/:id/reject', validate(rejectSchema), auditAction('approval_request.reject'), controller.reject);

module.exports = router;
