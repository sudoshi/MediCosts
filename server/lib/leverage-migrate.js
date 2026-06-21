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
    evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    benchmark_snapshot JSONB,
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
    edit_type      TEXT NOT NULL,
    code_a         TEXT NOT NULL,
    code_b         TEXT,
    mue_max_units  INTEGER,
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
  CREATE UNIQUE INDEX IF NOT EXISTS ref_ncci_mue_uniq ON ref_ncci_edits (code_a, effective_year) WHERE edit_type = 'mue' AND code_b IS NULL;
`;

export async function runLeverageMigrations() {
  // Lazy pool import: keeps this module side-effect-free so the DDL constants
  // can be unit-tested without resolving or opening a database connection.
  const { default: pool } = await import('../db.js');
  await pool.query(LEVERAGE_DDL);
  await pool.query(LEVERAGE_INDEXES);
  console.log('✦ leverage (lev_/ref_) tables ready');
}
