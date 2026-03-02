import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { runMigrations } from './lib/db-migrate.js';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3090;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

// Auth routes — public, no token required (must be before the requireAuth guard)
app.use('/api/auth', authRouter);

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
app.use('/api/payments', paymentsRouter);

if (isProd) {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// Run DB migrations then start server
runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✦ MediCosts API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
