import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Panel from '../components/Panel.jsx';
import { apiFetch } from '../utils/api.js';
import s from './ConsumerWorkspace.module.css';

const DOCUMENT_TYPES = [
  ['medical_record', 'Medical record'],
  ['bill', 'Bill'],
  ['itemized_bill', 'Itemized bill'],
  ['eob', 'EOB'],
  ['insurance_card', 'Insurance card'],
  ['denial_letter', 'Denial letter'],
  ['appeal_letter', 'Appeal letter'],
  ['collection_notice', 'Collection notice'],
  ['plan_document', 'Plan document'],
  ['gfe', 'Good Faith Estimate'],
];

const COVERAGE_TYPES = [
  ['unknown', 'Unknown'],
  ['commercial', 'Commercial'],
  ['marketplace', 'Marketplace'],
  ['medicare_advantage', 'Medicare Advantage'],
  ['part_d', 'Part D'],
  ['medicaid_managed_care', 'Medicaid managed care'],
  ['medicare_original', 'Original Medicare'],
  ['self_pay', 'Self-pay'],
];

function blankLineItem(index = 0) {
  return {
    lineId: `line-${index + 1}`,
    cptHcpcs: '',
    revenueCode: '',
    msDrg: '',
    modifier: '',
    units: '1',
    billedAmount: '',
    allowedAmount: '',
    planPaidAmount: '',
    patientRespAmount: '',
    serviceDate: '',
  };
}

function emptyClaimForm() {
  return {
    providerName: '',
    facilityCcn: '',
    serviceDate: '',
    serviceYear: String(new Date().getFullYear()),
    insuranceStatus: 'insured',
    state: '',
    debtTotalAmount: '',
    eobPatientRespAmount: '',
    lineItems: [blankLineItem(0)],
  };
}

function emptyCoverageForm() {
  return {
    coverageType: 'unknown',
    marketSegment: '',
    fundingType: '',
    state: '',
    planYear: String(new Date().getFullYear()),
    payerLegalName: '',
    payerTradeName: '',
    issuerHiosId: '',
    hiosPlanId: '',
    cmsContractId: '',
    cmsPlanId: '',
    planName: '',
    productType: '',
    metalLevel: '',
    networkType: '',
    networkName: '',
    groupNumber: '',
    memberId: '',
    employerName: '',
    tpaName: '',
    pbmName: '',
  };
}

export default function CaseDetail() {
  const { caseId } = useParams();
  const fileRef = useRef(null);
  const [caseRecord, setCaseRecord] = useState(null);
  const [releaseState, setReleaseState] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [analysis, setAnalysis] = useState({ claim: null, findings: [], score: null });
  const [packets, setPackets] = useState([]);
  const [coverageProfile, setCoverageProfile] = useState(null);
  const [coverageForm, setCoverageForm] = useState(() => emptyCoverageForm());
  const [coverageCandidates, setCoverageCandidates] = useState([]);
  const [attributions, setAttributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingRelease, setSavingRelease] = useState(false);
  const [savingClaim, setSavingClaim] = useState(false);
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [extractingCoverage, setExtractingCoverage] = useState(false);
  const [confirmingCandidate, setConfirmingCandidate] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [calculatingAttribution, setCalculatingAttribution] = useState(false);
  const [generatingPacket, setGeneratingPacket] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [releaseForm, setReleaseForm] = useState({
    signerName: '',
    signerType: 'self',
    representativeAuthority: '',
    acknowledged: false,
  });
  const [documentType, setDocumentType] = useState('medical_record');
  const [claimForm, setClaimForm] = useState(() => emptyClaimForm());

  useEffect(() => {
    loadCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function loadCase() {
    setLoading(true);
    setError('');
    try {
      const [
        caseData,
        releaseData,
        documentData,
        analysisData,
        packetData,
        coverageData,
        coverageCandidateData,
        attributionData,
      ] = await Promise.all([
        apiFetch(`/cases/${caseId}`),
        apiFetch(`/cases/${caseId}/medical-record-release`),
        apiFetch(`/cases/${caseId}/documents`),
        apiFetch(`/cases/${caseId}/bill-analysis`),
        apiFetch(`/cases/${caseId}/packets`),
        apiFetch(`/cases/${caseId}/coverage-profile`),
        apiFetch(`/cases/${caseId}/coverage-extractions`),
        apiFetch(`/cases/${caseId}/plan-attributions`),
      ]);
      setCaseRecord(caseData.case);
      setReleaseState(releaseData);
      setDocuments(documentData.documents || []);
      setAnalysis({
        claim: analysisData.claim,
        findings: analysisData.findings || [],
        score: analysisData.score,
      });
      setPackets(packetData.packets || []);
      setCoverageProfile(coverageData.profile);
      setCoverageForm(coverageData.profile
        ? formFromCoverageProfile(coverageData.profile)
        : {
            ...emptyCoverageForm(),
            state: caseData.case?.state || '',
            payerLegalName: caseData.case?.payerName || '',
          });
      setCoverageCandidates(coverageCandidateData.candidates || []);
      setAttributions(attributionData.attributions || []);
      if (analysisData.claim) {
        setClaimForm(formFromClaim(analysisData.claim));
      } else {
        setClaimForm(form => ({
          ...form,
          state: caseData.case?.state || '',
          facilityCcn: caseData.case?.facilityCcn || '',
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function signRelease(e) {
    e.preventDefault();
    setSavingRelease(true);
    setError('');
    try {
      const payload = {
        signerName: releaseForm.signerName,
        signerType: releaseForm.signerType,
        representativeAuthority: releaseForm.signerType === 'personal_representative'
          ? releaseForm.representativeAuthority
          : undefined,
      };
      const data = await apiFetch(`/cases/${caseId}/medical-record-release`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setReleaseState({
        release: data.release,
        activeRelease: data.release,
        uploadAllowed: data.uploadAllowed,
        required: true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRelease(false);
    }
  }

  async function revokeRelease() {
    setError('');
    try {
      const data = await apiFetch(`/cases/${caseId}/medical-record-release/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'User revoked from case detail' }),
      });
      setReleaseState({
        release: data.release,
        activeRelease: null,
        uploadAllowed: false,
        required: true,
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveClaim(e) {
    e.preventDefault();
    setSavingClaim(true);
    setError('');
    try {
      const payload = claimPayload(claimForm);
      const data = await apiFetch(`/cases/${caseId}/manual-claim`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setAnalysis(prev => ({ ...prev, claim: data.claim, findings: [], score: null }));
      setAttributions([]);
      setClaimForm(formFromClaim(data.claim));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingClaim(false);
    }
  }

  async function analyzeClaim() {
    setAnalyzing(true);
    setError('');
    try {
      const data = await apiFetch(`/cases/${caseId}/analyze`, { method: 'POST' });
      setAnalysis({
        claim: data.claim,
        findings: data.findings || [],
        score: data.score,
      });
      setAttributions([]);
      if (data.claim) setClaimForm(formFromClaim(data.claim));
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function generatePacket(packetType) {
    setGeneratingPacket(packetType);
    setError('');
    try {
      const data = await apiFetch(`/cases/${caseId}/packets`, {
        method: 'POST',
        body: JSON.stringify({ packetType }),
      });
      setPackets(prev => [data.packet, ...prev]);
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingPacket('');
    }
  }

  function updateClaimField(field, value) {
    setClaimForm(form => ({ ...form, [field]: value }));
  }

  function updateCoverageField(field, value) {
    setCoverageForm(form => ({ ...form, [field]: value }));
  }

  function updateLine(index, field, value) {
    setClaimForm(form => ({
      ...form,
      lineItems: form.lineItems.map((line, i) => i === index ? { ...line, [field]: value } : line),
    }));
  }

  function addLine() {
    setClaimForm(form => ({
      ...form,
      lineItems: [...form.lineItems, blankLineItem(form.lineItems.length)],
    }));
  }

  function removeLine(index) {
    setClaimForm(form => ({
      ...form,
      lineItems: form.lineItems.length > 1
        ? form.lineItems.filter((_, i) => i !== index)
        : form.lineItems,
    }));
  }

  async function saveCoverage(e) {
    e.preventDefault();
    setSavingCoverage(true);
    setError('');
    try {
      const data = await apiFetch(`/cases/${caseId}/coverage-profile`, {
        method: 'PUT',
        body: JSON.stringify(coveragePayload(coverageForm)),
      });
      setCoverageProfile(data.profile);
      setCoverageForm(formFromCoverageProfile(data.profile));
      setAttributions([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCoverage(false);
    }
  }

  async function extractCoverageFromDocuments() {
    setExtractingCoverage(true);
    setError('');
    try {
      const data = await apiFetch(`/cases/${caseId}/coverage-extractions`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (data.candidate) {
        setCoverageCandidates(prev => [data.candidate, ...prev]);
      } else {
        setCoverageCandidates(prev => [...prev]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setExtractingCoverage(false);
    }
  }

  async function confirmCoverageCandidate(candidateId) {
    setConfirmingCandidate(candidateId);
    setError('');
    try {
      const data = await apiFetch(`/cases/${caseId}/coverage-extractions/${candidateId}/confirm`, {
        method: 'POST',
      });
      setCoverageProfile(data.profile);
      setCoverageForm(formFromCoverageProfile(data.profile));
      setCoverageCandidates(prev => prev.map(candidate => (
        candidate.id === data.candidate.id ? data.candidate : candidate
      )));
      setAttributions([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmingCandidate('');
    }
  }

  async function recalculateAttributions() {
    setCalculatingAttribution(true);
    setError('');
    try {
      const data = await apiFetch(`/cases/${caseId}/plan-attributions/recalculate`, {
        method: 'POST',
      });
      setAttributions(data.attributions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setCalculatingAttribution(false);
    }
  }

  async function uploadDocument(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a document first.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('documentType', documentType);
      const data = await apiFetch(`/cases/${caseId}/documents`, {
        method: 'POST',
        body,
      });
      setDocuments(docs => [data.document, ...docs]);
      fileRef.current.value = '';
    } catch (err) {
      if (err.code === 'medical_record_release_required') {
        setReleaseState(prev => ({ ...(prev || {}), uploadAllowed: false, activeRelease: null }));
      }
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const activeRelease = releaseState?.activeRelease;
  const uploadAllowed = Boolean(releaseState?.uploadAllowed && activeRelease);
  const coverageDocumentCount = documents.filter(isCoverageSourceDocument).length;

  if (loading) {
    return <div className={s.empty}>Loading case...</div>;
  }

  if (!caseRecord) {
    return <div className={s.error}>{error || 'Case not found.'}</div>;
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>Case Detail</p>
          <h1 className={s.title}>{caseRecord.title}</h1>
          <p className={s.subtitle}>
            {label(caseRecord.caseType)} case. Document uploads are locked until a signed HIPAA authorization / medical record release is active.
          </p>
        </div>
        <div className={s.buttonRow}>
          <Link className={s.secondaryButton} to="/cases">Back to Cases</Link>
          <span className={uploadAllowed ? s.successBadge : s.warningBadge}>
            {uploadAllowed ? 'Release active' : 'Release required'}
          </span>
        </div>
      </header>

      {error && <div className={s.error}>{error}</div>}

      <div className={s.grid}>
        <div>
          <Panel title="Manual Bill / EOB Entry">
            <form className={s.form} onSubmit={saveClaim}>
              <div className={s.formRow}>
                <div className={s.field}>
                  <label className={s.label}>Provider or facility</label>
                  <input
                    className={s.input}
                    value={claimForm.providerName}
                    onChange={e => updateClaimField('providerName', e.target.value)}
                    placeholder="Hospital, clinician, lab, collector..."
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Service date</label>
                  <input
                    className={s.input}
                    type="date"
                    value={claimForm.serviceDate}
                    onChange={e => updateClaimField('serviceDate', e.target.value)}
                  />
                </div>
              </div>
              <div className={s.formRow}>
                <div className={s.field}>
                  <label className={s.label}>Insurance status</label>
                  <select
                    className={s.select}
                    value={claimForm.insuranceStatus}
                    onChange={e => updateClaimField('insuranceStatus', e.target.value)}
                  >
                    <option value="insured">Insured</option>
                    <option value="uninsured">Uninsured</option>
                    <option value="self_pay">Self-pay</option>
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>State</label>
                  <input
                    className={s.input}
                    maxLength={2}
                    value={claimForm.state}
                    onChange={e => updateClaimField('state', e.target.value.toUpperCase())}
                    placeholder="PA"
                  />
                </div>
              </div>
              <div className={s.formRow}>
                <div className={s.field}>
                  <label className={s.label}>Total bill or debt</label>
                  <input
                    className={s.input}
                    inputMode="decimal"
                    value={claimForm.debtTotalAmount}
                    onChange={e => updateClaimField('debtTotalAmount', e.target.value)}
                    placeholder="1200.00"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>EOB patient responsibility</label>
                  <input
                    className={s.input}
                    inputMode="decimal"
                    value={claimForm.eobPatientRespAmount}
                    onChange={e => updateClaimField('eobPatientRespAmount', e.target.value)}
                    placeholder="450.00"
                  />
                </div>
              </div>

              <div className={s.lineItems}>
                {claimForm.lineItems.map((line, index) => (
                  <div key={`${line.lineId}-${index}`} className={s.lineItem}>
                    <div className={s.lineHeader}>
                      <span className={s.badge}>{line.lineId || `line-${index + 1}`}</span>
                      <button
                        className={s.smallButton}
                        type="button"
                        onClick={() => removeLine(index)}
                        disabled={claimForm.lineItems.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                    <div className={s.compactGrid}>
                      <div className={s.field}>
                        <label className={s.label}>CPT/HCPCS</label>
                        <input
                          className={s.input}
                          value={line.cptHcpcs}
                          onChange={e => updateLine(index, 'cptHcpcs', e.target.value.toUpperCase())}
                          placeholder="99285"
                        />
                      </div>
                      <div className={s.field}>
                        <label className={s.label}>MS-DRG</label>
                        <input
                          className={s.input}
                          value={line.msDrg}
                          onChange={e => updateLine(index, 'msDrg', e.target.value)}
                          placeholder="470"
                        />
                      </div>
                      <div className={s.field}>
                        <label className={s.label}>Units</label>
                        <input
                          className={s.input}
                          inputMode="numeric"
                          value={line.units}
                          onChange={e => updateLine(index, 'units', e.target.value)}
                        />
                      </div>
                      <div className={s.field}>
                        <label className={s.label}>Billed</label>
                        <input
                          className={s.input}
                          inputMode="decimal"
                          value={line.billedAmount}
                          onChange={e => updateLine(index, 'billedAmount', e.target.value)}
                          placeholder="3000.00"
                        />
                      </div>
                      <div className={s.field}>
                        <label className={s.label}>Allowed</label>
                        <input
                          className={s.input}
                          inputMode="decimal"
                          value={line.allowedAmount}
                          onChange={e => updateLine(index, 'allowedAmount', e.target.value)}
                          placeholder="800.00"
                        />
                      </div>
                      <div className={s.field}>
                        <label className={s.label}>Patient owes</label>
                        <input
                          className={s.input}
                          inputMode="decimal"
                          value={line.patientRespAmount}
                          onChange={e => updateLine(index, 'patientRespAmount', e.target.value)}
                          placeholder="500.00"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className={s.buttonRow}>
                <button className={s.secondaryButton} type="button" onClick={addLine}>
                  Add Line
                </button>
                <button className={s.primaryButton} disabled={savingClaim}>
                  {savingClaim ? 'Saving...' : 'Save Bill / EOB'}
                </button>
                <button
                  className={s.secondaryButton}
                  type="button"
                  disabled={analyzing || !analysis.claim}
                  onClick={analyzeClaim}
                >
                  {analyzing ? 'Analyzing...' : 'Analyze'}
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="Bill Analysis Report">
            {analysis.score ? (
              <div className={s.form}>
                <div className={s.scoreBand}>
                  <div>
                    <span className={s.metricLabel}>Leverage score</span>
                    <span className={s.metricValue}>{analysis.score.leverageScore}</span>
                  </div>
                  <div>
                    <span className={s.metricLabel}>Estimated recovery floor</span>
                    <span className={s.metricValue}>{formatMoney(analysis.score.totalEstimatedOverchargeCents)}</span>
                  </div>
                  <div>
                    <span className={s.metricLabel}>Strongest remedy</span>
                    <span className={s.metricValueSmall}>{label(analysis.score.strongestRemedy || 'none')}</span>
                  </div>
                </div>
                {analysis.findings.length ? (
                  <div className={s.findingList}>
                    {analysis.findings.map(finding => (
                      <div key={finding.id} className={s.findingItem}>
                        <div className={s.lineHeader}>
                          <span className={finding.severity === 'high' ? s.warningBadge : s.badge}>
                            {finding.severity}
                          </span>
                          <span className={s.badge}>{finding.ruleId}</span>
                        </div>
                        <h3 className={s.caseTitle}>{finding.title}</h3>
                        <p className={s.muted}>
                          Remedy: {label(finding.remedyType)}. Evidence lines: {(finding.evidenceRefs || []).join(', ') || 'none'}.
                        </p>
                        <p className={s.muted}>
                          Estimated recovery: {formatMoney(finding.estimatedRecoveryLowCents)} to {formatMoney(finding.estimatedRecoveryHighCents)}.
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={s.empty}>No deterministic findings yet.</div>
                )}
              </div>
            ) : analysis.claim ? (
              <div className={s.notice}>
                <p className={s.noticeTitle}>Bill saved</p>
                Run analysis to apply deterministic billing rules and create a leverage score.
              </div>
            ) : (
              <div className={s.empty}>Enter bill or EOB line items to create the first report.</div>
            )}
          </Panel>

          <Panel title="Action Packets">
            <div className={s.form}>
              <div className={s.buttonRow}>
                <button
                  className={s.secondaryButton}
                  type="button"
                  disabled={!analysis.claim || generatingPacket === 'itemized_bill_request'}
                  onClick={() => generatePacket('itemized_bill_request')}
                >
                  {generatingPacket === 'itemized_bill_request' ? 'Generating...' : 'Generate Itemized Bill Request'}
                </button>
                <button
                  className={s.secondaryButton}
                  type="button"
                  disabled={!hasFinding(analysis, 'EOB_PATIENT_RESP_MISMATCH') || generatingPacket === 'eob_mismatch_dispute'}
                  onClick={() => generatePacket('eob_mismatch_dispute')}
                >
                  {generatingPacket === 'eob_mismatch_dispute' ? 'Generating...' : 'Generate EOB Mismatch Draft'}
                </button>
              </div>
              {!analysis.claim && (
                <div className={s.notice}>
                  <p className={s.noticeTitle}>Bill required</p>
                  Save a bill or EOB before generating action packets.
                </div>
              )}
              {analysis.claim && !hasFinding(analysis, 'EOB_PATIENT_RESP_MISMATCH') && (
                <p className={s.muted}>The EOB mismatch draft becomes available when analysis finds an EOB patient responsibility mismatch.</p>
              )}
              {packets.length ? (
                <div className={s.packetList}>
                  {packets.map(packet => (
                    <details key={packet.id} className={s.packetItem}>
                      <summary className={s.packetSummary}>
                        <span>{packet.title}</span>
                        <span className={s.badge}>{label(packet.packetType)}</span>
                      </summary>
                      <pre className={s.packetText}>{packet.bodyText}</pre>
                      <div className={s.copyBox}>
                        <strong>Evidence manifest</strong>
                        <ul className={s.manifestList}>
                          {(packet.evidenceManifest || []).map((item, index) => (
                            <li key={`${packet.id}-${index}`}>
                              {item.label}: {item.value}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className={s.empty}>No packets generated yet.</div>
              )}
            </div>
          </Panel>

          <Panel title="HIPAA Authorization / Medical Record Release">
            {uploadAllowed ? (
              <div className={s.form}>
                <span className={s.successBadge}>Upload gate open</span>
                <div className={s.copyBox}>
                  <strong>Signed by:</strong> {activeRelease.signerName}<br />
                  <strong>Template:</strong> {activeRelease.templateVersion}<br />
                  <strong>Counsel status:</strong> {activeRelease.counselStatus}<br />
                  <strong>Expires:</strong> {formatDate(activeRelease.expirationAt)}
                </div>
                <button className={s.dangerButton} type="button" onClick={revokeRelease}>
                  Revoke Release
                </button>
              </div>
            ) : (
              <form className={s.form} onSubmit={signRelease}>
                <div className={s.notice}>
                  <p className={s.noticeTitle}>Required before upload</p>
                  Sign this case-specific release before uploading bills, EOBs, medical records,
                  insurance cards, denial letters, plan documents, or collection notices.
                </div>
                <div className={s.copyBox}>
                  I authorize MediCosts to receive and store documents I upload for this case and to use them
                  for patient advocacy, healthcare cost review, bill dispute, complaint routing, plan outcome
                  evidence, and case resolution at my request. I understand this release can be revoked for
                  future uploads and sharing.
                </div>
                <div className={s.field}>
                  <label className={s.label}>Signer full legal name</label>
                  <input
                    className={s.input}
                    value={releaseForm.signerName}
                    onChange={e => setReleaseForm(f => ({ ...f, signerName: e.target.value }))}
                    required
                  />
                </div>
                <div className={s.formRow}>
                  <div className={s.field}>
                    <label className={s.label}>Signer type</label>
                    <select
                      className={s.select}
                      value={releaseForm.signerType}
                      onChange={e => setReleaseForm(f => ({ ...f, signerType: e.target.value }))}
                    >
                      <option value="self">Patient / member</option>
                      <option value="personal_representative">Personal representative</option>
                    </select>
                  </div>
                  {releaseForm.signerType === 'personal_representative' && (
                    <div className={s.field}>
                      <label className={s.label}>Representative authority</label>
                      <input
                        className={s.input}
                        value={releaseForm.representativeAuthority}
                        onChange={e => setReleaseForm(f => ({ ...f, representativeAuthority: e.target.value }))}
                        placeholder="e.g., parent, guardian, health care POA"
                        required
                      />
                    </div>
                  )}
                </div>
                <label className={s.field}>
                  <span className={s.label}>Acknowledgment</span>
                  <span className={s.copyBox}>
                    <input
                      type="checkbox"
                      checked={releaseForm.acknowledged}
                      onChange={e => setReleaseForm(f => ({ ...f, acknowledged: e.target.checked }))}
                      required
                    />{' '}
                    I understand this draft release must be reviewed by counsel before production launch.
                  </span>
                </label>
                <button
                  className={s.primaryButton}
                  disabled={savingRelease || !releaseForm.signerName || !releaseForm.acknowledged}
                >
                  {savingRelease ? 'Signing...' : 'Sign Release'}
                </button>
              </form>
            )}
          </Panel>

          <Panel title="Document Upload">
            {uploadAllowed ? (
              <form className={s.form} onSubmit={uploadDocument}>
                <div className={s.formRow}>
                  <div className={s.field}>
                    <label className={s.label}>Document type</label>
                    <select
                      className={s.select}
                      value={documentType}
                      onChange={e => setDocumentType(e.target.value)}
                    >
                      {DOCUMENT_TYPES.map(([value, labelText]) => (
                        <option key={value} value={value}>{labelText}</option>
                      ))}
                    </select>
                  </div>
                  <div className={s.field}>
                    <label className={s.label}>File</label>
                    <input
                      ref={fileRef}
                      className={s.input}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.txt"
                    />
                  </div>
                </div>
                <button className={s.primaryButton} disabled={uploading}>
                  {uploading ? 'Uploading...' : 'Upload Encrypted Document'}
                </button>
              </form>
            ) : (
              <div className={s.notice}>
                <p className={s.noticeTitle}>Upload locked</p>
                The upload control is unavailable until the case has an active signed release.
              </div>
            )}
          </Panel>
        </div>

        <div>
          <Panel title="Coverage Profile">
            <form className={s.form} onSubmit={saveCoverage}>
              <div className={s.lineHeader}>
                <span className={coverageProfile ? s.successBadge : s.warningBadge}>
                  {coverageProfile ? 'Profile saved' : 'Profile needed'}
                </span>
                <span className={s.badge}>
                  Confidence {confidencePercent(coverageProfile?.identityConfidence)}
                </span>
              </div>
              <div className={s.confidenceBar} aria-hidden="true">
                <span style={{ width: confidencePercent(coverageProfile?.identityConfidence) }} />
              </div>
              <div className={s.formRow}>
                <div className={s.field}>
                  <label className={s.label}>Payer legal name</label>
                  <input
                    className={s.input}
                    value={coverageForm.payerLegalName}
                    onChange={e => updateCoverageField('payerLegalName', e.target.value)}
                    placeholder="Example Health Insurance Co."
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Payer trade name</label>
                  <input
                    className={s.input}
                    value={coverageForm.payerTradeName}
                    onChange={e => updateCoverageField('payerTradeName', e.target.value)}
                    placeholder="Example Health"
                  />
                </div>
              </div>
              <div className={s.field}>
                <label className={s.label}>Plan name</label>
                <input
                  className={s.input}
                  value={coverageForm.planName}
                  onChange={e => updateCoverageField('planName', e.target.value)}
                  placeholder="Example Choice PPO"
                />
              </div>
              <div className={s.formRow}>
                <div className={s.field}>
                  <label className={s.label}>Coverage type</label>
                  <select
                    className={s.select}
                    value={coverageForm.coverageType}
                    onChange={e => updateCoverageField('coverageType', e.target.value)}
                  >
                    {COVERAGE_TYPES.map(([value, labelText]) => (
                      <option key={value} value={value}>{labelText}</option>
                    ))}
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Plan year</label>
                  <input
                    className={s.input}
                    inputMode="numeric"
                    value={coverageForm.planYear}
                    onChange={e => updateCoverageField('planYear', e.target.value)}
                    placeholder="2026"
                  />
                </div>
              </div>
              <div className={s.formRow}>
                <div className={s.field}>
                  <label className={s.label}>State</label>
                  <input
                    className={s.input}
                    maxLength={2}
                    value={coverageForm.state}
                    onChange={e => updateCoverageField('state', e.target.value.toUpperCase())}
                    placeholder="PA"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Network name</label>
                  <input
                    className={s.input}
                    value={coverageForm.networkName}
                    onChange={e => updateCoverageField('networkName', e.target.value)}
                    placeholder="Example Choice Network"
                  />
                </div>
              </div>
              <div className={s.compactGrid}>
                <div className={s.field}>
                  <label className={s.label}>Market segment</label>
                  <input
                    className={s.input}
                    value={coverageForm.marketSegment}
                    onChange={e => updateCoverageField('marketSegment', e.target.value)}
                    placeholder="individual"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Funding type</label>
                  <input
                    className={s.input}
                    value={coverageForm.fundingType}
                    onChange={e => updateCoverageField('fundingType', e.target.value)}
                    placeholder="fully insured"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Network type</label>
                  <input
                    className={s.input}
                    value={coverageForm.networkType}
                    onChange={e => updateCoverageField('networkType', e.target.value)}
                    placeholder="PPO"
                  />
                </div>
              </div>
              <div className={s.compactGrid}>
                <div className={s.field}>
                  <label className={s.label}>HIOS issuer ID</label>
                  <input
                    className={s.input}
                    value={coverageForm.issuerHiosId}
                    onChange={e => updateCoverageField('issuerHiosId', e.target.value)}
                    placeholder="12345"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>HIOS plan ID</label>
                  <input
                    className={s.input}
                    value={coverageForm.hiosPlanId}
                    onChange={e => updateCoverageField('hiosPlanId', e.target.value)}
                    placeholder="12345PA0010001"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Product type</label>
                  <input
                    className={s.input}
                    value={coverageForm.productType}
                    onChange={e => updateCoverageField('productType', e.target.value)}
                    placeholder="PPO"
                  />
                </div>
              </div>
              <div className={s.formRow}>
                <div className={s.field}>
                  <label className={s.label}>CMS contract ID</label>
                  <input
                    className={s.input}
                    value={coverageForm.cmsContractId}
                    onChange={e => updateCoverageField('cmsContractId', e.target.value.toUpperCase())}
                    placeholder="H1234"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>CMS plan ID</label>
                  <input
                    className={s.input}
                    value={coverageForm.cmsPlanId}
                    onChange={e => updateCoverageField('cmsPlanId', e.target.value)}
                    placeholder="001"
                  />
                </div>
              </div>
              <div className={s.formRow}>
                <div className={s.field}>
                  <label className={s.label}>TPA name</label>
                  <input
                    className={s.input}
                    value={coverageForm.tpaName}
                    onChange={e => updateCoverageField('tpaName', e.target.value)}
                    placeholder="Third party administrator"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>PBM name</label>
                  <input
                    className={s.input}
                    value={coverageForm.pbmName}
                    onChange={e => updateCoverageField('pbmName', e.target.value)}
                    placeholder="Pharmacy benefit manager"
                  />
                </div>
              </div>
              <div className={s.notice}>
                <p className={s.noticeTitle}>Hash-only member fields</p>
                Member ID, group number, and employer name are transformed before storage and are not displayed after save.
              </div>
              <div className={s.compactGrid}>
                <div className={s.field}>
                  <label className={s.label}>Member ID</label>
                  <input
                    className={s.input}
                    value={coverageForm.memberId}
                    onChange={e => updateCoverageField('memberId', e.target.value)}
                    placeholder="Write-only"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Group number</label>
                  <input
                    className={s.input}
                    value={coverageForm.groupNumber}
                    onChange={e => updateCoverageField('groupNumber', e.target.value)}
                    placeholder="Write-only"
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>Employer name</label>
                  <input
                    className={s.input}
                    value={coverageForm.employerName}
                    onChange={e => updateCoverageField('employerName', e.target.value)}
                    placeholder="Write-only"
                  />
                </div>
              </div>
              <button className={s.primaryButton} disabled={savingCoverage}>
                {savingCoverage ? 'Saving...' : 'Save Coverage Profile'}
              </button>
            </form>
          </Panel>

          <Panel title="Coverage Evidence Candidates">
            <div className={s.form}>
              <div className={s.buttonRow}>
                <button
                  className={s.secondaryButton}
                  type="button"
                  disabled={extractingCoverage || !coverageDocumentCount}
                  onClick={extractCoverageFromDocuments}
                >
                  {extractingCoverage ? 'Extracting...' : 'Extract From Documents'}
                </button>
                <span className={coverageDocumentCount ? s.successBadge : s.warningBadge}>
                  {coverageDocumentCount} source docs
                </span>
              </div>
              {coverageCandidates.length ? (
                <div className={s.attributionList}>
                  {coverageCandidates.map(candidate => (
                    <div key={candidate.id} className={s.attributionItem}>
                      <div className={s.lineHeader}>
                        <span className={candidate.reviewStatus === 'confirmed' ? s.successBadge : s.warningBadge}>
                          {label(candidate.reviewStatus)}
                        </span>
                        <span className={s.badge}>{confidencePercent(candidate.confidence)}</span>
                      </div>
                      <div className={s.copyBox}>
                        {formatCandidateFields(candidate.candidateProfile).map(item => (
                          <div key={`${candidate.id}-${item.label}`}>
                            <strong>{item.label}:</strong> {item.value}
                          </div>
                        ))}
                        {formatSensitiveSignals(candidate.sensitiveSignals).map(item => (
                          <div key={`${candidate.id}-${item}`}>
                            <strong>{item}:</strong> detected
                          </div>
                        ))}
                      </div>
                      <p className={s.muted}>
                        Evidence: {formatExtractionEvidence(candidate.evidenceRefs)}
                      </p>
                      <button
                        className={s.primaryButton}
                        type="button"
                        disabled={candidate.reviewStatus === 'confirmed' || confirmingCandidate === candidate.id}
                        onClick={() => confirmCoverageCandidate(candidate.id)}
                      >
                        {confirmingCandidate === candidate.id ? 'Confirming...' : 'Confirm Into Profile'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : coverageDocumentCount ? (
                <div className={s.empty}>No extracted coverage candidates yet.</div>
              ) : (
                <div className={s.empty}>Upload an insurance card, EOB, denial letter, or plan document first.</div>
              )}
            </div>
          </Panel>

          <Panel title="Plan Outcome Attribution">
            <div className={s.form}>
              <div className={s.buttonRow}>
                <button
                  className={s.secondaryButton}
                  type="button"
                  disabled={!analysis.claim || calculatingAttribution}
                  onClick={recalculateAttributions}
                >
                  {calculatingAttribution ? 'Calculating...' : 'Recalculate Attribution'}
                </button>
                <span className={coverageProfile ? s.successBadge : s.warningBadge}>
                  {coverageProfile ? 'Plan identity available' : 'Plan identity missing'}
                </span>
              </div>
              {!analysis.claim ? (
                <div className={s.empty}>Enter and analyze a bill or EOB first.</div>
              ) : attributions.length ? (
                <div className={s.attributionList}>
                  {attributions.map(attribution => (
                    <div key={attribution.id} className={s.attributionItem}>
                      <div className={s.lineHeader}>
                        <span className={attribution.attributionType === 'plan_contributed' ? s.successBadge : s.warningBadge}>
                          {label(attribution.attributionType)}
                        </span>
                        <span className={s.badge}>
                          {confidencePercent(attribution.attributionConfidence)}
                        </span>
                      </div>
                      <h3 className={s.caseTitle}>{label(attribution.outcomeType)}</h3>
                      <p className={s.muted}>{attribution.summary}</p>
                      <div className={s.copyBox}>
                        <strong>Plan:</strong> {attribution.planIdentifier || 'Unknown'}<br />
                        <strong>Payer:</strong> {attribution.payerLegalName || attribution.payerTradeName || 'Unknown'}<br />
                        <strong>Basis:</strong> {label(attribution.attributionBasis)}<br />
                        <strong>Evidence:</strong> {formatEvidenceRefs(attribution.evidenceRefs)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : hasFinding(analysis, 'EOB_PATIENT_RESP_MISMATCH') ? (
                <div className={s.notice}>
                  <p className={s.noticeTitle}>Ready to calculate</p>
                  The current analysis has an EOB mismatch finding that can be drafted into plan attribution.
                </div>
              ) : (
                <div className={s.empty}>No plan-attributable outcome finding is available yet.</div>
              )}
            </div>
          </Panel>

          <Panel title="Case Facts">
            <div className={s.copyBox}>
              <strong>Status:</strong> {label(caseRecord.status)}<br />
              <strong>Priority:</strong> {caseRecord.priority}<br />
              <strong>State:</strong> {caseRecord.state || 'Unknown'}<br />
              <strong>Payer:</strong> {caseRecord.payerName || 'Unknown'}
            </div>
          </Panel>

          <Panel title="Documents">
            {documents.length ? (
              <div className={s.documentList}>
                {documents.map(doc => (
                  <div key={doc.id} className={s.documentItem}>
                    <div>
                      <p className={s.documentName}>{doc.originalFilename}</p>
                      <p className={s.muted}>
                        {label(doc.documentType)} - {formatBytes(doc.fileSizeBytes)} - release {shortId(doc.medicalRecordReleaseId)}
                      </p>
                    </div>
                    <span className={s.badge}>{doc.malwareScanStatus}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={s.empty}>No documents uploaded.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function label(value) {
  return String(value || '').replaceAll('_', ' ');
}

function hasFinding(analysis, ruleId) {
  return Boolean(analysis?.findings?.some(finding => finding.ruleId === ruleId));
}

function formFromClaim(claim) {
  return {
    providerName: claim.providerName || '',
    facilityCcn: claim.facilityCcn || '',
    serviceDate: isoDate(claim.serviceDate),
    serviceYear: String(claim.serviceYear || new Date().getFullYear()),
    insuranceStatus: claim.insuranceStatus || 'insured',
    state: claim.state || '',
    debtTotalAmount: centsToAmount(claim.debtTotalCents),
    eobPatientRespAmount: centsToAmount(claim.eobPatientRespCents),
    lineItems: claim.lineItems?.length
      ? claim.lineItems.map((line, index) => ({
          lineId: line.lineId || `line-${index + 1}`,
          cptHcpcs: line.cptHcpcs || '',
          revenueCode: line.revenueCode || '',
          msDrg: line.msDrg || '',
          modifier: line.modifier || '',
          units: String(line.units || 1),
          billedAmount: centsToAmount(line.billedCents),
          allowedAmount: centsToAmount(line.allowedCents),
          planPaidAmount: centsToAmount(line.planPaidCents),
          patientRespAmount: centsToAmount(line.patientRespCents),
          serviceDate: isoDate(line.serviceDate),
        }))
      : [blankLineItem(0)],
  };
}

function formFromCoverageProfile(profile) {
  if (!profile) return emptyCoverageForm();
  return {
    ...emptyCoverageForm(),
    coverageType: profile.coverageType || 'unknown',
    marketSegment: profile.marketSegment || '',
    fundingType: profile.fundingType || '',
    state: profile.state || '',
    planYear: profile.planYear ? String(profile.planYear) : '',
    payerLegalName: profile.payerLegalName || '',
    payerTradeName: profile.payerTradeName || '',
    issuerHiosId: profile.issuerHiosId || '',
    hiosPlanId: profile.hiosPlanId || '',
    cmsContractId: profile.cmsContractId || '',
    cmsPlanId: profile.cmsPlanId || '',
    planName: profile.planName || '',
    productType: profile.productType || '',
    metalLevel: profile.metalLevel || '',
    networkType: profile.networkType || '',
    networkName: profile.networkName || '',
    tpaName: profile.tpaName || '',
    pbmName: profile.pbmName || '',
  };
}

function claimPayload(form) {
  return {
    providerName: form.providerName,
    facilityCcn: form.facilityCcn,
    serviceDate: form.serviceDate || null,
    serviceYear: Number(form.serviceYear) || undefined,
    insuranceStatus: form.insuranceStatus,
    state: form.state,
    debtTotalCents: dollarsToCents(form.debtTotalAmount),
    eobPatientRespCents: dollarsToCents(form.eobPatientRespAmount),
    lineItems: form.lineItems.map((line, index) => ({
      lineId: line.lineId || `line-${index + 1}`,
      cptHcpcs: line.cptHcpcs,
      revenueCode: line.revenueCode,
      msDrg: line.msDrg,
      modifier: line.modifier,
      units: Number(line.units) || 1,
      billedCents: dollarsToCents(line.billedAmount),
      allowedCents: dollarsToCents(line.allowedAmount),
      planPaidCents: dollarsToCents(line.planPaidAmount),
      patientRespCents: dollarsToCents(line.patientRespAmount),
      serviceDate: line.serviceDate || form.serviceDate || null,
    })),
  };
}

function coveragePayload(form) {
  return {
    coverageType: form.coverageType,
    marketSegment: form.marketSegment,
    fundingType: form.fundingType,
    state: form.state,
    planYear: form.planYear ? Number(form.planYear) : null,
    payerLegalName: form.payerLegalName,
    payerTradeName: form.payerTradeName,
    issuerHiosId: form.issuerHiosId,
    hiosPlanId: form.hiosPlanId,
    cmsContractId: form.cmsContractId,
    cmsPlanId: form.cmsPlanId,
    planName: form.planName,
    productType: form.productType,
    metalLevel: form.metalLevel,
    networkType: form.networkType,
    networkName: form.networkName,
    groupNumber: form.groupNumber,
    memberId: form.memberId,
    employerName: form.employerName,
    tpaName: form.tpaName,
    pbmName: form.pbmName,
  };
}

function dollarsToCents(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value).replace(/[$,]/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function centsToAmount(value) {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? (parsed / 100).toFixed(2) : '';
}

function formatMoney(value) {
  const parsed = Number(value || 0);
  return (parsed / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function isoDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatDate(value) {
  if (!value) return 'No expiration recorded';
  return new Date(value).toLocaleDateString();
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function isCoverageSourceDocument(doc) {
  return ['insurance_card', 'eob', 'denial_letter', 'plan_document'].includes(doc?.documentType);
}

function shortId(value) {
  return value ? String(value).slice(0, 8) : 'unknown';
}

function confidencePercent(value) {
  const parsed = Number(value || 0);
  const bounded = Math.max(0, Math.min(1, Number.isFinite(parsed) ? parsed : 0));
  return `${Math.round(bounded * 100)}%`;
}

function formatEvidenceRefs(evidenceRefs) {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) return 'None recorded';
  return evidenceRefs
    .map(ref => {
      if (!ref || typeof ref !== 'object') return String(ref);
      const id = ref.id || ref.ruleId || ref.label;
      return [label(ref.type), id].filter(Boolean).join(' ');
    })
    .join(', ');
}

function formatCandidateFields(profile = {}) {
  const labels = {
    payerLegalName: 'Payer legal name',
    payerTradeName: 'Payer trade name',
    planName: 'Plan name',
    coverageType: 'Coverage type',
    planYear: 'Plan year',
    state: 'State',
    networkName: 'Network name',
    networkType: 'Network type',
    hiosPlanId: 'HIOS plan ID',
    issuerHiosId: 'HIOS issuer ID',
    cmsContractId: 'CMS contract ID',
    cmsPlanId: 'CMS plan ID',
    marketSegment: 'Market segment',
    fundingType: 'Funding type',
    metalLevel: 'Metal level',
    productType: 'Product type',
    tpaName: 'TPA',
    pbmName: 'PBM',
  };
  return Object.entries(labels)
    .filter(([key]) => profile[key] !== null && profile[key] !== undefined && profile[key] !== '')
    .map(([key, labelText]) => ({ label: labelText, value: String(profile[key]) }));
}

function formatSensitiveSignals(signals = {}) {
  const detected = [];
  if (signals.memberIdDetected) detected.push('Member ID');
  if (signals.groupNumberDetected) detected.push('Group number');
  if (signals.employerNameDetected) detected.push('Employer name');
  return detected;
}

function formatExtractionEvidence(evidenceRefs) {
  if (!Array.isArray(evidenceRefs) || !evidenceRefs.length) return 'None recorded';
  const filenames = [...new Set(evidenceRefs.map(ref => ref.filename).filter(Boolean))];
  const fields = [...new Set(evidenceRefs.map(ref => ref.field).filter(Boolean))];
  return `${filenames.join(', ') || 'uploaded document'}; ${fields.length} fields`;
}
