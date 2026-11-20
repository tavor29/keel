// Phase 0 seed: people, programs, calendars, workstreams, memberships.
// Plans, items, messages and scenarios arrive in phases 1–3 (see docs/demo-scenarios.md).
// Everything here is fictional.
import { SCHEMA_VERSION, type MockState } from '@/api/mock/state';
import type { Calendar, Membership, Person, Program, Workstream } from '@/domain/types';

export const TITAN_ID = 'prg_titan';
export const LUMEN_ID = 'prg_lumen';
export const DEFAULT_PERSONA_ID = 'per_alex';

const people: Person[] = [
  { id: 'per_alex', name: 'Alex Rivera', email: 'alex.rivera@keel.example', title: 'Program Manager', org: 'Keel Corp', avatarColor: '#1f5fbf', home: 'keel' },
  { id: 'per_priya', name: 'Priya Nair', email: 'priya.nair@keel.example', title: 'Power Lead', org: 'Keel Corp', avatarColor: '#0f7b6c', home: 'teams' },
  { id: 'per_sam', name: 'Sam Okafor', email: 'sam.okafor@keel.example', title: 'Engineer', org: 'Keel Corp', avatarColor: '#8a4baf', home: 'slack' },
  { id: 'per_jordan', name: 'Jordan Lee', email: 'jordan.lee@keel.example', title: 'VP Infrastructure', org: 'Keel Corp', avatarColor: '#b4541a', home: 'email' },
  { id: 'per_chris', name: 'Chris Wu', email: 'chris.wu@voltgrid.example', title: 'Account Manager', org: 'VoltGrid Switchgear', avatarColor: '#5b6575', home: 'email' },
];

const calendars: Calendar[] = [
  { id: 'cal_titan', name: 'Titan-1 site (Mon–Sat)', workWeek: [true, true, true, true, true, true, false], holidays: ['2026-12-25', '2027-01-01', '2027-05-31', '2027-07-05'] },
  { id: 'cal_lumen', name: 'Lumen AI (Mon–Fri)', workWeek: [true, true, true, true, true, false, false], holidays: ['2026-12-25', '2027-01-01'] },
];

const M = 100_000_000; // $1M in cents

const titanWorkstreams: [string, string, Workstream['mode'], number, string][] = [
  ['site', 'Site & Civil', 'scheduled', 12, '#7a6a55'],
  ['power', 'Power', 'scheduled', 35, '#c98a00'],
  ['cooling', 'Cooling', 'scheduled', 25, '#2b8fbf'],
  ['network', 'Network', 'scheduled', 15, '#6d5bd0'],
  ['compute', 'Compute Procurement', 'scheduled', 150, '#1f5fbf'],
  ['rack', 'Rack & Stack', 'scheduled', 4, '#3c8c5a'],
  ['software', 'Software Stack', 'agile', 3, '#b0457b'],
  ['commissioning', 'Commissioning', 'scheduled', 3, '#a3532c'],
  ['security', 'Security & Compliance', 'scheduled', 1.5, '#55657a'],
  ['ops', 'Ops Readiness', 'scheduled', 1.5, '#4c7f8f'],
];

const lumenWorkstreams: [string, string, Workstream['mode'], number, string][] = [
  ['platform', 'Model Platform', 'agile', 0, '#6d5bd0'],
  ['webapp', 'Product & Web App', 'agile', 0, '#1f5fbf'],
  ['data', 'Data & Evaluation', 'agile', 0, '#0f7b6c'],
  ['infra', 'Infra & Security', 'scheduled', 0, '#55657a'],
  ['gtm', 'Go-to-Market', 'scheduled', 0, '#b4541a'],
];

function toWorkstreams(programId: string, prefix: string, rows: typeof titanWorkstreams, leadId: string): Workstream[] {
  return rows.map(([key, name, mode, budgetM, color], i) => ({
    id: `wst_${prefix}_${key}`,
    programId,
    name,
    mode,
    leadId,
    color,
    budgetCents: Math.round(budgetM * M),
    order: i,
  }));
}

const workstreams: Workstream[] = [
  ...toWorkstreams(TITAN_ID, 'titan', titanWorkstreams, 'per_priya'),
  ...toWorkstreams(LUMEN_ID, 'lumen', lumenWorkstreams, 'per_priya'),
];

const programs: Program[] = [
  {
    id: TITAN_ID,
    name: 'Titan-1',
    code: 'TITAN',
    description: 'HPC data center build — 10 workstreams, ~$250M, stage-gated.',
    start: '2026-03-02',
    calendarId: 'cal_titan',
    currency: 'USD',
    checkinCadence: { weekday: 1, enabled: true },
    budgetCents: workstreams.filter((w) => w.programId === TITAN_ID).reduce((s, w) => s + w.budgetCents, 0),
  },
  {
    id: LUMEN_ID,
    name: 'Lumen AI',
    code: 'LUMEN',
    description: 'AI SaaS platform public launch — agile workstreams on a milestone backbone.',
    start: '2026-06-01',
    calendarId: 'cal_lumen',
    currency: 'USD',
    checkinCadence: { weekday: 1, enabled: true },
    budgetCents: 0,
  },
];

const memberships: Membership[] = [
  { programId: TITAN_ID, personId: 'per_alex', role: 'pm', workstreamIds: [] },
  { programId: TITAN_ID, personId: 'per_priya', role: 'lead', workstreamIds: ['wst_titan_power'] },
  { programId: TITAN_ID, personId: 'per_sam', role: 'member', workstreamIds: ['wst_titan_rack'] },
  { programId: TITAN_ID, personId: 'per_jordan', role: 'exec', workstreamIds: [] },
  { programId: TITAN_ID, personId: 'per_chris', role: 'guest', workstreamIds: [] },
  { programId: LUMEN_ID, personId: 'per_alex', role: 'pm', workstreamIds: [] },
  { programId: LUMEN_ID, personId: 'per_priya', role: 'lead', workstreamIds: ['wst_lumen_infra'] },
  { programId: LUMEN_ID, personId: 'per_sam', role: 'member', workstreamIds: ['wst_lumen_platform'] },
  { programId: LUMEN_ID, personId: 'per_jordan', role: 'exec', workstreamIds: [] },
];

export function createSeedState(): MockState {
  // Fresh copies every time so reset() never shares references with live state.
  return structuredClone({
    schemaVersion: SCHEMA_VERSION,
    currentPersonId: DEFAULT_PERSONA_ID,
    people,
    programs,
    calendars,
    workstreams,
    memberships,
    items: [],
    relations: [],
    channels: [],
    messages: [],
    notifications: [],
    audit: [],
  });
}
