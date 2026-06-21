import type { BenchmarkProvider } from './benchmarkProvider.js';
import type { ExtractedClaim, Finding } from '../types.js';
import { DETERMINISTIC_RULES, type Rule } from './registry.js';

/**
 * Runs every deterministic rule over a claim and returns the aggregated findings.
 * Order is stable (registry order, then per-rule order) so output is reproducible.
 */
export async function judgeCase(
  claim: ExtractedClaim,
  provider: BenchmarkProvider,
  rules: ReadonlyArray<Rule> = DETERMINISTIC_RULES,
): Promise<Finding[]> {
  const all: Finding[] = [];
  for (const rule of rules) {
    const found = await rule(claim, provider);
    all.push(...found);
  }
  return all;
}
