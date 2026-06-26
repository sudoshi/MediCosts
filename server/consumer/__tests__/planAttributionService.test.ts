import { describe, expect, it, vi } from 'vitest';
import {
  buildAttributionDrafts,
  normalizeCoverageProfileInput,
  saveCoverageProfile,
  scoreCoverageIdentity,
} from '../planAttributionService.js';

const caseId = '11111111-1111-4111-8111-111111111111';

const eobMismatchAnalysis = {
  claim: {
    id: 'claim-1',
    lineItems: [{ lineId: 'line-1' }],
  },
  findings: [
    {
      id: 22,
      ruleId: 'EOB_PATIENT_RESP_MISMATCH',
      evidenceRefs: ['line-1'],
    },
  ],
};

describe('plan attribution service', () => {
  it('scores stronger plan identity when payer, plan year, and identifiers are present', () => {
    const weak = scoreCoverageIdentity({ payerLegalName: 'Example Health' });
    const strong = scoreCoverageIdentity({
      payerLegalName: 'Example Health',
      planName: 'Example Choice PPO',
      planYear: 2026,
      state: 'PA',
      networkName: 'Example Choice Network',
      hiosPlanId: '12345PA0010001',
      groupNumberHash: 'hashed-group',
      memberIdHash: 'hashed-member',
    });

    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThanOrEqual(0.8);
  });

  it('hashes member, group, and employer values without retaining raw identifiers', () => {
    const profile = normalizeCoverageProfileInput({
      payerLegalName: 'Example Health',
      memberId: 'MEM-12345',
      groupNumber: 'GROUP-987',
      employerName: 'Example Employer',
    });

    expect(profile.memberIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(profile.groupNumberHash).toMatch(/^[a-f0-9]{64}$/);
    expect(profile.employerNameHash).toMatch(/^[a-f0-9]{64}$/);
    expect(profile).not.toHaveProperty('memberId');
    expect(profile).not.toHaveProperty('groupNumber');
    expect(profile).not.toHaveProperty('employerName');
    expect(JSON.stringify(profile)).not.toContain('MEM-12345');
    expect(JSON.stringify(profile)).not.toContain('GROUP-987');
    expect(JSON.stringify(profile)).not.toContain('Example Employer');
  });

  it('attributes an EOB mismatch to the plan when coverage identity is present', () => {
    const drafts = buildAttributionDrafts(
      {
        id: 'profile-1',
        payerLegalName: 'Example Health',
        planName: 'Example Choice PPO',
        planYear: 2026,
        networkName: 'Example Choice Network',
        identityConfidence: 0.84,
      },
      eobMismatchAnalysis,
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      findingId: 22,
      outcomeType: 'incorrect_patient_responsibility',
      attributionType: 'plan_contributed',
      attributionBasis: 'eob_patient_responsibility_mismatch',
    });
    expect(drafts[0].attributionConfidence).toBeGreaterThan(0.7);
  });

  it('keeps attribution unknown until plan identity exists', () => {
    const drafts = buildAttributionDrafts(null, eobMismatchAnalysis);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      findingId: 22,
      attributionType: 'unknown',
      attributionConfidence: 0.35,
    });
  });

  it('preserves existing write-only hashes when sensitive fields are left blank', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ id: caseId, user_id: 7, state: 'PA', deleted_at: null }],
      })
      .mockResolvedValueOnce({
        rows: [{
          group_number_hash: 'old-group-hash',
          member_id_hash: 'old-member-hash',
          employer_name_hash: 'old-employer-hash',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'profile-1',
          case_id: caseId,
          coverage_type: 'commercial',
          payer_legal_name: 'Example Health',
          identity_confidence: '0.220',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await saveCoverageProfile(query, 7, caseId, {
      coverageType: 'commercial',
      payerLegalName: 'Example Health',
      memberId: '',
      groupNumber: '',
      employerName: '',
    });

    const insertArgs = query.mock.calls[2][1];
    expect(insertArgs[18]).toBe('old-group-hash');
    expect(insertArgs[19]).toBe('old-member-hash');
    expect(insertArgs[20]).toBe('old-employer-hash');
  });
});
