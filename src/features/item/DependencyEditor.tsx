import { Link2, X } from 'lucide-react';
import { useState } from 'react';
import { useApi } from '@/api/context';
import type { Item, Relation } from '@/domain/types';
import { Button } from '@/ui/Button';

/** Add/remove FS/SS dependencies and edit a task's duration (PM and leads). The API validates by rescheduling. */
export function DependencyEditor({ item, items, relations }: { item: Item; items: Map<string, Item>; relations: Relation[] }) {
  const api = useApi();
  const [from, setFrom] = useState('');
  const [kind, setKind] = useState<'FS' | 'SS'>('FS');
  const [lag, setLag] = useState(0);
  const [error, setError] = useState<string>();
  const parents = new Set([...items.values()].map((i) => i.parentId).filter(Boolean));
  const candidates = [...items.values()]
    .filter((i) => i.id !== item.id && !parents.has(i.id) && (i.type === 'task' || i.type === 'milestone' || i.type === 'gate' || i.type === 'procurement'))
    .sort((a, b) => a.title.localeCompare(b.title));
  const preds = relations.filter((r) => r.toId === item.id && (r.kind === 'FS' || r.kind === 'SS'));

  const run = async (fn: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5" aria-label="Edit dependencies">
      {item.type === 'task' && !parents.has(item.id) && (
        <label className="flex items-center gap-2 text-[12.5px]">
          <span className="text-muted">Duration (days)</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            defaultValue={item.durationHalfDays / 2}
            key={item.durationHalfDays}
            onBlur={(e) => {
              const v = Math.round(Number(e.target.value) * 2);
              if (v > 0 && v !== item.durationHalfDays) void run(() => api.items.update(item.id, { durationHalfDays: v }));
            }}
            className="h-7 w-20 rounded border border-border-strong bg-surface px-1.5"
          />
        </label>
      )}
      {preds.length > 0 && (
        <ul className="space-y-0.5 text-[12.5px]">
          {preds.map((r) => (
            <li key={r.id} className="flex items-center gap-1.5">
              <span className="text-subtle">{r.kind}</span>
              <span className="min-w-0 flex-1 truncate">{items.get(r.fromId)?.title ?? 'Agile workstream delivery'}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove dependency on ${items.get(r.fromId)?.title}`} onClick={() => run(() => api.relations.remove(r.id))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Predecessor" className="h-7 min-w-0 flex-1 rounded border border-border-strong bg-surface px-1">
          <option value="">Add a predecessor…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as 'FS' | 'SS')} aria-label="Dependency type" className="h-7 rounded border border-border-strong bg-surface px-1">
          <option value="FS">Finish → start</option>
          <option value="SS">Start → start</option>
        </select>
        <input type="number" value={lag} onChange={(e) => setLag(Number(e.target.value))} aria-label="Lag in days" className="h-7 w-14 rounded border border-border-strong bg-surface px-1" title="Lag (days)" />
        <Button size="sm" disabled={!from} onClick={() => run(() => api.relations.add({ programId: item.programId, kind, fromId: from, toId: item.id, lagHalfDays: lag * 2 })).then(() => setFrom(''))}>
          <Link2 /> Link
        </Button>
      </div>
      {error && <p className="text-[12px] text-red" role="alert">{error}</p>}
    </div>
  );
}
