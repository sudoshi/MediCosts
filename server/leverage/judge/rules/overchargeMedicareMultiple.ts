import type { BenchmarkProvider } from '../benchmarkProvider.js';
import type { ExtractedClaim, Finding, Severity } from '../../types.js';
import { RULE_CONFIG } from '../config.js';

const RULE_ID = 'OVERCHARGE_MEDICARE_MULTIPLE';

export async function overchargeMedicareMultiple(
  claim: ExtractedClaim,
  provider: BenchmarkProvider,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const line of claim.lineItems) {
    if (!line.cptHcpcs) continue;
    const allowed = await provider.cmsAllowedCents(line.cptHcpcs, claim.serviceYear);
    if (allowed === null || allowed <= 0) continue;

    const multiple = line.billedCents / allowed;
    if (multiple < RULE_CONFIG.overchargeMultipleThreshold) continue;

    const overcharge = line.billedCents - allowed;
    const severity: Severity = multiple >= RULE_CONFIG.overchargeHighMultiple ? 'high' : 'medium';
    findings.push({
      ruleId: RULE_ID,
      severity,
      title: `Charge is ${Math.round(multiple)}x the Medicare allowable for ${line.cptHcpcs}`,
      statuteCitation: null,
      feeShiftingEligible: false,
      remedyType: 'negotiation',
      estimatedRecoveryLowCents: overcharge,
      estimatedRecoveryHighCents: overcharge,
      evidenceRefs: [line.lineId],
      benchmarkSnapshot: {
        source: 'cms_pfs',
        code: line.cptHcpcs,
        effectiveYear: claim.serviceYear,
        valueCents: allowed,
        detail: { multiple: Math.round(multiple) },
      },
    });
  }
  return findings;
}
