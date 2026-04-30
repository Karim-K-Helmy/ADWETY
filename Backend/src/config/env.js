const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

function loadEnvFiles() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  const loaded = new Set();
  candidates.forEach((filePath) => {
    if (!loaded.has(filePath) && fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false });
      loaded.add(filePath);
    }
  });
}

loadEnvFiles();

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoundedInteger(value, fallback, min, max) {
  const parsed = Math.trunc(parseNumber(value, fallback));
  return Math.min(max, Math.max(min, parsed));
}

function parseDurationMs(value, fallback = '2h') {
  const raw = String(value || fallback).trim().toLowerCase();
  const match = raw.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) return parseDurationMs(fallback, '2h');
  const amount = Number(match[1]);
  const unit = match[2] || 'ms';
  const multipliers = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return amount * multipliers[unit];
}

function normalizeSameSite(value) {
  const raw = clean(value, 'strict').toLowerCase();
  if (['strict', 'lax', 'none'].includes(raw)) return raw;
  return 'strict';
}

function parseOrigins(value) {
  const defaults = ['http://localhost:6501', 'http://127.0.0.1:6501'];
  const raw = value || process.env.FRONTEND_BASE_URL || defaults.join(',');
  return [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))];
}

function clean(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function isWeakSecret(secret) {
  return !secret || secret.length < 64 || ['change-me', 'replace_with_a_long_random_secret', 'secret', 'jwt_secret'].includes(secret) || /^replace_with/i.test(secret);
}

const nodeEnv = clean(process.env.NODE_ENV, 'development');
const providedJwtSecret = clean(process.env.JWT_SECRET);
const providedOtpHashSecret = clean(process.env.OTP_HASH_SECRET);

if (!providedJwtSecret && nodeEnv === 'production') {
  throw new Error('Security error: JWT_SECRET must be set in production. Generate one with: openssl rand -hex 64');
}
if (!providedOtpHashSecret && nodeEnv === 'production') {
  throw new Error('Security error: OTP_HASH_SECRET must be set in production. Generate one with: openssl rand -hex 64');
}

const runtimeJwtSecret = providedJwtSecret || crypto.randomBytes(64).toString('hex');
const runtimeOtpHashSecret = providedOtpHashSecret || runtimeJwtSecret;

const env = {
  nodeEnv,
  port: parseBoundedInteger(process.env.BACKEND_PORT || process.env.PORT, 6500, 1, 65535),
  mongoUri: clean(process.env.MONGODB_URI, 'mongodb://127.0.0.1:27017/adwety_dev'),
  backendBaseUrl: clean(process.env.BACKEND_BASE_URL, 'http://localhost:6500'),
  frontendBaseUrl: clean(process.env.FRONTEND_BASE_URL, 'http://localhost:6501'),
  frontendPublicUrl: clean(process.env.FRONTEND_PUBLIC_URL, 'http://127.0.0.1:6501'),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  allowNoOriginRequests: parseBoolean(process.env.CORS_ALLOW_NO_ORIGIN, false),
  jwtSecret: runtimeJwtSecret,
  jwtExpiresIn: clean(process.env.JWT_EXPIRES_IN, '1h'),
  jwtCookieMaxAgeMs: parseDurationMs(process.env.JWT_EXPIRES_IN, '1h'),
  authCookieName: clean(process.env.AUTH_COOKIE_NAME, 'adwety_auth'),
  csrfCookieName: clean(process.env.CSRF_COOKIE_NAME, 'adwety_csrf'),
  cookieSecure: parseBoolean(process.env.COOKIE_SECURE, ['production', 'staging', 'uat'].includes(nodeEnv)),
  cookieSameSite: normalizeSameSite(process.env.COOKIE_SAME_SITE),
  bcryptSaltRounds: parseBoundedInteger(process.env.BCRYPT_SALT_ROUNDS, 12, 10, 14),
  trustProxy: clean(process.env.TRUST_PROXY, nodeEnv === 'production' ? 'loopback, linklocal, uniquelocal' : 'false'),
  otpHashSecret: runtimeOtpHashSecret,
  uploadDir: clean(process.env.UPLOAD_DIR, 'private_uploads'),
  maxFileSizeMb: parseBoundedInteger(process.env.MAX_FILE_SIZE_MB, 5, 1, 10),
  aiProvider: clean(process.env.AI_PROVIDER, 'gemini').toLowerCase(),
  aiTimeoutMs: parseBoundedInteger(process.env.AI_TIMEOUT_MS, 30000, 1000, 60000),
  aiFallbackEnabled: parseBoolean(process.env.AI_FALLBACK_ENABLED, true),
  allowAiPrescriptionProcessing: parseBoolean(process.env.ALLOW_AI_PRESCRIPTION_PROCESSING, true),
  enableDemoAuth: parseBoolean(process.env.ENABLE_DEMO_AUTH, false),
  geminiApiKey: clean(process.env.GEMINI_API_KEY),
  geminiModel: clean(process.env.GEMINI_MODEL, 'gemini-2.5-flash'),
  geminiBaseUrl: clean(process.env.GEMINI_BASE_URL, 'https://generativelanguage.googleapis.com/v1beta'),
  customAiApiUrl: clean(process.env.CUSTOM_AI_API_URL),
  customAiApiKey: clean(process.env.CUSTOM_AI_API_KEY),
  customAiModel: clean(process.env.CUSTOM_AI_MODEL),
  mailDriver: clean(process.env.MAIL_DRIVER, 'smtp').toLowerCase(),
  mailFromName: clean(process.env.MAIL_FROM_NAME, 'ADWETY'),
  mailFromEmail: clean(process.env.MAIL_FROM_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_USER, 'no-reply@adwety.local'),
  emailFrom: clean(process.env.MAIL_FROM_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_USER, 'no-reply@adwety.local'),
  smtpHost: clean(process.env.SMTP_HOST, 'smtp.gmail.com'),
  smtpPort: parseBoundedInteger(process.env.SMTP_PORT, 465, 1, 65535),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, String(process.env.SMTP_PORT || '465') === '465'),
  smtpUser: clean(process.env.SMTP_USER),
  smtpPass: clean(process.env.SMTP_PASS).replace(/\s+/g, ''),
  smtpRejectUnauthorized: parseBoolean(process.env.SMTP_REJECT_UNAUTHORIZED, true),
  smtpConnectionTimeoutMs: parseBoundedInteger(process.env.SMTP_CONNECTION_TIMEOUT_MS, 20000, 1000, 60000),
  smtpGreetingTimeoutMs: parseBoundedInteger(process.env.SMTP_GREETING_TIMEOUT_MS, 20000, 1000, 60000),
  smtpSocketTimeoutMs: parseBoundedInteger(process.env.SMTP_SOCKET_TIMEOUT_MS, 30000, 1000, 120000),
  showDevOtp: parseBoolean(process.env.SHOW_DEV_OTP, false),
  requireRegisterOtp: parseBoolean(process.env.REQUIRE_REGISTER_OTP, true),
  requireLoginOtp: parseBoolean(process.env.REQUIRE_LOGIN_OTP, true),
  requirePasswordResetOtp: parseBoolean(process.env.REQUIRE_PASSWORD_RESET_OTP, true),
  otpLength: parseBoundedInteger(process.env.OTP_LENGTH, 6, 6, 10),
  otpExpiresMinutes: parseBoundedInteger(process.env.OTP_EXPIRES_MINUTES, 10, 3, 30),
  otpMaxAttempts: parseBoundedInteger(process.env.OTP_MAX_ATTEMPTS, 5, 3, 10),
  otpDeliveryChannel: clean(process.env.OTP_DELIVERY_CHANNEL, 'email').toLowerCase(),
  smsProvider: clean(process.env.SMS_PROVIDER, 'console').toLowerCase(),
  smsFrom: clean(process.env.SMS_FROM, 'ADWETY'),
  seedForceReset: parseBoolean(process.env.SEED_FORCE_RESET, false),
  allowProductionSeed: parseBoolean(process.env.ALLOW_PRODUCTION_SEED, false),
  confirmProductionSeedReset: clean(process.env.CONFIRM_PRODUCTION_SEED_RESET),
  seedOwnerEmail: clean(process.env.SEED_OWNER_EMAIL),
  seedOwnerPassword: clean(process.env.SEED_OWNER_PASSWORD),
  seedSuperAdminEmail: clean(process.env.SEED_SUPER_ADMIN_EMAIL),
  seedSuperAdminPassword: clean(process.env.SEED_SUPER_ADMIN_PASSWORD),
  seedPharmacyAdminEmail: clean(process.env.SEED_PHARMACY_ADMIN_EMAIL),
  seedPharmacyAdminPassword: clean(process.env.SEED_PHARMACY_ADMIN_PASSWORD),
  seedSupportAdminEmail: clean(process.env.SEED_SUPPORT_ADMIN_EMAIL),
  seedSupportAdminPassword: clean(process.env.SEED_SUPPORT_ADMIN_PASSWORD),
  seedDemoUserEmail: clean(process.env.SEED_DEMO_USER_EMAIL),
  seedDemoUserPassword: clean(process.env.SEED_DEMO_USER_PASSWORD),
};

if (!providedJwtSecret) {
  console.warn('[SECURITY WARNING] JWT_SECRET is not set. A random runtime secret was generated for development only. Set JWT_SECRET in Backend/.env for stable sessions.');
}

if (isWeakSecret(env.jwtSecret)) {
  if (env.nodeEnv === 'production') {
    throw new Error('Security error: JWT_SECRET must be at least 64 characters and not a placeholder in production.');
  }
  console.warn('[SECURITY WARNING] JWT_SECRET is shorter than recommended. Generate one with: openssl rand -hex 64');
}

if (env.nodeEnv === 'production' && env.enableDemoAuth) {
  throw new Error('Security error: ENABLE_DEMO_AUTH must be false in production.');
}


if (isWeakSecret(env.otpHashSecret)) {
  if (env.nodeEnv === 'production') {
    throw new Error('Security error: OTP_HASH_SECRET must be at least 64 characters and not a placeholder in production.');
  }
  console.warn('[SECURITY WARNING] OTP_HASH_SECRET is shorter than recommended. Generate one with: openssl rand -hex 64');
}

if (env.nodeEnv === 'production') {
  if (!env.cookieSecure) throw new Error('Security error: COOKIE_SECURE must be true in production.');
  if (env.cookieSameSite === 'none' && !env.cookieSecure) throw new Error('Security error: SameSite=None requires Secure cookies.');
  if (env.allowNoOriginRequests) throw new Error('Security error: CORS_ALLOW_NO_ORIGIN must be false in production.');
  if (env.corsOrigins.some((origin) => origin === '*' || origin.startsWith('http://'))) throw new Error('Security error: CORS_ORIGINS must use explicit HTTPS origins in production.');
  if (['true', '1'].includes(String(env.trustProxy).trim().toLowerCase())) throw new Error('Security error: TRUST_PROXY must be false or a precise trusted proxy/CIDR value, not true/1.');
  if (env.showDevOtp) throw new Error('Security error: SHOW_DEV_OTP must be false in production.');
  if (env.mailDriver === 'console') throw new Error('Security error: MAIL_DRIVER=console is not allowed in production.');
  if (env.otpDeliveryChannel === 'sms' && env.smsProvider === 'console') throw new Error('Security error: Console SMS provider is not allowed in production.');
  if (env.otpMaxAttempts > 5) throw new Error('Security error: OTP_MAX_ATTEMPTS must be 5 or lower in production.');
}

if (env.mailDriver === 'smtp' && env.smtpUser && env.mailFromEmail && env.smtpUser.toLowerCase() !== env.mailFromEmail.toLowerCase() && env.nodeEnv === 'production') {
  console.warn('[MAIL WARNING] MAIL_FROM_EMAIL is different from SMTP_USER. Use an authenticated domain or matching Gmail account to improve inbox delivery.');
}

module.exports = env;
