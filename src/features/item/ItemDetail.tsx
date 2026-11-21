import { ArrowLeft, ArrowRight, Bot, ClipboardCheck, Hash, Mail, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useDecideCr, useItem, useItemsById, useMe, useMessages, useMyRole, usePeople, usePost, useProposals, useRelations, useSchedule } from '@/api/queries';
import { can, actorFrom } from '@/domain/permissions';
import type { Item, Message } from '@/domain/types';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { fmtDateLong, humanize, money, timeAgo } from '@/ui/format';
import { Avatar, Badge } from '@/ui/primitives';
import { RagBadge } from '@/ui/Rag';
import { ChangeRequestCard, ProposalCard } from '../proposals/ProposalCard';
import { DependencyEditor } from './DependencyEditor';

const TYPE_LABEL: Record<Item['type'], string> = {
  task: 'Task',
  milestone: 'Milestone',
  gate: 'Stage gate',
  risk: 'Risk',
  issue: 'Issue',
  decision: 'Decision',
  assumption: 'Assumption',
  change: 'Change request',
  procurement: 'Procurement',
};

const SOURCE: Record<Message['source'], { label: string; icon: React.ReactNode; tone: 'neutral' | 'accent' | 'ai' | 'amber' | 'green' }> = {
  keel: { label: 'Keel', icon: <MessageSquare />, tone: 'neutral' },
  email: { label: 'Email', icon: <Mail />, tone: 'accent' },
  slack: { label: 'Slack', icon: <Hash />, tone: 'neutral' },
  teams: { label: 'Teams', icon: <MessageSquare />, tone: 'neutral' },
  jira: { label: 'Jira', icon: <MessageSquare />, tone: 'neutral' },
  github: { label: 'GitHub', icon: <MessageSquare />, tone: 'neutral' },
  system: { label: 'System', icon: <Bot />, tone: 'green' },
  checkin: { label: 'Check-in', icon: <ClipboardCheck />, tone: 'amber' },
  ai: { label: 'Keel AI', icon: <Bot />, tone: 'ai' },
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] text-subtle">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export function ItemDetail({ programId, itemId, onOpen }: { programId: string; itemId: string; onOpen?: (id: string) => void }) {
  const item = useItem(programId, itemId);
  const schedule = useSchedule(programId).data;
  const items = useItemsById(programId);
  const relations = useRelations(programId).data ?? [];
  const messages = useMessages(programId, { kind: 'item', id: itemId }).data ?? [];
  const proposals = useProposals(programId).data ?? [];
  const people = usePeople(programId);
  const me = useMe().data;
  const role = useMyRole(programId);
  const post = usePost();
  const decide = useDecideCr();
  const [draft, setDraft] = useState('');

  if (item.isError) return <p className="p-4 text-muted">You don’t have access to this item, or it no longer exists.</p>;
  const it = item.data;
  if (!it || !schedule) return <p className="p-4 text-muted">Loading…</p>;

  const n = schedule.nodes.find((x) => x.itemId === it.id);
  const proc = schedule.procurement[it.id];
  const rag = schedule.rag.items[it.id];
  const varc = schedule.variance[it.id];
  const preds = relations.filter((r) => r.toId === it.id && (r.kind === 'FS' || r.kind === 'SS'));
  const succs = relations.filter((r) => r.fromId === it.id && (r.kind === 'FS' || r.kind === 'SS'));
  const msgIds = new Set(messages.map((m) => m.id));
  const related = proposals.filter((p) => p.sources.some((s) => msgIds.has(s.id)) || p.changes.some((c) => 'itemId' in c && c.itemId === it.id));
  const slack = n?.deadlineFloatHalfDays;
  const actor = actorFrom(me?.memberships.find((m) => m.programId === programId));
  const link = (id: string, label?: string) =>
    onOpen ? (
      <button type="button" onClick={() => onOpen(id)} className="text-left hover:underline">
        {label ?? items.get(id)?.title ?? id}
      </button>
    ) : (
      <Link to={`/p/${programId}/items/${id}`} className="hover:underline">
        {label ?? items.get(id)?.title ?? id}
      </Link>
    );

  const send = () => {
    if (!draft.trim()) return;
    post.mutate({ container: { kind: 'item', id: it.id }, body: draft.trim() }, { onSuccess: () => setDraft('') });
  };

  return (
    <div className="space-y-4" data-testid="item-detail">
      <header>
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
          <Badge>{TYPE_LABEL[it.type]}</Badge>
          {schedule.wbs[it.id] && <span>WBS {schedule.wbs[it.id]}</span>}
          <RagBadge rag={rag} />
          {n?.critical && <Badge tone="red">Critical path</Badge>}
          <span className="capitalize">· {it.status.replace('_', ' ')}</span>
        </div>
        <h2 className="mt-1 text-[17px] font-semibold leading-snug">{it.title}</h2>
        {it.ownerId && (
          <div className="mt-1 flex items-center gap-1.5 text-muted">
            {people.get(it.ownerId) && <Avatar name={people.get(it.ownerId)!.name} color={people.get(it.ownerId)!.avatarColor} size={18} />}
            {people.get(it.ownerId)?.name ?? it.ownerId}
          </div>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-3">
        {it.type === 'procurement' && proc && (
          <>
            <Fact label="Supplier">{it.supplier}</Fact>
            <Fact label="PO">
              {it.poNumber} · {can(actor, 'budget.view') ? money(it.poValueCents) : '—'}
            </Fact>
            <Fact label="Status">
              <span className="capitalize">{it.deliveryStatus.replace('_', ' ')}</span>
            </Fact>
            <Fact label="Delivery">{fmtDateLong(proc.delivery)}</Fact>
            <Fact label="Need by">{fmtDateLong(proc.needBy)}</Fact>
            <Fact label="Order by">{fmtDateLong(proc.orderBy)}</Fact>
            <Fact label="Float">{proc.floatDays} days</Fact>
            <Fact label="Slack to deadline">{proc.deadlineFloatDays === null ? '—' : `${proc.deadlineFloatDays} days`}</Fact>
            <Fact label="Lead time">{it.leadTimeDays} days</Fact>
          </>
        )}
        {(it.type === 'task' || it.type === 'milestone' || it.type === 'gate') && n && (
          <>
            <Fact label={it.type === 'task' ? 'Start' : 'Date'}>{fmtDateLong(n.es)}</Fact>
            {it.type === 'task' && <Fact label="Finish">{fmtDateLong(n.ef)}</Fact>}
            {it.type === 'task' && n.kind === 'leaf' && <Fact label="Duration">{it.durationHalfDays / 2} days</Fact>}
            {'deadline' in it && it.deadline && <Fact label="Deadline">{fmtDateLong(it.deadline)}</Fact>}
            <Fact label="Slack to deadline">
              <span className={cn(slack !== null && slack !== undefined && slack < 0 && 'text-red')}>{slack === null || slack === undefined ? '—' : `${slack / 2} days`}</span>
            </Fact>
            <Fact label="Total float">{n.totalFloatHalfDays / 2} days</Fact>
            {varc && <Fact label="vs baseline">{varc.finishDays > 0 ? `+${varc.finishDays}` : varc.finishDays} days</Fact>}
            <Fact label="Complete">{it.percentComplete}%</Fact>
          </>
        )}
        {it.type === 'task' && it.storyPoints !== undefined && (
          <>
            <Fact label="Story points">{it.storyPoints}</Fact>
            <Fact label="Sprint">{it.sprintId ? it.sprintId.replace(/^spr_[a-z]+_/, 'Sprint ') : 'Backlog'}</Fact>
            {it.externalRef && (
              <Fact label={it.externalRef.system === 'jira' ? 'Jira' : 'GitHub'}>
                <a href={it.externalRef.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {it.externalRef.key}
                </a>
              </Fact>
            )}
          </>
        )}
        {it.type === 'decision' && (
          <>
            <Fact label="Outcome">{it.outcome ?? 'Not decided yet'}</Fact>
            <Fact label="Options">{it.options.length ? it.options.join(' · ') : '—'}</Fact>
          </>
        )}
        {it.type === 'issue' && (
          <Fact label="Severity">
            <span className={cn('capitalize', it.severity === 'critical' && 'text-red')}>{it.severity}</span>
          </Fact>
        )}
        {it.type === 'risk' && (
          <>
            <Fact label="Probability × impact">
              {it.probability} × {it.impact} = {it.probability * it.impact}
            </Fact>
            <Fact label="Severity · probability">
              {it.impact} · {it.probability}
            </Fact>
            {it.trigger && <Fact label="Trigger">{humanize(it.trigger)}</Fact>}
          </>
        )}
        {it.type === 'change' && (
          <>
            <Fact label="Cost">{money(it.costDeltaCents)}</Fact>
            <Fact label="State">
              <span className="capitalize">{it.state}</span>
            </Fact>
            <Fact label="Approvers">{it.approverIds.map((a) => people.get(a)?.name ?? a).join(', ')}</Fact>
          </>
        )}
      </dl>

      {it.type === 'risk' && (
        <div className="space-y-2">
          {it.description && <p className="text-muted">{it.description}</p>}
          {it.mitigation && (
            <p>
              <span className="font-semibold">Mitigation: </span>
              {it.mitigation}
            </p>
          )}
          {it.contingency && (
            <p>
              <span className="font-semibold text-accent">Plan B: </span>
              {it.contingency}
            </p>
          )}
        </div>
      )}

      {it.type === 'gate' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(['entryCriteria', 'exitCriteria'] as const).map((k) => (
            <div key={k}>
              <h3 className="mb-1 text-[12px] font-semibold text-subtle">{k === 'entryCriteria' ? 'Entry criteria' : 'Exit criteria'}</h3>
              <ul className="space-y-0.5">
                {it[k].map((c) => (
                  <li key={c.id} className="flex gap-1.5">
                    <ShieldCheck className={cn('mt-0.5 size-3.5 shrink-0', c.done ? 'text-green' : 'text-subtle')} aria-hidden /> {c.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {it.type === 'change' && (
        <ChangeRequestCard
          cr={it}
          programId={programId}
          canDecide={can(actor, 'changeRequest.decide', it)}
          busy={decide.isPending}
          onDecide={(d) => decide.mutate({ id: it.id, decision: d })}
        />
      )}

      {(preds.length > 0 || succs.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { title: 'Depends on', list: preds, other: (r: (typeof preds)[number]) => r.fromId, icon: <ArrowLeft className="size-3.5" /> },
            { title: 'Drives', list: succs, other: (r: (typeof preds)[number]) => r.toId, icon: <ArrowRight className="size-3.5" /> },
          ].map((g) => (
            <div key={g.title}>
              <h3 className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-subtle">
                {g.icon} {g.title}
              </h3>
              <ul className="space-y-0.5">
                {g.list.map((r) => (
                  <li key={r.id} className="flex items-center gap-1.5">
                    <span className="w-14 shrink-0 text-[11px] text-subtle">
                      {r.kind}
                      {r.lagHalfDays ? ` ${r.lagHalfDays > 0 ? '+' : ''}${r.lagHalfDays / 2}d` : ''}
                    </span>
                    <span className="min-w-0 truncate">{g.other(r).startsWith('wst_') ? 'Agile workstream delivery' : link(g.other(r))}</span>
                  </li>
                ))}
                {g.list.length === 0 && <li className="text-subtle">—</li>}
              </ul>
            </div>
          ))}
        </div>
      )}

      {(role === 'pm' || role === 'lead') && (it.type === 'task' || it.type === 'milestone' || it.type === 'gate') && <DependencyEditor item={it} items={items} relations={relations} />}

      <section aria-label="Stream">
        <h3 className="mb-2 text-[12px] font-semibold text-subtle">Stream: messages, email, check-ins and changes</h3>
        <ol className="space-y-2.5">
          {messages.map((m) => {
            const src = SOURCE[m.source];
            const author = m.authorId ? people.get(m.authorId) : undefined;
            const linked = related.filter((p) => p.sources.some((s) => s.id === m.id));
            return (
              <li key={m.id} data-testid="stream-message">
                <div className={cn('rounded-lg border p-2.5', m.source === 'system' ? 'border-green/30 bg-green-subtle' : 'border-border bg-surface')}>
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
                    {author && <Avatar name={author.name} color={author.avatarColor} size={18} />}
                    <span className="font-medium text-text">{author?.name ?? (m.source === 'system' ? 'Keel' : (m.email?.from ?? 'Unknown'))}</span>
                    <Badge tone={src.tone} className="[&_svg]:size-3">
                      {src.icon}
                      {src.label}
                    </Badge>
                    {m.visibility === 'pm_only' && <Badge tone="amber">Private to PM</Badge>}
                    <span>· {timeAgo(m.createdAt)}</span>
                  </div>
                  {m.email && <div className="mb-0.5 text-[12.5px] font-medium">{m.email.subject}</div>}
                  <p className="whitespace-pre-wrap">{humanize(m.body)}</p>
                </div>
                {linked.map((p) => (
                  <div key={p.id} className="ml-4 mt-1.5 border-l-2 border-ai/40 pl-3">
                    <ProposalCard proposal={p} programId={programId} compact={p.state !== 'pending'} />
                  </div>
                ))}
              </li>
            );
          })}
          {related
            .filter((p) => !p.sources.some((s) => msgIds.has(s.id)))
            .map((p) => (
              <li key={p.id}>
                <ProposalCard proposal={p} programId={programId} compact={p.state !== 'pending'} />
              </li>
            ))}
          {messages.length === 0 && related.length === 0 && <li className="text-subtle">No conversation on this item yet.</li>}
        </ol>
        {role !== 'exec' && (
          <div className="mt-3 flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
              }}
              placeholder="Write an update… (Ctrl+Enter to send)"
              aria-label="Message"
              rows={2}
              className="min-h-[52px] flex-1 resize-y rounded-md border border-border-strong bg-surface p-2 outline-none focus:border-accent"
            />
            <Button variant="primary" onClick={send} disabled={!draft.trim() || post.isPending} aria-label="Send">
              <Send />
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
