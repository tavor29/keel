import { Monitor, Moon, RotateCcw, Sun, type LucideIcon, FolderKanban, Search } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { usePrograms, useResetDemo } from '@/api/queries';
import { cn } from '@/ui/cn';
import { Kbd } from '@/ui/primitives';
import { usePalette } from './palette';
import { currentScreen, screenPath, screens } from './screens';
import { useTheme } from './theme';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
}

export function CommandPalette() {
  const { t } = useTranslation();
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.setOpen);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { programId = '' } = useParams();
  const programsData = usePrograms().data;
  const setTheme = useTheme((s) => s.setPref);
  const reset = useResetDemo();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const screen = currentScreen(pathname);
    return [
      ...screens.map((s) => ({
        id: `go:${s.key}`,
        group: t('palette.groupNavigate'),
        label: t(`nav.${s.key}`),
        icon: s.icon,
        run: () => navigate(screenPath(programId, s.key)),
      })),
      ...(programsData ?? []).map((p) => ({
        id: `program:${p.id}`,
        group: t('palette.groupProgram'),
        label: p.name,
        hint: p.code,
        icon: FolderKanban,
        run: () => navigate(screenPath(p.id, screen)),
      })),
      ...(
        [
          ['light', Sun],
          ['dark', Moon],
          ['system', Monitor],
        ] as const
      ).map(([pref, icon]) => ({
        id: `theme:${pref}`,
        group: t('palette.groupTheme'),
        label: t(`theme.${pref}`),
        icon,
        run: () => setTheme(pref),
      })),
      {
        id: 'demo:reset',
        group: t('palette.groupDemo'),
        label: t('topbar.resetDemo'),
        icon: RotateCcw,
        run: () => reset.mutate(),
      },
    ];
  }, [t, programsData, pathname, programId, navigate, setTheme, reset]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.group} ${c.hint ?? ''}`.toLowerCase().includes(q));
  }, [commands, query]);

  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));

  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };

  const runCommand = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (filtered.length ? (Math.min(a, filtered.length - 1) + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (filtered.length ? (Math.min(a, filtered.length - 1) - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runCommand(filtered[activeIndex]);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(600px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-pop"
        >
          <Dialog.Title className="sr-only">{t('palette.title')}</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-subtle" aria-hidden />
            <input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="keel-palette-list"
              aria-activedescendant={filtered[activeIndex] ? `cmd-${filtered[activeIndex].id}` : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={t('palette.placeholder')}
              className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-subtle"
            />
            <Kbd>Esc</Kbd>
          </div>
          <ul id="keel-palette-list" role="listbox" aria-label={t('palette.title')} className="max-h-[50vh] overflow-y-auto p-1">
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-muted">{t('palette.empty')}</li>}
            {filtered.map((c, i) => {
              const header = i === 0 || filtered[i - 1]?.group !== c.group ? c.group : null;
              const Icon = c.icon;
              return (
                <li key={c.id} role="presentation">
                  {header && (
                    <div role="presentation" className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      {header}
                    </div>
                  )}
                  <div
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseMove={() => setActive(i)}
                    onClick={() => runCommand(c)}
                    className={cn(
                      'flex h-8 cursor-default items-center gap-2.5 rounded px-2',
                      i === activeIndex && 'bg-surface-2',
                    )}
                  >
                    <Icon className="size-4 text-subtle" aria-hidden />
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="text-[11.5px] text-subtle">{c.hint}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border px-3 py-2 text-[11.5px] text-subtle">{t('palette.askHint')}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
