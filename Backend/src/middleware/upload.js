const path = require('path');
const multer = require('multer');
const env = require('../config/env');
const { AppError } = require('../utils/error-handling');

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const mimeExtensions = {
  'image/jpeg': new Set(['.jpg', '.jpeg']),
  'image/png': new Set(['.png']),
  'image/webp': new Set(['.webp']),
  'application/pdf': new Set(['.pdf']),
};

function fileFilter(_req, file, callback) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const declaredMime = String(file.mimetype || '').toLowerCase();

  if (!allowedMimeTypes.has(declaredMime) || !allowedExtensions.has(ext)) {
    return callback(new AppError('Invalid upload type. Only JPG, PNG, WEBP and PDF are allowed.', 415));
  }

  if (!mimeExtensions[declaredMime]?.has(ext)) {
    return callback(new AppError('MIME type and file extension do not match.', 415));
  }

  return callback(null, true);
}

function detectMimeFromMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.slice(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function assertPdfHasNoActiveContent(buffer) {
  const sample = buffer.slice(0, Math.min(buffer.length, 1024 * 1024)).toString('latin1');
  const dangerousTokens = ['/JavaScript\\b', '/JS\\b', '/OpenAction\\b', '/AA\\b', '/Launch\\b', '/EmbeddedFile\\b', '/RichMedia\\b', '/XFA\\b'].map((token) => new RegExp(token, 'i'));
  if (dangerousTokens.some((pattern) => pattern.test(sample))) {
    throw new AppError('PDF files with active content are not allowed.', 415);
  }
}

function validateUploadedFileContent(file) {
  if (!file?.buffer) return;
  const detected = detectMimeFromMagicBytes(file.buffer);
  if (!detected || !allowedMimeTypes.has(detected)) {
    throw new AppError('File content does not match an allowed image/PDF type.', 415);
  }
  if (detected !== String(file.mimetype || '').toLowerCase()) {
    throw new AppError('MIME type mismatch detected.', 415);
  }
  if (detected === 'application/pdf') assertPdfHasNoActiveContent(file.buffer);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: env.maxFileSizeMb * 1024 * 1024 },
  fileFilter,
});

function validateUploadedFileMiddleware(req, _res, next) {
  try {
    if (req.file) validateUploadedFileContent(req.file);
    return next();
  } catch (error) {
    return next(error);
  }
}

function secureSingle(fieldName) {
  return [upload.single(fieldName), validateUploadedFileMiddleware];
}

upload.validateUploadedFileContent = validateUploadedFileContent;
upload.validateUploadedFileMiddleware = validateUploadedFileMiddleware;
upload.secureSingle = secureSingle;
module.exports = upload;
