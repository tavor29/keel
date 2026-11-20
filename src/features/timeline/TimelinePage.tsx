import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, Diamond, Flag, Monitor, Package } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useBaselines, useItems, useRelations, useSchedule, useWorkstreams } from '@/api/queries';
import { fromEpochDay, toEpochDay } from '@/domain/dates';
import type { Item, Workstream } from '@/domain/types';
import { cn } from '@/ui/cn';
import { fmtDate } from '@/ui/format';
import { RagDot } from '@/ui/Rag';
import { ItemSheet } from '../item/ItemSheet';

const ROW_H = 28;
const HEADER_H = 44;
const GRID_W = 540;
const ZOOMS = { week: 16, month: 5, quarter: 2 } as const;
type Zoom = keyof typeof ZOOMS;
const SHOWN: Item['type'][] = ['task', 'milestone', 'gate', 'procurement'];

type Row = { kind: 'ws'; ws: Workstream; depth: 0; hasKids: boolean } | { kind: 'item'; item: Item; depth: number; hasKids: boolean };

export function TimelinePage() {
  const { programId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const items = useItems(programId).data;
  const schedule = useSchedule(programId).data;
  const relations = useRelations(programId).data ?? [];
  const wsQ = useWorkstreams(programId).data;
  const workstreams = useMemo(() => wsQ ?? [], [wsQ]);
  const baselines = useBaselines(programId).data ?? [];
  const [zoom, setZoom] = useState<Zoom>('month');
  const [showCritical, setShowCritical] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const selected = params.get('item') ?? undefined;

  const nodes = useMemo(() => new Map((schedule?.nodes ?? []).map((n) => [n.itemId, n])), [schedule]);
  const baseline = baselines.find((b) => b.id === schedule?.baselineId);
  const agileWs = useMemo(() => new Set(workstreams.filter((w) => w.mode === 'agile').map((w) => w.id)), [workstreams]);

  // Tree → flat visible rows
  const rows = useMemo<Row[]>(() => {
    if (!items) return [];
    const shown = items.filter((i) => SHOWN.includes(i.type) && !(i.type === 'task' && agileWs.has(i.workstreamId) && !items.some((c) => c.parentId === i.id)));
    const kids = new Map<string, Item[]>();
    for (const i of shown) {
      const key = i.parentId ?? `ws:${i.workstreamId}`;
      kids.set(key, [...(kids.get(key) ?? []), i]);
    }
    for (const list of kids.values()) list.sort((a, b) => a.order - b.order);
    const out: Row[] = [];
    const walk = (key: string, depth: number) => {
      for (const it of kids.get(key) ?? []) {
        const hasKids = kids.has(it.id);
        out.push({ kind: 'item', item: it, depth, hasKids });
        if (hasKids && !collapsed.has(it.id)) walk(it.id, depth + 1);
      }
    };
    for (const ws of workstreams) {
      const hasKids = kids.has(`ws:${ws.id}`);
      out.push({ kind: 'ws', ws, depth: 0, hasKids });
      if (!collapsed.has(ws.id)) walk(`ws:${ws.id}`, 1);
    }
    return out;
  }, [items, workstreams, collapsed, agileWs]);

  // Time scale
  const px = ZOOMS[zoom];
  const range = useMemo(() => {
    if (!schedule?.nodes.length) return { start: 0, end: 0 };
    const starts = schedule.nodes.map((n) => toEpochDay(n.es));
    const ends = schedule.nodes.map((n) => toEpochDay(n.ef));
    return { start: Math.min(...starts) - 14, end: Math.max(...ends) + 45 };
  }, [schedule]);
  const chartW = Math.max(400, (range.end - range.start) * px);
  const x = (iso: string) => (toEpochDay(iso) - range.start) * px;
  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.kind === 'ws' ? r.ws.id : r.item.id, i])), [rows]);

  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer is intentionally not memoized
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 25,
    scrollMargin: HEADER_H,
  });
  const vItems = virtualizer.getVirtualItems();
  const first = vItems[0]?.index ?? 0;
  const last = vItems.at(-1)?.index ?? 0;

  // Start scrolled to "today"
  const scrolledToToday = useRef(false);
  useLayoutEffect(() => {
    if (scrolledToToday.current || !schedule || !scrollRef.current || !range.start) return;
    scrollRef.current.scrollLeft = Math.max(0, x(schedule.asOf) - 240);
    scrolledToToday.current = true;
  });
  const scrollToToday = () => scrollRef.current?.scrollTo({ left: Math.max(0, x(schedule!.asOf) - 240), behavior: 'smooth' });

  // Keep "today" in view when zoom changes
  const prevZoom = useRef(zoom);
  useEffect(() => {
    if (prevZoom.current !== zoom && schedule && scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, x(schedule.asOf) - 240);
    prevZoom.current = zoom;
  });

  const critEdges = useMemo(() => new Set((schedule?.criticalEdges ?? []).map((e) => `${e.from}>${e.to}`)), [schedule]);

  if (!items || !schedule) return <div className="p-6 text-muted">Loading the plan…</div>;
  if (items.length === 0) return <div className="p-6 text-muted">This program has no plan yet. Switch to Titan-1.</div>;

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const open = (id: string) => setParams((p) => (p.set('item', id), p), { replace: false });

  // Ticks for the header
  const ticks: { x: number; label: string; major: boolean }[] = [];
  for (let d = range.start; d <= range.end; d++) {
    const iso = fromEpochDay(d);
    const [, m, day] = iso.split('-');
    const isMonth = day === '01';
    if (zoom === 'week' && (new Date(d * 86_400_000).getUTCDay() === 1 || isMonth)) ticks.push({ x: (d - range.start) * px, label: isMonth ? fmtDate(iso) : String(Number(day)), major: isMonth });
    else if (zoom === 'month' && isMonth) ticks.push({ x: (d - range.start) * px, label: `${fmtDate(iso).split(' ')[0]} ${iso.slice(2, 4)}`, major: true });
    else if (zoom === 'quarter' && isMonth && ['01', '04', '07', '10'].includes(m!)) ticks.push({ x: (d - range.start) * px, label: `Q${(Number(m) + 2) / 3} ${iso.slice(0, 4)}`, major: true });
  }

  const today = x(schedule.asOf);
  const visibleIds = new Set(rows.slice(Math.max(0, first - 5), last + 6).map((r) => (r.kind === 'ws' ? r.ws.id : r.item.id)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Zoom">
          {(Object.keys(ZOOMS) as Zoom[]).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)} className={cn('h-6 rounded px-2 text-[12px] capitalize', zoom === z ? 'bg-accent-subtle font-medium text-accent' : 'text-muted hover:text-text')}>
              {z}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12.5px]">
          <input type="checkbox" checked={showCritical} onChange={(e) => setShowCritical(e.target.checked)} /> Critical path
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px]">
          <input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} /> Baseline{baseline ? ` (${baseline.name})` : ''}
        </label>
        <button type="button" onClick={scrollToToday} className="h-7 rounded-md border border-border px-2 text-[12.5px] hover:bg-surface-2">
          Today
        </button>
        <button type="button" onClick={() => setCollapsed(new Set(workstreams.map((w) => w.id)))} className="h-7 rounded-md px-2 text-[12.5px] text-muted hover:bg-surface-2">
          Collapse all
        </button>
        <button type="button" onClick={() => setCollapsed(new Set())} className="h-7 rounded-md px-2 text-[12.5px] text-muted hover:bg-surface-2">
          Expand all
        </button>
        <span className="ml-auto text-[12px] text-subtle">
          {items.filter((i) => SHOWN.includes(i.type)).length} items · finish {fmtDate(schedule.projectFinish, schedule.asOf)}
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-border bg-amber-subtle px-3 py-2 text-[12.5px] text-amber md:hidden">
        <Monitor className="size-4" aria-hidden /> The timeline is built for larger screens. Open Keel on a desktop to work with the plan.
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" data-testid="timeline-scroll">
        <div style={{ width: GRID_W + chartW, height: HEADER_H + rows.length * ROW_H }} className="relative">
          {/* Header */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-surface-2" style={{ height: HEADER_H, width: GRID_W + chartW }}>
            <div className="sticky left-0 z-30 flex items-end border-r border-border bg-surface-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle" style={{ width: GRID_W }}>
              <span className="w-14 pl-2">WBS</span>
              <span className="flex-1">Name</span>
              <span className="w-[72px]">Start</span>
              <span className="w-[72px]">Finish</span>
              <span className="w-14 pr-2 text-right" title="Slack to the next deadline">Slack</span>
              <span className="w-12 pr-2 text-right" title="Finish variance vs baseline (working days)">Var</span>
            </div>
            <svg width={chartW} height={HEADER_H} className="block shrink-0" aria-hidden>
              {ticks.map((t) => (
                <g key={t.x}>
                  <line x1={t.x} x2={t.x} y1={t.major ? 8 : 26} y2={HEADER_H} stroke="var(--k-border-strong)" />
                  <text x={t.x + 4} y={t.major ? 20 : 38} fontSize={11} fill="var(--k-text-muted)" fontWeight={t.major ? 600 : 400}>
                    {t.label}
                  </text>
                </g>
              ))}
              <line x1={today} x2={today} y1={0} y2={HEADER_H} stroke="var(--k-accent)" strokeWidth={2} />
            </svg>
          </div>

          {/* Chart layer */}
          <svg className="absolute" style={{ left: GRID_W, top: HEADER_H }} width={chartW} height={rows.length * ROW_H} role="img" aria-label="Gantt chart">
            <defs>
              <marker id="arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L6,3 L0,6 z" fill="var(--k-text-subtle)" />
              </marker>
              <marker id="arr-crit" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L6,3 L0,6 z" fill="var(--k-critical)" />
              </marker>
            </defs>
            {ticks
              .filter((t) => t.major)
              .map((t) => (
                <line key={t.x} x1={t.x} x2={t.x} y1={0} y2={rows.length * ROW_H} stroke="var(--k-border)" />
              ))}
            {selected && rowIndex.has(selected) && <rect x={0} y={rowIndex.get(selected)! * ROW_H} width={chartW} height={ROW_H} fill="var(--k-accent-subtle)" />}

            {/* Dependency arrows (only those touching visible rows) */}
            {relations.map((r) => {
              if (r.kind !== 'FS' && r.kind !== 'SS') return null;
              if (!visibleIds.has(r.fromId) && !visibleIds.has(r.toId)) return null;
              const ia = rowIndex.get(r.fromId);
              const ib = rowIndex.get(r.toId);
              const a = nodes.get(r.fromId);
              const b = nodes.get(r.toId);
              if (ia === undefined || ib === undefined || !a || !b) return null;
              const crit = showCritical && critEdges.has(`${r.fromId}>${r.toId}`);
              const y1 = ia * ROW_H + ROW_H / 2;
              const y2 = ib * ROW_H + ROW_H / 2;
              const ax = r.kind === 'SS' ? x(a.es) : a.kind === 'procurement' ? x(a.es) : x(a.ef) + (a.es === a.ef && a.kind !== 'leaf' ? 0 : px);
              const bx = x(b.es) - 1;
              const mid = r.kind === 'SS' ? Math.min(ax, bx) - 6 : ax + 6;
              const d = bx >= mid + 4 ? `M${ax},${y1} H${mid} V${y2} H${bx}` : `M${ax},${y1} H${mid} V${y1 + (y2 > y1 ? ROW_H / 2 : -ROW_H / 2)} H${bx - 8} V${y2} H${bx}`;
              return <path key={r.id} d={d} fill="none" stroke={crit ? 'var(--k-critical)' : 'var(--k-text-subtle)'} strokeOpacity={crit ? 0.9 : 0.45} strokeWidth={crit ? 1.4 : 1} markerEnd={`url(#${crit ? 'arr-crit' : 'arr'})`} />;
            })}

            {/* Bars */}
            {vItems.map((v) => {
              const row = rows[v.index]!;
              if (row.kind === 'ws') return null;
              const it = row.item;
              const n = nodes.get(it.id);
              if (!n) return null;
              const y = v.index * ROW_H;
              const crit = showCritical && n.critical && n.kind !== 'summary';
              const b = showBaseline ? baseline?.snapshot[it.id] : undefined;
              const pct = 'percentComplete' in it ? it.percentComplete : 0;
              const onClick = () => open(it.id);
              const common = { onClick, style: { cursor: 'pointer' }, 'data-item': it.id } as const;
              const ghost = b && <rect x={x(b.start)} y={y + ROW_H - 8} width={Math.max(2, x(b.finish) + px - x(b.start))} height={3} rx={1} fill="var(--k-baseline)" />;

              if (n.kind === 'summary') {
                const x0 = x(n.es);
                const w = Math.max(2, x(n.ef) + px - x0);
                return (
                  <g key={it.id} {...common}>
                    {ghost}
                    <g style={{ transform: `translate(${x0}px, ${y + 9}px)`, transition: 'transform 600ms ease' }}>
                      <rect width={w} height={6} fill="var(--k-text-muted)" rx={1} />
                      <path d={`M0,6 l0,5 l5,-5 M${w},6 l0,5 l-5,-5`} fill="var(--k-text-muted)" stroke="var(--k-text-muted)" />
                    </g>
                  </g>
                );
              }
              if (it.type === 'milestone' || it.type === 'gate' || n.kind === 'procurement') {
                const cx = n.kind === 'procurement' ? x(n.es) : x(n.es) + px;
                const rag = schedule.rag.items[it.id];
                const fill = crit ? 'var(--k-critical)' : rag === 'red' ? 'var(--k-red)' : rag === 'amber' ? 'var(--k-amber)' : 'var(--k-text)';
                const deadline = it.type === 'milestone' || it.type === 'gate' ? it.deadline : undefined;
                const dl = deadline ? x(deadline) + px : undefined;
                return (
                  <g key={it.id} {...common}>
                    {ghost}
                    {dl !== undefined && (
                      <g>
                        <line x1={dl} x2={dl} y1={y + 4} y2={y + ROW_H - 4} stroke="var(--k-red)" strokeWidth={1.5} strokeDasharray="2 2" />
                        <title>Deadline {fmtDate(deadline)}</title>
                      </g>
                    )}
                    <g style={{ transform: `translate(${cx}px, ${y + ROW_H / 2}px)`, transition: 'transform 600ms ease' }}>
                      {n.kind === 'procurement' ? (
                        <path d="M-6,-5 H6 L0,6 Z" fill={it.type === 'procurement' && it.deliveryStatus === 'delivered' ? 'var(--k-green)' : fill} />
                      ) : (
                        <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" fill={fill} stroke={it.type === 'gate' ? 'var(--k-surface)' : 'none'} strokeWidth={it.type === 'gate' ? 2 : 0} />
                      )}
                      <text x={10} y={4} fontSize={11} fill="var(--k-text-muted)">
                        {fmtDate(n.es)}
                      </text>
                    </g>
                    <title>
                      {it.title} · {fmtDate(n.es)}
                    </title>
                  </g>
                );
              }
              const x0 = x(n.es);
              const w = Math.max(3, x(n.ef) + px - x0);
              return (
                <g key={it.id} {...common}>
                  {ghost}
                  <g style={{ transform: `translate(${x0}px, ${y + 6}px)`, transition: 'transform 600ms ease' }}>
                    <rect width={w} height={13} rx={2} fill={crit ? 'var(--k-critical)' : 'var(--k-accent)'} opacity={crit ? 0.85 : 0.7} />
                    {pct > 0 && <rect width={(w * pct) / 100} height={13} rx={2} fill={crit ? 'var(--k-critical)' : 'var(--k-accent)'} />}
                  </g>
                  <title>
                    {it.title} · {fmtDate(n.es)} → {fmtDate(n.ef)} · {pct}%
                  </title>
                </g>
              );
            })}
            <line x1={today} x2={today} y1={0} y2={rows.length * ROW_H} stroke="var(--k-accent)" strokeWidth={1.5} strokeOpacity={0.6} />
          </svg>

          {/* Grid rows */}
          {vItems.map((v) => {
            const row = rows[v.index]!;
            const top = v.start;
            if (row.kind === 'ws') {
              return (
                <div key={row.ws.id} className="pointer-events-none absolute left-0 flex" style={{ top, height: ROW_H, width: GRID_W + chartW }}>
                  <button
                    type="button"
                    onClick={() => toggle(row.ws.id)}
                    aria-expanded={!collapsed.has(row.ws.id)}
                    className="pointer-events-auto sticky left-0 z-10 flex items-center gap-1.5 border-b border-r border-border bg-surface-2 pl-1.5 text-left font-semibold"
                    style={{ width: GRID_W }}
                  >
                    {collapsed.has(row.ws.id) ? <ChevronRight className="size-3.5 text-subtle" /> : <ChevronDown className="size-3.5 text-subtle" />}
                    <span className="size-2 rounded-sm" style={{ background: row.ws.color }} aria-hidden />
                    {row.ws.name}
                    <RagDot rag={schedule.rag.workstreams[row.ws.id]} className="ml-1" />
                    {row.ws.mode === 'agile' && <span className="ml-1 text-[11px] font-normal text-subtle">· sprint-run (phase 3)</span>}
                  </button>
                </div>
              );
            }
            const it = row.item;
            const n = nodes.get(it.id);
            const slack = n?.deadlineFloatHalfDays;
            const vr = schedule.variance[it.id]?.finishDays;
            const isSel = selected === it.id;
            return (
              <div key={it.id} className="pointer-events-none absolute left-0 flex" style={{ top, height: ROW_H, width: GRID_W + chartW }}>
                <div
                  role="row"
                  aria-selected={isSel}
                  tabIndex={0}
                  onClick={() => open(it.id)}
                  onKeyDown={(e) => e.key === 'Enter' && open(it.id)}
                  className={cn(
                    'pointer-events-auto sticky left-0 z-10 flex cursor-pointer items-center border-b border-r border-border text-[12.5px] hover:bg-surface-2',
                    isSel ? 'bg-accent-subtle' : 'bg-surface',
                    row.hasKids && 'font-semibold',
                  )}
                  style={{ width: GRID_W }}
                  data-testid={`row-${it.id}`}
                >
                  <span className="w-14 shrink-0 truncate pl-2 text-[11.5px] tabular-nums text-subtle">{schedule.wbs[it.id]}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1" style={{ paddingLeft: (row.depth - 1) * 14 }}>
                    {row.hasKids ? (
                      <button
                        type="button"
                        aria-label={collapsed.has(it.id) ? 'Expand' : 'Collapse'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(it.id);
                        }}
                        className="text-subtle"
                      >
                        {collapsed.has(it.id) ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      </button>
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    {it.type === 'gate' && <Flag className="size-3.5 shrink-0 text-subtle" aria-label="Stage gate" />}
                    {it.type === 'milestone' && <Diamond className="size-3.5 shrink-0 text-subtle" aria-label="Milestone" />}
                    {it.type === 'procurement' && <Package className="size-3.5 shrink-0 text-subtle" aria-label="Procurement" />}
                    <span className="truncate">{it.title}</span>
                    {!row.hasKids && <RagDot rag={schedule.rag.items[it.id]} className={schedule.rag.items[it.id] === 'green' ? 'opacity-0' : ''} />}
                  </span>
                  <span className="w-[72px] shrink-0 tabular-nums text-muted">{fmtDate(n?.es)}</span>
                  <span className="w-[72px] shrink-0 tabular-nums text-muted">{fmtDate(n?.ef)}</span>
                  <span className={cn('w-14 shrink-0 pr-2 text-right tabular-nums', slack !== null && slack !== undefined && slack < 0 ? 'font-semibold text-red' : 'text-subtle')}>
                    {slack === null || slack === undefined ? '' : `${slack / 2}d`}
                  </span>
                  <span className={cn('w-12 shrink-0 pr-2 text-right tabular-nums', vr && vr > 0 ? 'text-red' : vr && vr < 0 ? 'text-green' : 'text-subtle')}>
                    {vr ? `${vr > 0 ? '+' : ''}${vr}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ItemSheet programId={programId} itemId={selected} onClose={() => setParams((p) => (p.delete('item'), p))} onOpen={open} />
    </div>
  );
}
