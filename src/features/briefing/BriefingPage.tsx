import { AlertTriangle, CalendarClock, ClipboardCheck, Flag, Inbox, Sparkles, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useDecideCr, useDigest, useEvm, useItems, useMe, useMyRole, usePeople, useProposals, useSchedule, useWorkstreams, useCheckins } from '@/api/queries';
import { addDays } from '@/domain/dates';
import { evmRag } from '@/domain/evm';
import type { ChangeRequest, Item, Rag } from '@/domain/types';
import { cn } from '@/ui/cn';
import { fmtDate, humanize, money, timeAgo } from '@/ui/format';
import { Badge, EmptyState } from '@/ui/primitives';
import { RagBadge, RagDot } from '@/ui/Rag';
import { ChangeRequestCard, ProposalCard } from '../proposals/ProposalCard';

function Panel({ title, icon, children, action, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-border bg-surface', className)} aria-label={title}>
      <header className="flex h-10 items-center gap-2 border-b border-border px-3">
        <span className="text-subtle [&_svg]:size-4">{icon}</span>
        <h2 className="text-[13px] font-semibold">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Tile({ label, value, rag, sub }: { label: string; value: string; rag?: Rag | null; sub?: string }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="flex items-center gap-1.5 text-[11.5px] text-subtle">
        {rag && <RagDot rag={rag} />}
        {label}
      </div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11.5px] text-subtle">{sub}</div>}
    </div>
  );
}

export function BriefingPage() {
  const { programId = '' } = useParams();
  const me = useMe().data;
  const role = useMyRole(programId);
  const items = useItems(programId).data;
  const schedule = useSchedule(programId).data;
  const proposals = useProposals(programId).data ?? [];
  const evm = useEvm(programId, role !== 'guest' && !!items?.length).data;
  const people = usePeople(programId);
  const workstreams = useWorkstreams(programId).data ?? [];
  const checkins = useCheckins(programId).data ?? [];
  const since = schedule ? addDays(schedule.asOf, -14) : '0000-00-00';
  const digest = useDigest(programId, since).data ?? [];
  const decide = useDecideCr();

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);

  if (items && items.length === 0) {
    return (
      <EmptyState icon={<CalendarClock />} title="No plan yet">
        This program’s plan arrives in a later build phase. Switch to <strong>Titan-1</strong> to see the full demo.
      </EmptyState>
    );
  }
  if (!items || !schedule || !me) return <div className="p-6 text-muted">Loading…</div>;

  if (role === 'guest') {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4 sm:p-6">
        <h2 className="text-[15px] font-semibold">Shared with you</h2>
        <p className="text-muted">As an external guest you see only the items the program team shares with you.</p>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {items.map((i) => (
            <li key={i.id}>
              <Link to={`/p/${programId}/items/${i.id}`} className="flex items-center gap-2 px-3 py-2.5 hover:bg-surface-2">
                <RagDot rag={schedule.rag.items[i.id]} />
                <span className="font-medium">{i.title}</span>
                {i.type === 'procurement' && <span className="ml-auto text-muted">Delivery {fmtDate(schedule.procurement[i.id]?.delivery)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const pending = proposals.filter((p) => p.state === 'pending');
  const crs = items.filter((i): i is ChangeRequest => i.type === 'change' && i.state === 'submitted');
  const myCrs = crs.filter((c) => c.approverIds.includes(me.person.id));
  const otherCrs = crs.filter((c) => !c.approverIds.includes(me.person.id));
  const gates = schedule.nodes
    .filter((n) => byId.get(n.itemId)?.type === 'gate')
    .sort((a, b) => a.es.localeCompare(b.es));
  const risks = items
    .filter((i): i is Extract<Item, { type: 'risk' }> => i.type === 'risk' && i.status !== 'done')
    .sort((a, b) => b.probability * b.impact - a.probability * a.impact)
    .slice(0, 4);
  const lastRound = [...checkins].sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
  const answered = lastRound?.requests.filter((r) => r.answer) ?? [];
  const atRisk = answered.filter((r) => r.answer?.kind !== 'on_track');
  const needsCount = (role === 'pm' ? pending.length : 0) + myCrs.length;
  const e = evm?.program;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[18px] font-semibold">Good morning, {me.person.name.split(' ')[0]}</h2>
          <span className="text-muted">
            Week of {fmtDate(schedule.asOf)} · program <RagBadge rag={schedule.rag.program} /> · finish {fmtDate(schedule.projectFinish, schedule.asOf)}
          </span>
        </div>

        <Panel title="Needs you" icon={<Sparkles />} action={needsCount ? <Badge tone="ai">{needsCount}</Badge> : null}>
          {needsCount === 0 && otherCrs.length === 0 && (role !== 'pm' || pending.length === 0) && <p className="text-muted">Nothing needs your decision right now.</p>}
          <div className="space-y-3">
            {myCrs.map((cr) => (
              <ChangeRequestCard key={cr.id} cr={cr} programId={programId} canDecide busy={decide.isPending} onDecide={(d) => decide.mutate({ id: cr.id, decision: d })} />
            ))}
            {pending.map((p) => (
              <ProposalCard key={p.id} proposal={p} programId={programId} />
            ))}
            {otherCrs.map((cr) => (
              <ChangeRequestCard key={cr.id} cr={cr} programId={programId} canDecide={false} onDecide={() => {}} />
            ))}
          </div>
        </Panel>

        <Panel title="What changed (last 14 days)" icon={<TrendingUp />}>
          {digest.length === 0 ? (
            <p className="text-muted">No changes.</p>
          ) : (
            <ul className="space-y-2">
              {digest.slice(0, 12).map((d) => (
                <li key={d.id} className="flex gap-2">
                  <Badge tone={d.group === 'rag' ? 'amber' : d.group === 'budget' ? 'accent' : 'neutral'} className="mt-px w-[68px] justify-center capitalize">
                    {d.group}
                  </Badge>
                  <div className="min-w-0">
                    {d.itemIds[0] ? (
                      <Link to={`/p/${programId}/items/${d.itemIds[0]}`} className="hover:underline">
                        {humanize(d.text)}
                      </Link>
                    ) : (
                      humanize(d.text)
                    )}
                    <div className="text-[11.5px] text-subtle">{timeAgo(d.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="min-w-0 space-y-4">
        <Panel title="Stage gates" icon={<Flag />}>
          <ul className="space-y-1.5">
            {gates.map((g) => {
              const it = byId.get(g.itemId)!;
              const slack = g.deadlineFloatHalfDays;
              return (
                <li key={g.itemId} className="flex items-center gap-2">
                  <RagDot rag={schedule.rag.items[g.itemId]} />
                  <Link to={`/p/${programId}/items/${g.itemId}`} className="min-w-0 flex-1 truncate hover:underline" data-testid={`gate-${it.title.slice(0, 2)}`}>
                    {it.title}
                  </Link>
                  <span className="tabular-nums text-muted">{fmtDate(g.es, schedule.asOf)}</span>
                  <span className={cn('w-16 text-right text-[11.5px] tabular-nums', slack !== null && slack < 0 ? 'font-semibold text-red' : 'text-subtle')}>
                    {it.status === 'done' ? 'done' : slack === null ? '' : slack < 0 ? `${-slack / 2}d late` : `${slack / 2}d slack`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        {e && (
          <Panel title="Budget & earned value" icon={<TrendingUp />}>
            <div className="grid grid-cols-2 gap-2">
              <Tile label="CPI" value={e.cpi?.toFixed(2) ?? '—'} rag={evmRag(e.cpi)} sub="cost efficiency" />
              <Tile label="SPI" value={e.spi?.toFixed(2) ?? '—'} rag={evmRag(e.spi)} sub="schedule efficiency" />
              <Tile label="EAC" value={money(e.eacCents)} sub={`BAC ${money(e.bacCents)}`} />
              <Tile label="VAC" value={money(e.vacCents)} rag={e.vacCents < 0 ? 'amber' : 'green'} sub={`committed ${money(e.committedCents)}`} />
            </div>
            <ul className="mt-2 space-y-0.5 text-[12px]">
              {workstreams
                .filter((w) => evm?.byWorkstream[w.id]?.cpi && evmRag(evm.byWorkstream[w.id]!.cpi) !== 'green')
                .map((w) => (
                  <li key={w.id} className="flex items-center gap-1.5 text-muted">
                    <RagDot rag={evmRag(evm!.byWorkstream[w.id]!.cpi) ?? undefined} /> {w.name} CPI {evm!.byWorkstream[w.id]!.cpi!.toFixed(2)}
                  </li>
                ))}
            </ul>
          </Panel>
        )}

        <Panel title="Top risks" icon={<AlertTriangle />}>
          <ul className="space-y-1.5">
            {risks.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className={cn('w-9 rounded px-1 text-center text-[11px] font-semibold tabular-nums', r.probability * r.impact >= 12 ? 'bg-red-subtle text-red' : 'bg-amber-subtle text-amber')}>
                  {r.probability * r.impact}
                </span>
                <Link to={`/p/${programId}/items/${r.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {r.title}
                </Link>
                <span className="text-[11.5px] text-subtle">{people.get(r.ownerId ?? '')?.name.split(' ')[0]}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {lastRound && (
          <Panel title="Check-ins" icon={<ClipboardCheck />}>
            <p className="text-muted">
              Weekly round sent {fmtDate(lastRound.sentAt.slice(0, 10))}: {answered.length}/{lastRound.requests.length} answered
              {atRisk.length ? `, ${atRisk.length} at risk` : ''}.
            </p>
            <ul className="mt-1.5 space-y-1">
              {atRisk.map((r) => (
                <li key={r.itemId} className="flex items-center gap-1.5">
                  <RagDot rag="amber" />
                  <Link to={`/p/${programId}/items/${r.itemId}`} className="truncate hover:underline">
                    {byId.get(r.itemId)?.title}
                  </Link>
                  <span className="text-[11.5px] text-subtle">· {people.get(r.personId)?.name}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Link to={`/p/${programId}/mail`} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-muted hover:border-border-strong hover:text-text">
          <Inbox className="size-4" aria-hidden /> Mail triage
        </Link>
      </div>
    </div>
  );
}
