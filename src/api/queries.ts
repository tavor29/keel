import { useMutation, useQuery } from '@tanstack/react-query';
import { useApi } from './context';

export const qk = {
  me: ['session', 'me'] as const,
  programs: ['programs'] as const,
  program: (id: string) => ['programs', id] as const,
  workstreams: (id: string) => ['programs', id, 'workstreams'] as const,
  members: (id: string) => ['programs', id, 'members'] as const,
  notifications: ['notifications'] as const,
};

export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: qk.me, queryFn: () => api.session.me() });
}

export function usePrograms() {
  const api = useApi();
  return useQuery({ queryKey: qk.programs, queryFn: () => api.programs.list() });
}

export function useWorkstreams(programId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: qk.workstreams(programId ?? ''),
    queryFn: () => api.programs.workstreams(programId!),
    enabled: !!programId,
  });
}

export function useMembers(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.members(programId), queryFn: () => api.programs.members(programId) });
}

export function useNotifications() {
  const api = useApi();
  return useQuery({ queryKey: qk.notifications, queryFn: () => api.notifications.inbox() });
}

export function useSwitchPersona() {
  const api = useApi();
  return useMutation({ mutationFn: (personId: string) => api.session.switchPersona(personId) });
}

export function useResetDemo() {
  const api = useApi();
  return useMutation({ mutationFn: () => api.demo.reset() });
}
