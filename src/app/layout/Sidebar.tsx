import { Check, ChevronsUpDown, RotateCcw } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { usePrograms, useResetDemo, useWorkstreams } from '@/api/queries';
import { cn } from '@/ui/cn';
import { menuItem, menuLabel, popContent } from '@/ui/menu';
import { Badge } from '@/ui/primitives';
import { currentScreen, screenPath, screens } from '../screens';

export function KeelMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="7" fill="var(--k-accent)" />
      <path d="M6 12h20l-4 9H10z" fill="var(--k-accent-fg)" />
      <path d="M16 5v7" stroke="var(--k-accent-fg)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 21h4v5h-4z" fill="var(--k-accent-fg)" />
    </svg>
  );
}

export function Sidebar({ programId, onNavigate }: { programId: string; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const programs = usePrograms().data ?? [];
  const program = programs.find((p) => p.id === programId);
  const workstreams = useWorkstreams(programId).data ?? [];
  const reset = useResetDemo();

  return (
    <nav aria-label={t('nav.program')} className="flex h-full w-60 flex-col border-r border-border bg-surface">
      <div className="flex h-11 items-center gap-2 px-3">
        <KeelMark className="size-6" />
        <span className="text-[15px] font-semibold tracking-tight">{t('app.name')}</span>
      </div>

      <div className="px-2 pb-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={t('nav.switchProgram')}
            className="flex h-12 w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-left hover:border-border-strong"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{program?.name ?? '…'}</span>
              <span className="truncate text-[11.5px] text-subtle">{program?.code}</span>
            </span>
            <ChevronsUpDown className="size-4 text-subtle" aria-hidden />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={4} className={cn(popContent, 'w-56')}>
              <DropdownMenu.Label className={menuLabel}>{t('nav.switchProgram')}</DropdownMenu.Label>
              {programs.map((p) => (
                <DropdownMenu.Item
                  key={p.id}
                  className={menuItem}
                  onSelect={() => {
                    navigate(screenPath(p.id, currentScreen(pathname)));
                    onNavigate?.();
                  }}
                >
                  <span className="flex-1">{p.name}</span>
                  {p.id === programId && <Check aria-hidden />}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <ul className="space-y-px px-2">
        {screens.map(({ key, icon: Icon }) => (
          <li key={key}>
            <NavLink
              to={screenPath(programId, key)}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-muted hover:bg-surface-2 hover:text-text',
                  isActive && 'bg-accent-subtle font-medium text-accent hover:bg-accent-subtle hover:text-accent',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {t(`nav.${key}`)}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2">
        <h2 className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t('nav.workstreams')}</h2>
        <ul className="space-y-px">
          {workstreams.map((w) => (
            <li key={w.id} className="flex h-7 items-center gap-2.5 rounded-md px-2.5 text-muted">
              <span aria-hidden className="size-2 shrink-0 rounded-sm" style={{ background: w.color }} />
              <span className="flex-1 truncate">{w.name}</span>
              {w.mode === 'agile' && <Badge>{t('nav.agile')}</Badge>}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => reset.mutate()}
          disabled={reset.isPending}
          className="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-[12px] text-subtle hover:bg-surface-2 hover:text-text"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t('topbar.resetDemo')}
        </button>
      </div>
    </nav>
  );
}
