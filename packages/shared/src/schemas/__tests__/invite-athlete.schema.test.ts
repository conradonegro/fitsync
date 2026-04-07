import { inviteAthleteSchema } from '../invite-athlete.schema';

describe('inviteAthleteSchema', () => {
  it('accepts a valid email', () => {
    expect(inviteAthleteSchema.safeParse({ email: 'athlete@example.com' }).success).toBe(true);
  });

  it('accepts a short but valid email', () => {
    expect(inviteAthleteSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
  });

  it('accepts subdomain email', () => {
    expect(inviteAthleteSchema.safeParse({ email: 'user@mail.example.org' }).success).toBe(true);
  });

  describe('invalid inputs', () => {
    it('rejects email without @', () => {
      expect(inviteAthleteSchema.safeParse({ email: 'notanemail' }).success).toBe(false);
    });

    it('rejects empty string', () => {
      expect(inviteAthleteSchema.safeParse({ email: '' }).success).toBe(false);
    });

    it('rejects missing email field', () => {
      expect(inviteAthleteSchema.safeParse({}).success).toBe(false);
    });

    it('rejects null email', () => {
      expect(inviteAthleteSchema.safeParse({ email: null }).success).toBe(false);
    });

    it('rejects number as email', () => {
      expect(inviteAthleteSchema.safeParse({ email: 123 }).success).toBe(false);
    });

    it('rejects non-object input', () => {
      expect(inviteAthleteSchema.safeParse('athlete@example.com').success).toBe(false);
    });
  });
});
