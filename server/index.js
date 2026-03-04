import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import logger from './lib/logger.js';
import { runMigrations } from './lib/db-migrate.js';

// ── Startup env validation (Phase 6.4) ─────────────────────────────────────
const REQUIRED_ENV = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'JWT_SECRET'];
REQUIRED_ENV.forEach(k => {
  if (!process.env[k]) {
    logger.fatal({ missing: k }, `Missing required environment variable ${k}`);
    process.exit(1);
  }
});

import authRouter from './routes/auth.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';
import apiRouter from './routes/api.js';
import qualityRouter from './routes/quality.js';
import connectorRouter from './routes/connectors.js';
import abbyRouter from './routes/abby.js';
import trendsRouter from './routes/trends.js';
import postAcuteRouter from './routes/post-acute.js';
import facilitiesRouter from './routes/facilities.js';
import clearnetworkAdminRouter from './routes/clearnetwork-admin.js';
import paymentsRouter from './routes/payments.js';
import financialsRouter from './routes/financials.js';
import shortageRouter from './routes/shortage.js';
import communityHealthRouter from './routes/community-health.js';
import networkRouter from './routes/network.js';
import drugsRouter from './routes/drugs.js';
import statsRouter from './routes/stats.js';
import aiProvidersRouter from './routes/ai-providers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3090;
const isProd = process.env.NODE_ENV === 'production';

// Trust Apache reverse proxy (required for express-rate-limit X-Forwarded-For)
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// ── Request logging (Phase 6.5) ─────────────────────────────────────────────
app.use((req, _res, next) => {
  req._startAt = Date.now();
  next();
});

// ── Rate limiting (Phase 6.3) ───────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
const abbyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Abby rate limit reached. Please wait before sending another message.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

app.use('/api/', apiLimiter);
app.use('/api/abby/', abbyLimiter);

// Auth routes — public
app.use('/api/auth', authLimiter, authRouter);

// Stats route — public (no auth, cached 24h, used by landing/login pages)
app.use('/api/stats', statsRouter);

// Protect all remaining /api routes
app.use('/api', requireAuth);

// Protected API routes
app.use('/api', apiRouter);
app.use('/api/quality', qualityRouter);
app.use('/api/connectors', connectorRouter);
app.use('/api/abby', abbyRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/post-acute', postAcuteRouter);
app.use('/api/facilities', facilitiesRouter);
app.use('/api/clearnetwork', requireAdmin, clearnetworkAdminRouter);
app.use('/api/ai-providers', requireAdmin, aiProvidersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/financials', financialsRouter);
app.use('/api/shortage-areas', shortageRouter);
app.use('/api/community-health', communityHealthRouter);
app.use('/api/network', networkRouter);
app.use('/api/drugs', drugsRouter);

if (isProd) {
  const clientBuild = path.join(__dirname, '../client/dist');
  // Cache hashed assets aggressively; index.html uses default (no-cache)
  app.use('/assets', express.static(path.join(clientBuild, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(clientBuild));
  // SPA fallback — only for navigation requests, not missing assets
  app.get('*', (req, res) => {
    if (req.path.startsWith('/assets/') || req.path.match(/\.(js|css|map|woff2?|png|jpg|svg|ico)$/)) {
      return res.status(404).end();
    }
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// ── Global error handler (Phase 6.5) ────────────────────────────────────────
app.use((err, req, res, _next) => {
  const ms = req._startAt ? Date.now() - req._startAt : undefined;
  logger.error({
    err: { message: err.message, stack: err.stack },
    req: { method: req.method, url: req.url, query: req.query },
    ms,
  }, 'Unhandled request error');
  res.status(500).json({ error: 'Internal server error' });
});

// ── Slow-query warning via monkey-patch on pool query (logged per route) ─────
// Individual routes can call logger.warn({ ms }, 'slow query') as needed.
// See server/lib/cache.js stats() for cache health.

// Run DB migrations then start
runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`MediCosts API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    logger.fatal({ err }, 'Migration failed');
    process.exit(1);
  });
