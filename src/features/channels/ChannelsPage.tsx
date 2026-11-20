import { ArrowUpRight, Hash, Lock, MessageSquare, Send, Sparkles } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useChannels, useMessages, useMyRole, usePeople, usePost, usePromote, useSuggestPromotion, useWorkstreams } from '@/api/queries';
import type { PromotionDraft } from '@/domain/promotion';
import type { Channel, Message } from '@/domain/types';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { humanize, timeAgo } from '@/ui/format';
import { Avatar, Badge, EmptyState } from '@/ui/primitives';

type DraftType = 'task' | 'risk' | 'issue' | 'decision' | 'assumption';
const TYPES: { value: DraftType; label: string }[] = [
  { value: 'task', label: 'Task' },
  { value: 'risk', label: 'Risk' },
  { value: 'issue', label: 'Issue' },
  { value: 'decision', label: 'Decision' },
  { value: 'assumption', label: 'Assumption' },
];

const bridgeLabel = (c: Channel) => (c.bridge?.system === 'slack' ? 'Slack' : c.bridge?.system === 'teams' ? 'Teams' : null);

function PromoteForm({ programId, message, draft, onClose }: { programId: string; message: Message; draft: PromotionDraft; onClose: () => void }) {
  const workstreams = useWorkstreams(programId).data ?? [];
  const promote = usePromote();
  const [type, setType] = useState<DraftType>(draft.type);
  const [title, setTitle] = useState(draft.title);
  const [ws, setWs] = useState(draft.workstreamId);
  const [created, setCreated] = useState<string>();

  const submit = () =>
    promote.mutate({ messageId: message.id, draft: { ...draft, type, title, workstreamId: ws } }, { onSuccess: (item) => setCreated(item.id) });

  if (created) {
    return (
      <div className="mt-4 space-y-3">
        <p className="font-medium text-green">Created. The new item links back to this message.</p>
        <div className="flex gap-2">
          <Button asChild variant="primary">
            <Link to={`/p/${programId}/items/${created}`}>
              Open item <ArrowUpRight />
            </Link>
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Item type">
        {TYPES.map((t) => (
          <button key={t.value} type="button" role="radio" aria-checked={type === t.value} onClick={() => setType(t.value)} className={cn('h-7 rounded-md border px-2.5 text-[12.5px]', type === t.value ? 'border-accent bg-accent-subtle font-medium text-accent' : 'border-border hover:bg-surface-2')}>
            {t.label}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-[12px] text-muted">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong bg-surface px-2" />
      </label>
      <label className="block">
        <span className="text-[12px] text-muted">Workstream</span>
        <select value={ws} onChange={(e) => setWs(e.target.value)} className="mt-0.5 h-8 w-full rounded-md border border-border-strong bg-surface px-2">
          {workstreams.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      {draft.options?.length ? <p className="text-[12px] text-muted">Options: {draft.options.join(' · ')}</p> : null}
      {promote.isError && <p className="text-[12.5px] text-red">{(promote.error as Error).message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={!title.trim() || !ws || promote.isPending}>
          Create {TYPES.find((t) => t.value === type)?.label.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

function PromoteDialog({ programId, message, onClose }: { programId: string; message?: Message; onClose: () => void }) {
  const suggestion = useSuggestPromotion(programId, message?.id);
  return (
    <Dialog.Root open={!!message} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <Dialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 rounded-lg border border-border bg-surface p-4 shadow-pop" aria-describedby="promote-desc">
          <Dialog.Title className="text-[15px] font-semibold">Promote to item</Dialog.Title>
          <p id="promote-desc" className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
            <Sparkles className="size-3.5 text-ai" aria-hidden /> Pre-filled by Keel from the message. Check it, then create.
          </p>
          {message && <blockquote className="mt-3 border-l-2 border-border-strong pl-2 text-[12.5px] italic text-muted">{humanize(message.body)}</blockquote>}
          {message && suggestion.data ? (
            <PromoteForm key={message.id} programId={programId} message={message} draft={suggestion.data} onClose={onClose} />
          ) : (
            <p className="mt-4 text-muted">Reading the message…</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ChannelsPage() {
  const { programId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const channels = useChannels(programId).data;
  const role = useMyRole(programId);
  const people = usePeople(programId);
  const post = usePost();
  const [draft, setDraft] = useState('');
  const [promoting, setPromoting] = useState<Message>();
  const current = channels?.find((c) => c.id === params.get('c')) ?? channels?.[0];
  const messages = useMessages(programId, current ? { kind: 'channel', id: current.id } : undefined).data ?? [];

  if (role === 'guest') {
    return (
      <EmptyState icon={<Lock />} title="Channels are for the program team">
        External guests talk with the team on the items shared with them.
      </EmptyState>
    );
  }
  if (!channels) return <div className="p-6 text-muted">Loading…</div>;
  if (!channels.length || !current) {
    return (
      <EmptyState icon={<MessageSquare />} title="No channels yet">
        Switch to <strong>Lumen AI</strong> to see channels bridged from Slack and Teams.
      </EmptyState>
    );
  }

  const send = () => {
    if (!draft.trim()) return;
    post.mutate({ container: { kind: 'channel', id: current.id }, body: draft.trim() }, { onSuccess: () => setDraft('') });
  };

  return (
    <div className="grid h-full min-h-0 md:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="border-b border-border bg-surface p-2 md:border-b-0 md:border-r" aria-label="Channels">
        <ul className="space-y-px">
          {channels.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setParams({ c: c.id })}
                aria-current={c.id === current.id ? 'page' : undefined}
                className={cn('flex h-8 w-full items-center gap-2 rounded-md px-2 text-left', c.id === current.id ? 'bg-accent-subtle font-medium text-accent' : 'text-muted hover:bg-surface-2 hover:text-text')}
              >
                <Hash className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {bridgeLabel(c) && <Badge>{bridgeLabel(c)}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="flex min-h-0 flex-col" aria-label={`#${current.name}`}>
        <header className="border-b border-border bg-surface px-4 py-2">
          <h2 className="font-semibold">#{current.name}</h2>
          {current.bridge && (
            <p className="text-[12px] text-subtle">
              Bridged with {bridgeLabel(current)} ({current.bridge.externalName}). Messages sync both ways.
            </p>
          )}
        </header>
        <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => {
            const author = m.authorId ? people.get(m.authorId) : undefined;
            return (
              <li key={m.id} className="group flex gap-2.5" data-testid="channel-message">
                {author ? <Avatar name={author.name} color={author.avatarColor} size={28} /> : <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold text-muted">{m.source.slice(0, 2).toUpperCase()}</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
                    <span className="font-semibold text-text">{author?.name ?? (m.source === 'jira' ? 'Jira' : 'Keel')}</span>
                    {m.source !== 'keel' && <Badge className="capitalize">{m.source}</Badge>}
                    <span>{timeAgo(m.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{humanize(m.body)}</p>
                  {m.promotedItemId ? (
                    <Link to={`/p/${programId}/items/${m.promotedItemId}`} className="mt-1 inline-flex items-center gap-1 text-[12px] text-green hover:underline">
                      <ArrowUpRight className="size-3.5" aria-hidden /> Promoted to an item
                    </Link>
                  ) : (
                    m.source !== 'jira' &&
                    m.source !== 'system' &&
                    role !== 'exec' && (
                      <Button size="sm" variant="ghost" className="mt-0.5 h-6 px-1.5 text-[12px] text-ai opacity-70 group-hover:opacity-100" onClick={() => setPromoting(m)} aria-label={`Promote message from ${author?.name ?? 'Jira'}`}>
                        <Sparkles className="size-3.5" /> Promote
                      </Button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        {role !== 'exec' && (
          <div className="flex gap-2 border-t border-border bg-surface p-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={`Message #${current.name}${current.bridge ? ` (also posts to ${bridgeLabel(current)})` : ''}`}
              aria-label="Message"
              className="h-9 flex-1 rounded-md border border-border-strong bg-surface px-2.5 outline-none focus:border-accent"
            />
            <Button variant="primary" onClick={send} disabled={!draft.trim()} aria-label="Send">
              <Send />
            </Button>
          </div>
        )}
      </section>
      <PromoteDialog programId={programId} message={promoting} onClose={() => setPromoting(undefined)} />
    </div>
  );
}
