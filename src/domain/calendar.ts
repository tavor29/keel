import { fromEpochDay, toEpochDay, weekdayOf } from './dates';
import { ValidationError } from './errors';
import type { Calendar } from './types';

/**
 * Working-time model (docs/scheduling.md §1).
 *
 * - A working day has two half-day slots (AM, PM). Slot 0 is the AM of the
 *   first working day on or after the program start (the "origin").
 * - Times are *boundaries* between slots: an item starting at boundary s with
 *   duration d occupies slots [s, s+d) and finishes at boundary s+d.
 * - Working-day *indexes* count working days from the origin (origin = 0) and
 *   may be negative for dates before it.
 */
export class WorkCalendar {
  readonly origin: number; // epoch day of slot 0
  private readonly workWeek: readonly boolean[];
  private readonly perWeek: number;
  private readonly holidays: number[]; // sorted epoch days that fall on working weekdays
  private readonly holidaySet: Set<number>;

  constructor(calendar: Pick<Calendar, 'workWeek' | 'holidays'>, programStart: string) {
    if (calendar.workWeek.length !== 7) throw new ValidationError('workWeek must have 7 entries (Mon…Sun)');
    this.workWeek = calendar.workWeek;
    this.perWeek = calendar.workWeek.filter(Boolean).length;
    if (this.perWeek === 0) throw new ValidationError('Calendar has no working days');
    const hs = new Set<number>();
    for (const h of calendar.holidays) {
      const d = toEpochDay(h);
      if (this.workWeek[weekdayOf(d)]) hs.add(d);
    }
    this.holidaySet = hs;
    this.holidays = [...hs].sort((a, b) => a - b);
    let o = toEpochDay(programStart);
    while (!this.isWorkingDay(o)) o++;
    this.origin = o;
  }

  isWorkingDay(day: number): boolean {
    return !!this.workWeek[weekdayOf(day)] && !this.holidaySet.has(day);
  }

  isWorkingDate(iso: string): boolean {
    return this.isWorkingDay(toEpochDay(iso));
  }

  /** Number of working days in the epoch-day range [a, b), a <= b. */
  private countWorking(a: number, b: number): number {
    const span = b - a;
    const weeks = Math.floor(span / 7);
    let n = weeks * this.perWeek;
    for (let d = a + weeks * 7; d < b; d++) if (this.workWeek[weekdayOf(d)]) n++;
    return n - (this.lowerBound(b) - this.lowerBound(a));
  }

  /** Index of the first holiday >= day. */
  private lowerBound(day: number): number {
    let lo = 0;
    let hi = this.holidays.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.holidays[mid] as number) < day) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Working-day index of the first working day on or after `day`. */
  indexOf(day: number): number {
    return day >= this.origin ? this.countWorking(this.origin, day) : -this.countWorking(day, this.origin);
  }

  /** Epoch day of the working day with index i. */
  dayAt(i: number): number {
    // g(d) = number of working days <= d (relative to origin) is monotonic; find the
    // smallest d with g(d) >= i + 1 — that's the (i)th working day.
    const g = (d: number) => this.indexOf(d + 1);
    let lo = this.origin + i;
    let hi = lo;
    let step = 8;
    while (g(lo) >= i + 1) {
      lo -= step;
      step *= 2;
    }
    step = 8;
    while (g(hi) < i + 1) {
      hi += step;
      step *= 2;
    }
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (g(mid) >= i + 1) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  /**
   * Date → boundary.
   * 'start': the boundary at the start of the first working day on/after the date.
   * 'finish': the boundary at the end of the last working day on/before the date.
   */
  toSlot(iso: string, mode: 'start' | 'finish'): number {
    const d = toEpochDay(iso);
    return mode === 'start' ? 2 * this.indexOf(d) : 2 * this.indexOf(d + 1);
  }

  /** The calendar date of a slot (the half-day starting at this boundary). */
  dateOfSlot(slot: number): string {
    return fromEpochDay(this.dayAt(Math.floor(slot / 2)));
  }

  /** Display date for a start boundary. */
  startDate(boundary: number): string {
    return this.dateOfSlot(boundary);
  }

  /** Display date for a finish boundary of something with duration > 0. */
  finishDate(boundary: number): string {
    return this.dateOfSlot(boundary - 1);
  }

  /** Display date for a zero-duration event at this boundary (end of the previous half-day). */
  milestoneDate(boundary: number): string {
    return boundary === 0 ? this.dateOfSlot(0) : this.dateOfSlot(boundary - 1);
  }

  /** Working days from a to b (positive when b is later). Non-working dates count from the next working day. */
  workingDaysBetween(a: string, b: string): number {
    return this.indexOf(toEpochDay(b)) - this.indexOf(toEpochDay(a));
  }

  /** The working date n working days after `iso` (or after the next working day if `iso` isn't one). */
  addWorkingDays(iso: string, n: number): string {
    return fromEpochDay(this.dayAt(this.indexOf(toEpochDay(iso)) + n));
  }
}
