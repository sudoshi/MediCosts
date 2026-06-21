# Leverage Engine Core (Foundations + Deterministic Judge) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, LLM-free core of the medical-debt leverage engine — domain types, the `lev_*`/`ref_*` schema, a benchmark provider over the existing CMS warehouse, and five fully-tested deterministic leverage rules that turn an extracted medical claim into auditable Findings plus a leverage score.

**Architecture:** A new isolated `server/leverage/` TypeScript module. The `judge/` sub-module is pure and deterministic: rule functions take an `ExtractedClaim` plus a `BenchmarkProvider` and emit `Finding[]`; a scoring function rolls findings into a `CaseScore`. Benchmarks are resolved through an interface with two implementations — an in-memory one for tests and a Postgres-backed one for production — so the rules are unit-testable with zero database. No LLM touches the judgment path.

**Tech Stack:** Node 20+, TypeScript (NodeNext, strict), Express 4, PostgreSQL (`pg`), Vitest (new), existing `server/db.ts` pool and `server/lib/crypto.js`.

**Scope note:** This is Plan 1 of the "Intake + Leverage Engine" slice (spec: `docs/superpowers/specs/2026-06-21-leverage-engine-design.md`). It deliberately implements ONLY deterministic, non-statutory rules. The ⚠️ counsel-gated rules (NSA, 501(r), FDCPA/FCRA, ERISA) and the intake/extract/narrate/frontend subsystems are separate later plans (see "Follow-on Plans" at the end).

**Conventions for this codebase (follow exactly):**
- `"type": "module"`; TypeScript `module: NodeNext`. **Local imports MUST use the `.js` extension** even when the source file is `.ts` (e.g. `import { Finding } from './types.js'`). Existing code does this (`db-migrate.js` imports `'../db.js'`).
- All money is stored and computed as **integer cents** (`number`), never floats.
- No `console.log` in production code (lint rule); tests may use it sparingly.
- Immutable updates (spread), Zod at boundaries (later plans), `unknown` over `any`.
- Install with `npm install --legacy-peer-deps` (repo-wide peer-dep convention).

---

### Task 0: Add Vitest to the server

**Files:**
- Modify: `server/package.json`
- Create: `server/vitest.config.ts`
- Create: `server/leverage/__tests__/smoke.test.ts`

- [ ] **Step 1: Install vitest**

Run from repo root:
```bash
cd server && npm install -D --legacy-peer-deps vitest@^2.1.0 && cd ..
```
Expected: vitest added to `devDependencies`, no errors.

- [ ] **Step 2: Add the test script**

Edit `server/package.json` `scripts` to add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```
(Keep existing `dev`, `build`, `start`.)

- [ ] **Step 3: Create the vitest config**

Create `server/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['leverage/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['leverage/**/*.ts'],
      exclude: ['leverage/**/__tests__/**', 'leverage/**/*.test.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `server/leverage/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `cd server && npm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/vitest.config.ts server/leverage/__tests__/smoke.test.ts
git commit -m "test: add vitest to server with leverage coverage thresholds"
```

---

### Task 1: Domain types

**Files:**
- Create: `server/leverage/types.ts`
- Test: `server/leverage/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { emptyScore, type Finding, type ExtractedClaim } from '../types.js';

describe('domain types', () => {
  it('emptyScore is a zeroed, not-ready CaseScore', () => {
    expect(emptyScore()).toEqual({
      leverageScore: 0,
      strongestRemedy: null,
      totalEstimatedOverchargeCents: 0,
      marketplaceReady: false,
    });
  });

  it('a Finding and ExtractedClaim are structurally usable', () => {
    const claim: ExtractedClaim = {
      caseId: 'c1',
      insuranceStatus: 'insured',
      state: 'PA',
      facilityCcn: '390001',
      serviceYear: 2023,
      eobPatientRespCents: 5000,
      lineItems: [],
    };
    const f: Finding = {
      ruleId: 'X',
      severity: 'high',
      title: 't',
      statuteCitation: null,
      feeShiftingEligible: false,
      remedyType: 'billing_error',
      estimatedRecoveryLowCents: 0,
      estimatedRecoveryHighCents: 0,
      evidenceRefs: [],
      benchmarkSnapshot: null,
    };
    expect(claim.lineItems).toHaveLength(0);
    expect(f.ruleId).toBe('X');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/types.test.ts`
Expected: FAIL — cannot find module `'../types.js'`.

- [ ] **Step 3: Create the types**

Create `server/leverage/types.ts`:
```ts
export type InsuranceStatus = 'insured' | 'uninsured' | 'self_pay';
export type Severity = 'low' | 'medium' | 'high';
export type RemedyType = 'negotiation' | 'billing_error' | 'statutory_claim';

export interface LineItem {
  lineId: string;
  cptHcpcs: string | null;
  revenueCode: string | null;
  msDrg: string | null;
  modifier: string | null;
  units: number;
  billedCents: number;
  allowedCents: number | null;
  planPaidCents: number | null;
  patientRespCents: number | null;
  serviceDate: string | null; // ISO 'YYYY-MM-DD'
}

export interface ExtractedClaim {
  caseId: string;
  insuranceStatus: InsuranceStatus;
  state: string; // 2-letter
  facilityCcn: string | null;
  serviceYear: number; // benchmark vintage to compare against
  eobPatientRespCents: number | null; // total adjudicated patient responsibility from EOB, if available
  lineItems: LineItem[];
}

export type BenchmarkSource =
  | 'cms_pfs'
  | 'drg_base_rate'
  | 'mrf_negotiated'
  | 'ncci_ptp'
  | 'ncci_mue';

export interface BenchmarkSnapshot {
  source: BenchmarkSource;
  code: string;
  effectiveYear: number;
  valueCents: number | null; // populated for rate benchmarks
  detail: Record<string, unknown> | null; // e.g. { conflictingCode } or { mueMax }
}

export interface Finding {
  ruleId: string;
  severity: Severity;
  title: string;
  statuteCitation: string | null;
  feeShiftingEligible: boolean;
  remedyType: RemedyType;
  estimatedRecoveryLowCents: number;
  estimatedRecoveryHighCents: number;
  evidenceRefs: string[]; // lineIds involved
  benchmarkSnapshot: BenchmarkSnapshot | null;
}

export interface CaseScore {
  leverageScore: number; // 0-100
  strongestRemedy: RemedyType | null;
  totalEstimatedOverchargeCents: number;
  marketplaceReady: boolean;
}

export function emptyScore(): CaseScore {
  return {
    leverageScore: 0,
    strongestRemedy: null,
    totalEstimatedOverchargeCents: 0,
    marketplaceReady: false,
  };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/leverage/types.ts server/leverage/__tests__/types.test.ts
git commit -m "feat(leverage): domain types for claims, findings, and scores"
```

---

### Task 2: BenchmarkProvider interface + in-memory implementation

**Files:**
- Create: `server/leverage/judge/benchmarkProvider.ts`
- Create: `server/leverage/judge/memoryBenchmarkProvider.ts`
- Test: `server/leverage/__tests__/memoryBenchmarkProvider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/memoryBenchmarkProvider.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/memoryBenchmarkProvider.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the interface**

Create `server/leverage/judge/benchmarkProvider.ts`:
```ts
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
```

- [ ] **Step 4: Create the in-memory implementation**

Create `server/leverage/judge/memoryBenchmarkProvider.ts`:
```ts
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
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/memoryBenchmarkProvider.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/leverage/judge/benchmarkProvider.ts server/leverage/judge/memoryBenchmarkProvider.ts server/leverage/__tests__/memoryBenchmarkProvider.test.ts
git commit -m "feat(leverage): benchmark provider interface + in-memory impl"
```

---

### Task 3: Rule — OVERCHARGE_MEDICARE_MULTIPLE

**Files:**
- Create: `server/leverage/judge/config.ts`
- Create: `server/leverage/judge/rules/overchargeMedicareMultiple.ts`
- Test: `server/leverage/__tests__/overchargeMedicareMultiple.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/overchargeMedicareMultiple.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { overchargeMedicareMultiple } from '../judge/rules/overchargeMedicareMultiple.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return {
    lineId: 'l1', cptHcpcs: '99285', revenueCode: null, msDrg: null,
    modifier: null, units: 1, billedCents: 0, allowedCents: null,
    planPaidCents: null, patientRespCents: null, serviceDate: '2023-05-01',
    ...p,
  };
}
function claim(lines: LineItem[]): ExtractedClaim {
  return {
    caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: null, lineItems: lines,
  };
}

describe('OVERCHARGE_MEDICARE_MULTIPLE', () => {
  const provider = new MemoryBenchmarkProvider({ cmsPfs: { '99285:2023': 25000 } });

  it('flags a charge above the 4x Medicare threshold', async () => {
    const f = await overchargeMedicareMultiple(claim([line({ billedCents: 150000 })]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('OVERCHARGE_MEDICARE_MULTIPLE');
    expect(f[0].remedyType).toBe('negotiation');
    // overcharge = billed - cmsAllowed = 150000 - 25000
    expect(f[0].estimatedRecoveryLowCents).toBe(125000);
    expect(f[0].evidenceRefs).toEqual(['l1']);
    expect(f[0].benchmarkSnapshot).toEqual({
      source: 'cms_pfs', code: '99285', effectiveYear: 2023, valueCents: 25000, detail: { multiple: 6 },
    });
  });

  it('does NOT flag a charge at or below threshold', async () => {
    // 4x of 25000 = 100000; 90000 is below
    const f = await overchargeMedicareMultiple(claim([line({ billedCents: 90000 })]), provider);
    expect(f).toHaveLength(0);
  });

  it('skips lines with no CPT or no benchmark', async () => {
    const noCpt = await overchargeMedicareMultiple(claim([line({ cptHcpcs: null, billedCents: 999999 })]), provider);
    const noBench = await overchargeMedicareMultiple(claim([line({ cptHcpcs: '00000', billedCents: 999999 })]), provider);
    expect(noCpt).toHaveLength(0);
    expect(noBench).toHaveLength(0);
  });

  it('severity rises with multiple', async () => {
    const high = await overchargeMedicareMultiple(claim([line({ billedCents: 300000 })]), provider); // 12x
    expect(high[0].severity).toBe('high');
    const med = await overchargeMedicareMultiple(claim([line({ billedCents: 120000 })]), provider); // 4.8x
    expect(med[0].severity).toBe('medium');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/overchargeMedicareMultiple.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the threshold config**

Create `server/leverage/judge/config.ts`:
```ts
/** Tunable thresholds for deterministic rules. Configurable, not magic numbers. */
export const RULE_CONFIG = {
  /** Billed-to-Medicare multiple at/above which a charge is flagged. */
  overchargeMultipleThreshold: 4,
  /** Multiple at/above which the overcharge is rated 'high' severity. */
  overchargeHighMultiple: 8,
} as const;
```

- [ ] **Step 4: Create the rule**

Create `server/leverage/judge/rules/overchargeMedicareMultiple.ts`:
```ts
import type { BenchmarkProvider } from '../benchmarkProvider.js';
import type { ExtractedClaim, Finding, Severity } from '../../types.js';
import { RULE_CONFIG } from '../config.js';

const RULE_ID = 'OVERCHARGE_MEDICARE_MULTIPLE';

export async function overchargeMedicareMultiple(
  claim: ExtractedClaim,
  provider: BenchmarkProvider,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const line of claim.lineItems) {
    if (!line.cptHcpcs) continue;
    const allowed = await provider.cmsAllowedCents(line.cptHcpcs, claim.serviceYear);
    if (allowed === null || allowed <= 0) continue;

    const multiple = line.billedCents / allowed;
    if (multiple < RULE_CONFIG.overchargeMultipleThreshold) continue;

    const overcharge = line.billedCents - allowed;
    const severity: Severity = multiple >= RULE_CONFIG.overchargeHighMultiple ? 'high' : 'medium';
    findings.push({
      ruleId: RULE_ID,
      severity,
      title: `Charge is ${Math.round(multiple)}x the Medicare allowable for ${line.cptHcpcs}`,
      statuteCitation: null,
      feeShiftingEligible: false,
      remedyType: 'negotiation',
      estimatedRecoveryLowCents: overcharge,
      estimatedRecoveryHighCents: overcharge,
      evidenceRefs: [line.lineId],
      benchmarkSnapshot: {
        source: 'cms_pfs',
        code: line.cptHcpcs,
        effectiveYear: claim.serviceYear,
        valueCents: allowed,
        detail: { multiple: Math.round(multiple) },
      },
    });
  }
  return findings;
}
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/overchargeMedicareMultiple.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/leverage/judge/config.ts server/leverage/judge/rules/overchargeMedicareMultiple.ts server/leverage/__tests__/overchargeMedicareMultiple.test.ts
git commit -m "feat(leverage): OVERCHARGE_MEDICARE_MULTIPLE rule"
```

---

### Task 4: Rule — NCCI_UNBUNDLING

**Files:**
- Create: `server/leverage/judge/rules/ncciUnbundling.ts`
- Test: `server/leverage/__tests__/ncciUnbundling.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/ncciUnbundling.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ncciUnbundling } from '../judge/rules/ncciUnbundling.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return {
    lineId: 'l', cptHcpcs: null, revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 0, allowedCents: null, planPaidCents: null,
    patientRespCents: null, serviceDate: '2023-05-01', ...p,
  };
}
function claim(lines: LineItem[]): ExtractedClaim {
  return { caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: null, lineItems: lines };
}

describe('NCCI_UNBUNDLING', () => {
  const provider = new MemoryBenchmarkProvider({ ncciPtp: [['80053', '80048', 2023]] });

  it('flags a conflicting code pair billed without a modifier', async () => {
    const f = await ncciUnbundling(claim([
      line({ lineId: 'a', cptHcpcs: '80053', billedCents: 4000 }),
      line({ lineId: 'b', cptHcpcs: '80048', billedCents: 1500 }),
    ]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('NCCI_UNBUNDLING');
    expect(f[0].remedyType).toBe('billing_error');
    // recovery = the lesser-billed (improperly separate) line
    expect(f[0].estimatedRecoveryLowCents).toBe(1500);
    expect(f[0].evidenceRefs.sort()).toEqual(['a', 'b']);
    expect(f[0].benchmarkSnapshot?.detail).toEqual({ conflictingCode: '80048' });
  });

  it('does NOT flag when a valid 59 modifier is present', async () => {
    const f = await ncciUnbundling(claim([
      line({ lineId: 'a', cptHcpcs: '80053', billedCents: 4000 }),
      line({ lineId: 'b', cptHcpcs: '80048', billedCents: 1500, modifier: '59' }),
    ]), provider);
    expect(f).toHaveLength(0);
  });

  it('does NOT flag non-conflicting pairs', async () => {
    const f = await ncciUnbundling(claim([
      line({ lineId: 'a', cptHcpcs: '80053', billedCents: 4000 }),
      line({ lineId: 'b', cptHcpcs: '99285', billedCents: 1500 }),
    ]), provider);
    expect(f).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/ncciUnbundling.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the rule**

Create `server/leverage/judge/rules/ncciUnbundling.ts`:
```ts
import type { BenchmarkProvider } from '../benchmarkProvider.js';
import type { ExtractedClaim, Finding, LineItem } from '../../types.js';

const RULE_ID = 'NCCI_UNBUNDLING';
/** Modifiers that legitimately allow an NCCI PTP pair to be billed separately. */
const BYPASS_MODIFIERS = new Set(['59', 'XE', 'XS', 'XP', 'XU', '25', '57', '91']);

function hasBypass(line: LineItem): boolean {
  return line.modifier !== null && BYPASS_MODIFIERS.has(line.modifier);
}

export async function ncciUnbundling(
  claim: ExtractedClaim,
  provider: BenchmarkProvider,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const coded = claim.lineItems.filter((l) => l.cptHcpcs !== null);

  for (let i = 0; i < coded.length; i++) {
    for (let j = i + 1; j < coded.length; j++) {
      const a = coded[i];
      const b = coded[j];
      const conflict = await provider.ncciConflict(a.cptHcpcs!, b.cptHcpcs!, claim.serviceYear);
      if (!conflict) continue;
      if (hasBypass(a) || hasBypass(b)) continue;

      // The improperly-separated charge is the lesser-billed line of the pair.
      const lesser = a.billedCents <= b.billedCents ? a : b;
      const other = lesser === a ? b : a;
      findings.push({
        ruleId: RULE_ID,
        severity: 'medium',
        title: `Codes ${a.cptHcpcs} and ${b.cptHcpcs} were unbundled (NCCI PTP edit)`,
        statuteCitation: null,
        feeShiftingEligible: false,
        remedyType: 'billing_error',
        estimatedRecoveryLowCents: lesser.billedCents,
        estimatedRecoveryHighCents: lesser.billedCents,
        evidenceRefs: [a.lineId, b.lineId],
        benchmarkSnapshot: {
          source: 'ncci_ptp',
          code: lesser.cptHcpcs!,
          effectiveYear: claim.serviceYear,
          valueCents: null,
          detail: { conflictingCode: other.cptHcpcs },
        },
      });
    }
  }
  return findings;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/ncciUnbundling.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/leverage/judge/rules/ncciUnbundling.ts server/leverage/__tests__/ncciUnbundling.test.ts
git commit -m "feat(leverage): NCCI_UNBUNDLING rule"
```

---

### Task 5: Rule — MUE_UNIT_EXCESS

**Files:**
- Create: `server/leverage/judge/rules/mueUnitExcess.ts`
- Test: `server/leverage/__tests__/mueUnitExcess.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/mueUnitExcess.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mueUnitExcess } from '../judge/rules/mueUnitExcess.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return { lineId: 'l1', cptHcpcs: '99285', revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 0, allowedCents: null, planPaidCents: null,
    patientRespCents: null, serviceDate: '2023-05-01', ...p };
}
function claim(lines: LineItem[]): ExtractedClaim {
  return { caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: null, lineItems: lines };
}

describe('MUE_UNIT_EXCESS', () => {
  const provider = new MemoryBenchmarkProvider({ mue: { '99285:2023': 1 } });

  it('flags units above the MUE ceiling and prices the excess', async () => {
    // 3 units billed at 30000 total => 10000/unit; max 1 => 2 excess units => 20000
    const f = await mueUnitExcess(claim([line({ units: 3, billedCents: 30000 })]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('MUE_UNIT_EXCESS');
    expect(f[0].estimatedRecoveryLowCents).toBe(20000);
    expect(f[0].benchmarkSnapshot?.detail).toEqual({ mueMax: 1, billedUnits: 3 });
  });

  it('does NOT flag units within the ceiling', async () => {
    const f = await mueUnitExcess(claim([line({ units: 1, billedCents: 10000 })]), provider);
    expect(f).toHaveLength(0);
  });

  it('skips lines with no MUE benchmark or no CPT', async () => {
    const noBench = await mueUnitExcess(claim([line({ cptHcpcs: '00000', units: 9, billedCents: 9000 })]), provider);
    const noCpt = await mueUnitExcess(claim([line({ cptHcpcs: null, units: 9, billedCents: 9000 })]), provider);
    expect(noBench).toHaveLength(0);
    expect(noCpt).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/mueUnitExcess.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the rule**

Create `server/leverage/judge/rules/mueUnitExcess.ts`:
```ts
import type { BenchmarkProvider } from '../benchmarkProvider.js';
import type { ExtractedClaim, Finding } from '../../types.js';

const RULE_ID = 'MUE_UNIT_EXCESS';

export async function mueUnitExcess(
  claim: ExtractedClaim,
  provider: BenchmarkProvider,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const line of claim.lineItems) {
    if (!line.cptHcpcs || line.units <= 0) continue;
    const max = await provider.mueMax(line.cptHcpcs, claim.serviceYear);
    if (max === null || line.units <= max) continue;

    const perUnit = Math.round(line.billedCents / line.units);
    const excessUnits = line.units - max;
    const overcharge = perUnit * excessUnits;
    findings.push({
      ruleId: RULE_ID,
      severity: 'medium',
      title: `${line.units} units of ${line.cptHcpcs} billed; medically-unlikely-edit ceiling is ${max}`,
      statuteCitation: null,
      feeShiftingEligible: false,
      remedyType: 'billing_error',
      estimatedRecoveryLowCents: overcharge,
      estimatedRecoveryHighCents: overcharge,
      evidenceRefs: [line.lineId],
      benchmarkSnapshot: {
        source: 'ncci_mue',
        code: line.cptHcpcs,
        effectiveYear: claim.serviceYear,
        valueCents: null,
        detail: { mueMax: max, billedUnits: line.units },
      },
    });
  }
  return findings;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/mueUnitExcess.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/leverage/judge/rules/mueUnitExcess.ts server/leverage/__tests__/mueUnitExcess.test.ts
git commit -m "feat(leverage): MUE_UNIT_EXCESS rule"
```

---

### Task 6: Rule — DUPLICATE_LINE

**Files:**
- Create: `server/leverage/judge/rules/duplicateLine.ts`
- Test: `server/leverage/__tests__/duplicateLine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/duplicateLine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { duplicateLine } from '../judge/rules/duplicateLine.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return { lineId: 'l', cptHcpcs: '70450', revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 50000, allowedCents: null, planPaidCents: null,
    patientRespCents: null, serviceDate: '2023-05-01', ...p };
}
function claim(lines: LineItem[]): ExtractedClaim {
  return { caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: null, lineItems: lines };
}
const provider = new MemoryBenchmarkProvider();

describe('DUPLICATE_LINE', () => {
  it('flags identical code+date+units billed twice', async () => {
    const f = await duplicateLine(claim([
      line({ lineId: 'a' }),
      line({ lineId: 'b' }),
    ]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('DUPLICATE_LINE');
    expect(f[0].estimatedRecoveryLowCents).toBe(50000); // one duplicate removed
    expect(f[0].evidenceRefs.sort()).toEqual(['a', 'b']);
  });

  it('counts N copies as N-1 recoverable duplicates', async () => {
    const f = await duplicateLine(claim([
      line({ lineId: 'a' }), line({ lineId: 'b' }), line({ lineId: 'c' }),
    ]), provider);
    expect(f).toHaveLength(1);
    expect(f[0].estimatedRecoveryLowCents).toBe(100000); // 2 duplicates * 50000
  });

  it('does NOT flag different dates or codes', async () => {
    const diffDate = await duplicateLine(claim([
      line({ lineId: 'a' }), line({ lineId: 'b', serviceDate: '2023-05-02' }),
    ]), provider);
    const diffCode = await duplicateLine(claim([
      line({ lineId: 'a' }), line({ lineId: 'b', cptHcpcs: '70460' }),
    ]), provider);
    expect(diffDate).toHaveLength(0);
    expect(diffCode).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/duplicateLine.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the rule**

Create `server/leverage/judge/rules/duplicateLine.ts`:
```ts
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
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/duplicateLine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/leverage/judge/rules/duplicateLine.ts server/leverage/__tests__/duplicateLine.test.ts
git commit -m "feat(leverage): DUPLICATE_LINE rule"
```

---

### Task 7: Rule — EOB_PATIENT_RESP_MISMATCH

**Files:**
- Create: `server/leverage/judge/rules/eobPatientRespMismatch.ts`
- Test: `server/leverage/__tests__/eobPatientRespMismatch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/eobPatientRespMismatch.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { eobPatientRespMismatch } from '../judge/rules/eobPatientRespMismatch.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return { lineId: 'l', cptHcpcs: '99285', revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 0, allowedCents: null, planPaidCents: null,
    patientRespCents: 0, serviceDate: '2023-05-01', ...p };
}
function claim(lines: LineItem[], eob: number | null): ExtractedClaim {
  return { caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
    serviceYear: 2023, eobPatientRespCents: eob, lineItems: lines };
}
const provider = new MemoryBenchmarkProvider();

describe('EOB_PATIENT_RESP_MISMATCH', () => {
  it('flags when itemized patient responsibility exceeds the EOB adjudicated amount', async () => {
    const f = await eobPatientRespMismatch(claim([
      line({ lineId: 'a', patientRespCents: 40000 }),
      line({ lineId: 'b', patientRespCents: 20000 }),
    ], 30000), provider);
    expect(f).toHaveLength(1);
    expect(f[0].ruleId).toBe('EOB_PATIENT_RESP_MISMATCH');
    expect(f[0].severity).toBe('high');
    // 60000 billed to patient vs 30000 adjudicated => 30000 overcharge
    expect(f[0].estimatedRecoveryLowCents).toBe(30000);
    expect(f[0].evidenceRefs.sort()).toEqual(['a', 'b']);
  });

  it('does NOT flag when itemized total is within the EOB amount', async () => {
    const f = await eobPatientRespMismatch(claim([line({ patientRespCents: 25000 })], 30000), provider);
    expect(f).toHaveLength(0);
  });

  it('does nothing when there is no EOB amount', async () => {
    const f = await eobPatientRespMismatch(claim([line({ patientRespCents: 99999 })], null), provider);
    expect(f).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/eobPatientRespMismatch.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the rule**

Create `server/leverage/judge/rules/eobPatientRespMismatch.ts`:
```ts
import type { BenchmarkProvider } from '../benchmarkProvider.js';
import type { ExtractedClaim, Finding } from '../../types.js';

const RULE_ID = 'EOB_PATIENT_RESP_MISMATCH';

export async function eobPatientRespMismatch(
  claim: ExtractedClaim,
  _provider: BenchmarkProvider,
): Promise<Finding[]> {
  if (claim.eobPatientRespCents === null) return [];

  const itemized = claim.lineItems.filter((l) => l.patientRespCents !== null);
  if (itemized.length === 0) return [];

  const billedToPatient = itemized.reduce((sum, l) => sum + (l.patientRespCents ?? 0), 0);
  const overcharge = billedToPatient - claim.eobPatientRespCents;
  if (overcharge <= 0) return [];

  return [
    {
      ruleId: RULE_ID,
      severity: 'high',
      title: `Bill seeks $${(billedToPatient / 100).toFixed(2)} from the patient but the EOB adjudicated only $${(claim.eobPatientRespCents / 100).toFixed(2)}`,
      statuteCitation: null,
      feeShiftingEligible: false,
      remedyType: 'billing_error',
      estimatedRecoveryLowCents: overcharge,
      estimatedRecoveryHighCents: overcharge,
      evidenceRefs: itemized.map((l) => l.lineId),
      benchmarkSnapshot: null,
    },
  ];
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/eobPatientRespMismatch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/leverage/judge/rules/eobPatientRespMismatch.ts server/leverage/__tests__/eobPatientRespMismatch.test.ts
git commit -m "feat(leverage): EOB_PATIENT_RESP_MISMATCH rule"
```

---

### Task 8: Rule registry + `judgeCase` orchestrator

**Files:**
- Create: `server/leverage/judge/registry.ts`
- Create: `server/leverage/judge/judgeCase.ts`
- Test: `server/leverage/__tests__/judgeCase.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/judgeCase.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { judgeCase } from '../judge/judgeCase.js';
import { MemoryBenchmarkProvider } from '../judge/memoryBenchmarkProvider.js';
import type { ExtractedClaim, LineItem } from '../types.js';

function line(p: Partial<LineItem>): LineItem {
  return { lineId: 'l', cptHcpcs: '99285', revenueCode: null, msDrg: null, modifier: null,
    units: 1, billedCents: 0, allowedCents: null, planPaidCents: null,
    patientRespCents: null, serviceDate: '2023-05-01', ...p };
}

describe('judgeCase', () => {
  const provider = new MemoryBenchmarkProvider({
    cmsPfs: { '99285:2023': 25000 },
    mue: { '99285:2023': 1 },
  });

  it('runs all rules and aggregates findings deterministically', async () => {
    const claim: ExtractedClaim = {
      caseId: 'c1', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
      serviceYear: 2023, eobPatientRespCents: null,
      lineItems: [line({ lineId: 'a', units: 3, billedCents: 300000 })], // overcharge (12x) + MUE excess
    };
    const a = await judgeCase(claim, provider);
    const b = await judgeCase(claim, provider);
    const ids = a.map((f) => f.ruleId).sort();
    expect(ids).toContain('OVERCHARGE_MEDICARE_MULTIPLE');
    expect(ids).toContain('MUE_UNIT_EXCESS');
    expect(a).toEqual(b); // determinism
  });

  it('returns no findings for a clean claim', async () => {
    const clean: ExtractedClaim = {
      caseId: 'c2', insuranceStatus: 'insured', state: 'PA', facilityCcn: null,
      serviceYear: 2023, eobPatientRespCents: null,
      lineItems: [line({ lineId: 'a', units: 1, billedCents: 26000 })], // ~1.04x, within ceiling
    };
    expect(await judgeCase(clean, provider)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/judgeCase.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the registry**

Create `server/leverage/judge/registry.ts`:
```ts
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
```

- [ ] **Step 4: Create the orchestrator**

Create `server/leverage/judge/judgeCase.ts`:
```ts
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
```

- [ ] **Step 5: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/judgeCase.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add server/leverage/judge/registry.ts server/leverage/judge/judgeCase.ts server/leverage/__tests__/judgeCase.test.ts
git commit -m "feat(leverage): rule registry + deterministic judgeCase orchestrator"
```

---

### Task 9: Scoring rollup

**Files:**
- Create: `server/leverage/judge/scoreCase.ts`
- Test: `server/leverage/__tests__/scoreCase.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/scoreCase.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { scoreCase } from '../judge/scoreCase.js';
import type { Finding } from '../types.js';

function finding(p: Partial<Finding>): Finding {
  return { ruleId: 'R', severity: 'medium', title: 't', statuteCitation: null,
    feeShiftingEligible: false, remedyType: 'billing_error',
    estimatedRecoveryLowCents: 0, estimatedRecoveryHighCents: 0,
    evidenceRefs: [], benchmarkSnapshot: null, ...p };
}

describe('scoreCase', () => {
  it('an empty finding set is a zeroed, not-ready score', () => {
    expect(scoreCase([])).toEqual({
      leverageScore: 0, strongestRemedy: null,
      totalEstimatedOverchargeCents: 0, marketplaceReady: false,
    });
  });

  it('sums overcharge across findings', () => {
    const s = scoreCase([
      finding({ estimatedRecoveryLowCents: 10000 }),
      finding({ estimatedRecoveryLowCents: 5000 }),
    ]);
    expect(s.totalEstimatedOverchargeCents).toBe(15000);
  });

  it('is marketplaceReady only with at least one high-severity finding', () => {
    expect(scoreCase([finding({ severity: 'medium' })]).marketplaceReady).toBe(false);
    expect(scoreCase([finding({ severity: 'high' })]).marketplaceReady).toBe(true);
  });

  it('prefers statutory_claim as the strongest remedy when present', () => {
    const s = scoreCase([
      finding({ remedyType: 'negotiation' }),
      finding({ remedyType: 'statutory_claim', feeShiftingEligible: true, severity: 'high' }),
      finding({ remedyType: 'billing_error' }),
    ]);
    expect(s.strongestRemedy).toBe('statutory_claim');
  });

  it('caps the leverage score at 100', () => {
    const many = Array.from({ length: 20 }, () =>
      finding({ severity: 'high', feeShiftingEligible: true, estimatedRecoveryLowCents: 100000 }));
    expect(scoreCase(many).leverageScore).toBe(100);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/scoreCase.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the scorer**

Create `server/leverage/judge/scoreCase.ts`:
```ts
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
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/scoreCase.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite + coverage**

Run: `cd server && npm test -- --coverage`
Expected: all tests pass; `leverage/**` coverage ≥ thresholds in `vitest.config.ts`.

- [ ] **Step 6: Commit**

```bash
git add server/leverage/judge/scoreCase.ts server/leverage/__tests__/scoreCase.test.ts
git commit -m "feat(leverage): explainable case scoring rollup"
```

---

### Task 10: Schema migrations for `lev_*` and `ref_*` tables

**Files:**
- Create: `server/lib/leverage-migrate.js`
- Modify: `server/lib/db-migrate.js` (call the new migration)
- Test: `server/leverage/__tests__/leverageMigrateSql.test.ts`

> The codebase has no migration framework — schema is created via `CREATE TABLE IF NOT EXISTS` in `db-migrate.js`. We follow that exact pattern. We unit-test that the SQL is well-formed and idempotent in shape (string assertions), since a live DB isn't available in CI.

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/leverageMigrateSql.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { LEVERAGE_DDL } from '../../lib/leverage-migrate.js';

describe('leverage DDL', () => {
  it('creates every lev_* and ref_* table idempotently', () => {
    const required = [
      'lev_cases', 'lev_case_documents', 'lev_extracted_claims',
      'lev_extracted_line_items', 'lev_findings', 'lev_case_scores',
      'ref_ncci_edits', 'ref_cms_fee_schedule', 'ref_drg_base_rate',
    ];
    for (const t of required) {
      expect(LEVERAGE_DDL).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it('stores money as integer cents and snapshots/evidence as jsonb', () => {
    expect(LEVERAGE_DDL).toContain('billed_cents');
    expect(LEVERAGE_DDL).toContain('benchmark_snapshot JSONB');
    expect(LEVERAGE_DDL).toContain('evidence_refs JSONB');
  });

  it('scopes cases to a user via FK', () => {
    expect(LEVERAGE_DDL).toContain('REFERENCES users(id)');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/leverageMigrateSql.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the migration module**

Create `server/lib/leverage-migrate.js`:
```js
import pool from '../db.js';

/**
 * DDL for the leverage engine. Lives in the medicosts schema, prefixed lev_/ref_.
 * Money is integer cents. Findings carry frozen benchmark snapshots for auditability.
 * Exported as a string so it can be asserted in unit tests without a live DB.
 */
export const LEVERAGE_DDL = `
  CREATE TABLE IF NOT EXISTS lev_cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'intake',
    debt_total_cents BIGINT,
    provider_name   TEXT,
    facility_ccn    TEXT,
    service_date    DATE,
    service_year    INTEGER,
    insurance_status TEXT NOT NULL DEFAULT 'insured',
    state           CHAR(2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS lev_case_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     UUID NOT NULL REFERENCES lev_cases(id) ON DELETE CASCADE,
    doc_type    TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    sha256      TEXT NOT NULL,
    ocr_status  TEXT NOT NULL DEFAULT 'pending',
    phi_present BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS lev_extracted_claims (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id              UUID NOT NULL REFERENCES lev_cases(id) ON DELETE CASCADE,
    extraction_confidence NUMERIC(4,3),
    review_status        TEXT NOT NULL DEFAULT 'auto',
    eob_patient_resp_cents BIGINT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lev_extracted_line_items (
    id                 BIGSERIAL PRIMARY KEY,
    claim_id           UUID NOT NULL REFERENCES lev_extracted_claims(id) ON DELETE CASCADE,
    line_id            TEXT NOT NULL,
    cpt_hcpcs          TEXT,
    revenue_code       TEXT,
    ms_drg             TEXT,
    modifier           TEXT,
    units              INTEGER NOT NULL DEFAULT 1,
    billed_cents       BIGINT NOT NULL DEFAULT 0,
    allowed_cents      BIGINT,
    plan_paid_cents    BIGINT,
    patient_resp_cents BIGINT,
    service_date       DATE
  );

  CREATE TABLE IF NOT EXISTS lev_findings (
    id                  BIGSERIAL PRIMARY KEY,
    case_id             UUID NOT NULL REFERENCES lev_cases(id) ON DELETE CASCADE,
    rule_id             TEXT NOT NULL,
    severity            TEXT NOT NULL,
    title               TEXT NOT NULL,
    statute_citation    TEXT,
    fee_shifting_eligible BOOLEAN NOT NULL DEFAULT false,
    remedy_type         TEXT NOT NULL,
    estimated_recovery_low_cents  BIGINT NOT NULL DEFAULT 0,
    estimated_recovery_high_cents BIGINT NOT NULL DEFAULT 0,
    evidence_refs       JSONB NOT NULL DEFAULT '[]'::jsonb,
    benchmark_snapshot  JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lev_case_scores (
    case_id                        UUID PRIMARY KEY REFERENCES lev_cases(id) ON DELETE CASCADE,
    leverage_score                 INTEGER NOT NULL DEFAULT 0,
    strongest_remedy               TEXT,
    total_estimated_overcharge_cents BIGINT NOT NULL DEFAULT 0,
    marketplace_ready              BOOLEAN NOT NULL DEFAULT false,
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS ref_ncci_edits (
    id             BIGSERIAL PRIMARY KEY,
    edit_type      TEXT NOT NULL,          -- 'ptp' | 'mue'
    code_a         TEXT NOT NULL,
    code_b         TEXT,                   -- ptp only
    mue_max_units  INTEGER,                -- mue only
    effective_year INTEGER NOT NULL,
    UNIQUE (edit_type, code_a, code_b, effective_year)
  );

  CREATE TABLE IF NOT EXISTS ref_cms_fee_schedule (
    id             BIGSERIAL PRIMARY KEY,
    cpt_hcpcs      TEXT NOT NULL,
    allowed_cents  BIGINT NOT NULL,
    effective_year INTEGER NOT NULL,
    UNIQUE (cpt_hcpcs, effective_year)
  );

  CREATE TABLE IF NOT EXISTS ref_drg_base_rate (
    id             BIGSERIAL PRIMARY KEY,
    ms_drg         TEXT NOT NULL,
    base_rate_cents BIGINT NOT NULL,
    effective_year INTEGER NOT NULL,
    UNIQUE (ms_drg, effective_year)
  );
`;

const LEVERAGE_INDEXES = `
  CREATE INDEX IF NOT EXISTS lev_cases_user_idx ON lev_cases (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS lev_findings_case_idx ON lev_findings (case_id);
  CREATE INDEX IF NOT EXISTS lev_line_items_claim_idx ON lev_extracted_line_items (claim_id);
  CREATE INDEX IF NOT EXISTS ref_cms_fee_idx ON ref_cms_fee_schedule (cpt_hcpcs, effective_year);
  CREATE INDEX IF NOT EXISTS ref_drg_idx ON ref_drg_base_rate (ms_drg, effective_year);
  CREATE INDEX IF NOT EXISTS ref_ncci_idx ON ref_ncci_edits (edit_type, code_a, effective_year);
`;

export async function runLeverageMigrations() {
  await pool.query(LEVERAGE_DDL);
  await pool.query(LEVERAGE_INDEXES);
  console.log('✦ leverage (lev_/ref_) tables ready');
}
```

- [ ] **Step 4: Wire it into the main migration runner**

In `server/lib/db-migrate.js`, add this import at the top (after the existing `import pool from '../db.js';`):
```js
import { runLeverageMigrations } from './leverage-migrate.js';
```
Then at the END of the `runMigrations()` function body (after the `ai_providers` block's `console.log`), add:
```js
  await runLeverageMigrations();
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/leverageMigrateSql.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the type-check still passes**

Run: `cd server && npx tsc -p tsconfig.json --noEmit`
Expected: no errors. (The new `.js` migration file is plain JS; `.ts` leverage files type-check clean.)

- [ ] **Step 7: Commit**

```bash
git add server/lib/leverage-migrate.js server/lib/db-migrate.js server/leverage/__tests__/leverageMigrateSql.test.ts
git commit -m "feat(leverage): lev_/ref_ schema migrations wired into db-migrate"
```

---

### Task 11: Postgres-backed BenchmarkProvider

**Files:**
- Create: `server/leverage/judge/pgBenchmarkProvider.ts`
- Test: `server/leverage/__tests__/pgBenchmarkProvider.test.ts`

> Tested with an injected fake query function (no live DB). Production wiring passes the real `pool.query`.

- [ ] **Step 1: Write the failing test**

Create `server/leverage/__tests__/pgBenchmarkProvider.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd server && npx vitest run leverage/__tests__/pgBenchmarkProvider.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create the provider**

Create `server/leverage/judge/pgBenchmarkProvider.ts`:
```ts
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
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `cd server && npx vitest run leverage/__tests__/pgBenchmarkProvider.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full suite, coverage, and type-check**

Run: `cd server && npm test -- --coverage && npx tsc -p tsconfig.json --noEmit`
Expected: all tests pass, coverage ≥ thresholds, no type errors.

- [ ] **Step 6: Commit**

```bash
git add server/leverage/judge/pgBenchmarkProvider.ts server/leverage/__tests__/pgBenchmarkProvider.test.ts
git commit -m "feat(leverage): Postgres-backed benchmark provider"
```

---

## Self-Review (completed by plan author)

**Spec coverage (this plan = Foundations + Judge from the spec):**
- Spec §3 module boundaries → `server/leverage/` with isolated `judge/` ✓ (Tasks 1–9)
- Spec §4 data model (`lev_*`, `ref_*`, integer cents, jsonb snapshot) → Task 10 ✓
- Spec §5 rule catalog → deterministic subset implemented (Tasks 3–7); ⚠️ statutory rules explicitly deferred ✓ (documented in registry + Follow-on Plans)
- Spec §6 deterministic `judge` with frozen benchmark snapshots → `benchmarkSnapshot` on every rate finding + `judgeCase` determinism test ✓ (Tasks 3, 8)
- Spec §11 success criteria #2 (every finding traces to a rule + frozen benchmark) and #3 (`judge` deterministic, ≥80% covered) → covered by Tasks 3–11 + coverage gate ✓
- Spec §6 extract/§7 intake/§8 marketplace/§9 narrate/§10 frontend → **out of scope for this plan** (Follow-on Plans) ✓

**Placeholder scan:** none — every code step is complete and runnable.

**Type consistency:** `Finding`, `ExtractedClaim`, `LineItem`, `CaseScore`, `BenchmarkSnapshot`, `BenchmarkProvider` signatures are identical across Tasks 1–11. Rule signature `(claim, provider) => Promise<Finding[]>` matches the `Rule` type in the registry (Task 8) and every rule (Tasks 3–7). Money is integer cents everywhere.

---

## Follow-on Plans (separate spec→plan→build cycles, in order)

1. **Reference-data loaders** — ETL to populate `ref_cms_fee_schedule`, `ref_drg_base_rate`, `ref_ncci_edits` from CMS source files (PFS, IPPS, NCCI PTP/MUE tables); wire `PgBenchmarkProvider` into a production factory; add MRF-negotiated-rate lookup (`OVERCHARGE_VS_MRF`) over the existing ClearNetwork tables.
2. **Statutory rules (counsel-gated)** — implement the ⚠️ rules (NSA balance-bill/GFE, 501(r) AGB/ECA, FDCPA/FCRA, ERISA §502) only after §12 legal verification; these set `feeShiftingEligible`/`statuteCitation` and are state-scoped.
3. **Intake + Evidence Vault** — `lev_cases`/`lev_case_documents` REST, multer upload, AES-256-GCM-at-rest storage outside Postgres, consent gating, `requireCaseOwner` authz.
4. **Extract** — Claude-vision document→`ExtractedClaim` with confidence + `needs_review` queue; persistence into `lev_extracted_claims`/`lev_extracted_line_items`.
5. **Narrate + pipeline orchestration** — async idempotent intake→extract→judge→narrate; persist findings + score; Claude narrates strictly from findings.
6. **De-identified projection + marketplace seam** — `lev_case_public_view`, `MarketplaceGateway` stub.
7. **Frontend** — `CaseIntake`, `CaseAnalysis`, `MyCases`.
