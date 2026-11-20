import { isProcurement, isTask, type PlanState } from './plan';
import type { ScheduleResult } from './scheduling/schedule';
import type { Rag } from './types';

export interface EvmFigures {
  bacCents: number;
  pvCents: number;
  evCents: number;
  acCents: number;
  committedCents: number;
  cpi: number | null;
  spi: number | null;
  eacCents: number;
  etcCents: number;
  vacCents: number;
}

export interface EvmSnapshot {
  asOf: string;
  program: EvmFigures;
  byWorkstream: Record<string, EvmFigures>;
}

interface Acc {
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  committed: number;
}

const empty = (): Acc => ({ bac: 0, pv: 0, ev: 0, ac: 0, committed: 0 });

function finish(a: Acc): EvmFigures {
  const cpi = a.ac > 0 ? a.ev / a.ac : null;
  const spi = a.pv > 0 ? a.ev / a.pv : null;
  const eac = cpi ? Math.round(a.bac / cpi) : a.bac;
  return {
    bacCents: a.bac,
    pvCents: Math.round(a.pv),
    evCents: Math.round(a.ev),
    acCents: a.ac,
    committedCents: a.committed,
    cpi,
    spi,
    eacCents: eac,
    etcCents: eac - a.ac,
    vacCents: a.bac - eac,
  };
}

/**
 * Earned value as of plan.asOf (docs/scheduling.md §7). PV uses the baseline
 * dates when present, otherwise the current schedule.
 */
export function computeEvm(plan: PlanState, result: ScheduleResult, asOf = plan.asOf): EvmSnapshot {
  const cal = result.calendar;
  const t = cal.toSlot(asOf, 'finish'); // end of the as-of day
  const byWs = new Map<string, Acc>();
  const acc = (ws: string) => byWs.get(ws) ?? (byWs.set(ws, empty()), byWs.get(ws)!);

  for (const item of plan.items) {
    const bac = isTask(item) ? (item.budgetCents ?? 0) : isProcurement(item) ? item.poValueCents : 0;
    if (!bac) continue;
    const a = acc(item.workstreamId);
    const pct = 'percentComplete' in item ? item.percentComplete : 0;
    a.bac += bac;
    a.ev += (bac * pct) / 100;

    const b = plan.baseline?.snapshot[item.id];
    const node = result.nodes.get(item.id);
    const start = b?.start ?? node?.es;
    const end = b?.finish ?? node?.ef;
    if (!start || !end) continue;
    let fraction: number;
    if (isProcurement(item)) {
      fraction = t >= cal.toSlot(start, 'start') ? 1 : 0; // value is planned at delivery
    } else {
      const s = cal.toSlot(start, 'start');
      const f = cal.toSlot(end, 'finish');
      fraction = f <= s ? (t >= f ? 1 : 0) : Math.min(1, Math.max(0, (t - s) / (f - s)));
    }
    a.pv += bac * fraction;
  }

  for (const e of plan.costEntries) {
    const a = acc(e.workstreamId);
    if (e.kind === 'actual' && e.date <= asOf) a.ac += e.amountCents;
    if (e.kind === 'commitment') a.committed += e.amountCents;
  }

  const total = empty();
  const byWorkstream: Record<string, EvmFigures> = {};
  for (const [ws, a] of byWs) {
    byWorkstream[ws] = finish(a);
    total.bac += a.bac;
    total.pv += a.pv;
    total.ev += a.ev;
    total.ac += a.ac;
    total.committed += a.committed;
  }
  return { asOf, program: finish(total), byWorkstream };
}

/** CPI/SPI tile colour: green ≥ 0.98, amber 0.90–0.98, red < 0.90. */
export function evmRag(index: number | null): Rag | null {
  if (index === null) return null;
  return index >= 0.98 ? 'green' : index >= 0.9 ? 'amber' : 'red';
}
