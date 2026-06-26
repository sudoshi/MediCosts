// @ts-nocheck
import crypto from 'node:crypto';
import { getCaseForUser, recordAuditEvent } from './caseService.js';
import { getBillAnalysis } from './leverageCaseService.js';

const COVERAGE_TYPES = new Set([
  'commercial',
  'marketplace',
  'medicare_advantage',
  'part_d',
  'medicaid_managed_care',
  'medicare_original',
  'self_pay',
  'unknown',
]);

function cleanText(value, max = 255) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanState(value) {
  const state = cleanText(value, 2);
  return state && /^[A-Za-z]{2}$/.test(state) ? state.toUpperCase() : null;
}

function cleanYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

function hashOptional(value) {
  const cleaned = cleanText(value, 255);
  if (!cleaned) return null;
  return crypto.createHash('sha256').update(cleaned.toLowerCase()).digest('hex');
}

export function normalizeCoverageProfileInput(input = {}) {
  const coverageType = COVERAGE_TYPES.has(input.coverageType) ? input.coverageType : 'unknown';
  const normalized = {
    coverageType,
    marketSegment: cleanText(input.marketSegment, 80),
    fundingType: cleanText(input.fundingType, 80),
    state: cleanState(input.state),
    planYear: cleanYear(input.planYear),
    payerLegalName: cleanText(input.payerLegalName, 255),
    payerTradeName: cleanText(input.payerTradeName, 255),
    issuerHiosId: cleanText(input.issuerHiosId, 40),
    hiosPlanId: cleanText(input.hiosPlanId, 80),
    cmsContractId: cleanText(input.cmsContractId, 20),
    cmsPlanId: cleanText(input.cmsPlanId, 20),
    planName: cleanText(input.planName, 255),
    productType: cleanText(input.productType, 80),
    metalLevel: cleanText(input.metalLevel, 40),
    networkType: cleanText(input.networkType, 40),
    networkName: cleanText(input.networkName, 255),
    groupNumberHash: hashOptional(input.groupNumber),
    memberIdHash: hashOptional(input.memberId),
    employerNameHash: hashOptional(input.employerName),
    tpaName: cleanText(input.tpaName, 255),
    pbmName: cleanText(input.pbmName, 255),
  };
  return {
    ...normalized,
    identityConfidence: scoreCoverageIdentity(normalized),
  };
}

export function scoreCoverageIdentity(profile) {
  let score = 0;
  if (profile.payerLegalName || profile.payerTradeName) score += 0.22;
  if (profile.planName) score += 0.20;
  if (profile.planYear) score += 0.12;
  if (profile.state) score += 0.08;
  if (profile.networkName || profile.networkType) score += 0.10;
  if (profile.hiosPlanId || profile.issuerHiosId) score += 0.16;
  if (profile.cmsContractId || profile.cmsPlanId) score += 0.16;
  if (profile.groupNumberHash || profile.memberIdHash) score += 0.10;
  if (profile.tpaName || profile.pbmName || profile.employerNameHash) score += 0.06;
  return Math.min(0.95, Number(score.toFixed(3)));
}

export function formatCoverageProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    coverageType: row.coverage_type,
    marketSegment: row.market_segment,
    fundingType: row.funding_type,
    state: row.state,
    planYear: row.plan_year,
    payerLegalName: row.payer_legal_name,
    payerTradeName: row.payer_trade_name,
    issuerHiosId: row.issuer_hios_id,
    hiosPlanId: row.hios_plan_id,
    cmsContractId: row.cms_contract_id,
    cmsPlanId: row.cms_plan_id,
    planName: row.plan_name,
    productType: row.product_type,
    metalLevel: row.metal_level,
    networkType: row.network_type,
    networkName: row.network_name,
    tpaName: row.tpa_name,
    pbmName: row.pbm_name,
    identityConfidence: Number(row.identity_confidence || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatAttribution(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    coverageProfileId: row.coverage_profile_id,
    findingId: row.finding_id,
    outcomeType: row.outcome_type,
    attributionType: row.attribution_type,
    attributionConfidence: Number(row.attribution_confidence || 0),
    attributionBasis: row.attribution_basis,
    payerLegalName: row.payer_legal_name,
    payerTradeName: row.payer_trade_name,
    planIdentifier: row.plan_identifier,
    planYear: row.plan_year,
    networkName: row.network_name,
    summary: row.summary,
    evidenceRefs: row.evidence_refs || [],
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCoverageProfile(query, userId, caseId) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;
  const { rows } = await query(
    `SELECT *
     FROM plan_coverage_profiles
     WHERE user_id = $1 AND case_id = $2
     LIMIT 1`,
    [userId, caseId],
  );
  return formatCoverageProfile(rows[0]);
}

export async function saveCoverageProfile(query, userId, caseId, input = {}, options = {}) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;
  const profile = normalizeCoverageProfileInput({
    state: consumerCase.state,
    ...input,
  });
  const trustedHashes = options.trustedHashes || {};
  profile.groupNumberHash = profile.groupNumberHash || trustedHashes.groupNumberHash || null;
  profile.memberIdHash = profile.memberIdHash || trustedHashes.memberIdHash || null;
  profile.employerNameHash = profile.employerNameHash || trustedHashes.employerNameHash || null;
  const { rows: existingRows } = await query(
    `SELECT group_number_hash, member_id_hash, employer_name_hash
     FROM plan_coverage_profiles
     WHERE user_id = $1 AND case_id = $2
     LIMIT 1`,
    [userId, caseId],
  );
  const existing = existingRows[0] || {};
  profile.groupNumberHash = profile.groupNumberHash || existing.group_number_hash || null;
  profile.memberIdHash = profile.memberIdHash || existing.member_id_hash || null;
  profile.employerNameHash = profile.employerNameHash || existing.employer_name_hash || null;
  profile.identityConfidence = scoreCoverageIdentity(profile);

  const { rows } = await query(
    `INSERT INTO plan_coverage_profiles
      (user_id, case_id, coverage_type, market_segment, funding_type, state, plan_year,
       payer_legal_name, payer_trade_name, issuer_hios_id, hios_plan_id, cms_contract_id,
       cms_plan_id, plan_name, product_type, metal_level, network_type, network_name,
       group_number_hash, member_id_hash, employer_name_hash, tpa_name, pbm_name,
       identity_confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
     ON CONFLICT (case_id) DO UPDATE SET
       coverage_type = EXCLUDED.coverage_type,
       market_segment = EXCLUDED.market_segment,
       funding_type = EXCLUDED.funding_type,
       state = EXCLUDED.state,
       plan_year = EXCLUDED.plan_year,
       payer_legal_name = EXCLUDED.payer_legal_name,
       payer_trade_name = EXCLUDED.payer_trade_name,
       issuer_hios_id = EXCLUDED.issuer_hios_id,
       hios_plan_id = EXCLUDED.hios_plan_id,
       cms_contract_id = EXCLUDED.cms_contract_id,
       cms_plan_id = EXCLUDED.cms_plan_id,
       plan_name = EXCLUDED.plan_name,
       product_type = EXCLUDED.product_type,
       metal_level = EXCLUDED.metal_level,
       network_type = EXCLUDED.network_type,
       network_name = EXCLUDED.network_name,
       group_number_hash = EXCLUDED.group_number_hash,
       member_id_hash = EXCLUDED.member_id_hash,
       employer_name_hash = EXCLUDED.employer_name_hash,
       tpa_name = EXCLUDED.tpa_name,
       pbm_name = EXCLUDED.pbm_name,
       identity_confidence = EXCLUDED.identity_confidence,
       updated_at = now()
     RETURNING *`,
    [
      userId,
      caseId,
      profile.coverageType,
      profile.marketSegment,
      profile.fundingType,
      profile.state,
      profile.planYear,
      profile.payerLegalName,
      profile.payerTradeName,
      profile.issuerHiosId,
      profile.hiosPlanId,
      profile.cmsContractId,
      profile.cmsPlanId,
      profile.planName,
      profile.productType,
      profile.metalLevel,
      profile.networkType,
      profile.networkName,
      profile.groupNumberHash,
      profile.memberIdHash,
      profile.employerNameHash,
      profile.tpaName,
      profile.pbmName,
      profile.identityConfidence,
    ],
  );

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'coverage_profile.saved',
    resourceType: 'plan_coverage_profiles',
    resourceId: rows[0].id,
  });

  return formatCoverageProfile(rows[0]);
}

export async function getOutcomeAttributions(query, userId, caseId) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;
  const { rows } = await query(
    `SELECT *
     FROM plan_outcome_attributions
     WHERE case_id = $1
     ORDER BY created_at DESC`,
    [caseId],
  );
  return rows.map(formatAttribution);
}

export async function recalculateOutcomeAttributions(query, userId, caseId) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;

  const profile = await getCoverageProfile(query, userId, caseId);
  const analysis = await getBillAnalysis(query, userId, caseId);

  await query('DELETE FROM plan_outcome_attributions WHERE case_id = $1', [caseId]);

  const drafts = buildAttributionDrafts(profile, analysis);
  const inserted = [];
  for (const draft of drafts) {
    const { rows } = await query(
      `INSERT INTO plan_outcome_attributions
        (case_id, coverage_profile_id, finding_id, outcome_type, attribution_type,
         attribution_confidence, attribution_basis, payer_legal_name, payer_trade_name,
         plan_identifier, plan_year, network_name, summary, evidence_refs, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, 'draft')
       RETURNING *`,
      [
        caseId,
        profile?.id || null,
        draft.findingId,
        draft.outcomeType,
        draft.attributionType,
        draft.attributionConfidence,
        draft.attributionBasis,
        profile?.payerLegalName || null,
        profile?.payerTradeName || null,
        planIdentifier(profile),
        profile?.planYear || null,
        profile?.networkName || null,
        draft.summary,
        JSON.stringify(draft.evidenceRefs),
      ],
    );
    inserted.push(formatAttribution(rows[0]));
  }

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'plan_outcome_attributions.recalculated',
    resourceType: 'plan_outcome_attributions',
    resourceId: caseId,
  });

  return inserted;
}

export function buildAttributionDrafts(profile, analysis) {
  if (!analysis?.claim) return [];
  const findings = Array.isArray(analysis.findings) ? analysis.findings : [];
  const drafts = [];

  for (const finding of findings) {
    if (finding.ruleId === 'EOB_PATIENT_RESP_MISMATCH') {
      drafts.push(buildEobMismatchAttribution(profile, analysis.claim, finding));
    }
  }

  return drafts;
}

function buildEobMismatchAttribution(profile, claim, finding) {
  const hasProfile = Boolean(profile?.id);
  const identityConfidence = Number(profile?.identityConfidence || 0);
  const hasPlanNamed = Boolean(profile?.payerLegalName || profile?.payerTradeName || profile?.planName);
  const confidence = hasProfile
    ? Math.min(0.85, Number((0.45 + identityConfidence * 0.35).toFixed(3)))
    : 0.35;

  return {
    findingId: finding.id,
    outcomeType: 'incorrect_patient_responsibility',
    attributionType: hasProfile && hasPlanNamed ? 'plan_contributed' : 'unknown',
    attributionConfidence: confidence,
    attributionBasis: 'eob_patient_responsibility_mismatch',
    summary: hasProfile && hasPlanNamed
      ? 'The case has plan identity and a deterministic EOB patient-responsibility mismatch. This supports plan-contributed attribution, but still needs document review before making stronger claims.'
      : 'A deterministic EOB patient-responsibility mismatch exists, but plan identity is incomplete. Attribution remains unknown until coverage evidence is added.',
    evidenceRefs: [
      { type: 'claim', id: claim.id, label: 'manual bill/EOB entry' },
      { type: 'finding', id: finding.id, ruleId: finding.ruleId },
      ...((finding.evidenceRefs || []).map(ref => ({ type: 'line_item', id: ref }))),
    ],
  };
}

function planIdentifier(profile) {
  if (!profile) return null;
  return profile.hiosPlanId
    || [profile.cmsContractId, profile.cmsPlanId].filter(Boolean).join('-')
    || profile.planName
    || profile.payerLegalName
    || profile.payerTradeName
    || null;
}
