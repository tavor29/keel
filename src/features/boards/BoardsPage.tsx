import { ExternalLink, KanbanSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useBacklog, useItems, useMyRole, usePeople, useRelations, useSchedule, useSprints, useUpdateItem, useWorkstreams } from '@/api/queries';
import type { Item, Sprint, Status, Task } from '@/domain/types';
import { cn } from '@/ui/cn';
import { fmtDate } from '@/ui/format';
import { Avatar, Badge, EmptyState } from '@/ui/primitives';
import { RagBadge } from '@/ui/Rag';
import { ItemSheet } from '../item/ItemSheet';

const COLUMNS: { status: Status; label: string }[] = [
  { status: 'not_started', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
];

function Card({ t, people, onOpen, onMove, canMove }: { t: Task; people: ReturnType<typeof usePeople>; onOpen: () => void; onMove: (s: Status) => void; canMove: boolean }) {
  const owner = t.ownerId ? people.get(t.ownerId) : undefined;
  return (
    <div className="rounded-md border border-border bg-surface p-2 shadow-[0_1px_0_var(--k-border)]" data-testid="story-card">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center gap-1.5 text-[11px] text-subtle">
          {t.externalRef && <span className="font-medium">{t.externalRef.key}</span>}
          {t.storyPoints !== undefined && <span className="ml-auto rounded bg-surface-3 px-1.5 font-semibold tabular-nums text-muted">{t.storyPoints}</span>}
        </div>
        <div className="mt-0.5 leading-snug">{t.title}</div>
      </button>
      <div className="mt-1.5 flex items-center gap-1.5">
        {owner && <Avatar name={owner.name} color={owner.avatarColor} size={18} />}
        {canMove && (
          <select
            aria-label={`Move ${t.title}`}
            value={t.status}
            onChange={(e) => onMove(e.target.value as Status)}
            className="ml-auto h-6 rounded border border-border bg-surface px-1 text-[11px] text-muted"
          >
            {COLUMNS.map((c) => (
              <option key={c.status} value={c.status}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

/** Burndown: ideal line vs. remaining points per working day. */
function Burndown({ sprint }: { sprint: Sprint }) {
  const W = 320;
  const H = 140;
  const days = 10;
  const max = Math.max(sprint.committedPoints, ...sprint.burndown.map((b) => b.remainingPoints), 1);
  const x = (i: number) => 28 + (i * (W - 40)) / (days - 1);
  const y = (v: number) => 10 + (1 - v / max) * (H - 30);
  const pts = sprint.burndown.slice(0, days).map((b, i) => `${x(i)},${y(b.remainingPoints)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Burndown for ${sprint.name}`}>
      <line x1={28} x2={W - 12} y1={y(0)} y2={y(0)} stroke="var(--k-border-strong)" />
      <line x1={x(0)} y1={y(sprint.committedPoints)} x2={x(days - 1)} y2={y(0)} stroke="var(--k-baseline)" strokeDasharray="4 3" />
      {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke="var(--k-accent)" strokeWidth={2} />}
      {sprint.burndown.slice(0, days).map((b, i) => (
        <circle key={i} cx={x(i)} cy={y(b.remainingPoints)} r={2.5} fill="var(--k-accent)" />
      ))}
      <text x={4} y={y(max) + 4} fontSize={10} fill="var(--k-text-subtle)">
        {max}
      </text>
      <text x={4} y={y(0) + 4} fontSize={10} fill="var(--k-text-subtle)">
        0
      </text>
      <text x={W - 12} y={H - 4} fontSize={10} textAnchor="end" fill="var(--k-text-subtle)">
        day {days}
      </text>
    </svg>
  );
}

/** Velocity: committed (outline) vs. completed (filled), last 8 sprints. */
function Velocity({ sprints }: { sprints: Sprint[] }) {
  const closed = sprints.filter((s) => s.state === 'closed').slice(-8);
  const W = 320;
  const H = 140;
  const max = Math.max(1, ...closed.map((s) => Math.max(s.committedPoints, s.completedPoints ?? 0)));
  const bw = (W - 20) / Math.max(closed.length, 1);
  const y = (v: number) => H - 22 - (v / max) * (H - 36);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Velocity by sprint">
      {closed.map((s, i) => {
        const x0 = 10 + i * bw + bw * 0.2;
        const w = bw * 0.6;
        return (
          <g key={s.id}>
            <rect x={x0} y={y(s.committedPoints)} width={w} height={H - 22 - y(s.committedPoints)} fill="none" stroke="var(--k-baseline)" />
            <rect x={x0} y={y(s.completedPoints ?? 0)} width={w} height={H - 22 - y(s.completedPoints ?? 0)} fill="var(--k-accent)" opacity={0.85} />
            <text x={x0 + w / 2} y={y(s.completedPoints ?? 0) - 3} fontSize={10} textAnchor="middle" fill="var(--k-text-muted)">
              {s.completedPoints}
            </text>
            <text x={x0 + w / 2} y={H - 8} fontSize={10} textAnchor="middle" fill="var(--k-text-subtle)">
              {s.name.replace('Sprint ', 'S')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BoardsPage() {
  const { programId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const workstreams = useWorkstreams(programId).data ?? [];
  const items = useItems(programId).data;
  const schedule = useSchedule(programId).data;
  const relations = useRelations(programId).data ?? [];
  const people = usePeople(programId);
  const role = useMyRole(programId);
  const update = useUpdateItem();
  const agileWs = workstreams.filter((w) => w.mode === 'agile');
  const [wsId, setWsId] = useState<string>();
  const ws = workstreams.find((w) => w.id === (wsId ?? agileWs[0]?.id ?? workstreams[0]?.id));
  const sprints = useSprints(programId, ws?.mode === 'agile' ? ws.id : undefined).data ?? [];
  const backlog = useBacklog(programId, ws?.mode === 'agile' ? ws.id : undefined).data ?? [];
  const selected = params.get('item') ?? undefined;
  const open = (id: string) => setParams((p) => (p.set('item', id), p));

  const active = sprints.find((s) => s.state === 'active');
  const cards = useMemo(() => {
    if (!items || !ws) return [] as Task[];
    const isLeaf = (i: Item) => !items.some((c) => c.parentId === i.id);
    return items.filter((i): i is Task => i.type === 'task' && i.workstreamId === ws.id && isLeaf(i) && (ws.mode === 'agile' ? !!active && i.sprintId === active.id : i.status !== 'cancelled'));
  }, [items, ws, active]);

  if (!items || !ws) return <div className="p-6 text-muted">Loading…</div>;
  const agile = ws.mode === 'agile' ? schedule?.agile[ws.id] : undefined;
  const drives = relations.filter((r) => r.fromId === ws.id).map((r) => items.find((i) => i.id === r.toId)).filter((i): i is Item => !!i);
  const canMove = role === 'pm' || role === 'lead' || role === 'member';

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Workstream">
          {workstreams.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={w.id === ws.id}
              onClick={() => setWsId(w.id)}
              className={cn('flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px]', w.id === ws.id ? 'bg-accent-subtle font-medium text-accent' : 'text-muted hover:bg-surface-2')}
            >
              <span className="size-2 rounded-sm" style={{ background: w.color }} aria-hidden />
              {w.name}
              {w.mode === 'agile' && <Badge>Sprints</Badge>}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {ws.mode === 'agile' && (
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px_340px]">
            <section className="rounded-lg border border-border bg-surface p-3" aria-label="Sprint summary">
              <h2 className="text-[15px] font-semibold">
                {ws.name} · {active ? active.name : 'between sprints'}
              </h2>
              {active && (
                <p className="text-muted">
                  {fmtDate(active.start)} – {fmtDate(active.end)} · {active.committedPoints} points committed
                </p>
              )}
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border p-2">
                  <dt className="text-[11.5px] text-subtle">Velocity (last 3)</dt>
                  <dd className="text-[18px] font-semibold tabular-nums">{agile ? Math.round(agile.velocity) : '—'}</dd>
                </div>
                <div className="rounded-md border border-border p-2">
                  <dt className="text-[11.5px] text-subtle">Remaining points</dt>
                  <dd className="text-[18px] font-semibold tabular-nums">{agile?.remainingPoints ?? '—'}</dd>
                </div>
                <div className="rounded-md border border-border p-2">
                  <dt className="text-[11.5px] text-subtle">Projected finish</dt>
                  <dd className="text-[18px] font-semibold tabular-nums" data-testid="projected-finish">
                    {fmtDate(agile?.projectedFinish ?? undefined, schedule?.asOf)}
                  </dd>
                </div>
              </dl>
              {drives.length > 0 && (
                <p className="mt-2 text-[12.5px] text-muted">
                  Delivery drives{' '}
                  {drives.map((d) => (
                    <button key={d.id} type="button" onClick={() => open(d.id)} className="mr-1.5 inline-flex items-center gap-1 font-medium text-text hover:underline">
                      {d.title} <RagBadge rag={schedule?.rag.items[d.id]} />
                    </button>
                  ))}
                </p>
              )}
              {ws.jiraBoard && (
                <a href={ws.jiraBoard.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] text-subtle hover:text-accent">
                  Mirrored from Jira board {ws.jiraBoard.key} <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </section>
            <section className="rounded-lg border border-border bg-surface p-3" aria-label="Burndown">
              <h3 className="mb-1 text-[12px] font-semibold text-subtle">Burndown</h3>
              {active ? <Burndown sprint={active} /> : <p className="text-muted">No active sprint.</p>}
            </section>
            <section className="rounded-lg border border-border bg-surface p-3" aria-label="Velocity">
              <h3 className="mb-1 text-[12px] font-semibold text-subtle">Velocity: committed vs. completed</h3>
              <Velocity sprints={sprints} />
            </section>
          </div>
        )}

        {ws.mode === 'agile' && !active ? (
          <EmptyState icon={<KanbanSquare />} title="Between sprints">
            The last sprint closed. The next sprint starts from the backlog below.
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-4" aria-label="Board">
            {COLUMNS.map((c) => {
              const list = cards.filter((t) => t.status === c.status);
              return (
                <section key={c.status} className="min-w-0 rounded-lg bg-surface-2 p-2" aria-label={c.label}>
                  <h3 className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-semibold text-muted">
                    {c.label}
                    <span className="text-subtle">{list.length}</span>
                    {ws.mode === 'agile' && <span className="ml-auto tabular-nums text-subtle">{list.reduce((a, t) => a + (t.storyPoints ?? 0), 0)} pts</span>}
                  </h3>
                  <div className="space-y-1.5">
                    {list.slice(0, 60).map((t) => (
                      <Card key={t.id} t={t} people={people} onOpen={() => open(t.id)} canMove={canMove} onMove={(status) => update.mutate({ id: t.id, patch: { status, percentComplete: status === 'done' ? 100 : t.percentComplete } })} />
                    ))}
                    {list.length > 60 && <p className="px-1 text-[11.5px] text-subtle">+{list.length - 60} more</p>}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {ws.mode === 'agile' && (
          <section className="mt-4 rounded-lg border border-border bg-surface" aria-label="Backlog">
            <h3 className="flex items-center gap-2 border-b border-border px-3 py-2 font-semibold">
              Backlog <span className="text-[12px] font-normal text-subtle">{backlog.length} stories · {backlog.reduce((a, t) => a + (t.storyPoints ?? 0), 0)} points</span>
            </h3>
            <ul className="divide-y divide-border">
              {backlog.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => open(t.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-2">
                    <span className="w-16 shrink-0 text-[11.5px] text-subtle">{t.externalRef?.key}</span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="rounded bg-surface-3 px-1.5 text-[11px] font-semibold tabular-nums text-muted">{t.storyPoints}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <ItemSheet programId={programId} itemId={selected} onClose={() => setParams((p) => (p.delete('item'), p))} onOpen={open} />
    </div>
  );
}
