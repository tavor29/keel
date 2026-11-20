import { parentIds, type PlanState } from './plan';
import type { ScheduleResult } from './scheduling/schedule';
import type { Item, Procurement, Rag } from './types';

const rank: Record<Rag, number> = { green: 0, amber: 1, red: 2 };
export const worstRag = (rags: readonly Rag[]): Rag => rags.reduce<Rag>((w, r) => (rank[r] > rank[w] ? r : w), 'green');

const AMBER_FLOAT_HALF_DAYS = 10; // < 5 working days of slack to the next deadline → amber

/**
 * RAG for a schedulable leaf (docs/scheduling.md §10). Manual override wins.
 * Measured against the nearest downstream *deadline*, not the program finish.
 */
export function leafRag(item: Item, result: ScheduleResult, checkin?: NonNullable<PlanState['latestCheckins']>[string]): Rag {
  if (item.rag) return item.rag;
  if (item.type === 'procurement') return procurementRag(item, result);
  const node = result.nodes.get(item.id);
  if (!node || item.status === 'done' || item.status === 'cancelled') return 'green';
  const slack = node.deadlineFloatHalfDays;
  if (slack !== null && slack < 0) return 'red';
  if (item.status === 'blocked' && node.critical) return 'red';
  if ((slack !== null && slack < AMBER_FLOAT_HALF_DAYS) || checkin?.kind === 'at_risk' || item.status === 'blocked') return 'amber';
  return 'green';
}

/**
 * docs/scheduling.md §5: green ≥ 10 days of slack to the next deadline, amber 0–9,
 * red < 0 or delayed without a new date. No downstream deadline → green.
 */
export function procurementRag(item: Procurement, result: ScheduleResult): Rag {
  if (item.deliveryStatus === 'delivered') return 'green';
  if (item.deliveryStatus === 'delayed' && !item.expectedDelivery) return 'red';
  const p = result.procurement.get(item.id);
  if (!p || p.deadlineFloatDays === null) return 'green';
  if (p.deadlineFloatDays < 0) return 'red';
  return p.deadlineFloatDays < 10 ? 'amber' : 'green';
}

/**
 * Roll-up: the worst critical child if it isn't green; otherwise amber when
 * more than 20% of children are amber or worse; otherwise green.
 */
export function rollUpRag(children: readonly { rag: Rag; critical: boolean }[]): Rag {
  if (!children.length) return 'green';
  const critical = worstRag(children.filter((c) => c.critical).map((c) => c.rag));
  if (critical !== 'green') return critical;
  const notGreen = children.filter((c) => c.rag !== 'green').length;
  return notGreen / children.length > 0.2 ? 'amber' : 'green';
}

export interface RagReport {
  items: Map<string, Rag>;
  workstreams: Map<string, Rag>;
  program: Rag;
}

/** RAG for every item, summary, workstream and the program. */
export function computeRag(plan: PlanState, result: ScheduleResult): RagReport {
  const items = new Map<string, Rag>();
  const parents = parentIds(plan.items);
  const relevant = plan.items.filter((i) => result.nodes.has(i.id));
  for (const i of relevant) if (!parents.has(i.id)) items.set(i.id, leafRag(i, result, plan.latestCheckins?.[i.id]));

  const byId = new Map(plan.items.map((i) => [i.id, i]));
  const childrenOf = new Map<string, Item[]>();
  for (const i of relevant) if (i.parentId) childrenOf.set(i.parentId, [...(childrenOf.get(i.parentId) ?? []), i]);
  const visit = (id: string): Rag => {
    const known = items.get(id);
    if (known) return known;
    const kids = childrenOf.get(id) ?? [];
    const own = byId.get(id)?.rag;
    const r = own ?? rollUpRag(kids.map((k) => ({ rag: visit(k.id), critical: !!result.nodes.get(k.id)?.critical })));
    items.set(id, r);
    return r;
  };
  for (const id of parents) if (result.nodes.has(id)) visit(id);

  const workstreams = new Map<string, Rag>();
  for (const ws of plan.workstreams) {
    const top = relevant.filter((i) => i.workstreamId === ws.id && !i.parentId);
    workstreams.set(ws.id, rollUpRag(top.map((i) => ({ rag: items.get(i.id)!, critical: !!result.nodes.get(i.id)?.critical }))));
  }
  const program = rollUpRag(
    plan.workstreams.map((ws) => ({
      rag: workstreams.get(ws.id)!,
      critical: relevant.some((i) => i.workstreamId === ws.id && result.nodes.get(i.id)?.critical),
    })),
  );
  return { items, workstreams, program };
}
