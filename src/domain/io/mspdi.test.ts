import { describe, expect, it } from 'vitest';
import { schedule } from '../scheduling/schedule';
import { fs, gate, milestone, plan, procurement, ss, task, workstream } from '../testing';
import type { Item, Person } from '../types';
import { exportMspdi, importMspdi } from './mspdi';

const people: Person[] = [
  { id: 'per_a', name: 'Ana Ito', email: 'a@x.example', org: 'K', avatarColor: '#000', home: 'keel' },
  { id: 'per_b', name: 'Ben Ode', email: 'b@x.example', org: 'K', avatarColor: '#000', home: 'keel' },
];

function samplePlan() {
  const items: Item[] = [
    task('sum', 0, { order: 1 }),
    task('design', 5, { parentId: 'sum', order: 1, ownerId: 'per_a', assignments: [{ personId: 'per_a', allocationPct: 50 }], budgetCents: 120_000, percentComplete: 100, status: 'done' }),
    task('build', 7.5, { parentId: 'sum', order: 2, snet: '2027-01-13', assignments: [{ personId: 'per_b', allocationPct: 100 }] }),
    task('pinned', 1, { order: 2, pinned: { start: '2027-02-01' } }),
    procurement('gear', { order: 3, supplier: 'VoltGrid', poNumber: 'PO-1', poValueCents: 4_000_000_00, leadTimeDays: 90, orderedOn: '2026-11-01', expectedDelivery: '2027-01-25', deliveryStatus: 'in_production' }),
    gate('g1', { order: 4, deadline: '2027-02-12', approverIds: ['per_a'], exitCriteria: [{ id: 'c1', text: 'Signed', done: false }] }),
    task('story', 1, { workstreamId: 'ws_ag', storyPoints: 5, sprintId: 'spr_1', order: 1 }),
    milestone('launch', { workstreamId: 'ws_ag', order: 2 }),
  ];
  const relations = [fs('design', 'build', 1), ss('design', 'pinned', 2), fs('gear', 'g1'), fs('build', 'g1'), fs('ws_ag', 'launch')];
  return plan(items, relations, {
    workstreams: [workstream('ws_a'), { ...workstream('ws_ag', 'agile'), order: 1, color: '#123456' }],
    calendar: { id: 'cal', name: 'Site', workWeek: [true, true, true, true, true, true, false], holidays: ['2027-01-18'] },
  });
}

const normalize = (items: Item[]) =>
  items
    .map(({ createdAt: _c, updatedAt: _u, order: _o, ...rest }) => rest)
    .sort((a, b) => a.id.localeCompare(b.id));

describe('MSPDI', () => {
  it('round-trips a Keel plan losslessly (except timestamps and order numbering)', () => {
    const p = samplePlan();
    const xml = exportMspdi({ plan: p, result: schedule(p), people });
    const back = importMspdi(xml, { programId: 'prg_t', now: '2027-01-01T00:00:00Z' });

    expect(back.warnings).toEqual([]);
    expect(back.programName).toBe('Test');
    expect(back.start).toBe('2027-01-04');
    expect(back.calendar.workWeek).toEqual(p.calendar.workWeek);
    expect(back.calendar.holidays).toEqual(['2027-01-18']);
    expect(back.workstreams.map((w) => [w.id, w.mode, w.color])).toEqual([
      ['ws_a', 'scheduled', '#000'],
      ['ws_ag', 'agile', '#123456'],
    ]);
    expect(normalize(back.items)).toEqual(normalize(p.items));
    const rel = (rs: typeof p.relations) => rs.map((r) => `${r.kind}:${r.fromId}>${r.toId}+${r.lagHalfDays}`).sort();
    expect(rel(back.relations)).toEqual(rel(p.relations));
    expect(back.resources.map((r) => r.personId)).toEqual(['per_a', 'per_b']);

    // Same schedule after the round trip
    const again = schedule({ ...p, items: back.items, relations: back.relations, workstreams: back.workstreams });
    const before = schedule(p);
    for (const [id, n] of before.nodes) expect(again.nodes.get(id)?.es, id).toBe(n.es);
  });

  it('writes MS Project-friendly dates, durations and lags', () => {
    const p = samplePlan();
    const xml = exportMspdi({ plan: p, result: schedule(p), people });
    expect(xml).toContain('<Name>build</Name>');
    expect(xml).toMatch(/<Name>build<\/Name>.*?<Duration>PT60H0M0S<\/Duration>/s); // 7.5 days × 8 h
    expect(xml).toMatch(/<LinkLag>4800<\/LinkLag>/); // 1 day
    expect(xml).toContain('<ConstraintType>4</ConstraintType><ConstraintDate>2027-01-13T08:00:00</ConstraintDate>');
    expect(xml).toContain('<Deadline>2027-02-12T17:00:00</Deadline>');
  });

  it('imports a foreign MS Project file with warnings for unsupported features', () => {
    const xml = `<?xml version="1.0"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Title>Vendor plan</Title><StartDate>2027-03-01T08:00:00</StartDate><CalendarUID>3</CalendarUID>
  <Calendars><Calendar><UID>3</UID><Name>Standard</Name><WeekDays>
    <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
    <WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
  </WeekDays><Exceptions><Exception><TimePeriod><FromDate>2027-04-05T00:00:00</FromDate><ToDate>2027-04-06T23:59:00</ToDate></TimePeriod><DayWorking>0</DayWorking></Exception></Exceptions></Calendar></Calendars>
  <Tasks>
    <Task><UID>0</UID><OutlineLevel>0</OutlineLevel><Name>Vendor plan</Name></Task>
    <Task><UID>1</UID><OutlineLevel>1</OutlineLevel><Name>Loose task</Name><Duration>PT16H0M0S</Duration></Task>
    <Task><UID>2</UID><OutlineLevel>1</OutlineLevel><Name>Phase A</Name><Summary>1</Summary></Task>
    <Task><UID>3</UID><OutlineLevel>2</OutlineLevel><Name>Spec</Name><Duration>PT40H0M0S</Duration><PercentComplete>30</PercentComplete></Task>
    <Task><UID>4</UID><OutlineLevel>2</OutlineLevel><Name>Review</Name><Duration>PT8H0M0S</Duration><ConstraintType>6</ConstraintType><ConstraintDate>2027-03-20T08:00:00</ConstraintDate>
      <PredecessorLink><PredecessorUID>3</PredecessorUID><Type>0</Type><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink>
      <PredecessorLink><PredecessorUID>99</PredecessorUID><Type>1</Type></PredecessorLink></Task>
    <Task><UID>5</UID><OutlineLevel>2</OutlineLevel><Name>Signed off</Name><Milestone>1</Milestone><Duration>PT0H0M0S</Duration>
      <PredecessorLink><PredecessorUID>4</PredecessorUID><Type>1</Type><LinkLag>2400</LinkLag><LagFormat>20</LagFormat></PredecessorLink></Task>
  </Tasks>
  <Resources><Resource><UID>1</UID><Name>Kim Park</Name></Resource></Resources>
  <Assignments><Assignment><TaskUID>3</TaskUID><ResourceUID>1</ResourceUID><Units>0.5</Units></Assignment></Assignments>
</Project>`;
    const r = importMspdi(xml, { programId: 'prg_v', now: '2027-01-01T00:00:00Z', personIdFor: ({ name }) => `per_${name.toLowerCase().replace(' ', '_')}` });
    expect(r.programName).toBe('Vendor plan');
    expect(r.calendar.workWeek).toEqual([true, true, true, true, true, false, false]);
    expect(r.calendar.holidays).toEqual(['2027-04-05', '2027-04-06']);
    expect(r.workstreams.map((w) => w.name)).toEqual(['General', 'Phase A']);
    const spec = r.items.find((i) => i.title === 'Spec')!;
    expect(spec).toMatchObject({ type: 'task', durationHalfDays: 10, percentComplete: 30, status: 'in_progress', workstreamId: 'wst_mspdi_2' });
    expect(spec.type === 'task' && spec.assignments).toEqual([{ personId: 'per_kim_park', allocationPct: 50 }]);
    expect(r.items.find((i) => i.title === 'Signed off')!.type).toBe('milestone');
    expect(r.relations.map((x) => [x.kind, x.lagHalfDays])).toEqual([
      ['FS', 0],
      ['FS', 0],
    ]);
    expect(r.warnings.join('\n')).toMatch(/General/);
    expect(r.warnings.join('\n')).toMatch(/FF isn't supported/);
    expect(r.warnings.join('\n')).toMatch(/constraint type 6/);
    expect(r.warnings.join('\n')).toMatch(/missing predecessor/);
    expect(r.warnings.join('\n')).toMatch(/percentage lag/);
  });

  it('rejects non-MSPDI input', () => {
    expect(() => importMspdi('<html></html>', { programId: 'p', now: '' })).toThrow(/MS Project/);
    expect(() => importMspdi('not xml <', { programId: 'p', now: '' })).toThrow();
  });
});
