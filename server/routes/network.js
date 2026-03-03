/**
 * network.js — ClearNetwork in-network status lookups
 * GET /api/network/check?npi=    → networks for a given NPI
 * GET /api/network/hospital/:ccn → networks for a hospital via name+state match
 */

import { Router } from 'express';
import db from '../db.js';
import { cache } from '../lib/cache.js';

const router = Router();

/* ── GET /check?npi= ── */
router.get('/check', async (req, res, next) => {
  try {
    const { npi } = req.query;
    if (!npi || !/^\d{10}$/.test(npi)) {
      return res.status(400).json({ error: 'Valid 10-digit NPI required' });
    }

    const cacheKey = `network:npi:${npi}`;
    const result = await cache(cacheKey, 3600, async () => {
      const r = await db.query(`
        SELECT
          n.network_name,
          i.legal_name   AS insurer_name,
          i.trade_names,
          np.tier,
          np.in_network,
          np.effective_date,
          np.termination_date,
          cp.entity_type,
          cp.name_canonical,
          cp.specialty_primary,
          cp.address_city,
          cp.address_state
        FROM clearnetwork.canonical_providers cp
        JOIN clearnetwork.network_providers np
          ON np.canonical_provider_id = cp.canonical_id
        JOIN clearnetwork.networks n ON n.id = np.network_id
        JOIN clearnetwork.insurers i ON i.id = n.insurer_id
        WHERE cp.npi = $1
          AND (np.termination_date IS NULL OR np.termination_date > CURRENT_DATE)
        ORDER BY i.legal_name, n.network_name
      `, [npi]);

      return r.rows;
    });

    // Dedupe by network_name (canonical_providers can have dupes from multi-file crawls)
    const seen = new Set();
    const networks = result.filter(row => {
      const key = `${row.network_name}:${row.tier ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const provider = networks[0] ? {
      name: networks[0].name_canonical,
      entity_type: networks[0].entity_type,
      specialty: networks[0].specialty_primary,
      city: networks[0].address_city,
      state: networks[0].address_state,
    } : null;

    res.json({ npi, provider, networks: networks.map(n => ({
      network_name: n.network_name,
      insurer_name: n.insurer_name,
      trade_names: n.trade_names,
      tier: n.tier,
      in_network: n.in_network,
      effective_date: n.effective_date,
    })) });
  } catch (err) { next(err); }
});

/* ── GET /hospital/:ccn ── */
router.get('/hospital/:ccn', async (req, res, next) => {
  try {
    const { ccn } = req.params;
    if (!ccn) return res.status(400).json({ error: 'CCN required' });

    const cacheKey = `network:hospital:${ccn}`;
    const result = await cache(cacheKey, 3600, async () => {

      // Look up hospital info
      const hosp = await db.query(
        'SELECT facility_name, state, zip_code FROM medicosts.hospital_info WHERE facility_id = $1',
        [ccn]
      );
      if (!hosp.rows.length) return null;

      const { facility_name, state } = hosp.rows[0];

      // Tokenize name: take words ≥4 chars, skip stop words, use first 3
      const stopWords = new Set(['THE', 'AND', 'OF', 'FOR', 'AT', 'ST', 'SAINT', 'HEALTH', 'SYSTEM', 'INC', 'LLC']);
      const tokens = facility_name.toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !stopWords.has(w))
        .slice(0, 3);

      if (!tokens.length) return { ccn, hospital: facility_name, npi: null, networks: [], matched: false };

      // Build ILIKE pattern: each token must appear in the canonical name
      // Prefer entries whose names also contain hospital/medical/clinic terms
      const conditions = tokens.map((t, i) => `cp.name_canonical ILIKE $${i + 2}`).join(' AND ');
      const params = [state, ...tokens.map(t => `%${t}%`)];

      const nameUpper = facility_name.toUpperCase();
      const isHospital = /HOSPITAL|MEDICAL CENTER|HEALTH SYSTEM/.test(nameUpper);
      const hospitalFilter = isHospital
        ? `AND (cp.name_canonical ILIKE '%hospital%' OR cp.name_canonical ILIKE '%medical center%' OR cp.name_canonical ILIKE '%health system%')`
        : '';

      const match = await db.query(`
        SELECT cp.npi, cp.name_canonical, cp.canonical_id
        FROM clearnetwork.canonical_providers cp
        WHERE cp.entity_type = 'facility'
          AND cp.address_state = $1
          AND ${conditions}
          ${hospitalFilter}
        LIMIT 5
      `, params);

      if (!match.rows.length) {
        return { ccn, hospital: facility_name, npi: null, networks: [], matched: false };
      }

      // Prefer the match with an active network link
      const npiRow = match.rows[0];

      const nets = await db.query(`
        SELECT DISTINCT ON (n.network_name)
          n.network_name,
          i.legal_name   AS insurer_name,
          i.trade_names,
          np.tier,
          np.in_network,
          np.effective_date
        FROM clearnetwork.network_providers np
        JOIN clearnetwork.networks n ON n.id = np.network_id
        JOIN clearnetwork.insurers i ON i.id = n.insurer_id
        WHERE np.canonical_provider_id = $1
          AND (np.termination_date IS NULL OR np.termination_date > CURRENT_DATE)
        ORDER BY n.network_name
      `, [npiRow.canonical_id]);

      return {
        ccn,
        hospital: facility_name,
        npi: npiRow.npi,
        matched_name: npiRow.name_canonical,
        networks: nets.rows,
        matched: true,
      };
    });

    if (result === null) return res.status(404).json({ error: 'Hospital not found' });
    res.json(result);
  } catch (err) { next(err); }
});

/* ── GET /insurers ── list all loaded insurers with network counts ── */
router.get('/insurers', async (req, res, next) => {
  try {
    const result = await cache('network:insurers', 86400, async () => {
      const r = await db.query(`
        SELECT
          i.id,
          i.legal_name,
          i.trade_names,
          i.states_licensed,
          i.plan_types,
          i.website,
          n.id AS network_id,
          n.network_name,
          n.provider_count,
          n.last_updated
        FROM clearnetwork.insurers i
        JOIN clearnetwork.networks n ON n.insurer_id = i.id
        WHERE n.provider_count > 0
        ORDER BY n.provider_count DESC
      `);
      return r.rows;
    });
    res.json({ insurers: result });
  } catch (err) { next(err); }
});

export default router;
