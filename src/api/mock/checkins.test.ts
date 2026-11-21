import { describe, expect, it } from 'vitest';
import type { KeelEvent } from '../contract';
import { createMockApi } from './mockApi';

const until = async (check: () => Promise<boolean> | boolean, ms = 6000) => {
  const t0 = Date.now();
  while (!(await check())) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('check-ins and scenario T2', () => {
  it('only the PM sends rounds; critical-path rounds target critical owners', async () => {
    const api = createMockApi({ store: null, latency: { min: 0, max: 0 } });
    await api.session.switchPersona('per_jordan');
    await expect(api.checkins.send('prg_titan', { kind: 'critical_path' }, 'adhoc')).rejects.toThrow();
    await api.session.switchPersona('per_alex');
    const round = await api.checkins.send('prg_titan', { kind: 'critical_path' }, 'adhoc');
    expect(round.requests.length).toBeGreaterThan(0);
    const view = await api.schedule.get('prg_titan');
    for (const r of round.requests) expect(view.nodes.find((n) => n.itemId === r.itemId)?.critical).toBe(true);
  });

  it('T2: answers stream in and the exceptions become proposals', async () => {
    const api = createMockApi({ store: null, latency: { min: 0, max: 0 }, scenarioSpeed: 0 });
    const steps: Extract<KeelEvent, { type: 'demo.step' }>[] = [];
    api.events.subscribe((e) => e.type === 'demo.step' && steps.push(e));
    await api.demo.run('t2-critical-path-checkin');
    await until(() => steps.some((s) => s.waiting));
    await api.checkins.send('prg_titan', { kind: 'critical_path' }, 'adhoc');
    let props: Awaited<ReturnType<typeof api.proposals.list>> = [];
    await until(async () => {
      props = (await api.proposals.list('prg_titan', { state: 'pending' })).filter((p) => p.origin === 'checkin' && p.id !== 'prp_titan_trunks');
      return props.length >= 3;
    });
    expect(props.some((p) => p.changes[0]?.op === 'create_item')).toBe(true);
    for (const p of props) await api.proposals.reject(p.id);
    await until(() => steps.some((s) => s.done));
  });
});
