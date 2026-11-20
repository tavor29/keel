import { CycleError, ValidationError } from '../errors';

/**
 * Generic critical-path engine on half-day boundaries (docs/scheduling.md §3–4).
 * Knows nothing about items or dates; schedule.ts maps the program onto it.
 */
export interface CpmNode {
  id: string;
  duration: number; // half-day slots, >= 0
  /** Fixed start boundary (pinned task, procurement delivery, agile delivery). Overrides dependencies. */
  fixedStart?: number;
  /** Start-no-earlier-than boundary. */
  earliest?: number;
  /** Finish-no-later-than boundary (deadline); produces negative float when missed. */
  deadline?: number;
}

export interface CpmEdge {
  from: string;
  to: string;
  kind: 'FS' | 'SS';
  lag: number; // half-days, may be negative
}

export interface CpmTimes {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  float: number;
  critical: boolean;
  /**
   * Slack against the nearest downstream deadline (half-days); null when no deadline
   * is downstream. Drives RAG: the longest path always has zero total float, so RAG
   * measures against committed dates instead (docs/scheduling.md §4, §10).
   */
  deadlineFloat: number | null;
}

export interface CpmWarning {
  kind: 'fixed_violates_dependency';
  nodeId: string;
  /** How many half-days earlier the fixed start is than its dependencies allow. */
  bySlots: number;
}

export interface CpmResult {
  times: Map<string, CpmTimes>;
  order: string[]; // topological order
  projectFinish: number;
  /** Edges whose constraint sets the successor's early start, between two critical nodes. */
  criticalEdges: CpmEdge[];
  warnings: CpmWarning[];
}

export function runCpm(nodes: readonly CpmNode[], edges: readonly CpmEdge[], origin = 0): CpmResult {
  const byId = new Map<string, CpmNode>();
  for (const n of nodes) {
    if (byId.has(n.id)) throw new ValidationError(`Duplicate node ${n.id}`);
    if (n.duration < 0) throw new ValidationError(`Negative duration on ${n.id}`);
    byId.set(n.id, n);
  }
  const preds = new Map<string, CpmEdge[]>();
  const succs = new Map<string, CpmEdge[]>();
  for (const n of nodes) {
    preds.set(n.id, []);
    succs.set(n.id, []);
  }
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) throw new ValidationError(`Relation references unknown node: ${e.from} → ${e.to}`);
    if (e.from === e.to) throw new CycleError([e.from, e.to]);
    succs.get(e.from)!.push(e);
    preds.get(e.to)!.push(e);
  }

  const order = topoSort(nodes, preds, succs);

  // Forward pass
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  const warnings: CpmWarning[] = [];
  for (const id of order) {
    const n = byId.get(id)!;
    let start = origin;
    for (const e of preds.get(id)!) {
      const c = e.kind === 'FS' ? ef.get(e.from)! + e.lag : es.get(e.from)! + e.lag;
      if (c > start) start = c;
    }
    if (n.earliest !== undefined && n.earliest > start) start = n.earliest;
    if (n.fixedStart !== undefined) {
      if (n.fixedStart < start && preds.get(id)!.length > 0) {
        warnings.push({ kind: 'fixed_violates_dependency', nodeId: id, bySlots: start - n.fixedStart });
      }
      start = n.fixedStart;
    }
    es.set(id, start);
    ef.set(id, start + n.duration);
  }

  let projectFinish = origin;
  for (const v of ef.values()) if (v > projectFinish) projectFinish = v;

  // Backward pass
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!;
    const n = byId.get(id)!;
    let finish = projectFinish;
    if (n.deadline !== undefined && n.deadline < finish) finish = n.deadline;
    for (const e of succs.get(id)!) {
      const c = e.kind === 'FS' ? ls.get(e.to)! - e.lag : ls.get(e.to)! - e.lag + n.duration;
      if (c < finish) finish = c;
    }
    lf.set(id, finish);
    ls.set(id, finish - n.duration);
  }

  // Second backward pass constrained only by deadlines.
  const lsDeadline = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]!;
    const n = byId.get(id)!;
    let finish = n.deadline ?? Infinity;
    for (const e of succs.get(id)!) {
      const c = e.kind === 'FS' ? lsDeadline.get(e.to)! - e.lag : lsDeadline.get(e.to)! - e.lag + n.duration;
      if (c < finish) finish = c;
    }
    lsDeadline.set(id, finish - n.duration);
  }

  const times = new Map<string, CpmTimes>();
  for (const id of order) {
    const float = ls.get(id)! - es.get(id)!;
    const ld = lsDeadline.get(id)!;
    times.set(id, {
      es: es.get(id)!,
      ef: ef.get(id)!,
      ls: ls.get(id)!,
      lf: lf.get(id)!,
      float,
      critical: float <= 0,
      deadlineFloat: Number.isFinite(ld) ? ld - es.get(id)! : null,
    });
  }

  const criticalEdges = edges.filter((e) => {
    const a = times.get(e.from)!;
    const b = times.get(e.to)!;
    if (!a.critical || !b.critical) return false;
    return e.kind === 'FS' ? b.es === a.ef + e.lag : b.es === a.es + e.lag;
  });

  return { times, order, projectFinish, criticalEdges, warnings };
}

/** Kahn's algorithm; on a cycle, throws CycleError with one concrete cycle path. */
function topoSort(
  nodes: readonly CpmNode[],
  preds: Map<string, CpmEdge[]>,
  succs: Map<string, CpmEdge[]>,
): string[] {
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.id, preds.get(n.id)!.length);
  const queue: string[] = [];
  for (const n of nodes) if (indeg.get(n.id) === 0) queue.push(n.id);
  const order: string[] = [];
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi]!;
    order.push(id);
    for (const e of succs.get(id)!) {
      const d = indeg.get(e.to)! - 1;
      indeg.set(e.to, d);
      if (d === 0) queue.push(e.to);
    }
  }
  if (order.length === nodes.length) return order;

  // Find a cycle among the remaining nodes by walking predecessors.
  const remaining = new Set(nodes.map((n) => n.id).filter((id) => indeg.get(id)! > 0));
  const start = remaining.values().next().value as string;
  const seen = new Map<string, number>();
  const path: string[] = [];
  let cur = start;
  while (!seen.has(cur)) {
    seen.set(cur, path.length);
    path.push(cur);
    cur = preds.get(cur)!.find((e) => remaining.has(e.from))!.from;
  }
  const cycle = path.slice(seen.get(cur)).reverse();
  throw new CycleError([...cycle, cycle[0]!]);
}

/** Would adding from → to create a cycle? (Used by the API before persisting a relation.) */
export function wouldCreateCycle(edges: readonly Pick<CpmEdge, 'from' | 'to'>[], from: string, to: string): string[] | null {
  if (from === to) return [from, to];
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.from) ?? [];
    list.push(e.to);
    adj.set(e.from, list);
  }
  // Is there a path to → … → from already?
  const prev = new Map<string, string>();
  const stack = [to];
  const seen = new Set([to]);
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === from) {
      const path = [from];
      let p = from;
      while (p !== to) {
        p = prev.get(p)!;
        path.push(p);
      }
      return [from, ...path.reverse()];
    }
    for (const nxt of adj.get(cur) ?? []) {
      if (!seen.has(nxt)) {
        seen.add(nxt);
        prev.set(nxt, cur);
        stack.push(nxt);
      }
    }
  }
  return null;
}
