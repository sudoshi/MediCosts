import { describe, it, expect } from 'vitest';
import { LEVERAGE_DDL } from '../../lib/leverage-migrate.js';

describe('leverage DDL', () => {
  it('creates every lev_* and ref_* table idempotently', () => {
    const required = [
      'lev_cases', 'lev_case_documents', 'lev_extracted_claims',
      'lev_extracted_line_items', 'lev_findings', 'lev_case_scores',
      'ref_ncci_edits', 'ref_cms_fee_schedule', 'ref_drg_base_rate',
    ];
    for (const t of required) {
      expect(LEVERAGE_DDL).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it('stores money as integer cents and snapshots/evidence as jsonb', () => {
    expect(LEVERAGE_DDL).toContain('billed_cents');
    expect(LEVERAGE_DDL).toContain('benchmark_snapshot JSONB');
    expect(LEVERAGE_DDL).toContain('evidence_refs JSONB');
  });

  it('scopes cases to a user via FK', () => {
    expect(LEVERAGE_DDL).toContain('REFERENCES users(id)');
  });
});
