import { money as domainMoney } from '@/domain/narrative';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar 3" (adds the year when it differs from `ref`'s year). */
export function fmtDate(iso: string | undefined, ref?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const base = `${MONTHS[Number(m) - 1]} ${Number(d)}`;
  return ref && ref.slice(0, 4) !== y ? `${base}, ${y}` : base;
}

export function fmtDateLong(iso: string | undefined): string {
  if (!iso) return '—';
  return `${fmtDate(iso)}, ${iso.slice(0, 4)}`;
}

/** Friendly dates inside prose: "ship date 2027-03-24" → "ship date Mar 24, 2027". */
export function humanize(text: string): string {
  return text.replace(/\b(\d{4}-\d{2}-\d{2})\b(?!T)/g, (d) => fmtDateLong(d));
}

export const money = domainMoney;

export function days(halfDays: number | null | undefined): string {
  if (halfDays === null || halfDays === undefined) return '—';
  const d = halfDays / 2;
  return `${d > 0 ? '' : ''}${Number.isInteger(d) ? d : d.toFixed(1)}d`;
}

export function signedDays(d: number): string {
  return `${d > 0 ? '+' : ''}${d}d`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d < 14 ? `${d}d ago` : fmtDate(iso.slice(0, 10));
}
