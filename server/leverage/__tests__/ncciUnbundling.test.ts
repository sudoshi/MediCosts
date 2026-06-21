import { describe, it, expect } from 'vitest';
import { ncciUnbundling } from '../judge/rules/ncciUnbundling.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return {
    lineId: 'l', cptHcpcs: null, revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 0, allowedCents: null, planPaidCents: null,
    patientRespCents: null, serviceDate: '2023-05-01', ...p,
  };
}
function claim(lines: LineItem[]): ExtractedClaim {
  return { caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: null, lineItems: lines };
}

describe('NCCI_UNBUNDLING', () => {
  const provider = new MemoryBenchmarkProvider({ ncciPtp: [['80053', '80048', 2023]] });

  it('flags a conflicting code pair billed without a modifier', async () => {
    const f = await ncciUnbundling(claim([
      line({ lineId: 'a', cptHcpcs: '80053', billedCents: 4000 }),
      line({ lineId: 'b', cptHcpcs: '80048', billedCents: 1500 }),
    ]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('NCCI_UNBUNDLING');
    expect(f[0].remedyType).toBe('billing_error');
    expect(f[0].estimatedRecoveryLowCents).toBe(1500);
    expect(f[0].evidenceRefs.sort()).toEqual(['a', 'b']);
    expect(f[0].benchmarkSnapshot?.detail).toEqual({ conflictingCode: '80048' });
  });

  it('does NOT flag when a valid 59 modifier is present', async () => {
    const f = await ncciUnbundling(claim([
      line({ lineId: 'a', cptHcpcs: '80053', billedCents: 4000 }),
      line({ lineId: 'b', cptHcpcs: '80048', billedCents: 1500, modifier: '59' }),
    ]), provider);
    expect(f).toHaveLength(0);
  });

  it('does NOT flag non-conflicting pairs', async () => {
    const f = await ncciUnbundling(claim([
      line({ lineId: 'a', cptHcpcs: '80053', billedCents: 4000 }),
      line({ lineId: 'b', cptHcpcs: '99285', billedCents: 1500 }),
    ]), provider);
    expect(f).toHaveLength(0);
  });
});
