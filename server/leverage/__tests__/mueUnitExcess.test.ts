import { describe, it, expect } from 'vitest';
import { mueUnitExcess } from '../judge/rules/mueUnitExcess.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return { lineId: 'l1', cptHcpcs: '99285', revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 0, allowedCents: null, planPaidCents: null,
    patientRespCents: null, serviceDate: '2023-05-01', ...p };
}
function claim(lines: LineItem[]): ExtractedClaim {
  return { caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: null, lineItems: lines };
}

describe('MUE_UNIT_EXCESS', () => {
  const provider = new MemoryBenchmarkProvider({ mue: { '99285:2023': 1 } });

  it('flags units above the MUE ceiling and prices the excess', async () => {
    const f = await mueUnitExcess(claim([line({ units: 3, billedCents: 30000 })]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('MUE_UNIT_EXCESS');
    expect(f[0].estimatedRecoveryLowCents).toBe(20000);
    expect(f[0].benchmarkSnapshot?.detail).toEqual({ mueMax: 1, billedUnits: 3 });
  });

  it('does NOT flag units within the ceiling', async () => {
    const f = await mueUnitExcess(claim([line({ units: 1, billedCents: 10000 })]), provider);
    expect(f).toHaveLength(0);
  });

  it('skips lines with no MUE benchmark or no CPT', async () => {
    const noBench = await mueUnitExcess(claim([line({ cptHcpcs: '00000', units: 9, billedCents: 9000 })]), provider);
    const noCpt = await mueUnitExcess(claim([line({ cptHcpcs: null, units: 9, billedCents: 9000 })]), provider);
    expect(noBench).toHaveLength(0);
    expect(noCpt).toHaveLength(0);
  });
});
