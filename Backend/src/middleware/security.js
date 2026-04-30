const crypto = require('crypto');
const RateLimit = require('../../DB/Models/ratelimit.model');
const env = require('../config/env');
const { AppError } = require('../utils/error-handling');
const { sanitizeRequestObject, sanitizeEmail } = require('../utils/security');

const unsafeCookieKeys = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === 'object') sanitizeRequestObject(req.body);
  if (req.query && typeof req.query === 'object') sanitizeRequestObject(req.query);
  if (req.params && typeof req.params === 'object') sanitizeRequestObject(req.params);
  next();
}

function corsOptions() {
  return {
    origin(origin, callback) {
      if (!origin) {
        if (env.allowNoOriginRequests) return callback(null, true);
        return callback(new AppError('CORS blocked: missing Origin header', 403));
      }
      if (env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new AppError('CORS blocked: origin is not allowed', 403));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-CSRF-Token'],
  };
}

function parseCookies(req, _res, next) {
  const header = req.headers.cookie || '';
  req.cookies = Object.create(null);
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key || unsafeCookieKeys.has(key)) return;
    try { req.cookies[key] = decodeURIComponent(value); } catch (_) { req.cookies[key] = value; }
  });
  next();
}

function signCsrfToken(randomPart, authToken) {
  return crypto.createHmac('sha256', env.jwtSecret).update(`${authToken}:${randomPart}`).digest('hex');
}

function makeCsrfToken(authToken) {
  const randomPart = crypto.randomBytes(32).toString('hex');
  return `${randomPart}.${signCsrfToken(randomPart, authToken)}`;
}

function isValidCsrfToken(csrfToken, authToken) {
  const [randomPart = '', signature = ''] = String(csrfToken || '').split('.');
  if (!randomPart || !signature || !authToken) return false;
  return safeTokenEqual(signature, signCsrfToken(randomPart, authToken));
}

function cookieOptions({ httpOnly }) {
  return {
    httpOnly,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    maxAge: env.jwtCookieMaxAgeMs,
    path: '/',
  };
}

function setAuthCookies(res, token) {
  const csrfToken = makeCsrfToken(token);
  res.cookie(env.authCookieName, token, cookieOptions({ httpOnly: true }));
  res.cookie(env.csrfCookieName, csrfToken, cookieOptions({ httpOnly: false }));
  return csrfToken;
}

function clearAuthCookies(res) {
  const options = { secure: env.cookieSecure, sameSite: env.cookieSameSite, path: '/' };
  res.clearCookie(env.authCookieName, options);
  res.clearCookie(env.csrfCookieName, options);
}

function safeTokenEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''), 'utf8');
  const right = Buffer.from(String(rightValue || ''), 'utf8');
  if (!left.length || !right.length) return false;
  const key = crypto.randomBytes(32);
  const leftDigest = crypto.createHmac('sha256', key).update(left).digest();
  const rightDigest = crypto.createHmac('sha256', key).update(right).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

const csrfExemptPublicAuthPaths = new Set([
  '/api/v1/auth/register',
  '/api/v1/auth/register/verify-otp',
  '/api/v1/auth/login',
  '/api/v1/auth/login/verify-otp',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
]);

function normalizeRequestPath(req) {
  const path = String(req.path || req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
  return path || '/';
}

function isPublicAuthCsrfExempt(req) {
  return csrfExemptPublicAuthPaths.has(normalizeRequestPath(req));
}

function csrfProtection(req, _res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  // Public auth bootstrap endpoints must remain usable when a browser still has
  // stale auth cookies from an older build/session. They are protected by CORS,
  // JSON-only requests, rate limiting, generic errors, and OTP where applicable.
  // Authenticated state-changing endpoints still require CSRF.
  if (isPublicAuthCsrfExempt(req)) return next();

  const hasCookieAuth = Boolean(req.cookies?.[env.authCookieName]);
  const hasBearerAuth = Boolean((req.headers.authorization || '').startsWith('Bearer '));
  if (!hasCookieAuth && !hasBearerAuth) return next();

  const cookieToken = req.cookies?.[env.csrfCookieName];
  const headerToken = req.headers['x-csrf-token'];
  const authToken = req.cookies?.[env.authCookieName] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeTokenEqual(cookieToken, headerToken) || !isValidCsrfToken(cookieToken, authToken)) {
    return next(new AppError('CSRF token validation failed', 403));
  }
  return next();
}


function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function getRateLimitKey(req) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${ip}:${req.method}:${req.originalUrl.split('?')[0]}`.slice(0, 500);
}

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests', keyGenerator = null } = {}) {
  return async (req, _res, next) => {
    try {
      const now = new Date();
      const resetAt = new Date(Date.now() + windowMs);
      const key = String(keyGenerator ? keyGenerator(req) : getRateLimitKey(req)).slice(0, 500);

      await RateLimit.deleteMany({ resetAt: { $lte: now } }).catch(() => {});
      const record = await RateLimit.findOneAndUpdate(
        { key, resetAt: { $gt: now } },
        { $inc: { count: 1 }, $setOnInsert: { key, resetAt, createdAt: now }, $set: { updatedAt: now } },
        { new: true, upsert: true }
      ).lean();

      if (record.count > max) return next(new AppError(message, 429));
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function createEmailRateLimiter({ windowMs = 60 * 60 * 1000, max = 5, message = 'Too many OTP requests for this email. Please try again later.' } = {}) {
  return async (req, _res, next) => {
    try {
      const email = sanitizeEmail(req.body?.email || '');
      if (!email) return next();
      const now = new Date();
      const resetAt = new Date(Date.now() + windowMs);
      const key = `email:${hashValue(email)}:${req.originalUrl.split('?')[0]}`.slice(0, 500);

      await RateLimit.deleteMany({ resetAt: { $lte: now } }).catch(() => {});
      const record = await RateLimit.findOneAndUpdate(
        { key, resetAt: { $gt: now } },
        { $inc: { count: 1 }, $setOnInsert: { key, resetAt, createdAt: now }, $set: { updatedAt: now } },
        { new: true, upsert: true }
      ).lean();

      if (record.count > max) return next(new AppError(message, 429));
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const apiLimiter = createRateLimiter({ max: 240, windowMs: 15 * 60 * 1000 });
const authLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000, message: 'Too many login attempts. Please try again later.' });
const uploadLimiter = createRateLimiter({ max: 30, windowMs: 15 * 60 * 1000, message: 'Too many upload requests. Please try again later.' });
const dataScrapingLimiter = createRateLimiter({ max: 30, windowMs: 60 * 1000, message: 'Too many data requests. Please slow down.' });
const notificationPollingLimiter = createRateLimiter({
  max: 15,
  windowMs: 60 * 1000,
  message: 'Too many notification requests. Please slow down.',
  keyGenerator: (req) => `notifications:${req.authUser?._id || req.ip || 'anonymous'}`,
});
const otpEmailLimiter = createEmailRateLimiter({ max: 3, windowMs: 60 * 60 * 1000 });
const authEmailLimiter = createEmailRateLimiter({ max: 5, windowMs: 15 * 60 * 1000, message: 'Too many attempts for this account. Please try again later.' });
const scanUserLimiter = createRateLimiter({
  max: 10,
  windowMs: 60 * 60 * 1000,
  message: 'Prescription scan limit exceeded. Please try again later.',
  keyGenerator: (req) => `scan:${req.authUser?._id || req.ip || 'anonymous'}`,
});

module.exports = {
  sanitizeRequest,
  corsOptions,
  parseCookies,
  csrfProtection,
  setAuthCookies,
  clearAuthCookies,
  createRateLimiter,
  createEmailRateLimiter,
  apiLimiter,
  authLimiter,
  uploadLimiter,
  dataScrapingLimiter,
  notificationPollingLimiter,
  otpEmailLimiter,
  authEmailLimiter,
  scanUserLimiter,
};
