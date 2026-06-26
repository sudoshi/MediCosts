// @ts-nocheck
import { judgeCase } from '../leverage/judge/judgeCase.js';
import { PgBenchmarkProvider } from '../leverage/judge/pgBenchmarkProvider.js';
import { scoreCase } from '../leverage/judge/scoreCase.js';
import { getCaseForUser, recordAuditEvent } from './caseService.js';

const INSURANCE_STATUSES = new Set(['insured', 'uninsured', 'self_pay']);

function cleanText(value, max = 255) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanDate(value) {
  if (!value || typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function cleanState(value, fallback = 'NA') {
  const raw = cleanText(value, 2) || fallback;
  return /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : fallback;
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toCents(value) {
  const n = toNullableInteger(value);
  return n === null ? null : Math.max(0, n);
}

function toUnits(value) {
  const n = toNullableInteger(value);
  return n === null || n < 1 ? 1 : Math.min(n, 9999);
}

function serviceYearFromInput(input, serviceDate) {
  const explicit = toNullableInteger(input.serviceYear);
  if (explicit && explicit >= 2000 && explicit <= 2100) return explicit;
  if (serviceDate) return Number(serviceDate.slice(0, 4));
  return new Date().getFullYear();
}

export function normalizeManualClaimInput(input = {}) {
  const serviceDate = cleanDate(input.serviceDate);
  const lineItems = Array.isArray(input.lineItems) ? input.lineItems : [];
  const normalizedLines = lineItems
    .map((line, index) => normalizeLineItem(line, index))
    .filter(line => line.cptHcpcs || line.msDrg || line.revenueCode || line.billedCents > 0);

  return {
    providerName: cleanText(input.providerName, 255),
    facilityCcn: cleanText(input.facilityCcn, 20),
    serviceDate,
    serviceYear: serviceYearFromInput(input, serviceDate),
    insuranceStatus: INSURANCE_STATUSES.has(input.insuranceStatus) ? input.insuranceStatus : 'insured',
    state: cleanState(input.state),
    debtTotalCents: toCents(input.debtTotalCents),
    eobPatientRespCents: toCents(input.eobPatientRespCents),
    lineItems: normalizedLines,
  };
}

function normalizeLineItem(line = {}, index = 0) {
  return {
    lineId: cleanText(line.lineId, 64) || `line-${index + 1}`,
    cptHcpcs: cleanText(line.cptHcpcs, 20),
    revenueCode: cleanText(line.revenueCode, 20),
    msDrg: cleanText(line.msDrg, 20),
    modifier: cleanText(line.modifier, 8),
    units: toUnits(line.units),
    billedCents: toCents(line.billedCents) ?? 0,
    allowedCents: toCents(line.allowedCents),
    planPaidCents: toCents(line.planPaidCents),
    patientRespCents: toCents(line.patientRespCents),
    serviceDate: cleanDate(line.serviceDate),
  };
}

export function formatClaim(row, lineRows = []) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    insuranceStatus: row.insurance_status,
    state: row.state,
    facilityCcn: row.facility_ccn,
    providerName: row.provider_name,
    serviceDate: row.service_date,
    serviceYear: row.service_year,
    debtTotalCents: row.debt_total_cents === null || row.debt_total_cents === undefined ? null : Number(row.debt_total_cents),
    eobPatientRespCents: row.eob_patient_resp_cents === null || row.eob_patient_resp_cents === undefined ? null : Number(row.eob_patient_resp_cents),
    lineItems: lineRows.map(formatLineItem),
  };
}

export function formatLineItem(row) {
  return {
    id: row.id,
    lineId: row.line_id,
    cptHcpcs: row.cpt_hcpcs,
    revenueCode: row.revenue_code,
    msDrg: row.ms_drg,
    modifier: row.modifier,
    units: Number(row.units),
    billedCents: Number(row.billed_cents),
    allowedCents: row.allowed_cents === null || row.allowed_cents === undefined ? null : Number(row.allowed_cents),
    planPaidCents: row.plan_paid_cents === null || row.plan_paid_cents === undefined ? null : Number(row.plan_paid_cents),
    patientRespCents: row.patient_resp_cents === null || row.patient_resp_cents === undefined ? null : Number(row.patient_resp_cents),
    serviceDate: row.service_date,
  };
}

export function formatFinding(row) {
  return {
    id: row.id,
    caseId: row.case_id,
    ruleId: row.rule_id,
    severity: row.severity,
    title: row.title,
    statuteCitation: row.statute_citation,
    feeShiftingEligible: row.fee_shifting_eligible,
    remedyType: row.remedy_type,
    estimatedRecoveryLowCents: Number(row.estimated_recovery_low_cents),
    estimatedRecoveryHighCents: Number(row.estimated_recovery_high_cents),
    evidenceRefs: row.evidence_refs || [],
    benchmarkSnapshot: row.benchmark_snapshot,
    createdAt: row.created_at,
  };
}

export function formatScore(row) {
  if (!row) return null;
  return {
    caseId: row.case_id,
    leverageScore: Number(row.leverage_score),
    strongestRemedy: row.strongest_remedy,
    totalEstimatedOverchargeCents: Number(row.total_estimated_overcharge_cents),
    marketplaceReady: row.marketplace_ready,
    updatedAt: row.updated_at,
  };
}

export async function saveManualClaim(query, userId, caseId, input = {}) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;

  const claim = normalizeManualClaimInput({
    state: consumerCase.state,
    facilityCcn: consumerCase.facility_ccn,
    ...input,
  });

  if (!claim.lineItems.length) {
    const err = new Error('At least one bill or EOB line item is required.');
    err.code = 'line_item_required';
    err.status = 422;
    throw err;
  }

  await query(
    `INSERT INTO lev_cases
      (id, user_id, status, debt_total_cents, provider_name, facility_ccn,
       service_date, service_year, insurance_status, state)
     VALUES ($1, $2, 'manual_entry', $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       debt_total_cents = EXCLUDED.debt_total_cents,
       provider_name = EXCLUDED.provider_name,
       facility_ccn = EXCLUDED.facility_ccn,
       service_date = EXCLUDED.service_date,
       service_year = EXCLUDED.service_year,
       insurance_status = EXCLUDED.insurance_status,
       state = EXCLUDED.state,
       status = 'manual_entry'`,
    [
      caseId,
      userId,
      claim.debtTotalCents,
      claim.providerName,
      claim.facilityCcn,
      claim.serviceDate,
      claim.serviceYear,
      claim.insuranceStatus,
      claim.state,
    ],
  );

  await clearPriorClaimData(query, caseId);

  const { rows } = await query(
    `INSERT INTO lev_extracted_claims
      (case_id, extraction_confidence, review_status, eob_patient_resp_cents)
     VALUES ($1, 1.000, 'verified', $2)
     RETURNING id`,
    [caseId, claim.eobPatientRespCents],
  );
  const claimId = rows[0].id;

  for (const line of claim.lineItems) {
    await query(
      `INSERT INTO lev_extracted_line_items
        (claim_id, line_id, cpt_hcpcs, revenue_code, ms_drg, modifier, units,
         billed_cents, allowed_cents, plan_paid_cents, patient_resp_cents, service_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        claimId,
        line.lineId,
        line.cptHcpcs,
        line.revenueCode,
        line.msDrg,
        line.modifier,
        line.units,
        line.billedCents,
        line.allowedCents,
        line.planPaidCents,
        line.patientRespCents,
        line.serviceDate || claim.serviceDate,
      ],
    );
  }

  await query(
    `UPDATE con_cases
     SET status = CASE WHEN status IN ('draft', 'needs_release', 'ready_for_documents', 'needs_documents') THEN 'analyzing' ELSE status END,
         updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [caseId, userId],
  );

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'manual_claim.saved',
    resourceType: 'lev_extracted_claims',
    resourceId: claimId,
  });

  return getManualClaim(query, userId, caseId);
}

async function clearPriorClaimData(query, caseId) {
  await query('DELETE FROM lev_findings WHERE case_id = $1', [caseId]);
  await query('DELETE FROM lev_case_scores WHERE case_id = $1', [caseId]);
  await query(
    `DELETE FROM lev_extracted_line_items
     WHERE claim_id IN (SELECT id FROM lev_extracted_claims WHERE case_id = $1)`,
    [caseId],
  );
  await query('DELETE FROM lev_extracted_claims WHERE case_id = $1', [caseId]);
}

export async function getManualClaim(query, userId, caseId) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;

  const { rows: claimRows } = await query(
    `SELECT lc.*, lec.id, lec.eob_patient_resp_cents
     FROM lev_cases lc
     LEFT JOIN lev_extracted_claims lec ON lec.case_id = lc.id
     WHERE lc.id = $1 AND lc.user_id = $2
     ORDER BY lec.created_at DESC NULLS LAST
     LIMIT 1`,
    [caseId, userId],
  );
  if (!claimRows[0] || !claimRows[0].id) return null;

  const { rows: lineRows } = await query(
    `SELECT li.*
     FROM lev_extracted_line_items li
     JOIN lev_extracted_claims c ON c.id = li.claim_id
     WHERE c.case_id = $1
     ORDER BY li.id ASC`,
    [caseId],
  );

  return formatClaim(claimRows[0], lineRows);
}

export async function analyzeManualClaim(query, userId, caseId) {
  const claim = await getManualClaim(query, userId, caseId);
  if (!claim) {
    const err = new Error('No manual claim has been entered for this case.');
    err.code = 'claim_required';
    err.status = 422;
    throw err;
  }
  if (!claim.lineItems.length) {
    const err = new Error('At least one line item is required before analysis.');
    err.code = 'line_item_required';
    err.status = 422;
    throw err;
  }

  const extractedClaim = {
    caseId,
    insuranceStatus: claim.insuranceStatus,
    state: claim.state || 'NA',
    facilityCcn: claim.facilityCcn,
    serviceYear: claim.serviceYear,
    eobPatientRespCents: claim.eobPatientRespCents,
    lineItems: claim.lineItems.map(line => ({
      lineId: line.lineId,
      cptHcpcs: line.cptHcpcs,
      revenueCode: line.revenueCode,
      msDrg: line.msDrg,
      modifier: line.modifier,
      units: line.units,
      billedCents: line.billedCents,
      allowedCents: line.allowedCents,
      planPaidCents: line.planPaidCents,
      patientRespCents: line.patientRespCents,
      serviceDate: line.serviceDate,
    })),
  };

  const provider = new PgBenchmarkProvider(query);
  const findings = await judgeCase(extractedClaim, provider);
  const score = scoreCase(findings);

  await query('DELETE FROM lev_findings WHERE case_id = $1', [caseId]);
  await query('DELETE FROM lev_case_scores WHERE case_id = $1', [caseId]);

  for (const finding of findings) {
    await query(
      `INSERT INTO lev_findings
        (case_id, rule_id, severity, title, statute_citation, fee_shifting_eligible,
         remedy_type, estimated_recovery_low_cents, estimated_recovery_high_cents,
         evidence_refs, benchmark_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)`,
      [
        caseId,
        finding.ruleId,
        finding.severity,
        finding.title,
        finding.statuteCitation,
        finding.feeShiftingEligible,
        finding.remedyType,
        finding.estimatedRecoveryLowCents,
        finding.estimatedRecoveryHighCents,
        JSON.stringify(finding.evidenceRefs),
        JSON.stringify(finding.benchmarkSnapshot),
      ],
    );
  }

  await query(
    `INSERT INTO lev_case_scores
      (case_id, leverage_score, strongest_remedy, total_estimated_overcharge_cents, marketplace_ready, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (case_id) DO UPDATE SET
       leverage_score = EXCLUDED.leverage_score,
       strongest_remedy = EXCLUDED.strongest_remedy,
       total_estimated_overcharge_cents = EXCLUDED.total_estimated_overcharge_cents,
       marketplace_ready = EXCLUDED.marketplace_ready,
       updated_at = now()`,
    [
      caseId,
      score.leverageScore,
      score.strongestRemedy,
      score.totalEstimatedOverchargeCents,
      score.marketplaceReady,
    ],
  );

  await query(
    `UPDATE con_cases
     SET status = 'report_ready', updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [caseId, userId],
  );

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'manual_claim.analyzed',
    resourceType: 'lev_case_scores',
    resourceId: caseId,
  });

  return getBillAnalysis(query, userId, caseId);
}

export async function getBillAnalysis(query, userId, caseId) {
  const claim = await getManualClaim(query, userId, caseId);
  if (claim === null) return null;

  const { rows: findingRows } = await query(
    `SELECT *
     FROM lev_findings
     WHERE case_id = $1
     ORDER BY id ASC`,
    [caseId],
  );
  const { rows: scoreRows } = await query(
    `SELECT *
     FROM lev_case_scores
     WHERE case_id = $1
     LIMIT 1`,
    [caseId],
  );

  return {
    claim,
    findings: findingRows.map(formatFinding),
    score: formatScore(scoreRows[0]),
  };
}
