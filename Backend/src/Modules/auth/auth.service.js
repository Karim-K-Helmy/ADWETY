const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../../../DB/Models/user.model');
const Admin = require('../../../DB/Models/admin.model');
const OtpChallenge = require('../../../DB/Models/otp.model');
const env = require('../../config/env');
const { signToken } = require('../../services/token.service');
const { sendOtp } = require('../../services/email.service');
const { AppError } = require('../../utils/error-handling');
const { sanitizeEmail } = require('../../utils/security');

const PASSWORD_MAX_BYTES = 72;
const PASSWORD_RESET_GENERIC_RESPONSE = {
  queued: true,
  message: 'If this account exists, an OTP will be sent to the registered email.',
};
const REGISTER_GENERIC_RESPONSE = {
  queued: true,
  message: 'If this email can be registered, verification instructions will be sent.',
};
const DUMMY_PASSWORD_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeOZ6BYWYHEmx5sBNj0wf48MhLDAUfKHCi';

function hashValue(value) {
  return crypto.createHmac('sha256', env.otpHashSecret).update(String(value)).digest('hex');
}

function assertPasswordLength(password) {
  if (Buffer.byteLength(String(password || ''), 'utf8') > PASSWORD_MAX_BYTES) {
    throw new AppError('Password is too long. Maximum length is 72 bytes.', 400);
  }
}

function secureCompare(a, b) {
  const key = crypto.randomBytes(32);
  const left = crypto.createHmac('sha256', key).update(String(a || '')).digest();
  const right = crypto.createHmac('sha256', key).update(String(b || '')).digest();
  return crypto.timingSafeEqual(left, right);
}

function generateOtp() {
  const length = Math.max(4, Math.min(env.otpLength, 10));
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

function generateChallengeToken() {
  return crypto.randomBytes(32).toString('hex');
}

function serializeAccount(account, { token = null, role = 'user', accountType = 'user' } = {}) {
  return {
    id: account._id.toString(),
    name: account.fullName,
    email: account.email,
    phone_number: account.phoneNumber || '',
    role,
    account_type: accountType,
    email_verified: Boolean(account.isEmailVerified),
    phone_verified: Boolean(account.isPhoneVerified),
    token,
  };
}

async function findAccountByEmail(email) {
  const sanitized = sanitizeEmail(email);
  const [user, admin] = await Promise.all([
    User.findOne({ email: sanitized }).select('+passwordHash'),
    Admin.findOne({ email: sanitized }).select('+passwordHash'),
  ]);

  if (user && admin) {
    throw new AppError('Account conflict detected. Please contact support.', 409);
  }

  if (admin) return { account: admin, accountType: 'admin', role: admin.role, model: Admin };
  if (user) return { account: user, accountType: 'user', role: 'user', model: User };

  return null;
}

async function createOtpChallenge({ account, accountType, role, purpose, email = null, phoneNumber = null, metadata = {} }) {
  const otp = generateOtp();
  const challengeToken = generateChallengeToken();
  const destinationEmail = sanitizeEmail(email || account.email || '');
  const destinationPhone = phoneNumber ?? account.phoneNumber ?? '';
  const expiresAt = new Date(Date.now() + env.otpExpiresMinutes * 60 * 1000);

  if (!destinationEmail && env.otpDeliveryChannel !== 'sms') {
    throw new AppError('OTP email destination is missing.', 422);
  }

  await OtpChallenge.deleteMany({
    accountId: account._id,
    accountType,
    purpose,
    consumedAt: null,
  });

  const challenge = await OtpChallenge.create({
    email: destinationEmail,
    phoneNumber: destinationPhone || '',
    accountType,
    accountId: account._id,
    role,
    purpose,
    otpHash: hashValue(otp),
    tokenHash: hashValue(challengeToken),
    expiresAt,
    maxAttempts: env.otpMaxAttempts,
    metadata,
  });

  try {
    const delivery = await sendOtp({
      email: destinationEmail,
      phoneNumber: destinationPhone || '',
      otp,
      purpose,
    });

    return {
      requires_otp: true,
      otp_token: challengeToken,
      expires_in_minutes: env.otpExpiresMinutes,
      delivery,
    };
  } catch (error) {
    await OtpChallenge.findByIdAndDelete(challenge._id).catch(() => {});
    throw error;
  }
}

function buildOtpSelector({ otpToken, email, purpose }) {
  const base = {
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
    $expr: { $lt: ['$attempts', '$maxAttempts'] },
  };

  if (otpToken) return { ...base, tokenHash: hashValue(otpToken) };

  const sanitizedEmail = sanitizeEmail(email);
  if (!sanitizedEmail) return null;
  return { ...base, email: sanitizedEmail };
}

async function findChallengeForOtp({ otpToken, email, purpose }) {
  const selector = buildOtpSelector({ otpToken, email, purpose });
  if (!selector) return null;

  return OtpChallenge.findOneAndUpdate(
    selector,
    { $inc: { attempts: 1 } },
    { new: true, sort: { createdAt: -1 } }
  );
}

async function consumeOtpChallenge({ otpToken = null, email = null, otp, purpose }) {
  if ((!otpToken && !email) || !otp) throw new AppError('OTP request identifier and code are required', 422);
  const challenge = await findChallengeForOtp({ otpToken, email, purpose });

  if (!challenge) throw new AppError('Invalid or expired OTP request', 400);

  const matches = secureCompare(hashValue(otp), challenge.otpHash);
  if (!matches) throw new AppError('Invalid OTP code', 400);

  const consumed = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );

  if (!consumed) throw new AppError('OTP request was already used', 400);
  return consumed;
}

async function registerUser(payload) {
  assertPasswordLength(payload.password);
  const email = sanitizeEmail(payload.email);
  const [userExists, adminExists] = await Promise.all([User.findOne({ email }), Admin.findOne({ email })]);
  if (userExists || adminExists) {
    await bcrypt.compare(payload.password, DUMMY_PASSWORD_HASH).catch(() => {});
    return REGISTER_GENERIC_RESPONSE;
  }

  const passwordHash = await bcrypt.hash(payload.password, env.bcryptSaltRounds);
  const user = await User.create({
    fullName: payload.full_name,
    email,
    passwordHash,
    phoneNumber: payload.phone_number || '',
    isActive: !env.requireRegisterOtp,
    isEmailVerified: !env.requireRegisterOtp,
  });

  if (env.requireRegisterOtp) {
    try {
      return await createOtpChallenge({ account: user, accountType: 'user', role: 'user', purpose: 'register' });
    } catch (error) {
      await User.findByIdAndDelete(user._id).catch(() => {});
      throw error;
    }
  }

  const token = signToken({ sub: user._id.toString(), type: 'user', role: 'user' });
  return serializeAccount(user, { token, role: 'user', accountType: 'user' });
}

async function verifyRegisterOtp(payload) {
  const challenge = await consumeOtpChallenge({ otpToken: payload.otp_token, otp: payload.otp, purpose: 'register' });
  const user = await User.findById(challenge.accountId);
  if (!user) throw new AppError('Account not found', 404);

  user.isActive = true;
  user.isEmailVerified = true;
  if (user.phoneNumber) user.isPhoneVerified = env.otpDeliveryChannel === 'sms';
  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken({ sub: user._id.toString(), type: 'user', role: 'user' });
  return serializeAccount(user, { token, role: 'user', accountType: 'user' });
}

async function loginUser(payload) {
  assertPasswordLength(payload.password);
  const email = sanitizeEmail(payload.email);
  const invalid = new AppError('Invalid email or password', 401);
  const found = await findAccountByEmail(email);

  if (!found) {
    await bcrypt.compare(payload.password, DUMMY_PASSWORD_HASH).catch(() => {});
    throw invalid;
  }

  const { account, accountType, role } = found;
  const ok = await bcrypt.compare(payload.password, account.passwordHash);
  if (!ok || account.isActive === false) throw invalid;

  if (env.requireLoginOtp) {
    return createOtpChallenge({ account, accountType, role, purpose: 'login' });
  }

  account.lastLoginAt = new Date();
  await account.save();
  const token = signToken({ sub: account._id.toString(), type: accountType, role });
  return serializeAccount(account, { token, role, accountType });
}

async function verifyLoginOtp(payload) {
  const challenge = await consumeOtpChallenge({ otpToken: payload.otp_token, otp: payload.otp, purpose: 'login' });
  const model = challenge.accountType === 'admin' ? Admin : User;
  const account = await model.findById(challenge.accountId);
  if (!account || account.isActive === false) throw new AppError('Account is not available', 403);

  account.lastLoginAt = new Date();
  await account.save();
  const role = challenge.accountType === 'admin' ? account.role : 'user';
  const token = signToken({ sub: account._id.toString(), type: challenge.accountType, role });
  return serializeAccount(account, { token, role, accountType: challenge.accountType });
}

async function forgotPassword(payload) {
  const email = sanitizeEmail(payload.email);
  const found = await findAccountByEmail(email);
  if (!found) return PASSWORD_RESET_GENERIC_RESPONSE;

  await createOtpChallenge({
    account: found.account,
    accountType: found.accountType,
    role: found.role,
    purpose: 'password_reset',
  });

  return PASSWORD_RESET_GENERIC_RESPONSE;
}

async function resetPassword(payload) {
  assertPasswordLength(payload.new_password);
  const challenge = await consumeOtpChallenge({ otpToken: payload.otp_token, otp: payload.otp, purpose: 'password_reset' });
  const model = challenge.accountType === 'admin' ? Admin : User;
  const account = await model.findById(challenge.accountId);
  if (!account) throw new AppError('Account not found', 404);

  account.passwordHash = await bcrypt.hash(payload.new_password, env.bcryptSaltRounds);
  account.passwordChangedAt = new Date();
  await OtpChallenge.deleteMany({ accountId: account._id, consumedAt: null }).catch(() => {});
  account.isActive = true;
  account.isEmailVerified = true;
  await account.save();

  return { reset: true };
}

module.exports = {
  registerUser,
  verifyRegisterOtp,
  loginUser,
  verifyLoginOtp,
  forgotPassword,
  resetPassword,
  createOtpChallenge,
  consumeOtpChallenge,
  findAccountByEmail,
  serializeAccount,
};
