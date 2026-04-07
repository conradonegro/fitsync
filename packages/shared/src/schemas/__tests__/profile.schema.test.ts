import { profileSchema } from '../profile.schema';

const VALID = {
  id: '00000000-0000-4000-a000-000000000001',
  email: 'user@example.com',
  full_name: 'Test User',
  role: 'trainer' as const,
  stripe_customer_id: null,
  pending_deletion: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

describe('profileSchema', () => {
  it('accepts a valid profile', () => {
    expect(profileSchema.safeParse(VALID).success).toBe(true);
  });

  describe('id', () => {
    it('rejects non-UUID id', () => {
      expect(profileSchema.safeParse({ ...VALID, id: 'not-a-uuid' }).success).toBe(false);
    });

    it('rejects empty id', () => {
      expect(profileSchema.safeParse({ ...VALID, id: '' }).success).toBe(false);
    });
  });

  describe('email', () => {
    it('rejects invalid email', () => {
      expect(profileSchema.safeParse({ ...VALID, email: 'not-an-email' }).success).toBe(false);
    });
  });

  describe('full_name', () => {
    it('rejects empty full_name', () => {
      expect(profileSchema.safeParse({ ...VALID, full_name: '' }).success).toBe(false);
    });

    it('rejects full_name exceeding 255 characters', () => {
      expect(profileSchema.safeParse({ ...VALID, full_name: 'A'.repeat(256) }).success).toBe(false);
    });
  });

  describe('stripe_customer_id', () => {
    it('accepts null (no subscription)', () => {
      expect(profileSchema.safeParse({ ...VALID, stripe_customer_id: null }).success).toBe(true);
    });

    it('accepts a stripe customer string', () => {
      expect(profileSchema.safeParse({ ...VALID, stripe_customer_id: 'cus_abc123' }).success).toBe(
        true,
      );
    });

    it('rejects undefined (field must be present and explicitly null)', () => {
      const { stripe_customer_id: _, ...rest } = VALID;
      expect(profileSchema.safeParse(rest).success).toBe(false);
    });
  });

  describe('pending_deletion', () => {
    it('accepts false', () => {
      expect(profileSchema.safeParse({ ...VALID, pending_deletion: false }).success).toBe(true);
    });

    it('accepts true', () => {
      expect(profileSchema.safeParse({ ...VALID, pending_deletion: true }).success).toBe(true);
    });

    it('rejects string "false"', () => {
      expect(profileSchema.safeParse({ ...VALID, pending_deletion: 'false' }).success).toBe(false);
    });
  });

  describe('datetime fields', () => {
    it('rejects non-datetime created_at', () => {
      expect(profileSchema.safeParse({ ...VALID, created_at: 'not-a-date' }).success).toBe(false);
    });

    it('rejects non-datetime updated_at', () => {
      expect(profileSchema.safeParse({ ...VALID, updated_at: '2024-01-01' }).success).toBe(false);
    });

    it('accepts ISO 8601 datetime with Z suffix', () => {
      expect(
        profileSchema.safeParse({ ...VALID, created_at: '2024-06-15T12:30:00.000Z' }).success,
      ).toBe(true);
    });
  });
});
