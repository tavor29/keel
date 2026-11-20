import type {
  Baseline,
  Calendar,
  CheckinRequest,
  CostEntry,
  Item,
  Procurement,
  Program,
  Relation,
  Sprint,
  Task,
  Workstream,
} from './types';

/** Everything the domain functions need about one program. Pure data; no I/O. */
export interface PlanState {
  program: Program;
  calendar: Calendar;
  workstreams: Workstream[];
  items: Item[];
  relations: Relation[];
  sprints: Sprint[];
  costEntries: CostEntry[];
  baseline?: Baseline;
  /** Latest check-in answer per item id (drives amber RAG for "at risk"). */
  latestCheckins?: Record<string, NonNullable<CheckinRequest['answer']>>;
  /** "Today" for progress, EVM and procurement lead times. */
  asOf: string;
}

export type SchedulableItem = Extract<Item, { type: 'task' | 'milestone' | 'gate' }>;

export const isSchedulable = (i: Item): i is SchedulableItem => i.type === 'task' || i.type === 'milestone' || i.type === 'gate';
export const isProcurement = (i: Item): i is Procurement => i.type === 'procurement';
export const isTask = (i: Item): i is Task => i.type === 'task';
export const isEvent = (i: Item) => i.type === 'milestone' || i.type === 'gate';

/** Ids of items that have children (summary/WBS parents). */
export function parentIds(items: readonly Item[]): Set<string> {
  const s = new Set<string>();
  for (const i of items) if (i.parentId) s.add(i.parentId);
  return s;
}

/** Agile delivery node id for a sprint-run workstream (docs/scheduling.md §6). */
export const deliveryNodeId = (workstreamId: string) => `${workstreamId}:delivery`;
