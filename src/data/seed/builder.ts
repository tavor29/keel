// A small DSL for writing seed plans by hand: workstreams, groups (WBS summaries),
// tasks, milestones, gates and procurement, with dependencies by key.
import type { Gate, Item, Milestone, Procurement, Relation, Task } from '@/domain/types';

/** A dependency: key (FS, no lag) or [key, kind, lagDays]. */
export type Dep = string | [string, 'FS' | 'SS', number?];

interface Common {
  after?: Dep[];
  owner?: string;
  assignees?: string[];
}

const NOW = '2026-03-01T09:00:00Z';

export class PlanBuilder {
  readonly items: Item[] = [];
  private readonly pending: { to: string; dep: Dep }[] = [];
  private ws = '';
  private parents: string[] = [];
  private readonly orders = new Map<string, number>();
  private readonly keys = new Set<string>();

  constructor(
    private readonly programId: string,
    private readonly prefix: string,
  ) {}

  id(key: string) {
    return `itm_${this.prefix}_${key}`;
  }

  workstream(wsId: string, fn: () => void) {
    this.ws = wsId;
    this.parents = [];
    fn();
  }

  group(key: string, title: string, fn: () => void) {
    this.push(this.task(key, title, 0));
    this.parents.push(this.id(key));
    fn();
    this.parents.pop();
  }

  private base(key: string, title: string) {
    if (this.keys.has(key)) throw new Error(`Duplicate seed key ${key}`);
    this.keys.add(key);
    const parentId = this.parents.at(-1);
    const orderKey = parentId ?? this.ws;
    const order = (this.orders.get(orderKey) ?? 0) + 1;
    this.orders.set(orderKey, order);
    return {
      id: this.id(key),
      programId: this.programId,
      workstreamId: this.ws,
      ...(parentId ? { parentId } : {}),
      order,
      title,
      status: 'not_started' as const,
      sharedWithGuestIds: [],
      followerIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  private deps(key: string, after: Dep[] | undefined) {
    for (const dep of after ?? []) this.pending.push({ to: key, dep });
  }

  private push<T extends Item>(item: T): T {
    this.items.push(item);
    return item;
  }

  task(key: string, title: string, days: number, o: Common & { snet?: string; points?: number } = {}): Task {
    const t: Task = {
      ...this.base(key, title),
      type: 'task',
      durationHalfDays: Math.round(days * 2),
      percentComplete: 0,
      assignments: (o.assignees ?? (o.owner ? [o.owner] : [])).map((personId, i) => ({ personId, allocationPct: i === 0 ? 100 : 50 })),
      ...(o.owner ? { ownerId: o.owner } : {}),
      ...(o.snet ? { snet: o.snet } : {}),
      ...(o.points !== undefined ? { storyPoints: o.points } : {}),
    };
    this.deps(key, o.after);
    if (days === 0) return t; // group summary: caller pushes
    return this.push(t);
  }

  milestone(key: string, title: string, o: Common & { deadline?: string } = {}): Milestone {
    this.deps(key, o.after);
    return this.push({
      ...this.base(key, title),
      type: 'milestone',
      durationHalfDays: 0,
      percentComplete: 0,
      assignments: [],
      ...(o.owner ? { ownerId: o.owner } : {}),
      ...(o.deadline ? { deadline: o.deadline } : {}),
    });
  }

  gate(key: string, title: string, o: Common & { deadline?: string; approvers: string[]; entry: string[]; exit: string[] }): Gate {
    this.deps(key, o.after);
    const checks = (list: string[], tag: string) => list.map((text, i) => ({ id: `${key}_${tag}${i + 1}`, text, done: false }));
    return this.push({
      ...this.base(key, title),
      type: 'gate',
      durationHalfDays: 0,
      percentComplete: 0,
      assignments: [],
      ...(o.owner ? { ownerId: o.owner } : {}),
      ...(o.deadline ? { deadline: o.deadline } : {}),
      entryCriteria: checks(o.entry, 'en'),
      exitCriteria: checks(o.exit, 'ex'),
      approverIds: o.approvers,
    });
  }

  procurement(
    key: string,
    title: string,
    o: Common & { supplier: string; po: string; valueM: number; leadDays: number; ordered: string; expected?: string; guests?: string[] },
  ): Procurement {
    this.deps(key, o.after);
    return this.push({
      ...this.base(key, title),
      type: 'procurement',
      supplier: o.supplier,
      supplierGuestIds: o.guests ?? [],
      sharedWithGuestIds: o.guests ?? [],
      poNumber: o.po,
      poValueCents: Math.round(o.valueM * 100_000_000),
      leadTimeDays: o.leadDays,
      orderedOn: o.ordered,
      ...(o.expected ? { expectedDelivery: o.expected } : {}),
      deliveryStatus: 'ordered',
      percentComplete: 0,
      ...(o.owner ? { ownerId: o.owner } : {}),
    });
  }

  /** A chain of tasks, each after the previous; the first gets `after`. Returns the last key. */
  chain(steps: [key: string, title: string, days: number][], o: Common = {}): string {
    let prev: string | undefined;
    for (const [key, title, days] of steps) {
      this.task(key, title, days, { ...o, after: prev ? [prev] : o.after });
      prev = key;
    }
    return prev!;
  }

  relations(extra: { from: string; to: string }[] = []): Relation[] {
    const out: Relation[] = [];
    const resolve = (k: string) => (k.startsWith('wst_') ? k : this.id(k));
    let n = 0;
    for (const { to, dep } of this.pending) {
      const [from, kind, lag] = typeof dep === 'string' ? [dep, 'FS' as const, 0] : [dep[0], dep[1], dep[2] ?? 0];
      if (!from.startsWith('wst_') && !this.keys.has(from)) throw new Error(`Unknown dependency ${from} → ${to}`);
      out.push({ id: `rel_${this.prefix}_${++n}`, programId: this.programId, kind, fromId: resolve(from), toId: this.id(to), lagHalfDays: lag * 2 });
    }
    for (const e of extra) out.push({ id: `rel_${this.prefix}_${++n}`, programId: this.programId, kind: 'FS', fromId: resolve(e.from), toId: this.id(e.to), lagHalfDays: 0 });
    return out;
  }
}
