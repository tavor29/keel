import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-sans text-[11px] font-medium text-subtle',
        className,
      )}
      {...props}
    />
  );
}

const badgeTones = {
  neutral: 'bg-surface-2 text-muted border-border',
  accent: 'bg-accent-subtle text-accent border-transparent',
  green: 'bg-green-subtle text-green border-transparent',
  amber: 'bg-amber-subtle text-amber border-transparent',
  red: 'bg-red-subtle text-red border-transparent',
  ai: 'bg-ai-subtle text-ai border-transparent',
} as const;

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[11px] font-medium',
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Avatar({ name, color, size = 24 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initials}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  footer,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center">
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-border bg-surface text-muted [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children && <div className="mt-1.5 text-muted">{children}</div>}
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}
