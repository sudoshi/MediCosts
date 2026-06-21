import type { BenchmarkProvider } from './benchmarkProvider.js';

/** Minimal shape of pg's pool.query we depend on (keeps this unit-testable). */
export type QueryFn = (
  text: string,
  params: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

function toCents(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export class PgBenchmarkProvider implements BenchmarkProvider {
  constructor(private readonly query: QueryFn) {}

  async cmsAllowedCents(cptHcpcs: string, year: number): Promise<number | null> {
    const { rows } = await this.query(
      'SELECT allowed_cents FROM ref_cms_fee_schedule WHERE cpt_hcpcs = $1 AND effective_year = $2 LIMIT 1',
      [cptHcpcs, year],
    );
    return rows.length ? toCents(rows[0].allowed_cents) : null;
  }

  async drgBaseRateCents(msDrg: string, year: number): Promise<number | null> {
    const { rows } = await this.query(
      'SELECT base_rate_cents FROM ref_drg_base_rate WHERE ms_drg = $1 AND effective_year = $2 LIMIT 1',
      [msDrg, year],
    );
    return rows.length ? toCents(rows[0].base_rate_cents) : null;
  }

  async ncciConflict(codeA: string, codeB: string, year: number): Promise<boolean> {
    const { rows } = await this.query(
      `SELECT count(*)::int AS n FROM ref_ncci_edits
       WHERE edit_type = 'ptp' AND effective_year = $3
         AND ((code_a = $1 AND code_b = $2) OR (code_a = $2 AND code_b = $1))`,
      [codeA, codeB, year],
    );
    return Number(rows[0]?.n ?? 0) > 0;
  }

  async mueMax(cptHcpcs: string, year: number): Promise<number | null> {
    const { rows } = await this.query(
      `SELECT mue_max_units FROM ref_ncci_edits
       WHERE edit_type = 'mue' AND code_a = $1 AND effective_year = $2 LIMIT 1`,
      [cptHcpcs, year],
    );
    if (!rows.length) return null;
    const v = rows[0].mue_max_units;
    return typeof v === 'number' ? v : v === null || v === undefined ? null : Number(v);
  }
}
