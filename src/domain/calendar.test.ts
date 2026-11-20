import { describe, expect, it } from 'vitest';
import { WorkCalendar } from './calendar';
import { addDays, diffDays, fromEpochDay, toEpochDay, weekdayOf } from './dates';

const MON_FRI = [true, true, true, true, true, false, false];
const MON_SAT = [true, true, true, true, true, true, false];

describe('dates', () => {
  it('round-trips epoch days and knows weekdays', () => {
    expect(fromEpochDay(toEpochDay('2026-11-20'))).toBe('2026-11-20');
    expect(weekdayOf(toEpochDay('2026-11-16'))).toBe(0); // Monday
    expect(weekdayOf(toEpochDay('2026-11-22'))).toBe(6); // Sunday
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(diffDays('2027-02-27', '2027-03-01')).toBe(2);
    expect(() => toEpochDay('2026-1-1')).toThrow(RangeError);
  });
});

describe('WorkCalendar', () => {
  const cal = new WorkCalendar({ workWeek: MON_FRI, holidays: ['2026-12-25', '2027-01-01'] }, '2026-12-21');

  it('starts slot 0 on the first working day on/after the program start', () => {
    const sat = new WorkCalendar({ workWeek: MON_FRI, holidays: [] }, '2026-11-21');
    expect(sat.dateOfSlot(0)).toBe('2026-11-23');
  });

  it('maps dates to start and finish boundaries, skipping weekends and holidays', () => {
    expect(cal.toSlot('2026-12-21', 'start')).toBe(0);
    expect(cal.toSlot('2026-12-21', 'finish')).toBe(2);
    // Thu 24 → Mon 28 (Fri 25 is a holiday, then the weekend)
    expect(cal.toSlot('2026-12-24', 'finish')).toBe(8);
    expect(cal.toSlot('2026-12-25', 'start')).toBe(8);
    expect(cal.dateOfSlot(8)).toBe('2026-12-28');
    // Finish on a non-working day = end of the previous working day
    expect(cal.toSlot('2026-12-27', 'finish')).toBe(8);
  });

  it('renders start, finish and milestone dates with half-days', () => {
    expect(cal.startDate(1)).toBe('2026-12-21'); // PM of day 0
    expect(cal.finishDate(3)).toBe('2026-12-22'); // ends at noon of day 1
    expect(cal.finishDate(2)).toBe('2026-12-21');
    expect(cal.milestoneDate(2)).toBe('2026-12-21'); // end of day 0
    expect(cal.milestoneDate(0)).toBe('2026-12-21');
  });

  it('counts and adds working days across a year boundary with holidays', () => {
    // 2026-12-21 … 2027-01-04: 10 weekdays minus Dec 25 and Jan 1 = 8
    expect(cal.workingDaysBetween('2026-12-21', '2027-01-04')).toBe(8);
    expect(cal.addWorkingDays('2026-12-24', 1)).toBe('2026-12-28');
    expect(cal.addWorkingDays('2026-12-31', 1)).toBe('2027-01-04');
    expect(cal.addWorkingDays('2026-12-26', 0)).toBe('2026-12-28'); // non-working → next working day
  });

  it('supports negative indexes (dates before the program start)', () => {
    expect(cal.toSlot('2026-12-18', 'start')).toBe(-2);
    expect(cal.dateOfSlot(-2)).toBe('2026-12-18');
    expect(cal.dateOfSlot(-10)).toBe('2026-12-14');
  });

  it('round-trips slot ↔ date for every day over two years (6-day week)', () => {
    const six = new WorkCalendar({ workWeek: MON_SAT, holidays: ['2026-12-25', '2027-01-01', '2027-05-31'] }, '2026-03-02');
    let prev = -Infinity;
    for (let day = toEpochDay('2026-03-02'); day < toEpochDay('2028-03-01'); day++) {
      const iso = fromEpochDay(day);
      if (!six.isWorkingDate(iso)) {
        expect(weekdayOf(day) === 6 || ['2026-12-25', '2027-01-01', '2027-05-31'].includes(iso)).toBe(true);
        continue;
      }
      const s = six.toSlot(iso, 'start');
      expect(s).toBeGreaterThan(prev);
      prev = s;
      expect(six.dateOfSlot(s)).toBe(iso);
      expect(six.dateOfSlot(s + 1)).toBe(iso);
      expect(six.toSlot(iso, 'finish')).toBe(s + 2);
    }
  });

  it('rejects a calendar with no working days', () => {
    expect(() => new WorkCalendar({ workWeek: Array(7).fill(false), holidays: [] }, '2026-01-01')).toThrow();
  });
});
