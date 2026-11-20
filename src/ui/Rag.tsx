import type { Rag } from '@/domain/types';
import { cn } from './cn';

const dot: Record<Rag, string> = { green: 'bg-green', amber: 'bg-amber', red: 'bg-red' };
const badge: Record<Rag, string> = { green: 'bg-green-subtle text-green', amber: 'bg-amber-subtle text-amber', red: 'bg-red-subtle text-red' };
const label: Record<Rag, string> = { green: 'Green', amber: 'Amber', red: 'Red' };

export function RagDot({ rag, className }: { rag: Rag | undefined; className?: string }) {
  if (!rag) return null;
  return <span role="img" aria-label={label[rag]} title={label[rag]} className={cn('inline-block size-2 shrink-0 rounded-full', dot[rag], className)} />;
}

export function RagBadge({ rag, className, children }: { rag: Rag | undefined; className?: string; children?: React.ReactNode }) {
  if (!rag) return null;
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-semibold', badge[rag], className)}>
      <span className={cn('size-1.5 rounded-full', dot[rag])} aria-hidden />
      {children ?? label[rag]}
    </span>
  );
}
