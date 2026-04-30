const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const checks = [
  { file: 'src/Modules/auth/auth.service.js', mustInclude: 'Admin.findOne({ email })', name: 'register checks admin email conflicts' },
  { file: 'src/Modules/auth/auth.service.js', mustInclude: 'findOneAndUpdate(', name: 'OTP attempts are atomic' },
  { file: 'src/Modules/auth/auth.service.js', mustInclude: 'OtpChallenge.deleteMany({ accountId: account._id, consumedAt: null })', name: 'password reset clears outstanding OTP challenges' },
  { file: 'src/middleware/auth.js', mustInclude: 'passwordChangedAt', name: 'JWT invalidated after password reset' },
  { file: 'src/middleware/auth.js', mustInclude: 'await verifyToken(token)', name: 'JWT blacklist is checked during authentication' },
  { file: 'src/services/token.service.js', mustInclude: 'TokenBlacklist.exists', name: 'revoked JWTs are rejected' },
  { file: 'src/Modules/auth/auth.controller.js', mustInclude: 'revokeToken(token', name: 'logout revokes the current JWT' },
  { file: 'src/config/env.js', mustInclude: 'OTP_HASH_SECRET must be set in production', name: 'production requires independent OTP hash secret' },
  { file: 'src/config/env.js', mustInclude: 'COOKIE_SECURE must be true in production', name: 'production enforces secure cookies' },
  { file: 'src/middleware/security.js', mustInclude: 'csrfProtection', name: 'CSRF protection middleware exists' },
  { file: 'src/middleware/security.js', mustInclude: 'RateLimit.findOneAndUpdate', name: 'rate limiter persists in MongoDB' },
  { file: 'src/middleware/upload.js', mustInclude: 'assertPdfHasNoActiveContent', name: 'PDF active-content upload guard exists' },
  { file: 'src/middleware/upload.js', mustInclude: 'detectMimeFromMagicBytes', name: 'upload magic-byte validation exists' },
  { file: 'DB/Models/tokenblacklist.model.js', mustInclude: 'expireAfterSeconds', name: 'token blacklist uses TTL expiry' },
  { file: 'src/Modules/notifications/notifications.service.js', mustNotInclude: 'mona@adwety.app', name: 'notifications do not fallback to demo user' },
  { file: 'src/Modules/profile/profile.service.js', mustNotInclude: 'mona@adwety.app', name: 'profile does not fallback to demo user' },
];

let failed = 0;
for (const check of checks) {
  const content = fs.readFileSync(path.join(root, check.file), 'utf8');
  const okInclude = !check.mustInclude || content.includes(check.mustInclude);
  const okExclude = !check.mustNotInclude || !content.includes(check.mustNotInclude);
  const ok = okInclude && okExclude;
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + check.name);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log('Security static checks passed.');
