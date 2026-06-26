import { describe, expect, it } from 'vitest';
import { PLAN_DDL } from '../../lib/plan-migrate.js';

describe('plan attribution DDL', () => {
  it('creates coverage profile and outcome attribution tables', () => {
    expect(PLAN_DDL).toContain('CREATE TABLE IF NOT EXISTS plan_coverage_profiles');
    expect(PLAN_DDL).toContain('CREATE TABLE IF NOT EXISTS plan_outcome_attributions');
    expect(PLAN_DDL).toContain('CREATE TABLE IF NOT EXISTS plan_coverage_extraction_candidates');
  });

  it('links outcome attribution evidence to deterministic leverage findings', () => {
    expect(PLAN_DDL).toContain('finding_id              BIGINT REFERENCES lev_findings(id) ON DELETE SET NULL');
  });

  it('stores plan, payer, network, and hashed member identity fields', () => {
    const required = [
      'payer_legal_name',
      'payer_trade_name',
      'hios_plan_id',
      'cms_contract_id',
      'cms_plan_id',
      'network_name',
      'group_number_hash',
      'member_id_hash',
      'employer_name_hash',
      'identity_confidence',
      'sensitive_hashes',
      'candidate_profile',
      'review_status',
    ];

    for (const column of required) {
      expect(PLAN_DDL).toContain(column);
    }
  });
});
