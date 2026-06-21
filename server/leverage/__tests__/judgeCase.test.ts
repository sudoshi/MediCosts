import { describe, it, expect } from 'vitest';
import { judgeCase } from '../judge/judgeCase.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return { lineId: 'l', cptHcpcs: '99285', revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 0, allowedCents: null, planPaidCents: null,
    patientRespCents: null, serviceDate: '2023-05-01', ...p };
}

describe('judgeCase', () => {
  const provider = new MemoryBenchmarkProvider({
    cmsPfs: { '99285:2023': 25000 },
    mue: { '99285:2023': 1 },
  });

  it('runs all rules and aggregates findings deterministically', async () => {
    const claim: ExtractedClaim = {
      caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
      serviceYear: 2023, eobPatientRespCents: null,
      lineItems: [line({ lineId: 'a', units: 3, billedCents: 300000 })],
    };
    const a = await judgeCase(claim, provider);
    const b = await judgeCase(claim, provider);
    const ids = a.map((f) => f.ruleId).sort();
    expect(ids).toContain('OVERCHARGE_MEDICARE_MULTIPLE');
    expect(ids).toContain('MUE_UNIT_EXCESS');
    expect(a).toEqual(b);
  });

  it('returns no findings for a clean claim', async () => {
    const clean: ExtractedClaim = {
      caseId: 'c2', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
      serviceYear: 2023, eobPatientRespCents: null,
      lineItems: [line({ lineId: 'a', units: 1, billedCents: 26000 })],
    };
    expect(await judgeCase(clean, provider)).toHaveLength(0);
  });
});
