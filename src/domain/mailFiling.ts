// Deterministic mail-filing heuristics. The scripted AI provider uses these;
// a live model can refine them (docs/ai.md §2, task file_mail).
import type { Item, MailMessage, Person } from './types';

export interface FilingSuggestion {
  itemId: string;
  confidence: number;
  reason: string;
}

const domainOf = (email: string) => email.split('@')[1]?.toLowerCase() ?? '';

export function suggestFiling(mail: Pick<MailMessage, 'from' | 'subject' | 'body'>, items: readonly Item[], people: readonly Person[]): FilingSuggestion | undefined {
  const text = `${mail.subject}\n${mail.body}`;
  const lower = text.toLowerCase();
  const fromDomain = domainOf(mail.from);
  const guestIdsFromDomain = new Set(people.filter((p) => domainOf(p.email) === fromDomain).map((p) => p.id));

  let best: FilingSuggestion | undefined;
  const consider = (s: FilingSuggestion) => {
    if (!best || s.confidence > best.confidence) best = s;
  };

  for (const item of items) {
    if (item.type === 'procurement') {
      const reasons: string[] = [];
      let score = 0;
      if (item.poNumber && text.includes(item.poNumber)) {
        score += 0.6;
        reasons.push(`mentions ${item.poNumber}`);
      }
      // voltgrid.example ↔ "VoltGrid Switchgear"
      const domainName = fromDomain.replace(/\.[a-z]+$/, '').replace(/[^a-z]/g, '');
      const supplierMatch =
        item.supplierGuestIds.some((g) => guestIdsFromDomain.has(g)) ||
        (domainName.length >= 4 && item.supplier.toLowerCase().replace(/[^a-z]/g, '').startsWith(domainName));
      if (supplierMatch) {
        score += 0.25;
        reasons.push(`sender is from ${item.supplier}`);
      }
      const words = item.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      const hits = words.filter((w) => lower.includes(w)).length;
      if (words.length && hits / words.length >= 0.5) {
        score += 0.08;
        reasons.push(`subject matches "${item.title}"`);
      }
      if (score > 0.3) consider({ itemId: item.id, confidence: Math.min(0.97, Math.round(score * 100) / 100), reason: reasons.join(', ') });
    }
  }
  return best;
}
