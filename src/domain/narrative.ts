// Deterministic text from computed facts: proposal summaries, digest lines.
// Numbers in these strings always come from domain computations (docs/ai.md §4),
// never from a model.
import { diffDays } from './dates';
import type { DigestEntry, Impact, Item, PlanChange } from './types';

const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function money(cents: number): string {
  const abs = Math.abs(cents) / 100;
  const s = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M` : abs >= 1000 ? `$${Math.round(abs / 1000)}k` : `$${Math.round(abs)}`;
  return cents < 0 ? `−${s}` : s;
}

/** "MV switchgear lineup B delivery +21 days" */
export function describeChange(c: PlanChange, items: ReadonlyMap<string, Item>): string {
  const title = (id: string) => items.get(id)?.title ?? id;
  switch (c.op) {
    case 'set_delivery': {
      const item = items.get(c.itemId);
      const prev = item?.type === 'procurement' ? item.expectedDelivery : undefined;
      const delta = prev ? diffDays(prev, c.expectedDelivery) : 0;
      return `${title(c.itemId)} delivery ${prev ? `${signed(delta)} days (${prev} → ${c.expectedDelivery})` : `→ ${c.expectedDelivery}`}`;
    }
    case 'set_dates': {
      const item = items.get(c.itemId);
      const parts: string[] = [];
      if (c.durationHalfDays !== undefined && item?.type === 'task') {
        parts.push(`duration ${item.durationHalfDays / 2} → ${c.durationHalfDays / 2} days`);
      }
      if (c.start) parts.push(`start no earlier than ${c.start}`);
      return `${title(c.itemId)}: ${parts.join(', ')}`;
    }
    case 'set_status':
      return `${title(c.itemId)} → ${c.status.replace('_', ' ')}`;
    case 'set_field':
      return `${title(c.itemId)}: ${c.field} updated`;
    case 'add_relation':
      return `New ${c.relation.kind} link ${title(c.relation.fromId)} → ${title(c.relation.toId)}`;
    case 'remove_relation':
      return 'Remove a dependency';
    case 'create_item':
      return `New ${c.draft.type}: ${c.draft.title}`;
    case 'cost_entry':
      return `${c.entry.kind === 'commitment' ? 'Commit' : 'Record'} ${money(c.entry.amountCents)}${c.entry.vendor ? ` (${c.entry.vendor})` : ''}`;
  }
}

/**
 * One-line summary of a proposal: what changes → the biggest consequence.
 * "MV switchgear lineup B delivery +21 days → G2 · Energization +9 working days, now red"
 */
export function summarizeProposal(changes: readonly PlanChange[], impact: Impact, items: ReadonlyMap<string, Item>): string {
  const head = changes.length ? describeChange(changes[0]!, items) : 'No changes';
  const more = changes.length > 1 ? ` (+${changes.length - 1} more)` : '';
  const slip = [...impact.milestoneSlips].sort((a, b) => Math.abs(b.days) - Math.abs(a.days))[0];
  const tail: string[] = [];
  if (slip) {
    const rag = impact.ragChanges.find((r) => r.itemId === slip.itemId);
    tail.push(`${items.get(slip.itemId)?.title ?? slip.itemId} ${signed(slip.days)} working days${rag ? `, now ${rag.to}` : ''}`);
  } else if (impact.moved.length) {
    tail.push(`${plural(impact.moved.length, 'item')} move, no milestone impact`);
  } else {
    tail.push('no schedule impact');
  }
  if (impact.costDeltaCents) tail.push(`${impact.costDeltaCents > 0 ? '+' : ''}${money(impact.costDeltaCents)}`);
  return `${head}${more} → ${tail.join(' · ')}`;
}

/** Digest lines for an applied change (Briefing "What changed"). */
export function digestFromImpact(
  impact: Impact,
  items: ReadonlyMap<string, Item>,
  ctx: { id: () => string; programId: string; at: string; sourceIds: string[]; cause: string },
): DigestEntry[] {
  const out: DigestEntry[] = [];
  const name = (id: string) => items.get(id)?.title ?? id;
  for (const s of impact.milestoneSlips) {
    out.push({
      id: ctx.id(),
      programId: ctx.programId,
      at: ctx.at,
      group: 'schedule',
      text: `${name(s.itemId)} moved ${signed(s.days)} working days (${ctx.cause})`,
      itemIds: [s.itemId],
      sourceIds: ctx.sourceIds,
    });
  }
  for (const r of impact.ragChanges.filter((r) => items.get(r.itemId)?.type !== 'task')) {
    out.push({
      id: ctx.id(),
      programId: ctx.programId,
      at: ctx.at,
      group: 'rag',
      text: `${name(r.itemId)} turned ${r.to} (was ${r.from})`,
      itemIds: [r.itemId],
      sourceIds: ctx.sourceIds,
    });
  }
  if (impact.criticalPathChanged) {
    out.push({ id: ctx.id(), programId: ctx.programId, at: ctx.at, group: 'schedule', text: `Critical path changed (${ctx.cause})`, itemIds: impact.newlyCritical.slice(0, 5), sourceIds: ctx.sourceIds });
  }
  if (impact.costDeltaCents) {
    out.push({ id: ctx.id(), programId: ctx.programId, at: ctx.at, group: 'budget', text: `Budget ${impact.costDeltaCents > 0 ? '+' : ''}${money(impact.costDeltaCents)} (${ctx.cause})`, itemIds: [], sourceIds: ctx.sourceIds });
  }
  return out;
}
