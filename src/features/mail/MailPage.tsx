import { Check, EyeOff, Inbox, Lock, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useDismissMail, useFileMail, useItems, useMail, useMyRole } from '@/api/queries';
import type { MailMessage } from '@/domain/types';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { humanize, timeAgo } from '@/ui/format';
import { Badge, EmptyState } from '@/ui/primitives';

const STATE_LABEL: Record<MailMessage['state'], string> = { unfiled: 'Unfiled', filed_private: 'Filed privately', filed_shared: 'Filed & shared', dismissed: 'Dismissed' };

export function MailPage() {
  const { programId = '' } = useParams();
  const role = useMyRole(programId);
  const mail = useMail().data;
  const itemsQ = useItems(programId).data;
  const items = useMemo(() => itemsQ ?? [], [itemsQ]);
  const file = useFileMail();
  const dismiss = useDismissMail();
  const [selectedId, setSelectedId] = useState<string>();
  const [target, setTarget] = useState<string>();

  const programItemIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const list = (mail ?? []).filter((m) => !m.suggestion || programItemIds.has(m.suggestion.itemId) || m.state === 'unfiled');
  const sel = list.find((m) => m.id === selectedId) ?? list.find((m) => m.state === 'unfiled') ?? list[0];
  const fileable = items.filter((i) => i.type === 'procurement' || i.type === 'gate' || i.type === 'milestone' || i.type === 'risk' || i.type === 'issue');
  const targetId = target ?? sel?.suggestion?.itemId;

  if (role !== 'pm') {
    return (
      <EmptyState icon={<Lock />} title="Mail triage is the program manager’s inbox">
        Keel syncs the PM’s mailbox and keeps every email private until the PM files and shares it. Switch persona to Alex Rivera to see it.
      </EmptyState>
    );
  }
  if (!mail) return <div className="p-6 text-muted">Loading…</div>;
  if (!list.length) return <EmptyState icon={<Inbox />} title="Inbox zero">No synced email.</EmptyState>;

  return (
    <div className="grid h-full min-h-0 md:grid-cols-[340px_minmax(0,1fr)]">
      <ul className="min-h-0 overflow-y-auto border-b border-border bg-surface md:border-b-0 md:border-r" aria-label="Synced mail">
        {list.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => {
                setSelectedId(m.id);
                setTarget(undefined);
              }}
              aria-current={sel?.id === m.id}
              className={cn('block w-full border-b border-border px-3 py-2.5 text-left hover:bg-surface-2', sel?.id === m.id && 'bg-accent-subtle')}
            >
              <div className="flex items-center gap-1.5">
                {m.state === 'unfiled' && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Unfiled" />}
                <span className={cn('truncate', m.state === 'unfiled' && 'font-semibold')}>{m.from}</span>
                <span className="ml-auto shrink-0 text-[11px] text-subtle">{timeAgo(m.receivedAt)}</span>
              </div>
              <div className="truncate text-[12.5px]">{m.subject}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-subtle">
                {m.suggestion && m.state === 'unfiled' && (
                  <Badge tone="ai">
                    <Sparkles className="size-3" aria-hidden /> Suggestion
                  </Badge>
                )}
                {m.state !== 'unfiled' && <span>{STATE_LABEL[m.state]}</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {sel && (
        <article className="min-h-0 overflow-y-auto p-4 sm:p-6" aria-label="Email">
          <div className="mx-auto max-w-2xl space-y-4">
            <header>
              <h2 className="text-[16px] font-semibold">{sel.subject}</h2>
              <div className="mt-1 text-[12.5px] text-muted">
                From <strong>{sel.from}</strong> to {sel.to.join(', ')}
                {sel.cc.length ? ` · cc ${sel.cc.join(', ')}` : ''} · {timeAgo(sel.receivedAt)}
              </div>
            </header>
            <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3">{humanize(sel.body)}</p>

            {sel.state === 'unfiled' ? (
              <section className="space-y-3 rounded-lg border border-ai/40 bg-ai-subtle p-3" aria-label="Filing">
                {sel.suggestion ? (
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="size-4 text-ai" aria-hidden />
                    <span>
                      Keel suggests filing this on <strong>{items.find((i) => i.id === sel.suggestion!.itemId)?.title}</strong>
                    </span>
                    <Badge tone="ai">{Math.round(sel.suggestion.confidence * 100)}% confidence</Badge>
                    <span className="w-full text-[12px] text-muted">Why: {sel.suggestion.reason}.</span>
                  </p>
                ) : (
                  <p className="text-muted">No confident match. Pick an item, or dismiss.</p>
                )}
                <label className="flex items-center gap-2 text-[12.5px]">
                  <span className="text-muted">File on</span>
                  <select value={targetId ?? ''} onChange={(e) => setTarget(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2">
                    <option value="" disabled>
                      Choose an item…
                    </option>
                    {fileable.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="primary" disabled={!targetId || file.isPending} onClick={() => targetId && file.mutate({ mailId: sel.id, itemId: targetId, share: true })}>
                    <Check /> File &amp; share
                  </Button>
                  <Button disabled={!targetId || file.isPending} onClick={() => targetId && file.mutate({ mailId: sel.id, itemId: targetId, share: false })}>
                    <EyeOff /> File privately
                  </Button>
                  <Button variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate(sel.id)}>
                    <Trash2 /> Dismiss
                  </Button>
                </div>
                <p className="text-[11.5px] text-muted">Emails stay private to you until you share them. “File privately” keeps it visible only to the PM on the item.</p>
              </section>
            ) : (
              <p className="flex items-center gap-2 text-muted">
                <Badge tone={sel.state === 'dismissed' ? 'neutral' : 'green'}>{STATE_LABEL[sel.state]}</Badge>
                {sel.filedMessageId && sel.suggestion && (
                  <Link className="text-accent hover:underline" to={`/p/${programId}/items/${target ?? sel.suggestion.itemId}`}>
                    Open the item thread →
                  </Link>
                )}
              </p>
            )}
          </div>
        </article>
      )}
    </div>
  );
}
