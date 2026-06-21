import { describe, it, expect } from 'vitest';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';

describe('MemoryBenchmarkProvider', () => {
  it('returns seeded CMS allowed amounts and null for unknowns', async () => {
    const p = new MemoryBenchmarkProvider({
      cmsPfs: { '99285:2023': 25000 },
    });
    expect(await p.cmsAllowedCents('99285', 2023)).toBe(25000);
    expect(await p.cmsAllowedCents('00000', 2023)).toBeNull();
  });

  it('returns DRG base rates', async () => {
    const p = new MemoryBenchmarkProvider({ drg: { '470:2023': 1200000 } });
    expect(await p.drgBaseRateCents('470', 2023)).toBe(1200000);
  });

  it('detects NCCI PTP conflicts symmetrically', async () => {
    const p = new MemoryBenchmarkProvider({ ncciPtp: [['80053', '80048', 2023]] });
    expect(await p.ncciConflict('80053', '80048', 2023)).toBe(true);
    expect(await p.ncciConflict('80048', '80053', 2023)).toBe(true);
    expect(await p.ncciConflict('80053', '99285', 2023)).toBe(false);
  });

  it('returns MUE unit ceilings', async () => {
    const p = new MemoryBenchmarkProvider({ mue: { '99285:2023': 1 } });
    expect(await p.mueMax('99285', 2023)).toBe(1);
    expect(await p.mueMax('99999', 2023)).toBeNull();
  });
});
