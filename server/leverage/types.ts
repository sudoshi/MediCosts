export type InsuranceStatus = 'insured' | 'uninsured' | 'self_pay';
export type Severity = 'low' | 'medium' | 'high';
export type RemedyType = 'negotiation' | 'billing_error' | 'statutory_claim';

export interface LineItem {
  lineId: string;
  cptHcpcs: string | null;
  revenueCode: string | null;
  msDrg: string | null;
  modifier: string | null; // primary modifier only; multi-modifier (CMS-1500 allows 4) deferred to the extraction plan
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
