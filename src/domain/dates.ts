// Calendar-date helpers on ISO 'YYYY-MM-DD' strings, done in UTC "epoch days"
// so time zones and DST can never shift a date.

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toEpochDay(iso: string): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new RangeError(`Not an ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY;
}

export function fromEpochDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday (1970-01-01, epoch day 0, was a Thursday). */
export function weekdayOf(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

export function addDays(iso: string, n: number): string {
  return fromEpochDay(toEpochDay(iso) + n);
}

/** Calendar days from a to b (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return toEpochDay(b) - toEpochDay(a);
}

export function minDate(a: string, b: string) {
  return a <= b ? a : b;
}

export function maxDate(a: string, b: string) {
  return a >= b ? a : b;
}
