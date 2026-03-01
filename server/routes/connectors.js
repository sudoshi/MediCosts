import { Router } from 'express';
import { unlink } from 'node:fs/promises';
import pool from '../db.js';
import { createConnector, SUPPORTED_TYPES } from '../connectors/index.js';
import upload from '../middleware/upload.js';

const router = Router();

/* ------------------------------------------------------------------ */
/*  GET /api/connectors                                                */
/*  List all configured connectors                                     */
/* ------------------------------------------------------------------ */
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, type, status, last_sync_at, last_error, created_at, updated_at
       FROM medicosts.connectors ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/connectors/types                                          */
/*  List supported connector types                                     */
/* ------------------------------------------------------------------ */
router.get('/types', (_req, res) => {
  res.json(SUPPORTED_TYPES);
});

/* ------------------------------------------------------------------ */
/*  POST /api/connectors                                               */
/*  Create a new connector                                             */
/* ------------------------------------------------------------------ */
router.post('/', async (req, res, next) => {
  try {
    const { name, type, config = {} } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
    if (!SUPPORTED_TYPES.includes(type)) return res.status(400).json({ error: `Unsupported type: ${type}` });

    const { rows } = await pool.query(
      `INSERT INTO medicosts.connectors (name, type, config) VALUES ($1, $2, $3) RETURNING *`,
      [name, type, JSON.stringify(config)]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  GET /api/connectors/:id                                            */
/* ------------------------------------------------------------------ */
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM medicosts.connectors WHERE id = $1', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Connector not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  PUT /api/connectors/:id                                            */
/* ------------------------------------------------------------------ */
router.put('/:id', async (req, res, next) => {
  try {
    const { name, config, status } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
    if (config !== undefined) { sets.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE medicosts.connectors SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Connector not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  DELETE /api/connectors/:id                                         */
/* ------------------------------------------------------------------ */
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM medicosts.connectors WHERE id = $1', [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Connector not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  POST /api/connectors/:id/test                                      */
/*  Test connectivity                                                  */
/* ------------------------------------------------------------------ */
router.post('/:id/test', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM medicosts.connectors WHERE id = $1', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Connector not found' });

    const connector = createConnector(rows[0].type, rows[0].config, pool);
    const result = await connector.test();

    // Update status based on test
    await pool.query(
      `UPDATE medicosts.connectors SET status = $1, last_error = $2, updated_at = NOW() WHERE id = $3`,
      [result.ok ? 'active' : 'error', result.ok ? null : result.message, req.params.id]
    );

    res.json(result);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  POST /api/connectors/:id/sync                                      */
/*  Trigger data sync (accepts optional file upload for CSV connectors) */
/* ------------------------------------------------------------------ */
router.post('/:id/sync', upload.single('file'), async (req, res, next) => {
  let filePath = req.file?.path;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM medicosts.connectors WHERE id = $1', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Connector not found' });

    await pool.query(
      `UPDATE medicosts.connectors SET status = 'syncing', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    const connector = createConnector(rows[0].type, rows[0].config, pool);
    const isCsvType = ['csv', 'definitive', 'vizient', 'premier'].includes(rows[0].type);
    const result = await connector.sync(req.params.id, isCsvType ? filePath : undefined);

    await pool.query(
      `UPDATE medicosts.connectors SET status = 'active', last_sync_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    res.json(result);
  } catch (err) {
    await pool.query(
      `UPDATE medicosts.connectors SET status = 'error', last_error = $1, updated_at = NOW() WHERE id = $2`,
      [err.message, req.params.id]
    ).catch(() => {});
    next(err);
  } finally {
    if (filePath) unlink(filePath).catch(() => {});
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/connectors/:id/status                                     */
/*  Sync history                                                       */
/* ------------------------------------------------------------------ */
router.get('/:id/status', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM medicosts.connector_sync_log WHERE connector_id = $1 ORDER BY started_at DESC LIMIT 20`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ */
/*  POST /api/connectors/import/csv                                    */
/*  Direct CSV upload (creates connector + imports in one step)        */
/* ------------------------------------------------------------------ */
router.post('/import/csv', upload.single('file'), async (req, res, next) => {
  let filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const name = req.body.name || `CSV Import — ${req.file.originalname}`;
    const dataType = req.body.data_type || 'csv_import';
    const facilityColumn = req.body.facility_column || 'Facility ID';

    // Create connector record
    const { rows } = await pool.query(
      `INSERT INTO medicosts.connectors (name, type, config, status)
       VALUES ($1, 'csv', $2, 'syncing') RETURNING *`,
      [name, JSON.stringify({ columnMapping: { facility_id: facilityColumn, data_type: dataType } })]
    );
    const connectorId = rows[0].id;

    // Parse and import
    const connector = createConnector('csv', rows[0].config, pool);
    const result = await connector.sync(connectorId, filePath);

    await pool.query(
      `UPDATE medicosts.connectors SET status = 'active', last_sync_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [connectorId]
    );

    res.status(201).json({ connector_id: connectorId, ...result });
  } catch (err) { next(err); }
  finally {
    // Clean up temp file
    if (filePath) unlink(filePath).catch(() => {});
  }
});

export default router;
