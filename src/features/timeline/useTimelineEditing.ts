import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/api/context';
import { addDays } from '@/domain/dates';
import type { Item } from '@/domain/types';

export interface UndoEntry {
  label: string;
  run: () => Promise<unknown>;
}

export interface DragState {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  dx: number;
}

/**
 * Timeline editing: drag to move (start-no-earlier-than) or resize (duration),
 * rename, add, indent/outdent, with an undo stack. Every change goes through the
 * API, which validates it by rescheduling.
 */
export function useTimelineEditing(opts: { items: Item[]; pxPerDay: number; es: (id: string) => string | undefined; onClick: (id: string) => void }) {
  const api = useApi();
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const [error, setError] = useState<string>();
  const [drag, setDrag] = useState<DragState>();
  const dragRef = useRef<DragState | undefined>(undefined);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
    dragRef.current = drag;
  });

  const run = useCallback(async (label: string, action: () => Promise<unknown>, revert?: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await action();
      if (revert) setUndo((u) => [...u.slice(-29), { label, run: revert }]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const update = useCallback(
    (item: Item, patch: Record<string, unknown>, label: string) => {
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (item as unknown as Record<string, unknown>)[k]]));
      return run(label, () => api.items.update(item.id, patch as Partial<Item>), () => api.items.update(item.id, before as Partial<Item>));
    },
    [api, run],
  );

  const finishDrag = useCallback(() => {
    const d = dragRef.current;
    setDrag(undefined);
    if (!d) return;
    const { items, pxPerDay, es, onClick } = optsRef.current;
    const item = items.find((i) => i.id === d.id);
    if (!item || item.type !== 'task') return;
    if (Math.abs(d.dx) < 4) return onClick(d.id);
    const days = Math.round(d.dx / pxPerDay);
    if (!days) return;
    if (d.mode === 'resize') {
      const dur = Math.max(1, item.durationHalfDays + days * 2);
      void update(item, { durationHalfDays: dur }, `Resize “${item.title}”`);
    } else {
      const start = es(item.id);
      if (!start) return;
      const date = addDays(start, days);
      void update(item, item.pinned ? { pinned: { start: date } } : { snet: date }, `Move “${item.title}”`);
    }
  }, [update]);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => d && { ...d, dx: e.clientX - d.startX });
    const up = () => finishDrag();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag?.id, finishDrag]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDrag = (e: React.PointerEvent, id: string, mode: DragState['mode']) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({ id, mode, startX: e.clientX, dx: 0 });
  };

  const rename = (item: Item, title: string) => (title.trim() && title !== item.title ? update(item, { title: title.trim() }, `Rename “${item.title}”`) : Promise.resolve());

  const addTask = async (near: Item | undefined, workstreamId: string, asOf: string) => {
    setError(undefined);
    try {
      const created = await api.items.create({ type: 'task', title: 'New task', workstreamId, ...(near?.parentId ? { parentId: near.parentId } : {}), durationHalfDays: 10, snet: asOf } as never);
      setUndo((u) => [...u, { label: 'Add task', run: () => api.items.remove(created.id) }]);
      return created;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  };

  const indent = (item: Item) => {
    const { items } = optsRef.current;
    const siblings = items.filter((i) => i.workstreamId === item.workstreamId && i.parentId === item.parentId && i.order < item.order && (i.type === 'task' || i.type === 'milestone' || i.type === 'gate')).sort((a, b) => b.order - a.order);
    const target = siblings[0];
    if (!target || target.type !== 'task') return setError('Indent needs a task directly above at the same level.');
    const maxChild = Math.max(0, ...items.filter((i) => i.parentId === target.id).map((i) => i.order));
    const before = { parentId: item.parentId, workstreamId: item.workstreamId, order: item.order };
    return run(`Indent “${item.title}”`, () => api.items.move(item.id, { parentId: target.id, workstreamId: item.workstreamId, order: maxChild + 1 }), () => api.items.move(item.id, before));
  };

  const outdent = (item: Item) => {
    const { items } = optsRef.current;
    const parent = items.find((i) => i.id === item.parentId);
    if (!parent) return setError('This item is already at the top level.');
    const before = { parentId: item.parentId, workstreamId: item.workstreamId, order: item.order };
    return run(`Outdent “${item.title}”`, () => api.items.move(item.id, { ...(parent.parentId ? { parentId: parent.parentId } : {}), workstreamId: item.workstreamId, order: parent.order + 0.5 }), () => api.items.move(item.id, before));
  };

  const undoLast = async () => {
    const last = undo.at(-1);
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    setError(undefined);
    try {
      await last.run();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return { drag, startDrag, rename, addTask, indent, outdent, undo, undoLast, error, setError };
}
