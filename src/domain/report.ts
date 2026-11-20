// Status report drafting from plan facts (docs/SPEC §6.6). Every line cites its sources.
// The scripted/default drafter is fully deterministic; a live model may rephrase lines
// but must keep the same sources (docs/ai.md §4).
import { computeEvm, evmRag } from './evm';
import { money } from './narrative';
import { isEvent, type PlanState } from './plan';
import type { RagReport } from './rag';
import type { ScheduleResult } from './scheduling/schedule';
import type { DigestEntry, Item, Proposal, Rag, ReportSection } from './types';

export interface ReportInput {
  plan: PlanState;
  result: ScheduleResult;
  rag: RagReport;
  period: { start: string; end: string };
  /** Proposals and change requests decided in the period. */
  proposals: readonly Proposal[];
  digest: readonly DigestEntry[];
}

const RAG_LABEL: Record<Rag, string> = { green: 'Green', amber: 'Amber', red: 'Red' };

export function draftReport({ plan, result, rag, period, proposals, digest }: ReportInput): ReportSection[] {
  let n = 0;
  const line = (text: string, sources: ReportSection['lines'][number]['sources'] = []) => ({ id: `l${++n}`, text, sources });
  const items = new Map(plan.items.map((i) => [i.id, i]));
  const ws = new Map(plan.workstreams.map((w) => [w.id, w]));
  const evm = computeEvm(plan, result, plan.asOf);
  const inPeriod = (at: string) => at.slice(0, 10) >= period.start && at.slice(0, 10) <= period.end;

  const gates = plan.items
    .filter((i): i is Extract<Item, { type: 'gate' | 'milestone' }> => isEvent(i))
    .map((i) => ({ item: i, node: result.nodes.get(i.id)! }))
    .filter((g) => g.node && g.item.status !== 'done')
    .sort((a, b) => a.node.slots.es - b.node.slots.es);
  const atRisk = gates.filter((g) => rag.items.get(g.item.id) !== 'green');
  const nextGate = gates[0];
  const approved = proposals.filter((p) => (p.state === 'approved' || p.state === 'edited_approved') && p.decidedAt && inPeriod(p.decidedAt));

  // Summary
  const summary: ReportSection['lines'] = [
    line(
      `Overall status ${RAG_LABEL[rag.program]}. ${atRisk.length ? `${atRisk.length} milestone${atRisk.length > 1 ? 's' : ''} at risk` : 'All milestones on track'}${nextGate ? `; next gate ${nextGate.item.title} on ${nextGate.node.es}` : ''}.`,
      atRisk.map((g) => ({ kind: 'item' as const, id: g.item.id })),
    ),
  ];
  for (const p of approved.slice(0, 3)) summary.push(line(`Approved: ${p.summary}`, [{ kind: 'proposal', id: p.id }, ...p.sources.filter((s) => s.kind === 'message').map((s) => ({ kind: 'message' as const, id: s.id }))]));

  // RAG by workstream
  const ragLines = plan.workstreams.map((w) => {
    const r = rag.workstreams.get(w.id) ?? 'green';
    const e = evm.byWorkstream[w.id];
    const spi = e?.spi !== null && e?.spi !== undefined ? ` · SPI ${e.spi.toFixed(2)}` : '';
    return line(`${w.name}: ${RAG_LABEL[r]}${spi}`, []);
  });

  // Milestones
  const msLines = gates.slice(0, 6).map((g) => {
    const r = rag.items.get(g.item.id) ?? 'green';
    const slack = g.node.deadlineFloatHalfDays;
    const dl = g.item.deadline ? ` (deadline ${g.item.deadline}${slack !== null ? `, ${slack >= 0 ? `${slack / 2} days slack` : `${-slack / 2} days late`}` : ''})` : '';
    return line(`${g.item.title}: ${g.node.es}${dl} · ${RAG_LABEL[r]}`, [{ kind: 'item', id: g.item.id }]);
  });

  // Critical path
  const critical = [...result.nodes.values()].filter((nd) => nd.critical && nd.kind !== 'summary' && nd.slots.ef > result.calendar.toSlot(plan.asOf, 'start'));
  const byWs = new Map<string, number>();
  for (const nd of critical) {
    const w = items.get(nd.itemId)?.workstreamId;
    if (w) byWs.set(w, (byWs.get(w) ?? 0) + 1);
  }
  const cpLines = [
    line(`Program finish ${result.projectFinish}. Critical path runs through ${[...byWs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => ws.get(w)?.name).join(', ')}.`, critical.slice(0, 3).map((c) => ({ kind: 'item' as const, id: c.itemId }))),
    ...digest.filter((d) => d.group === 'schedule' && inPeriod(d.at)).slice(0, 4).map((d) => line(d.text, d.itemIds.map((id) => ({ kind: 'item' as const, id })))),
  ];

  // Budget & EVM
  const e = evm.program;
  const budget = [
    line(
      `BAC ${money(e.bacCents)} · EAC ${money(e.eacCents)} (VAC ${money(e.vacCents)}) · committed ${money(e.committedCents)} · actual ${money(e.acCents)}.`,
    ),
    line(`CPI ${e.cpi?.toFixed(2) ?? '—'} (${evmRag(e.cpi) ?? 'n/a'}) · SPI ${e.spi?.toFixed(2) ?? '—'} (${evmRag(e.spi) ?? 'n/a'}).`),
    ...digest.filter((d) => d.group === 'budget' && inPeriod(d.at)).map((d) => line(d.text, d.sourceIds.map((id) => ({ kind: 'proposal' as const, id })))),
  ];

  // Risks
  const risks = plan.items
    .filter((i): i is Extract<Item, { type: 'risk' }> => i.type === 'risk' && i.status !== 'done' && i.status !== 'cancelled')
    .sort((a, b) => b.probability * b.impact - a.probability * a.impact)
    .slice(0, 5)
    .map((r) => line(`${r.title} (P${r.probability}×I${r.impact})${r.mitigation ? `: ${r.mitigation}` : ''}`, [{ kind: 'item', id: r.id }]));

  // Decisions
  const decisions = [
    ...approved.filter((p) => p.origin !== 'checkin').map((p) => line(`Decided: ${p.summary}`, [{ kind: 'proposal', id: p.id }])),
    ...plan.items
      .filter((i): i is Extract<Item, { type: 'change' }> => i.type === 'change' && i.state === 'applied' && i.approvals.some((a) => inPeriod(a.at)))
      .map((cr) => line(`${cr.title} approved (${money(cr.costDeltaCents)})`, [{ kind: 'item', id: cr.id }])),
  ];

  // Asks
  const asks = [
    ...atRisk.filter((g) => rag.items.get(g.item.id) === 'red').map((g) => line(`Decision needed to protect ${g.item.title}.`, [{ kind: 'item', id: g.item.id }])),
    ...plan.items
      .filter((i): i is Extract<Item, { type: 'change' }> => i.type === 'change' && i.state === 'submitted')
      .map((cr) => line(`Approve ${cr.title} (${money(cr.costDeltaCents)}).`, [{ kind: 'item', id: cr.id }])),
  ];

  // Next period
  const nextEnd = period.end;
  const upcoming = [...result.nodes.values()]
    .filter((nd) => nd.kind === 'leaf' && nd.es > nextEnd && nd.es <= addWeek(nextEnd) && nd.critical)
    .slice(0, 5)
    .map((nd) => line(`Start: ${items.get(nd.itemId)?.title} (${nd.es})`, [{ kind: 'item', id: nd.itemId }]));

  const none = (lines: ReportSection['lines'], text: string) => (lines.length ? lines : [line(text)]);
  return [
    { key: 'summary', title: 'Executive summary', lines: summary },
    { key: 'rag', title: 'Status by workstream', lines: ragLines },
    { key: 'milestones', title: 'Milestones & gates', lines: none(msLines, 'No open milestones.') },
    { key: 'critical_path', title: 'Critical path', lines: cpLines },
    { key: 'budget', title: 'Budget & earned value', lines: budget },
    { key: 'risks', title: 'Top risks', lines: none(risks, 'No open risks.') },
    { key: 'decisions', title: 'Decisions this period', lines: none(decisions, 'No decisions this period.') },
    { key: 'asks', title: 'Asks & escalations', lines: none(asks, 'No escalations.') },
    { key: 'next', title: 'Next period (critical starts)', lines: none(upcoming, 'No critical-path starts next week.') },
  ];
}

function addWeek(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}
