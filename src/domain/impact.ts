import { computeEvm } from './evm';
import { ValidationError } from './errors';
import { isEvent, type PlanState } from './plan';
import { computeRag } from './rag';
import { schedule, type ScheduleResult } from './scheduling/schedule';
import type { Impact, Item, PlanChange } from './types';

/** Applies plan changes to a copy of the plan. Pure: the input is never mutated. */
export function applyChanges(plan: PlanState, changes: readonly PlanChange[], idPrefix = 'itm_new'): PlanState {
  const next = structuredClone(plan);
  const find = (id: string): Item => {
    const item = next.items.find((i) => i.id === id);
    if (!item) throw new ValidationError(`Unknown item ${id}`);
    return item;
  };
  let created = 0;

  for (const c of changes) {
    switch (c.op) {
      case 'set_dates': {
        const item = find(c.itemId);
        if (item.type !== 'task' && item.type !== 'milestone' && item.type !== 'gate') {
          throw new ValidationError(`set_dates needs a schedulable item, got ${item.type}`);
        }
        // Like dragging a bar in MS Project: a new start becomes a start-no-earlier-than constraint.
        if (c.start !== undefined) {
          if (item.pinned) item.pinned = { start: c.start };
          else item.snet = c.start;
        }
        if (c.durationHalfDays !== undefined) {
          if (item.type !== 'task') throw new ValidationError('Only tasks have a duration');
          if (c.durationHalfDays < 0) throw new ValidationError('Duration must be >= 0');
          item.durationHalfDays = c.durationHalfDays;
        }
        break;
      }
      case 'set_delivery': {
        const item = find(c.itemId);
        if (item.type !== 'procurement') throw new ValidationError('set_delivery needs a procurement item');
        item.expectedDelivery = c.expectedDelivery;
        break;
      }
      case 'set_field': {
        const item = find(c.itemId) as unknown as Record<string, unknown>;
        if (['id', 'type', 'programId'].includes(c.field)) throw new ValidationError(`Field ${c.field} is read-only`);
        item[c.field] = c.value;
        break;
      }
      case 'set_status':
        find(c.itemId).status = c.status;
        break;
      case 'add_relation':
        next.relations.push({ ...c.relation, id: `rel_new_${next.relations.length + 1}`, programId: next.program.id });
        break;
      case 'remove_relation':
        next.relations = next.relations.filter((r) => r.id !== c.relationId);
        break;
      case 'create_item': {
        const now = new Date(0).toISOString();
        const draft = {
          status: 'not_started',
          order: 0,
          sharedWithGuestIds: [],
          followerIds: [],
          createdAt: now,
          updatedAt: now,
          ...(c.draft.type === 'task' || c.draft.type === 'milestone' || c.draft.type === 'gate'
            ? { durationHalfDays: 0, percentComplete: 0, assignments: [] }
            : {}),
          ...c.draft,
          id: c.draft.id ?? `${idPrefix}_${++created}`,
          programId: next.program.id,
        } as Item;
        next.items.push(draft);
        break;
      }
      case 'cost_entry':
        next.costEntries.push({ ...c.entry, id: `cst_new_${next.costEntries.length + 1}`, programId: next.program.id });
        break;
    }
  }
  return next;
}

/**
 * The consequences of a set of changes, computed deterministically
 * (docs/scheduling.md §12). The model never computes this.
 */
export function computeImpact(plan: PlanState, changes: readonly PlanChange[], before?: ScheduleResult): Impact {
  const r0 = before ?? schedule(plan);
  const after = applyChanges(plan, changes);
  const r1 = schedule(after);

  const moved: Impact['moved'] = [];
  const milestoneSlips: Impact['milestoneSlips'] = [];
  const itemById = new Map(after.items.map((i) => [i.id, i]));
  for (const [id, n1] of r1.nodes) {
    const n0 = r0.nodes.get(id);
    if (!n0 || n1.kind === 'summary' || n1.kind === 'agile_delivery') continue;
    if (n0.es !== n1.es || n0.ef !== n1.ef) {
      moved.push({ itemId: id, fromStart: n0.es, toStart: n1.es, fromFinish: n0.ef, toFinish: n1.ef });
    }
    const item = itemById.get(id);
    if (item && isEvent(item) && n1.slots.ef !== n0.slots.ef) {
      milestoneSlips.push({ itemId: id, days: (n1.slots.ef - n0.slots.ef) / 2 });
    }
  }

  const crit0 = new Set([...r0.nodes].filter(([, n]) => n.critical && n.kind !== 'summary').map(([id]) => id));
  const crit1 = new Set([...r1.nodes].filter(([, n]) => n.critical && n.kind !== 'summary').map(([id]) => id));
  const newlyCritical = [...crit1].filter((id) => !crit0.has(id));
  const criticalPathChanged = newlyCritical.length > 0 || [...crit0].some((id) => !crit1.has(id));

  const rag0 = computeRag(plan, r0).items;
  const rag1 = computeRag(after, r1).items;
  const ragChanges: Impact['ragChanges'] = [];
  for (const [id, to] of rag1) {
    const from = rag0.get(id);
    if (from && from !== to) ragChanges.push({ itemId: id, from, to });
  }

  const costDeltaCents =
    after.costEntries.slice(plan.costEntries.length).reduce((s, e) => s + e.amountCents, 0) +
    budgetOf(after) -
    budgetOf(plan);

  const e0 = computeEvm(plan, r0).program;
  const e1 = computeEvm(after, r1).program;
  const evm =
    e0.cpi !== null && e1.cpi !== null && e0.spi !== null && e1.spi !== null
      ? { cpiFrom: e0.cpi, cpiTo: e1.cpi, spiFrom: e0.spi, spiTo: e1.spi, eacFromCents: e0.eacCents, eacToCents: e1.eacCents }
      : undefined;

  return { moved, criticalPathChanged, newlyCritical, ragChanges, milestoneSlips, costDeltaCents, ...(evm ? { evm } : {}) };
}

function budgetOf(plan: PlanState): number {
  let s = 0;
  for (const i of plan.items) {
    if (i.type === 'task') s += i.budgetCents ?? 0;
    else if (i.type === 'procurement') s += i.poValueCents;
  }
  return s;
}
