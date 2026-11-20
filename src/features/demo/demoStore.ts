import { create } from 'zustand';

interface DemoState {
  open: boolean;
  running?: string;
  caption?: string;
  hint?: string;
  waiting: boolean;
  log: string[];
  setOpen(o: boolean): void;
  start(id: string): void;
  step(caption: string, hint: string | undefined, waiting: boolean, done: boolean): void;
  clear(): void;
}

export const useDemo = create<DemoState>((set) => ({
  open: false,
  waiting: false,
  log: [],
  setOpen: (open) => set({ open }),
  start: (id) => set({ running: id, caption: 'Starting…', hint: undefined, waiting: false, log: [], open: true }),
  step: (caption, hint, waiting, done) =>
    set((s) => ({
      // Keep the scenario's own closing line instead of the generic completion message.
      caption: waiting || (done && caption === 'Scenario complete.' && s.caption) ? s.caption : caption,
      hint: waiting ? hint : (hint ?? undefined),
      waiting,
      running: done ? undefined : s.running,
      log: waiting ? s.log : [...s.log, caption],
    })),
  clear: () => set({ running: undefined, caption: undefined, hint: undefined, waiting: false, log: [] }),
}));
