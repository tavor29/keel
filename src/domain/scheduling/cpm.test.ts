import { describe, expect, it } from 'vitest';
import { CycleError, ValidationError } from '../errors';
import { runCpm, wouldCreateCycle, type CpmEdge, type CpmNode } from './cpm';

const n = (id: string, duration: number, extra: Partial<CpmNode> = {}): CpmNode => ({ id, duration, ...extra });
const fs = (from: string, to: string, lag = 0): CpmEdge => ({ from, to, kind: 'FS', lag });
const ss = (from: string, to: string, lag = 0): CpmEdge => ({ from, to, kind: 'SS', lag });

describe('runCpm forward pass', () => {
  it('chains FS dependencies', () => {
    const r = runCpm([n('a', 4), n('b', 6), n('c', 0)], [fs('a', 'b'), fs('b', 'c')]);
    expect(r.times.get('b')).toMatchObject({ es: 4, ef: 10 });
    expect(r.times.get('c')).toMatchObject({ es: 10, ef: 10 });
    expect(r.projectFinish).toBe(10);
  });

  it('applies positive and negative lag', () => {
    const r = runCpm([n('a', 10), n('b', 4), n('c', 4)], [fs('a', 'b', 2), fs('a', 'c', -4)]);
    expect(r.times.get('b')!.es).toBe(12);
    expect(r.times.get('c')!.es).toBe(6);
  });

  it('applies SS with lag', () => {
    const r = runCpm([n('a', 20), n('b', 4)], [ss('a', 'b', 6)]);
    expect(r.times.get('b')!.es).toBe(6);
  });

  it('takes the max of multiple predecessors', () => {
    const r = runCpm([n('a', 4), n('b', 10), n('c', 2)], [fs('a', 'c'), fs('b', 'c')]);
    expect(r.times.get('c')!.es).toBe(10);
  });

  it('respects start-no-earlier-than and the origin', () => {
    const r = runCpm([n('a', 2, { earliest: 8 }), n('b', 2, { earliest: -6 })], []);
    expect(r.times.get('a')!.es).toBe(8);
    expect(r.times.get('b')!.es).toBe(0);
  });

  it('lets a fixed start override dependencies and warns when it violates them', () => {
    const r = runCpm([n('a', 10), n('b', 2, { fixedStart: 6 }), n('c', 2, { fixedStart: 20 })], [fs('a', 'b'), fs('a', 'c')]);
    expect(r.times.get('b')!.es).toBe(6);
    expect(r.times.get('c')!.es).toBe(20);
    expect(r.warnings).toEqual([{ kind: 'fixed_violates_dependency', nodeId: 'b', bySlots: 4 }]);
  });
});

describe('runCpm backward pass and float', () => {
  it('computes float on parallel paths and marks the critical path', () => {
    // a(4) → c(4); b(10) → c. Path through b is critical, a has 6 float.
    const r = runCpm([n('a', 4), n('b', 10), n('c', 4)], [fs('a', 'c'), fs('b', 'c')]);
    expect(r.times.get('a')).toMatchObject({ ls: 6, lf: 10, float: 6, critical: false });
    expect(r.times.get('b')).toMatchObject({ float: 0, critical: true });
    expect(r.times.get('c')).toMatchObject({ float: 0, critical: true });
    expect(r.criticalEdges).toEqual([fs('b', 'c')]);
  });

  it('uses the SS backward formula', () => {
    // a(20) SS+6 → b(20): b finishes at 26 = project finish; a's LS limited by b: LS(b)-6 = 0
    const r = runCpm([n('a', 20), n('b', 20)], [ss('a', 'b', 6)]);
    expect(r.projectFinish).toBe(26);
    expect(r.times.get('a')).toMatchObject({ ls: 0, lf: 20, float: 0 });
    expect(r.times.get('b')).toMatchObject({ float: 0 });
    expect(r.criticalEdges).toHaveLength(1);
  });

  it('turns a missed deadline into negative float back along the driving chain', () => {
    const r = runCpm([n('a', 10), n('b', 10), n('m', 0, { deadline: 16 }), n('x', 30)], [fs('a', 'b'), fs('b', 'm')]);
    expect(r.times.get('m')!.float).toBe(-4);
    expect(r.times.get('a')!.float).toBe(-4);
    expect(r.times.get('a')!.critical).toBe(true);
    // x drives the project finish but has no deadline: zero float, no deadline float
    expect(r.times.get('x')!.float).toBe(0);
    expect(r.times.get('x')!.deadlineFloat).toBeNull();
    expect(r.times.get('a')!.deadlineFloat).toBe(-4);
  });

  it('marks two equal-length paths both critical', () => {
    const r = runCpm([n('a', 6), n('b', 6), n('c', 0)], [fs('a', 'c'), fs('b', 'c')]);
    expect(r.times.get('a')!.critical && r.times.get('b')!.critical).toBe(true);
    expect(r.criticalEdges).toHaveLength(2);
  });
});

describe('graph checks', () => {
  it('detects cycles with the cycle path', () => {
    try {
      runCpm([n('a', 1), n('b', 1), n('c', 1), n('d', 1)], [fs('d', 'a'), fs('a', 'b'), fs('b', 'c'), fs('c', 'a')]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CycleError);
      const path = (e as CycleError).path;
      expect(path[0]).toBe(path[path.length - 1]);
      expect(new Set(path)).toEqual(new Set(['a', 'b', 'c']));
    }
  });

  it('rejects unknown nodes, duplicates and self-links', () => {
    expect(() => runCpm([n('a', 1)], [fs('a', 'zz')])).toThrow(ValidationError);
    expect(() => runCpm([n('a', 1), n('a', 2)], [])).toThrow(ValidationError);
    expect(() => runCpm([n('a', 1)], [fs('a', 'a')])).toThrow(CycleError);
  });

  it('predicts cycles before a relation is added', () => {
    const edges = [fs('a', 'b'), fs('b', 'c')];
    expect(wouldCreateCycle(edges, 'c', 'a')).toEqual(['c', 'a', 'b', 'c']);
    expect(wouldCreateCycle(edges, 'a', 'c')).toBeNull();
  });

  it('recomputes a 600-node random DAG in under 50 ms', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const nodes = Array.from({ length: 600 }, (_, i) => n(`t${i}`, 1 + Math.floor(rnd() * 20)));
    const edges: CpmEdge[] = [];
    for (let i = 1; i < 600; i++) {
      for (let k = 0; k < 2; k++) {
        const j = Math.floor(rnd() * i);
        edges.push(rnd() < 0.8 ? fs(`t${j}`, `t${i}`, Math.floor(rnd() * 4) - 1) : ss(`t${j}`, `t${i}`, 2));
      }
    }
    runCpm(nodes, edges); // warm-up
    const t0 = performance.now();
    runCpm(nodes, edges);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
