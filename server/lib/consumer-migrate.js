/**
 * Consumer advocacy schema. These tables are additive and intentionally
 * isolated with con_* prefixes so they can wrap the existing leverage engine.
 */
export const CONSUMER_DDL = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS con_cases (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_type          TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'draft',
    title              TEXT NOT NULL,
    state              CHAR(2),
    priority           TEXT NOT NULL DEFAULT 'normal',
    service_start_date DATE,
    service_end_date   DATE,
    facility_ccn       TEXT,
    provider_npi       TEXT,
    payer_name         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at          TIMESTAMPTZ,
    deleted_at         TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS con_case_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id       UUID NOT NULL REFERENCES con_cases(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,
    event_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_type    TEXT NOT NULL DEFAULT 'user',
    actor_id      TEXT,
    summary       TEXT NOT NULL,
    evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS con_case_outcomes (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id            UUID NOT NULL REFERENCES con_cases(id) ON DELETE CASCADE,
    outcome_type       TEXT NOT NULL,
    outcome_status     TEXT NOT NULL DEFAULT 'reported',
    amount_cents       BIGINT,
    harm_category      TEXT,
    resolved_at        TIMESTAMPTZ,
    resolution_summary TEXT,
    evidence_refs      JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS con_consent_grants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id         UUID REFERENCES con_cases(id) ON DELETE CASCADE,
    consent_type    TEXT NOT NULL,
    scope           JSONB NOT NULL DEFAULT '{}'::jsonb,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    source_ip_hash  TEXT,
    user_agent_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS con_medical_record_releases (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    case_id                  UUID NOT NULL REFERENCES con_cases(id) ON DELETE CASCADE,
    release_type             TEXT NOT NULL DEFAULT 'user_upload',
    template_version         TEXT NOT NULL,
    counsel_status           TEXT NOT NULL DEFAULT 'draft_requires_counsel_review',
    covered_information      TEXT NOT NULL,
    authorized_disclosers    JSONB NOT NULL DEFAULT '[]'::jsonb,
    authorized_recipients    JSONB NOT NULL DEFAULT '[]'::jsonb,
    purpose                  TEXT NOT NULL,
    expiration_type          TEXT NOT NULL DEFAULT 'date',
    expiration_at            TIMESTAMPTZ,
    expiration_event         TEXT,
    signer_name              TEXT NOT NULL,
    signer_type              TEXT NOT NULL DEFAULT 'self',
    representative_authority TEXT,
    signed_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at               TIMESTAMPTZ,
    revocation_reason        TEXT,
    signature_artifact_key   TEXT,
    source_ip_hash           TEXT,
    user_agent_hash          TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS con_documents (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                    UUID NOT NULL REFERENCES con_cases(id) ON DELETE CASCADE,
    user_id                    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    medical_record_release_id  UUID NOT NULL REFERENCES con_medical_record_releases(id),
    document_type              TEXT NOT NULL,
    original_filename          TEXT NOT NULL,
    storage_key                TEXT NOT NULL,
    sha256                     TEXT NOT NULL,
    file_size_bytes            BIGINT NOT NULL,
    mime_type                  TEXT,
    page_count                 INTEGER,
    phi_present                BOOLEAN NOT NULL DEFAULT true,
    pii_present                BOOLEAN NOT NULL DEFAULT true,
    malware_scan_status        TEXT NOT NULL DEFAULT 'not_scanned',
    ocr_status                 TEXT NOT NULL DEFAULT 'not_started',
    extraction_status          TEXT NOT NULL DEFAULT 'not_started',
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                 TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS con_evidence_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id           UUID NOT NULL REFERENCES con_cases(id) ON DELETE CASCADE,
    document_id       UUID REFERENCES con_documents(id) ON DELETE CASCADE,
    evidence_type     TEXT NOT NULL,
    field_name        TEXT,
    field_value       TEXT,
    normalized_value  JSONB,
    page_number       INTEGER,
    bbox              JSONB,
    confidence        NUMERIC(4,3),
    extraction_method TEXT NOT NULL DEFAULT 'manual',
    review_status     TEXT NOT NULL DEFAULT 'needs_review',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS con_audit_events (
    id            BIGSERIAL PRIMARY KEY,
    user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    case_id       UUID REFERENCES con_cases(id) ON DELETE SET NULL,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_org_id  UUID,
    event_type    TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id   TEXT,
    decision      TEXT NOT NULL DEFAULT 'allowed',
    reason        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS comp_packets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id           UUID NOT NULL REFERENCES con_cases(id) ON DELETE CASCADE,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    packet_type       TEXT NOT NULL,
    title             TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'draft',
    body_text         TEXT NOT NULL,
    evidence_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_from    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const CONSUMER_INDEXES = `
  CREATE INDEX IF NOT EXISTS con_cases_user_idx ON con_cases (user_id, updated_at DESC) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS con_cases_status_idx ON con_cases (status, updated_at DESC) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS con_case_events_case_idx ON con_case_events (case_id, event_at DESC);
  CREATE INDEX IF NOT EXISTS con_case_outcomes_case_idx ON con_case_outcomes (case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS con_consent_grants_user_case_idx ON con_consent_grants (user_id, case_id, consent_type, granted_at DESC);
  CREATE INDEX IF NOT EXISTS con_medical_record_releases_case_idx ON con_medical_record_releases (case_id, signed_at DESC);
  CREATE INDEX IF NOT EXISTS con_medical_record_releases_active_idx ON con_medical_record_releases (user_id, case_id, signed_at DESC) WHERE revoked_at IS NULL;
  CREATE INDEX IF NOT EXISTS con_documents_case_idx ON con_documents (case_id, created_at DESC) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS con_documents_release_idx ON con_documents (medical_record_release_id);
  CREATE INDEX IF NOT EXISTS con_evidence_items_case_idx ON con_evidence_items (case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS con_audit_events_case_idx ON con_audit_events (case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS con_audit_events_actor_idx ON con_audit_events (actor_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS comp_packets_case_idx ON comp_packets (case_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS comp_packets_user_idx ON comp_packets (user_id, created_at DESC);
`;

export async function runConsumerMigrations() {
  const { default: pool } = await import('../db.js');
  await pool.query(CONSUMER_DDL);
  await pool.query(CONSUMER_INDEXES);
  console.log('consumer advocacy (con_*) tables ready');
}
