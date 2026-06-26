import { describe, expect, it, vi } from 'vitest';

vi.mock('../documentStorage.js', () => ({
  readEncryptedConsumerDocument: vi.fn(),
}));

import { extractCoverageFieldsFromText } from '../planCoverageExtractionService.js';

const document = {
  id: '22222222-2222-4222-8222-222222222222',
  document_type: 'insurance_card',
  original_filename: 'insurance-card.txt',
};

describe('plan coverage extraction service', () => {
  it('extracts coverage identity from text while hashing sensitive identifiers', () => {
    const extracted = extractCoverageFieldsFromText(`
      Insurance Company: Example Health Insurance Co.
      Plan Name: Example Choice PPO
      Network: Example Choice Network
      Plan Year: 2026
      HIOS Plan ID: 12345PA0010001
      Member ID: MEM-12345
      Group Number: GRP-987
      Employer Name: Example Employer
    `, document);

    expect(extracted.candidateProfile).toMatchObject({
      payerLegalName: 'Example Health Insurance Co.',
      planName: 'Example Choice PPO',
      networkName: 'Example Choice Network',
      planYear: 2026,
      hiosPlanId: '12345PA0010001',
      issuerHiosId: '12345',
      coverageType: 'marketplace',
      networkType: 'PPO',
    });
    expect(extracted.sensitiveHashes.memberIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(extracted.sensitiveHashes.groupNumberHash).toMatch(/^[a-f0-9]{64}$/);
    expect(extracted.sensitiveHashes.employerNameHash).toMatch(/^[a-f0-9]{64}$/);
    expect(extracted.confidence).toBeGreaterThan(0.7);
    expect(JSON.stringify(extracted)).not.toContain('MEM-12345');
    expect(JSON.stringify(extracted)).not.toContain('GRP-987');
    expect(JSON.stringify(extracted)).not.toContain('Example Employer');
  });

  it('extracts Medicare Advantage contract identity without requiring HIOS fields', () => {
    const extracted = extractCoverageFieldsFromText(`
      Payer: Example Medicare
      Health Plan: Example Senior Advantage HMO
      CMS Contract ID: H1234
      CMS Plan ID: 001
      PBM: ExampleRx
    `, document);

    expect(extracted.candidateProfile).toMatchObject({
      payerLegalName: 'Example Medicare',
      planName: 'Example Senior Advantage HMO',
      coverageType: 'medicare_advantage',
      networkType: 'HMO',
      cmsContractId: 'H1234',
      cmsPlanId: '001',
      pbmName: 'ExampleRx',
    });
  });
});
