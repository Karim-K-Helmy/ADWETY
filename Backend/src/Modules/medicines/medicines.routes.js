const router = require('express').Router();
const auth = require('../../middleware/auth');
const auditAction = require('../../middleware/audit');
const validate = require('../../middleware/validation');
const controller = require('./medicines.controller');
const { listSchema, byIdSchema, createSchema, updateSchema } = require('./medicines.validation');
const { authorize } = auth;
const { dataScrapingLimiter } = require('../../middleware/security');

router.use(auth);
router.get('/', authorize(['owner', 'super_admin', 'pharmacy_admin', 'support_admin', 'user']), dataScrapingLimiter, validate(listSchema), controller.list);
router.post('/', authorize(['owner', 'super_admin', 'pharmacy_admin']), validate(createSchema), auditAction('medicine.create'), controller.create);
router.get('/:id', authorize(['owner', 'super_admin', 'pharmacy_admin', 'support_admin', 'user']), validate(byIdSchema), controller.getById);
router.put('/:id', authorize(['owner', 'super_admin', 'pharmacy_admin']), validate(updateSchema), auditAction('medicine.update'), controller.update);
router.delete('/:id', authorize(['owner', 'super_admin']), validate(byIdSchema), auditAction('medicine.delete'), controller.remove);

module.exports = router;
