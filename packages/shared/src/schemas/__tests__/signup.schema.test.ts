import { signupSchema } from '../signup.schema';

const VALID = {
  full_name: 'Test User',
  email: 'test@example.com',
  password: 'Password1',
  role: 'trainer' as const,
};

describe('signupSchema', () => {
  it('accepts valid trainer signup', () => {
    expect(signupSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts valid athlete signup', () => {
    expect(signupSchema.safeParse({ ...VALID, role: 'athlete' }).success).toBe(true);
  });

  describe('full_name validation', () => {
    it('rejects empty full_name', () => {
      expect(signupSchema.safeParse({ ...VALID, full_name: '' }).success).toBe(false);
    });

    it('accepts full_name of exactly 1 character', () => {
      expect(signupSchema.safeParse({ ...VALID, full_name: 'A' }).success).toBe(true);
    });

    it('accepts full_name of exactly 255 characters', () => {
      expect(signupSchema.safeParse({ ...VALID, full_name: 'A'.repeat(255) }).success).toBe(true);
    });

    it('rejects full_name of 256 characters', () => {
      expect(signupSchema.safeParse({ ...VALID, full_name: 'A'.repeat(256) }).success).toBe(false);
    });

    it('rejects null full_name', () => {
      expect(signupSchema.safeParse({ ...VALID, full_name: null }).success).toBe(false);
    });

    it('rejects missing full_name field', () => {
      const { full_name: _, ...rest } = VALID;
      expect(signupSchema.safeParse(rest).success).toBe(false);
    });
  });

  describe('role validation', () => {
    it('rejects role "admin"', () => {
      expect(signupSchema.safeParse({ ...VALID, role: 'admin' }).success).toBe(false);
    });

    it('rejects role ""', () => {
      expect(signupSchema.safeParse({ ...VALID, role: '' }).success).toBe(false);
    });

    it('rejects missing role field', () => {
      const { role: _, ...rest } = VALID;
      expect(signupSchema.safeParse(rest).success).toBe(false);
    });
  });

  describe('inherits login validations', () => {
    it('rejects invalid email', () => {
      expect(signupSchema.safeParse({ ...VALID, email: 'not-an-email' }).success).toBe(false);
    });

    it('rejects short password', () => {
      expect(signupSchema.safeParse({ ...VALID, password: 'short' }).success).toBe(false);
    });
  });
});
