const env = require('../config/env');

class AppError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

function notFoundHandler(_req, _res, next) {
  next(new AppError('Route not found', 404));
}

function globalErrorHandler(error, req, res, _next) {
  const statusCode = error.statusCode || 500;
  const isSafeEnv = ['production', 'staging', 'uat'].includes(env.nodeEnv);

  if (statusCode >= 500) {
    const logEntry = {
      message: error.message,
      path: req?.originalUrl,
      method: req?.method,
    };
    if (!isSafeEnv) logEntry.stack = error.stack;
    console.error('[ERROR]', logEntry);
  }

  const safeMessage = statusCode >= 500 && isSafeEnv ? 'Internal server error' : (error.message || 'Internal server error');
  const safeDetails = isSafeEnv ? null : (error.details || null);

  res.status(statusCode).json({
    success: false,
    message: safeMessage,
    details: safeDetails,
  });
}

module.exports = { AppError, notFoundHandler, globalErrorHandler };
