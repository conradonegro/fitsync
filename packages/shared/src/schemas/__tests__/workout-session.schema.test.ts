import { startSessionSchema } from '../workout-session.schema';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_TS = '2024-01-15T10:30:00Z';

describe('startSessionSchema', () => {
  it('accepts valid session start', () => {
    expect(startSessionSchema.safeParse({ id: VALID_UUID, started_at: VALID_TS }).success).toBe(
      true,
    );
  });

  it('accepts started_at with positive timezone offset', () => {
    expect(
      startSessionSchema.safeParse({ id: VALID_UUID, started_at: '2024-01-15T10:30:00+05:30' })
        .success,
    ).toBe(true);
  });

  it('accepts started_at with negative timezone offset', () => {
    expect(
      startSessionSchema.safeParse({ id: VALID_UUID, started_at: '2024-01-15T10:30:00-08:00' })
        .success,
    ).toBe(true);
  });

  describe('id validation', () => {
    it('rejects non-UUID id', () => {
      expect(startSessionSchema.safeParse({ id: 'not-a-uuid', started_at: VALID_TS }).success).toBe(
        false,
      );
    });

    it('rejects empty id', () => {
      expect(startSessionSchema.safeParse({ id: '', started_at: VALID_TS }).success).toBe(false);
    });

    it('rejects numeric id', () => {
      expect(startSessionSchema.safeParse({ id: 12345, started_at: VALID_TS }).success).toBe(false);
    });

    it('rejects missing id', () => {
      expect(startSessionSchema.safeParse({ started_at: VALID_TS }).success).toBe(false);
    });
  });

  describe('started_at validation', () => {
    it('rejects datetime without timezone offset (offset: true requirement)', () => {
      // ISO 8601 without tz: '2024-01-15T10:30:00' has no offset → invalid
      expect(
        startSessionSchema.safeParse({ id: VALID_UUID, started_at: '2024-01-15T10:30:00' }).success,
      ).toBe(false);
    });

    it('rejects plain date string', () => {
      expect(
        startSessionSchema.safeParse({ id: VALID_UUID, started_at: '2024-01-15' }).success,
      ).toBe(false);
    });

    it('rejects non-date string', () => {
      expect(
        startSessionSchema.safeParse({ id: VALID_UUID, started_at: 'not-a-date' }).success,
      ).toBe(false);
    });

    it('rejects missing started_at', () => {
      expect(startSessionSchema.safeParse({ id: VALID_UUID }).success).toBe(false);
    });
  });
});
