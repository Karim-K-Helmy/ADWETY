const User = require('../../../DB/Models/user.model');
const Admin = require('../../../DB/Models/admin.model');
const { AppError } = require('../../utils/error-handling');
const { sanitizeEmail } = require('../../utils/security');
const { createOtpChallenge, consumeOtpChallenge, findAccountByEmail } = require('../auth/auth.service');

function accountMeta(authUser = null, authMeta = null) {
  const isAdmin = authMeta?.type === 'admin' || authUser?.constructor?.modelName === 'Admin';
  return {
    isAdmin,
    model: isAdmin ? Admin : User,
    accountType: isAdmin ? 'admin' : 'user',
    role: isAdmin ? (authUser?.role || 'support_admin') : 'user',
  };
}

function serializeProfile(account, meta) {
  return {
    id: account._id.toString(),
    name: account.fullName,
    email: account.email,
    phone_number: account.phoneNumber || '',
    role: meta.role,
    account_type: meta.accountType,
    email_verified: Boolean(account.isEmailVerified),
    phone_verified: Boolean(account.isPhoneVerified),
  };
}

async function getFreshAccount(authUser = null, authMeta = null) {
  if (!authUser) throw new AppError('Authentication required', 401);
  const meta = accountMeta(authUser, authMeta);
  const account = authUser._id ? await meta.model.findById(authUser._id) : authUser;
  if (!account) throw new AppError('Account not found', 404);
  return { account, meta };
}

async function getProfile(authUser = null, authMeta = null) {
  const { account, meta } = await getFreshAccount(authUser, authMeta);
  return serializeProfile(account, meta);
}

async function updateProfile(authUser = null, authMeta = null, payload = {}) {
  const { account, meta } = await getFreshAccount(authUser, authMeta);
  if (payload.full_name !== undefined) account.fullName = payload.full_name;
  if (payload.phone_number !== undefined) {
    account.phoneNumber = payload.phone_number || '';
    account.isPhoneVerified = false;
  }
  await account.save();
  return serializeProfile(account, meta);
}

async function requestEmailUpdate(authUser = null, authMeta = null, payload = {}) {
  const { account, meta } = await getFreshAccount(authUser, authMeta);
  const nextEmail = sanitizeEmail(payload.email);
  if (!nextEmail) throw new AppError('Email is required', 422);
  if (nextEmail === account.email) throw new AppError('This email is already attached to your account', 409);

  const existing = await findAccountByEmail(nextEmail);
  if (existing) throw new AppError('Email cannot be used', 409);

  return createOtpChallenge({
    account,
    accountType: meta.accountType,
    role: meta.role,
    purpose: 'profile_update',
    email: nextEmail,
    metadata: { targetEmail: nextEmail },
  });
}

async function confirmEmailUpdate(authUser = null, authMeta = null, payload = {}) {
  const { account, meta } = await getFreshAccount(authUser, authMeta);
  const challenge = await consumeOtpChallenge({ otpToken: payload.otp_token, otp: payload.otp, purpose: 'profile_update' });
  if (String(challenge.accountId) !== String(account._id) || challenge.accountType !== meta.accountType) {
    throw new AppError('OTP request does not belong to this account', 403);
  }

  const nextEmail = sanitizeEmail(challenge.metadata?.targetEmail || challenge.email);
  if (!nextEmail) throw new AppError('Target email is missing from OTP request', 400);
  const existing = await findAccountByEmail(nextEmail);
  if (existing && String(existing.account._id) !== String(account._id)) throw new AppError('Email cannot be used', 409);

  account.email = nextEmail;
  account.isEmailVerified = true;
  await account.save();
  return serializeProfile(account, meta);
}

module.exports = { getProfile, updateProfile, requestEmailUpdate, confirmEmailUpdate };
