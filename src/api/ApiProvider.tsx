import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiContext, createQueryClient } from './context';
import type { KeelApi, KeelEvent } from './contract';

/** Maps API events to cache invalidation. Grows as features add queries. */
function invalidationFor(e: KeelEvent): readonly unknown[][] | 'all' {
  switch (e.type) {
    case 'session.changed':
    case 'demo.reset':
      return 'all';
    case 'notification':
      return [['notifications']];
    default:
      return [];
  }
}

function EventBridge({ api }: { api: KeelApi }) {
  const qc = useQueryClient();
  useEffect(
    () =>
      api.events.subscribe((e) => {
        const keys = invalidationFor(e);
        if (keys === 'all') void qc.invalidateQueries();
        else for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
      }),
    [api, qc],
  );
  return null;
}

export function ApiProvider({ api, client, children }: { api: KeelApi; client?: QueryClient; children: ReactNode }) {
  const [qc] = useState(() => client ?? createQueryClient());
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={qc}>
        <EventBridge api={api} />
        {children}
      </QueryClientProvider>
    </ApiContext.Provider>
  );
}
