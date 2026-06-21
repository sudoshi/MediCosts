import type { BenchmarkProvider } from './benchmarkProvider.js';

interface Seed {
  cmsPfs?: Record<string, number>; // key `${code}:${year}` -> cents
  drg?: Record<string, number>; // key `${drg}:${year}` -> cents
  ncciPtp?: Array<[string, string, number]>; // [codeA, codeB, year]
  mue?: Record<string, number>; // key `${code}:${year}` -> max units
}

export class MemoryBenchmarkProvider implements BenchmarkProvider {
  private readonly seed: Required<Seed>;

  constructor(seed: Seed = {}) {
    this.seed = {
      cmsPfs: seed.cmsPfs ?? {},
      drg: seed.drg ?? {},
      ncciPtp: seed.ncciPtp ?? [],
      mue: seed.mue ?? {},
    };
  }

  async cmsAllowedCents(cptHcpcs: string, year: number): Promise<number | null> {
    return this.seed.cmsPfs[`${cptHcpcs}:${year}`] ?? null;
  }

  async drgBaseRateCents(msDrg: string, year: number): Promise<number | null> {
    return this.seed.drg[`${msDrg}:${year}`] ?? null;
  }

  async ncciConflict(codeA: string, codeB: string, year: number): Promise<boolean> {
    return this.seed.ncciPtp.some(
      ([a, b, y]) =>
        y === year &&
        ((a === codeA && b === codeB) || (a === codeB && b === codeA)),
    );
  }

  async mueMax(cptHcpcs: string, year: number): Promise<number | null> {
    return this.seed.mue[`${cptHcpcs}:${year}`] ?? null;
  }
}
