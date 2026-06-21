import { describe, it, expect } from 'vitest';
import { duplicateLine } from '../judge/rules/duplicateLine.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return { lineId: 'l', cptHcpcs: '70450', revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 50000, allowedCents: null, planPaidCents: null,
    patientRespCents: null, serviceDate: '2023-05-01', ...p };
}
function claim(lines: LineItem[]): ExtractedClaim {
  return { caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: null, lineItems: lines };
}
const provider = new MemoryBenchmarkProvider();

describe('DUPLICATE_LINE', () => {
  it('flags identical code+date+units billed twice', async () => {
    const f = await duplicateLine(claim([
      line({ lineId: 'a' }),
      line({ lineId: 'b' }),
    ]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('DUPLICATE_LINE');
    expect(f[0].estimatedRecoveryLowCents).toBe(50000);
    expect(f[0].evidenceRefs.sort()).toEqual(['a', 'b']);
  });

  it('counts N copies as N-1 recoverable duplicates', async () => {
    const f = await duplicateLine(claim([
      line({ lineId: 'a' }), line({ lineId: 'b' }), line({ lineId: 'c' }),
    ]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].estimatedRecoveryLowCents).toBe(100000);
  });

  it('does NOT flag different dates or codes', async () => {
    const diffDate = await duplicateLine(claim([
      line({ lineId: 'a' }), line({ lineId: 'b', serviceDate: '2023-05-02' }),
    ]), provider);
    const diffCode = await duplicateLine(claim([
      line({ lineId: 'a' }), line({ lineId: 'b', cptHcpcs: '70460' }),
    ]), provider);
    expect(diffDate).toHaveLength(0);
    expect(diffCode).toHaveLength(0);
  });
});
