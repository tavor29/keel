// Demo seed: Titan-1 (full plan, phase 2) and Lumen AI (structure only until phase 3).
// Everything here is fictional.
import { SCHEMA_VERSION, type MockState } from '@/api/mock/state';
import { addDays, toEpochDay, weekdayOf } from '@/domain/dates';
import type { Calendar, Membership, Program, Workstream } from '@/domain/types';
import { TITAN_AS_OF, titanCalendar, titanProgram } from './titan/plan';
import { titanSeed } from './titan/seed';

export const TITAN_ID = 'prg_titan';
export const LUMEN_ID = 'prg_lumen';
export const DEFAULT_PERSONA_ID = 'per_alex';
export const PERSONA_IDS = ['per_alex', 'per_priya', 'per_sam', 'per_jordan', 'per_chris'];

const lumenCalendar: Calendar = {
  id: 'cal_lumen',
  name: 'Lumen AI (Mon–Fri)',
  workWeek: [true, true, true, true, true, false, false],
  holidays: ['2026-11-26', '2026-12-25', '2027-01-01', '2027-05-31'],
};

const lumenWorkstreams: Workstream[] = (
  [
    ['platform', 'Model Platform', 'agile', '#6d5bd0'],
    ['webapp', 'Product & Web App', 'agile', '#1f5fbf'],
    ['data', 'Data & Evaluation', 'agile', '#0f7b6c'],
    ['infra', 'Infra & Security', 'scheduled', '#55657a'],
    ['gtm', 'Go-to-Market', 'scheduled', '#b4541a'],
  ] as const
).map(([key, name, mode, color], i) => ({ id: `wst_lumen_${key}`, programId: LUMEN_ID, name, mode, leadId: 'per_priya', color, budgetCents: 0, order: i }));

const lumenProgram: Program = {
  id: LUMEN_ID,
  name: 'Lumen AI',
  code: 'LUMEN',
  description: 'AI SaaS platform public launch: agile workstreams on a milestone backbone.',
  start: '2026-06-01',
  calendarId: lumenCalendar.id,
  currency: 'USD',
  checkinCadence: { weekday: 1, enabled: true },
  budgetCents: 0,
};

const lumenMemberships: Membership[] = [
  { programId: LUMEN_ID, personId: 'per_alex', role: 'pm', workstreamIds: [] },
  { programId: LUMEN_ID, personId: 'per_priya', role: 'lead', workstreamIds: ['wst_lumen_infra'] },
  { programId: LUMEN_ID, personId: 'per_sam', role: 'member', workstreamIds: ['wst_lumen_platform'] },
  { programId: LUMEN_ID, personId: 'per_jordan', role: 'exec', workstreamIds: [] },
];

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
  const raw: MockState = {
    schemaVersion: SCHEMA_VERSION,
    today: TITAN_AS_OF,
    personaIds: PERSONA_IDS,
    currentPersonId: DEFAULT_PERSONA_ID,
    rev: 0,
    seq: 0,
    people: t.people,
    programs: [titanProgram, lumenProgram],
    calendars: [titanCalendar, lumenCalendar],
    workstreams: [...t.workstreams, ...lumenWorkstreams],
    memberships: [...t.memberships, ...lumenMemberships],
    items: t.items,
    relations: t.relations,
    baselines: [t.baseline],
    sprints: [],
    costEntries: t.costEntries,
    channels: [],
    messages: t.messages,
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

