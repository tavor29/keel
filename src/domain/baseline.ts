import { isProcurement, isTask } from './plan';
import type { ScheduleResult } from './scheduling/schedule';
import type { Baseline, Item } from './types';

/** Snapshot every scheduled node (summaries included). See docs/scheduling.md §9. */
export function snapshotBaseline(
  items: readonly Item[],
  result: ScheduleResult,
  meta: Omit<Baseline, 'snapshot'>,
): Baseline {
  const budget = new Map<string, number | undefined>();
  for (const i of items) budget.set(i.id, isTask(i) ? i.budgetCents : isProcurement(i) ? i.poValueCents : undefined);
  const snapshot: Baseline['snapshot'] = {};
  for (const [id, n] of result.nodes) {
    const b = budget.get(id);
    snapshot[id] = { start: n.es, finish: n.ef, ...(b !== undefined ? { budgetCents: b } : {}) };
  }
  return { ...meta, snapshot };
}

export interface Variance {
  /** Working days; positive = later than baseline. Baselines store dates, so this is whole-day precision. */
  startDays: number;
  finishDays: number;
}

export function variance(result: ScheduleResult, baseline: Baseline, itemId: string): Variance | undefined {
  const node = result.nodes.get(itemId);
  const b = baseline.snapshot[itemId];
  if (!node || !b) return undefined;
  return {
    startDays: result.calendar.workingDaysBetween(b.start, node.es),
    finishDays: result.calendar.workingDaysBetween(b.finish, node.ef),
  };
}
