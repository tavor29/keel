import { Play, PlayCircle, RotateCcw, Square, X } from 'lucide-react';
import { useEffect } from 'react';
import { useApi } from '@/api/context';
import { useMe, usePersonas, useResetDemo, useScenarios, useSwitchPersona } from '@/api/queries';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';
import { Avatar } from '@/ui/primitives';
import { useDemo } from './demoStore';

/** Floating "Demo" control: scenarios, personas, reset. */
export function DemoPanel() {
  const api = useApi();
  const demo = useDemo();
  const scenarios = useScenarios().data ?? [];
  const personas = usePersonas().data ?? [];
  const me = useMe().data;
  const switchPersona = useSwitchPersona();
  const reset = useResetDemo();

  useEffect(
    () =>
      api.events.subscribe((e) => {
        if (e.type === 'demo.step') useDemo.getState().step(e.caption, e.hint, !!e.waiting, !!e.done);
        if (e.type === 'demo.reset') useDemo.getState().clear();
      }),
    [api],
  );

  if (!demo.open) {
    return (
      <button
        type="button"
        onClick={() => demo.setOpen(true)}
        className={cn('fixed bottom-4 right-4 z-40 flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 font-medium shadow-pop hover:bg-surface-2', demo.waiting && 'ring-2 ring-ai')}
      >
        <PlayCircle className="size-4 text-ai" aria-hidden /> Demo
        {demo.running && <span className="size-2 animate-pulse rounded-full bg-ai" aria-label="Scenario running" />}
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 z-40 w-[min(380px,calc(100vw-32px))] rounded-xl border border-border bg-surface shadow-pop" aria-label="Demo controls">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <PlayCircle className="size-4 text-ai" aria-hidden />
        <h2 className="font-semibold">Demo</h2>
        <span className="text-[11.5px] text-subtle">fictional data</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Minimize demo panel" onClick={() => demo.setOpen(false)}>
          <X />
        </Button>
      </header>

      <div className="space-y-3 p-3">
        {demo.running || demo.caption ? (
          <div className="space-y-2" aria-live="polite">
            <p className="text-[13px] leading-snug">{demo.caption}</p>
            {demo.hint && (
              <p className="flex gap-2 rounded-md bg-ai-subtle p-2 text-[12.5px] font-medium text-ai" data-testid="demo-hint">
                <span className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-ai" aria-hidden />
                {demo.hint}
              </p>
            )}
            <div className="flex gap-1.5">
              {demo.running ? (
                <Button size="sm" onClick={() => void api.demo.stop().then(() => useDemo.getState().clear())}>
                  <Square /> Stop
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => demo.clear()}>
                  Close scenario
                </Button>
              )}
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {scenarios.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.title}</div>
                  <div className="text-[11.5px] text-subtle">Supplier email → AI proposal → approval → change request → report</div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    useDemo.getState().start(s.id);
                    void api.demo.run(s.id);
                  }}
                >
                  <Play /> Run
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">View as</div>
          <div className="flex flex-wrap gap-1">
            {personas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => switchPersona.mutate(p.id)}
                aria-pressed={me?.person.id === p.id}
                title={`${p.name} · ${p.title ?? ''}`}
                className={cn('flex h-7 items-center gap-1.5 rounded-full border px-1.5 pr-2 text-[12px]', me?.person.id === p.id ? 'border-accent bg-accent-subtle' : 'border-border hover:bg-surface-2')}
              >
                <Avatar name={p.name} color={p.avatarColor} size={18} />
                {p.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        <Button size="sm" variant="ghost" onClick={() => reset.mutate()} disabled={reset.isPending}>
          <RotateCcw /> Reset demo data
        </Button>
      </div>
    </aside>
  );
}
