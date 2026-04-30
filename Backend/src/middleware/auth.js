const User = require('../../DB/Models/user.model');
const Admin = require('../../DB/Models/admin.model');
const env = require('../config/env');
const { verifyToken } = require('../services/token.service');
const { AppError } = require('../utils/error-handling');

async function resolveAccount(payload) {
  if (payload.type === 'admin') return Admin.findById(payload.sub);
  if (payload.type === 'user') return User.findById(payload.sub);
  return null;
}

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[env.authCookieName] || '';
}

function assertTokenNotRevoked(payload, account) {
  if (!account.passwordChangedAt || !payload.iat) return;
  const changedAtSeconds = Math.floor(new Date(account.passwordChangedAt).getTime() / 1000);
  if (payload.iat < changedAtSeconds) {
    throw new AppError('Password recently changed. Please log in again.', 401);
  }
}

function deriveRoleFromAccount(payload, account) {
  if (payload.type === 'admin') return account.role;
  if (payload.type === 'user') return 'user';
  return null;
}

async function authenticateRequest(req) {
  const token = readToken(req);
  if (!token) throw new AppError('Unauthorized', 401);

  const payload = await verifyToken(token);
  const account = await resolveAccount(payload);

  if (!account || account.isActive === false) throw new AppError('Unauthorized', 401);
  assertTokenNotRevoked(payload, account);

  const role = deriveRoleFromAccount(payload, account);
  if (!role) throw new AppError('Unauthorized', 401);

  req.authUser = account;
  req.authMeta = { sub: payload.sub, type: payload.type, iat: payload.iat, exp: payload.exp };
  req.authRole = role;
}

async function auth(req, _res, next) {
  try {
    await authenticateRequest(req);
    return next();
  } catch (_error) {
    return next(new AppError('Unauthorized', 401));
  }
}

async function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    await authenticateRequest(req);
    return next();
  } catch (_error) {
    return next(new AppError('Unauthorized', 401));
  }
}

function authorize(...allowedRoles) {
  const flatRoles = allowedRoles.flat();
  return (req, _res, next) => {
    const role = req.authRole;
    if (!role || !flatRoles.includes(role)) {
      return next(new AppError('Forbidden: insufficient permissions', 403));
    }
    return next();
  };
}

auth.optionalAuth = optionalAuth;
auth.authorize = authorize;
module.exports = auth;
