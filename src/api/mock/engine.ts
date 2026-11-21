// Plan-level helpers for the mock: build PlanState from MockState, cache computed
// schedules per revision, and apply changes back into state with audit + digest.
import { snapshotBaseline, variance } from '@/domain/baseline';
import { applyChanges, computeImpact } from '@/domain/impact';
import { digestFromImpact, summarizeProposal } from '@/domain/narrative';
import type { PlanState } from '@/domain/plan';
import { computeRag, type RagReport } from '@/domain/rag';
import { schedule, type ScheduleResult } from '@/domain/scheduling/schedule';
import type { Impact, Item, Message, PlanChange } from '@/domain/types';
import { wbsNumbers } from '@/domain/wbs';
import type { DocContext } from '@/domain/documents';
import type { ScheduleView } from '../contract';
import { NotFoundError } from '../errors';
import type { MockState } from './state';

export interface Computed {
  rev: number;
  plan: PlanState;
  result: ScheduleResult;
  rag: RagReport;
}

export function newId(s: MockState, prefix: string) {
  s.seq += 1;
  return `${prefix}_${s.seq.toString(36)}${Date.now().toString(36).slice(-3)}`;
}

export function planFor(s: MockState, programId: string): PlanState {
  const program = s.programs.find((p) => p.id === programId);
  if (!program) throw new NotFoundError(`program ${programId}`);
  const calendar = s.calendars.find((c) => c.id === program.calendarId)!;
  const latestCheckins: NonNullable<PlanState['latestCheckins']> = {};
  for (const round of [...s.checkinRounds].filter((r) => r.programId === programId).sort((a, b) => a.sentAt.localeCompare(b.sentAt))) {
    for (const req of round.requests) if (req.answer) latestCheckins[req.itemId] = req.answer;
  }
  return {
    program,
    calendar,
    workstreams: s.workstreams.filter((w) => w.programId === programId),
    items: s.items.filter((i) => i.programId === programId),
    relations: s.relations.filter((r) => r.programId === programId),
    sprints: s.sprints.filter((sp) => s.workstreams.some((w) => w.id === sp.workstreamId && w.programId === programId)),
    costEntries: s.costEntries.filter((c) => c.programId === programId),
    baseline: s.baselines.find((b) => b.id === program.activeBaselineId),
    latestCheckins,
    asOf: s.today,
  };
}

/** Cached per program per state revision. */
export function createComputer() {
  const cache = new Map<string, Computed>();
  return (s: MockState, programId: string): Computed => {
    const hit = cache.get(programId);
    if (hit && hit.rev === s.rev) return hit;
    const plan = planFor(s, programId);
    const result = schedule(plan);
    const c = { rev: s.rev, plan, result, rag: computeRag(plan, result) };
    cache.set(programId, c);
    return c;
  };
}

export function toView(c: Computed): ScheduleView {
  const { plan, result, rag } = c;
  const v: ScheduleView['variance'] = {};
  if (plan.baseline) {
    for (const id of result.nodes.keys()) {
      const x = variance(result, plan.baseline, id);
      if (x) v[id] = x;
    }
  }
  return {
    programId: plan.program.id,
    asOf: plan.asOf,
    computedAt: new Date().toISOString(),
    projectFinish: result.projectFinish,
    nodes: [...result.nodes.values()].map(({ slots: _s, ...n }) => n),
    procurement: Object.fromEntries(result.procurement),
    criticalEdges: result.criticalEdges.map((e) => ({ from: e.from, to: e.to })),
    rag: { items: Object.fromEntries(rag.items), workstreams: Object.fromEntries(rag.workstreams), program: rag.program },
    wbs: Object.fromEntries(wbsNumbers(plan.items)),
    variance: v,
    baselineId: plan.baseline?.id,
    agile: Object.fromEntries(
      [...result.agile].map(([ws, a]) => {
        const first = plan.sprints.filter((sp) => sp.workstreamId === ws).sort((x, y) => x.start.localeCompare(y.start))[0];
        return [ws, { ...a, ...(first ? { start: first.start } : {}) }];
      }),
    ),
  };
}

export function itemMap(s: MockState, programId: string) {
  return new Map(s.items.filter((i) => i.programId === programId).map((i) => [i.id, i]));
}

export function previewImpact(s: MockState, compute: ReturnType<typeof createComputer>, programId: string, changes: readonly PlanChange[]): { impact: Impact; summary: string } {
  const c = compute(s, programId);
  const impact = computeImpact(c.plan, changes, c.result);
  return { impact, summary: summarizeProposal(changes, impact, itemMap(s, programId)) };
}

/**
 * Applies plan changes into state (the "write pipeline" in docs/mock-api.md):
 * apply → replace program records → audit → digest → system messages. Caller persists/emits.
 */
export function applyToState(
  s: MockState,
  compute: ReturnType<typeof createComputer>,
  programId: string,
  changes: readonly PlanChange[],
  ctx: { actorId: string; cause: string; proposalId?: string; changeRequestId?: string; sourceContainers?: Message['container'][]; summary?: string },
): Impact {
  const before = compute(s, programId);
  const impact = computeImpact(before.plan, changes, before.result);
  const next = applyChanges(before.plan, changes, newId(s, 'itm'));
  const now = new Date().toISOString();

  const others = <T extends { programId: string }>(list: T[]) => list.filter((x) => x.programId !== programId);
  const changedIds = new Set<string>();
  const beforeById = new Map(before.plan.items.map((i) => [i.id, JSON.stringify(i)]));
  for (const i of next.items) if (beforeById.get(i.id) !== JSON.stringify(i)) changedIds.add(i.id);
  for (const i of next.items) if (changedIds.has(i.id)) (i as Item).updatedAt = now;

  s.items = [...others(s.items), ...next.items];
  s.relations = [...others(s.relations), ...next.relations];
  s.costEntries = [...others(s.costEntries), ...next.costEntries];
  s.rev += 1;

  for (const id of changedIds) {
    s.audit.push({
      id: newId(s, 'aud'),
      programId,
      at: now,
      actorId: ctx.actorId,
      action: ctx.proposalId ? 'proposal.applied' : ctx.changeRequestId ? 'change_request.applied' : 'item.updated',
      targetId: id,
      proposalId: ctx.proposalId,
      changeRequestId: ctx.changeRequestId,
    });
  }

  const items = itemMap(s, programId);
  s.digest.push(
    ...digestFromImpact(impact, items, {
      id: () => newId(s, 'dig'),
      programId,
      at: now,
      sourceIds: [ctx.proposalId ?? ctx.changeRequestId ?? ''].filter(Boolean),
      cause: ctx.cause,
    }),
  );

  for (const container of ctx.sourceContainers ?? []) {
    s.messages.push({
      id: newId(s, 'msg'),
      programId,
      container,
      source: 'system',
      body: `Applied: ${ctx.summary ?? ctx.cause}`,
      mentions: [],
      createdAt: now,
      visibility: 'members',
    });
  }
  return impact;
}

export function rebaseline(s: MockState, compute: ReturnType<typeof createComputer>, programId: string, name: string, actorId: string, reason: string, changeRequestId?: string) {
  const c = compute(s, programId);
  const b = snapshotBaseline(c.plan.items, c.result, {
    id: newId(s, 'bsl'),
    programId,
    name,
    createdAt: new Date().toISOString(),
    createdById: actorId,
    reason,
    ...(changeRequestId ? { changeRequestId } : {}),
  });
  s.baselines.push(b);
  const program = s.programs.find((p) => p.id === programId)!;
  program.activeBaselineId = b.id;
  s.rev += 1;
  s.audit.push({ id: newId(s, 'aud'), programId, at: b.createdAt, actorId, action: 'baseline.set', targetId: b.id, changeRequestId });
  return b;
}

export function docContext(s: MockState, c: Computed): DocContext {
  return {
    plan: c.plan,
    result: c.result,
    rag: c.rag,
    people: s.people,
    memberships: s.memberships,
    requirements: s.requirements,
    stakeholders: s.stakeholders,
    comms: s.comms,
    raciOverrides: s.raciOverrides,
  };
}
