import { describe, it, expect } from 'vitest';
import { eobPatientRespMismatch } from '../judge/rules/eobPatientRespMismatch.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return { lineId: 'l', cptHcpcs: '99285', revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 0, allowedCents: null, planPaidCents: null,
    patientRespCents: 0, serviceDate: '2023-05-01', ...p };
}
function claim(lines: LineItem[], eob: number | null): ExtractedClaim {
  return { caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: eob, lineItems: lines };
}
const provider = new MemoryBenchmarkProvider();

describe('EOB_PATIENT_RESP_MISMATCH', () => {
  it('flags when itemized patient responsibility exceeds the EOB adjudicated amount', async () => {
    const f = await eobPatientRespMismatch(claim([
      line({ lineId: 'a', patientRespCents: 40000 }),
      line({ lineId: 'b', patientRespCents: 20000 }),
    ], 30000), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('EOB_PATIENT_RESP_MISMATCH');
    expect(f[0].severity).toBe('high');
    expect(f[0].estimatedRecoveryLowCents).toBe(30000);
    expect(f[0].evidenceRefs.sort()).toEqual(['a', 'b']);
  });

  it('does NOT flag when itemized total is within the EOB amount', async () => {
    const f = await eobPatientRespMismatch(claim([line({ patientRespCents: 25000 })], 30000), provider);
    expect(f).toHaveLength(0);
  });

  it('does nothing when there is no EOB amount', async () => {
    const f = await eobPatientRespMismatch(claim([line({ patientRespCents: 99999 })], null), provider);
    expect(f).toHaveLength(0);
  });
});
