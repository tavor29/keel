import { AlertTriangle, Check, Copy, FileText, History, Paperclip, Pencil, Radio, Send, X } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useDocActions, useDocDrift, useDocRender, useDocuments, useDocVersions, useMe, useMyRole, usePeople } from '@/api/queries';
import type { DocumentKind, ProjectDocument } from '@/domain/types';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { fmtDate, humanize } from '@/ui/format';
import { Badge, EmptyState } from '@/ui/primitives';
import { LiveSection } from './LiveSection';

const KIND: Record<DocumentKind, string> = { charter: 'Project charter', brd: 'Requirements (BRD)', raci: 'RACI matrix', stakeholders: 'Stakeholders & comms' };
const STATE_TONE = { draft: 'neutral', in_review: 'amber', approved: 'green' } as const;
const STATE_LABEL = { draft: 'Draft', in_review: 'In review', approved: 'Approved' } as const;

function DocCard({ d, programId, active, onOpen }: { d: ProjectDocument; programId: string; active: boolean; onOpen: () => void }) {
  const drift = useDocDrift(programId, d.state === 'approved' ? d.id : undefined).data;
  return (
    <button type="button" onClick={onOpen} aria-current={active} className={cn('w-full rounded-lg border p-3 text-left hover:border-border-strong', active ? 'border-accent bg-accent-subtle' : 'border-border bg-surface')} data-testid="doc-card">
      <div className="text-[11.5px] text-subtle">{KIND[d.kind]}</div>
      <div className="font-semibold leading-snug">{d.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={STATE_TONE[d.state]}>
          {STATE_LABEL[d.state]} v{d.version}
        </Badge>
        {drift?.material && d.driftAcknowledged?.version !== d.approvedVersion && (
          <Badge tone="red">
            <AlertTriangle className="size-3" aria-hidden /> Out of date
          </Badge>
        )}
        {drift && !drift.material && drift.changedSectionIds.length > 0 && <Badge tone="neutral">Live data changed</Badge>}
      </div>
    </button>
  );
}

function NarrativeSection({ docId, sectionId, body, editable }: { docId: string; sectionId: string; body: string; editable: boolean }) {
  const { update } = useDocActions();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  if (editing) {
    return (
      <div className="space-y-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.max(3, text.split('\n').length + 1)} className="w-full rounded-md border border-border-strong bg-surface p-2" aria-label="Section text" />
        <div className="flex gap-1.5">
          <Button size="sm" variant="primary" onClick={() => update.mutate({ id: docId, sectionId, body: text }, { onSuccess: () => setEditing(false) })}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setText(body), setEditing(false))}>
            Cancel
          </Button>
        </div>
        <p className="text-[11.5px] text-subtle">Saving changes to an approved document starts a new draft version that needs re-approval.</p>
      </div>
    );
  }
  return (
    <div className="group relative">
      <p className="whitespace-pre-wrap">{humanize(body) || <span className="text-subtle">Empty.</span>}</p>
      {editable && (
        <Button size="sm" variant="ghost" className="absolute -top-8 right-0 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => (setText(body), setEditing(true))} aria-label="Edit section">
          <Pencil /> Edit
        </Button>
      )}
    </div>
  );
}

function Viewer({ doc, programId }: { doc: ProjectDocument; programId: string }) {
  const me = useMe().data;
  const role = useMyRole(programId);
  const people = usePeople(programId);
  const versions = useDocVersions(programId, doc.id).data ?? [];
  const drift = useDocDrift(programId, doc.approvedVersion ? doc.id : undefined).data;
  const [viewVersion, setViewVersion] = useState<number>();
  const [compare, setCompare] = useState(false);
  const rendered = useDocRender(programId, doc.id, viewVersion).data;
  const approved = useDocRender(programId, doc.approvedVersion ? doc.id : undefined, doc.approvedVersion).data;
  const { submit, decide, acknowledge } = useDocActions();
  const [copied, setCopied] = useState(false);
  const canEdit = role === 'pm' || role === 'lead';
  const myId = me?.person.id ?? '';
  const awaitingMe = doc.state === 'in_review' && doc.approverIds.includes(myId) && !doc.approvals.some((a) => a.personId === myId);
  const driftOpen = drift?.material && doc.driftAcknowledged?.version !== doc.approvedVersion;
  const viewingOld = viewVersion !== undefined;

  const copy = async () => {
    if (!rendered) return;
    const md = [`# ${doc.title} (${viewingOld ? `v${viewVersion}` : 'live'})`, ...rendered.sections.map((s) => `\n## ${s.title}\n${s.body ?? '(live data: see Keel)'}`)].join('\n');
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <article className="min-w-0 rounded-lg border border-border bg-surface" aria-label={doc.title} data-testid="doc-viewer">
        <header className="border-b border-border p-4">
          <div className="text-[11.5px] text-subtle">{KIND[doc.kind]}</div>
          <h2 className="text-[18px] font-semibold">{doc.title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={STATE_TONE[doc.state]}>
              {STATE_LABEL[doc.state]} v{doc.version}
            </Badge>
            {doc.approvedVersion && doc.approvedVersion !== doc.version && <Badge>Approved v{doc.approvedVersion}</Badge>}
            {viewingOld && <Badge tone="accent">Viewing frozen v{viewVersion}</Badge>}
            <div className="ml-auto flex flex-wrap gap-1.5">
              {awaitingMe && (
                <>
                  <Button size="sm" variant="primary" onClick={() => decide.mutate({ id: doc.id, decision: 'approve' })} disabled={decide.isPending}>
                    <Check /> Approve v{doc.version}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: doc.id, decision: 'reject' })}>
                    <X /> Reject
                  </Button>
                </>
              )}
              {canEdit && doc.state !== 'in_review' && (
                <Button size="sm" onClick={() => submit.mutate(doc.id)} disabled={submit.isPending}>
                  <Send /> {doc.state === 'approved' ? 'Start re-approval' : 'Submit for review'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={copy}>
                <Copy /> {copied ? 'Copied' : 'Copy as Markdown'}
              </Button>
            </div>
          </div>
        </header>

        {driftOpen && !viewingOld && (
          <div className="flex flex-wrap items-start gap-2 border-b border-border bg-red-subtle px-4 py-2.5 text-[12.5px]" role="alert" data-testid="doc-drift">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red" aria-hidden />
            <div className="min-w-0 flex-1">
              <strong className="text-red">Out of date: the plan has moved since v{drift.approvedVersion} was approved.</strong>
              <ul className="mt-0.5 list-inside list-disc text-text">
                {drift.summary.map((l) => (
                  <li key={l}>{humanize(l)}</li>
                ))}
              </ul>
            </div>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with v{drift.approvedVersion}
            </label>
            {canEdit && (
              <Button size="sm" variant="ghost" onClick={() => acknowledge.mutate(doc.id)}>
                Acknowledge
              </Button>
            )}
          </div>
        )}

        <div className="space-y-6 p-4">
          {rendered?.sections.map((s) => {
            const changed = !viewingOld && drift?.changedSectionIds.includes(s.id);
            const before = approved?.sections.find((x) => x.id === s.id)?.data;
            return (
              <section key={s.id} aria-label={s.title} className={cn(changed && 'rounded-md ring-1 ring-amber/50 ring-offset-4 ring-offset-surface')}>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-semibold">
                  {s.title}
                  {s.kind === 'live' && (
                    <Badge tone={viewingOld ? 'neutral' : 'green'}>
                      <Radio className="size-3" aria-hidden /> {viewingOld ? 'Frozen' : 'Live'}
                    </Badge>
                  )}
                  {changed && <Badge tone="amber">Changed since v{drift?.approvedVersion}</Badge>}
                </h3>
                {s.kind === 'narrative' ? (
                  <NarrativeSection key={`${s.id}-${s.body}`} docId={doc.id} sectionId={s.id} body={s.body ?? ''} editable={canEdit && !viewingOld} />
                ) : s.data ? (
                  <LiveSection data={s.data} programId={programId} compareTo={compare && changed ? before : undefined} />
                ) : null}
              </section>
            );
          })}
        </div>
      </article>

      <aside className="space-y-4">
        <section className="rounded-lg border border-border bg-surface p-3" aria-label="Approvals">
          <h3 className="mb-1.5 text-[12px] font-semibold text-subtle">Approvers</h3>
          <ul className="space-y-1">
            {doc.approverIds.map((a) => {
              const ap = doc.approvals.find((x) => x.personId === a);
              return (
                <li key={a} className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate">{people.get(a)?.name ?? a}</span>
                  {ap ? <Badge tone={ap.decision === 'approve' ? 'green' : 'red'}>{ap.decision === 'approve' ? 'Approved' : 'Rejected'}</Badge> : doc.state === 'in_review' ? <Badge tone="amber">Pending</Badge> : null}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="rounded-lg border border-border bg-surface p-3" aria-label="Version history">
          <h3 className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-subtle">
            <History className="size-3.5" aria-hidden /> Versions
          </h3>
          <ul className="space-y-0.5">
            <li>
              <button type="button" onClick={() => setViewVersion(undefined)} className={cn('w-full rounded px-1.5 py-1 text-left hover:bg-surface-2', !viewingOld && 'bg-accent-subtle font-medium')}>
                Current (live) · v{doc.version} {STATE_LABEL[doc.state].toLowerCase()}
              </button>
            </li>
            {versions.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setViewVersion(v.version)} className={cn('w-full rounded px-1.5 py-1 text-left hover:bg-surface-2', viewVersion === v.version && 'bg-accent-subtle font-medium')}>
                  v{v.version} approved · {fmtDate(v.approvedAt.slice(0, 10), '0000')}
                </button>
              </li>
            ))}
          </ul>
        </section>
        {doc.attachments.length > 0 && (
          <section className="rounded-lg border border-border bg-surface p-3" aria-label="Attachments">
            <h3 className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-subtle">
              <Paperclip className="size-3.5" aria-hidden /> Attachments
            </h3>
            <ul>
              {doc.attachments.map((a) => (
                <li key={a.id} className="truncate text-[12.5px]">
                  {a.name} <span className="text-subtle">· {Math.round(a.sizeBytes / 1000)} KB</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

export function DocumentsPage() {
  const { programId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const docs = useDocuments(programId).data;
  if (!docs) return <div className="p-6 text-muted">Loading…</div>;
  if (!docs.length)
    return (
      <EmptyState icon={<FileText />} title="No documents shared with you">
        Project documents appear here once the team shares them.
      </EmptyState>
    );
  const current = docs.find((d) => d.id === params.get('doc')) ?? docs[0]!;
  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav className="space-y-2 overflow-y-auto border-b border-border bg-surface-2 p-3 lg:border-b-0 lg:border-r" aria-label="Document library">
        {docs.map((d) => (
          <DocCard key={d.id} d={d} programId={programId} active={d.id === current.id} onOpen={() => setParams({ doc: d.id })} />
        ))}
      </nav>
      <div className="min-h-0 overflow-y-auto p-4">
        <Viewer key={current.id} doc={current} programId={programId} />
      </div>
    </div>
  );
}
