/**
 * FhirConnector — connects to FHIR R4 servers via OAuth2 client credentials.
 *
 * Config shape:
 *   { baseUrl, tokenEndpoint, clientId, clientSecret, resourceTypes? }
 */
import BaseConnector from './BaseConnector.js';

export default class FhirConnector extends BaseConnector {
  async getAccessToken() {
    const { tokenEndpoint, clientId, clientSecret } = this.config;
    if (!tokenEndpoint) return null;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) throw new Error(`Token request failed: ${res.status} ${res.statusText}`);
    const json = await res.json();
    return json.access_token;
  }

  async fhirFetch(path, token) {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/${path}`;
    const headers = { Accept: 'application/fhir+json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`FHIR ${path}: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async test() {
    try {
      const token = await this.getAccessToken();
      const meta = await this.fhirFetch('metadata', token);
      const serverName = meta.software?.name || meta.implementation?.description || 'Unknown FHIR Server';
      const version = meta.fhirVersion || 'unknown';
      return { ok: true, message: `Connected to ${serverName} (FHIR ${version})` };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  async sync(connectorId) {
    await this.logSync(connectorId, 'started');
    try {
      const token = await this.getAccessToken();
      const resourceTypes = this.config.resourceTypes || ['Organization', 'Location'];
      let totalRecords = 0;

      for (const type of resourceTypes) {
        const records = [];
        let url = `${type}?_count=100`;

        // Paginate through results
        while (url && records.length < 10000) {
          const bundle = await this.fhirFetch(url, token);
          if (bundle.entry) {
            for (const entry of bundle.entry) {
              records.push({
                facility_id: entry.resource?.identifier?.[0]?.value || null,
                data: entry.resource,
              });
            }
          }
          // Follow next link
          const nextLink = bundle.link?.find((l) => l.relation === 'next');
          url = nextLink ? nextLink.url.replace(this.config.baseUrl, '') : null;
        }

        if (records.length > 0) {
          await this.insertRecords(connectorId, `fhir_${type.toLowerCase()}`, records);
          totalRecords += records.length;
        }
      }

      await this.logSync(connectorId, 'completed', totalRecords);
      return { records: totalRecords, message: `Synced ${totalRecords} FHIR resources` };
    } catch (err) {
      await this.logSync(connectorId, 'failed', 0, err.message);
      throw err;
    }
  }
}
