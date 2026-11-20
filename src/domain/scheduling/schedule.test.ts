import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { deliveryNodeId } from '../plan';
import { fs, gate, milestone, plan, procurement, sprint, ss, task, workstream } from '../testing';
import { schedule } from './schedule';

describe('schedule (program level)', () => {
  it('turns slots into display dates with weekends skipped', () => {
    // Mon Jan 4: a(5d) → b(2.5d) → m
    const r = schedule(plan([task('a', 5), task('b', 2.5), milestone('m')], [fs('a', 'b'), fs('b', 'm')]));
    expect(r.nodes.get('a')).toMatchObject({ es: '2027-01-04', ef: '2027-01-08' });
    expect(r.nodes.get('b')).toMatchObject({ es: '2027-01-11', ef: '2027-01-13' }); // ends at noon Wed
    expect(r.nodes.get('m')).toMatchObject({ es: '2027-01-13', ef: '2027-01-13', critical: true });
    expect(r.projectFinish).toBe('2027-01-13');
  });

  it('honours pinned dates, SNET and deadlines', () => {
    const r = schedule(
      plan([
        task('a', 10),
        task('p', 1, { pinned: { start: '2027-01-06' } }),
        task('s', 1, { snet: '2027-02-01' }),
        gate('g', { deadline: '2027-01-12' }),
      ], [fs('a', 'p'), fs('a', 'g')]),
    );
    expect(r.nodes.get('p')!.es).toBe('2027-01-06');
    expect(r.warnings[0]).toMatchObject({ nodeId: 'p' });
    expect(r.nodes.get('s')!.es).toBe('2027-02-01');
    // a ends Fri Jan 15, deadline Tue Jan 12 → 3 working days late
    expect(r.nodes.get('g')!.totalFloatHalfDays).toBe(-6);
    expect(r.nodes.get('a')!.critical).toBe(true);
  });

  it('rolls up summaries and rejects dependencies on them', () => {
    const items = [task('sum', 0), task('c1', 3, { parentId: 'sum' }), task('c2', 4, { parentId: 'sum' }), task('x', 1)];
    const r = schedule(plan(items, [fs('c1', 'c2')]));
    expect(r.nodes.get('sum')).toMatchObject({ kind: 'summary', es: '2027-01-04', ef: '2027-01-12' });
    expect(() => schedule(plan(items, [fs('sum', 'x')]))).toThrow(ValidationError);
  });

  it('schedules procurement as a fixed delivery and computes need-by, order-by and float', () => {
    const items = [
      procurement('gear', { orderedOn: '2026-12-01', leadTimeDays: 45 }), // delivery Fri 2027-01-15
      task('prep', 15), // ends Fri Jan 22
      task('install', 5),
      milestone('done', { deadline: '2027-02-05' }),
    ];
    const r = schedule(plan(items, [fs('gear', 'install'), fs('prep', 'install'), fs('install', 'done')]));
    expect(r.nodes.get('gear')!.es).toBe('2027-01-15');
    expect(r.nodes.get('install')!.es).toBe('2027-01-25');
    const p = r.procurement.get('gear')!;
    expect(p.delivery).toBe('2027-01-15');
    // prep drives install, so the latest harmless delivery is install's start (Mon Jan 25).
    // The later deadline doesn't add slack: float is measured against the program finish too.
    expect(p.needBy).toBe('2027-01-25');
    expect(p.orderBy).toBe('2026-12-11');
    expect(p.floatDays).toBe(6);
  });

  it('propagates a late delivery as negative float', () => {
    const items = [procurement('gear', { expectedDelivery: '2027-02-08' }), task('install', 5), milestone('done', { deadline: '2027-02-05' })];
    const r = schedule(plan(items, [fs('gear', 'install'), fs('install', 'done')]));
    expect(r.procurement.get('gear')!.floatDays).toBe(-5);
    expect(r.nodes.get('done')!.critical).toBe(true);
  });

  it('projects agile workstreams and lets their delivery drive milestones', () => {
    const ws = [workstream('ws_a'), workstream('ws_agile', 'agile')];
    const sprints = [
      sprint('s1', 'ws_agile', '2027-01-04', '2027-01-15', { completedPoints: 18 }),
      sprint('s2', 'ws_agile', '2027-01-18', '2027-01-29', { completedPoints: 22 }),
      sprint('s3', 'ws_agile', '2027-02-01', '2027-02-12', { state: 'active', committedPoints: 20, burndown: [{ date: '2027-02-01', remainingPoints: 20 }] }),
    ];
    const backlog = [task('story1', 1, { workstreamId: 'ws_agile', storyPoints: 20, sprintId: 's3' }), task('story2', 1, { workstreamId: 'ws_agile', storyPoints: 30 })];
    const r = schedule(plan([...backlog, milestone('launch')], [fs('ws_agile', 'launch')], { workstreams: ws, sprints }));
    const proj = r.agile.get('ws_agile')!;
    expect(proj.velocity).toBe(20);
    // 50 remaining, 20 in the active sprint → 30 after → 2 more sprints of 10 days after Feb 12
    expect(proj.projectedFinish).toBe('2027-03-12');
    expect(r.nodes.get(deliveryNodeId('ws_agile'))!.es).toBe('2027-03-12');
    expect(r.nodes.get('launch')!.es).toBe('2027-03-12');
    expect(r.nodes.has('story1')).toBe(false);
  });

  it('handles agile workstreams without velocity', () => {
    const ws = [workstream('ws_a'), workstream('ws_agile', 'agile')];
    const r = schedule(plan([task('story', 1, { workstreamId: 'ws_agile', storyPoints: 5 }), milestone('m')], [fs('ws_agile', 'm')], { workstreams: ws }));
    expect(r.agile.get('ws_agile')!.projectedFinish).toBeNull();
    expect(r.nodes.get('m')!.es).toBe('2027-01-04');
  });

  it('supports SS relations with lag', () => {
    const r = schedule(plan([task('a', 10), task('b', 4)], [ss('a', 'b', 3)]));
    expect(r.nodes.get('b')!.es).toBe('2027-01-07');
  });
});
