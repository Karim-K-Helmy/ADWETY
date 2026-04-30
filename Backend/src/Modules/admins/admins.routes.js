const router = require('express').Router();
const auth = require('../../middleware/auth');
const auditAction = require('../../middleware/audit');
const validate = require('../../middleware/validation');
const controller = require('./admins.controller');
const { listSchema, createSchema, updateSchema, byIdSchema } = require('./admins.validation');
const { authorize } = auth;

router.use(auth, authorize(['owner']));
router.get('/', validate(listSchema), controller.list);
router.post('/', validate(createSchema), auditAction('admin.create'), controller.create);
router.patch('/:id', validate(updateSchema), auditAction('admin.update'), controller.update);
router.delete('/:id', validate(byIdSchema), auditAction('admin.delete'), controller.remove);

module.exports = router;
