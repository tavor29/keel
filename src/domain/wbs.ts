import type { Item } from './types';

/**
 * WBS numbers per workstream: top-level items 1, 2, 3…; children 1.1, 1.2…
 * Ordered by `order`, then id for stability.
 */
export function wbsNumbers(items: readonly Item[]): Map<string, string> {
  const children = new Map<string, Item[]>();
  for (const i of items) {
    const key = i.parentId ?? `ws:${i.workstreamId}`;
    children.set(key, [...(children.get(key) ?? []), i]);
  }
  const out = new Map<string, string>();
  const walk = (key: string, prefix: string) => {
    const list = (children.get(key) ?? []).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    list.forEach((item, idx) => {
      const n = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
      out.set(item.id, n);
      walk(item.id, n);
    });
  };
  for (const key of children.keys()) if (key.startsWith('ws:')) walk(key, '');
  return out;
}
