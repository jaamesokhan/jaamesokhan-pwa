import { describe, expect, it } from 'vitest';
import { isDue, localDate } from './dailyPoemShared';

describe('isDue', () => {
  const at = (h: number, m: number) => new Date(2026, 8, 25, h, m);
  it('waits for the chosen time', () => {
    expect(isDue({ enabled: true, time: '12:25' }, at(12, 24))).toBe(false);
    expect(isDue({ enabled: true, time: '12:25' }, at(12, 25))).toBe(true);
  });
  it('shows once per day and only when enabled', () => {
    expect(isDue({ enabled: true, time: '08:00', lastShown: localDate(at(9, 0)) }, at(9, 0))).toBe(false);
    expect(isDue({ enabled: false, time: '08:00' }, at(9, 0))).toBe(false);
  });
});
