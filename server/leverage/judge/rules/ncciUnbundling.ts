import type { BenchmarkProvider } from '../benchmarkProvider.js';
import type { ExtractedClaim, Finding, LineItem } from '../../types.js';

const RULE_ID = 'NCCI_UNBUNDLING';
/** Modifiers that legitimately allow an NCCI PTP pair to be billed separately. */
const BYPASS_MODIFIERS = new Set(['59', 'XE', 'XS', 'XP', 'XU', '25', '57', '91']);

function hasBypass(line: LineItem): boolean {
  return line.modifier !== null && BYPASS_MODIFIERS.has(line.modifier);
}

export async function ncciUnbundling(
  claim: ExtractedClaim,
  provider: BenchmarkProvider,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const coded = claim.lineItems.filter((l) => l.cptHcpcs !== null);

  for (let i = 0; i < coded.length; i++) {
    for (let j = i + 1; j < coded.length; j++) {
      const a = coded[i];
      const b = coded[j];
      const conflict = await provider.ncciConflict(a.cptHcpcs!, b.cptHcpcs!, claim.serviceYear);
      if (!conflict) continue;
      if (hasBypass(a) || hasBypass(b)) continue;

      // The improperly-separated charge is the lesser-billed line of the pair.
      const lesser = a.billedCents <= b.billedCents ? a : b;
      const other = lesser === a ? b : a;
      findings.push({
        ruleId: RULE_ID,
        severity: 'medium',
        title: `Codes ${a.cptHcpcs} and ${b.cptHcpcs} were unbundled (NCCI PTP edit)`,
        statuteCitation: null,
        feeShiftingEligible: false,
        remedyType: 'billing_error',
        estimatedRecoveryLowCents: lesser.billedCents,
        estimatedRecoveryHighCents: lesser.billedCents,
        evidenceRefs: [a.lineId, b.lineId],
        benchmarkSnapshot: {
          source: 'ncci_ptp',
          code: lesser.cptHcpcs!,
          effectiveYear: claim.serviceYear,
          valueCents: null,
          detail: { conflictingCode: other.cptHcpcs },
        },
      });
    }
  }
  return findings;
}
