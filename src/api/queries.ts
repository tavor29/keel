import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Message, PlanChange } from '@/domain/types';
import { useApi } from './context';
import type { ItemQuery } from './contract';

/**
 * Query keys. Everything program-scoped lives under ['p', programId, …] so one
 * invalidation per program event refreshes it (see ApiProvider).
 */
export const qk = {
  me: ['session', 'me'] as const,
  personas: ['session', 'personas'] as const,
  programs: ['programs'] as const,
  program: (id: string) => ['programs', id] as const,
  workstreams: (id: string) => ['p', id, 'workstreams'] as const,
  members: (id: string) => ['p', id, 'members'] as const,
  items: (id: string, q?: ItemQuery) => ['p', id, 'items', q ?? {}] as const,
  item: (programId: string, id: string) => ['p', programId, 'item', id] as const,
  relations: (id: string) => ['p', id, 'relations'] as const,
  schedule: (id: string) => ['p', id, 'schedule'] as const,
  baselines: (id: string) => ['p', id, 'baselines'] as const,
  evm: (id: string) => ['p', id, 'evm'] as const,
  proposals: (id: string) => ['p', id, 'proposals'] as const,
  preview: (id: string, changes: readonly PlanChange[]) => ['p', id, 'preview', changes] as const,
  messages: (programId: string, c: Message['container']) => ['p', programId, 'messages', c.kind, c.id] as const,
  digest: (id: string) => ['p', id, 'digest'] as const,
  checkins: (id: string) => ['p', id, 'checkins'] as const,
  reports: (id: string) => ['p', id, 'reports'] as const,
  mail: ['mail'] as const,
  notifications: ['notifications'] as const,
  scenarios: ['demo', 'scenarios'] as const,
};

export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: qk.me, queryFn: () => api.session.me() });
}

/** The current persona's role in a program. */
export function useMyRole(programId: string) {
  const me = useMe().data;
  return me?.memberships.find((m) => m.programId === programId)?.role;
}

export function usePersonas() {
  const api = useApi();
  return useQuery({ queryKey: qk.personas, queryFn: () => api.session.personas() });
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

/** id → person name lookups for a program. */
export function usePeople(programId: string) {
  const members = useMembers(programId).data;
  return useMemo(() => new Map((members ?? []).map((m) => [m.personId, m.person])), [members]);
}

export function useItems(programId: string, q?: ItemQuery) {
  const api = useApi();
  return useQuery({ queryKey: qk.items(programId, q), queryFn: () => api.items.list(programId, q) });
}

export function useItemsById(programId: string) {
  const items = useItems(programId).data;
  return useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
}

export function useItem(programId: string, id: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: qk.item(programId, id ?? ''), queryFn: () => api.items.get(id!), enabled: !!id });
}

export function useRelations(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.relations(programId), queryFn: () => api.relations.list(programId) });
}

export function useSchedule(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.schedule(programId), queryFn: () => api.schedule.get(programId), placeholderData: keepPreviousData });
}

export function useBaselines(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.baselines(programId), queryFn: () => api.schedule.baselines(programId) });
}

export function useEvm(programId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: qk.evm(programId), queryFn: () => api.cost.evm(programId), enabled });
}

export function useProposals(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.proposals(programId), queryFn: () => api.proposals.list(programId) });
}

export function usePreview(programId: string, changes: readonly PlanChange[] | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: qk.preview(programId, changes ?? []),
    queryFn: () => api.proposals.preview(programId, [...(changes ?? [])]),
    enabled: !!changes?.length,
    placeholderData: keepPreviousData,
  });
}

export function useMessages(programId: string, container: Message['container'] | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: qk.messages(programId, container ?? { kind: 'item', id: '' }),
    queryFn: () => api.conversation.messages(container!),
    enabled: !!container?.id,
  });
}

export function useDigest(programId: string, since: string) {
  const api = useApi();
  return useQuery({ queryKey: [...qk.digest(programId), since], queryFn: () => api.notifications.digest(programId, since) });
}

export function useCheckins(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.checkins(programId), queryFn: () => api.checkins.rounds(programId) });
}

export function useReports(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.reports(programId), queryFn: () => api.reports.list(programId) });
}

export function useMail() {
  const api = useApi();
  return useQuery({ queryKey: qk.mail, queryFn: () => api.mail.inbox() });
}

export function useNotifications() {
  const api = useApi();
  return useQuery({ queryKey: qk.notifications, queryFn: () => api.notifications.inbox() });
}

export function useScenarios() {
  const api = useApi();
  return useQuery({ queryKey: qk.scenarios, queryFn: () => api.demo.scenarios() });
}

// ── Mutations (cache refresh happens through API events) ─────────────────────────────

export function useSwitchPersona() {
  const api = useApi();
  return useMutation({ mutationFn: (personId: string) => api.session.switchPersona(personId) });
}

export function useResetDemo() {
  const api = useApi();
  return useMutation({ mutationFn: () => api.demo.reset() });
}

export function useApprove() {
  const api = useApi();
  return useMutation({ mutationFn: ({ id, edited }: { id: string; edited?: PlanChange[] }) => api.proposals.approve(id, edited) });
}

export function useReject() {
  const api = useApi();
  return useMutation({ mutationFn: (id: string) => api.proposals.reject(id) });
}

export function useDecideCr() {
  const api = useApi();
  return useMutation({ mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => api.changeRequests.decide(id, decision) });
}

export function useFileMail() {
  const api = useApi();
  return useMutation({ mutationFn: ({ mailId, itemId, share }: { mailId: string; itemId: string; share: boolean }) => api.mail.file(mailId, itemId, share) });
}

export function useDismissMail() {
  const api = useApi();
  return useMutation({ mutationFn: (mailId: string) => api.mail.dismiss(mailId) });
}

export function usePost() {
  const api = useApi();
  return useMutation({ mutationFn: ({ container, body }: { container: Message['container']; body: string }) => api.conversation.post(container, body) });
}

export function useDraftReport(programId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (period: { start: string; end: string }) => api.reports.draft(programId, period) });
}

export function usePublishReport() {
  const api = useApi();
  return useMutation({ mutationFn: (id: string) => api.reports.publish(id) });
}

// ── Agile & channels (phase 3) ─────────────────────────────

export function useSprints(programId: string, workstreamId: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: ['p', programId, 'sprints', workstreamId], queryFn: () => api.agile.sprints(workstreamId!), enabled: !!workstreamId });
}

export function useBacklog(programId: string, workstreamId: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: ['p', programId, 'backlog', workstreamId], queryFn: () => api.agile.backlog(workstreamId!), enabled: !!workstreamId });
}

export function useChannels(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: ['p', programId, 'channels'], queryFn: () => api.conversation.channels(programId) });
}

export function useSuggestPromotion(programId: string, messageId: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: ['p', programId, 'promotion', messageId], queryFn: () => api.ai.suggestPromotion(messageId!), enabled: !!messageId, staleTime: Infinity });
}

export function usePromote() {
  const api = useApi();
  return useMutation({ mutationFn: ({ messageId, draft }: { messageId: string; draft: Parameters<typeof api.conversation.promote>[1] }) => api.conversation.promote(messageId, draft) });
}

export function useUpdateItem() {
  const api = useApi();
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.items.update>[1] }) => api.items.update(id, patch) });
}

// ── Living documents (phase 4) ─────────────────────────────

export function useDocuments(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: ['p', programId, 'docs'], queryFn: () => api.documents.list(programId) });
}

export function useDocRender(programId: string, id: string | undefined, version?: number) {
  const api = useApi();
  return useQuery({ queryKey: ['p', programId, 'docs', id, 'render', version ?? 'live'], queryFn: () => api.documents.render(id!, version), enabled: !!id, placeholderData: keepPreviousData });
}

export function useDocDrift(programId: string, id: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: ['p', programId, 'docs', id, 'drift'], queryFn: () => api.documents.drift(id!), enabled: !!id });
}

export function useDocVersions(programId: string, id: string | undefined) {
  const api = useApi();
  return useQuery({ queryKey: ['p', programId, 'docs', id, 'versions'], queryFn: () => api.documents.versions(id!), enabled: !!id });
}

export function useDocAttention(programId: string) {
  const api = useApi();
  return useQuery({ queryKey: ['p', programId, 'docs', 'attention'], queryFn: () => api.documents.attention(programId) });
}

export function useDocActions() {
  const api = useApi();
  return {
    update: useMutation({ mutationFn: ({ id, sectionId, body }: { id: string; sectionId: string; body: string }) => api.documents.updateSection(id, sectionId, { body }) }),
    submit: useMutation({ mutationFn: (id: string) => api.documents.submit(id) }),
    decide: useMutation({ mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => api.documents.decide(id, decision) }),
    acknowledge: useMutation({ mutationFn: (id: string) => api.documents.acknowledgeDrift(id) }),
  };
}
