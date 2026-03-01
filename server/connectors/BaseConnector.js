/**
 * BaseConnector — abstract base class for all data connectors.
 * Subclasses must implement test() and sync().
 */
export default class BaseConnector {
  constructor(config, pool) {
    this.config = config;
    this.pool = pool;
  }

  /**
   * Test connectivity. Returns { ok: boolean, message: string }.
   */
  async test() {
    throw new Error('test() not implemented');
  }

  /**
   * Sync data from the external source into medicosts.imported_data.
   * Returns { records: number, message: string }.
   */
  async sync(connectorId) {
    throw new Error('sync() not implemented');
  }

  /**
   * Log a sync event to connector_sync_log.
   */
  async logSync(connectorId, status, recordsSynced = 0, errorMessage = null) {
    await this.pool.query(
      `INSERT INTO medicosts.connector_sync_log (connector_id, status, records_synced, error_message, completed_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [connectorId, status, recordsSynced, errorMessage, status !== 'started' ? new Date() : null]
    );
  }

  /**
   * Insert records into imported_data.
   */
  async insertRecords(connectorId, dataType, records) {
    if (!records.length) return 0;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Clear previous imports for this connector + type
      await client.query(
        'DELETE FROM medicosts.imported_data WHERE connector_id = $1 AND data_type = $2',
        [connectorId, dataType]
      );
      const BATCH = 500;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const values = [];
        const params = [];
        batch.forEach((rec, j) => {
          const off = j * 4;
          values.push(`($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4})`);
          params.push(connectorId, dataType, rec.facility_id || null, JSON.stringify(rec.data || rec));
        });
        await client.query(
          `INSERT INTO medicosts.imported_data (connector_id, data_type, facility_id, record_data) VALUES ${values.join(',')}`,
          params
        );
      }
      await client.query('COMMIT');
      return records.length;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
