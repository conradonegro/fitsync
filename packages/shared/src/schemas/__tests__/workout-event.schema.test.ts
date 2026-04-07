import { logSetInputSchema, setLoggedPayloadSchema } from '../workout-event.schema';

// ─── setLoggedPayloadSchema ───────────────────────────────────────────────────

describe('setLoggedPayloadSchema', () => {
  const VALID = {
    exercise_name: 'Squat',
    set_number: 1,
    reps: 5,
    weight_kg: 100,
  };

  it('accepts a valid payload', () => {
    expect(setLoggedPayloadSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts weight_kg of 0 (bodyweight exercise)', () => {
    expect(setLoggedPayloadSchema.safeParse({ ...VALID, weight_kg: 0 }).success).toBe(true);
  });

  it('accepts fractional weight_kg', () => {
    expect(setLoggedPayloadSchema.safeParse({ ...VALID, weight_kg: 2.5 }).success).toBe(true);
  });

  describe('exercise_name', () => {
    it('rejects empty string', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, exercise_name: '' }).success).toBe(false);
    });

    it('accepts exactly 1 character', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, exercise_name: 'A' }).success).toBe(true);
    });

    it('accepts exactly 255 characters', () => {
      expect(
        setLoggedPayloadSchema.safeParse({ ...VALID, exercise_name: 'A'.repeat(255) }).success,
      ).toBe(true);
    });

    it('rejects 256 characters', () => {
      expect(
        setLoggedPayloadSchema.safeParse({ ...VALID, exercise_name: 'A'.repeat(256) }).success,
      ).toBe(false);
    });
  });

  describe('set_number', () => {
    it('rejects 0 (must be positive)', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, set_number: 0 }).success).toBe(false);
    });

    it('rejects negative value', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, set_number: -1 }).success).toBe(false);
    });

    it('rejects float (must be integer)', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, set_number: 1.5 }).success).toBe(false);
    });

    it('accepts 1 (minimum positive integer)', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, set_number: 1 }).success).toBe(true);
    });
  });

  describe('reps', () => {
    it('rejects 0 (must be positive)', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, reps: 0 }).success).toBe(false);
    });

    it('rejects negative reps', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, reps: -5 }).success).toBe(false);
    });

    it('rejects float reps', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, reps: 2.5 }).success).toBe(false);
    });

    it('accepts 1 (minimum)', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, reps: 1 }).success).toBe(true);
    });
  });

  describe('weight_kg', () => {
    it('rejects negative weight', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, weight_kg: -0.1 }).success).toBe(false);
    });

    it('accepts very large weight', () => {
      expect(setLoggedPayloadSchema.safeParse({ ...VALID, weight_kg: 500 }).success).toBe(true);
    });
  });
});

// ─── logSetInputSchema ────────────────────────────────────────────────────────

describe('logSetInputSchema', () => {
  const VALID = {
    exercise_name: 'Bench Press',
    reps: 8,
    weight_kg: 60,
  };

  it('accepts valid log set input', () => {
    expect(logSetInputSchema.safeParse(VALID).success).toBe(true);
  });

  it('does NOT require set_number (server-computed)', () => {
    expect(logSetInputSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts weight_kg of 0 (bodyweight)', () => {
    expect(logSetInputSchema.safeParse({ ...VALID, weight_kg: 0 }).success).toBe(true);
  });

  it('rejects negative weight_kg', () => {
    expect(logSetInputSchema.safeParse({ ...VALID, weight_kg: -1 }).success).toBe(false);
  });

  it('rejects empty exercise_name', () => {
    expect(logSetInputSchema.safeParse({ ...VALID, exercise_name: '' }).success).toBe(false);
  });

  it('rejects exercise_name > 255 characters', () => {
    expect(logSetInputSchema.safeParse({ ...VALID, exercise_name: 'A'.repeat(256) }).success).toBe(
      false,
    );
  });

  it('rejects reps of 0', () => {
    expect(logSetInputSchema.safeParse({ ...VALID, reps: 0 }).success).toBe(false);
  });

  it('rejects non-integer reps', () => {
    expect(logSetInputSchema.safeParse({ ...VALID, reps: 1.5 }).success).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(logSetInputSchema.safeParse({}).success).toBe(false);
    expect(logSetInputSchema.safeParse({ exercise_name: 'Squat' }).success).toBe(false);
  });
});
