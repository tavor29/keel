# Mock API contract

`src/api/contract.ts` defines `KeelApi`. In v1 the only implementation is `src/api/mock/`. The future backend implements the same contract over HTTP and WebSocket. Features never import mock code directly. They get the API from a React context.

## Principles

1. **Async everywhere.** Every method returns a `Promise`, even though the mock is in-memory. Swapping in HTTP later must not change call sites.
2. **Simulated latency.** The mock waits 80–250 ms (configurable, and 0 in tests), so loading and optimistic-update states are real.
3. **Events, not polling.** The mock emits typed events on an event bus (the future backend sends them over WebSocket). TanStack Query caches are invalidated or patched from events.
4. **Permissions enforced in the API.** The mock calls `domain/permissions.can()` and rejects with `ForbiddenError`, so persona switching in the demo behaves like real access control. For example, a supplier guest sees only shared items.
5. **Domain logic stays in `domain/`.** The mock stores state and calls domain functions (schedule, impact, EVM). It never re-implements them.
6. **Persistence.** State lives in memory, and every write is persisted to `localStorage` under `keel:v{schemaVersion}:state`. A schema version bump discards old state and reseeds. `demo.reset()` reseeds.

## Contract

```ts
export interface KeelApi {
  session: {
    me(): Promise<{ person: Person; memberships: Membership[] }>;
    personas(): Promise<Person[]>;                               // demo only: the persona switcher list
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
    get(programId: string): Promise<ScheduleView>;
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

  documents: {
    list(programId: string): Promise<ProjectDocument[]>;
    get(id: string): Promise<ProjectDocument>;
    create(programId: string, kind: DocumentKind): Promise<ProjectDocument>;          // from the kind's template
    updateSection(id: string, sectionId: string, patch: Pick<DocSection, 'title' | 'body'>): Promise<ProjectDocument>; // approved → new draft version
    submit(id: string): Promise<ProjectDocument>;
    decide(id: string, decision: 'approve' | 'reject', note?: string): Promise<ProjectDocument>; // all approve → frozen version
    versions(id: string): Promise<DocumentVersion[]>;
    render(id: string, version?: number): Promise<RenderedDocument>;                 // live now, or a frozen version
    drift(id: string): Promise<DocDrift>;                                            // latest approved vs now
    acknowledgeDrift(id: string, note?: string): Promise<ProjectDocument>;
    requirements(programId: string): Promise<Requirement[]>;
    upsertRequirement(r: Omit<Requirement, 'id'> & { id?: string }): Promise<Requirement>;
    raci(id: string): Promise<RaciMatrix>;                                           // derived + overrides + problems
    setRaci(o: RaciOverride): Promise<void>;
    stakeholders(programId: string): Promise<{ stakeholders: Stakeholder[]; comms: CommsPlanRow[] }>;
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
```

## Auxiliary types

```ts
export interface ItemQuery {
  workstreamId?: string; types?: ItemType[]; ownerId?: string; status?: Status[];
  criticalOnly?: boolean; slippedOnly?: boolean; text?: string; sprintId?: string;
}
export type NewItem = Partial<Item> & { type: ItemType; title: string; workstreamId: string };

export interface EvmFigures { bacCents: number; pvCents: number; evCents: number; acCents: number;
  committedCents: number; cpi: number | null; spi: number | null; eacCents: number; etcCents: number; vacCents: number }
export interface EvmSnapshot { asOf: string; program: EvmFigures; byWorkstream: Record<string, EvmFigures> }

export interface ScheduleView {
  programId: string;
  asOf: string;
  computedAt: string;
  projectFinish: string;
  /** Leaves, summaries, procurement and agile delivery nodes. */
  nodes: (ScheduledItem & { kind: 'leaf' | 'summary' | 'procurement' | 'agile_delivery'; deadlineFloatHalfDays: number | null })[];
  procurement: Record<string, { delivery: string; needBy: string; orderBy: string; floatDays: number; deadlineFloatDays: number | null }>;
  criticalEdges: { from: string; to: string }[];
  rag: { items: Record<string, Rag>; workstreams: Record<string, Rag>; program: Rag };
  wbs: Record<string, string>;
  /** Working days vs the active baseline; positive = late. */
  variance: Record<string, { startDays: number; finishDays: number }>;
  baselineId?: string;
}

export interface RenderedDocument {
  documentId: string;
  version: number | 'live';
  sections: { id: string; title: string; kind: DocSection['kind']; body?: string; data?: unknown }[];
}
export interface DocDrift {
  approvedVersion: number | null;
  changedSectionIds: string[];
  /** A gate/milestone moved past its approved date, or EAC moved > 5%. */
  material: boolean;
  summary: string[];                  // "G2 Energization +12 working days"
}
export interface RaciMatrix {
  rows: { itemId: string; title: string }[];
  people: { personId: string; name: string }[];
  cells: Record<string, Record<string, { letters: RaciLetter[]; overridden: boolean }>>;
  problems: { itemId: string; kind: 'no_accountable' | 'multiple_accountable' | 'no_responsible' }[];
}

export type ConnectorKind = 'jira' | 'github' | 'outlook' | 'gmail' | 'slack' | 'teams';
export interface ConnectorStatus { kind: ConnectorKind; state: 'disconnected' | 'connected' | 'error'; account?: string; lastSyncAt?: string }
export interface ConnectorMapping {
  // e.g. Jira project/board ↔ workstream, Slack/Teams channel ↔ Keel channel, mailbox ↔ person
  links: { external: { id: string; name: string }; keel: { kind: 'workstream' | 'channel' | 'person'; id: string } }[];
}
```

## Events

```ts
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
  | { type: 'document.changed'; programId: string; documentId: string }
  | { type: 'demo.step'; scenarioId: string; step: number; caption: string; hint?: string; waiting?: boolean; done?: boolean }
  | { type: 'report.changed'; programId: string; reportId: string }
  | { type: 'session.changed'; personId: string }   // persona switch: all cached data may change
  | { type: 'demo.reset' };                          // state reseeded: all cached data is stale
```

## Write pipeline in the mock

Every mutating call goes through one function:

```
assertCan(persona, action, target)
→ apply mutation to state draft
→ if it touches schedulable fields/relations: domain.schedule() → diff → emit schedule.recomputed
→ append AuditEntry
→ derive digest entries + notifications
→ persist to localStorage
→ emit events
```

`proposals.approve()` goes through the same pipeline with `proposalId` on the audit entries and posts a `system` message to each source container ("Applied: …").

## Errors

`ForbiddenError`, `NotFoundError`, `ValidationError` (with field errors), `CycleError` (relation would create a cycle; includes the cycle path), `ConflictError` (stale `updatedAt`. Unused by the mock, reserved for the backend).
