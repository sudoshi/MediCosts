import type { BenchmarkProvider } from './benchmarkProvider.js';
import type { ExtractedClaim, Finding } from '../types.js';
import { overchargeMedicareMultiple } from './rules/overchargeMedicareMultiple.js';
import { ncciUnbundling } from './rules/ncciUnbundling.js';
import { mueUnitExcess } from './rules/mueUnitExcess.js';
import { duplicateLine } from './rules/duplicateLine.js';
import { eobPatientRespMismatch } from './rules/eobPatientRespMismatch.js';

export type Rule = (claim: ExtractedClaim, provider: BenchmarkProvider) => Promise<Finding[]>;

/** Deterministic rules only. ⚠️ Statutory rules (NSA/501r/FDCPA/ERISA) added in a later plan after counsel review. */
export const DETERMINISTIC_RULES: ReadonlyArray<Rule> = [
  overchargeMedicareMultiple,
  ncciUnbundling,
  mueUnitExcess,
  duplicateLine,
  eobPatientRespMismatch,
];
