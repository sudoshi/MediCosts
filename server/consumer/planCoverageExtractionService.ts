// @ts-nocheck
import crypto from 'node:crypto';
import { getCaseForUser, recordAuditEvent } from './caseService.js';
import { readEncryptedConsumerDocument } from './documentStorage.js';
import {
  getCoverageProfile,
  saveCoverageProfile,
  scoreCoverageIdentity,
} from './planAttributionService.js';

const EXTRACTION_METHOD = 'text_regex_v1';
const MAX_TEXT_BYTES = 256 * 1024;

const ELIGIBLE_DOCUMENT_TYPES = new Set([
  'insurance_card',
  'eob',
  'denial_letter',
  'plan_document',
]);

const PUBLIC_FIELDS = new Set([
  'coverageType',
  'marketSegment',
  'fundingType',
  'state',
  'planYear',
  'payerLegalName',
  'payerTradeName',
  'issuerHiosId',
  'hiosPlanId',
  'cmsContractId',
  'cmsPlanId',
  'planName',
  'productType',
  'metalLevel',
  'networkType',
  'networkName',
  'tpaName',
  'pbmName',
]);

const SENSITIVE_FIELDS = {
  memberId: 'memberIdHash',
  groupNumber: 'groupNumberHash',
  employerName: 'employerNameHash',
};

function cleanText(value, max = 255) {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
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

function cleanPlanId(value, max = 80) {
  return cleanText(value, max)?.replace(/[^A-Za-z0-9-]/g, '') || null;
}

function hashSensitive(value) {
  const cleaned = cleanText(value, 255);
  if (!cleaned) return null;
  return crypto.createHash('sha256').update(cleaned.toLowerCase()).digest('hex');
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function isReadableTextDocument(doc) {
  const mime = String(doc.mime_type || '').toLowerCase();
  const filename = String(doc.original_filename || '').toLowerCase();
  return mime.startsWith('text/')
    || mime === 'application/json'
    || filename.endsWith('.txt')
    || filename.endsWith('.md')
    || filename.endsWith('.csv')
    || filename.endsWith('.json');
}

function normalizeLines(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function firstLabelValue(lines, labelPattern) {
  const re = new RegExp(`^(?:${labelPattern})\\s*(?:[:#-]|\\s{2,})\\s*(.+)$`, 'i');
  for (const line of lines) {
    const match = line.match(re);
    if (match) return cleanText(match[1], 255);
  }
  return null;
}

function setField(found, field, value, confidence, document, source = 'label') {
  if (!PUBLIC_FIELDS.has(field)) return;
  const cleaned = field === 'state'
    ? cleanState(value)
    : field === 'planYear'
      ? cleanYear(value)
      : cleanText(String(value || ''), field.endsWith('Id') ? 80 : 255);
  if (cleaned === null || cleaned === undefined || cleaned === '') return;
  const prior = found.publicFields[field];
  if (!prior || confidence >= prior.confidence) {
    found.publicFields[field] = {
      value: cleaned,
      confidence,
      evidence: evidenceRef(document, field, confidence, source),
    };
  }
}

function setSensitive(found, field, value, confidence, document, source = 'label') {
  const hashField = SENSITIVE_FIELDS[field];
  if (!hashField) return;
  const hash = hashSensitive(value);
  if (!hash) return;
  const prior = found.sensitiveFields[hashField];
  if (!prior || confidence >= prior.confidence) {
    found.sensitiveFields[hashField] = {
      value: hash,
      confidence,
      evidence: evidenceRef(document, field, confidence, source),
    };
  }
}

function evidenceRef(document, field, confidence, source) {
  return {
    type: 'coverage_extraction',
    documentId: document?.id || null,
    filename: document?.original_filename || null,
    documentType: document?.document_type || null,
    field,
    source,
    confidence,
    method: EXTRACTION_METHOD,
  };
}

function inferCoverageType(text) {
  if (/medicare\s+advantage|senior\s+advantage|part\s+c\b|\bma\s+plan\b|cms\s+contract\s+id|cms\s+plan\s+id/i.test(text)) return 'medicare_advantage';
  if (/part\s+d|prescription\s+drug\s+plan/i.test(text)) return 'part_d';
  if (/medicaid\s+managed\s+care|managed\s+care\s+organization|\bmco\b/i.test(text)) return 'medicaid_managed_care';
  if (/marketplace|health\s+insurance\s+exchange|\bhios\b/i.test(text)) return 'marketplace';
  if (/self[-\s]?pay|cash\s+pay/i.test(text)) return 'self_pay';
  if (/commercial|employer|group\s+(?:number|no|#)|\bppo\b|\bhmo\b|\bepo\b|\bpos\b/i.test(text)) return 'commercial';
  return null;
}

function inferNetworkType(text) {
  const match = text.match(/\b(PPO|HMO|EPO|POS)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function inferMetalLevel(text) {
  const match = text.match(/\b(Bronze|Silver|Gold|Platinum|Catastrophic)\b/i);
  return match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : null;
}

function inferFundingType(text) {
  if (/self[-\s]?funded|self[-\s]?insured|erisa/i.test(text)) return 'self-funded';
  if (/fully\s+insured/i.test(text)) return 'fully insured';
  if (/level[-\s]?funded/i.test(text)) return 'level-funded';
  return null;
}

function inferMarketSegment(text) {
  if (/individual\s+(?:market|coverage|plan)|marketplace/i.test(text)) return 'individual';
  if (/small\s+group/i.test(text)) return 'small group';
  if (/large\s+group|employer\s+group/i.test(text)) return 'large group';
  return null;
}

export function extractCoverageFieldsFromText(text, document = {}) {
  const lines = normalizeLines(text);
  const fullText = lines.join('\n');
  const found = {
    publicFields: {},
    sensitiveFields: {},
  };

  setField(found, 'payerLegalName', firstLabelValue(lines, 'insurance\\s+company|insurer|payer|carrier'), 0.86, document);
  setField(found, 'payerTradeName', firstLabelValue(lines, 'plan\\s+administrator|administrator|administered\\s+by'), 0.72, document);
  setField(found, 'planName', firstLabelValue(lines, 'plan\\s+name|health\\s+plan|benefit\\s+plan'), 0.86, document);
  setField(found, 'networkName', firstLabelValue(lines, 'network\\s+name|network'), 0.78, document);
  setField(found, 'productType', firstLabelValue(lines, 'product\\s+type|product'), 0.72, document);
  setField(found, 'metalLevel', firstLabelValue(lines, 'metal\\s+level'), 0.76, document);
  setField(found, 'fundingType', firstLabelValue(lines, 'funding\\s+type|funding'), 0.76, document);
  setField(found, 'marketSegment', firstLabelValue(lines, 'market\\s+segment|market'), 0.72, document);
  setField(found, 'tpaName', firstLabelValue(lines, 'third\\s+party\\s+administrator|tpa'), 0.78, document);
  setField(found, 'pbmName', firstLabelValue(lines, 'pharmacy\\s+benefit\\s+manager|pbm'), 0.78, document);
  setField(found, 'planYear', firstLabelValue(lines, 'plan\\s+year|coverage\\s+year'), 0.82, document);
  setField(found, 'state', firstLabelValue(lines, 'state'), 0.62, document);

  setSensitive(found, 'memberId', firstLabelValue(lines, 'member\\s+id|subscriber\\s+id|member\\s+number|id\\s+number|id'), 0.88, document);
  setSensitive(found, 'groupNumber', firstLabelValue(lines, 'group\\s+number|group\\s+no\\.?|group\\s+#|group'), 0.86, document);
  setSensitive(found, 'employerName', firstLabelValue(lines, 'employer\\s+name|employer'), 0.76, document);

  const hiosMatch = fullText.match(/\b(\d{5}[A-Z]{2}\d{7})\b/i);
  if (hiosMatch) {
    const hiosPlanId = cleanPlanId(hiosMatch[1].toUpperCase());
    setField(found, 'hiosPlanId', hiosPlanId, 0.94, document, 'identifier_pattern');
    setField(found, 'issuerHiosId', hiosPlanId.slice(0, 5), 0.86, document, 'identifier_pattern');
  }

  const issuerHios = firstLabelValue(lines, 'issuer\\s+hios\\s+id|issuer\\s+id');
  if (issuerHios) setField(found, 'issuerHiosId', cleanPlanId(issuerHios, 40), 0.84, document);

  const hiosLabel = firstLabelValue(lines, 'hios\\s+plan\\s+id|standard\\s+component\\s+id');
  if (hiosLabel) setField(found, 'hiosPlanId', cleanPlanId(hiosLabel.toUpperCase()), 0.9, document);

  const contractLabel = firstLabelValue(lines, 'cms\\s+contract\\s+id|contract\\s+id');
  const contractMatch = (contractLabel || fullText).match(/\b([HRS]\d{4})\b/i);
  if (contractMatch) setField(found, 'cmsContractId', contractMatch[1].toUpperCase(), 0.88, document, contractLabel ? 'label' : 'identifier_pattern');

  const cmsPlanLabel = firstLabelValue(lines, 'cms\\s+plan\\s+id|cms\\s+plan\\s+number');
  const cmsPlanMatch = cmsPlanLabel?.match(/\b(\d{3})\b/);
  if (cmsPlanMatch) setField(found, 'cmsPlanId', cmsPlanMatch[1], 0.84, document);

  const explicitPlanYear = fullText.match(/\b(?:plan|coverage)\s+year\s*[:#-]?\s*(20\d{2})\b/i);
  if (explicitPlanYear) setField(found, 'planYear', explicitPlanYear[1], 0.84, document, 'date_pattern');

  const coverageType = inferCoverageType(fullText);
  if (coverageType) setField(found, 'coverageType', coverageType, 0.68, document, 'keyword_inference');

  const networkType = inferNetworkType(fullText);
  if (networkType) setField(found, 'networkType', networkType, 0.66, document, 'keyword_inference');

  const metalLevel = inferMetalLevel(fullText);
  if (metalLevel) setField(found, 'metalLevel', metalLevel, 0.7, document, 'keyword_inference');

  const fundingType = inferFundingType(fullText);
  if (fundingType) setField(found, 'fundingType', fundingType, 0.68, document, 'keyword_inference');

  const marketSegment = inferMarketSegment(fullText);
  if (marketSegment) setField(found, 'marketSegment', marketSegment, 0.66, document, 'keyword_inference');

  return buildCandidateFromFound(found);
}

function buildCandidateFromFound(found) {
  const candidateProfile = {};
  const sensitiveHashes = {};
  const evidenceRefs = [];

  for (const [field, match] of Object.entries(found.publicFields)) {
    candidateProfile[field] = match.value;
    evidenceRefs.push(match.evidence);
  }

  for (const [field, match] of Object.entries(found.sensitiveFields)) {
    sensitiveHashes[field] = match.value;
    evidenceRefs.push(match.evidence);
  }

  const confidence = calculateCandidateConfidence(candidateProfile, sensitiveHashes, evidenceRefs);
  return {
    candidateProfile,
    sensitiveHashes,
    evidenceRefs,
    confidence,
  };
}

function calculateCandidateConfidence(candidateProfile, sensitiveHashes, evidenceRefs) {
  if (!evidenceRefs.length) return 0;
  const identityScore = scoreCoverageIdentity({ ...candidateProfile, ...sensitiveHashes });
  const fieldConfidence = evidenceRefs.reduce((sum, ref) => sum + Number(ref.confidence || 0), 0) / evidenceRefs.length;
  return Math.min(0.95, Number(((identityScore * 0.65) + (fieldConfidence * 0.35)).toFixed(3)));
}

function formatCandidate(row) {
  if (!row) return null;
  const candidateProfile = parseJson(row.candidate_profile, {});
  const sensitiveHashes = parseJson(row.sensitive_hashes, {});
  return {
    id: row.id,
    caseId: row.case_id,
    coverageProfileId: row.coverage_profile_id,
    sourceDocumentIds: parseJson(row.source_document_ids, []),
    candidateProfile,
    sensitiveSignals: {
      memberIdDetected: Boolean(sensitiveHashes.memberIdHash),
      groupNumberDetected: Boolean(sensitiveHashes.groupNumberHash),
      employerNameDetected: Boolean(sensitiveHashes.employerNameHash),
    },
    evidenceRefs: parseJson(row.evidence_refs, []),
    extractionMethod: row.extraction_method,
    extractionStatus: row.extraction_status,
    reviewStatus: row.review_status,
    confidence: Number(row.confidence || 0),
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    updatedAt: row.updated_at,
  };
}

export async function listCoverageExtractionCandidates(query, userId, caseId) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;
  const { rows } = await query(
    `SELECT *
     FROM plan_coverage_extraction_candidates
     WHERE user_id = $1 AND case_id = $2
     ORDER BY created_at DESC`,
    [userId, caseId],
  );
  return rows.map(formatCandidate);
}

export async function runCoverageExtraction(query, userId, caseId, options = {}) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;

  const docs = await getEligibleDocuments(query, userId, caseId, options.documentId);
  const aggregate = {
    publicFields: {},
    sensitiveFields: {},
  };
  const summary = {
    documentsScanned: docs.length,
    textDocumentsScanned: 0,
    unsupportedDocuments: 0,
    fieldsFound: 0,
  };

  for (const doc of docs) {
    if (!isReadableTextDocument(doc)) {
      summary.unsupportedDocuments += 1;
      continue;
    }

    const buffer = await readEncryptedConsumerDocument(doc.storage_key);
    const text = buffer.subarray(0, MAX_TEXT_BYTES).toString('utf8');
    summary.textDocumentsScanned += 1;
    mergeCandidate(aggregate, extractCoverageFieldsFromText(text, doc), doc);
  }

  const candidate = buildCandidateFromFound(aggregate);
  summary.fieldsFound = Object.keys(candidate.candidateProfile).length
    + Object.keys(candidate.sensitiveHashes).length;

  if (!summary.fieldsFound) {
    await recordAuditEvent(query, {
      userId,
      caseId,
      eventType: 'coverage_extraction.no_candidate',
      resourceType: 'plan_coverage_extraction_candidates',
      resourceId: caseId,
      reason: JSON.stringify(summary),
    });
    return { candidate: null, summary };
  }

  const sourceDocumentIds = [...new Set(candidate.evidenceRefs.map(ref => ref.documentId).filter(Boolean))];
  const { rows } = await query(
    `INSERT INTO plan_coverage_extraction_candidates
      (user_id, case_id, source_document_ids, candidate_profile, sensitive_hashes,
       evidence_refs, extraction_method, extraction_status, review_status, confidence)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, 'candidate', 'needs_confirmation', $8)
     RETURNING *`,
    [
      userId,
      caseId,
      JSON.stringify(sourceDocumentIds),
      JSON.stringify(candidate.candidateProfile),
      JSON.stringify(candidate.sensitiveHashes),
      JSON.stringify(candidate.evidenceRefs),
      EXTRACTION_METHOD,
      candidate.confidence,
    ],
  );

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'coverage_extraction.candidate_created',
    resourceType: 'plan_coverage_extraction_candidates',
    resourceId: rows[0].id,
  });

  return { candidate: formatCandidate(rows[0]), summary };
}

async function getEligibleDocuments(query, userId, caseId, documentId = null) {
  const params = [userId, caseId, [...ELIGIBLE_DOCUMENT_TYPES]];
  let documentFilter = '';
  if (documentId) {
    params.push(documentId);
    documentFilter = `AND id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT id, document_type, original_filename, storage_key, mime_type, file_size_bytes, created_at
     FROM con_documents
     WHERE user_id = $1
       AND case_id = $2
       AND deleted_at IS NULL
       AND document_type = ANY($3::text[])
       ${documentFilter}
     ORDER BY created_at DESC
     LIMIT 20`,
    params,
  );
  return rows;
}

function mergeCandidate(aggregate, candidate, document) {
  for (const [field, value] of Object.entries(candidate.candidateProfile || {})) {
    const evidence = (candidate.evidenceRefs || [])
      .find(ref => ref.field === field && ref.documentId === document.id)
      || evidenceRef(document, field, candidate.confidence || 0.5, 'aggregate');
    const prior = aggregate.publicFields[field];
    if (!prior || Number(evidence.confidence || 0) >= prior.confidence) {
      aggregate.publicFields[field] = {
        value,
        confidence: Number(evidence.confidence || 0),
        evidence,
      };
    }
  }

  for (const [field, value] of Object.entries(candidate.sensitiveHashes || {})) {
    const sourceField = Object.entries(SENSITIVE_FIELDS).find(([, hashField]) => hashField === field)?.[0] || field;
    const evidence = (candidate.evidenceRefs || [])
      .find(ref => ref.field === sourceField && ref.documentId === document.id)
      || evidenceRef(document, sourceField, candidate.confidence || 0.5, 'aggregate');
    const prior = aggregate.sensitiveFields[field];
    if (!prior || Number(evidence.confidence || 0) >= prior.confidence) {
      aggregate.sensitiveFields[field] = {
        value,
        confidence: Number(evidence.confidence || 0),
        evidence,
      };
    }
  }
}

export async function confirmCoverageExtractionCandidate(query, userId, caseId, candidateId) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;

  const { rows } = await query(
    `SELECT *
     FROM plan_coverage_extraction_candidates
     WHERE id = $1 AND user_id = $2 AND case_id = $3
     LIMIT 1`,
    [candidateId, userId, caseId],
  );
  const row = rows[0];
  if (!row) return null;

  const candidateProfile = parseJson(row.candidate_profile, {});
  const sensitiveHashes = parseJson(row.sensitive_hashes, {});
  const existingProfile = await getCoverageProfile(query, userId, caseId);
  const mergedInput = {
    ...profileToInput(existingProfile),
    ...candidateProfile,
  };

  const profile = await saveCoverageProfile(query, userId, caseId, mergedInput, {
    trustedHashes: sensitiveHashes,
  });

  const { rows: updatedRows } = await query(
    `UPDATE plan_coverage_extraction_candidates
     SET coverage_profile_id = $4,
         review_status = 'confirmed',
         reviewed_at = now(),
         updated_at = now()
     WHERE id = $1 AND user_id = $2 AND case_id = $3
     RETURNING *`,
    [candidateId, userId, caseId, profile.id],
  );

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'coverage_extraction.confirmed',
    resourceType: 'plan_coverage_extraction_candidates',
    resourceId: candidateId,
  });

  return {
    profile,
    candidate: formatCandidate(updatedRows[0]),
  };
}

function profileToInput(profile) {
  if (!profile) return {};
  return {
    coverageType: profile.coverageType,
    marketSegment: profile.marketSegment,
    fundingType: profile.fundingType,
    state: profile.state,
    planYear: profile.planYear,
    payerLegalName: profile.payerLegalName,
    payerTradeName: profile.payerTradeName,
    issuerHiosId: profile.issuerHiosId,
    hiosPlanId: profile.hiosPlanId,
    cmsContractId: profile.cmsContractId,
    cmsPlanId: profile.cmsPlanId,
    planName: profile.planName,
    productType: profile.productType,
    metalLevel: profile.metalLevel,
    networkType: profile.networkType,
    networkName: profile.networkName,
    tpaName: profile.tpaName,
    pbmName: profile.pbmName,
  };
}
