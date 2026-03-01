/**
 * OmopConnector — connects to an OMOP CDM database via PostgreSQL.
 *
 * Config shape:
 *   { host, port, database, user, password, schema? }
 */
import pg from 'pg';
import BaseConnector from './BaseConnector.js';

export default class OmopConnector extends BaseConnector {
  createOmopPool() {
    return new pg.Pool({
      host: this.config.host,
      port: this.config.port || 5432,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      max: 3,
      connectionTimeoutMillis: 10000,
    });
  }

  async test() {
    const omopPool = this.createOmopPool();
    try {
      const schema = this.config.schema || 'cdm';
      const { rows } = await omopPool.query(
        `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = $1`,
        [schema]
      );
      const tableCount = rows[0]?.n || 0;
      return { ok: true, message: `Connected — ${tableCount} tables in schema "${schema}"` };
    } catch (err) {
      return { ok: false, message: err.message };
    } finally {
      await omopPool.end();
    }
  }

  async sync(connectorId) {
    await this.logSync(connectorId, 'started');
    const omopPool = this.createOmopPool();
    try {
      const schema = this.config.schema || 'cdm';
      let totalRecords = 0;

      // Sync care_site (maps to hospitals)
      const careSites = await omopPool.query(
        `SELECT care_site_id, care_site_name, place_of_service_concept_id, location_id
         FROM ${schema}.care_site LIMIT 10000`
      );
      if (careSites.rows.length > 0) {
        const records = careSites.rows.map((r) => ({
          facility_id: String(r.care_site_id),
          data: r,
        }));
        await this.insertRecords(connectorId, 'omop_care_site', records);
        totalRecords += records.length;
      }

      // Sync condition summary
      const conditions = await omopPool.query(
        `SELECT care_site_id, condition_concept_id, COUNT(*)::int AS patient_count
         FROM ${schema}.condition_occurrence co
         JOIN ${schema}.visit_occurrence vo USING (visit_occurrence_id)
         GROUP BY care_site_id, condition_concept_id
         HAVING COUNT(*) >= 10
         LIMIT 50000`
      );
      if (conditions.rows.length > 0) {
        const records = conditions.rows.map((r) => ({
          facility_id: String(r.care_site_id),
          data: r,
        }));
        await this.insertRecords(connectorId, 'omop_condition_summary', records);
        totalRecords += records.length;
      }

      await this.logSync(connectorId, 'completed', totalRecords);
      return { records: totalRecords, message: `Synced ${totalRecords} OMOP records` };
    } catch (err) {
      await this.logSync(connectorId, 'failed', 0, err.message);
      throw err;
    } finally {
      await omopPool.end();
    }
  }
}
