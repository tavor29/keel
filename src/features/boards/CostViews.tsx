import { Link } from 'react-router';
import { useEvm, useEvmTrend, useItems, useMyRole, usePeople, useWorkload, useWorkstreams } from '@/api/queries';
import { evmRag } from '@/domain/evm';
import type { ChangeRequest } from '@/domain/types';
import { cn } from '@/ui/cn';
import { fmtDate, money } from '@/ui/format';
import { EmptyState } from '@/ui/primitives';
import { RagDot } from '@/ui/Rag';

const th = 'border-b border-border px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-subtle';
const td = 'border-b border-border px-3 py-2 tabular-nums';
const idx = (v: number | null) => (v === null ? '—' : v.toFixed(2));

/** CPI and SPI over the last 12 weeks, with the 0.90 and 0.98 thresholds. */
function Trend({ points }: { points: { date: string; cpi: number; spi: number }[] }) {
  const W = 520;
  const H = 160;
  const lo = Math.min(0.85, ...points.flatMap((p) => [p.cpi, p.spi]));
  const hi = Math.max(1.05, ...points.flatMap((p) => [p.cpi, p.spi]));
  const x = (i: number) => 36 + (i * (W - 50)) / Math.max(points.length - 1, 1);
  const y = (v: number) => 10 + ((hi - v) / (hi - lo)) * (H - 34);
  const line = (k: 'cpi' | 'spi') => points.map((p, i) => `${x(i)},${y(p[k])}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="CPI and SPI trend">
      {[0.9, 0.98, 1].map((g) => (
        <g key={g}>
          <line x1={36} x2={W - 14} y1={y(g)} y2={y(g)} stroke={g === 1 ? 'var(--k-border-strong)' : 'var(--k-border)'} strokeDasharray={g === 1 ? undefined : '3 3'} />
          <text x={4} y={y(g) + 4} fontSize={10} fill="var(--k-text-subtle)">
            {g.toFixed(2)}
          </text>
        </g>
      ))}
      <polyline points={line('cpi')} fill="none" stroke="var(--k-accent)" strokeWidth={2} />
      <polyline points={line('spi')} fill="none" stroke="var(--k-ai)" strokeWidth={2} strokeDasharray="5 3" />
      {points.map((p, i) => (
        <text key={p.date} x={x(i)} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--k-text-subtle)">
          {i % 2 === 0 ? fmtDate(p.date) : ''}
        </text>
      ))}
      <g fontSize={11}>
        <rect x={W - 130} y={8} width={10} height={3} fill="var(--k-accent)" />
        <text x={W - 116} y={13} fill="var(--k-text-muted)">
          CPI (cost)
        </text>
        <rect x={W - 130} y={22} width={10} height={3} fill="var(--k-ai)" />
        <text x={W - 116} y={27} fill="var(--k-text-muted)">
          SPI (schedule)
        </text>
      </g>
    </svg>
  );
}

export function BudgetView({ programId }: { programId: string }) {
  const role = useMyRole(programId);
  const evm = useEvm(programId, role !== 'guest').data;
  const trend = useEvmTrend(programId).data ?? [];
  const workstreams = useWorkstreams(programId).data ?? [];
  const crs = (useItems(programId, { types: ['change'] }).data ?? []).filter((i): i is ChangeRequest => i.type === 'change');
  if (!evm) return <p className="text-muted">Loading…</p>;
  if (evm.program.bacCents === 0) return <EmptyState title="No budget on this program">Lumen AI tracks scope and sprints, not cost. Switch to Titan-1.</EmptyState>;
  const rows = workstreams.map((w) => ({ w, e: evm.byWorkstream[w.id] })).filter((r) => r.e && r.e.bacCents > 0);
  const p = evm.program;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-[12.5px]" aria-label="Budget by workstream">
          <thead className="bg-surface-2">
            <tr>
              {['Workstream', 'Budget (BAC)', 'Committed', 'Actual (AC)', 'Earned (EV)', 'Forecast (EAC)', 'Variance (VAC)', 'CPI', 'SPI'].map((h, i) => (
                <th key={h} className={cn(th, i > 0 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...rows, { w: { id: 'total', name: 'Program total', color: 'transparent' }, e: p }].map(({ w, e }) => (
              <tr key={w.id} className={cn(w.id === 'total' && 'bg-surface-2 font-semibold')}>
                <td className={cn(td, 'font-sans')}>
                  <span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: w.color }} aria-hidden />
                  {w.name}
                </td>
                <td className={cn(td, 'text-right')}>{money(e!.bacCents)}</td>
                <td className={cn(td, 'text-right')}>{money(e!.committedCents)}</td>
                <td className={cn(td, 'text-right')}>{money(e!.acCents)}</td>
                <td className={cn(td, 'text-right')}>{money(e!.evCents)}</td>
                <td className={cn(td, 'text-right')}>{money(e!.eacCents)}</td>
                <td className={cn(td, 'text-right', e!.vacCents < 0 && 'text-red')}>{money(e!.vacCents)}</td>
                <td className={cn(td, 'text-right')}>
                  <span className="inline-flex items-center gap-1">
                    <RagDot rag={evmRag(e!.cpi) ?? undefined} /> {idx(e!.cpi)}
                  </span>
                </td>
                <td className={cn(td, 'text-right')}>
                  <span className="inline-flex items-center gap-1">
                    <RagDot rag={evmRag(e!.spi) ?? undefined} /> {idx(e!.spi)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-lg border border-border bg-surface p-3" aria-label="Earned value trend">
          <h3 className="mb-1 text-[12px] font-semibold text-subtle">Earned value trend (12 weeks)</h3>
          <Trend points={trend} />
        </section>
        <section className="rounded-lg border border-border bg-surface p-3" aria-label="Change orders">
          <h3 className="mb-1.5 text-[12px] font-semibold text-subtle">Change orders</h3>
          <ul className="space-y-1.5">
            {crs.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Link to={`/p/${programId}/items/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {c.title}
                </Link>
                <span className="tabular-nums">{money(c.costDeltaCents)}</span>
                <span className={cn('w-16 text-right text-[11.5px] capitalize', c.state === 'applied' ? 'text-green' : 'text-amber')}>{c.state}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-border pt-2 text-[12px] text-muted">
            Approved changes: {money(crs.filter((c) => c.state === 'applied').reduce((a, c) => a + c.costDeltaCents, 0))}
          </p>
        </section>
      </div>
    </div>
  );
}

const loadTone = (v: number) => (v === 0 ? '' : v > 100 ? 'bg-red text-white' : v >= 80 ? 'bg-accent text-accent-fg' : v >= 40 ? 'bg-accent-subtle text-accent' : 'bg-surface-2 text-muted');

export function WorkloadView({ programId }: { programId: string }) {
  const wl = useWorkload(programId).data;
  const people = usePeople(programId);
  if (!wl) return <p className="text-muted">Loading…</p>;
  const over = wl.people.filter((p) => p.peak > 100).length;
  return (
    <section aria-label="Workload heatmap">
      <p className="mb-2 text-muted">
        Allocation by person and week (next 12 weeks), from task assignments and the current schedule. {over > 0 ? <strong className="text-red">{over} people are overallocated at some point.</strong> : 'No one is overallocated.'} Keel flags overloads; it does not auto-level.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="border-collapse text-[12px]">
          <thead className="bg-surface-2">
            <tr>
              <th className={cn(th, 'sticky left-0 bg-surface-2')}>Person</th>
              {wl.weeks.map((w) => (
                <th key={w} className={cn(th, 'text-center normal-case')}>
                  {fmtDate(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wl.people.slice(0, 40).map((p) => (
              <tr key={p.personId} data-testid="workload-row">
                <td className="sticky left-0 whitespace-nowrap border-b border-border bg-surface px-3 py-1.5">
                  {people.get(p.personId)?.name ?? p.personId}
                  <span className="ml-1.5 text-[11px] text-subtle">{people.get(p.personId)?.title}</span>
                </td>
                {p.load.map((v, i) => (
                  <td key={i} className="border-b border-l border-border p-0.5 text-center">
                    <span className={cn('block rounded px-1 py-1 font-semibold tabular-nums', loadTone(v))} title={`${v}% allocated`}>
                      {v ? `${v}%` : ''}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
