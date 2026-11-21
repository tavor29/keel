import { describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';

const P = 'prg_lumen';
const WS = 'wst_lumen_gtm';
const fast = { store: null, latency: { min: 0, max: 0 } } as const;

describe('plan editing (validated by rescheduling)', () => {
  it('builds a mini plan: create tasks, link, move, resize, remove', async () => {
    const api = createMockApi(fast);
    const a = await api.items.create({ type: 'task', title: 'Write press release', workstreamId: WS, durationHalfDays: 6 });
    const b = await api.items.create({ type: 'task', title: 'Press briefing', workstreamId: WS, durationHalfDays: 2 });
    const rel = await api.relations.add({ programId: P, kind: 'FS', fromId: a.id, toId: b.id, lagHalfDays: 2 });
    const view = await api.schedule.get(P);
    const na = view.nodes.find((n) => n.itemId === a.id)!;
    const nb = view.nodes.find((n) => n.itemId === b.id)!;
    expect(nb.es > na.ef).toBe(true);

    // Cycle rejected with the path
    await expect(api.relations.add({ programId: P, kind: 'FS', fromId: b.id, toId: a.id, lagHalfDays: 0 })).rejects.toThrow(/cycle.*Write press release/i);

    // Resize + move (SNET)
    await api.items.update(a.id, { durationHalfDays: 10 });
    await api.items.update(b.id, { snet: '2027-03-01' } as never);
    const after = (await api.schedule.get(P)).nodes.find((n) => n.itemId === b.id)!;
    expect(after.es >= '2027-03-01').toBe(true);

    // Indent b under a would make a a summary with a dependency → rejected and rolled back
    await expect(api.items.move(b.id, { parentId: a.id, workstreamId: WS, order: 1 })).rejects.toThrow(/summary/i);
    expect((await api.items.get(b.id)).parentId).toBeUndefined();

    // Remove the link, then indent works; then outdent
    await api.relations.remove(rel.id);
    await api.items.move(b.id, { parentId: a.id, workstreamId: WS, order: 1 });
    expect((await api.items.get(b.id)).parentId).toBe(a.id);
    await api.items.move(b.id, { workstreamId: WS, order: 2 });
    expect((await api.items.get(b.id)).parentId).toBeUndefined();

    await api.items.remove(b.id);
    await expect(api.items.get(b.id)).rejects.toThrow();
  });

  it('enforces edit permissions', async () => {
    const api = createMockApi(fast);
    await api.session.switchPersona('per_jordan');
    await expect(api.items.create({ type: 'task', title: 'x', workstreamId: WS })).rejects.toThrow();
    await expect(api.relations.add({ programId: P, kind: 'FS', fromId: 'itm_lumen_docs', toId: 'itm_lumen_pricing', lagHalfDays: 0 })).rejects.toThrow();
  });
});
