import { describe, expect, it, vi } from 'vitest';
import { LUMEN_ID, TITAN_ID } from '@/data/seed';
import type { KeelEvent } from '../contract';
import { ForbiddenError, NotFoundError, NotImplementedError } from '../errors';
import { createMockApi } from './mockApi';
import { memoryStore, stateKey } from './persistence';
import { SCHEMA_VERSION } from './state';

const fast = { latency: { min: 0, max: 0 } };

describe('mock KeelApi', () => {
  it('starts as the PM persona with both programs visible', async () => {
    const api = createMockApi({ ...fast, store: null });
    const me = await api.session.me();
    expect(me.person.name).toBe('Alex Rivera');
    expect((await api.programs.list()).map((p) => p.id)).toEqual([TITAN_ID, LUMEN_ID]);
  });

  it('enforces visibility by persona: the supplier guest only sees Titan-1', async () => {
    const api = createMockApi({ ...fast, store: null });
    await api.session.switchPersona('per_chris');
    expect((await api.programs.list()).map((p) => p.id)).toEqual([TITAN_ID]);
    await expect(api.programs.get(LUMEN_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('only lets the PM update a program', async () => {
    const api = createMockApi({ ...fast, store: null });
    await api.session.switchPersona('per_jordan');
    await expect(api.programs.update(TITAN_ID, { name: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    await api.session.switchPersona('per_alex');
    const updated = await api.programs.update(TITAN_ID, { name: 'Titan-1 (renamed)', id: 'hijack' });
    expect(updated).toMatchObject({ id: TITAN_ID, name: 'Titan-1 (renamed)' });
  });

  it('returns copies, so callers cannot mutate state', async () => {
    const api = createMockApi({ ...fast, store: null });
    const [first] = await api.programs.list();
    first!.name = 'mutated';
    expect((await api.programs.get(TITAN_ID)).name).toBe('Titan-1');
  });

  it('seeds Titan-1 with 10 workstreams totalling $250M', async () => {
    const api = createMockApi({ ...fast, store: null });
    const ws = await api.programs.workstreams(TITAN_ID);
    expect(ws).toHaveLength(10);
    expect(ws.reduce((s, w) => s + w.budgetCents, 0)).toBe(250 * 100_000_000);
    expect((await api.programs.get(TITAN_ID)).budgetCents).toBe(250 * 100_000_000);
  });

  it('persists writes and reloads them in a new instance', async () => {
    const store = memoryStore();
    const a = createMockApi({ ...fast, store });
    await a.session.switchPersona('per_priya');
    expect(store.data[stateKey(SCHEMA_VERSION)]).toBeDefined();
    const b = createMockApi({ ...fast, store });
    expect((await b.session.me()).person.id).toBe('per_priya');
  });

  it('reset reseeds data but keeps the current persona', async () => {
    const api = createMockApi({ ...fast, store: memoryStore() });
    await api.programs.update(TITAN_ID, { name: 'changed' });
    await api.session.switchPersona('per_sam');
    await api.demo.reset();
    expect((await api.programs.get(TITAN_ID)).name).toBe('Titan-1');
    expect((await api.session.me()).person.id).toBe('per_sam');
  });

  it('emits events for persona switches and resets', async () => {
    const api = createMockApi({ ...fast, store: null });
    const seen: KeelEvent[] = [];
    const off = api.events.subscribe((e) => seen.push(e));
    await api.session.switchPersona('per_sam');
    await api.demo.reset();
    off();
    await api.session.switchPersona('per_alex');
    expect(seen).toEqual([{ type: 'session.changed', personId: 'per_sam' }, { type: 'demo.reset' }]);
  });

  it('rejects unknown personas and programs', async () => {
    const api = createMockApi({ ...fast, store: null });
    await expect(api.session.switchPersona('per_nobody')).rejects.toBeInstanceOf(NotFoundError);
    await expect(api.programs.get('prg_nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('marks later-phase methods as not implemented, with their phase', async () => {
    const api = createMockApi({ ...fast, store: null });
    const err = await api.io.exportCsv(TITAN_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotImplementedError);
    expect(err).toMatchObject({ method: 'io.exportCsv', phase: 5 });
    // Namespaces must not look like Promises.
    expect((api.io as unknown as { then?: unknown }).then).toBeUndefined();
  });

  it('simulates latency by default', async () => {
    vi.useFakeTimers();
    const api = createMockApi({ store: null });
    let done = false;
    void api.programs.list().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(50);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});
