import { describe, expect, it, vi } from 'vitest';
import {
  assertActiveMedicalRecordRelease,
  getActiveMedicalRecordRelease,
  getCaseForUser,
  isMedicalRecordReleaseActive,
  normalizeReleaseInput,
} from '../caseService.js';

const caseId = '11111111-1111-4111-8111-111111111111';

function release(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: 7,
    case_id: caseId,
    signed_at: '2026-06-26T12:00:00.000Z',
    revoked_at: null,
    expiration_at: '2027-06-26T12:00:00.000Z',
    ...overrides,
  };
}

describe('medical record release gate', () => {
  it('treats a signed, unexpired, unrevoked release as active', () => {
    expect(isMedicalRecordReleaseActive(release(), new Date('2026-06-27T00:00:00Z'))).toBe(true);
  });

  it('blocks revoked and expired releases', () => {
    expect(isMedicalRecordReleaseActive(release({ revoked_at: '2026-06-27T00:00:00Z' }))).toBe(false);
    expect(isMedicalRecordReleaseActive(
      release({ expiration_at: '2026-06-25T00:00:00Z' }),
      new Date('2026-06-26T00:00:00Z'),
    )).toBe(false);
  });

  it('requires personal representatives to describe their authority', () => {
    expect(() => normalizeReleaseInput({
      signerName: 'Jane Advocate',
      signerType: 'personal_representative',
    })).toThrow(/Representative authority/);
  });

  it('throws the upload gate error when no active release exists', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(assertActiveMedicalRecordRelease(query, 7, caseId))
      .rejects.toMatchObject({ code: 'medical_record_release_required', status: 403 });
  });

  it('returns the active release found by the database query', async () => {
    const active = release();
    const query = vi.fn().mockResolvedValue({ rows: [active] });

    await expect(getActiveMedicalRecordRelease(query, 7, caseId)).resolves.toEqual(active);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('con_medical_record_releases'),
      [7, caseId],
    );
    expect(query.mock.calls[0][0]).toContain("release_type = 'user_upload'");
  });

  it('looks up cases by both case id and user id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: caseId, user_id: 7 }] });

    await expect(getCaseForUser(query, 7, caseId)).resolves.toMatchObject({ id: caseId, user_id: 7 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2'),
      [caseId, 7],
    );
  });
});
