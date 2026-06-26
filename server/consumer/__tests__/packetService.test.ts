import { describe, expect, it } from 'vitest';
import {
  buildEobMismatchPacket,
  buildItemizedBillRequestPacket,
} from '../packetService.js';

const consumerCase = {
  id: '11111111-1111-4111-8111-111111111111',
  state: 'PA',
  service_start_date: '2024-02-03',
};

const analysis = {
  claim: {
    id: 'claim-1',
    caseId: consumerCase.id,
    providerName: 'Example Hospital',
    serviceDate: '2024-02-03',
    insuranceStatus: 'insured',
    state: 'PA',
    eobPatientRespCents: 20000,
    debtTotalCents: 50000,
    lineItems: [
      {
        lineId: 'line-1',
        cptHcpcs: '99285',
        msDrg: null,
        billedCents: 50000,
        patientRespCents: 50000,
      },
    ],
  },
  findings: [
    {
      id: 10,
      ruleId: 'EOB_PATIENT_RESP_MISMATCH',
      title: 'Bill seeks $500.00 from the patient but the EOB adjudicated only $200.00',
      evidenceRefs: ['line-1'],
      estimatedRecoveryLowCents: 30000,
    },
  ],
};

describe('packet service templates', () => {
  it('builds an itemized bill request with a conservative evidence manifest', () => {
    const packet = buildItemizedBillRequestPacket(consumerCase, analysis);

    expect(packet.title).toBe('Itemized bill request');
    expect(packet.bodyText).toContain('not legal advice');
    expect(packet.bodyText).toContain('Please provide a complete itemized bill');
    expect(packet.evidenceManifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Case ID', value: consumerCase.id }),
        expect.objectContaining({ label: 'Line line-1' }),
      ]),
    );
  });

  it('builds an EOB mismatch dispute only when the deterministic finding exists', () => {
    const packet = buildEobMismatchPacket(consumerCase, analysis);

    expect(packet.title).toBe('EOB mismatch dispute draft');
    expect(packet.bodyText).toContain('Difference flagged by MediCosts: $300.00');
    expect(packet.generatedFrom.ruleIds).toEqual(['EOB_PATIENT_RESP_MISMATCH']);
  });

  it('rejects EOB mismatch packet generation without the EOB mismatch finding', () => {
    expect(() => buildEobMismatchPacket(consumerCase, { ...analysis, findings: [] }))
      .toThrow(/EOB patient responsibility mismatch/);
  });
});
