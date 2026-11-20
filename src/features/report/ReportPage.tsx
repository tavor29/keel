import { Copy, FileText, RefreshCw, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useDraftReport, useItemsById, useMyRole, useProposals, usePublishReport, useReports, useSchedule } from '@/api/queries';
import { addDays } from '@/domain/dates';
import type { ReportSection } from '@/domain/types';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { fmtDate, humanize, timeAgo } from '@/ui/format';
import { Badge, EmptyState } from '@/ui/primitives';
import { RagBadge } from '@/ui/Rag';

export function ReportPage() {
  const { programId = '' } = useParams();
  const role = useMyRole(programId);
  const schedule = useSchedule(programId).data;
  const reports = useReports(programId).data ?? [];
  const items = useItemsById(programId);
  const proposals = useProposals(programId).data ?? [];
  const draft = useDraftReport(programId);
  const publish = usePublishReport();
  const [hover, setHover] = useState<string>();
  const [copied, setCopied] = useState(false);

  if (!schedule) return <div className="p-6 text-muted">Loading…</div>;
  const period = { start: schedule.asOf, end: addDays(schedule.asOf, 6) };
  const current = reports.find((r) => r.state === 'draft') ?? reports[0];
  const published = reports.filter((r) => r.state === 'published');

  const sourceLabel = (s: ReportSection['lines'][number]['sources'][number]) => {
    if (s.kind === 'item') return items.get(s.id)?.title ?? 'item';
    if (s.kind === 'proposal') return proposals.find((p) => p.id === s.id) ? 'proposal' : 'decision';
    return 'message';
  };
  const sourceHref = (s: ReportSection['lines'][number]['sources'][number]) => {
    if (s.kind === 'item') return `/p/${programId}/items/${s.id}`;
    if (s.kind === 'proposal') {
      const p = proposals.find((x) => x.id === s.id);
      const target = p?.changes.find((c) => 'itemId' in c) as { itemId?: string } | undefined;
      return target?.itemId ? `/p/${programId}/items/${target.itemId}` : `/p/${programId}/briefing`;
    }
    return `/p/${programId}/briefing`;
  };

  const copy = async () => {
    if (!current) return;
    const md = [`# Status report: week of ${fmtDate(current.periodStart)}`, ...current.sections.flatMap((s) => [`\n## ${s.title}`, ...s.lines.map((l) => `- ${humanize(l.text)}`)])].join('\n');
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="text-[16px] font-semibold">Weekly status report</h2>
          <p className="text-muted">
            Week of {fmtDate(period.start)} – {fmtDate(period.end)} · program <RagBadge rag={schedule.rag.program} />
          </p>
        </div>
        <Button onClick={() => draft.mutate(period)} disabled={draft.isPending}>
          <RefreshCw className={cn(draft.isPending && 'animate-spin')} /> {current?.state === 'draft' ? 'Refresh draft' : 'Draft this week'}
        </Button>
        {current && (
          <Button variant="ghost" onClick={copy}>
            <Copy /> {copied ? 'Copied' : 'Copy as text'}
          </Button>
        )}
        {current?.state === 'draft' && role === 'pm' && (
          <Button variant="primary" onClick={() => publish.mutate(current.id)} disabled={publish.isPending}>
            <Send /> Publish
          </Button>
        )}
      </div>

      {!current ? (
        <EmptyState icon={<FileText />} title="No report yet" footer={<Button variant="primary" onClick={() => draft.mutate(period)}>Draft this week’s report</Button>}>
          Keel drafts the report from the plan, approved changes, budget and risks. Every line links to its source.
        </EmptyState>
      ) : (
        <article className="rounded-lg border border-border bg-surface" aria-label="Status report" data-testid="report">
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-[12px] text-subtle">
            <Badge tone={current.state === 'draft' ? 'amber' : 'green'}>{current.state === 'draft' ? 'Draft' : 'Published'}</Badge>
            <span>v{current.version}</span>
            {current.publishedAt && <span>· published {timeAgo(current.publishedAt)}</span>}
            <span className="ml-auto">Hover a line to see its sources</span>
          </header>
          <div className="space-y-5 p-4">
            {current.sections.map((s) => (
              <section key={s.key} aria-label={s.title}>
                <h3 className="mb-1.5 text-[13px] font-semibold">{s.title}</h3>
                <ul className="space-y-1">
                  {s.lines.map((l) => (
                    <li
                      key={l.id}
                      onMouseEnter={() => setHover(l.id)}
                      onMouseLeave={() => setHover(undefined)}
                      className={cn('group rounded px-1.5 py-0.5', hover === l.id && l.sources.length && 'bg-accent-subtle')}
                    >
                      <span>{humanize(l.text)}</span>
                      {l.sources.length > 0 && (
                        <span className={cn('ml-1.5 inline-flex flex-wrap gap-1 align-middle', hover === l.id ? 'opacity-100' : 'opacity-40 group-focus-within:opacity-100')}>
                          {l.sources.slice(0, 3).map((src) => (
                            <Link key={`${src.kind}-${src.id}`} to={sourceHref(src)} className="rounded border border-border bg-surface px-1 text-[10.5px] text-muted hover:text-accent">
                              {sourceLabel(src)}
                            </Link>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </article>
      )}

      {published.length > 0 && (
        <p className="text-[12px] text-subtle">
          Published versions: {published.map((r) => `v${r.version} (${fmtDate(r.periodStart)})`).join(', ')}
        </p>
      )}
    </div>
  );
}
