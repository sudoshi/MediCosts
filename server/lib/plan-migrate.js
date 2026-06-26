/**
 * Plan identity and outcome attribution schema. This is the first foundation
 * for tying consumer case outcomes to payer, plan, product, network, and year.
 */
export const PLAN_DDL = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS plan_coverage_profiles (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id               UUID NOT NULL REFERENCES con_cases(id) ON DELETE CASCADE,
    coverage_type         TEXT NOT NULL DEFAULT 'commercial',
    market_segment        TEXT,
    funding_type          TEXT,
    state                 CHAR(2),
    plan_year             INTEGER,
    payer_legal_name      TEXT,
    payer_trade_name      TEXT,
    issuer_hios_id        TEXT,
    hios_plan_id          TEXT,
    cms_contract_id       TEXT,
    cms_plan_id           TEXT,
    plan_name             TEXT,
    product_type          TEXT,
    metal_level           TEXT,
    network_type          TEXT,
    network_name          TEXT,
    group_number_hash     TEXT,
    member_id_hash        TEXT,
    employer_name_hash    TEXT,
    tpa_name              TEXT,
    pbm_name              TEXT,
    identity_confidence   NUMERIC(4,3) NOT NULL DEFAULT 0.000,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS plan_outcome_attributions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                 UUID NOT NULL REFERENCES con_cases(id) ON DELETE CASCADE,
    coverage_profile_id     UUID REFERENCES plan_coverage_profiles(id) ON DELETE SET NULL,
    finding_id              BIGINT REFERENCES lev_findings(id) ON DELETE SET NULL,
    outcome_type            TEXT NOT NULL,
    attribution_type        TEXT NOT NULL,
    attribution_confidence  NUMERIC(4,3) NOT NULL DEFAULT 0.000,
    attribution_basis       TEXT NOT NULL,
    payer_legal_name        TEXT,
    payer_trade_name        TEXT,
    plan_identifier         TEXT,
    plan_year               INTEGER,
    network_name            TEXT,
    summary                 TEXT NOT NULL,
    evidence_refs           JSONB NOT NULL DEFAULT '[]'::jsonb,
    review_status           TEXT NOT NULL DEFAULT 'draft',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS plan_coverage_extraction_candidates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id               UUID NOT NULL REFERENCES con_cases(id) ON DELETE CASCADE,
    coverage_profile_id   UUID REFERENCES plan_coverage_profiles(id) ON DELETE SET NULL,
    source_document_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
    candidate_profile     JSONB NOT NULL DEFAULT '{}'::jsonb,
    sensitive_hashes      JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence_refs         JSONB NOT NULL DEFAULT '[]'::jsonb,
    extraction_method     TEXT NOT NULL DEFAULT 'text_regex_v1',
    extraction_status     TEXT NOT NULL DEFAULT 'candidate',
    review_status         TEXT NOT NULL DEFAULT 'needs_confirmation',
    confidence            NUMERIC(4,3) NOT NULL DEFAULT 0.000,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at           TIMESTAMPTZ,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const PLAN_INDEXES = `
  CREATE UNIQUE INDEX IF NOT EXISTS plan_coverage_profiles_case_uniq
    ON plan_coverage_profiles (case_id);
  CREATE INDEX IF NOT EXISTS plan_coverage_profiles_user_idx
    ON plan_coverage_profiles (user_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS plan_coverage_profiles_payer_plan_idx
    ON plan_coverage_profiles (payer_legal_name, plan_name, plan_year);
  CREATE INDEX IF NOT EXISTS plan_outcome_attributions_case_idx
    ON plan_outcome_attributions (case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS plan_outcome_attributions_profile_idx
    ON plan_outcome_attributions (coverage_profile_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS plan_outcome_attributions_type_idx
    ON plan_outcome_attributions (attribution_type, outcome_type, created_at DESC);
  CREATE INDEX IF NOT EXISTS plan_coverage_extraction_candidates_case_idx
    ON plan_coverage_extraction_candidates (case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS plan_coverage_extraction_candidates_review_idx
    ON plan_coverage_extraction_candidates (review_status, created_at DESC);
`;

export async function runPlanMigrations() {
  const { default: pool } = await import('../db.js');
  await pool.query(PLAN_DDL);
  await pool.query(PLAN_INDEXES);
  console.log('plan identity and attribution (plan_*) tables ready');
}
