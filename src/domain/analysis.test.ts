import { describe, expect, it } from 'vitest';
import { snapshotBaseline, variance } from './baseline';
import { computeEvm, evmRag } from './evm';
import { applyChanges, computeImpact } from './impact';
import { computeRag, leafRag, rollUpRag } from './rag';
import { schedule } from './scheduling/schedule';
import { fs, gate, milestone, plan, procurement, task, workstream } from './testing';
import type { CostEntry } from './types';
import { wbsNumbers } from './wbs';

const cost = (workstreamId: string, kind: CostEntry['kind'], amountCents: number, date: string): CostEntry => ({
  id: `c_${Math.random()}`,
  programId: 'prg_t',
  workstreamId,
  kind,
  amountCents,
  date,
});

describe('baseline and variance', () => {
  it('snapshots the schedule and reports working-day variance (positive = late)', () => {
    const p = plan([task('a', 5, { budgetCents: 1000 }), task('b', 5)], [fs('a', 'b')]);
    const r0 = schedule(p);
    const bl = snapshotBaseline(p.items, r0, { id: 'bsl_1', programId: 'prg_t', name: 'Contract', createdAt: '', createdById: 'per_x' });
    expect(bl.snapshot.a).toEqual({ start: '2027-01-04', finish: '2027-01-08', budgetCents: 1000 });

    const r1 = schedule(applyChanges(p, [{ op: 'set_dates', itemId: 'a', durationHalfDays: 14 }]));
    expect(variance(r1, bl, 'a')).toEqual({ startDays: 0, finishDays: 2 });
    expect(variance(r1, bl, 'b')).toEqual({ startDays: 2, finishDays: 2 });
    expect(variance(r1, bl, 'nope')).toBeUndefined();
  });
});

describe('RAG', () => {
  it('derives leaf RAG from float, status, check-ins and overrides', () => {
    const p = plan(
      [
        task('crit', 10),
        task('slack', 2),
        task('tight', 7),
        gate('g', { deadline: '2027-01-12' }),
        task('ovr', 1, { rag: 'red' }),
        milestone('m2', { deadline: '2027-01-15' }),
      ],
      [fs('crit', 'g'), fs('tight', 'm2')],
    );
    const r = schedule(p);
    expect(leafRag(p.items[0]!, r)).toBe('red'); // drives a missed deadline
    expect(leafRag(p.items[1]!, r)).toBe('green'); // no deadline downstream
    expect(leafRag(p.items[2]!, r)).toBe('amber'); // 3 days of slack to m2's deadline
    expect(leafRag(p.items[1]!, r, { kind: 'at_risk', newDate: '2027-02-01' })).toBe('amber');
    expect(leafRag({ ...p.items[1]!, status: 'blocked' }, r)).toBe('amber');
    expect(leafRag(p.items[4]!, r)).toBe('red');
  });

  it('colours procurement by float and delay status', () => {
    const late = procurement('late', { expectedDelivery: '2027-01-20' });
    const lost = procurement('lost', { deliveryStatus: 'delayed' });
    const free = procurement('free', { expectedDelivery: '2027-01-20' });
    const p = plan([late, task('t', 2), milestone('due', { deadline: '2027-01-26' }), lost, free], [fs('late', 't'), fs('t', 'due')]);
    const r = schedule(p);
    expect(leafRag(late, r)).toBe('amber'); // 2 days of slack to the deadline
    expect(leafRag(free, r)).toBe('green'); // drives nothing with a deadline
    expect(leafRag(lost, r)).toBe('red'); // delayed with no new date
  });

  it('rolls up: worst critical child, else amber above 20% non-green', () => {
    expect(rollUpRag([{ rag: 'red', critical: true }, { rag: 'green', critical: false }])).toBe('red');
    expect(rollUpRag([{ rag: 'amber', critical: false }, ...Array(4).fill({ rag: 'green', critical: false })])).toBe('green');
    expect(rollUpRag([{ rag: 'amber', critical: false }, ...Array(3).fill({ rag: 'green', critical: false })])).toBe('amber');
    expect(rollUpRag([])).toBe('green');
  });

  it('reports items, summaries, workstreams and the program', () => {
    const p = plan(
      [task('sum', 0), task('c1', 10, { parentId: 'sum' }), milestone('m', { deadline: '2027-01-12' }), task('other', 1, { workstreamId: 'ws_b' })],
      [fs('c1', 'm')],
      { workstreams: [workstream('ws_a'), workstream('ws_b')] },
    );
    const rep = computeRag(p, schedule(p));
    expect(rep.items.get('sum')).toBe('red');
    expect(rep.workstreams.get('ws_a')).toBe('red');
    expect(rep.workstreams.get('ws_b')).toBe('green');
    expect(rep.program).toBe('red');
  });
});

describe('EVM', () => {
  it('computes PV linearly from the baseline, EV from % complete, AC up to as-of', () => {
    // 10-day task, $100k, as of end of day 5 → PV 50%; 40% done → EV $40k; AC $50k
    const p = plan([task('a', 10, { budgetCents: 10_000_000, percentComplete: 40 })], [], {
      asOf: '2027-01-08',
      costEntries: [cost('ws_a', 'actual', 5_000_000, '2027-01-07'), cost('ws_a', 'actual', 999, '2027-02-01'), cost('ws_a', 'commitment', 7_000_000, '2027-01-04')],
    });
    const r = schedule(p);
    const e = computeEvm({ ...p, baseline: snapshotBaseline(p.items, r, { id: 'b', programId: 'prg_t', name: 'b', createdAt: '', createdById: '' }) }, r).program;
    expect(e).toMatchObject({ bacCents: 10_000_000, pvCents: 5_000_000, evCents: 4_000_000, acCents: 5_000_000, committedCents: 7_000_000 });
    expect(e.cpi).toBeCloseTo(0.8);
    expect(e.spi).toBeCloseTo(0.8);
    expect(e.eacCents).toBe(12_500_000);
    expect(e.etcCents).toBe(7_500_000);
    expect(e.vacCents).toBe(-2_500_000);
  });

  it('plans procurement value at delivery and guards divide-by-zero', () => {
    const p = plan([procurement('po', { poValueCents: 500, expectedDelivery: '2027-01-20' })], [], { asOf: '2027-01-11' });
    const e = computeEvm(p, schedule(p)).program;
    expect(e.pvCents).toBe(0);
    expect(e.cpi).toBeNull();
    expect(e.spi).toBeNull();
    expect(e.eacCents).toBe(500);
    expect(computeEvm({ ...p, asOf: '2027-01-20' }, schedule(p)).program.pvCents).toBe(500);
  });

  it('maps indexes to tile colours', () => {
    expect(evmRag(1.01)).toBe('green');
    expect(evmRag(0.95)).toBe('amber');
    expect(evmRag(0.85)).toBe('red');
    expect(evmRag(null)).toBeNull();
  });
});

describe('impact', () => {
  const p = plan(
    [
      procurement('gear', { expectedDelivery: '2027-01-11' }),
      task('prep', 3),
      task('install', 5, { budgetCents: 1_000_000 }),
      gate('g2', { deadline: '2027-01-22' }),
    ],
    [fs('gear', 'install'), fs('prep', 'install'), fs('install', 'g2')],
  );

  it('previews a supplier slip: moves, slips, RAG and critical path', () => {
    // 2-week slip pushes G2 (Jan 15 → Jan 29) past its Jan 22 deadline.
    const imp = computeImpact(p, [{ op: 'set_delivery', itemId: 'gear', expectedDelivery: '2027-01-25' }]);
    expect(imp.moved.map((m) => m.itemId).sort()).toEqual(['g2', 'gear', 'install']);
    expect(imp.milestoneSlips).toEqual([{ itemId: 'g2', days: 10 }]);
    expect(imp.ragChanges).toContainEqual({ itemId: 'g2', from: 'green', to: 'red' }); // 5 days of slack → 5 days late
    expect(imp.criticalPathChanged).toBe(false);
    expect(imp.costDeltaCents).toBe(0);
  });

  it('never mutates the input plan', () => {
    const before = JSON.stringify(p);
    applyChanges(p, [{ op: 'set_dates', itemId: 'prep', durationHalfDays: 40 }, { op: 'create_item', draft: { type: 'risk', title: 'r', workstreamId: 'ws_a' } }]);
    expect(JSON.stringify(p)).toBe(before);
  });

  it('counts cost entries and budget changes in the cost delta', () => {
    const imp = computeImpact(p, [
      { op: 'cost_entry', entry: { workstreamId: 'ws_a', kind: 'commitment', amountCents: 12_000_000, date: '2027-01-05' } },
      { op: 'set_field', itemId: 'install', field: 'budgetCents', value: 1_500_000 },
    ]);
    expect(imp.costDeltaCents).toBe(12_500_000);
  });

  it('rejects invalid changes', () => {
    expect(() => applyChanges(p, [{ op: 'set_delivery', itemId: 'prep', expectedDelivery: '2027-01-01' }])).toThrow();
    expect(() => applyChanges(p, [{ op: 'set_field', itemId: 'prep', field: 'id', value: 'x' }])).toThrow();
    expect(() => applyChanges(p, [{ op: 'set_status', itemId: 'ghost', status: 'done' }])).toThrow();
  });
});

describe('WBS numbers', () => {
  it('numbers per workstream by order with nested children', () => {
    const items = [
      task('b', 1, { order: 2 }),
      task('a', 1, { order: 1 }),
      task('a1', 1, { parentId: 'a', order: 1 }),
      task('a2', 1, { parentId: 'a', order: 2 }),
      task('x', 1, { workstreamId: 'ws_b', order: 1 }),
    ];
    const w = wbsNumbers(items);
    expect(Object.fromEntries(w)).toEqual({ a: '1', a1: '1.1', a2: '1.2', b: '2', x: '1' });
  });
});
