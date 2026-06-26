import { Router } from 'express';
import pool from '../db.js';
import medicalDocumentUpload from '../middleware/medicalDocumentUpload.js';
import {
  assertActiveMedicalRecordRelease,
  createCase,
  createDocumentRecord,
  createMedicalRecordRelease,
  formatCase,
  formatRelease,
  getActiveMedicalRecordRelease,
  getCaseForUser,
  getLatestMedicalRecordRelease,
  listCases,
  listDocuments,
  recordAuditEvent,
  revokeMedicalRecordRelease,
} from '../consumer/caseService.js';
import {
  deleteStoredDocumentByKey,
  sha256,
  writeEncryptedConsumerDocument,
} from '../consumer/documentStorage.js';
import {
  analyzeManualClaim,
  getBillAnalysis,
  saveManualClaim,
} from '../consumer/leverageCaseService.js';
import {
  createActionPacket,
  listPackets,
} from '../consumer/packetService.js';
import {
  getCoverageProfile,
  getOutcomeAttributions,
  recalculateOutcomeAttributions,
  saveCoverageProfile,
} from '../consumer/planAttributionService.js';
import {
  confirmCoverageExtractionCandidate,
  listCoverageExtractionCandidates,
  runCoverageExtraction,
} from '../consumer/planCoverageExtractionService.js';

const router = Router();
const query = pool.query.bind(pool);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function currentUserId(req) {
  return req.user?.id;
}

function requestMeta(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

function sendServiceError(res, err) {
  const status = err.status || (err.code ? 422 : 500);
  return res.status(status).json({
    error: err.message || 'Request failed',
    code: err.code || 'request_failed',
  });
}

async function requireOwnedCase(req, res, next) {
  try {
    const userId = currentUserId(req);
    const found = await getCaseForUser(query, userId, req.params.caseId);
    if (!found) return res.status(404).json({ error: 'Case not found', code: 'case_not_found' });
    req.consumerCase = found;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireReleaseBeforeUpload(req, res, next) {
  try {
    const release = await assertActiveMedicalRecordRelease(query, currentUserId(req), req.params.caseId);
    req.medicalRecordRelease = release;
    next();
  } catch (err) {
    return sendServiceError(res, err);
  }
}

function uploadOneDocument(req, res, next) {
  medicalDocumentUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message, code: 'invalid_document_upload' });
    }
    next();
  });
}

router.get('/', asyncHandler(async (req, res) => {
  const cases = await listCases(query, currentUserId(req));
  res.json({ cases });
}));

router.post('/', asyncHandler(async (req, res) => {
  const created = await createCase(query, currentUserId(req), req.body || {});
  res.status(201).json({ case: created });
}));

router.get('/:caseId', requireOwnedCase, asyncHandler(async (req, res) => {
  await recordAuditEvent(query, {
    userId: currentUserId(req),
    caseId: req.consumerCase.id,
    eventType: 'case.read',
    resourceType: 'con_cases',
    resourceId: req.consumerCase.id,
  });
  res.json({ case: formatCase(req.consumerCase) });
}));

router.patch('/:caseId', requireOwnedCase, asyncHandler(async (req, res) => {
  const { updateCase } = await import('../consumer/caseService.js');
  const updated = await updateCase(query, currentUserId(req), req.params.caseId, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Case not found', code: 'case_not_found' });
  res.json({ case: updated });
}));

router.get('/:caseId/medical-record-release', requireOwnedCase, asyncHandler(async (req, res) => {
  const latest = await getLatestMedicalRecordRelease(query, currentUserId(req), req.params.caseId);
  const active = await getActiveMedicalRecordRelease(query, currentUserId(req), req.params.caseId);
  res.json({
    release: formatRelease(latest),
    activeRelease: formatRelease(active),
    uploadAllowed: Boolean(active),
    required: true,
  });
}));

router.post('/:caseId/medical-record-release', requireOwnedCase, asyncHandler(async (req, res) => {
  try {
    const release = await createMedicalRecordRelease(
      query,
      currentUserId(req),
      req.params.caseId,
      req.body || {},
      requestMeta(req),
    );
    if (!release) return res.status(404).json({ error: 'Case not found', code: 'case_not_found' });
    res.status(201).json({ release, uploadAllowed: release.active });
  } catch (err) {
    return sendServiceError(res, err);
  }
}));

router.post('/:caseId/medical-record-release/revoke', requireOwnedCase, asyncHandler(async (req, res) => {
  const latest = await getLatestMedicalRecordRelease(query, currentUserId(req), req.params.caseId);
  if (!latest) {
    return res.status(404).json({ error: 'Release not found', code: 'release_not_found' });
  }
  const release = await revokeMedicalRecordRelease(
    query,
    currentUserId(req),
    req.params.caseId,
    latest.id,
    req.body?.reason,
  );
  res.json({ release, uploadAllowed: false });
}));

router.get('/:caseId/documents', requireOwnedCase, asyncHandler(async (req, res) => {
  const documents = await listDocuments(query, currentUserId(req), req.params.caseId);
  res.json({ documents: documents || [] });
}));

router.get('/:caseId/bill-analysis', requireOwnedCase, asyncHandler(async (req, res) => {
  const analysis = await getBillAnalysis(query, currentUserId(req), req.params.caseId);
  res.json(analysis || { claim: null, findings: [], score: null });
}));

router.get('/:caseId/coverage-profile', requireOwnedCase, asyncHandler(async (req, res) => {
  const profile = await getCoverageProfile(query, currentUserId(req), req.params.caseId);
  res.json({ profile });
}));

router.put('/:caseId/coverage-profile', requireOwnedCase, asyncHandler(async (req, res) => {
  try {
    const profile = await saveCoverageProfile(query, currentUserId(req), req.params.caseId, req.body || {});
    if (!profile) return res.status(404).json({ error: 'Case not found', code: 'case_not_found' });
    res.json({ profile });
  } catch (err) {
    return sendServiceError(res, err);
  }
}));

router.get('/:caseId/coverage-extractions', requireOwnedCase, asyncHandler(async (req, res) => {
  const candidates = await listCoverageExtractionCandidates(query, currentUserId(req), req.params.caseId);
  res.json({ candidates: candidates || [] });
}));

router.post('/:caseId/coverage-extractions', requireOwnedCase, asyncHandler(async (req, res) => {
  try {
    const result = await runCoverageExtraction(query, currentUserId(req), req.params.caseId, {
      documentId: req.body?.documentId,
    });
    if (!result) return res.status(404).json({ error: 'Case not found', code: 'case_not_found' });
    res.status(result.candidate ? 201 : 200).json(result);
  } catch (err) {
    return sendServiceError(res, err);
  }
}));

router.post('/:caseId/coverage-extractions/:candidateId/confirm', requireOwnedCase, asyncHandler(async (req, res) => {
  try {
    const result = await confirmCoverageExtractionCandidate(
      query,
      currentUserId(req),
      req.params.caseId,
      req.params.candidateId,
    );
    if (!result) return res.status(404).json({ error: 'Extraction candidate not found', code: 'candidate_not_found' });
    res.json(result);
  } catch (err) {
    return sendServiceError(res, err);
  }
}));

router.get('/:caseId/plan-attributions', requireOwnedCase, asyncHandler(async (req, res) => {
  const attributions = await getOutcomeAttributions(query, currentUserId(req), req.params.caseId);
  res.json({ attributions: attributions || [] });
}));

router.post('/:caseId/plan-attributions/recalculate', requireOwnedCase, asyncHandler(async (req, res) => {
  try {
    const attributions = await recalculateOutcomeAttributions(query, currentUserId(req), req.params.caseId);
    res.json({ attributions: attributions || [] });
  } catch (err) {
    return sendServiceError(res, err);
  }
}));

router.put('/:caseId/manual-claim', requireOwnedCase, asyncHandler(async (req, res) => {
  try {
    const claim = await saveManualClaim(query, currentUserId(req), req.params.caseId, req.body || {});
    if (!claim) return res.status(404).json({ error: 'Case not found', code: 'case_not_found' });
    res.json({ claim });
  } catch (err) {
    return sendServiceError(res, err);
  }
}));

router.post('/:caseId/analyze', requireOwnedCase, asyncHandler(async (req, res) => {
  try {
    const analysis = await analyzeManualClaim(query, currentUserId(req), req.params.caseId);
    res.json(analysis);
  } catch (err) {
    return sendServiceError(res, err);
  }
}));

router.get('/:caseId/packets', requireOwnedCase, asyncHandler(async (req, res) => {
  const packets = await listPackets(query, currentUserId(req), req.params.caseId);
  res.json({ packets: packets || [] });
}));

router.post('/:caseId/packets', requireOwnedCase, asyncHandler(async (req, res) => {
  try {
    const packet = await createActionPacket(
      query,
      currentUserId(req),
      req.params.caseId,
      req.body?.packetType,
    );
    if (!packet) return res.status(404).json({ error: 'Case not found', code: 'case_not_found' });
    res.status(201).json({ packet });
  } catch (err) {
    return sendServiceError(res, err);
  }
}));

router.post(
  '/:caseId/documents',
  requireOwnedCase,
  requireReleaseBeforeUpload,
  uploadOneDocument,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded', code: 'no_file_uploaded' });
    }

    const originalSha = sha256(req.file.buffer);
    let stored = null;
    try {
      stored = await writeEncryptedConsumerDocument({
        userId: currentUserId(req),
        caseId: req.params.caseId,
        buffer: req.file.buffer,
      });

      const document = await createDocumentRecord(query, {
        userId: currentUserId(req),
        caseId: req.params.caseId,
        medicalRecordReleaseId: req.medicalRecordRelease.id,
        documentType: req.body?.documentType || 'medical_record',
        originalFilename: req.file.originalname,
        storageKey: stored.storageKey,
        sha256: originalSha,
        fileSizeBytes: req.file.size,
        mimeType: req.file.mimetype,
      });

      res.status(201).json({ document });
    } catch (err) {
      if (stored?.storageKey) await deleteStoredDocumentByKey(stored.storageKey);
      throw err;
    }
  }),
);

export default router;
