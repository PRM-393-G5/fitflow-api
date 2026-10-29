import { statsRange } from './admin-stats.service.js';

describe('statsRange', () => {
  const now = new Date('2026-10-27T20:00:00Z');

  it('ends today in the given zone', () => {
    expect(statsRange(3, 'UTC', now)).toEqual({
      days: 3,
      tz: 'UTC',
      from: '2026-10-25',
      to: '2026-10-27',
      dates: ['2026-10-25', '2026-10-26', '2026-10-27'],
    });
    // 03:00 the next morning in Vietnam.
    expect(statsRange(1, 'Asia/Ho_Chi_Minh', now)).toMatchObject({
      from: '2026-10-28',
      to: '2026-10-28',
    });
    // Still the afternoon in Los Angeles.
    expect(statsRange(1, 'America/Los_Angeles', now).to).toBe('2026-10-27');
  });

  it('crosses month and year boundaries', () => {
    const range = statsRange(3, 'UTC', new Date('2027-01-01T12:00:00Z'));
    expect(range.dates).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('counts calendar days across a DST change', () => {
    // Europe/Berlin leaves summer time on 2026-10-25.
    const range = statsRange(
      4,
      'Europe/Berlin',
      new Date('2026-10-26T12:00:00Z'),
    );
    expect(range.dates).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ]);
  });
});
