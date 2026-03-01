/**
 * CsvConnector — processes uploaded CSV files with column mapping.
 *
 * Config shape:
 *   { columnMapping: { facility_id: 'CCN', data_type: 'custom_kpis', ... } }
 *
 * The sync() method expects a filePath to be set on the instance.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import BaseConnector from './BaseConnector.js';

export default class CsvConnector extends BaseConnector {
  /**
   * Parse a CSV file into records using the configured column mapping.
   * @param {string} filePath — path to the uploaded CSV
   * @returns {Array} parsed records
   */
  async parseFile(filePath) {
    const records = [];
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    let headers = null;

    for await (const line of rl) {
      if (!headers) {
        headers = parseCsvLine(line);
        continue;
      }
      const values = parseCsvLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] || null; });

      const mapping = this.config.columnMapping || {};
      const facilityId = row[mapping.facility_id] || row['Facility ID'] || row['facility_id'] || row['CCN'] || null;

      records.push({ facility_id: facilityId, data: row });
    }

    return records;
  }

  async test() {
    return { ok: true, message: 'CSV connector ready — upload a file to import' };
  }

  async sync(connectorId, filePath) {
    if (!filePath) throw new Error('No file provided for CSV import');
    await this.logSync(connectorId, 'started');

    try {
      const records = await this.parseFile(filePath);
      const dataType = this.config.columnMapping?.data_type || 'csv_import';
      const count = await this.insertRecords(connectorId, dataType, records);

      await this.logSync(connectorId, 'completed', count);
      return { records: count, message: `Imported ${count} rows from CSV` };
    } catch (err) {
      await this.logSync(connectorId, 'failed', 0, err.message);
      throw err;
    }
  }
}

/**
 * Simple CSV line parser — handles quoted fields with commas.
 */
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
