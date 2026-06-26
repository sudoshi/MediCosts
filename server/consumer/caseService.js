import crypto from 'node:crypto';

export const CASE_TYPES = new Set([
  'bill_check',
  'complaint',
  'medical_debt',
  'coverage_issue',
  'plan_outcome',
  'care_estimate',
  'general_advocacy',
]);

export const CASE_STATUSES = new Set([
  'draft',
  'needs_release',
  'ready_for_documents',
  'needs_documents',
  'analyzing',
  'report_ready',
  'packet_ready',
  'shared',
  'response_pending',
  'resolved',
  'closed',
  'archived',
]);

export const RELEASE_TEMPLATE_VERSION = 'hipaa-medical-record-release-v1';
export const RELEASE_COUNSEL_STATUS = 'draft_requires_counsel_review';

export const DEFAULT_RELEASE_COPY = {
  coveredInformation:
    'Medical, billing, payment, claims, coverage, denial, appeal, collection, financial assistance, and plan documents that I choose to upload or authorize for this MediCosts case.',
  purpose:
    'Patient advocacy, healthcare cost review, bill dispute, complaint routing, plan outcome evidence, and case resolution at my request.',
  authorizedDisclosers: [
    'The user or personal representative signing this release',
    'Healthcare providers, facilities, health plans, insurers, plan administrators, collection agencies, and other organizations identified by the user for this case',
  ],
  authorizedRecipients: [
    'MediCosts',
    'Helpers, advocates, providers, payers, regulators, or other recipients the user later authorizes for this case',
  ],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function hashRequestValue(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function cleanText(value, max = 255) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanState(value) {
  const state = cleanText(value, 2);
  if (!state) return null;
  return /^[A-Za-z]{2}$/.test(state) ? state.toUpperCase() : null;
}

function cleanDate(value) {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function addOneYear(date = new Date()) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

export function normalizeCaseInput(input = {}) {
  const caseType = CASE_TYPES.has(input.caseType) ? input.caseType : 'general_advocacy';
  const status = CASE_STATUSES.has(input.status) ? input.status : 'draft';
  const title = cleanText(input.title, 180) || defaultTitleForCaseType(caseType);
  const priority = ['low', 'normal', 'high', 'urgent'].includes(input.priority) ? input.priority : 'normal';

  return {
    caseType,
    status,
    title,
    state: cleanState(input.state),
    priority,
    serviceStartDate: cleanDate(input.serviceStartDate || input.serviceDate),
    serviceEndDate: cleanDate(input.serviceEndDate),
    facilityCcn: cleanText(input.facilityCcn, 20),
    providerNpi: cleanText(input.providerNpi, 20),
    payerName: cleanText(input.payerName, 255),
  };
}

function defaultTitleForCaseType(caseType) {
  switch (caseType) {
    case 'bill_check': return 'Bill check case';
    case 'complaint': return 'Complaint case';
    case 'medical_debt': return 'Medical debt case';
    case 'coverage_issue': return 'Coverage issue case';
    case 'plan_outcome': return 'Plan outcome evidence case';
    case 'care_estimate': return 'Care estimate case';
    default: return 'Advocacy case';
  }
}

export function formatCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    caseType: row.case_type,
    status: row.status,
    title: row.title,
    state: row.state,
    priority: row.priority,
    serviceStartDate: row.service_start_date,
    serviceEndDate: row.service_end_date,
    facilityCcn: row.facility_ccn,
    providerNpi: row.provider_npi,
    payerName: row.payer_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

export function formatDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    documentType: row.document_type,
    originalFilename: row.original_filename,
    sha256: row.sha256,
    fileSizeBytes: Number(row.file_size_bytes),
    mimeType: row.mime_type,
    medicalRecordReleaseId: row.medical_record_release_id,
    malwareScanStatus: row.malware_scan_status,
    ocrStatus: row.ocr_status,
    extractionStatus: row.extraction_status,
    createdAt: row.created_at,
  };
}

export function formatRelease(row, now = new Date()) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    releaseType: row.release_type,
    templateVersion: row.template_version,
    counselStatus: row.counsel_status,
    coveredInformation: row.covered_information,
    authorizedDisclosers: row.authorized_disclosers || [],
    authorizedRecipients: row.authorized_recipients || [],
    purpose: row.purpose,
    expirationType: row.expiration_type,
    expirationAt: row.expiration_at,
    expirationEvent: row.expiration_event,
    signerName: row.signer_name,
    signerType: row.signer_type,
    representativeAuthority: row.representative_authority,
    signedAt: row.signed_at,
    revokedAt: row.revoked_at,
    revocationReason: row.revocation_reason,
    active: isMedicalRecordReleaseActive(row, now),
  };
}

export function isMedicalRecordReleaseActive(release, now = new Date()) {
  if (!release) return false;
  if (!release.signed_at) return false;
  if (release.revoked_at) return false;
  if (release.expiration_at && new Date(release.expiration_at).getTime() <= now.getTime()) return false;
  return true;
}

export async function recordAuditEvent(query, {
  userId,
  caseId = null,
  actorUserId = userId,
  eventType,
  resourceType,
  resourceId = null,
  decision = 'allowed',
  reason = null,
}) {
  await query(
    `INSERT INTO con_audit_events
      (user_id, case_id, actor_user_id, event_type, resource_type, resource_id, decision, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, caseId, actorUserId, eventType, resourceType, resourceId, decision, reason],
  );
}

export async function listCases(query, userId) {
  const { rows } = await query(
    `SELECT *
     FROM con_cases
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map(formatCase);
}

export async function createCase(query, userId, input = {}) {
  const data = normalizeCaseInput(input);
  const { rows } = await query(
    `INSERT INTO con_cases
      (user_id, case_type, status, title, state, priority, service_start_date,
       service_end_date, facility_ccn, provider_npi, payer_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      userId,
      data.caseType,
      data.status,
      data.title,
      data.state,
      data.priority,
      data.serviceStartDate,
      data.serviceEndDate,
      data.facilityCcn,
      data.providerNpi,
      data.payerName,
    ],
  );

  const created = rows[0];
  await recordAuditEvent(query, {
    userId,
    caseId: created.id,
    eventType: 'case.created',
    resourceType: 'con_cases',
    resourceId: created.id,
  });
  return formatCase(created);
}

export async function getCaseForUser(query, userId, caseId) {
  if (!isUuid(caseId)) return null;
  const { rows } = await query(
    `SELECT *
     FROM con_cases
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [caseId, userId],
  );
  return rows[0] || null;
}

export async function updateCase(query, userId, caseId, input = {}) {
  const existing = await getCaseForUser(query, userId, caseId);
  if (!existing) return null;
  const data = normalizeCaseInput({ ...existingToInput(existing), ...input });
  const status = CASE_STATUSES.has(input.status) ? input.status : existing.status;

  const { rows } = await query(
    `UPDATE con_cases
     SET case_type = $3,
         status = $4,
         title = $5,
         state = $6,
         priority = $7,
         service_start_date = $8,
         service_end_date = $9,
         facility_ccn = $10,
         provider_npi = $11,
         payer_name = $12,
         updated_at = now()
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [
      caseId,
      userId,
      data.caseType,
      status,
      data.title,
      data.state,
      data.priority,
      data.serviceStartDate,
      data.serviceEndDate,
      data.facilityCcn,
      data.providerNpi,
      data.payerName,
    ],
  );

  if (!rows[0]) return null;
  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'case.updated',
    resourceType: 'con_cases',
    resourceId: caseId,
  });
  return formatCase(rows[0]);
}

function existingToInput(row) {
  return {
    caseType: row.case_type,
    title: row.title,
    state: row.state,
    priority: row.priority,
    serviceStartDate: row.service_start_date,
    serviceEndDate: row.service_end_date,
    facilityCcn: row.facility_ccn,
    providerNpi: row.provider_npi,
    payerName: row.payer_name,
  };
}

export function normalizeReleaseInput(input = {}, now = new Date()) {
  const signerName = cleanText(input.signerName, 180);
  if (!signerName) {
    const err = new Error('Signer name is required');
    err.code = 'invalid_release';
    throw err;
  }

  const signerType = input.signerType === 'personal_representative' ? 'personal_representative' : 'self';
  const representativeAuthority = cleanText(input.representativeAuthority, 255);
  if (signerType === 'personal_representative' && !representativeAuthority) {
    const err = new Error('Representative authority is required');
    err.code = 'representative_authority_required';
    throw err;
  }

  const expirationAt = input.expirationAt ? new Date(input.expirationAt) : addOneYear(now);
  if (Number.isNaN(expirationAt.getTime()) || expirationAt.getTime() <= now.getTime()) {
    const err = new Error('Expiration must be a future date');
    err.code = 'invalid_release_expiration';
    throw err;
  }

  return {
    releaseType: input.releaseType === 'third_party_request' ? 'third_party_request' : 'user_upload',
    templateVersion: RELEASE_TEMPLATE_VERSION,
    counselStatus: RELEASE_COUNSEL_STATUS,
    coveredInformation: cleanText(input.coveredInformation, 2000) || DEFAULT_RELEASE_COPY.coveredInformation,
    authorizedDisclosers: Array.isArray(input.authorizedDisclosers) && input.authorizedDisclosers.length
      ? input.authorizedDisclosers.map(v => cleanText(v, 255)).filter(Boolean)
      : DEFAULT_RELEASE_COPY.authorizedDisclosers,
    authorizedRecipients: Array.isArray(input.authorizedRecipients) && input.authorizedRecipients.length
      ? input.authorizedRecipients.map(v => cleanText(v, 255)).filter(Boolean)
      : DEFAULT_RELEASE_COPY.authorizedRecipients,
    purpose: cleanText(input.purpose, 1000) || DEFAULT_RELEASE_COPY.purpose,
    expirationType: input.expirationEvent ? 'event' : 'date',
    expirationAt,
    expirationEvent: cleanText(input.expirationEvent, 255),
    signerName,
    signerType,
    representativeAuthority,
  };
}

export async function createMedicalRecordRelease(query, userId, caseId, input = {}, requestMeta = {}) {
  const existingCase = await getCaseForUser(query, userId, caseId);
  if (!existingCase) return null;

  const data = normalizeReleaseInput(input);
  const { rows } = await query(
    `INSERT INTO con_medical_record_releases
      (user_id, case_id, release_type, template_version, counsel_status,
       covered_information, authorized_disclosers, authorized_recipients, purpose,
       expiration_type, expiration_at, expiration_event, signer_name, signer_type,
       representative_authority, source_ip_hash, user_agent_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      userId,
      caseId,
      data.releaseType,
      data.templateVersion,
      data.counselStatus,
      data.coveredInformation,
      JSON.stringify(data.authorizedDisclosers),
      JSON.stringify(data.authorizedRecipients),
      data.purpose,
      data.expirationType,
      data.expirationAt,
      data.expirationEvent,
      data.signerName,
      data.signerType,
      data.representativeAuthority,
      hashRequestValue(requestMeta.ip),
      hashRequestValue(requestMeta.userAgent),
    ],
  );

  await query(
    `UPDATE con_cases
     SET status = CASE WHEN status = 'draft' THEN 'ready_for_documents' ELSE status END,
         updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [caseId, userId],
  );

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'medical_record_release.signed',
    resourceType: 'con_medical_record_releases',
    resourceId: rows[0].id,
  });

  return formatRelease(rows[0]);
}

export async function getLatestMedicalRecordRelease(query, userId, caseId) {
  if (!isUuid(caseId)) return null;
  const { rows } = await query(
    `SELECT *
     FROM con_medical_record_releases
     WHERE user_id = $1 AND case_id = $2
     ORDER BY signed_at DESC
     LIMIT 1`,
    [userId, caseId],
  );
  return rows[0] || null;
}

export async function getActiveMedicalRecordRelease(query, userId, caseId, now = new Date()) {
  if (!isUuid(caseId)) return null;
  const { rows } = await query(
    `SELECT *
     FROM con_medical_record_releases
     WHERE user_id = $1
       AND case_id = $2
       AND release_type = 'user_upload'
       AND signed_at IS NOT NULL
       AND revoked_at IS NULL
       AND (expiration_at IS NULL OR expiration_at > now())
     ORDER BY signed_at DESC
     LIMIT 1`,
    [userId, caseId],
  );
  const release = rows[0] || null;
  return isMedicalRecordReleaseActive(release, now) ? release : null;
}

export async function assertActiveMedicalRecordRelease(query, userId, caseId, now = new Date()) {
  const release = await getActiveMedicalRecordRelease(query, userId, caseId, now);
  if (!release) {
    const err = new Error('A signed HIPAA authorization / medical record release is required before uploading documents.');
    err.code = 'medical_record_release_required';
    err.status = 403;
    throw err;
  }
  return release;
}

export async function revokeMedicalRecordRelease(query, userId, caseId, releaseId, reason = null) {
  const existingCase = await getCaseForUser(query, userId, caseId);
  if (!existingCase) return null;

  await query(
    `UPDATE con_medical_record_releases
     SET revoked_at = COALESCE(revoked_at, now()),
         revocation_reason = COALESCE($3, revocation_reason)
     WHERE user_id = $1 AND case_id = $2 AND revoked_at IS NULL`,
    [userId, caseId, cleanText(reason, 500)],
  );

  const { rows } = await query(
    `SELECT *
     FROM con_medical_record_releases
     WHERE user_id = $1 AND case_id = $2
     ORDER BY signed_at DESC
     LIMIT 1`,
    [userId, caseId],
  );
  if (!rows[0]) return null;

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'medical_record_release.revoked',
    resourceType: 'con_medical_record_releases',
    resourceId: releaseId,
  });
  return formatRelease(rows[0]);
}

export async function listDocuments(query, userId, caseId) {
  const existingCase = await getCaseForUser(query, userId, caseId);
  if (!existingCase) return null;
  const { rows } = await query(
    `SELECT *
     FROM con_documents
     WHERE user_id = $1 AND case_id = $2 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [userId, caseId],
  );
  return rows.map(formatDocument);
}

export async function createDocumentRecord(query, {
  userId,
  caseId,
  medicalRecordReleaseId,
  documentType,
  originalFilename,
  storageKey,
  sha256,
  fileSizeBytes,
  mimeType,
}) {
  const cleanDocType = cleanText(documentType, 80) || 'medical_record';
  const { rows } = await query(
    `INSERT INTO con_documents
      (case_id, user_id, medical_record_release_id, document_type, original_filename,
       storage_key, sha256, file_size_bytes, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      caseId,
      userId,
      medicalRecordReleaseId,
      cleanDocType,
      cleanText(originalFilename, 255) || 'document',
      storageKey,
      sha256,
      fileSizeBytes,
      mimeType,
    ],
  );

  await query(
    `UPDATE con_cases
     SET status = CASE WHEN status IN ('draft', 'ready_for_documents') THEN 'needs_documents' ELSE status END,
         updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [caseId, userId],
  );

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'document.uploaded',
    resourceType: 'con_documents',
    resourceId: rows[0].id,
  });

  return formatDocument(rows[0]);
}
