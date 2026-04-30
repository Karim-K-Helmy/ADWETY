const asyncHandler = require('../../utils/async-handler');
const success = require('../../utils/response');
const service = require('./medicines.service');

exports.list = asyncHandler(async (req, res) => success(res, await service.listMedicines(req.validated.query, req.authUser?._id || null, req.authUser, req.authMeta), 'Medicines fetched successfully'));
exports.getById = asyncHandler(async (req, res) => success(res, await service.getMedicineById(req.validated.params.id, req.authUser, req.authMeta), 'Medicine details fetched successfully'));
exports.create = asyncHandler(async (req, res) => success(res, await service.createMedicine(req.validated.body, req.authUser, req.authMeta), 'Medicine created successfully', 201));
exports.update = asyncHandler(async (req, res) => success(res, await service.updateMedicine(req.validated.params.id, req.validated.body, req.authUser, req.authMeta), 'Medicine updated successfully'));
exports.remove = asyncHandler(async (req, res) => success(res, await service.deleteMedicine(req.validated.params.id, req.validated.query, req.authUser, req.authMeta), 'Medicine deleted successfully'));
