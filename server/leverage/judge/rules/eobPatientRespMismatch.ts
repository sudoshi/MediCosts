import type { BenchmarkProvider } from '../benchmarkProvider.js';
import type { ExtractedClaim, Finding } from '../../types.js';

const RULE_ID = 'EOB_PATIENT_RESP_MISMATCH';

export async function eobPatientRespMismatch(
  claim: ExtractedClaim,
  _provider: BenchmarkProvider,
): Promise<Finding[]> {
  if (claim.eobPatientRespCents === null) return [];

  const itemized = claim.lineItems.filter((l) => l.patientRespCents !== null);
  if (itemized.length === 0) return [];

  const billedToPatient = itemized.reduce((sum, l) => sum + (l.patientRespCents ?? 0), 0);
  const overcharge = billedToPatient - claim.eobPatientRespCents;
  if (overcharge <= 0) return [];

  return [
    {
      ruleId: RULE_ID,
      severity: 'high',
      title: `Bill seeks $${(billedToPatient / 100).toFixed(2)} from the patient but the EOB adjudicated only $${(claim.eobPatientRespCents / 100).toFixed(2)}`,
      statuteCitation: null,
      feeShiftingEligible: false,
      remedyType: 'billing_error',
      estimatedRecoveryLowCents: overcharge,
      estimatedRecoveryHighCents: overcharge,
      evidenceRefs: itemized.map((l) => l.lineId),
      benchmarkSnapshot: null,
    },
  ];
}
