import { describe, expect, it } from 'vitest';
import { CONSUMER_DDL } from '../../lib/consumer-migrate.js';

describe('consumer advocacy DDL', () => {
  it('creates consumer case, release, document, evidence, consent, and audit tables', () => {
    const required = [
      'con_cases',
      'con_case_events',
      'con_case_outcomes',
      'con_consent_grants',
      'con_medical_record_releases',
      'con_documents',
      'con_evidence_items',
      'con_audit_events',
    ];

    for (const table of required) {
      expect(CONSUMER_DDL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('requires uploaded documents to reference a medical record release', () => {
    expect(CONSUMER_DDL).toContain('medical_record_release_id  UUID NOT NULL REFERENCES con_medical_record_releases');
  });

  it('stores release expiration, revocation, signer, representative, and counsel metadata', () => {
    expect(CONSUMER_DDL).toContain('template_version');
    expect(CONSUMER_DDL).toContain('counsel_status');
    expect(CONSUMER_DDL).toContain('expiration_at');
    expect(CONSUMER_DDL).toContain('revoked_at');
    expect(CONSUMER_DDL).toContain('representative_authority');
  });
});
