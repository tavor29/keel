// Living documents (docs/documents.md): live sections render from plan data; approval
// freezes a rendered copy; drift compares the latest approved copy with "now".
import { computeEvm } from './evm';
import type { PlanState } from './plan';
import type { RagReport } from './rag';
import type { ScheduleResult } from './scheduling/schedule';
import type {
  CommsPlanRow,
  DocSection,
  DocumentVersion,
  LiveSource,
  Membership,
  Person,
  ProjectDocument,
  Rag,
  RaciLetter,
  RaciOverride,
  Requirement,
  Stakeholder,
} from './types';

export interface RaciMatrix {
  rows: { itemId: string; title: string }[];
  people: { personId: string; name: string }[];
  cells: Record<string, Record<string, { letters: RaciLetter[]; overridden: boolean }>>;
  problems: { itemId: string; kind: 'no_accountable' | 'multiple_accountable' | 'no_responsible' }[];
}

export type LiveData =
  | { source: 'sponsor'; sponsor: string; pm: string; approvers: string[] }
  | { source: 'milestones'; rows: { id: string; title: string; date: string; deadline?: string; rag: Rag }[] }
  | { source: 'budget'; rows: { workstream: string; bacCents: number; eacCents: number }[]; totalBacCents: number; totalEacCents: number }
  | { source: 'team'; rows: { workstream: string; lead: string }[] }
  | { source: 'top_risks'; rows: { id: string; code?: string; title: string; score: number }[] }
  | {
      source: 'requirements';
      rows: { id: string; code: string; statement: string; priority: Requirement['priority']; status: Requirement['status']; owner?: string; traced: { id: string; title: string; rag: Rag }[] }[];
      coverage: { traced: number; total: number };
    }
  | { source: 'raci'; matrix: RaciMatrix }
  | { source: 'stakeholders'; rows: { name: string; org?: string; role?: string; influence: number; interest: number; attitude: Stakeholder['attitude'] }[] }
  | { source: 'comms_plan'; rows: { audience: string; message: string; channel: CommsPlanRow['channel']; cadence: CommsPlanRow['cadence']; owner: string; nextDue?: string }[] };

export interface RenderedDocument {
  documentId: string;
  version: number | 'live';
  sections: { id: string; title: string; kind: DocSection['kind']; body?: string; data?: LiveData }[];
}

export interface DocDrift {
  approvedVersion: number | null;
  changedSectionIds: string[];
  /** A gate/milestone moved later than its approved date, or EAC moved > 5%. */
  material: boolean;
  summary: string[];
}

export interface DocContext {
  plan: PlanState;
  result: ScheduleResult;
  rag: RagReport;
  people: readonly Person[];
  memberships: readonly Membership[];
  requirements: readonly Requirement[];
  stakeholders: readonly Stakeholder[];
  comms: readonly CommsPlanRow[];
  raciOverrides: readonly RaciOverride[];
}

const nameOf = (ctx: DocContext, id?: string) => (id ? (ctx.people.find((p) => p.id === id)?.name ?? id) : '—');

export function deriveRaci(ctx: DocContext, documentId: string): RaciMatrix {
  const { plan } = ctx;
  const events = plan.items
    .filter((i) => (i.type === 'gate' || i.type === 'milestone') && ctx.result.nodes.has(i.id))
    .sort((a, b) => ctx.result.nodes.get(a.id)!.es.localeCompare(ctx.result.nodes.get(b.id)!.es));
  const leads = plan.workstreams.map((w) => w.leadId).filter(Boolean);
  const pm = ctx.memberships.find((m) => m.programId === plan.program.id && m.role === 'pm')?.personId;
  const execs = ctx.memberships.filter((m) => m.programId === plan.program.id && m.role === 'exec').map((m) => m.personId);
  const peopleIds = [...new Set([pm, ...execs, ...leads].filter((x): x is string => !!x))];
  const cells: RaciMatrix['cells'] = {};
  const problems: RaciMatrix['problems'] = [];

  for (const ev of events) {
    const row: Record<string, { letters: RaciLetter[]; overridden: boolean }> = {};
    const add = (pid: string | undefined, l: RaciLetter) => {
      if (!pid || !peopleIds.includes(pid)) return;
      row[pid] ??= { letters: [], overridden: false };
      if (!row[pid].letters.includes(l)) row[pid].letters.push(l);
    };
    // A: the event owner. R: leads of the workstreams that drive it. C: approvers. I: execs and the PM.
    add(ev.ownerId, 'A');
    for (const r of plan.relations.filter((x) => x.toId === ev.id)) {
      const from = plan.items.find((i) => i.id === r.fromId);
      const ws = plan.workstreams.find((w) => w.id === (from?.workstreamId ?? r.fromId));
      if (ws && ws.leadId !== ev.ownerId) add(ws.leadId, 'R');
    }
    if (!Object.values(row).some((c) => c.letters.includes('R'))) add(plan.workstreams.find((w) => w.id === ev.workstreamId)?.leadId, 'R');
    if (ev.type === 'gate') for (const a of ev.approverIds) if (a !== ev.ownerId) add(a, 'C');
    for (const e of execs) if (!row[e]) add(e, 'I');
    if (pm && !row[pm]) add(pm, 'I');
    for (const o of ctx.raciOverrides.filter((x) => x.documentId === documentId && x.itemId === ev.id)) {
      row[o.personId] = { letters: [...o.letters], overridden: true };
    }
    const accountable = Object.values(row).filter((c) => c.letters.includes('A')).length;
    if (accountable === 0) problems.push({ itemId: ev.id, kind: 'no_accountable' });
    if (accountable > 1) problems.push({ itemId: ev.id, kind: 'multiple_accountable' });
    if (!Object.values(row).some((c) => c.letters.includes('R'))) problems.push({ itemId: ev.id, kind: 'no_responsible' });
    cells[ev.id] = row;
  }
  return {
    rows: events.map((e) => ({ itemId: e.id, title: e.title })),
    people: peopleIds.map((personId) => ({ personId, name: nameOf(ctx, personId) })),
    cells,
    problems,
  };
}

export function renderLive(source: LiveSource, ctx: DocContext, doc: ProjectDocument): LiveData {
  const { plan, result, rag } = ctx;
  switch (source) {
    case 'sponsor': {
      const sponsor = ctx.memberships.find((m) => m.programId === plan.program.id && m.role === 'exec')?.personId;
      const pm = ctx.memberships.find((m) => m.programId === plan.program.id && m.role === 'pm')?.personId;
      return { source, sponsor: nameOf(ctx, sponsor), pm: nameOf(ctx, pm), approvers: doc.approverIds.map((a) => nameOf(ctx, a)) };
    }
    case 'milestones':
      return {
        source,
        rows: plan.items
          .filter((i) => (i.type === 'gate' || i.type === 'milestone') && result.nodes.has(i.id))
          .map((i) => ({ id: i.id, title: i.title, date: result.nodes.get(i.id)!.es, ...('deadline' in i && i.deadline ? { deadline: i.deadline } : {}), rag: rag.items.get(i.id) ?? 'green' }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
    case 'budget': {
      const evm = computeEvm(plan, result, plan.asOf);
      const rows = plan.workstreams
        .map((w) => ({ workstream: w.name, bacCents: evm.byWorkstream[w.id]?.bacCents ?? 0, eacCents: evm.byWorkstream[w.id]?.eacCents ?? 0 }))
        .filter((r) => r.bacCents > 0);
      return { source, rows, totalBacCents: evm.program.bacCents, totalEacCents: evm.program.eacCents };
    }
    case 'team':
      return { source, rows: plan.workstreams.map((w) => ({ workstream: w.name, lead: nameOf(ctx, w.leadId) })) };
    case 'top_risks':
      return {
        source,
        rows: plan.items
          .filter((i): i is Extract<typeof i, { type: 'risk' }> => i.type === 'risk' && i.status !== 'done' && i.status !== 'cancelled')
          .sort((a, b) => b.probability * b.impact - a.probability * a.impact)
          .slice(0, 5)
          .map((r) => ({ id: r.id, code: r.code, title: r.title, score: r.probability * r.impact })),
      };
    case 'requirements': {
      const reqs = ctx.requirements.filter((r) => r.documentId === doc.id).sort((a, b) => a.code.localeCompare(b.code));
      return {
        source,
        rows: reqs.map((r) => ({
          id: r.id,
          code: r.code,
          statement: r.statement,
          priority: r.priority,
          status: r.status,
          owner: r.ownerId ? nameOf(ctx, r.ownerId) : undefined,
          traced: r.tracedItemIds.map((id) => ({ id, title: plan.items.find((i) => i.id === id)?.title ?? id, rag: rag.items.get(id) ?? 'green' })),
        })),
        coverage: { traced: reqs.filter((r) => r.tracedItemIds.length > 0).length, total: reqs.length },
      };
    }
    case 'raci':
      return { source, matrix: deriveRaci(ctx, doc.id) };
    case 'stakeholders':
      return {
        source,
        rows: ctx.stakeholders
          .filter((s) => s.programId === plan.program.id)
          .map((s) => {
            const p = s.personId ? ctx.people.find((x) => x.id === s.personId) : undefined;
            return { name: p?.name ?? s.name ?? '—', org: p?.org ?? s.org, role: s.role ?? p?.title, influence: s.influence, interest: s.interest, attitude: s.attitude };
          })
          .sort((a, b) => b.influence * b.interest - a.influence * a.interest),
      };
    case 'comms_plan':
      return {
        source,
        rows: ctx.comms
          .filter((c) => c.programId === plan.program.id)
          .map((c) => ({ audience: c.audience, message: c.message, channel: c.channel, cadence: c.cadence, owner: nameOf(ctx, c.ownerId), ...(c.nextDue ? { nextDue: c.nextDue } : {}) })),
      };
  }
}

export function renderDocument(doc: ProjectDocument, ctx: DocContext): RenderedDocument {
  return {
    documentId: doc.id,
    version: 'live',
    sections: doc.sections.map((s) => ({ id: s.id, title: s.title, kind: s.kind, ...(s.body !== undefined ? { body: s.body } : {}), ...(s.live ? { data: renderLive(s.live.source, ctx, doc) } : {}) })),
  };
}

export function freezeVersion(doc: ProjectDocument, ctx: DocContext, id: string, approvedAt: string): DocumentVersion {
  const r = renderDocument(doc, ctx);
  return {
    id,
    documentId: doc.id,
    version: doc.version,
    approvedAt,
    approverIds: [...doc.approverIds],
    sections: doc.sections.map((s) => ({ ...s, rendered: r.sections.find((x) => x.id === s.id)?.data })),
  };
}

/** Approved version vs. now. */
export function documentDrift(doc: ProjectDocument, approved: DocumentVersion | undefined, now: RenderedDocument): DocDrift {
  if (!approved) return { approvedVersion: null, changedSectionIds: [], material: false, summary: [] };
  const changed: string[] = [];
  const summary: string[] = [];
  let material = false;
  for (const s of approved.sections) {
    const cur = now.sections.find((x) => x.id === s.id);
    if (!cur) continue;
    const before = s.kind === 'live' ? (s.rendered as LiveData | undefined) : undefined;
    const after = cur.data;
    if (s.kind === 'narrative' ? (s.body ?? '') !== (cur.body ?? '') : JSON.stringify(before) !== JSON.stringify(after)) changed.push(s.id);
    if (before?.source === 'milestones' && after?.source === 'milestones') {
      for (const row of after.rows) {
        const was = before.rows.find((r) => r.id === row.id);
        if (was && row.date > was.date) {
          material = true;
          summary.push(`${row.title} moved later: ${was.date} → ${row.date}`);
        }
      }
    }
    if (before?.source === 'budget' && after?.source === 'budget' && before.totalEacCents > 0) {
      const delta = (after.totalEacCents - before.totalEacCents) / before.totalEacCents;
      if (Math.abs(delta) > 0.05) {
        material = true;
        summary.push(`EAC changed ${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`);
      }
    }
  }
  void doc;
  return { approvedVersion: approved.version, changedSectionIds: changed, material, summary };
}
