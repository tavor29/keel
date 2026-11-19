/** Minimal subset of the Web Storage API, so tests can pass an in-memory store. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const stateKey = (schemaVersion: number) => `keel:v${schemaVersion}:state`;

/** Returns the persisted state for this schema version, or undefined if missing, unreadable or corrupt. */
export function loadState<T>(store: KeyValueStore | undefined, schemaVersion: number): T | undefined {
  if (!store) return undefined;
  try {
    const raw = store.getItem(stateKey(schemaVersion));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { schemaVersion?: number };
    return parsed.schemaVersion === schemaVersion ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort save: storage may be full, blocked or unavailable (private mode, previews). */
export function saveState(store: KeyValueStore | undefined, schemaVersion: number, state: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(stateKey(schemaVersion), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearOldVersions(store: KeyValueStore | undefined, schemaVersion: number) {
  if (!store) return;
  for (let v = 1; v < schemaVersion; v++) {
    try {
      store.removeItem(stateKey(v));
    } catch {
      /* ignore */
    }
  }
}

export function browserStore(): KeyValueStore | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? (data[k] ?? null) : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}
