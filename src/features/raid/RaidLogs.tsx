import type { Assumption, Decision, Issue, Person, Risk, Workstream } from '@/domain/types';
import { cn } from '@/ui/cn';
import { fmtDate, fmtDateLong } from '@/ui/format';
import { Badge } from '@/ui/primitives';

const cellTone = (score: number) => (score >= 15 ? 'bg-red text-white' : score >= 8 ? 'bg-amber-subtle text-amber' : 'bg-green-subtle text-green');

/** 5×5 probability × severity grid of open risks; click a cell to filter. */
export function RiskHeatMap({ risks, selected, onSelect }: { risks: Risk[]; selected?: [number, number]; onSelect: (cell?: [number, number]) => void }) {
  const open = risks.filter((r) => r.status !== 'done' && r.status !== 'cancelled');
  return (
    <figure className="rounded-lg border border-border bg-surface p-3" aria-label="Risk heat map">
      <figcaption className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-subtle">
        Heat map · {open.length} open risks
        {selected && (
          <button type="button" onClick={() => onSelect(undefined)} className="ml-auto font-normal text-accent hover:underline">
            Clear filter
          </button>
        )}
      </figcaption>
      <div className="flex gap-2">
        <div className="flex w-4 items-center justify-center">
          <span className="-rotate-90 whitespace-nowrap text-[10.5px] text-subtle">Severity →</span>
        </div>
        <div className="grid flex-1 grid-cols-5 gap-1" role="grid">
          {[5, 4, 3, 2, 1].map((sev) =>
            [1, 2, 3, 4, 5].map((prob) => {
              const n = open.filter((r) => r.impact === sev && r.probability === prob).length;
              const active = selected?.[0] === prob && selected?.[1] === sev;
              return (
                <button
                  key={`${sev}-${prob}`}
                  type="button"
                  role="gridcell"
                  aria-label={`Severity ${sev}, probability ${prob}: ${n} risks`}
                  onClick={() => onSelect(n ? [prob, sev] : undefined)}
                  className={cn('flex h-9 items-center justify-center rounded text-[12px] font-bold tabular-nums', n ? cellTone(prob * sev) : 'bg-surface-2 text-subtle', active && 'ring-2 ring-accent ring-offset-1')}
                >
                  {n || ''}
                </button>
              );
            }),
          )}
        </div>
      </div>
      <div className="ml-6 mt-1 text-center text-[10.5px] text-subtle">Probability →</div>
    </figure>
  );
}

const th = 'px-3 py-2 text-left font-semibold';
const td = 'px-3 py-2.5 align-top';

function Table({ label, head, children }: { label: string; head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[900px] border-collapse text-[12.5px]" aria-label={label}>
        <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-subtle">
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

interface Props<T> {
  rows: T[];
  people: Map<string, Person>;
  workstreams: Workstream[];
  onOpen: (id: string) => void;
}

const wsName = (ws: Workstream[], id: string) => ws.find((w) => w.id === id)?.name;
const rowCls = 'cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2';

export function AssumptionsTable({ rows, people, workstreams, onOpen }: Props<Assumption>) {
  return (
    <Table label="Assumptions log" head={['Assumption', 'Description', 'Owner', 'Validate by', 'Status']}>
      {rows.map((a) => (
        <tr key={a.id} className={rowCls} onClick={() => onOpen(a.id)} data-testid="raid-row">
          <td className={cn(td, 'font-semibold')}>
            {a.title}
            <div className="text-[11.5px] font-normal text-subtle">{wsName(workstreams, a.workstreamId)}</div>
          </td>
          <td className={cn(td, 'text-muted')}>{a.description}</td>
          <td className={td}>{people.get(a.ownerId ?? '')?.name ?? '—'}</td>
          <td className={cn(td, 'tabular-nums')}>{fmtDateLong(a.validateBy)}</td>
          <td className={td}>
            <Badge tone={a.validated === true ? 'green' : a.validated === false ? 'red' : 'amber'}>{a.validated === true ? 'Validated' : a.validated === false ? 'Invalidated' : 'To validate'}</Badge>
          </td>
        </tr>
      ))}
    </Table>
  );
}

const SEV_TONE = { low: 'neutral', medium: 'amber', high: 'red', critical: 'red' } as const;

export function IssuesTable({ rows, people, workstreams, onOpen }: Props<Issue>) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...rows].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || order[a.severity] - order[b.severity]);
  return (
    <Table label="Issues log" head={['Issue', 'Description', 'Severity', 'Owner', 'Status / resolution']}>
      {sorted.map((i) => (
        <tr key={i.id} className={cn(rowCls, i.status === 'done' && 'opacity-60')} onClick={() => onOpen(i.id)} data-testid="raid-row">
          <td className={cn(td, 'font-semibold')}>
            {i.title}
            <div className="text-[11.5px] font-normal text-subtle">{wsName(workstreams, i.workstreamId)}</div>
          </td>
          <td className={cn(td, 'text-muted')}>{i.description}</td>
          <td className={td}>
            <Badge tone={SEV_TONE[i.severity]} className="capitalize">
              {i.severity}
            </Badge>
          </td>
          <td className={td}>{people.get(i.ownerId ?? '')?.name ?? '—'}</td>
          <td className={td}>
            <span className="capitalize">{i.status === 'done' ? 'Resolved' : i.status.replace('_', ' ')}</span>
            {i.resolution && <div className="text-[11.5px] text-muted">{i.resolution}</div>}
          </td>
        </tr>
      ))}
    </Table>
  );
}

export function DecisionsTable({ rows, people, workstreams, onOpen }: Props<Decision>) {
  const sorted = [...rows].sort((a, b) => Number(!!a.outcome) - Number(!!b.outcome) || (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));
  return (
    <Table label="Decisions log" head={['Decision', 'Context', 'Options considered', 'Outcome', 'Decided']}>
      {sorted.map((d) => (
        <tr key={d.id} className={rowCls} onClick={() => onOpen(d.id)} data-testid="raid-row">
          <td className={cn(td, 'font-semibold')}>
            {d.title}
            <div className="text-[11.5px] font-normal text-subtle">{wsName(workstreams, d.workstreamId)}</div>
          </td>
          <td className={cn(td, 'text-muted')}>{d.context}</td>
          <td className={td}>
            <ul className="list-inside list-disc text-muted">
              {d.options.map((o) => (
                <li key={o} className={cn(o === d.outcome && 'font-semibold text-text')}>
                  {o}
                </li>
              ))}
            </ul>
          </td>
          <td className={td}>{d.outcome ? <Badge tone="green">{d.outcome}</Badge> : <Badge tone="amber">Open</Badge>}</td>
          <td className={cn(td, 'text-muted')}>{d.decidedAt ? `${fmtDate(d.decidedAt.slice(0, 10))} · ${people.get(d.decidedById ?? '')?.name ?? ''}` : '—'}</td>
        </tr>
      ))}
    </Table>
  );
}
