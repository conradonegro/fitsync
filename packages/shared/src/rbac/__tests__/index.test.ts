import { isAthlete, isTrainer } from '../index';

describe('isTrainer', () => {
  it('returns true for "trainer"', () => {
    expect(isTrainer('trainer')).toBe(true);
  });

  it('returns false for "athlete"', () => {
    expect(isTrainer('athlete')).toBe(false);
  });
});

describe('isAthlete', () => {
  it('returns true for "athlete"', () => {
    expect(isAthlete('athlete')).toBe(true);
  });

  it('returns false for "trainer"', () => {
    expect(isAthlete('trainer')).toBe(false);
  });
});
