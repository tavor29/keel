import { describe, expect, it } from 'vitest';
import { clearOldVersions, loadState, memoryStore, saveState, stateKey } from './persistence';

describe('persistence', () => {
  it('round-trips state for the same schema version', () => {
    const store = memoryStore();
    expect(saveState(store, 3, { schemaVersion: 3, n: 1 })).toBe(true);
    expect(loadState(store, 3)).toEqual({ schemaVersion: 3, n: 1 });
  });

  it('ignores state saved under a different schema version', () => {
    const store = memoryStore({ [stateKey(2)]: JSON.stringify({ schemaVersion: 2 }) });
    expect(loadState(store, 3)).toBeUndefined();
  });

  it('treats corrupt JSON as missing', () => {
    const store = memoryStore({ [stateKey(1)]: '{not json' });
    expect(loadState(store, 1)).toBeUndefined();
  });

  it('survives a store that throws (blocked storage)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadState(throwing, 1)).toBeUndefined();
    expect(saveState(throwing, 1, {})).toBe(false);
    expect(() => clearOldVersions(throwing, 3)).not.toThrow();
  });

  it('clears older versions only', () => {
    const store = memoryStore({ [stateKey(1)]: 'a', [stateKey(2)]: 'b', [stateKey(3)]: 'c' });
    clearOldVersions(store, 3);
    expect(Object.keys(store.data)).toEqual([stateKey(3)]);
  });
});
