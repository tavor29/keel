import { WorkCalendar } from '../calendar';
import { addDays } from '../dates';
import { ValidationError } from '../errors';
import { deliveryNodeId, isProcurement, isSchedulable, isTask, parentIds, type PlanState } from '../plan';
import type { Item, Procurement, ScheduledItem } from '../types';
import { projectWorkstream, type AgileProjection } from './agile';
import { runCpm, type CpmEdge, type CpmNode, type CpmWarning } from './cpm';

export interface ScheduledNode extends ScheduledItem {
  /** Boundaries (half-day slots), for math. Dates above are for display. */
  slots: { es: number; ef: number; ls: number; lf: number };
  kind: 'leaf' | 'summary' | 'procurement' | 'agile_delivery';
  /** Slack against the nearest downstream deadline, half-days; null if none. Drives RAG. */
  deadlineFloatHalfDays: number | null;
}

export interface ProcurementDates {
  delivery: string;
  needBy: string;
  orderBy: string;
  /** Total float in working days (against the program finish). Drives need-by. */
  floatDays: number;
  /** Float against the nearest downstream deadline, working days; null if none. Drives RAG. */
  deadlineFloatDays: number | null;
}

export interface ScheduleResult {
  calendar: WorkCalendar;
  /** Leaves, summaries, procurement items and agile delivery nodes, keyed by id. */
  nodes: Map<string, ScheduledNode>;
  procurement: Map<string, ProcurementDates>;
  agile: Map<string, AgileProjection>;
  criticalEdges: CpmEdge[];
  warnings: CpmWarning[];
  projectFinish: string;
}

export function deliveryDate(p: Procurement, asOf: string): string {
  return p.delivered ?? p.expectedDelivery ?? addDays(p.orderedOn ?? asOf, p.leadTimeDays);
}

/**
 * Schedules a program (docs/scheduling.md §2–6). Deterministic; recompute from
 * scratch on every change.
 */
export function schedule(plan: PlanState): ScheduleResult {
  const cal = new WorkCalendar(plan.calendar, plan.program.start);
  const parents = parentIds(plan.items);
  const agileWs = new Set(plan.workstreams.filter((w) => w.mode === 'agile').map((w) => w.id));
  const itemById = new Map(plan.items.map((i) => [i.id, i]));

  const nodes: CpmNode[] = [];
  const kinds = new Map<string, ScheduledNode['kind']>();

  for (const item of plan.items) {
    if (parents.has(item.id)) continue;
    if (isSchedulable(item)) {
      // Sprint-run work is projected, not CPM-scheduled (milestones in agile workstreams still are).
      if (item.type === 'task' && agileWs.has(item.workstreamId)) continue;
      nodes.push({
        id: item.id,
        duration: item.type === 'task' ? item.durationHalfDays : 0,
        fixedStart: item.pinned ? cal.toSlot(item.pinned.start, 'start') : undefined,
        earliest: item.snet ? cal.toSlot(item.snet, 'start') : undefined,
        deadline: item.deadline ? cal.toSlot(item.deadline, 'finish') : undefined,
      });
      kinds.set(item.id, 'leaf');
    } else if (isProcurement(item)) {
      nodes.push({ id: item.id, duration: 0, fixedStart: cal.toSlot(deliveryDate(item, plan.asOf), 'start') });
      kinds.set(item.id, 'procurement');
    }
  }

  const agile = new Map<string, AgileProjection>();
  for (const wsId of agileWs) {
    const tasks = plan.items.filter((i) => i.workstreamId === wsId && isTask(i) && !parents.has(i.id)).filter(isTask);
    const sprints = plan.sprints.filter((s) => s.workstreamId === wsId);
    const proj = projectWorkstream(sprints, tasks, cal, plan.asOf);
    agile.set(wsId, proj);
    if (proj.projectedFinish) {
      const id = deliveryNodeId(wsId);
      nodes.push({ id, duration: 0, fixedStart: cal.toSlot(proj.projectedFinish, 'finish') });
      kinds.set(id, 'agile_delivery');
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const resolve = (id: string, side: 'from' | 'to'): string | null => {
    if (agileWs.has(id)) {
      if (side === 'to') throw new ValidationError(`An agile workstream can only be a predecessor (${id})`);
      return nodeIds.has(deliveryNodeId(id)) ? deliveryNodeId(id) : null; // no projection yet → no constraint
    }
    if (parents.has(id)) throw new ValidationError(`Dependencies on summary items are not supported (${itemById.get(id)?.title ?? id})`);
    if (nodeIds.has(id)) return id;
    const item = itemById.get(id);
    if (item && isTask(item) && agileWs.has(item.workstreamId)) return null; // sprint task: not scheduled
    throw new ValidationError(`Relation references an item that can't be scheduled: ${id}`);
  };

  const edges: CpmEdge[] = [];
  for (const r of plan.relations) {
    if (r.kind !== 'FS' && r.kind !== 'SS') continue;
    const from = resolve(r.fromId, 'from');
    const to = resolve(r.toId, 'to');
    if (from && to) edges.push({ from, to, kind: r.kind, lag: r.lagHalfDays ?? 0 });
  }

  const cpm = runCpm(nodes, edges);
  const out = new Map<string, ScheduledNode>();

  for (const n of nodes) {
    const t = cpm.times.get(n.id)!;
    // Procurement deliveries are "available at the start of that day"; other zero-duration
    // events are "at the end of the previous half-day" (docs/scheduling.md §1, §5).
    const zero = n.duration === 0 && kinds.get(n.id) !== 'procurement';
    out.set(n.id, {
      itemId: n.id,
      es: zero ? cal.milestoneDate(t.es) : cal.startDate(t.es),
      ef: zero ? cal.milestoneDate(t.ef) : cal.finishDate(t.ef),
      ls: zero ? cal.milestoneDate(t.ls) : cal.startDate(t.ls),
      lf: zero ? cal.milestoneDate(t.lf) : cal.finishDate(t.lf),
      totalFloatHalfDays: t.float,
      critical: t.critical,
      deadlineFloatHalfDays: t.deadlineFloat,
      slots: { es: t.es, ef: t.ef, ls: t.ls, lf: t.lf },
      kind: kinds.get(n.id)!,
    });
  }

  // Procurement dates: delivery is the node's fixed start; need-by is its late start.
  const procurement = new Map<string, ProcurementDates>();
  for (const item of plan.items) {
    if (!isProcurement(item)) continue;
    const t = out.get(item.id)!;
    const needBy = cal.startDate(t.slots.ls);
    procurement.set(item.id, {
      delivery: deliveryDate(item, plan.asOf),
      needBy,
      orderBy: addDays(needBy, -item.leadTimeDays),
      floatDays: t.totalFloatHalfDays / 2,
      deadlineFloatDays: t.deadlineFloatHalfDays === null ? null : t.deadlineFloatHalfDays / 2,
    });
  }

  rollUpSummaries(plan.items, parents, out, cal);

  return {
    calendar: cal,
    nodes: out,
    procurement,
    agile,
    criticalEdges: cpm.criticalEdges,
    warnings: cpm.warnings,
    projectFinish: cal.finishDate(cpm.projectFinish),
  };
}

/** Summary spans = min/max of descendants; float = min; critical if any child is. */
function rollUpSummaries(items: readonly Item[], parents: Set<string>, out: Map<string, ScheduledNode>, cal: WorkCalendar) {
  const children = new Map<string, string[]>();
  for (const i of items) {
    if (!i.parentId) continue;
    const list = children.get(i.parentId) ?? [];
    list.push(i.id);
    children.set(i.parentId, list);
  }
  const visit = (id: string): ScheduledNode | undefined => {
    const existing = out.get(id);
    if (existing) return existing;
    if (!parents.has(id)) return undefined;
    const kids = (children.get(id) ?? []).map(visit).filter((k): k is ScheduledNode => !!k);
    if (!kids.length) return undefined;
    const s = {
      es: Math.min(...kids.map((k) => k.slots.es)),
      ef: Math.max(...kids.map((k) => k.slots.ef)),
      ls: Math.min(...kids.map((k) => k.slots.ls)),
      lf: Math.max(...kids.map((k) => k.slots.lf)),
    };
    const node: ScheduledNode = {
      itemId: id,
      es: cal.startDate(s.es),
      ef: s.ef > s.es ? cal.finishDate(s.ef) : cal.milestoneDate(s.ef),
      ls: cal.startDate(s.ls),
      lf: s.lf > s.ls ? cal.finishDate(s.lf) : cal.milestoneDate(s.lf),
      totalFloatHalfDays: Math.min(...kids.map((k) => k.totalFloatHalfDays)),
      critical: kids.some((k) => k.critical),
      deadlineFloatHalfDays: kids.reduce<number | null>(
        (m, k) => (k.deadlineFloatHalfDays === null ? m : m === null ? k.deadlineFloatHalfDays : Math.min(m, k.deadlineFloatHalfDays)),
        null,
      ),
      slots: s,
      kind: 'summary',
    };
    out.set(id, node);
    return node;
  };
  for (const id of parents) visit(id);
}
