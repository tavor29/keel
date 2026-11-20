import { describe, expect, it } from 'vitest';
import { computeEvm } from '@/domain/evm';
import { exportMspdi, importMspdi } from '@/domain/io/mspdi';
import type { PlanState } from '@/domain/plan';
import { computeRag } from '@/domain/rag';
import { schedule } from '@/domain/scheduling/schedule';
import { buildTitan, TITAN_AS_OF, TITAN_PROGRAM_ID, titanCalendar } from './plan';
import titanXml from './titan-1.xml?raw';

function importTitan(): PlanState {
  const r = importMspdi(titanXml, { programId: TITAN_PROGRAM_ID, now: '2026-03-01T00:00:00Z' });
  const built = buildTitan();
  return { ...built, workstreams: r.workstreams, items: r.items, relations: r.relations, calendar: { ...titanCalendar, workWeek: r.calendar.workWeek, holidays: r.calendar.holidays } };
}

describe('Titan-1 seed', () => {
  it('committed titan-1.xml matches the generator (run `npm run seed:titan` after editing plan.ts)', () => {
    const built = buildTitan();
    const xml = exportMspdi({ plan: built, result: schedule(built), people: built.team.people });
    expect(titanXml.trimEnd()).toBe(xml);
  });

  it('imports through the MSPDI importer without warnings at real scale', () => {
    const r = importMspdi(titanXml, { programId: TITAN_PROGRAM_ID, now: '2026-03-01T00:00:00Z' });
    expect(r.warnings).toEqual([]);
    expect(r.workstreams).toHaveLength(10);
    expect(r.items.length).toBeGreaterThan(500);
    expect(r.relations.length).toBeGreaterThan(600);
    expect(r.items.filter((i) => i.type === 'gate').map((g) => g.title.slice(0, 2))).toEqual(['G0', 'G1', 'G2', 'G3', 'G4', 'G5']);
    expect(r.items.filter((i) => i.type === 'procurement').length).toBeGreaterThanOrEqual(15);
    expect(r.calendar.workWeek).toEqual(titanCalendar.workWeek);
  });

  it('schedules the imported plan in under 50 ms', () => {
    const plan = importTitan();
    schedule(plan); // warm-up (JIT)
    const t0 = performance.now();
    const result = schedule(plan);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(50);
    expect(result.warnings).toEqual([]);
  });

  it('has the shape the demo story needs', () => {
    const plan = importTitan();
    const r = schedule(plan);
    const g2 = r.nodes.get('itm_titan_g2')!;
    // G2 energization has a little slack to its deadline: room for the switchgear slip to bite.
    expect(g2.deadlineFloatHalfDays).toBeGreaterThan(0);
    expect(g2.deadlineFloatHalfDays).toBeLessThan(30);
    // Switchgear B feeds G2 and is still in production as of the seed date.
    const swgrB = plan.items.find((i) => i.id === 'itm_titan_swgr_b')!;
    expect(swgrB).toMatchObject({ type: 'procurement', expectedDelivery: '2027-03-03', deliveryStatus: 'in_production', sharedWithGuestIds: ['per_chris'] });
    // Every gate is on or before its deadline in the seed.
    for (const id of ['g0', 'g1', 'g2', 'g3', 'g4', 'g5']) {
      expect(r.nodes.get(`itm_titan_${id}`)!.deadlineFloatHalfDays, id).toBeGreaterThanOrEqual(0);
    }
    // About $250M, with procurement POs and cost-loaded tasks summing to the budget.
    const evm = computeEvm(plan, r, TITAN_AS_OF).program;
    expect(evm.bacCents).toBe(250 * 100_000_000);
    expect(computeRag(plan, r).program).not.toBe('red');
  });
});
