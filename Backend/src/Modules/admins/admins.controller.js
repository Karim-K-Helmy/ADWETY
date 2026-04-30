const asyncHandler = require('../../utils/async-handler');
const success = require('../../utils/response');
const service = require('./admins.service');

exports.list = asyncHandler(async (req, res) => success(res, await service.listAdmins(req.validated.query), 'Admins loaded'));
exports.create = asyncHandler(async (req, res) => success(res, await service.createAdmin(req.validated.body), 'Admin created', 201));
exports.update = asyncHandler(async (req, res) => success(res, await service.updateAdmin(req.validated.params.id, req.validated.body, req.authUser._id), 'Admin updated'));
exports.remove = asyncHandler(async (req, res) => success(res, await service.deleteAdmin(req.validated.params.id, req.authUser._id), 'Admin deleted'));
