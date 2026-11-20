import { ArrowDown, ArrowUp, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useItems, usePeople, useWorkstreams } from '@/api/queries';
import type { Risk } from '@/domain/types';
import { cn } from '@/ui/cn';
import { humanize } from '@/ui/format';
import { EmptyState } from '@/ui/primitives';
import { ItemSheet } from '../item/ItemSheet';

const SEVERITY = ['', 'Negligible', 'Minor', 'Moderate', 'Major', 'Critical'] as const;
const PROBABILITY = ['', 'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'] as const;
const PROBABILITY_RANGE = ['', '< 10%', '10–30%', '30–50%', '50–80%', '> 80%'] as const;

/** 1–2 low, 3 medium, 4–5 high: tone for a 1–5 rating. */
const tone = (n: number) => (n >= 4 ? 'bg-red-subtle text-red' : n === 3 ? 'bg-amber-subtle text-amber' : 'bg-green-subtle text-green');
const scoreTone = (s: number) => (s >= 15 ? 'bg-red text-white' : s >= 8 ? 'bg-amber-subtle text-amber' : 'bg-surface-3 text-muted');

type SortKey = 'score' | 'risk' | 'severity' | 'probability';
const TABS = [
  { key: 'risks', label: 'Risks' },
  { key: 'assumptions', label: 'Assumptions' },
  { key: 'issues', label: 'Issues' },
  { key: 'decisions', label: 'Decisions' },
] as const;

type Sort = { key: SortKey; dir: 1 | -1 };

function SortHeader({ k, sort, onSort, children, className }: { k: SortKey; sort: Sort; onSort: (s: Sort) => void; children: React.ReactNode; className?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-2 text-left font-semibold', className)}>
      <button type="button" onClick={() => onSort({ key: k, dir: sort.key === k ? ((sort.dir * -1) as 1 | -1) : k === 'risk' ? 1 : -1 })} className="inline-flex items-center gap-1 hover:text-text">
        {children}
        {active && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
      </button>
    </th>
  );
}

export function RaidPage() {
  const { programId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'risks';
  const selected = params.get('item') ?? undefined;
  const risksQ = useItems(programId, { types: ['risk'] });
  const people = usePeople(programId);
  const workstreams = useWorkstreams(programId).data ?? [];
  const [sort, setSort] = useState<Sort>({ key: 'score', dir: -1 });
  const [ws, setWs] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const all = useMemo(() => (risksQ.data ?? []).filter((i): i is Risk => i.type === 'risk'), [risksQ.data]);
  const closedCount = all.filter((r) => r.status === 'done' || r.status === 'cancelled').length;
  const rows = useMemo(() => {
    const list = all.filter((r) => (showClosed || (r.status !== 'done' && r.status !== 'cancelled')) && (!ws || r.workstreamId === ws));
    const val = (r: Risk): number | string =>
      sort.key === 'score' ? r.probability * r.impact * 10 + r.impact : sort.key === 'severity' ? r.impact * 10 + r.probability : sort.key === 'probability' ? r.probability * 10 + r.impact : (r.code ?? r.title);
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [all, sort, ws, showClosed]);

  const setParam = (k: string, v?: string) =>
    setParams((p) => {
      if (v) p.set(k, v);
      else p.delete(k);
      return p;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 pt-2">
        <nav className="flex gap-1" aria-label="RAID log sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setParam('tab', t.key === 'risks' ? undefined : t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={cn('-mb-px border-b-2 px-2.5 pb-2 pt-1 text-[13px]', tab === t.key ? 'border-accent font-semibold text-text' : 'border-transparent text-muted hover:text-text')}
            >
              {t.label}
              {t.key === 'risks' && <span className="ml-1.5 text-[11.5px] text-subtle">{all.length - closedCount}</span>}
            </button>
          ))}
        </nav>
      </div>

      {tab !== 'risks' ? (
        <EmptyState icon={<ShieldAlert />} title={`${TABS.find((t) => t.key === tab)?.label} log`}>
          Assumptions, issues and decisions arrive with the rest of the RAID log in phase 4. The risk register is live now.
        </EmptyState>
      ) : risksQ.data && all.length === 0 ? (
        <EmptyState icon={<ShieldAlert />} title="No risks recorded">
          This program has no risks yet. Switch to <strong>Titan-1</strong> to see a populated register.
        </EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-[15px] font-semibold">Risk register</h2>
            <label className="flex items-center gap-1.5 text-[12.5px]">
              <span className="text-muted">Workstream</span>
              <select value={ws} onChange={(e) => setWs(e.target.value)} className="h-7 rounded-md border border-border-strong bg-surface px-1.5">
                <option value="">All</option>
                {workstreams.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            {closedCount > 0 && (
              <label className="flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Show closed ({closedCount})
              </label>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[1080px] border-collapse text-[12.5px]" aria-label="Risk register">
              <thead className="sticky top-0 z-10 bg-surface-2 text-[11.5px] uppercase tracking-wide text-subtle">
                <tr className="border-b border-border">
                  <SortHeader sort={sort} onSort={setSort} k="risk" className="w-[22%]">
                    Risk
                  </SortHeader>
                  <th scope="col" className="w-[27%] px-3 py-2 text-left font-semibold">
                    Description
                  </th>
                  <SortHeader sort={sort} onSort={setSort} k="severity" className="w-[10%]">
                    Severity
                  </SortHeader>
                  <SortHeader sort={sort} onSort={setSort} k="probability" className="w-[11%]">
                    Probability of occurrence
                  </SortHeader>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Contingency and mitigation actions (incl. “Plan B”)
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const closed = r.status === 'done' || r.status === 'cancelled';
                  const score = r.probability * r.impact;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setParam('item', r.id)}
                      className={cn('cursor-pointer border-b border-border align-top last:border-b-0 hover:bg-surface-2', closed && 'opacity-60', selected === r.id && 'bg-accent-subtle')}
                      data-testid="risk-row"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <span className={cn('mt-0.5 inline-flex h-5 min-w-7 items-center justify-center rounded px-1 text-[11px] font-bold tabular-nums', scoreTone(score))} title={`Score ${score} (severity × probability)`}>
                            {score}
                          </span>
                          <div className="min-w-0">
                            <button type="button" className="text-left font-semibold leading-snug hover:underline" onClick={(e) => (e.stopPropagation(), setParam('item', r.id))}>
                              {r.code && <span className="mr-1 text-subtle">{r.code}</span>}
                              {r.title}
                            </button>
                            <div className="mt-0.5 text-[11.5px] text-subtle">
                              {workstreams.find((w) => w.id === r.workstreamId)?.name}
                              {r.ownerId && ` · ${people.get(r.ownerId)?.name ?? ''}`}
                              {closed && ' · Closed'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 leading-snug text-muted">{r.description}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('inline-flex rounded px-1.5 py-0.5 text-[11.5px] font-semibold', tone(r.impact))}>
                          {r.impact} · {SEVERITY[r.impact]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('inline-flex rounded px-1.5 py-0.5 text-[11.5px] font-semibold', tone(r.probability))}>
                          {r.probability} · {PROBABILITY[r.probability]}
                        </span>
                        <div className="mt-0.5 text-[11px] text-subtle">{PROBABILITY_RANGE[r.probability]}</div>
                      </td>
                      <td className="space-y-1.5 px-3 py-2.5 leading-snug">
                        {r.mitigation && (
                          <p>
                            <span className="font-semibold">Mitigation: </span>
                            {r.mitigation}
                          </p>
                        )}
                        {r.contingency && (
                          <p>
                            <span className="font-semibold text-accent">Plan B: </span>
                            {r.contingency}
                          </p>
                        )}
                        {r.trigger && <p className="text-[11.5px] text-subtle">Trigger: {humanize(r.trigger)}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] text-subtle">
            Score = severity × probability (1–25). Severity: 1 negligible … 5 critical. Probability: 1 rare … 5 almost certain. Click a risk for its thread and history.
          </p>
        </div>
      )}
      <ItemSheet programId={programId} itemId={selected} onClose={() => setParam('item')} />
    </div>
  );
}
