import { describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';

const until = async (check: () => Promise<boolean> | boolean, ms = 4000) => {
  const t0 = Date.now();
  while (!(await check())) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};
const P = 'prg_lumen';
const fast = { store: null, latency: { min: 0, max: 0 }, scenarioSpeed: 0 } as const;

describe('Lumen AI seed', () => {
  it('projects agile workstreams and keeps the launch on track with a little slack', async () => {
    const api = createMockApi(fast);
    const view = await api.schedule.get(P);
    const platform = view.agile['wst_lumen_platform']!;
    expect(platform.velocity).toBe(40);
    expect(platform.projectedFinish).toBeTruthy();
    const launch = view.nodes.find((n) => n.itemId === 'itm_lumen_launch')!;
    expect(launch.deadlineFloatHalfDays! / 2).toBe(6);
    expect(view.rag.items['itm_lumen_launch']).toBe('green');
    expect((await api.agile.sprints('wst_lumen_platform')).at(-1)!.state).toBe('active');
    expect((await api.agile.backlog('wst_lumen_platform')).reduce((a, t) => a + (t.storyPoints ?? 0), 0)).toBe(110);
  });

  it('Titan-1 Software Stack is sprint-run and delivers before L5 IST', async () => {
    const api = createMockApi(fast);
    const view = await api.schedule.get('prg_titan');
    const sw = view.agile['wst_titan_software']!;
    expect(sw.projectedFinish).toBeTruthy();
    const l5 = view.nodes.find((n) => n.itemId === 'itm_titan_l5')!;
    expect(sw.projectedFinish! < l5.es).toBe(true);
  });
});

describe('scenario L1 · the sprint slip', () => {
  it.each([
    ['A', 'Option A · Move Public launch 2 weeks'],
    ['B', 'Option B · Ship Eval dashboard v2 after launch'],
  ])('slips the launch, then option %s recovers it', async (_k, label) => {
    const api = createMockApi(fast);
    await api.demo.run('l1-sprint-slip');
    await until(async () => (await api.proposals.list(P, { state: 'pending' })).filter((p) => p.optionGroup).length === 2);
    const view = await api.schedule.get(P);
    expect(view.rag.items['itm_lumen_launch']).toBe('red');
    const sprint = (await api.agile.sprints('wst_lumen_platform')).find((s) => s.id === 'spr_lmp_14')!;
    expect([sprint.state, sprint.completedPoints]).toEqual(['closed', 31]);

    // Promote Sam's Slack message to a decision (AI pre-fill comes from the script)
    let slackId = '';
    await until(async () => {
      const msgs = await api.conversation.messages({ kind: 'channel', id: 'chn_lumen_platform' });
      slackId = msgs.find((m) => m.source === 'slack' && m.body.includes('eval dashboard'))?.id ?? '';
      return !!slackId;
    });
    const draft = await api.ai.suggestPromotion(slackId);
    expect(draft).toMatchObject({ type: 'decision', workstreamId: 'wst_lumen_platform' });
    const decision = await api.conversation.promote(slackId, draft);
    expect(decision.type).toBe('decision');

    const options = await api.proposals.list(P, { state: 'pending' });
    const pick = options.find((p) => p.optionLabel === label)!;
    expect(pick.impact.ragChanges).toContainEqual(expect.objectContaining({ itemId: 'itm_lumen_launch', to: 'green' }));
    await api.proposals.approve(pick.id);
    expect((await api.proposals.list(P)).filter((p) => p.optionGroup === pick.optionGroup).map((p) => p.state).sort()).toEqual(['approved', 'superseded']);
    expect((await api.schedule.get(P)).rag.items['itm_lumen_launch']).toBe('green');
    await until(async () => {
      const d = await api.items.get(decision.id);
      return d.type === 'decision' && !!d.outcome;
    });
  });
});

describe('scenario L2 · pen-test finding', () => {
  it('promotes the Teams message to an issue and adds a register risk and fix task', async () => {
    const api = createMockApi(fast);
    await api.demo.run('l2-pen-test');
    let teamsId = '';
    await until(async () => {
      const msgs = await api.conversation.messages({ kind: 'channel', id: 'chn_lumen_security' });
      teamsId = msgs.find((m) => m.source === 'teams' && m.body.includes('Pen test found'))?.id ?? '';
      return !!teamsId;
    });
    const draft = await api.ai.suggestPromotion(teamsId);
    expect(draft).toMatchObject({ type: 'issue', severity: 'critical' });
    await api.conversation.promote(teamsId, draft);
    let pid = '';
    await until(async () => {
      pid = (await api.proposals.list(P, { state: 'pending' })).find((p) => p.changes.some((c) => c.op === 'create_item'))?.id ?? '';
      return !!pid;
    });
    await api.proposals.approve(pid);
    const risks = await api.items.list(P, { types: ['risk'] });
    expect(risks.map((r) => r.title)).toContain('SOC 2 report delayed by open critical finding');
    const rels = await api.relations.list(P);
    expect(rels.some((r) => r.fromId === 'itm_lumen_fix_gateway' && r.toId === 'itm_lumen_audit_fieldwork')).toBe(true);
  });

  it('guests cannot read channels', async () => {
    const api = createMockApi(fast);
    await api.session.switchPersona('per_chris');
    await expect(api.conversation.messages({ kind: 'channel', id: 'chn_lumen_platform' })).rejects.toThrow();
  });
});
