import { describe, expect, it, vi } from 'vitest';
import {
  normalizeManualClaimInput,
  saveManualClaim,
} from '../leverageCaseService.js';

const caseId = '11111111-1111-4111-8111-111111111111';

describe('consumer leverage case service', () => {
  it('normalizes manual claim input into cents-first line items', () => {
    const claim = normalizeManualClaimInput({
      serviceDate: '2024-02-03',
      insuranceStatus: 'insured',
      state: 'pa',
      eobPatientRespCents: 20000,
      lineItems: [
        {
          cptHcpcs: ' 99285 ',
          units: '3',
          billedCents: '300000',
          patientRespCents: '25000',
          serviceDate: '2024-02-03',
        },
        { cptHcpcs: '', billedCents: '' },
      ],
    });

    expect(claim.serviceYear).toBe(2024);
    expect(claim.state).toBe('PA');
    expect(claim.eobPatientRespCents).toBe(20000);
    expect(claim.lineItems).toHaveLength(1);
    expect(claim.lineItems[0]).toMatchObject({
      lineId: 'line-1',
      cptHcpcs: '99285',
      units: 3,
      billedCents: 300000,
      patientRespCents: 25000,
    });
  });

  it('rejects saving a manual claim with no usable line items', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{ id: caseId, user_id: 7, state: 'PA', facility_ccn: null }],
    });

    await expect(saveManualClaim(query, 7, caseId, { lineItems: [] }))
      .rejects.toMatchObject({ code: 'line_item_required', status: 422 });
  });
});
