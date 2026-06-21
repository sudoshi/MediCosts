import type { CaseScore, Finding, RemedyType, Severity } from '../types.js';
import { emptyScore } from '../types.js';

const SEVERITY_POINTS: Record<Severity, number> = { low: 5, medium: 12, high: 25 };
const FEE_SHIFT_BONUS = 15;
/** Higher index = stronger remedy. */
const REMEDY_RANK: Record<RemedyType, number> = {
  negotiation: 0,
  billing_error: 1,
  statutory_claim: 2,
};

export function scoreCase(findings: Finding[]): CaseScore {
  if (findings.length === 0) return emptyScore();

  let points = 0;
  let totalOvercharge = 0;
  let strongest: RemedyType | null = null;
  let hasHigh = false;

  for (const f of findings) {
    points += SEVERITY_POINTS[f.severity];
    if (f.feeShiftingEligible) points += FEE_SHIFT_BONUS;
    totalOvercharge += f.estimatedRecoveryLowCents;
    if (f.severity === 'high') hasHigh = true;
    if (strongest === null || REMEDY_RANK[f.remedyType] > REMEDY_RANK[strongest]) {
      strongest = f.remedyType;
    }
  }

  return {
    leverageScore: Math.min(100, points),
    strongestRemedy: strongest,
    totalEstimatedOverchargeCents: totalOvercharge,
    marketplaceReady: hasHigh,
  };
}
