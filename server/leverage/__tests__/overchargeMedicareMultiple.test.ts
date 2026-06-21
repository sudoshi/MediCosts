import { describe, it, expect } from 'vitest';
import { overchargeMedicareMultiple } from '../judge/rules/overchargeMedicareMultiple.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return {
    lineId: 'l1', cptHcpcs: '99285', revenueCode: null, msDrg: null,
    modifier: null, units: 1, billedCents: 0, allowedCents: null,
    planPaidCents: null, patientRespCents: null, serviceDate: '2023-05-01',
    ...p,
  };
}
function claim(lines: LineItem[]): ExtractedClaim {
  return {
    caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: null, lineItems: lines,
  };
}

describe('OVERCHARGE_MEDICARE_MULTIPLE', () => {
  const provider = new MemoryBenchmarkProvider({ cmsPfs: { '99285:2023': 25000 } });

  it('flags a charge above the 4x Medicare threshold', async () => {
    const f = await overchargeMedicareMultiple(claim([line({ billedCents: 150000 })]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('OVERCHARGE_MEDICARE_MULTIPLE');
    expect(f[0].remedyType).toBe('negotiation');
    expect(f[0].estimatedRecoveryLowCents).toBe(125000);
    expect(f[0].evidenceRefs).toEqual(['l1']);
    expect(f[0].benchmarkSnapshot).toEqual({
      source: 'cms_pfs', code: '99285', effectiveYear: 2023, valueCents: 25000, detail: { multiple: 6 },
    });
  });

  it('does NOT flag a charge at or below threshold', async () => {
    const f = await overchargeMedicareMultiple(claim([line({ billedCents: 90000 })]), provider);
    expect(f).toHaveLength(0);
  });

  it('skips lines with no CPT or no benchmark', async () => {
    const noCpt = await overchargeMedicareMultiple(claim([line({ cptHcpcs: null, billedCents: 999999 })]), provider);
    const noBench = await overchargeMedicareMultiple(claim([line({ cptHcpcs: '00000', billedCents: 999999 })]), provider);
    expect(noCpt).toHaveLength(0);
    expect(noBench).toHaveLength(0);
  });

  it('severity rises with multiple', async () => {
    const high = await overchargeMedicareMultiple(claim([line({ billedCents: 300000 })]), provider);
    expect(high[0].severity).toBe('high');
    const med = await overchargeMedicareMultiple(claim([line({ billedCents: 120000 })]), provider);
    expect(med[0].severity).toBe('medium');
  });
});
