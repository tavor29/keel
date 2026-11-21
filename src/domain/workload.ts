// Workload per person per week (docs/scheduling.md §11): Σ allocation × share of the
// week's working slots the task occupies. Over 100% = overallocated. No auto-leveling.
import { addDays, toEpochDay, weekdayOf, fromEpochDay } from './dates';
import type { PlanState } from './plan';
import type { ScheduleResult } from './scheduling/schedule';

export interface Workload {
  weeks: string[]; // Mondays
  people: { personId: string; load: number[]; peak: number }[];
}

export function computeWorkload(plan: PlanState, result: ScheduleResult, weeks = 12): Workload {
  const cal = result.calendar;
  const today = toEpochDay(plan.asOf);
  const monday = fromEpochDay(today - weekdayOf(today));
  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(monday, i * 7));
  const bounds = weekStarts.map((w) => [cal.toSlot(w, 'start'), cal.toSlot(addDays(w, 6), 'finish')] as const);
  const load = new Map<string, number[]>();

  for (const item of plan.items) {
    if (item.type !== 'task' || !item.assignments.length || item.status === 'done' || item.status === 'cancelled') continue;
    const n = result.nodes.get(item.id);
    if (!n || n.kind !== 'leaf') continue;
    const { es, ef } = n.slots;
    bounds.forEach(([ws, we], i) => {
      const span = we - ws;
      const overlap = Math.min(ef, we) - Math.max(es, ws);
      if (span <= 0 || overlap <= 0) return;
      for (const a of item.assignments) {
        const row = load.get(a.personId) ?? Array(weeks).fill(0);
        row[i] += (a.allocationPct * overlap) / span;
        load.set(a.personId, row);
      }
    });
  }
  return {
    weeks: weekStarts,
    people: [...load.entries()]
      .map(([personId, l]) => ({ personId, load: l.map((x) => Math.round(x)), peak: Math.round(Math.max(...l)) }))
      .sort((a, b) => b.peak - a.peak),
  };
}
