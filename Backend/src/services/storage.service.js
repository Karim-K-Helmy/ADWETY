const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const env = require('../config/env');
const { AppError } = require('../utils/error-handling');

function ensureUploadDir() {
  const fullPath = path.resolve(process.cwd(), env.uploadDir);
  fs.mkdirSync(fullPath, { recursive: true, mode: 0o700 });
  return fullPath;
}

function safeExtension(originalName = 'upload.bin') {
  const ext = path.extname(originalName).toLowerCase();
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
  if (!allowed.has(ext)) throw new AppError('Invalid file extension', 415);
  return ext;
}

function saveBuffer(buffer, originalName = 'upload.bin') {
  const uploadDir = ensureUploadDir();
  const fileName = `${randomUUID()}${safeExtension(originalName)}`;
  const fullPath = path.join(uploadDir, fileName);
  const resolvedPath = path.resolve(fullPath);
  const resolvedUploadDir = path.resolve(uploadDir);
  if (!resolvedPath.startsWith(`${resolvedUploadDir}${path.sep}`)) {
    throw new AppError('Invalid upload path', 400);
  }
  fs.writeFileSync(resolvedPath, buffer, { mode: 0o600 });
  return `private://${fileName}`;
}

module.exports = { saveBuffer };
