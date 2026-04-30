const asyncHandler = require('../../utils/async-handler');
const success = require('../../utils/response');
const service = require('./approval-requests.service');

exports.list = asyncHandler(async (req, res) => success(res, await service.listRequests(req.validated.query), 'Approval requests loaded'));
exports.approve = asyncHandler(async (req, res) => success(res, await service.approveRequest(req.validated.params.id, req.authUser._id), 'Request approved'));
exports.reject = asyncHandler(async (req, res) => success(res, await service.rejectRequest(req.validated.params.id, req.authUser._id, req.validated.body.rejection_reason || ''), 'Request rejected'));
