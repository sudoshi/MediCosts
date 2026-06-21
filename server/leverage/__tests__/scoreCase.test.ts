import { describe, it, expect } from 'vitest';
import { scoreCase } from '../judge/scoreCase.js';
import type { Finding } from '../types.js';

function finding(p: Partial<Finding>): Finding {
  return { ruleId: 'R', severity: 'medium', title: 't', statuteCitation: null,
    feeShiftingEligible: false, remedyType: 'billing_error',
    estimatedRecoveryLowCents: 0, estimatedRecoveryHighCents: 0,
    evidenceRefs: [], benchmarkSnapshot: null, ...p };
}

describe('scoreCase', () => {
  it('an empty finding set is a zeroed, not-ready score', () => {
    expect(scoreCase([])).toEqual({
      leverageScore: 0, strongestRemedy: null,
      totalEstimatedOverchargeCents: 0, marketplaceReady: false,
    });
  });

  it('sums overcharge across findings', () => {
    const s = scoreCase([
      finding({ estimatedRecoveryLowCents: 10000 }),
      finding({ estimatedRecoveryLowCents: 5000 }),
    ]);
    expect(s.totalEstimatedOverchargeCents).toBe(15000);
  });

  it('is marketplaceReady only with at least one high-severity finding', () => {
    expect(scoreCase([finding({ severity: 'medium' })]).marketplaceReady).toBe(false);
    expect(scoreCase([finding({ severity: 'high' })]).marketplaceReady).toBe(true);
  });

  it('prefers statutory_claim as the strongest remedy when present', () => {
    const s = scoreCase([
      finding({ remedyType: 'negotiation' }),
      finding({ remedyType: 'statutory_claim', feeShiftingEligible: true, severity: 'high' }),
      finding({ remedyType: 'billing_error' }),
    ]);
    expect(s.strongestRemedy).toBe('statutory_claim');
  });

  it('caps the leverage score at 100', () => {
    const many = Array.from({ length: 20 }, () =>
      finding({ severity: 'high', feeShiftingEligible: true, estimatedRecoveryLowCents: 100000 }));
    expect(scoreCase(many).leverageScore).toBe(100);
  });
});
