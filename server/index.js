import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import apiRouter from './routes/api.js';
import qualityRouter from './routes/quality.js';
import connectorRouter from './routes/connectors.js';
import abbyRouter from './routes/abby.js';
import trendsRouter from './routes/trends.js';
import postAcuteRouter from './routes/post-acute.js';
import facilitiesRouter from './routes/facilities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3090;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);
app.use('/api/quality', qualityRouter);
app.use('/api/connectors', connectorRouter);
app.use('/api/abby', abbyRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/post-acute', postAcuteRouter);
app.use('/api/facilities', facilitiesRouter);

if (isProd) {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`✦ MediCosts API listening on http://localhost:${PORT}`);
});
