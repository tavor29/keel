import { Link } from 'react-router';
import type { LiveData } from '@/domain/documents';
import { cn } from '@/ui/cn';
import { fmtDate, money } from '@/ui/format';
import { Badge } from '@/ui/primitives';
import { RagBadge } from '@/ui/Rag';

const tbl = 'w-full border-collapse text-[12.5px]';
const th = 'border-b border-border px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-subtle';
const td = 'border-b border-border px-2 py-1.5 align-top';
const LETTER_TONE = { R: 'bg-accent-subtle text-accent', A: 'bg-red-subtle text-red', C: 'bg-amber-subtle text-amber', I: 'bg-surface-3 text-muted' } as const;

/** Renders a live section's data (current, or frozen in an approved version). */
export function LiveSection({ data, programId, compareTo }: { data: LiveData; programId: string; compareTo?: LiveData }) {
  const item = (id: string, label: string) => (
    <Link to={`/p/${programId}/items/${id}`} className="hover:underline">
      {label}
    </Link>
  );
  switch (data.source) {
    case 'sponsor':
      return (
        <dl className="grid grid-cols-3 gap-2">
          <div>
            <dt className="text-[11.5px] text-subtle">Sponsor</dt>
            <dd className="font-medium">{data.sponsor}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] text-subtle">Program manager</dt>
            <dd className="font-medium">{data.pm}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] text-subtle">Approvers</dt>
            <dd className="font-medium">{data.approvers.join(', ')}</dd>
          </div>
        </dl>
      );
    case 'milestones': {
      const before = compareTo?.source === 'milestones' ? new Map(compareTo.rows.map((r) => [r.id, r])) : undefined;
      return (
        <table className={tbl}>
          <thead>
            <tr>
              <th className={th}>Milestone</th>
              <th className={th}>Date</th>
              <th className={th}>Deadline</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const was = before?.get(r.id);
              const moved = was && was.date !== r.date;
              return (
                <tr key={r.id}>
                  <td className={td}>{item(r.id, r.title)}</td>
                  <td className={cn(td, 'tabular-nums', moved && 'font-semibold text-red')}>
                    {fmtDate(r.date, '0000')}
                    {moved && <span className="ml-1 text-[11px] font-normal text-subtle line-through">{fmtDate(was.date, '0000')}</span>}
                  </td>
                  <td className={cn(td, 'tabular-nums text-muted')}>{r.deadline ? fmtDate(r.deadline, '0000') : '—'}</td>
                  <td className={td}>
                    <RagBadge rag={r.rag} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }
    case 'budget':
      return (
        <table className={tbl}>
          <thead>
            <tr>
              <th className={th}>Workstream</th>
              <th className={cn(th, 'text-right')}>Budget (BAC)</th>
              <th className={cn(th, 'text-right')}>Forecast (EAC)</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.workstream}>
                <td className={td}>{r.workstream}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{money(r.bacCents)}</td>
                <td className={cn(td, 'text-right tabular-nums', r.eacCents > r.bacCents * 1.03 && 'text-red')}>{money(r.eacCents)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className={td}>Total</td>
              <td className={cn(td, 'text-right tabular-nums')}>{money(data.totalBacCents)}</td>
              <td className={cn(td, 'text-right tabular-nums')}>{money(data.totalEacCents)}</td>
            </tr>
          </tbody>
        </table>
      );
    case 'team':
      return (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
          {data.rows.map((r) => (
            <li key={r.workstream}>
              <span className="text-muted">{r.workstream}:</span> {r.lead}
            </li>
          ))}
        </ul>
      );
    case 'top_risks':
      return (
        <ul className="space-y-1">
          {data.rows.map((r) => (
            <li key={r.id} className="flex gap-2">
              <span className="w-8 rounded bg-surface-3 text-center text-[11px] font-bold tabular-nums">{r.score}</span>
              {item(r.id, `${r.code ? `${r.code} · ` : ''}${r.title}`)}
            </li>
          ))}
        </ul>
      );
    case 'requirements':
      return (
        <>
          <p className="mb-2 text-[12px] text-muted">
            Traceability: {data.coverage.traced} of {data.coverage.total} requirements traced to plan items
            {data.coverage.traced < data.coverage.total && <Badge tone="amber" className="ml-1.5">{data.coverage.total - data.coverage.traced} untraced</Badge>}
          </p>
          <table className={tbl}>
            <thead>
              <tr>
                <th className={th}>ID</th>
                <th className={th}>Requirement</th>
                <th className={th}>Priority</th>
                <th className={th}>Delivered by</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} data-testid="requirement-row">
                  <td className={cn(td, 'whitespace-nowrap font-semibold')}>{r.code}</td>
                  <td className={td}>{r.statement}</td>
                  <td className={cn(td, 'capitalize')}>{r.priority}</td>
                  <td className={td}>
                    {r.traced.length === 0 ? (
                      <Badge tone="amber">Untraced</Badge>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.traced.slice(0, 3).map((t) => (
                          <li key={t.id} className="flex items-center gap-1.5">
                            <RagBadge rag={t.rag} />
                            {item(t.id, t.title)}
                          </li>
                        ))}
                        {r.traced.length > 3 && <li className="text-[11.5px] text-subtle">+{r.traced.length - 3} more</li>}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    case 'raci': {
      const m = data.matrix;
      return (
        <>
          {m.problems.length > 0 && (
            <div className="mb-2 rounded-md bg-red-subtle px-2.5 py-1.5 text-[12.5px] text-red" role="alert">
              {m.problems.map((p) => `${m.rows.find((r) => r.itemId === p.itemId)?.title}: ${p.kind === 'no_accountable' ? 'no one is Accountable' : p.kind === 'multiple_accountable' ? 'more than one Accountable' : 'no one is Responsible'}`).join(' · ')}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className={tbl} aria-label="RACI matrix">
              <thead>
                <tr>
                  <th className={th}>Deliverable</th>
                  {m.people.map((p) => (
                    <th key={p.personId} className={cn(th, 'whitespace-nowrap text-center normal-case')}>
                      {p.name.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.itemId} className={cn(m.problems.some((p) => p.itemId === r.itemId) && 'bg-red-subtle/40')}>
                    <td className={cn(td, 'whitespace-nowrap')}>{item(r.itemId, r.title)}</td>
                    {m.people.map((p) => {
                      const c = m.cells[r.itemId]?.[p.personId];
                      return (
                        <td key={p.personId} className={cn(td, 'text-center')}>
                          {c?.letters.map((l) => (
                            <span key={l} className={cn('mx-px inline-flex size-5 items-center justify-center rounded text-[11px] font-bold', LETTER_TONE[l], c.overridden && 'ring-1 ring-text/40')} title={c.overridden ? 'Edited by hand' : 'Derived from the plan'}>
                              {l}
                            </span>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    }
    case 'stakeholders':
      return (
        <table className={tbl}>
          <thead>
            <tr>
              <th className={th}>Stakeholder</th>
              <th className={th}>Role</th>
              <th className={th}>Influence</th>
              <th className={th}>Interest</th>
              <th className={th}>Attitude</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.name}>
                <td className={td}>
                  <span className="font-medium">{r.name}</span>
                  {r.org && <div className="text-[11.5px] text-subtle">{r.org}</div>}
                </td>
                <td className={td}>{r.role}</td>
                <td className={cn(td, 'tabular-nums')}>{r.influence}/5</td>
                <td className={cn(td, 'tabular-nums')}>{r.interest}/5</td>
                <td className={td}>
                  <Badge tone={r.attitude === 'champion' || r.attitude === 'supporter' ? 'green' : r.attitude === 'neutral' ? 'neutral' : 'amber'} className="capitalize">
                    {r.attitude}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'comms_plan':
      return (
        <table className={tbl}>
          <thead>
            <tr>
              <th className={th}>Audience</th>
              <th className={th}>Message</th>
              <th className={th}>Channel · cadence</th>
              <th className={th}>Owner</th>
              <th className={th}>Next</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.audience + r.message}>
                <td className={td}>{r.audience}</td>
                <td className={cn(td, 'text-muted')}>{r.message}</td>
                <td className={cn(td, 'capitalize')}>
                  {r.channel} · {r.cadence.replace('_', ' ')}
                </td>
                <td className={td}>{r.owner}</td>
                <td className={cn(td, 'tabular-nums')}>{r.nextDue ? fmtDate(r.nextDue) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}
