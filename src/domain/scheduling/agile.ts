import type { WorkCalendar } from '../calendar';
import type { Sprint, Task } from '../types';

export interface AgileProjection {
  velocity: number;
  remainingPoints: number;
  /** null when nothing can be projected (no velocity yet and work remains). */
  projectedFinish: string | null;
  basis: 'closed_sprints' | 'active_commitment' | 'none';
}

const open = (t: Task) => t.status !== 'done' && t.status !== 'cancelled';

/** docs/scheduling.md §8 */
export function projectWorkstream(sprints: readonly Sprint[], tasks: readonly Task[], cal: WorkCalendar, asOf: string): AgileProjection {
  const sorted = [...sprints].sort((a, b) => a.start.localeCompare(b.start));
  const closed = sorted.filter((s) => s.state === 'closed');
  const active = sorted.find((s) => s.state === 'active');
  const last3 = closed.slice(-3);

  let velocity = 0;
  let basis: AgileProjection['basis'] = 'none';
  if (last3.length) {
    velocity = last3.reduce((s, sp) => s + (sp.completedPoints ?? 0), 0) / last3.length;
    basis = 'closed_sprints';
  } else if (active) {
    velocity = active.committedPoints;
    basis = 'active_commitment';
  }

  const remainingPoints = tasks.filter(open).reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const activeRemaining = active
    ? (active.burndown.at(-1)?.remainingPoints ??
      tasks.filter((t) => t.sprintId === active.id && open(t)).reduce((s, t) => s + (t.storyPoints ?? 0), 0))
    : 0;

  const ref = active ?? closed.at(-1) ?? sorted[0];
  const sprintLen = ref ? Math.max(1, cal.workingDaysBetween(ref.start, ref.end) + 1) : 10;
  const base = active?.end ?? closed.at(-1)?.end ?? asOf;

  if (remainingPoints === 0) return { velocity, remainingPoints, projectedFinish: active?.end ?? closed.at(-1)?.end ?? asOf, basis };
  if (velocity <= 0) return { velocity, remainingPoints, projectedFinish: null, basis };

  const afterActive = Math.max(0, remainingPoints - activeRemaining);
  const sprintsNeeded = Math.ceil(afterActive / velocity);
  return { velocity, remainingPoints, projectedFinish: cal.addWorkingDays(base, sprintsNeeded * sprintLen), basis };
}
