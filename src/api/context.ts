import { QueryClient } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import type { KeelApi } from './contract';

export const ApiContext = createContext<KeelApi | null>(null);

export function useApi(): KeelApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
    },
  });
}
