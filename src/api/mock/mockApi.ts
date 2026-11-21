import { createSeedState } from '@/data/seed';
import { computeEvm } from '@/domain/evm';
import { addDays } from '@/domain/dates';
import { suggestFiling } from '@/domain/mailFiling';
import { suggestPromotion, type PromotionDraft } from '@/domain/promotion';
import { actorFrom, can, type Action, type Actor, type Resource } from '@/domain/permissions';
import { draftReport } from '@/domain/report';
import { computeWorkload } from '@/domain/workload';
import { wouldCreateCycle } from '@/domain/scheduling/cpm';
import type { ChangeRequest, CheckinRequest, Item, MailMessage, Message, ProjectDocument, Program, Proposal, StatusReport, Task } from '@/domain/types';
import type { DocAttention } from '../contract';
import type { KeelApi, KeelEvent } from '../contract';
import { CycleError, ForbiddenError, NotFoundError, NotImplementedError, ValidationError } from '../errors';
import { applyToState, createComputer, docContext, newId, previewImpact, rebaseline, toView } from './engine';
import { deriveRaci, documentDrift, freezeVersion, renderDocument } from '@/domain/documents';
import { addDays as addCalendarDays } from '@/domain/dates';
import { createEventBus } from './eventBus';
import { browserStore, clearOldVersions, loadState, saveState, type KeyValueStore } from './persistence';
import { createScenarioRunner, type ScenarioHost } from './scenarios';
import { SCHEMA_VERSION, type MockState } from './state';

export interface MockApiOptions {
  /** Where state persists. Defaults to localStorage when available. Pass `null` for no persistence. */
  store?: KeyValueStore | null;
  /** Simulated network latency in ms. Defaults to 80–250; use { min: 0, max: 0 } in tests. */
  latency?: { min: number; max: number };
  /** Seed factory (tests can inject smaller seeds). */
  seed?: () => MockState;
  /** Multiplier for scenario step delays (tests use 0). */
  scenarioSpeed?: number;
}

export interface MockKeelApi extends KeelApi {
  /** Test/debug hook: a deep copy of the current state. */
  _snapshot(): MockState;
}

/**
 * A namespace whose unimplemented methods reject with NotImplementedError.
 * Used for contract areas scheduled for later phases (docs/build-plan.md).
 */
function planned<T extends object>(ns: string, phase: number, impl: Partial<T> = {}): T {
  return new Proxy(impl as T, {
    get: (target, prop) => {
      if (typeof prop !== 'string' || prop === 'then') return undefined; // never look like a Promise
      const own = (target as Record<string, unknown>)[prop];
      return own ?? (() => Promise.reject(new NotImplementedError(`${ns}.${prop}`, phase)));
    },
  });
}

export function createMockApi(opts: MockApiOptions = {}): MockKeelApi {
  const store = opts.store === null ? undefined : (opts.store ?? browserStore());
  const latency = opts.latency ?? { min: 80, max: 250 };
  const seed = opts.seed ?? (() => createSeedState());
  const bus = createEventBus<KeelEvent>();
  const compute = createComputer();

  clearOldVersions(store, SCHEMA_VERSION);
  let state: MockState = loadState<MockState>(store, SCHEMA_VERSION) ?? seed();

  const wait = () => {
    const ms = latency.max <= 0 ? 0 : latency.min + Math.random() * (latency.max - latency.min);
    return new Promise<void>((r) => setTimeout(r, ms));
  };

  /** Every read returns a copy, so callers can never mutate mock state by accident. */
  async function read<T>(fn: (s: MockState) => T): Promise<T> {
    await wait();
    return structuredClone(fn(state));
  }

  /** The single write path: mutate → persist → emit (docs/mock-api.md → "Write pipeline"). */
  async function write<T>(fn: (s: MockState) => T, events: (result: T) => KeelEvent[] = () => []): Promise<T> {
    await wait();
    const result = writeNow(fn, events);
    return structuredClone(result);
  }
  function writeNow<T>(fn: (s: MockState) => T, events: (result: T) => KeelEvent[] = () => []): T {
    const result = fn(state);
    saveState(store, SCHEMA_VERSION, state);
    for (const e of events(result)) bus.emit(e);
    return result;
  }

  const me = (s: MockState) => {
    const person = s.people.find((p) => p.id === s.currentPersonId);
    if (!person) throw new NotFoundError(`persona ${s.currentPersonId}`);
    return person;
  };
  const actorIn = (s: MockState, programId: string): Actor | undefined =>
    actorFrom(s.memberships.find((m) => m.programId === programId && m.personId === s.currentPersonId));
  const requireProgram = (s: MockState, programId: string, action: Action, resource?: Resource): Program => {
    const program = s.programs.find((p) => p.id === programId);
    if (!program) throw new NotFoundError(`program ${programId}`);
    if (!can(actorIn(s, programId), action, resource)) throw new ForbiddenError(`${action} on ${programId}`);
    return program;
  };
  const findItem = (s: MockState, id: string) => {
    const item = s.items.find((i) => i.id === id);
    if (!item) throw new NotFoundError(`item ${id}`);
    return item;
  };
  const canSee = (s: MockState, item: Item) => can(actorIn(s, item.programId), 'item.view', item);
  const isPm = (s: MockState, programId: string) => actorIn(s, programId)?.role === 'pm';
  const canSeeMessage = (s: MockState, m: Message) => m.visibility === 'members' || isPm(s, m.programId);
  const now = () => new Date().toISOString();
  const programEvents = (programId: string, itemIds: string[] = []): KeelEvent[] => [
    { type: 'item.changed', programId, itemIds },
    { type: 'schedule.recomputed', programId },
    { type: 'cost.changed', programId },
  ];

  const notify = (s: MockState, personIds: string[], kind: 'approval_needed' | 'cr_approval' | 'checkin_assigned' | 'mention', targetId: string) => {
    const out = personIds.map((personId) => ({ id: newId(s, 'ntf'), personId, at: now(), kind, targetId, read: false }));
    s.notifications.push(...out);
    return out;
  };
  const pmsOf = (s: MockState, programId: string) => s.memberships.filter((m) => m.programId === programId && m.role === 'pm').map((m) => m.personId);

  // ── internal operations shared by the API and the scenario runner ─────────────────────────────
  function createProposalNow(s: MockState, p: Omit<Proposal, 'id' | 'impact' | 'state' | 'createdAt' | 'summary'> & { summary?: string }): Proposal {
    const { impact, summary } = previewImpact(s, compute, p.programId, p.changes);
    const proposal: Proposal = { ...p, id: newId(s, 'prp'), summary: p.summary || summary, impact, state: 'pending', createdAt: now() };
    s.proposals.push(proposal);
    const ntfs = notify(s, pmsOf(s, p.programId), 'approval_needed', proposal.id);
    queueMicrotask(() => ntfs.forEach((n) => bus.emit({ type: 'notification', notification: n })));
    return proposal;
  }

  function sourceContainers(s: MockState, p: Proposal): Message['container'][] {
    const out: Message['container'][] = [];
    for (const src of p.sources) {
      const m = s.messages.find((x) => x.id === src.id);
      if (m && !out.some((c) => c.kind === m.container.kind && c.id === m.container.id)) out.push(m.container);
    }
    return out;
  }

  function receiveMailNow(s: MockState, mail: Omit<MailMessage, 'id' | 'suggestion' | 'state'>): MailMessage {
    const programIds = s.memberships.filter((m) => m.personId === mail.ownerId).map((m) => m.programId);
    const items = s.items.filter((i) => programIds.includes(i.programId));
    const suggestion = suggestFiling(mail, items, s.people);
    const m: MailMessage = { ...mail, id: newId(s, 'mail'), state: 'unfiled', ...(suggestion ? { suggestion } : {}) };
    s.mail.push(m);
    return m;
  }

  function answerCheckinNow(s: MockState, programId: string, itemId: string, personId: string, answer: NonNullable<CheckinRequest['answer']>, channel: 'keel' | 'teams' | 'slack' | 'email') {
    let round = [...s.checkinRounds].reverse().find((r) => r.programId === programId && r.requests.some((q) => q.itemId === itemId && !q.answer));
    if (!round) {
      round = { id: newId(s, 'chk'), programId, kind: 'adhoc', scope: { kind: 'items', itemIds: [itemId] }, sentAt: now(), requests: [{ itemId, personId, channel }] };
      s.checkinRounds.push(round);
    }
    const req = round.requests.find((q) => q.itemId === itemId)!;
    req.answer = answer;
    req.answeredAt = now();
    const label = answer.kind === 'on_track' ? 'On track' : answer.kind === 'at_risk' ? `At risk · new date ${answer.newDate}` : `Blocked · ${answer.reason}`;
    const note = answer.kind === 'at_risk' && answer.note ? `: ${answer.note}` : '';
    const msg: Message = {
      id: newId(s, 'msg'),
      programId,
      container: { kind: 'item', id: itemId },
      source: 'checkin',
      authorId: personId,
      body: `Check-in (${channel}): ${label}${note}`,
      mentions: [],
      createdAt: now(),
      visibility: 'members',
    };
    s.messages.push(msg);
    s.rev += 1;
    return { round, message: msg };
  }

  function createChangeRequestNow(s: MockState, programId: string, cr: Pick<ChangeRequest, 'title' | 'scopeDelta' | 'costDeltaCents' | 'changes' | 'approverIds' | 'workstreamId'> & { ownerId: string; description?: string }) {
    const item: ChangeRequest = {
      id: newId(s, 'itm'),
      programId,
      workstreamId: cr.workstreamId,
      order: 990,
      type: 'change',
      title: cr.title,
      description: cr.description,
      ownerId: cr.ownerId,
      status: 'in_progress',
      sharedWithGuestIds: [],
      followerIds: [],
      createdAt: now(),
      updatedAt: now(),
      scopeDelta: cr.scopeDelta,
      costDeltaCents: cr.costDeltaCents,
      changes: cr.changes,
      approverIds: cr.approverIds,
      approvals: [],
      state: 'submitted',
    };
    s.items.push(item);
    s.rev += 1;
    const ntfs = notify(s, cr.approverIds, 'cr_approval', item.id);
    queueMicrotask(() => ntfs.forEach((n) => bus.emit({ type: 'notification', notification: n })));
    return item;
  }

  function closeSprintNow(s: MockState, sprintId: string) {
    const sprint = s.sprints.find((x) => x.id === sprintId);
    if (!sprint) throw new NotFoundError(`sprint ${sprintId}`);
    const stories = s.items.filter((i): i is Task => i.type === 'task' && i.sprintId === sprintId);
    sprint.state = 'closed';
    sprint.completedPoints = stories.filter((t) => t.status === 'done').reduce((a, t) => a + (t.storyPoints ?? 0), 0);
    sprint.burndown.push({ date: s.today, remainingPoints: sprint.committedPoints - sprint.completedPoints });
    const carried = stories.filter((t) => t.status !== 'done');
    for (const t of carried) delete t.sprintId;
    s.rev += 1;
    return { sprint, carried };
  }

  function promoteNow(s: MockState, messageId: string, draft: PromotionDraft): Item {
    const m = s.messages.find((x) => x.id === messageId);
    if (!m) throw new NotFoundError(`message ${messageId}`);
    if (m.promotedItemId) throw new ValidationError('This message was already promoted');
    if (!can(actorIn(s, m.programId), 'item.create', { workstreamId: draft.workstreamId })) throw new ForbiddenError('item.create');
    const at = now();
    const common = {
      id: newId(s, 'itm'),
      programId: m.programId,
      workstreamId: draft.workstreamId,
      order: 800,
      title: draft.title,
      description: draft.description,
      ownerId: s.currentPersonId,
      status: 'not_started' as const,
      sharedWithGuestIds: [],
      followerIds: [s.currentPersonId],
      createdAt: at,
      updatedAt: at,
    };
    const item: Item =
      draft.type === 'risk'
        ? { ...common, type: 'risk', probability: draft.probability ?? 3, impact: draft.impact ?? 3 }
        : draft.type === 'issue'
          ? { ...common, type: 'issue', severity: draft.severity ?? 'medium' }
          : draft.type === 'decision'
            ? { ...common, type: 'decision', context: draft.description, options: draft.options ?? [] }
            : draft.type === 'assumption'
              ? { ...common, type: 'assumption' }
              : { ...common, type: 'task', durationHalfDays: 2, percentComplete: 0, assignments: [] };
    s.items.push(item);
    m.promotedItemId = item.id;
    s.messages.push({ ...m, id: newId(s, 'msg'), container: { kind: 'item', id: item.id }, promotedItemId: undefined, parentId: undefined });
    s.messages.push({ id: newId(s, 'msg'), programId: m.programId, container: { kind: 'item', id: item.id }, source: 'system', body: `Promoted from a ${m.source === 'slack' ? 'Slack' : m.source === 'teams' ? 'Teams' : 'Keel'} channel message by ${me(s).name}.`, mentions: [], createdAt: at, visibility: 'members' });
    s.digest.push({ id: newId(s, 'dig'), programId: m.programId, at, group: draft.type === 'risk' ? 'risk' : draft.type === 'decision' ? 'decision' : 'schedule', text: `New ${draft.type}: ${draft.title}`, itemIds: [item.id], sourceIds: [m.id] });
    s.rev += 1;
    return item;
  }

  const host: ScenarioHost = {
    get state() {
      return state;
    },
    bus,
    write: writeNow,
    receiveMail: receiveMailNow,
    createProposal: createProposalNow,
    answerCheckin: answerCheckinNow,
    createChangeRequest: createChangeRequestNow,
    closeSprint: closeSprintNow,
    speed: opts.scenarioSpeed ?? 1,
  };
  const scenarios = createScenarioRunner(host);

  /**
   * Plan edits are validated by rescheduling: if the program can't be scheduled
   * afterwards (dependency on a summary, cycle…), the edit is rolled back.
   */
  function planEdit<T>(s: MockState, programId: string, mutate: () => T): T {
    const items = structuredClone(s.items);
    const relations = structuredClone(s.relations);
    const result = mutate();
    s.rev += 1;
    try {
      compute(s, programId);
    } catch (err) {
      s.items = items;
      s.relations = relations;
      s.rev += 1;
      throw err instanceof Error ? new ValidationError(err.message) : err;
    }
    return result;
  }

  const findDoc = (s: MockState, id: string): ProjectDocument => {
    const d = s.documents.find((x) => x.id === id);
    if (!d) throw new NotFoundError(`document ${id}`);
    const actor = actorIn(s, d.programId);
    if (!actor || (actor.role === 'guest' && !d.sharedWithGuestIds.includes(s.currentPersonId))) throw new ForbiddenError('document.view');
    return d;
  };
  const driftOf = (s: MockState, d: ProjectDocument) => {
    const approved = s.documentVersions.filter((v) => v.documentId === d.id && v.version === d.approvedVersion).at(-1);
    return documentDrift(d, approved, renderDocument(d, docContext(s, compute(s, d.programId))));
  };

  const api: MockKeelApi = {
    session: {
      me: () => read((s) => ({ person: me(s), memberships: s.memberships.filter((m) => m.personId === s.currentPersonId) })),
      personas: () => read((s) => s.personaIds.map((id) => s.people.find((p) => p.id === id)).filter((p) => !!p)),
      switchPersona: (personId) =>
        write(
          (s) => {
            if (!s.people.some((p) => p.id === personId)) throw new NotFoundError(`persona ${personId}`);
            s.currentPersonId = personId;
          },
          () => [{ type: 'session.changed', personId }],
        ),
    },

    programs: {
      list: () => read((s) => s.programs.filter((p) => can(actorIn(s, p.id), 'program.view'))),
      get: (id) => read((s) => requireProgram(s, id, 'program.view')),
      calendar: (programId) =>
        read((s) => {
          const program = requireProgram(s, programId, 'program.view');
          const cal = s.calendars.find((c) => c.id === program.calendarId);
          if (!cal) throw new NotFoundError(`calendar ${program.calendarId}`);
          return cal;
        }),
      workstreams: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.workstreams.filter((w) => w.programId === programId).sort((a, b) => a.order - b.order);
        }),
      members: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.memberships
            .filter((m) => m.programId === programId)
            .flatMap((m) => {
              const person = s.people.find((p) => p.id === m.personId);
              return person ? [{ ...m, person }] : [];
            });
        }),
      update: (id, patch) =>
        write((s) => {
          const program = requireProgram(s, id, 'program.update');
          Object.assign(program, patch, { id: program.id });
          s.rev += 1;
          return program;
        }),
    },

    items: planned<KeelApi['items']>('items', 4, {
      list: (programId, q) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          const text = q?.text?.toLowerCase();
          return s.items.filter(
            (i) =>
              i.programId === programId &&
              canSee(s, i) &&
              (!q?.workstreamId || i.workstreamId === q.workstreamId) &&
              (!q?.types || q.types.includes(i.type)) &&
              (!q?.ownerId || i.ownerId === q.ownerId) &&
              (!q?.status || q.status.includes(i.status)) &&
              (!text || i.title.toLowerCase().includes(text)),
          );
        }),
      get: (id) =>
        read((s) => {
          const item = findItem(s, id);
          if (!canSee(s, item)) throw new ForbiddenError(`item.view on ${id}`);
          return item;
        }),
      update: (id, patch) =>
        write(
          (s) => {
            const item = findItem(s, id);
            if (!can(actorIn(s, item.programId), 'item.edit', item)) throw new ForbiddenError(`item.edit on ${id}`);
            const { id: _i, type: _t, programId: _p, ...rest } = patch as Record<string, unknown>;
            const before = Object.fromEntries(Object.keys(rest).map((k) => [k, (item as unknown as Record<string, unknown>)[k]]));
            planEdit(s, item.programId, () => {
              Object.assign(item, rest, { updatedAt: now() });
              for (const [k, v] of Object.entries(rest)) if (v === undefined) delete (item as unknown as Record<string, unknown>)[k];
            });
            s.audit.push({ id: newId(s, 'aud'), programId: item.programId, at: now(), actorId: s.currentPersonId, action: 'item.updated', targetId: id, before, after: rest });
            return item;
          },
          (item) => programEvents(item.programId, [item.id]),
        ),
      create: (draft) =>
        write(
          (s) => {
            const ws = s.workstreams.find((w) => w.id === draft.workstreamId);
            if (!ws) throw new NotFoundError(`workstream ${draft.workstreamId}`);
            if (!can(actorIn(s, ws.programId), 'item.create', { workstreamId: ws.id })) throw new ForbiddenError('item.create');
            if (!draft.title?.trim()) throw new ValidationError('Title is required');
            const siblings = s.items.filter((i) => i.workstreamId === ws.id && i.parentId === draft.parentId);
            const schedulable = draft.type === 'task' || draft.type === 'milestone' || draft.type === 'gate';
            const item = {
              status: 'not_started',
              sharedWithGuestIds: [],
              followerIds: [],
              order: Math.max(0, ...siblings.map((x) => x.order)) + 1,
              ownerId: s.currentPersonId,
              ...(schedulable ? { durationHalfDays: draft.type === 'task' ? 10 : 0, percentComplete: 0, assignments: [] } : {}),
              ...(draft.type === 'gate' ? { entryCriteria: [], exitCriteria: [], approverIds: [] } : {}),
              ...draft,
              id: newId(s, 'itm'),
              programId: ws.programId,
              createdAt: now(),
              updatedAt: now(),
            } as Item;
            planEdit(s, ws.programId, () => s.items.push(item));
            s.audit.push({ id: newId(s, 'aud'), programId: ws.programId, at: now(), actorId: s.currentPersonId, action: 'item.created', targetId: item.id });
            return item;
          },
          (item) => programEvents(item.programId, [item.id]),
        ),
      move: (id, to) =>
        write(
          (s) => {
            const item = findItem(s, id);
            if (!can(actorIn(s, item.programId), 'item.edit', item)) throw new ForbiddenError(`item.edit on ${id}`);
            if (to.parentId) {
              let p: string | undefined = to.parentId;
              while (p) {
                if (p === id) throw new ValidationError('An item cannot be moved under itself');
                p = s.items.find((x) => x.id === p)?.parentId;
              }
            }
            planEdit(s, item.programId, () => {
              if (to.parentId) item.parentId = to.parentId;
              else delete item.parentId;
              Object.assign(item, { workstreamId: to.workstreamId, order: to.order, updatedAt: now() });
            });
            return item;
          },
          (item) => programEvents(item.programId, [item.id]),
        ).then(() => undefined),
      remove: (id) =>
        write(
          (s) => {
            const item = findItem(s, id);
            if (!can(actorIn(s, item.programId), 'item.edit', item)) throw new ForbiddenError(`item.edit on ${id}`);
            if (s.items.some((x) => x.parentId === id)) throw new ValidationError('Remove or move the child items first');
            planEdit(s, item.programId, () => {
              s.items = s.items.filter((x) => x.id !== id);
              s.relations = s.relations.filter((r) => r.fromId !== id && r.toId !== id);
            });
            s.audit.push({ id: newId(s, 'aud'), programId: item.programId, at: now(), actorId: s.currentPersonId, action: 'item.removed', targetId: id, before: item });
            return item;
          },
          (item) => programEvents(item.programId, [item.id]),
        ).then(() => undefined),
      follow: (id, on) =>
        write((s) => {
          const item = findItem(s, id);
          item.followerIds = on ? [...new Set([...item.followerIds, s.currentPersonId])] : item.followerIds.filter((p) => p !== s.currentPersonId);
        }),
    }),

    relations: planned<KeelApi['relations']>('relations', 4, {
      list: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.relations.filter((r) => r.programId === programId);
        }),
      add: (r) =>
        write(
          (s) => {
            requireProgram(s, r.programId, 'relation.edit');
            if (r.kind === 'FS' || r.kind === 'SS') {
              const edges = s.relations.filter((x) => x.programId === r.programId && (x.kind === 'FS' || x.kind === 'SS')).map((x) => ({ from: x.fromId, to: x.toId }));
              const cycle = wouldCreateCycle(edges, r.fromId, r.toId);
              if (cycle) throw new CycleError(cycle.map((id) => s.items.find((i) => i.id === id)?.title ?? id));
              if (s.relations.some((x) => x.fromId === r.fromId && x.toId === r.toId && x.kind === r.kind)) throw new ValidationError('That dependency already exists');
            }
            const rel = { ...r, id: newId(s, 'rel') };
            planEdit(s, r.programId, () => s.relations.push(rel));
            return rel;
          },
          (rel) => programEvents(rel.programId, [rel.fromId, rel.toId]),
        ),
      update: (id, patch) =>
        write(
          (s) => {
            const rel = s.relations.find((x) => x.id === id);
            if (!rel) throw new NotFoundError(`relation ${id}`);
            requireProgram(s, rel.programId, 'relation.edit');
            planEdit(s, rel.programId, () => Object.assign(rel, patch));
            return rel;
          },
          (rel) => programEvents(rel.programId, [rel.fromId, rel.toId]),
        ),
      remove: (id) =>
        write(
          (s) => {
            const rel = s.relations.find((x) => x.id === id);
            if (!rel) throw new NotFoundError(`relation ${id}`);
            requireProgram(s, rel.programId, 'relation.edit');
            planEdit(s, rel.programId, () => (s.relations = s.relations.filter((x) => x.id !== id)));
            return rel;
          },
          (rel) => programEvents(rel.programId, [rel.fromId, rel.toId]),
        ).then(() => undefined),
    }),

    schedule: planned<KeelApi['schedule']>('schedule', 4, {
      get: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return toView(compute(s, programId));
        }),
      workload: (programId, weeks) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          const c = compute(s, programId);
          return computeWorkload(c.plan, c.result, weeks);
        }),
      baselines: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.baselines.filter((b) => b.programId === programId);
        }),
      setBaseline: (programId, name, reason) =>
        write(
          (s) => {
            requireProgram(s, programId, 'baseline.set');
            return rebaseline(s, compute, programId, name, s.currentPersonId, reason ?? 'Set by PM');
          },
          () => programEvents(programId),
        ),
    }),

    cost: planned<KeelApi['cost']>('cost', 4, {
      entries: (programId, q) =>
        read((s) => {
          requireProgram(s, programId, 'budget.view');
          return s.costEntries.filter((c) => c.programId === programId && (!q?.workstreamId || c.workstreamId === q.workstreamId) && (!q?.kind || c.kind === q.kind));
        }),
      evm: (programId, asOf) =>
        read((s) => {
          requireProgram(s, programId, 'budget.view');
          const c = compute(s, programId);
          return computeEvm(c.plan, c.result, asOf ?? s.today);
        }),
      evmTrend: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'budget.view');
          const c = compute(s, programId);
          return [-12, -10, -8, -6, -4, -2, 0].map((w) => {
            const date = addDays(s.today, w * 7);
            const e = computeEvm(c.plan, c.result, date).program;
            return { date, cpi: e.cpi ?? 1, spi: e.spi ?? 1 };
          });
        }),
    }),

    conversation: planned<KeelApi['conversation']>('conversation', 3, {
      channels: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return actorIn(s, programId)?.role === 'guest' ? [] : s.channels.filter((c) => c.programId === programId);
        }),
      promote: (messageId, draft) =>
        write(
          (s) => promoteNow(s, messageId, draft),
          (item) => [{ type: 'item.changed', programId: item.programId, itemIds: [item.id] }],
        ),
      messages: (container, q) =>
        read((s) => {
          if (container.kind === 'item') {
            const item = findItem(s, container.id);
            if (!canSee(s, item)) throw new ForbiddenError(`item.view on ${container.id}`);
          } else {
            const ch = s.channels.find((c) => c.id === container.id);
            if (!ch) throw new NotFoundError(`channel ${container.id}`);
            if (actorIn(s, ch.programId)?.role === 'guest' || !actorIn(s, ch.programId)) throw new ForbiddenError('channel.view');
          }
          const list = s.messages
            .filter((m) => m.container.kind === container.kind && m.container.id === container.id && canSeeMessage(s, m) && (!q?.before || m.createdAt < q.before))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return q?.limit ? list.slice(-q.limit) : list;
        }),
      post: (container, body, o) =>
        write(
          (s) => {
            const programId = container.kind === 'item' ? findItem(s, container.id).programId : s.channels.find((c) => c.id === container.id)?.programId;
            if (!programId) throw new NotFoundError(`container ${container.id}`);
            if (container.kind === 'item' && !canSee(s, findItem(s, container.id))) throw new ForbiddenError('item.view');
            if (!body.trim()) throw new ValidationError('Message is empty');
            const author = me(s);
            const m: Message = {
              id: newId(s, 'msg'),
              programId,
              container,
              ...(o?.parentId ? { parentId: o.parentId } : {}),
              source: o?.asEmailTo?.length ? 'email' : 'keel',
              authorId: author.id,
              body,
              ...(o?.asEmailTo?.length ? { email: { from: author.email, to: o.asEmailTo, cc: [], subject: 'Re: update', mailMessageId: newId(s, 'mid') } } : {}),
              mentions: [],
              createdAt: now(),
              visibility: 'members',
            };
            s.messages.push(m);
            return m;
          },
          (m) => [{ type: 'message.posted', message: m }],
        ),
    }),

    mail: planned<KeelApi['mail']>('mail', 5, {
      inbox: (q) => read((s) => s.mail.filter((m) => m.ownerId === s.currentPersonId && (!q?.state || m.state === q.state)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))),
      file: (mailId, itemId, share) =>
        write(
          (s) => {
            const mail = s.mail.find((m) => m.id === mailId && m.ownerId === s.currentPersonId);
            if (!mail) throw new NotFoundError(`mail ${mailId}`);
            const item = findItem(s, itemId);
            if (!canSee(s, item)) throw new ForbiddenError('item.view');
            const m: Message = {
              id: newId(s, 'msg'),
              programId: item.programId,
              container: { kind: 'item', id: itemId },
              source: 'email',
              authorId: s.people.find((p) => p.email === mail.from)?.id,
              body: mail.body,
              email: { from: mail.from, to: mail.to, cc: mail.cc, subject: mail.subject, mailMessageId: mail.id },
              mentions: [],
              createdAt: mail.receivedAt,
              visibility: share ? 'members' : 'pm_only',
            };
            s.messages.push(m);
            mail.state = share ? 'filed_shared' : 'filed_private';
            mail.filedMessageId = m.id;
            s.audit.push({ id: newId(s, 'aud'), programId: item.programId, at: now(), actorId: s.currentPersonId, action: share ? 'mail.filed_shared' : 'mail.filed_private', targetId: itemId });
            return m;
          },
          (m) => [{ type: 'message.posted', message: m }],
        ),
      dismiss: (mailId) =>
        write((s) => {
          const mail = s.mail.find((m) => m.id === mailId && m.ownerId === s.currentPersonId);
          if (!mail) throw new NotFoundError(`mail ${mailId}`);
          mail.state = 'dismissed';
        }),
      rules: () => read((s) => s.mailRules.filter((r) => r.ownerId === s.currentPersonId)),
    }),

    checkins: planned<KeelApi['checkins']>('checkins', 4, {
      rounds: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.checkinRounds.filter((r) => r.programId === programId);
        }),
      answer: (roundId, itemId, answer) =>
        write(
          (s) => {
            const round = s.checkinRounds.find((r) => r.id === roundId);
            const req = round?.requests.find((q) => q.itemId === itemId);
            if (!round || !req) throw new NotFoundError(`check-in ${roundId}/${itemId}`);
            if (req.personId !== s.currentPersonId) throw new ForbiddenError('Only the owner answers a check-in');
            return answerCheckinNow(s, round.programId, itemId, req.personId, answer, 'keel');
          },
          ({ round, message }) => [{ type: 'checkin.answered', roundId: round.id, itemId }, { type: 'message.posted', message }, ...programEvents(round.programId, [itemId])],
        ).then(() => undefined),
    }),

    proposals: {
      list: (programId, q) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.proposals.filter((p) => p.programId === programId && (!q?.state || p.state === q.state)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }),
      get: (id) =>
        read((s) => {
          const p = s.proposals.find((x) => x.id === id);
          if (!p) throw new NotFoundError(`proposal ${id}`);
          requireProgram(s, p.programId, 'program.view');
          return p;
        }),
      preview: (programId, changes) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return previewImpact(s, compute, programId, changes).impact;
        }),
      create: (p) =>
        write(
          (s) => {
            requireProgram(s, p.programId, 'program.view');
            return createProposalNow(s, p);
          },
          (p) => [{ type: 'proposal.created', proposal: p }],
        ),
      approve: (id, edited) =>
        write(
          (s) => {
            const p = s.proposals.find((x) => x.id === id);
            if (!p) throw new NotFoundError(`proposal ${id}`);
            requireProgram(s, p.programId, 'proposal.decide');
            if (p.state !== 'pending') throw new ValidationError(`Proposal is already ${p.state}`);
            const changes = edited ?? p.changes;
            const summary = edited ? previewImpact(s, compute, p.programId, changes).summary : p.summary;
            applyToState(s, compute, p.programId, changes, {
              actorId: s.currentPersonId,
              cause: 'approved proposal',
              proposalId: p.id,
              sourceContainers: sourceContainers(s, p),
              summary,
            });
            Object.assign(p, { state: edited ? 'edited_approved' : 'approved', decidedById: s.currentPersonId, decidedAt: now(), ...(edited ? { changes, summary } : {}) });
            if (p.optionGroup) {
              for (const alt of s.proposals.filter((x) => x.optionGroup === p.optionGroup && x.id !== p.id && x.state === 'pending')) {
                Object.assign(alt, { state: 'superseded', decidedById: s.currentPersonId, decidedAt: now() });
              }
            }
            // Other pending proposals' impacts are now stale: recompute them.
            for (const other of s.proposals.filter((x) => x.programId === p.programId && x.state === 'pending')) {
              try {
                const fresh = previewImpact(s, compute, other.programId, other.changes);
                other.impact = fresh.impact;
                other.summary = fresh.summary;
              } catch {
                other.state = 'superseded';
              }
            }
            return p;
          },
          (p) => [{ type: 'proposal.decided', proposal: p }, ...programEvents(p.programId)],
        ).then(() => undefined),
      reject: (id) =>
        write(
          (s) => {
            const p = s.proposals.find((x) => x.id === id);
            if (!p) throw new NotFoundError(`proposal ${id}`);
            requireProgram(s, p.programId, 'proposal.decide');
            Object.assign(p, { state: 'rejected', decidedById: s.currentPersonId, decidedAt: now() });
            return p;
          },
          (p) => [{ type: 'proposal.decided', proposal: p }],
        ).then(() => undefined),
    },

    changeRequests: planned<KeelApi['changeRequests']>('changeRequests', 4, {
      decide: (id, decision, note) =>
        write(
          (s) => {
            const cr = findItem(s, id);
            if (cr.type !== 'change') throw new ValidationError('Not a change request');
            requireProgram(s, cr.programId, 'changeRequest.decide', cr);
            if (cr.state !== 'submitted') throw new ValidationError(`Change request is ${cr.state}`);
            cr.approvals = [...cr.approvals.filter((a) => a.personId !== s.currentPersonId), { personId: s.currentPersonId, decision, at: now(), ...(note ? { note } : {}) }];
            if (decision === 'reject') {
              cr.state = 'rejected';
              cr.status = 'cancelled';
            } else if (cr.approverIds.every((a) => cr.approvals.some((x) => x.personId === a && x.decision === 'approve'))) {
              const summary = previewImpact(s, compute, cr.programId, cr.changes).summary;
              applyToState(s, compute, cr.programId, cr.changes, {
                actorId: s.currentPersonId,
                cause: cr.title.split(' · ')[0] ?? 'change request',
                changeRequestId: cr.id,
                sourceContainers: [{ kind: 'item', id: cr.id }],
                summary,
              });
              const fresh = findItem(s, id) as ChangeRequest;
              fresh.state = 'applied';
              fresh.status = 'done';
              fresh.approvals = cr.approvals;
              rebaseline(s, compute, cr.programId, `${cr.title.split(' · ')[0]} rebaseline`, s.currentPersonId, cr.title, cr.id);
              s.digest.push({ id: newId(s, 'dig'), programId: cr.programId, at: now(), group: 'decision', text: `${cr.title} approved; baseline updated`, itemIds: [cr.id], sourceIds: [cr.id] });
              return fresh;
            }
            s.rev += 1;
            return cr;
          },
          (cr) => programEvents(cr.programId, [cr.id]),
        ),
    }),

    reports: planned<KeelApi['reports']>('reports', 5, {
      list: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.reports.filter((r) => r.programId === programId).sort((a, b) => b.version - a.version);
        }),
      draft: (programId, period) =>
        write(
          (s) => {
            requireProgram(s, programId, 'program.view');
            const c = compute(s, programId);
            const sections = draftReport({
              plan: c.plan,
              result: c.result,
              rag: c.rag,
              period,
              proposals: s.proposals.filter((p) => p.programId === programId),
              digest: s.digest.filter((d) => d.programId === programId),
            });
            const published = s.reports.filter((r) => r.programId === programId && r.state === 'published');
            const existing = s.reports.find((r) => r.programId === programId && r.state === 'draft');
            const report: StatusReport = existing ?? { id: newId(s, 'rpt'), programId, periodStart: period.start, periodEnd: period.end, state: 'draft', version: published.length + 1, sections: [] };
            Object.assign(report, { periodStart: period.start, periodEnd: period.end, sections });
            if (!existing) s.reports.push(report);
            return report;
          },
          (r) => [{ type: 'report.changed', programId: r.programId, reportId: r.id }],
        ),
      update: (id, sections) =>
        write(
          (s) => {
            const r = s.reports.find((x) => x.id === id);
            if (!r) throw new NotFoundError(`report ${id}`);
            if (r.state !== 'draft') throw new ValidationError('Published reports are read-only');
            requireProgram(s, r.programId, 'program.view');
            r.sections = sections;
            return r;
          },
          (r) => [{ type: 'report.changed', programId: r.programId, reportId: r.id }],
        ),
      publish: (id) =>
        write(
          (s) => {
            const r = s.reports.find((x) => x.id === id);
            if (!r) throw new NotFoundError(`report ${id}`);
            requireProgram(s, r.programId, 'report.publish');
            Object.assign(r, { state: 'published', publishedAt: now(), publishedById: s.currentPersonId });
            return r;
          },
          (r) => [{ type: 'report.changed', programId: r.programId, reportId: r.id }],
        ),
    }),

    notifications: {
      inbox: () => read((s) => s.notifications.filter((n) => n.personId === s.currentPersonId).sort((a, b) => b.at.localeCompare(a.at))),
      markRead: (ids) =>
        write((s) => {
          for (const n of s.notifications) if (ids.includes(n.id) && n.personId === s.currentPersonId) n.read = true;
        }),
      digest: (programId, since) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.digest.filter((d) => d.programId === programId && d.at >= since).sort((a, b) => b.at.localeCompare(a.at));
        }),
    },

    audit: {
      list: (programId, q) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.audit.filter((a) => a.programId === programId && (!q?.targetId || a.targetId === q.targetId));
        }),
    },

    demo: {
      scenarios: () => read(() => scenarios.list()),
      run: async (scenarioId, o) => {
        await wait();
        scenarios.run(scenarioId, o?.speed);
      },
      stop: async () => {
        await wait();
        scenarios.stop();
      },
      reset: () =>
        write(
          (s) => {
            scenarios.stop();
            const persona = s.currentPersonId;
            state = seed();
            // Keep the viewer's persona across a reset; it's a viewing choice, not data.
            if (state.people.some((p) => p.id === persona)) state.currentPersonId = persona;
          },
          () => [{ type: 'demo.reset' }],
        ),
    },

    events: { subscribe: (handler) => bus.subscribe(handler) },

    // Later phases — see docs/build-plan.md
    agile: planned<KeelApi['agile']>('agile', 4, {
      sprints: (workstreamId) => read((s) => s.sprints.filter((sp) => sp.workstreamId === workstreamId).sort((a, b) => a.start.localeCompare(b.start))),
      backlog: (workstreamId) =>
        read((s) => {
          const active = new Set(s.sprints.filter((sp) => sp.state !== 'closed').map((sp) => sp.id));
          return s.items.filter((i): i is Task => i.type === 'task' && i.workstreamId === workstreamId && i.storyPoints !== undefined && i.status !== 'done' && i.status !== 'cancelled' && !(i.sprintId && active.has(i.sprintId)));
        }),
      projection: (workstreamId) =>
        read((s) => {
          const ws = s.workstreams.find((w) => w.id === workstreamId);
          if (!ws) throw new NotFoundError(`workstream ${workstreamId}`);
          const a = compute(s, ws.programId).result.agile.get(workstreamId);
          return { projectedFinish: a?.projectedFinish ?? '', avgVelocity: a?.velocity ?? 0 };
        }),
      closeSprint: (sprintId) =>
        write(
          (s) => {
            const sp = s.sprints.find((x) => x.id === sprintId);
            const ws = s.workstreams.find((w) => w.id === sp?.workstreamId);
            if (!sp || !ws) throw new NotFoundError(`sprint ${sprintId}`);
            if (!can(actorIn(s, ws.programId), 'item.edit', { workstreamId: ws.id, ownerId: undefined, sharedWithGuestIds: [] })) throw new ForbiddenError('sprint.close');
            return { ...closeSprintNow(s, sprintId).sprint, programId: ws.programId };
          },
          (r) => [{ type: 'sprint.changed', sprintId: r.id }, ...programEvents(r.programId)],
        ),
    }),
    documents: planned<KeelApi['documents']>('documents', 5, {
      list: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          const guest = actorIn(s, programId)?.role === 'guest';
          return s.documents.filter((d) => d.programId === programId && (!guest || d.sharedWithGuestIds.includes(s.currentPersonId)));
        }),
      get: (id) => read((s) => findDoc(s, id)),
      updateSection: (id, sectionId, patch) =>
        write(
          (s) => {
            const d = findDoc(s, id);
            requireProgram(s, d.programId, 'document.edit');
            const sec = d.sections.find((x) => x.id === sectionId);
            if (!sec) throw new NotFoundError(`section ${sectionId}`);
            if (sec.kind !== 'narrative') throw new ValidationError('Live sections update themselves from the plan');
            if (d.state === 'approved') Object.assign(d, { version: d.version + 1, state: 'draft', approvals: [] });
            if (d.state === 'in_review') Object.assign(d, { state: 'draft', approvals: [] });
            Object.assign(sec, patch);
            d.updatedAt = now();
            return d;
          },
          (d) => [{ type: 'document.changed', programId: d.programId, documentId: d.id }],
        ),
      submit: (id) =>
        write(
          (s) => {
            const d = findDoc(s, id);
            requireProgram(s, d.programId, 'document.edit');
            if (d.state === 'in_review') throw new ValidationError('Already in review');
            if (d.state === 'approved') d.version += 1;
            Object.assign(d, { state: 'in_review', approvals: [], updatedAt: now() });
            const ntfs = notify(s, d.approverIds.filter((a) => a !== s.currentPersonId), 'approval_needed', d.id);
            queueMicrotask(() => ntfs.forEach((n) => bus.emit({ type: 'notification', notification: n })));
            return d;
          },
          (d) => [{ type: 'document.changed', programId: d.programId, documentId: d.id }],
        ),
      decide: (id, decision, note) =>
        write(
          (s) => {
            const d = findDoc(s, id);
            requireProgram(s, d.programId, 'document.approve', d);
            if (d.state !== 'in_review') throw new ValidationError('The document is not in review');
            d.approvals = [...d.approvals.filter((a) => a.personId !== s.currentPersonId), { personId: s.currentPersonId, decision, at: now(), ...(note ? { note } : {}) }];
            if (decision === 'reject') d.state = 'draft';
            else if (d.approverIds.every((a) => d.approvals.some((x) => x.personId === a && x.decision === 'approve'))) {
              const ctx = docContext(s, compute(s, d.programId));
              s.documentVersions.push(freezeVersion(d, ctx, newId(s, 'dver'), now()));
              Object.assign(d, { state: 'approved', approvedVersion: d.version });
              delete d.driftAcknowledged;
              s.digest.push({ id: newId(s, 'dig'), programId: d.programId, at: now(), group: 'decision', text: `${d.title} v${d.version} approved`, itemIds: [], sourceIds: [d.id] });
            }
            d.updatedAt = now();
            return d;
          },
          (d) => [{ type: 'document.changed', programId: d.programId, documentId: d.id }],
        ),
      versions: (id) => read((s) => (findDoc(s, id), s.documentVersions.filter((v) => v.documentId === id).sort((a, b) => b.version - a.version))),
      render: (id, version) =>
        read((s) => {
          const d = findDoc(s, id);
          if (version === undefined) return renderDocument(d, docContext(s, compute(s, d.programId)));
          const v = s.documentVersions.find((x) => x.documentId === id && x.version === version);
          if (!v) throw new NotFoundError(`version ${version}`);
          return { documentId: id, version, sections: v.sections.map((x) => ({ id: x.id, title: x.title, kind: x.kind, ...(x.body !== undefined ? { body: x.body } : {}), ...(x.rendered ? { data: x.rendered as never } : {}) })) };
        }),
      drift: (id) => read((s) => driftOf(s, findDoc(s, id))),
      acknowledgeDrift: (id, note) =>
        write(
          (s) => {
            const d = findDoc(s, id);
            requireProgram(s, d.programId, 'document.edit');
            d.driftAcknowledged = { version: d.approvedVersion ?? d.version, at: now(), byId: s.currentPersonId, ...(note ? { note } : {}) };
            return d;
          },
          (d) => [{ type: 'document.changed', programId: d.programId, documentId: d.id }],
        ),
      requirements: (programId) => read((s) => (requireProgram(s, programId, 'program.view'), s.requirements.filter((r) => r.programId === programId))),
      raci: (id) =>
        read((s) => {
          const d = findDoc(s, id);
          return deriveRaci(docContext(s, compute(s, d.programId)), d.id);
        }),
      setRaci: (o) =>
        write(
          (s) => {
            const d = findDoc(s, o.documentId);
            requireProgram(s, d.programId, 'document.edit');
            s.raciOverrides = [...s.raciOverrides.filter((x) => !(x.documentId === o.documentId && x.itemId === o.itemId && x.personId === o.personId)), o];
            return d;
          },
          (d) => [{ type: 'document.changed', programId: d.programId, documentId: d.id }],
        ).then(() => undefined),
      stakeholders: (programId) =>
        read((s) => (requireProgram(s, programId, 'program.view'), { stakeholders: s.stakeholders.filter((x) => x.programId === programId), comms: s.comms.filter((x) => x.programId === programId) })),
      attention: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          const role = actorIn(s, programId)?.role;
          const out: DocAttention[] = [];
          for (const d of s.documents.filter((x) => x.programId === programId)) {
            if (d.state === 'in_review' && d.approverIds.includes(s.currentPersonId) && !d.approvals.some((a) => a.personId === s.currentPersonId)) {
              out.push({ kind: 'review', documentId: d.id, title: d.title, detail: [`v${d.version} is waiting for your approval`] });
            }
            if ((role === 'pm' || role === 'lead') && d.state === 'approved' && d.driftAcknowledged?.version !== d.approvedVersion) {
              const dr = driftOf(s, d);
              if (dr.material) out.push({ kind: 'drift', documentId: d.id, title: d.title, detail: dr.summary });
            }
          }
          const horizon = addCalendarDays(s.today, 7);
          for (const c of s.comms.filter((x) => x.programId === programId && x.ownerId === s.currentPersonId && x.nextDue && x.nextDue <= horizon)) {
            const plan = s.documents.find((d) => d.programId === programId && d.kind === 'stakeholders');
            out.push({ kind: 'comms_due', documentId: plan?.id ?? '', title: c.message, detail: [c.audience], due: c.nextDue });
          }
          return out;
        }),
    }),
    ai: planned<KeelApi['ai']>('ai', 5, {
      suggestPromotion: (messageId) =>
        read((s) => {
          const m = s.messages.find((x) => x.id === messageId);
          if (!m) throw new NotFoundError(`message ${messageId}`);
          const hint = s.promotionHints[messageId];
          if (hint) return hint;
          const ch = m.container.kind === 'channel' ? s.channels.find((c) => c.id === m.container.id) : undefined;
          const ws = ch?.workstreamId ?? s.workstreams.find((w) => w.programId === m.programId)!.id;
          return suggestPromotion(m, ws);
        }),
    }),
    connectors: planned('connectors', 5),
    io: planned('io', 5),

    _snapshot: () => structuredClone(state),
  };

  return api;
}

