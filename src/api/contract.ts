// KeelApi contract. Source of truth: docs/mock-api.md (keep both in sync).
// v1 implementation: src/api/mock. The future backend implements the same contract.
import type {
  Baseline, Calendar, ChangeRequest, Channel, CheckinRequest, CheckinRound, CostEntry, DigestEntry,
  Impact, Item, ItemType, MailMessage, MailRule, Membership, Message, Notification, Person, PlanChange,
  Program, Proposal, Relation, ReportSection, ScheduledItem, Sprint, Status, StatusReport, Task, Workstream,
  AuditEntry,
} from '@/domain/types';

export interface KeelApi {
  session: {
    me(): Promise<{ person: Person; memberships: Membership[] }>;
    switchPersona(personId: string): Promise<void>;            // demo only
  };

  programs: {
    list(): Promise<Program[]>;
    get(id: string): Promise<Program>;
    calendar(programId: string): Promise<Calendar>;
    workstreams(programId: string): Promise<Workstream[]>;
    members(programId: string): Promise<(Membership & { person: Person })[]>;
    update(id: string, patch: Partial<Program>): Promise<Program>;
  };

  items: {
    list(programId: string, q?: ItemQuery): Promise<Item[]>;
    get(id: string): Promise<Item>;
    create(draft: NewItem): Promise<Item>;
    update(id: string, patch: Partial<Item>): Promise<Item>;    // direct edit (owner/lead/PM)
    move(id: string, to: { parentId?: string; workstreamId: string; order: number }): Promise<void>;
    remove(id: string): Promise<void>;
    share(id: string, guestIds: string[]): Promise<void>;
    follow(id: string, on: boolean): Promise<void>;
  };

  relations: {
    list(programId: string): Promise<Relation[]>;
    add(r: Omit<Relation, 'id'>): Promise<Relation>;             // rejects cycles (CycleError)
    update(id: string, patch: Pick<Relation, 'lagHalfDays' | 'kind'>): Promise<Relation>;
    remove(id: string): Promise<void>;
  };

  schedule: {
    get(programId: string): Promise<{ items: ScheduledItem[]; computedAt: string }>;
    baselines(programId: string): Promise<Baseline[]>;
    setBaseline(programId: string, name: string, reason?: string): Promise<Baseline>;
  };

  agile: {
    sprints(workstreamId: string): Promise<Sprint[]>;
    backlog(workstreamId: string): Promise<Task[]>;
    planSprint(sprintId: string, itemIds: string[]): Promise<Sprint>;
    closeSprint(sprintId: string): Promise<Sprint>;
    projection(workstreamId: string): Promise<{ projectedFinish: string; avgVelocity: number }>;
  };

  cost: {
    entries(programId: string, q?: { workstreamId?: string; kind?: CostEntry['kind'] }): Promise<CostEntry[]>;
    add(e: Omit<CostEntry, 'id'>): Promise<CostEntry>;
    evm(programId: string, asOf?: string): Promise<EvmSnapshot>;              // program + per workstream
    evmTrend(programId: string): Promise<{ date: string; cpi: number; spi: number }[]>;
  };

  conversation: {
    channels(programId: string): Promise<Channel[]>;
    messages(container: Message['container'], q?: { before?: string; limit?: number }): Promise<Message[]>;
    post(container: Message['container'], body: string, opts?: { parentId?: string; asEmailTo?: string[] }): Promise<Message>;
    promote(messageId: string, draft: NewItem): Promise<Item>;   // creates item + promoted_from relation
  };

  mail: {
    inbox(q?: { state?: MailMessage['state'] }): Promise<MailMessage[]>;
    file(mailId: string, itemId: string, share: boolean): Promise<Message>;
    dismiss(mailId: string): Promise<void>;
    rules(): Promise<MailRule[]>;
    addRule(r: Omit<MailRule, 'id' | 'ownerId'>): Promise<MailRule>;
  };

  checkins: {
    rounds(programId: string): Promise<CheckinRound[]>;
    send(programId: string, scope: CheckinRound['scope'], kind: CheckinRound['kind']): Promise<CheckinRound>;
    answer(roundId: string, itemId: string, answer: NonNullable<CheckinRequest['answer']>): Promise<void>;
  };

  proposals: {
    list(programId: string, q?: { state?: Proposal['state'] }): Promise<Proposal[]>;
    get(id: string): Promise<Proposal>;
    preview(programId: string, changes: PlanChange[]): Promise<Impact>;      // used by "edit then approve"
    create(p: Omit<Proposal, 'id' | 'impact' | 'state' | 'createdAt'>): Promise<Proposal>;  // impact computed server-side
    approve(id: string, editedChanges?: PlanChange[]): Promise<void>;
    reject(id: string, reason?: string): Promise<void>;
  };

  changeRequests: {
    submit(id: string): Promise<ChangeRequest>;
    decide(id: string, decision: 'approve' | 'reject', note?: string): Promise<ChangeRequest>;  // all approvers → applied + rebaseline
  };

  reports: {
    list(programId: string): Promise<StatusReport[]>;
    draft(programId: string, period: { start: string; end: string }): Promise<StatusReport>;   // AI or scripted
    update(id: string, sections: ReportSection[]): Promise<StatusReport>;
    publish(id: string): Promise<StatusReport>;
  };

  notifications: {
    inbox(): Promise<Notification[]>;
    markRead(ids: string[]): Promise<void>;
    digest(programId: string, since: string): Promise<DigestEntry[]>;
  };

  ai: {
    ask(programId: string, question: string): Promise<{ answer: string; citations: { kind: string; id: string }[]; proposalIds: string[] }>;
    suggestPromotion(messageId: string): Promise<NewItem>;
  };

  connectors: {
    list(): Promise<ConnectorStatus[]>;
    connect(kind: ConnectorKind): Promise<ConnectorStatus>;     // mocked OAuth flow
    mapping(kind: ConnectorKind): Promise<ConnectorMapping>;
    setMapping(kind: ConnectorKind, m: ConnectorMapping): Promise<void>;
  };

  io: {
    importMspdi(programId: string, xml: string): Promise<{ created: number; relations: number; warnings: string[] }>;
    exportMspdi(programId: string): Promise<string>;
    exportCsv(programId: string): Promise<string>;
  };

  audit: { list(programId: string, q?: { targetId?: string }): Promise<AuditEntry[]> };

  demo: {
    scenarios(): Promise<{ id: string; programId: string; title: string; steps: number }[]>;
    run(scenarioId: string, opts?: { speed?: number }): Promise<void>;   // emits events over time
    stop(): Promise<void>;
    reset(): Promise<void>;
  };

  events: { subscribe(handler: (e: KeelEvent) => void): () => void };
}

export interface ItemQuery {
  workstreamId?: string; types?: ItemType[]; ownerId?: string; status?: Status[];
  criticalOnly?: boolean; slippedOnly?: boolean; text?: string; sprintId?: string;
}
export type NewItem = Partial<Item> & { type: ItemType; title: string; workstreamId: string };

export interface EvmFigures { bacCents: number; pvCents: number; evCents: number; acCents: number;
  committedCents: number; cpi: number | null; spi: number | null; eacCents: number; etcCents: number; vacCents: number }
export interface EvmSnapshot { asOf: string; program: EvmFigures; byWorkstream: Record<string, EvmFigures> }

export type ConnectorKind = 'jira' | 'github' | 'outlook' | 'gmail' | 'slack' | 'teams';
export interface ConnectorStatus { kind: ConnectorKind; state: 'disconnected' | 'connected' | 'error'; account?: string; lastSyncAt?: string }
export interface ConnectorMapping {
  // e.g. Jira project/board ↔ workstream, Slack/Teams channel ↔ Keel channel, mailbox ↔ person
  links: { external: { id: string; name: string }; keel: { kind: 'workstream' | 'channel' | 'person'; id: string } }[];
}

export type KeelEvent =
  | { type: 'item.changed'; programId: string; itemIds: string[] }
  | { type: 'schedule.recomputed'; programId: string }
  | { type: 'message.posted'; message: Message }
  | { type: 'mail.received'; mail: MailMessage }
  | { type: 'proposal.created' | 'proposal.decided'; proposal: Proposal }
  | { type: 'checkin.answered'; roundId: string; itemId: string }
  | { type: 'sprint.changed'; sprintId: string }
  | { type: 'cost.changed'; programId: string }
  | { type: 'notification'; notification: Notification }
  | { type: 'demo.step'; scenarioId: string; step: number; caption: string }
  | { type: 'session.changed'; personId: string }   // persona switch: all cached data may change
  | { type: 'demo.reset' };                          // state reseeded: all cached data is stale

