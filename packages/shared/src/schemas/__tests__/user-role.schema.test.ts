import { userRoleSchema } from '../user-role.schema';

describe('userRoleSchema', () => {
  describe('valid values', () => {
    it('accepts "trainer"', () => {
      expect(userRoleSchema.safeParse('trainer').success).toBe(true);
    });

    it('accepts "athlete"', () => {
      expect(userRoleSchema.safeParse('athlete').success).toBe(true);
    });
  });

  describe('invalid values', () => {
    it('rejects unknown role "admin"', () => {
      expect(userRoleSchema.safeParse('admin').success).toBe(false);
    });

    it('rejects empty string', () => {
      expect(userRoleSchema.safeParse('').success).toBe(false);
    });

    it('rejects null', () => {
      expect(userRoleSchema.safeParse(null).success).toBe(false);
    });

    it('rejects undefined', () => {
      expect(userRoleSchema.safeParse(undefined).success).toBe(false);
    });

    it('rejects number', () => {
      expect(userRoleSchema.safeParse(1).success).toBe(false);
    });

    it('rejects "TRAINER" (case-sensitive)', () => {
      expect(userRoleSchema.safeParse('TRAINER').success).toBe(false);
    });

    it('rejects "Athlete" (case-sensitive)', () => {
      expect(userRoleSchema.safeParse('Athlete').success).toBe(false);
    });
  });
});
