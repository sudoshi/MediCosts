import type { BenchmarkProvider } from '../benchmarkProvider.js';
import type { ExtractedClaim, Finding, LineItem } from '../../types.js';

const RULE_ID = 'DUPLICATE_LINE';

function dupKey(l: LineItem): string {
  return `${l.cptHcpcs ?? '∅'}|${l.serviceDate ?? '∅'}|${l.units}|${l.billedCents}`;
}

export async function duplicateLine(
  claim: ExtractedClaim,
  _provider: BenchmarkProvider,
): Promise<Finding[]> {
  const groups = new Map<string, LineItem[]>();
  for (const line of claim.lineItems) {
    if (!line.cptHcpcs) continue;
    const key = dupKey(line);
    const arr = groups.get(key) ?? [];
    arr.push(line);
    groups.set(key, arr);
  }

  const findings: Finding[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const duplicates = members.length - 1;
    const overcharge = members[0].billedCents * duplicates;
    findings.push({
      ruleId: RULE_ID,
      severity: 'medium',
      title: `${members.length} identical charges for ${members[0].cptHcpcs} on ${members[0].serviceDate}`,
      statuteCitation: null,
      feeShiftingEligible: false,
      remedyType: 'billing_error',
      estimatedRecoveryLowCents: overcharge,
      estimatedRecoveryHighCents: overcharge,
      evidenceRefs: members.map((m) => m.lineId),
      benchmarkSnapshot: null,
    });
  }
  return findings;
}
