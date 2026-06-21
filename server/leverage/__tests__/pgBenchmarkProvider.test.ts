import { describe, it, expect, vi } from 'vitest';
import { PgBenchmarkProvider } from '../judge/pgBenchmarkProvider.js';

describe('PgBenchmarkProvider', () => {
  it('queries ref_cms_fee_schedule and returns cents', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ allowed_cents: '25000' }] });
    const p = new PgBenchmarkProvider(query);
    expect(await p.cmsAllowedCents('99285', 2023)).toBe(25000);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ref_cms_fee_schedule'),
      ['99285', 2023],
    );
  });

  it('returns null when no row is found', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const p = new PgBenchmarkProvider(query);
    expect(await p.drgBaseRateCents('470', 2023)).toBeNull();
  });

  it('detects an NCCI PTP conflict from a count row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ n: '1' }] });
    const p = new PgBenchmarkProvider(query);
    expect(await p.ncciConflict('80053', '80048', 2023)).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ref_ncci_edits'),
      ['80053', '80048', 2023],
    );
  });

  it('returns the MUE ceiling as a number', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ mue_max_units: 1 }] });
    const p = new PgBenchmarkProvider(query);
    expect(await p.mueMax('99285', 2023)).toBe(1);
  });
});
