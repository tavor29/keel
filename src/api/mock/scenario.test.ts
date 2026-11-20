import { describe, expect, it } from 'vitest';
import type { KeelEvent } from '../contract';
import { createMockApi } from './mockApi';

const until = async (check: () => Promise<boolean> | boolean, ms = 4000) => {
  const t0 = Date.now();
  while (!(await check())) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('scenario T1 · the switchgear slip (mock level)', () => {
  it('plays end to end when the viewer acts, with consistent numbers', async () => {
    const api = createMockApi({ store: null, latency: { min: 0, max: 0 }, scenarioSpeed: 0 });
    const steps: Extract<KeelEvent, { type: 'demo.step' }>[] = [];
    api.events.subscribe((e) => e.type === 'demo.step' && steps.push(e));
    const P = 'prg_titan';
    const g2 = async () => (await api.schedule.get(P)).nodes.find((n) => n.itemId === 'itm_titan_g2')!;
    const g2Before = await g2();
    expect(g2Before.deadlineFloatHalfDays).toBeGreaterThan(0);

    expect((await api.demo.scenarios()).map((s) => s.id)).toContain('t1-switchgear-slip');
    await api.demo.run('t1-switchgear-slip');

    // 1. Email arrives with a filing suggestion
    let mailId = '';
    await until(async () => {
      const m = (await api.mail.inbox({ state: 'unfiled' })).find((x) => x.subject.startsWith('PO-4471'));
      mailId = m?.id ?? '';
      return !!m;
    });
    const mail = (await api.mail.inbox()).find((m) => m.id === mailId)!;
    expect(mail.suggestion).toMatchObject({ itemId: 'itm_titan_swgr_b' });
    expect(mail.suggestion!.confidence).toBeGreaterThan(0.8);

    // 2. File & share → 3. proposal appears
    await api.mail.file(mailId, 'itm_titan_swgr_b', true);
    let proposalId = '';
    await until(async () => {
      const p = (await api.proposals.list(P, { state: 'pending' })).find((x) => x.origin === 'ai');
      proposalId = p?.id ?? '';
      return !!p;
    });
    const proposal = await api.proposals.get(proposalId);
    expect(proposal.summary).toMatch(/MV switchgear lineup B delivery \+21 days/);
    expect(proposal.impact.milestoneSlips.some((s) => s.itemId === 'itm_titan_g2' && s.days > 0)).toBe(true);
    expect(proposal.impact.ragChanges).toContainEqual(expect.objectContaining({ itemId: 'itm_titan_g2', to: 'red' }));

    // 4. Approve → schedule changes, G2 red, system message on the email's thread
    await api.proposals.approve(proposalId);
    const g2After = await g2();
    expect(g2After.deadlineFloatHalfDays!).toBeLessThan(0);
    expect((await api.schedule.get(P)).rag.items['itm_titan_g2']).toBe('red');
    const thread = await api.conversation.messages({ kind: 'item', id: 'itm_titan_swgr_b' });
    expect(thread.at(-1)!.body).toMatch(/^Applied:/);

    // 5–6. Check-in answer and CR-015 drafted
    let crId = '';
    await until(async () => {
      const cr = (await api.items.list(P, { types: ['change'] })).find((i) => i.title.startsWith('CR-015'));
      crId = cr?.id ?? '';
      return !!cr;
    });
    const install = await api.conversation.messages({ kind: 'item', id: 'itm_titan_swgr_b_inst' });
    expect(install.some((m) => m.source === 'checkin' && /recover 5 days/.test(m.body))).toBe(true);

    // PM can't approve CR-015; Jordan can
    await expect(api.changeRequests.decide(crId, 'approve')).rejects.toThrow();
    await api.session.switchPersona('per_jordan');
    expect((await api.notifications.inbox()).some((n) => n.kind === 'cr_approval' && n.targetId === crId)).toBe(true);
    await api.changeRequests.decide(crId, 'approve');
    const g2Final = await g2();
    expect(g2Final.deadlineFloatHalfDays!).toBeGreaterThan(g2After.deadlineFloatHalfDays!);
    const view = await api.schedule.get(P);
    expect(view.baselineId).not.toBe('bsl_titan_contract');
    expect((await api.schedule.baselines(P)).at(-1)!.name).toMatch(/CR-015/);
    const evm = await api.cost.evm(P);
    expect(evm.program.committedCents).toBeGreaterThan(0);

    // 9. Back to Alex, refresh the report → scenario completes
    await api.session.switchPersona('per_alex');
    const today = view.asOf;
    const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
    const report = await api.reports.draft(P, { start: today, end: weekEnd });
    const text = report.sections.flatMap((s) => s.lines.map((l) => l.text)).join('\n');
    expect(text).toMatch(/CR-015/);
    expect(text).toMatch(/G2 · Energization/);
    for (const s of report.sections) for (const l of s.lines) for (const src of l.sources) expect(src.id).toBeTruthy();
    await until(() => steps.some((s) => s.done));
    expect(steps.at(-1)!.caption).toMatch(/complete/i);

    console.log(
      `T1 numbers: G2 slack ${g2Before.deadlineFloatHalfDays! / 2}d → ${g2After.deadlineFloatHalfDays! / 2}d → ${g2Final.deadlineFloatHalfDays! / 2}d; ` +
        `G2 slip ${proposal.impact.milestoneSlips.find((s) => s.itemId === 'itm_titan_g2')!.days}d; SPI ${proposal.impact.evm?.spiFrom.toFixed(3)} → ${proposal.impact.evm?.spiTo.toFixed(3)}`,
    );
  });

  it('dates are shifted so "today" is the current week', async () => {
    const api = createMockApi({ store: null, latency: { min: 0, max: 0 } });
    const view = await api.schedule.get('prg_titan');
    const today = new Date();
    const diff = Math.abs(new Date(`${view.asOf}T00:00:00Z`).getTime() - today.getTime()) / 86_400_000;
    expect(diff).toBeLessThan(7);
  });
});
