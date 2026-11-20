/**
 * MS Project XML (MSPDI) import/export — docs/build-plan.md phase 1.
 *
 * Mapping
 * - Outline level 1 summary tasks ⇄ workstreams. Deeper tasks ⇄ items (WBS from outline).
 * - Duration: half-days ⇄ hours (8 h/day, 4 h per half-day). Lag: tenths of minutes.
 * - Pinned start ⇄ ConstraintType 2 (Must Start On); SNET ⇄ ConstraintType 4.
 * - Procurement items ⇄ milestones constrained (MSO) to the delivery date.
 * - Keel-only fields ride along as JSON in <Notes> prefixed "keel:", so a Keel → XML → Keel
 *   round trip is lossless while MS Project still opens the file normally.
 * - FF/SF links don't exist in Keel: imported as FS with a warning.
 */
import { addDays } from '../dates';
import { isProcurement, isSchedulable, type PlanState } from '../plan';
import type { ScheduleResult } from '../scheduling/schedule';
import type { Calendar, Item, Person, Relation, Workstream } from '../types';

const HALF_DAY_HOURS = 4;
const LAG_UNITS_PER_HALF_DAY = HALF_DAY_HOURS * 60 * 10; // tenths of minutes
const META = 'keel:';

// ───────────────────────── Export ─────────────────────────

export interface ExportInput {
  plan: PlanState;
  result: ScheduleResult;
  people: readonly Person[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tag = (name: string, value: string | number | undefined) => (value === undefined ? '' : `<${name}>${typeof value === 'string' ? esc(value) : value}</${name}>`);
const hours = (halfDays: number) => `PT${halfDays * HALF_DAY_HOURS}H0M0S`;

/** Fields expressed natively in MSPDI; everything else goes into the Notes JSON. */
const NATIVE = new Set(['title', 'durationHalfDays', 'percentComplete', 'pinned', 'snet', 'deadline', 'assignments', 'parentId', 'workstreamId', 'order', 'programId', 'createdAt', 'updatedAt']);

function metaOf(item: Item): string {
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) if (!NATIVE.has(k) && v !== undefined) meta[k] = v;
  return META + JSON.stringify(meta);
}

export function exportMspdi({ plan, result, people }: ExportInput): string {
  const cal = result.calendar;
  const exported = plan.items.filter((i) => isSchedulable(i) || isProcurement(i));
  const ids = new Set(exported.map((i) => i.id));
  const uid = new Map<string, number>();
  let next = 1;
  const children = new Map<string, Item[]>();
  for (const i of exported) {
    const key = i.parentId && ids.has(i.parentId) ? i.parentId : `ws:${i.workstreamId}`;
    children.set(key, [...(children.get(key) ?? []), i]);
  }
  const sortKids = (list: Item[]) => list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const startTime = (slot: number) => `${cal.dateOfSlot(slot)}T${slot % 2 === 0 ? '08' : '13'}:00:00`;
  const finishTime = (boundary: number) => (boundary <= 0 ? `${cal.dateOfSlot(0)}T08:00:00` : `${cal.dateOfSlot(boundary - 1)}T${(boundary - 1) % 2 === 0 ? '12' : '17'}:00:00`);

  const tasks: string[] = [];
  const preds = new Map<string, Relation[]>();
  for (const r of plan.relations) {
    if (r.kind !== 'FS' && r.kind !== 'SS') continue;
    preds.set(r.toId, [...(preds.get(r.toId) ?? []), r]);
  }

  const pending: { id: string; xml: (u: Map<string, number>) => string }[] = [];
  const emit = (id: string, build: (u: Map<string, number>) => string) => {
    uid.set(id, next++);
    pending.push({ id, xml: build });
  };

  const workstreams = [...plan.workstreams].sort((a, b) => a.order - b.order);
  workstreams.forEach((ws, wi) => {
    const wsNode = [...result.nodes.values()].filter((n) => exported.some((i) => i.id === n.itemId && i.workstreamId === ws.id));
    const es = wsNode.length ? Math.min(...wsNode.map((n) => n.slots.es)) : 0;
    const ef = wsNode.length ? Math.max(...wsNode.map((n) => n.slots.ef)) : 0;
    const outline = `${wi + 1}`;
    const { id, mode, color, budgetCents, leadId, jiraBoard } = ws;
    emit(ws.id, (u) =>
      [
        '<Task>',
        tag('UID', u.get(ws.id)),
        tag('ID', u.get(ws.id)),
        tag('Name', ws.name),
        tag('OutlineNumber', outline),
        tag('OutlineLevel', 1),
        tag('Start', startTime(es)),
        tag('Finish', finishTime(ef)),
        tag('Summary', 1),
        tag('Milestone', 0),
        tag('Notes', META + JSON.stringify({ kind: 'workstream', id, mode, color, budgetCents, leadId, jiraBoard })),
        '</Task>',
      ].join(''),
    );

    const walk = (key: string, prefix: string, level: number) => {
      sortKids(children.get(key) ?? []).forEach((item, idx) => {
        const outlineNo = `${prefix}.${idx + 1}`;
        const node = result.nodes.get(item.id);
        const kids = children.get(item.id);
        emit(item.id, (u) => {
          const parts = ['<Task>', tag('UID', u.get(item.id)), tag('ID', u.get(item.id)), tag('Name', item.title), tag('OutlineNumber', outlineNo), tag('OutlineLevel', level)];
          if (isProcurement(item)) {
            const d = result.procurement.get(item.id)?.delivery ?? item.expectedDelivery ?? plan.asOf;
            parts.push(tag('Start', `${d}T08:00:00`), tag('Finish', `${d}T08:00:00`), tag('Duration', hours(0)), tag('DurationFormat', 7), tag('Milestone', 1), tag('Summary', 0), tag('PercentComplete', item.percentComplete), tag('ConstraintType', 2), tag('ConstraintDate', `${d}T08:00:00`));
          } else if (isSchedulable(item)) {
            const isEvent = item.type !== 'task' || (item.durationHalfDays === 0 && !kids);
            if (node) {
              parts.push(
                tag('Start', isEvent ? finishTime(node.slots.es) : startTime(node.slots.es)),
                tag('Finish', isEvent ? finishTime(node.slots.es) : finishTime(node.slots.ef)),
              );
            }
            parts.push(
              tag('Duration', hours(kids ? 0 : item.type === 'task' ? item.durationHalfDays : 0)),
              tag('DurationFormat', 7),
              tag('Milestone', item.type === 'task' ? 0 : 1),
              tag('Summary', kids ? 1 : 0),
              tag('PercentComplete', item.percentComplete),
            );
            if (item.pinned) parts.push(tag('ConstraintType', 2), tag('ConstraintDate', `${item.pinned.start}T08:00:00`));
            else if (item.snet) parts.push(tag('ConstraintType', 4), tag('ConstraintDate', `${item.snet}T08:00:00`));
            else parts.push(tag('ConstraintType', 0));
            if (item.deadline) parts.push(tag('Deadline', `${item.deadline}T17:00:00`));
          }
          parts.push(tag('Notes', metaOf(item)));
          for (const r of preds.get(item.id) ?? []) {
            const p = u.get(r.fromId);
            if (p === undefined) continue;
            parts.push(`<PredecessorLink>${tag('PredecessorUID', p)}${tag('Type', r.kind === 'SS' ? 3 : 1)}${tag('CrossProject', 0)}${tag('LinkLag', (r.lagHalfDays ?? 0) * LAG_UNITS_PER_HALF_DAY)}${tag('LagFormat', 7)}</PredecessorLink>`);
          }
          parts.push('</Task>');
          return parts.join('');
        });
        walk(item.id, outlineNo, level + 1);
      });
    };
    walk(`ws:${ws.id}`, outline, 2);
  });
  for (const p of pending) tasks.push(p.xml(uid));

  // Resources and assignments
  const assigned = new Set<string>();
  for (const i of exported) if (isSchedulable(i)) for (const a of i.assignments) assigned.add(a.personId);
  const resUid = new Map<string, number>();
  const resources = people
    .filter((p) => assigned.has(p.id))
    .map((p, idx) => {
      resUid.set(p.id, idx + 1);
      return `<Resource>${tag('UID', idx + 1)}${tag('ID', idx + 1)}${tag('Name', p.name)}${tag('Type', 1)}${tag('Notes', META + JSON.stringify({ id: p.id }))}</Resource>`;
    });
  const assignments: string[] = [];
  let aUid = 1;
  for (const i of exported) {
    if (!isSchedulable(i)) continue;
    for (const a of i.assignments) {
      const r = resUid.get(a.personId);
      if (r === undefined) continue;
      assignments.push(`<Assignment>${tag('UID', aUid++)}${tag('TaskUID', uid.get(i.id))}${tag('ResourceUID', r)}${tag('Units', a.allocationPct / 100)}</Assignment>`);
    }
  }

  // Calendar: DayType 1 = Sunday … 7 = Saturday. Holidays use the classic DayType 0 form.
  const weekDays = [1, 2, 3, 4, 5, 6, 7].map((dt) => {
    const working = plan.calendar.workWeek[(dt + 5) % 7];
    const times = working
      ? '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>'
      : '';
    return `<WeekDay>${tag('DayType', dt)}${tag('DayWorking', working ? 1 : 0)}${times}</WeekDay>`;
  });
  const holidays = plan.calendar.holidays.map(
    (h) => `<WeekDay>${tag('DayType', 0)}${tag('DayWorking', 0)}<TimePeriod>${tag('FromDate', `${h}T00:00:00`)}${tag('ToDate', `${h}T23:59:00`)}</TimePeriod></WeekDay>`,
  );

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    tag('SaveVersion', 14),
    tag('Name', `${plan.program.name}.xml`),
    tag('Title', plan.program.name),
    tag('StartDate', `${plan.program.start}T08:00:00`),
    tag('ScheduleFromStart', 1),
    tag('MinutesPerDay', 480),
    tag('MinutesPerWeek', 480 * plan.calendar.workWeek.filter(Boolean).length),
    tag('CalendarUID', 1),
    `<Calendars><Calendar>${tag('UID', 1)}${tag('Name', plan.calendar.name)}${tag('IsBaseCalendar', 1)}<WeekDays>${[...weekDays, ...holidays].join('')}</WeekDays></Calendar></Calendars>`,
    `<Tasks>${tasks.join('\n')}</Tasks>`,
    `<Resources>${resources.join('')}</Resources>`,
    `<Assignments>${assignments.join('')}</Assignments>`,
    '</Project>',
  ].join('\n');
}

// ───────────────────────── Import ─────────────────────────

export interface ImportResult {
  programName: string;
  start: string;
  calendar: Pick<Calendar, 'workWeek' | 'holidays'> & { name: string };
  workstreams: Workstream[];
  items: Item[];
  relations: Relation[];
  /** Resources referenced by assignments; personId comes from Keel notes when present. */
  resources: { uid: number; name: string; personId?: string }[];
  warnings: string[];
}

export interface ImportOptions {
  programId: string;
  /** Timestamp for createdAt/updatedAt. */
  now: string;
  /** Maps a resource without a Keel id to a person id (e.g. by name). Defaults to `res_<uid>`. */
  personIdFor?: (resource: { uid: number; name: string }) => string;
}

const child = (el: Element, name: string): string | undefined => {
  for (const c of Array.from(el.children)) if (c.localName === name) return c.textContent ?? undefined;
  return undefined;
};
const children = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);
const num = (v: string | undefined, d = 0) => (v === undefined || v === '' ? d : Number(v));
const datePart = (v: string | undefined) => v?.slice(0, 10);

function parseHours(duration: string | undefined): number {
  if (!duration) return 0;
  const m = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(duration);
  if (!m) return 0;
  return num(m[1]) + num(m[2]) / 60 + num(m[3]) / 3600;
}

function parseMeta(notes: string | undefined): Record<string, unknown> | undefined {
  if (!notes?.startsWith(META)) return undefined;
  try {
    return JSON.parse(notes.slice(META.length)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function importMspdi(xml: string, opts: ImportOptions): ImportResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Not a valid XML file');
  const project = doc.documentElement;
  if (project.localName !== 'Project') throw new Error('Not an MS Project XML file (missing <Project>)');
  const warnings: string[] = [];

  // Calendar
  const calUid = child(project, 'CalendarUID');
  const calEls = Array.from(project.getElementsByTagName('Calendar'));
  const calEl = calEls.find((c) => child(c, 'UID') === calUid) ?? calEls[0];
  const workWeek = [true, true, true, true, true, false, false];
  const holidays = new Set<string>();
  const addRange = (from?: string, to?: string) => {
    const f = datePart(from);
    const t = datePart(to) ?? f;
    if (!f || !t) return;
    for (let d = f; d <= t; d = addDays(d, 1)) holidays.add(d);
  };
  if (calEl) {
    for (const wd of Array.from(calEl.getElementsByTagName('WeekDay'))) {
      const dt = num(child(wd, 'DayType'), -1);
      const working = child(wd, 'DayWorking') === '1';
      if (dt >= 1 && dt <= 7) workWeek[(dt + 5) % 7] = working;
      else if (dt === 0 && !working) {
        const tp = children(wd, 'TimePeriod')[0];
        if (tp) addRange(child(tp, 'FromDate'), child(tp, 'ToDate'));
      }
    }
    for (const ex of Array.from(calEl.getElementsByTagName('Exception'))) {
      if (child(ex, 'DayWorking') === '1') continue;
      const tp = children(ex, 'TimePeriod')[0];
      if (tp) addRange(child(tp, 'FromDate'), child(tp, 'ToDate'));
    }
  }

  const taskEls = Array.from(project.getElementsByTagName('Task')).filter((t) => num(child(t, 'OutlineLevel'), 1) >= 1 && child(t, 'UID') !== '0');
  const levels = taskEls.map((t) => num(child(t, 'OutlineLevel'), 1));

  const workstreams: Workstream[] = [];
  const items: Item[] = [];
  const idByUid = new Map<number, string>();
  const stack: { level: number; id: string; isWs: boolean }[] = [];
  const orderIn = new Map<string, number>();
  const nextOrder = (key: string) => {
    const n = (orderIn.get(key) ?? 0) + 1;
    orderIn.set(key, n);
    return n;
  };
  let fallbackWs: Workstream | undefined;
  const linkEls: { toUid: number; el: Element }[] = [];

  taskEls.forEach((t, idx) => {
    const level = levels[idx]!;
    const uid = num(child(t, 'UID'));
    const name = child(t, 'Name') ?? `Task ${uid}`;
    const hasKids = (levels[idx + 1] ?? 0) > level;
    const meta = parseMeta(child(t, 'Notes'));
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    for (const l of children(t, 'PredecessorLink')) linkEls.push({ toUid: uid, el: l });

    if (level === 1 && (hasKids || meta?.kind === 'workstream')) {
      const ws: Workstream = {
        id: (meta?.id as string) ?? `wst_mspdi_${uid}`,
        programId: opts.programId,
        name,
        mode: meta?.mode === 'agile' ? 'agile' : 'scheduled',
        leadId: (meta?.leadId as string) ?? '',
        color: (meta?.color as string) ?? '#55657a',
        budgetCents: num(meta?.budgetCents as string | undefined),
        order: workstreams.length,
        ...(meta?.jiraBoard ? { jiraBoard: meta.jiraBoard as Workstream['jiraBoard'] } : {}),
      };
      workstreams.push(ws);
      idByUid.set(uid, ws.id);
      stack.push({ level, id: ws.id, isWs: true });
      return;
    }

    let wsFrame = stack.find((s) => s.isWs);
    if (!wsFrame) {
      if (!fallbackWs) {
        fallbackWs = { id: 'wst_mspdi_general', programId: opts.programId, name: 'General', mode: 'scheduled', leadId: '', color: '#55657a', budgetCents: 0, order: workstreams.length };
        workstreams.push(fallbackWs);
        warnings.push('Top-level tasks without a summary were placed in a "General" workstream');
      }
      wsFrame = { level: 0, id: fallbackWs.id, isWs: true };
    }
    const parent = [...stack].reverse().find((s) => !s.isWs);
    const id = (meta?.id as string) ?? `itm_mspdi_${uid}`;
    const milestone = child(t, 'Milestone') === '1';
    const type = (meta?.type as Item['type']) ?? (milestone ? 'milestone' : 'task');
    const pct = num(child(t, 'PercentComplete'));
    const common = {
      ...meta,
      id,
      programId: opts.programId,
      workstreamId: wsFrame.id,
      ...(parent ? { parentId: parent.id } : {}),
      order: nextOrder(parent?.id ?? wsFrame.id),
      title: name,
      status: (meta?.status as Item['status']) ?? (pct >= 100 ? 'done' : pct > 0 ? 'in_progress' : 'not_started'),
      sharedWithGuestIds: (meta?.sharedWithGuestIds as string[]) ?? [],
      followerIds: (meta?.followerIds as string[]) ?? [],
      createdAt: opts.now,
      updatedAt: opts.now,
    };
    delete (common as Record<string, unknown>).kind;

    let item: Item;
    if (type === 'procurement') {
      item = { ...common, type, percentComplete: pct } as Item;
    } else if (type === 'task' || type === 'milestone' || type === 'gate') {
      const ct = num(child(t, 'ConstraintType'));
      const cd = datePart(child(t, 'ConstraintDate'));
      const constraint: { pinned?: { start: string }; snet?: string } = {};
      if (ct === 2 && cd) constraint.pinned = { start: cd };
      else if (ct === 4 && cd) constraint.snet = cd;
      else if (ct !== 0 && ct !== 1 && cd) warnings.push(`"${name}": constraint type ${ct} isn't supported and was ignored`);
      const deadline = datePart(child(t, 'Deadline'));
      item = {
        ...common,
        type,
        durationHalfDays: hasKids || type !== 'task' ? 0 : Math.round(parseHours(child(t, 'Duration')) / HALF_DAY_HOURS),
        percentComplete: pct,
        assignments: [],
        ...constraint,
        ...(deadline ? { deadline } : {}),
      } as Item;
    } else {
      warnings.push(`"${name}": item type ${type} can't live in a schedule and was skipped`);
      return;
    }
    items.push(item);
    idByUid.set(uid, id);
    stack.push({ level, id, isWs: false });
  });

  // Relations (after all tasks are known)
  const relations: Relation[] = [];
  for (const { toUid, el } of linkEls) {
    const fromId = idByUid.get(num(child(el, 'PredecessorUID')));
    const toId = idByUid.get(toUid);
    if (!fromId || !toId) {
      warnings.push(`A link to task ${toUid} references a missing predecessor and was skipped`);
      continue;
    }
    const type = num(child(el, 'Type'), 1);
    if (type === 0 || type === 2) warnings.push(`Link ${fromId} → ${toId}: ${type === 0 ? 'FF' : 'SF'} isn't supported; imported as FS`);
    const fmt = num(child(el, 'LagFormat'), 7);
    let lag = Math.round(num(child(el, 'LinkLag')) / LAG_UNITS_PER_HALF_DAY);
    if (fmt === 19 || fmt === 20) {
      warnings.push(`Link ${fromId} → ${toId}: percentage lag isn't supported; lag ignored`);
      lag = 0;
    }
    relations.push({ id: `rel_mspdi_${relations.length + 1}`, programId: opts.programId, kind: type === 3 ? 'SS' : 'FS', fromId, toId, lagHalfDays: lag });
  }

  // Resources and assignments
  const resources: ImportResult['resources'] = [];
  const personByRes = new Map<number, string>();
  for (const r of Array.from(project.getElementsByTagName('Resource'))) {
    const uid = num(child(r, 'UID'));
    const name = child(r, 'Name');
    if (!name) continue;
    const personId = (parseMeta(child(r, 'Notes'))?.id as string | undefined) ?? opts.personIdFor?.({ uid, name }) ?? `res_${uid}`;
    resources.push({ uid, name, personId });
    personByRes.set(uid, personId);
  }
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const a of Array.from(project.getElementsByTagName('Assignment'))) {
    const item = itemById.get(idByUid.get(num(child(a, 'TaskUID'))) ?? '');
    const personId = personByRes.get(num(child(a, 'ResourceUID'), -1));
    if (!item || !personId || !isSchedulable(item)) continue;
    item.assignments.push({ personId, allocationPct: Math.round(num(child(a, 'Units'), 1) * 100) });
  }

  return {
    programName: child(project, 'Title') ?? child(project, 'Name')?.replace(/\.xml$/i, '') ?? 'Imported program',
    start: datePart(child(project, 'StartDate')) ?? opts.now.slice(0, 10),
    calendar: { name: calEl ? (child(calEl, 'Name') ?? 'Standard') : 'Standard', workWeek, holidays: [...holidays].sort() },
    workstreams,
    items,
    relations,
    resources,
    warnings,
  };
}
