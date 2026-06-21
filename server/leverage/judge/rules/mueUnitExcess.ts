import type { BenchmarkProvider } from '../benchmarkProvider.js';
import type { ExtractedClaim, Finding } from '../../types.js';

const RULE_ID = 'MUE_UNIT_EXCESS';

export async function mueUnitExcess(
  claim: ExtractedClaim,
  provider: BenchmarkProvider,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const line of claim.lineItems) {
    if (!line.cptHcpcs || line.units <= 0) continue;
    const max = await provider.mueMax(line.cptHcpcs, claim.serviceYear);
    if (max === null || line.units <= max) continue;

    const perUnit = Math.round(line.billedCents / line.units);
    const excessUnits = line.units - max;
    const overcharge = perUnit * excessUnits;
    findings.push({
      ruleId: RULE_ID,
      severity: 'medium',
      title: `${line.units} units of ${line.cptHcpcs} billed; medically-unlikely-edit ceiling is ${max}`,
      statuteCitation: null,
      feeShiftingEligible: false,
      remedyType: 'billing_error',
      estimatedRecoveryLowCents: overcharge,
      estimatedRecoveryHighCents: overcharge,
      evidenceRefs: [line.lineId],
      benchmarkSnapshot: {
        source: 'ncci_mue',
        code: line.cptHcpcs,
        effectiveYear: claim.serviceYear,
        valueCents: null,
        detail: { mueMax: max, billedUnits: line.units },
      },
    });
  }
  return findings;
}
