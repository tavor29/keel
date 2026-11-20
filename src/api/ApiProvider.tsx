import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiContext, createQueryClient } from './context';
import type { KeelApi, KeelEvent } from './contract';

/**
 * Maps API events to cache invalidation. Program-scoped queries live under
 * ['p', programId] (src/api/queries.ts), so one key refreshes a program.
 */
function invalidationFor(e: KeelEvent): readonly unknown[][] | 'all' {
  switch (e.type) {
    case 'session.changed':
    case 'demo.reset':
      return 'all';
    case 'notification':
      return [['notifications']];
    case 'mail.received':
      return [['mail']];
    case 'message.posted':
      return [['p', e.message.programId], ['mail']];
    case 'proposal.created':
    case 'proposal.decided':
      return [['p', e.proposal.programId], ['notifications']];
    case 'item.changed':
    case 'schedule.recomputed':
    case 'cost.changed':
    case 'report.changed':
    case 'document.changed':
      return [['p', e.programId]];
    case 'checkin.answered':
    case 'sprint.changed':
      return [['p']];
    case 'demo.step':
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
