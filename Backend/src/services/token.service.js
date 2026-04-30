const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const TokenBlacklist = require('../../DB/Models/tokenblacklist.model');

const TOKEN_OPTIONS = {
  algorithm: 'HS256',
  issuer: 'adwety-backend',
  audience: 'adwety-client',
};

function signToken(payload) {
  return jwt.sign(
    { ...payload, jti: crypto.randomBytes(24).toString('hex') },
    env.jwtSecret,
    { ...TOKEN_OPTIONS, expiresIn: env.jwtExpiresIn }
  );
}

function verifyJwtSignature(token) {
  return jwt.verify(token, env.jwtSecret, {
    algorithms: ['HS256'],
    issuer: TOKEN_OPTIONS.issuer,
    audience: TOKEN_OPTIONS.audience,
  });
}

async function verifyToken(token) {
  const payload = verifyJwtSignature(token);
  if (!payload?.jti) throw new Error('Token is missing jti');
  const revoked = await TokenBlacklist.exists({ jti: payload.jti });
  if (revoked) throw new Error('Token has been revoked');
  return payload;
}

async function revokeToken(token, reason = 'logout') {
  if (!token) return false;
  let payload;
  try {
    payload = verifyJwtSignature(token);
  } catch (_error) {
    return false;
  }

  if (!payload?.jti || !payload?.exp) return false;
  const expiresAt = new Date(payload.exp * 1000);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return false;

  await TokenBlacklist.updateOne(
    { jti: payload.jti },
    {
      $setOnInsert: {
        jti: payload.jti,
        subject: String(payload.sub || ''),
        tokenType: String(payload.type || ''),
        reason,
        expiresAt,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
  return true;
}

module.exports = { signToken, verifyToken, revokeToken };
