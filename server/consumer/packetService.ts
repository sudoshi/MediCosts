// @ts-nocheck
import { getCaseForUser, recordAuditEvent } from './caseService.js';
import { getBillAnalysis } from './leverageCaseService.js';

export const PACKET_TYPES = new Set([
  'itemized_bill_request',
  'eob_mismatch_dispute',
]);

function formatMoney(cents) {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(value) {
  if (!value) return 'unknown date';
  return String(value).slice(0, 10);
}

function label(value) {
  return String(value || '').replaceAll('_', ' ');
}

export function formatPacket(row) {
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    packetType: row.packet_type,
    title: row.title,
    status: row.status,
    bodyText: row.body_text,
    evidenceManifest: row.evidence_manifest || [],
    generatedFrom: row.generated_from || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPackets(query, userId, caseId) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;
  const { rows } = await query(
    `SELECT *
     FROM comp_packets
     WHERE user_id = $1 AND case_id = $2
     ORDER BY created_at DESC`,
    [userId, caseId],
  );
  return rows.map(formatPacket);
}

export async function createActionPacket(query, userId, caseId, packetType) {
  const consumerCase = await getCaseForUser(query, userId, caseId);
  if (!consumerCase) return null;

  if (!PACKET_TYPES.has(packetType)) {
    const err = new Error('Unsupported packet type.');
    err.code = 'unsupported_packet_type';
    err.status = 422;
    throw err;
  }

  const analysis = await getBillAnalysis(query, userId, caseId);
  if (!analysis?.claim) {
    const err = new Error('A saved bill or EOB is required before generating a packet.');
    err.code = 'claim_required';
    err.status = 422;
    throw err;
  }

  const packet = packetType === 'eob_mismatch_dispute'
    ? buildEobMismatchPacket(consumerCase, analysis)
    : buildItemizedBillRequestPacket(consumerCase, analysis);

  const { rows } = await query(
    `INSERT INTO comp_packets
      (case_id, user_id, packet_type, title, body_text, evidence_manifest, generated_from)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
     RETURNING *`,
    [
      caseId,
      userId,
      packetType,
      packet.title,
      packet.bodyText,
      JSON.stringify(packet.evidenceManifest),
      JSON.stringify(packet.generatedFrom),
    ],
  );

  await query(
    `UPDATE con_cases
     SET status = CASE WHEN status = 'report_ready' THEN 'packet_ready' ELSE status END,
         updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [caseId, userId],
  );

  await recordAuditEvent(query, {
    userId,
    caseId,
    eventType: 'packet.generated',
    resourceType: 'comp_packets',
    resourceId: rows[0].id,
  });

  return formatPacket(rows[0]);
}

export function buildItemizedBillRequestPacket(consumerCase, analysis) {
  const claim = analysis.claim;
  const provider = claim.providerName || consumerCase.provider_name || 'Billing Department';
  const serviceDate = formatDate(claim.serviceDate || consumerCase.service_start_date);
  const total = claim.debtTotalCents === null ? 'unknown total' : formatMoney(claim.debtTotalCents);
  const evidenceManifest = baseEvidenceManifest(analysis);

  return {
    title: 'Itemized bill request',
    evidenceManifest,
    generatedFrom: {
      caseId: consumerCase.id,
      claimId: claim.id,
      findingIds: analysis.findings.map(f => f.id),
    },
    bodyText: [
      'Draft itemized bill request',
      '',
      'This draft is generated from my MediCosts case. It is not legal advice and should be reviewed before sending.',
      '',
      `To: ${provider}`,
      `Re: Request for itemized bill and account review for services on ${serviceDate}`,
      '',
      'Please provide a complete itemized bill for this account, including each line item, CPT/HCPCS or revenue code where applicable, charge amount, adjustment, insurance payment, and patient responsibility.',
      '',
      'Please also pause any collection activity while this request and account review are pending, and confirm in writing the current balance, payment status, and the party currently responsible for account collection.',
      '',
      'Case details I have available:',
      `- Total bill or debt entered: ${total}`,
      `- Insurance status: ${label(claim.insuranceStatus)}`,
      `- State: ${claim.state || consumerCase.state || 'unknown'}`,
      `- Line items entered: ${claim.lineItems.length}`,
      '',
      'Evidence manifest:',
      ...evidenceManifest.map(item => `- ${item.label}: ${item.value}`),
      '',
      'Requested resolution:',
      '- Send the complete itemized bill.',
      '- Confirm the current patient responsibility and account status.',
      '- Correct any line items or patient-responsibility amounts that are inconsistent with the itemized bill or EOB.',
      '',
      'Sincerely,',
      '[Patient / authorized representative]',
    ].join('\n'),
  };
}

export function buildEobMismatchPacket(consumerCase, analysis) {
  const eobFinding = analysis.findings.find(f => f.ruleId === 'EOB_PATIENT_RESP_MISMATCH');
  if (!eobFinding) {
    const err = new Error('An EOB patient responsibility mismatch finding is required for this packet.');
    err.code = 'finding_required';
    err.status = 422;
    throw err;
  }

  const claim = analysis.claim;
  const provider = claim.providerName || consumerCase.provider_name || 'Billing Department';
  const eobResp = claim.eobPatientRespCents === null ? 'unknown' : formatMoney(claim.eobPatientRespCents);
  const linePatientResp = claim.lineItems
    .filter(line => line.patientRespCents !== null)
    .reduce((sum, line) => sum + Number(line.patientRespCents || 0), 0);
  const evidenceManifest = baseEvidenceManifest(analysis).concat([
    { type: 'finding', label: 'MediCosts finding', value: eobFinding.title },
    { type: 'finding_refs', label: 'Finding evidence lines', value: (eobFinding.evidenceRefs || []).join(', ') || 'none' },
  ]);

  return {
    title: 'EOB mismatch dispute draft',
    evidenceManifest,
    generatedFrom: {
      caseId: consumerCase.id,
      claimId: claim.id,
      findingIds: [eobFinding.id],
      ruleIds: [eobFinding.ruleId],
    },
    bodyText: [
      'Draft EOB mismatch dispute',
      '',
      'This draft is generated from my MediCosts case. It is not legal advice and should be reviewed before sending.',
      '',
      `To: ${provider}`,
      `Re: Patient responsibility mismatch for services on ${formatDate(claim.serviceDate || consumerCase.service_start_date)}`,
      '',
      'I am disputing the patient responsibility currently reflected on this bill because it appears inconsistent with the EOB information I have available.',
      '',
      'Summary of mismatch:',
      `- EOB patient responsibility entered: ${eobResp}`,
      `- Patient responsibility reflected in entered bill lines: ${formatMoney(linePatientResp)}`,
      `- Difference flagged by MediCosts: ${formatMoney(eobFinding.estimatedRecoveryLowCents)}`,
      '',
      'Please review the account against the EOB, correct the patient responsibility if appropriate, and send a written explanation of any remaining balance.',
      '',
      'Please pause collection activity while this dispute is reviewed and confirm the account will not be escalated during the review period.',
      '',
      'Evidence manifest:',
      ...evidenceManifest.map(item => `- ${item.label}: ${item.value}`),
      '',
      'Requested resolution:',
      '- Reconcile the bill to the EOB.',
      '- Correct the patient responsibility or explain the basis for any remaining balance.',
      '- Provide an updated statement after review.',
      '',
      'Sincerely,',
      '[Patient / authorized representative]',
    ].join('\n'),
  };
}

function baseEvidenceManifest(analysis) {
  const claim = analysis.claim;
  const entries = [
    { type: 'claim', label: 'Case ID', value: claim.caseId },
    { type: 'claim', label: 'Service date', value: formatDate(claim.serviceDate) },
    { type: 'claim', label: 'Provider or facility', value: claim.providerName || 'unknown' },
    { type: 'claim', label: 'Insurance status', value: label(claim.insuranceStatus) },
  ];

  for (const line of claim.lineItems) {
    entries.push({
      type: 'line_item',
      label: `Line ${line.lineId}`,
      value: [
        line.cptHcpcs ? `CPT/HCPCS ${line.cptHcpcs}` : null,
        line.msDrg ? `MS-DRG ${line.msDrg}` : null,
        `billed ${formatMoney(line.billedCents)}`,
        line.patientRespCents !== null ? `patient responsibility ${formatMoney(line.patientRespCents)}` : null,
      ].filter(Boolean).join(', '),
    });
  }

  return entries;
}
