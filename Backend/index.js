const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');

const connectDatabase = require('./DB/connection');
const env = require('./src/config/env');
const registerRoutes = require('./src/Modules');
const { notFoundHandler, globalErrorHandler } = require('./src/utils/error-handling');
const { corsOptions, apiLimiter, sanitizeRequest, parseCookies, csrfProtection } = require('./src/middleware/security');

const app = express();

function resolveTrustProxy(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === '0' || raw === 'off') return false;
  if (raw === 'true' || raw === '1') return 1;
  return value;
}

app.set('trust proxy', resolveTrustProxy(env.trustProxy));
app.disable('x-powered-by');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", env.frontendBaseUrl, env.frontendPublicUrl, ...env.corsOrigins],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(cors(corsOptions()));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));
app.use(parseCookies);
app.use(sanitizeRequest);
app.use(csrfProtection);
app.use('/api/v1', apiLimiter);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

registerRoutes(app);
app.use(notFoundHandler);
app.use(globalErrorHandler);

async function bootstrap() {
  await connectDatabase();
  app.listen(env.port, () => {
    console.log(`ADWETY backend listening on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
