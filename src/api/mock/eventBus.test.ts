import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './eventBus';

describe('createEventBus', () => {
  it('delivers events to all subscribers until they unsubscribe', () => {
    const bus = createEventBus<number>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.subscribe(a);
    bus.subscribe(b);
    bus.emit(1);
    offA();
    bus.emit(2);
    expect(a.mock.calls).toEqual([[1]]);
    expect(b.mock.calls).toEqual([[1], [2]]);
  });

  it('keeps dispatching when one handler throws', () => {
    const bus = createEventBus<string>();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe(after);
    bus.emit('x');
    expect(after).toHaveBeenCalledWith('x');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
