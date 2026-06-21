import { describe, it, expect } from 'vitest';
import { emptyScore, type Finding, type ExtractedClaim } from '../types.js';

describe('domain types', () => {
  it('emptyScore is a zeroed, not-ready CaseScore', () => {
    expect(emptyScore()).toEqual({
      leverageScore: 0,
      strongestRemedy: null,
      totalEstimatedOverchargeCents: 0,
      marketplaceReady: false,
    });
  });

  it('a Finding and ExtractedClaim are structurally usable', () => {
    const claim: ExtractedClaim = {
      caseId: 'c1',
      insuranceStatus: 'insured',
      state: 'PA',
      facilityCcn: '390001',
      serviceYear: 2023,
      eobPatientRespCents: 5000,
      lineItems: [],
    };
    const f: Finding = {
      ruleId: 'X',
      severity: 'high',
      title: 't',
      statuteCitation: null,
      feeShiftingEligible: false,
      remedyType: 'billing_error',
      estimatedRecoveryLowCents: 0,
      estimatedRecoveryHighCents: 0,
      evidenceRefs: [],
      benchmarkSnapshot: null,
    };
    expect(claim.lineItems).toHaveLength(0);
    expect(f.ruleId).toBe('X');
  });
});
