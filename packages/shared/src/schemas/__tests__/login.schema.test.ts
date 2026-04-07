import { loginSchema } from '../login.schema';

const VALID = { email: 'test@example.com', password: 'Password1' };

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    expect(loginSchema.safeParse(VALID).success).toBe(true);
  });

  describe('email validation', () => {
    it('rejects missing @ symbol', () => {
      expect(loginSchema.safeParse({ ...VALID, email: 'notanemail' }).success).toBe(false);
    });

    it('rejects empty string', () => {
      expect(loginSchema.safeParse({ ...VALID, email: '' }).success).toBe(false);
    });

    it('rejects email with no local part', () => {
      expect(loginSchema.safeParse({ ...VALID, email: '@example.com' }).success).toBe(false);
    });

    it('rejects email with no domain', () => {
      expect(loginSchema.safeParse({ ...VALID, email: 'user@' }).success).toBe(false);
    });

    it('rejects null', () => {
      expect(loginSchema.safeParse({ ...VALID, email: null }).success).toBe(false);
    });

    it('rejects missing email field', () => {
      const { email: _, ...rest } = VALID;
      expect(loginSchema.safeParse(rest).success).toBe(false);
    });
  });

  describe('password validation', () => {
    it('rejects password shorter than 8 characters', () => {
      expect(loginSchema.safeParse({ ...VALID, password: '1234567' }).success).toBe(false);
    });

    it('accepts password of exactly 8 characters', () => {
      expect(loginSchema.safeParse({ ...VALID, password: '12345678' }).success).toBe(true);
    });

    it('accepts password longer than 8 characters', () => {
      expect(loginSchema.safeParse({ ...VALID, password: 'a'.repeat(100) }).success).toBe(true);
    });

    it('rejects empty password', () => {
      expect(loginSchema.safeParse({ ...VALID, password: '' }).success).toBe(false);
    });

    it('rejects missing password field', () => {
      const { password: _, ...rest } = VALID;
      expect(loginSchema.safeParse(rest).success).toBe(false);
    });
  });

  it('rejects non-object input', () => {
    expect(loginSchema.safeParse('string').success).toBe(false);
    expect(loginSchema.safeParse(null).success).toBe(false);
    expect(loginSchema.safeParse(42).success).toBe(false);
  });
});
