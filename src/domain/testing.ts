// Small builders for domain tests. Not used by app code.
import type { PlanState } from './plan';
import type { Gate, Item, Milestone, Procurement, Relation, Sprint, Task, Workstream } from './types';

const base = {
  programId: 'prg_t',
  order: 0,
  status: 'not_started' as const,
  sharedWithGuestIds: [],
  followerIds: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

export function task(id: string, days: number, extra: Partial<Task> = {}): Task {
  return {
    ...base,
    id,
    workstreamId: 'ws_a',
    type: 'task',
    title: id,
    durationHalfDays: days * 2,
    percentComplete: 0,
    assignments: [],
    ...extra,
  };
}

export function milestone(id: string, extra: Partial<Milestone> = {}): Milestone {
  return { ...base, id, workstreamId: 'ws_a', type: 'milestone', title: id, durationHalfDays: 0, percentComplete: 0, assignments: [], ...extra };
}

export function gate(id: string, extra: Partial<Gate> = {}): Gate {
  return {
    ...base,
    id,
    workstreamId: 'ws_a',
    type: 'gate',
    title: id,
    durationHalfDays: 0,
    percentComplete: 0,
    assignments: [],
    entryCriteria: [],
    exitCriteria: [],
    approverIds: [],
    ...extra,
  };
}

export function procurement(id: string, extra: Partial<Procurement> = {}): Procurement {
  return {
    ...base,
    id,
    workstreamId: 'ws_a',
    type: 'procurement',
    title: id,
    supplier: 'Acme',
    supplierGuestIds: [],
    poValueCents: 0,
    leadTimeDays: 30,
    deliveryStatus: 'ordered',
    percentComplete: 0,
    ...extra,
  };
}

let relSeq = 0;
export function fs(from: string, to: string, lagDays = 0): Relation {
  return { id: `rel_${++relSeq}`, programId: 'prg_t', kind: 'FS', fromId: from, toId: to, lagHalfDays: lagDays * 2 };
}
export function ss(from: string, to: string, lagDays = 0): Relation {
  return { id: `rel_${++relSeq}`, programId: 'prg_t', kind: 'SS', fromId: from, toId: to, lagHalfDays: lagDays * 2 };
}

export function sprint(id: string, workstreamId: string, start: string, end: string, extra: Partial<Sprint> = {}): Sprint {
  return { id, workstreamId, name: id, start, end, state: 'closed', committedPoints: 20, burndown: [], ...extra };
}

export function workstream(id: string, mode: Workstream['mode'] = 'scheduled'): Workstream {
  return { id, programId: 'prg_t', name: id, mode, leadId: 'per_x', color: '#000', budgetCents: 0, order: 0 };
}

/** A Mon–Fri program starting Monday 2027-01-04 with no holidays. */
export function plan(items: Item[], relations: Relation[] = [], extra: Partial<PlanState> = {}): PlanState {
  return {
    program: {
      id: 'prg_t',
      name: 'Test',
      code: 'T',
      description: '',
      start: '2027-01-04',
      calendarId: 'cal',
      currency: 'USD',
      checkinCadence: { weekday: 1, enabled: true },
      budgetCents: 0,
    },
    calendar: { id: 'cal', name: 'Mon–Fri', workWeek: [true, true, true, true, true, false, false], holidays: [] },
    workstreams: [workstream('ws_a')],
    items,
    relations,
    sprints: [],
    costEntries: [],
    asOf: '2027-01-04',
    ...extra,
  };
}
