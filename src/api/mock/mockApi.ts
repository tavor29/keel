import { createSeedState } from '@/data/seed';
import { actorFrom, can, type Action, type Actor } from '@/domain/permissions';
import type { Program } from '@/domain/types';
import type { KeelApi, KeelEvent } from '../contract';
import { ForbiddenError, NotFoundError, NotImplementedError } from '../errors';
import { createEventBus } from './eventBus';
import { browserStore, clearOldVersions, loadState, saveState, type KeyValueStore } from './persistence';
import { SCHEMA_VERSION, type MockState } from './state';

export interface MockApiOptions {
  /** Where state persists. Defaults to localStorage when available. Pass `null` for no persistence. */
  store?: KeyValueStore | null;
  /** Simulated network latency in ms. Defaults to 80–250; use { min: 0, max: 0 } in tests. */
  latency?: { min: number; max: number };
  /** Seed factory (tests can inject smaller seeds). */
  seed?: () => MockState;
}

export interface MockKeelApi extends KeelApi {
  /** Test/debug hook: a deep copy of the current state. */
  _snapshot(): MockState;
}

/**
 * Builds a namespace whose every method rejects with NotImplementedError.
 * Used for contract areas scheduled for later phases (docs/build-plan.md).
 */
function planned<T extends object>(ns: string, phase: number): T {
  return new Proxy({} as T, {
    get: (_t, prop) =>
      // 'then' must stay undefined, or the namespace would look like a Promise to `await`.
      typeof prop === 'string' && prop !== 'then' ? () => Promise.reject(new NotImplementedError(`${ns}.${prop}`, phase)) : undefined,
  });
}

export function createMockApi(opts: MockApiOptions = {}): MockKeelApi {
  const store = opts.store === null ? undefined : (opts.store ?? browserStore());
  const latency = opts.latency ?? { min: 80, max: 250 };
  const seed = opts.seed ?? createSeedState;
  const bus = createEventBus<KeelEvent>();

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

  /**
   * The single write path (docs/mock-api.md → "Write pipeline"). Phase 0 covers
   * mutate → persist → emit. Scheduling, audit and digest steps plug in from phase 1.
   */
  async function write<T>(fn: (s: MockState) => T, events: (result: T) => KeelEvent[] = () => []): Promise<T> {
    await wait();
    const result = fn(state);
    saveState(store, SCHEMA_VERSION, state);
    for (const e of events(result)) bus.emit(e);
    return structuredClone(result);
  }

  const me = (s: MockState) => {
    const person = s.people.find((p) => p.id === s.currentPersonId);
    if (!person) throw new NotFoundError(`persona ${s.currentPersonId}`);
    return person;
  };

  const actorIn = (s: MockState, programId: string): Actor | undefined =>
    actorFrom(s.memberships.find((m) => m.programId === programId && m.personId === s.currentPersonId));

  const requireProgram = (s: MockState, programId: string, action: Action): Program => {
    const program = s.programs.find((p) => p.id === programId);
    if (!program) throw new NotFoundError(`program ${programId}`);
    if (!can(actorIn(s, programId), action)) throw new ForbiddenError(`${action} on ${programId}`);
    return program;
  };

  const api: MockKeelApi = {
    session: {
      me: () => read((s) => ({ person: me(s), memberships: s.memberships.filter((m) => m.personId === s.currentPersonId) })),
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
          return program;
        }),
    },

    notifications: {
      inbox: () => read((s) => s.notifications.filter((n) => n.personId === s.currentPersonId)),
      markRead: (ids) =>
        write((s) => {
          for (const n of s.notifications) if (ids.includes(n.id) && n.personId === s.currentPersonId) n.read = true;
        }),
      digest: () => read(() => []),
    },

    audit: {
      list: (programId, q) =>
        read((s) => {
          requireProgram(s, programId, 'program.view');
          return s.audit.filter((a) => a.programId === programId && (!q?.targetId || a.targetId === q.targetId));
        }),
    },

    demo: {
      scenarios: () => read(() => []),
      run: (scenarioId) => Promise.reject(new NotImplementedError(`demo.run(${scenarioId})`, 2)),
      stop: () => read(() => undefined),
      reset: () =>
        write(
          (s) => {
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
    items: planned('items', 2),
    relations: planned('relations', 2),
    schedule: planned('schedule', 2),
    proposals: planned('proposals', 2),
    changeRequests: planned('changeRequests', 2),
    reports: planned('reports', 2),
    mail: planned('mail', 2),
    checkins: planned('checkins', 2),
    conversation: planned('conversation', 2),
    agile: planned('agile', 3),
    cost: planned('cost', 4),
    documents: planned('documents', 4),
    ai: planned('ai', 5),
    connectors: planned('connectors', 5),
    io: planned('io', 5),

    _snapshot: () => structuredClone(state),
  };

  return api;
}
