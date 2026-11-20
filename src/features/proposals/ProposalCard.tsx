import { ArrowRight, Check, GitBranch, Pencil, Quote, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useApprove, useItemsById, useMyRole, usePreview, useReject } from '@/api/queries';
import type { ChangeRequest, Impact, Item, PlanChange, Proposal } from '@/domain/types';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { humanize, money, timeAgo } from '@/ui/format';
import { Badge } from '@/ui/primitives';
import { RagBadge } from '@/ui/Rag';

const ORIGIN: Record<Proposal['origin'], string> = { ai: 'Suggested by Keel', checkin: 'From a check-in', connector: 'From a connector', ask_keel: 'Ask Keel', person: 'Proposed' };

/** The computed consequences of a set of changes (never model-generated). */
export function ImpactView({ impact, items, programId, compact }: { impact: Impact; items: Map<string, Item>; programId: string; compact?: boolean }) {
  const slips = [...impact.milestoneSlips].sort((a, b) => Math.abs(b.days) - Math.abs(a.days));
  const ragTo = new Map(impact.ragChanges.map((r) => [r.itemId, r]));
  const otherRag = impact.ragChanges.filter((r) => !slips.some((s) => s.itemId === r.itemId) && items.get(r.itemId)?.type !== 'task');
  const name = (id: string) => items.get(id)?.title ?? id;
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-surface-2 p-2.5 text-[12.5px]" data-testid="impact">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
        <GitBranch className="size-3.5" aria-hidden /> Computed impact
      </div>
      {slips.slice(0, compact ? 2 : 5).map((s) => {
        const r = ragTo.get(s.itemId);
        return (
          <div key={s.itemId} className="flex flex-wrap items-center gap-1.5">
            <Link to={`/p/${programId}/items/${s.itemId}`} className="font-medium hover:underline">
              {name(s.itemId)}
            </Link>
            <span className={cn('font-semibold tabular-nums', s.days > 0 ? 'text-red' : 'text-green')}>
              {s.days > 0 ? '+' : ''}
              {s.days} working days
            </span>
            {r && (
              <span className="inline-flex items-center gap-1">
                <RagBadge rag={r.from} />
                <ArrowRight className="size-3 text-subtle" aria-hidden />
                <RagBadge rag={r.to} />
              </span>
            )}
          </div>
        );
      })}
      {!compact &&
        otherRag.slice(0, 3).map((r) => (
          <div key={r.itemId} className="flex items-center gap-1.5">
            <span>{name(r.itemId)}</span>
            <RagBadge rag={r.from} />
            <ArrowRight className="size-3 text-subtle" aria-hidden />
            <RagBadge rag={r.to} />
          </div>
        ))}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
        <span>
          {impact.moved.length} item{impact.moved.length === 1 ? '' : 's'} move
        </span>
        {impact.criticalPathChanged && <span className="font-medium text-critical">Critical path changes</span>}
        {impact.costDeltaCents !== 0 && <span>Cost {impact.costDeltaCents > 0 ? '+' : ''}{money(impact.costDeltaCents)}</span>}
        {impact.evm && Math.abs(impact.evm.eacToCents - impact.evm.eacFromCents) > 0 && (
          <span>
            EAC {money(impact.evm.eacFromCents)} → {money(impact.evm.eacToCents)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Inline editor for "Edit & approve": dates and durations only (v1). */
function ChangeEditor({ changes, onChange }: { changes: PlanChange[]; onChange: (c: PlanChange[]) => void }) {
  return (
    <div className="space-y-1.5">
      {changes.map((c, i) => {
        if (c.op === 'set_delivery')
          return (
            <label key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className="text-muted">New delivery date</span>
              <input
                type="date"
                value={c.expectedDelivery}
                onChange={(e) => onChange(changes.map((x, j) => (j === i ? { ...c, expectedDelivery: e.target.value } : x)))}
                className="h-7 rounded border border-border-strong bg-surface px-1.5"
              />
            </label>
          );
        if (c.op === 'set_dates' && c.durationHalfDays !== undefined)
          return (
            <label key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className="text-muted">Duration (days)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={c.durationHalfDays / 2}
                onChange={(e) => onChange(changes.map((x, j) => (j === i ? { ...c, durationHalfDays: Math.round(Number(e.target.value) * 2) } : x)))}
                className="h-7 w-20 rounded border border-border-strong bg-surface px-1.5"
              />
            </label>
          );
        return null;
      })}
    </div>
  );
}

export function ProposalCard({ proposal, programId, compact }: { proposal: Proposal; programId: string; compact?: boolean }) {
  const items = useItemsById(programId);
  const role = useMyRole(programId);
  const approve = useApprove();
  const reject = useReject();
  const [editing, setEditing] = useState<PlanChange[] | null>(null);
  const preview = usePreview(programId, editing ?? undefined);
  const pending = proposal.state === 'pending';
  const editable = proposal.changes.some((c) => c.op === 'set_delivery' || (c.op === 'set_dates' && c.durationHalfDays !== undefined));
  const busy = approve.isPending || reject.isPending;
  const impact = editing && preview.data ? preview.data : proposal.impact;

  return (
    <article
      className={cn('rounded-lg border bg-surface p-3', pending ? 'border-ai/40 shadow-[0_0_0_3px_var(--k-ai-subtle)]' : 'border-border')}
      aria-label={`Proposal: ${proposal.summary}`}
      data-testid="proposal-card"
    >
      <header className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
        <Badge tone="ai">
          <Sparkles className="size-3" aria-hidden />
          {ORIGIN[proposal.origin]}
        </Badge>
        {proposal.confidence !== undefined && <span>{Math.round(proposal.confidence * 100)}% confidence</span>}
        <span>· {timeAgo(proposal.createdAt)}</span>
        {!pending && (
          <Badge tone={proposal.state === 'rejected' ? 'neutral' : 'green'} className="ml-auto">
            {proposal.state.replace('_', ' ')}
          </Badge>
        )}
      </header>
      <p className="font-medium leading-snug">{humanize(proposal.summary)}</p>
      {!compact && <p className="mt-1 text-muted">{humanize(proposal.rationale)}</p>}
      {!compact &&
        proposal.sources
          .filter((s) => s.quote)
          .map((s) => (
            <blockquote key={s.id} className="mt-1.5 flex gap-1.5 border-l-2 border-border-strong pl-2 text-[12.5px] italic text-muted">
              <Quote className="mt-0.5 size-3 shrink-0" aria-hidden />
              {humanize(s.quote!)}
            </blockquote>
          ))}
      <div className="mt-2">
        <ImpactView impact={impact} items={items} programId={programId} compact={compact} />
      </div>
      {pending && editing && (
        <div className="mt-2">
          <ChangeEditor changes={editing} onChange={setEditing} />
        </div>
      )}
      {pending &&
        (role === 'pm' ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => approve.mutate({ id: proposal.id, edited: editing ?? undefined })}>
              <Check /> {editing ? 'Approve edited' : 'Approve'}
            </Button>
            {editable && !editing && (
              <Button size="sm" disabled={busy} onClick={() => setEditing(structuredClone(proposal.changes))}>
                <Pencil /> Edit &amp; approve
              </Button>
            )}
            {editing && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Cancel edit
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => reject.mutate(proposal.id)}>
              <X /> Reject
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-subtle">Waiting for the program manager’s decision.</p>
        ))}
    </article>
  );
}

export function ChangeRequestCard({ cr, programId, canDecide, onDecide, busy }: { cr: ChangeRequest; programId: string; canDecide: boolean; onDecide: (d: 'approve' | 'reject') => void; busy?: boolean }) {
  const items = useItemsById(programId);
  const preview = usePreview(programId, cr.state === 'submitted' ? cr.changes : undefined);
  return (
    <article className={cn('rounded-lg border bg-surface p-3', cr.state === 'submitted' ? 'border-amber/50' : 'border-border')} data-testid="cr-card" aria-label={cr.title}>
      <header className="mb-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
        <Badge tone="amber">Change request</Badge>
        <span>{money(cr.costDeltaCents)}</span>
        <span>· {cr.state}</span>
      </header>
      <Link to={`/p/${programId}/items/${cr.id}`} className="font-medium hover:underline">
        {cr.title}
      </Link>
      <p className="mt-1 text-muted">{cr.scopeDelta}</p>
      {preview.data && (
        <div className="mt-2">
          <ImpactView impact={preview.data} items={items} programId={programId} />
        </div>
      )}
      {cr.state === 'submitted' &&
        (canDecide ? (
          <div className="mt-2.5 flex gap-1.5">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => onDecide('approve')}>
              <Check /> Approve {cr.title.split(' · ')[0]}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide('reject')}>
              <X /> Reject
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-subtle">Waiting for approval from {cr.approverIds.length} approver{cr.approverIds.length === 1 ? '' : 's'}.</p>
        ))}
    </article>
  );
}
