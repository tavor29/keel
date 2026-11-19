export interface EventBus<E> {
  subscribe(handler: (event: E) => void): () => void;
  emit(event: E): void;
}

export function createEventBus<E>(): EventBus<E> {
  const handlers = new Set<(event: E) => void>();
  return {
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    emit(event) {
      // Copy so handlers that unsubscribe during dispatch don't skip others.
      for (const h of [...handlers]) {
        try {
          h(event);
        } catch (err) {
          console.error('[keel] event handler failed', err);
        }
      }
    },
  };
}
