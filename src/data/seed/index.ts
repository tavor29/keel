// Demo seed: Titan-1 (full plan, phase 2) and Lumen AI (structure only until phase 3).
// Everything here is fictional.
import { SCHEMA_VERSION, type MockState } from '@/api/mock/state';
import { addDays, toEpochDay, weekdayOf } from '@/domain/dates';
import { TITAN_AS_OF, titanCalendar, titanProgram } from './titan/plan';
import { titanSeed } from './titan/seed';
import { lumenCalendar, lumenProgram, lumenSeed, lumenWorkstreams } from './lumen/seed';

export const TITAN_ID = 'prg_titan';
export { LUMEN_ID } from './lumen/seed';
export const DEFAULT_PERSONA_ID = 'per_alex';
export const PERSONA_IDS = ['per_alex', 'per_priya', 'per_sam', 'per_jordan', 'per_chris'];

/** Whole weeks from the seed's "today" to the Monday of `now`'s week. */
export function weeksToShift(now: Date, seedToday = TITAN_AS_OF): number {
  const today = Math.floor(now.getTime() / 86_400_000);
  const monday = today - weekdayOf(today);
  return Math.round((monday - toEpochDay(seedToday)) / 7);
}

const ISO_ANYWHERE = /(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)/g;

/**
 * Shifts every ISO date in a JSON-like value by `days`, including dates embedded in
 * text ("ship date 2027-03-03") and timestamps. The UI renders ISO dates in prose
 * as friendly dates, so seed text stays correct after the shift.
 */
export function shiftDates<T>(value: T, days: number): T {
  if (!days) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(ISO_ANYWHERE, (d) => addDays(d, days));
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

export function createSeedState(now: Date = new Date()): MockState {
  const t = titanSeed();
  const l = lumenSeed();
  const raw: MockState = {
    schemaVersion: SCHEMA_VERSION,
    today: TITAN_AS_OF,
    personaIds: PERSONA_IDS,
    currentPersonId: DEFAULT_PERSONA_ID,
    rev: 0,
    promotionHints: {},
    seq: 0,
    people: [...t.people, ...l.people],
    programs: [titanProgram, lumenProgram],
    calendars: [titanCalendar, lumenCalendar],
    workstreams: [...t.workstreams, ...lumenWorkstreams],
    memberships: [...t.memberships, ...l.memberships],
    items: [...t.items, ...l.items],
    relations: [...t.relations, ...l.relations],
    baselines: [t.baseline],
    sprints: [...t.sprints, ...l.sprints],
    costEntries: t.costEntries,
    channels: l.channels,
    messages: [...t.messages, ...l.messages],
    mail: t.mail,
    mailRules: [],
    checkinRounds: t.checkinRounds,
    proposals: t.proposals,
    reports: [],
    digest: t.digest,
    notifications: [],
    audit: [],
  };
  raw.programs[0] = { ...raw.programs[0]!, activeBaselineId: t.baseline.id };
  // Evergreen demo: move the whole world so "today" is this week (weekdays preserved).
  return shiftDates(structuredClone(raw), weeksToShift(now) * 7);
}

