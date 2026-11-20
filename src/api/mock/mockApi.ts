import { createSeedState } from '@/data/seed';
import { computeEvm } from '@/domain/evm';
import { addDays } from '@/domain/dates';
import { suggestFiling } from '@/domain/mailFiling';
import { actorFrom, can, type Action, type Actor, type Resource } from '@/domain/permissions';
import { draftReport } from '@/domain/report';
import type { ChangeRequest, CheckinRequest, Item, MailMessage, Message, Program, Proposal, StatusReport } from '@/domain/types';
import type { KeelApi, KeelEvent } from '../contract';
import { ForbiddenError, NotFoundError, NotImplementedError, ValidationError } from '../errors';
import { applyToState, createComputer, newId, previewImpact, rebaseline, toView } from './engine';
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
    speed: opts.scenarioSpeed ?? 1,
  };
  const scenarios = createScenarioRunner(host);

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
            Object.assign(item, rest, { updatedAt: now() });
            s.rev += 1;
            s.audit.push({ id: newId(s, 'aud'), programId: item.programId, at: now(), actorId: s.currentPersonId, action: 'item.updated', targetId: id, after: rest });
            return item;
          },
          (item) => programEvents(item.programId, [item.id]),
        ),
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
    }),

    schedule: planned<KeelApi['schedule']>('schedule', 4, {
      get: (programId) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return toView(compute(s, programId));
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
      channels: (programId) => read((s) => s.channels.filter((c) => c.programId === programId)),
      messages: (container, q) =>
        read((s) => {
          if (container.kind === 'item') {
            const item = findItem(s, container.id);
            if (!canSee(s, item)) throw new ForbiddenError(`item.view on ${container.id}`);
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
    agile: planned('agile', 3),
    documents: planned('documents', 4),
    ai: planned('ai', 5),
    connectors: planned('connectors', 5),
    io: planned('io', 5),

    _snapshot: () => structuredClone(state),
  };

  return api;
}

