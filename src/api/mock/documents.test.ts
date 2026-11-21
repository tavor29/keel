import { describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';

const P = 'prg_titan';
const fast = { store: null, latency: { min: 0, max: 0 }, scenarioSpeed: 0 } as const;

describe('living documents', () => {
  it('seeds documents with frozen approved versions and no drift', async () => {
    const api = createMockApi(fast);
    const docs = await api.documents.list(P);
    expect(docs.map((d) => [d.kind, d.state])).toEqual([
      ['charter', 'approved'],
      ['brd', 'approved'],
      ['raci', 'in_review'],
      ['stakeholders', 'approved'],
    ]);
    expect((await api.documents.versions('doc_titan_charter')).map((v) => v.version)).toEqual([3, 2]);
    expect((await api.documents.drift('doc_titan_charter')).material).toBe(false);
    const live = await api.documents.render('doc_titan_charter');
    const ms = live.sections.find((s) => s.id === 'milestones')!.data;
    expect(ms?.source === 'milestones' && ms.rows.map((r) => r.title.slice(0, 2))).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5']);
  });

  it('BRD traces requirements to plan items with coverage', async () => {
    const api = createMockApi(fast);
    const r = await api.documents.render('doc_titan_brd');
    const data = r.sections.find((s) => s.id === 'requirements')!.data;
    expect(data?.source).toBe('requirements');
    if (data?.source !== 'requirements') return;
    expect(data.coverage).toEqual({ traced: 22, total: 24 });
    expect(data.rows.find((x) => x.code === 'BR-002')!.traced.map((t) => t.title)).toContain('G2 · Energization');
  });

  it('RACI derives cells from the plan and flags the row missing an A', async () => {
    const api = createMockApi(fast);
    const m = await api.documents.raci('doc_titan_raci');
    expect(m.rows).toHaveLength(6);
    expect(m.problems).toEqual([{ itemId: 'itm_titan_g4', kind: 'no_accountable' }]);
    const g2 = m.cells['itm_titan_g2']!;
    expect(g2['per_priya']?.letters).toContain('A');
    expect(Object.values(g2).some((c) => c.letters.includes('R'))).toBe(true);
  });

  it('a gate slip makes the approved charter drift; re-approval freezes v4', async () => {
    const api = createMockApi(fast);
    const swgr = await api.items.get('itm_titan_swgr_b');
    if (swgr.type !== 'procurement') throw new Error('seed');
    const later = new Date(Date.parse(`${swgr.expectedDelivery}T00:00:00Z`) + 21 * 86_400_000).toISOString().slice(0, 10);
    const p = await api.proposals.create({ programId: P, origin: 'person', rationale: 'test', sources: [], changes: [{ op: 'set_delivery', itemId: swgr.id, expectedDelivery: later }] });
    await api.proposals.approve(p.id);

    const drift = await api.documents.drift('doc_titan_charter');
    expect(drift.material).toBe(true);
    expect(drift.changedSectionIds).toContain('milestones');
    expect(drift.summary.join(' ')).toMatch(/G2 · Energization moved later/);
    expect((await api.documents.attention(P)).some((a) => a.kind === 'drift' && a.documentId === 'doc_titan_charter')).toBe(true);

    // Start re-approval → in review v4 → both approvers approve → frozen v4
    const inReview = await api.documents.submit('doc_titan_charter');
    expect([inReview.state, inReview.version]).toEqual(['in_review', 4]);
    await api.documents.decide('doc_titan_charter', 'approve');
    await api.session.switchPersona('per_jordan');
    expect((await api.documents.attention(P)).some((a) => a.kind === 'review')).toBe(true);
    const approved = await api.documents.decide('doc_titan_charter', 'approve');
    expect([approved.state, approved.approvedVersion]).toEqual(['approved', 4]);
    expect((await api.documents.drift('doc_titan_charter')).material).toBe(false);
  });

  it('editing narrative of an approved document starts a new draft version', async () => {
    const api = createMockApi(fast);
    const d = await api.documents.updateSection('doc_titan_stakeholders', 'approach', { body: 'Updated approach.' });
    expect([d.state, d.version]).toEqual(['draft', 2]);
    await expect(api.documents.updateSection('doc_titan_stakeholders', 'register', { body: 'x' })).rejects.toThrow(/Live sections/);
  });
});
