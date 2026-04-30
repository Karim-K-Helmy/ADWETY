const router = require('express').Router();
const auth = require('../../middleware/auth');
const auditAction = require('../../middleware/audit');
const validate = require('../../middleware/validation');
const controller = require('./pharmacies.controller');
const { listSchema, byIdSchema, createSchema, updateSchema } = require('./pharmacies.validation');
const { authorize } = auth;
const { dataScrapingLimiter } = require('../../middleware/security');

router.use(auth);
router.get('/', authorize(['owner', 'super_admin', 'pharmacy_admin', 'support_admin']), dataScrapingLimiter, validate(listSchema), controller.list);
router.post('/', authorize(['owner', 'super_admin']), validate(createSchema), auditAction('pharmacy.create'), controller.create);
router.get('/:id', authorize(['owner', 'super_admin', 'pharmacy_admin', 'support_admin']), validate(byIdSchema), controller.getById);
router.put('/:id', authorize(['owner', 'super_admin']), validate(updateSchema), auditAction('pharmacy.update'), controller.update);
router.delete('/:id', authorize(['owner', 'super_admin']), validate(byIdSchema), auditAction('pharmacy.delete'), controller.remove);

module.exports = router;
