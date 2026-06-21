/**
 * Resolves the reference prices and coding edits a rule compares against.
 * Two implementations: MemoryBenchmarkProvider (tests) and PgBenchmarkProvider (prod).
 * All amounts are integer cents.
 */
export interface BenchmarkProvider {
  cmsAllowedCents(cptHcpcs: string, year: number): Promise<number | null>;
  drgBaseRateCents(msDrg: string, year: number): Promise<number | null>;
  ncciConflict(codeA: string, codeB: string, year: number): Promise<boolean>;
  mueMax(cptHcpcs: string, year: number): Promise<number | null>;
}
