/** Tunable thresholds for deterministic rules. Configurable, not magic numbers. */
export const RULE_CONFIG = {
  /** Billed-to-Medicare multiple at/above which a charge is flagged. */
  overchargeMultipleThreshold: 4,
  /** Multiple at/above which the overcharge is rated 'high' severity. */
  overchargeHighMultiple: 8,
} as const;
