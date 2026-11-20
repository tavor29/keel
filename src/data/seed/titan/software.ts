// Titan-1 Software Stack runs in sprints inside a waterfall program (the hybrid case).
import { addDays } from '@/domain/dates';
import type { Item, Sprint } from '@/domain/types';
import { TITAN_WS } from './people';

const COMPLETED = [18, 20, 22, 21, 23, 22]; // sprints 1–6
const ACTIVE_START = '2026-11-09';

/** Adds sprints and sets story statuses so the software delivery projects ahead of L5 IST. */
export function titanSoftwareSprints(items: Item[]): Sprint[] {
  const stories = items.filter((i): i is Extract<Item, { type: 'task' }> => i.type === 'task' && i.workstreamId === TITAN_WS.software && i.storyPoints !== undefined);
  const sprints: Sprint[] = COMPLETED.map((done, i) => {
    const start = addDays(ACTIVE_START, -14 * (COMPLETED.length - i));
    return { id: `spr_tss_${i + 1}`, workstreamId: TITAN_WS.software, name: `Sprint ${i + 1}`, start, end: addDays(start, 12), state: 'closed', committedPoints: done + 3, completedPoints: done, burndown: [] };
  });

  // Earliest stories were delivered in closed sprints, in order.
  let budget = COMPLETED.reduce((a, b) => a + b, 0);
  let sprintIdx = 0;
  let inSprint = 0;
  let k = 0;
  for (; k < stories.length && budget > 0; k++) {
    const s = stories[k]!;
    s.status = 'done';
    s.percentComplete = 100;
    s.sprintId = sprints[Math.min(sprintIdx, sprints.length - 1)]!.id;
    budget -= s.storyPoints!;
    inSprint += s.storyPoints!;
    if (inSprint >= COMPLETED[sprintIdx]!) {
      sprintIdx++;
      inSprint = 0;
    }
  }

  // Active sprint 7: the next ~22 points, a third done.
  const active: Sprint = { id: 'spr_tss_7', workstreamId: TITAN_WS.software, name: 'Sprint 7', start: ACTIVE_START, end: addDays(ACTIVE_START, 12), state: 'active', committedPoints: 0, burndown: [] };
  let committed = 0;
  const inActive: typeof stories = [];
  for (; k < stories.length && committed < 22; k++) {
    const s = stories[k]!;
    s.sprintId = active.id;
    committed += s.storyPoints!;
    inActive.push(s);
  }
  inActive.forEach((s, i) => {
    s.status = i < inActive.length / 3 ? 'done' : i < inActive.length / 2 ? 'in_progress' : 'not_started';
    s.percentComplete = s.status === 'done' ? 100 : s.status === 'in_progress' ? 50 : 0;
  });
  active.committedPoints = committed;
  const remaining = inActive.filter((s) => s.status !== 'done').reduce((a, s) => a + s.storyPoints!, 0);
  const days = 7; // Mon..Sat of week one, plus today
  active.burndown = Array.from({ length: days }, (_, d) => ({
    date: addDays(ACTIVE_START, d),
    remainingPoints: Math.round(committed - ((committed - remaining) * d) / (days - 1)),
  }));
  return [...sprints, active];
}
