// Domain types. Source of truth: docs/data-model.md (keep both in sync).

// ───────────────────────── Identity & access ─────────────────────────
export type Role = 'pm' | 'lead' | 'member' | 'guest' | 'exec';

export interface Person {
  id: string;                 // per_…
  name: string;
  email: string;
  title?: string;
  org: string;                // "Keel Corp", "CoolingCo" (guests/contractors)
  avatarColor: string;
  home: 'keel' | 'slack' | 'teams' | 'email';   // where check-ins are delivered
}

export interface Membership {
  programId: string;
  personId: string;
  role: Role;
  workstreamIds: string[];    // leads: the workstreams they lead; members: their teams
}

// ───────────────────────── Structure ─────────────────────────
export interface Program {
  id: string;                 // prg_…
  name: string;
  code: string;               // "TITAN", "LUMEN"
  description: string;
  start: string;              // ISO date; slot 0 = AM of the first working day on/after this
  calendarId: string;
  currency: 'USD';
  checkinCadence: { weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; enabled: boolean };
  activeBaselineId?: string;
  budgetCents: number;        // BAC at program level (sum of workstreams, validated)
}

export interface Calendar {
  id: string;                 // cal_…
  name: string;
  workWeek: boolean[];        // index 0 = Monday … 6 = Sunday
  holidays: string[];         // ISO dates
}

export interface Workstream {
  id: string;                 // wst_…
  programId: string;
  name: string;               // "Power", "Cooling", "Model Platform"
  mode: 'scheduled' | 'agile';
  leadId: string;
  color: string;
  budgetCents: number;
  jiraBoard?: { key: string; url: string };   // agile mirror (mocked)
  order: number;
}

// ───────────────────────── Items ─────────────────────────
export type ItemType =
  | 'task' | 'milestone' | 'gate'
  | 'risk' | 'issue' | 'decision' | 'assumption'
  | 'change' | 'procurement';

export type Status = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type Rag = 'green' | 'amber' | 'red';

export interface ItemBase {
  id: string;                 // itm_…
  programId: string;
  workstreamId: string;
  parentId?: string;          // WBS outline
  order: number;              // sibling order → WBS number is computed
  type: ItemType;
  title: string;
  description?: string;       // markdown
  ownerId?: string;
  status: Status;
  rag?: Rag;                  // manual override; otherwise computed
  sharedWithGuestIds: string[];
  followerIds: string[];
  externalRef?: { system: 'jira' | 'github'; key: string; url: string };
  createdAt: string;
  updatedAt: string;
}

export interface Schedulable {
  durationHalfDays: number;   // working half-days; 0 for milestones/gates
  pinned?: { start: string }; // manual date; engine does not move it
  snet?: string;              // start-no-earlier-than
  deadline?: string;          // milestones/gates; drives negative float
  percentComplete: number;    // 0..100
  assignments: { personId: string; allocationPct: number }[];
  budgetCents?: number;       // cost-loaded tasks (BAC share)
}

export interface Task extends ItemBase, Schedulable {
  type: 'task';
  storyPoints?: number;       // agile workstreams
  sprintId?: string;
}

export interface Milestone extends ItemBase, Schedulable { type: 'milestone' }

export interface Gate extends ItemBase, Schedulable {
  type: 'gate';
  entryCriteria: Check[];
  exitCriteria: Check[];
  approverIds: string[];
  decision?: { outcome: 'pass' | 'pass_with_actions' | 'fail'; by: string; at: string; notes?: string };
}
export interface Check { id: string; text: string; done: boolean; evidenceItemId?: string }

export interface Risk extends ItemBase {
  type: 'risk';
  code?: string;              // "R-01"
  probability: 1 | 2 | 3 | 4 | 5;   // 1 rare … 5 almost certain
  impact: 1 | 2 | 3 | 4 | 5;        // severity: 1 negligible … 5 critical
  trigger?: string;
  mitigation?: string;        // actions now; mitigating items via Relation kind 'mitigates'
  contingency?: string;       // "Plan B" if the risk occurs
}
export interface Issue extends ItemBase { type: 'issue'; severity: 'low' | 'medium' | 'high' | 'critical'; resolution?: string }
export interface Decision extends ItemBase { type: 'decision'; context: string; options: string[]; outcome?: string; decidedById?: string; decidedAt?: string }
export interface Assumption extends ItemBase { type: 'assumption'; validateBy?: string; validated?: boolean }

export interface ChangeRequest extends ItemBase {
  type: 'change';
  scopeDelta: string;
  costDeltaCents: number;
  changes: PlanChange[];      // same shape as proposal changes; preview computed
  approverIds: string[];
  approvals: { personId: string; decision: 'approve' | 'reject'; at: string; note?: string }[];
  state: 'draft' | 'submitted' | 'approved' | 'rejected' | 'applied';
}

export interface Procurement extends ItemBase, Pick<Schedulable, 'percentComplete'> {
  type: 'procurement';
  supplier: string;
  supplierGuestIds: string[];
  poNumber?: string;
  poValueCents: number;
  leadTimeDays: number;       // calendar days (supplier lead times are quoted in calendar time)
  orderedOn?: string;
  expectedDelivery?: string;  // supplier-promised; updated from email/check-ins
  delivered?: string;
  deliveryStatus: 'not_ordered' | 'ordered' | 'in_production' | 'shipped' | 'delivered' | 'delayed';
  // computed: needBy (ES of earliest dependent task), orderBy (needBy − leadTime), floatDays
}

export type Item = Task | Milestone | Gate | Risk | Issue | Decision | Assumption | ChangeRequest | Procurement;

// ───────────────────────── Relations ─────────────────────────
export type RelationKind =
  | 'FS' | 'SS'                         // scheduling (lag in working half-days)
  | 'relates' | 'blocks' | 'mitigates' | 'caused_by' | 'promoted_from' | 'impacts';

export interface Relation {
  id: string;                 // rel_…
  programId: string;
  kind: RelationKind;
  fromId: string;             // predecessor for FS/SS
  toId: string;               // successor for FS/SS
  lagHalfDays?: number;       // FS/SS only; may be negative
  sourceRef?: { kind: 'message'; id: string };   // for promoted_from
}

// ───────────────────────── Schedule (computed) ─────────────────────────
export interface ScheduledItem {
  itemId: string;
  es: string; ef: string;     // early start/finish (dates)
  ls: string; lf: string;     // late start/finish
  totalFloatHalfDays: number;
  critical: boolean;
}

export interface Baseline {
  id: string;                 // bsl_…
  programId: string;
  name: string;               // "Contract baseline", "CR-012 rebaseline"
  createdAt: string;
  createdById: string;
  reason?: string;
  changeRequestId?: string;
  snapshot: Record<string, { start: string; finish: string; budgetCents?: number }>;
}

// ───────────────────────── Agile ─────────────────────────
export interface Sprint {
  id: string;                 // spr_…
  workstreamId: string;
  name: string;               // "Sprint 14"
  start: string; end: string;
  state: 'planned' | 'active' | 'closed';
  committedPoints: number;
  completedPoints?: number;   // on close
  burndown: { date: string; remainingPoints: number }[];
}

// ───────────────────────── Cost ─────────────────────────
export interface CostEntry {
  id: string;                 // cst_…
  programId: string;
  workstreamId: string;
  itemId?: string;
  kind: 'commitment' | 'actual';
  amountCents: number;
  date: string;
  ref?: string;               // PO-4471, invoice no.
  vendor?: string;
}

// ───────────────────────── Conversation ─────────────────────────
export type MessageSource = 'keel' | 'email' | 'slack' | 'teams' | 'jira' | 'github' | 'system' | 'checkin' | 'ai';

export interface Channel {
  id: string;                 // chn_…
  programId: string;
  workstreamId?: string;      // program-level if absent
  name: string;
  bridge?: { system: 'slack' | 'teams'; externalName: string };
}

export interface Message {
  id: string;                 // msg_…
  programId: string;
  container: { kind: 'item'; id: string } | { kind: 'channel'; id: string };
  parentId?: string;          // thread reply
  source: MessageSource;
  authorId?: string;          // absent for system/connector events
  body: string;               // markdown
  email?: { from: string; to: string[]; cc: string[]; subject: string; mailMessageId: string };
  event?: { system: 'jira' | 'github'; type: string; payload: Record<string, unknown> };
  mentions: string[];
  createdAt: string;
  visibility: 'members' | 'pm_only';   // filed-private emails are pm_only
  promotedItemId?: string;    // "Promote to item" created this item from the message
}

export interface MailMessage {                    // synced mailbox (pre-filing)
  id: string;                 // mail_…
  ownerId: string;            // whose mailbox
  from: string; to: string[]; cc: string[];
  subject: string; body: string; receivedAt: string;
  suggestion?: { itemId: string; confidence: number; reason: string };
  state: 'unfiled' | 'filed_private' | 'filed_shared' | 'dismissed';
  filedMessageId?: string;
}

export interface MailRule {
  id: string; ownerId: string;
  match: { fromDomain?: string; fromAddress?: string; subjectContains?: string };
  targetItemId: string;
  share: boolean;
}

// ───────────────────────── Check-ins ─────────────────────────
export interface CheckinRound {
  id: string;                 // chk_…
  programId: string;
  kind: 'weekly' | 'adhoc';
  scope: { kind: 'active_window' } | { kind: 'critical_path' } | { kind: 'items'; itemIds: string[] };
  sentAt: string;
  requests: CheckinRequest[];
}
export interface CheckinRequest {
  itemId: string; personId: string; channel: Person['home'];
  answer?: { kind: 'on_track' } | { kind: 'at_risk'; newDate: string; note?: string } | { kind: 'blocked'; reason: string };
  answeredAt?: string;
}

// ───────────────────────── Proposals ─────────────────────────
export type PlanChange =
  | { op: 'set_dates'; itemId: string; start?: string; durationHalfDays?: number }
  | { op: 'set_field'; itemId: string; field: string; value: unknown }
  | { op: 'set_delivery'; itemId: string; expectedDelivery: string }
  | { op: 'add_relation'; relation: Omit<Relation, 'id' | 'programId'> }
  | { op: 'remove_relation'; relationId: string }
  | { op: 'create_item'; draft: Partial<Item> & { type: ItemType; title: string; workstreamId: string } }
  | { op: 'set_status'; itemId: string; status: Status }
  | { op: 'cost_entry'; entry: Omit<CostEntry, 'id' | 'programId'> };

export interface Impact {                         // computed by domain/, never by the model
  moved: { itemId: string; fromStart: string; toStart: string; fromFinish: string; toFinish: string }[];
  criticalPathChanged: boolean;
  newlyCritical: string[];
  ragChanges: { itemId: string; from: Rag; to: Rag }[];
  milestoneSlips: { itemId: string; days: number }[];
  costDeltaCents: number;
  evm?: { cpiFrom: number; cpiTo: number; spiFrom: number; spiTo: number; eacFromCents: number; eacToCents: number };
}

export interface Proposal {
  id: string;                 // prp_…
  programId: string;
  origin: 'ai' | 'checkin' | 'connector' | 'ask_keel' | 'person';
  summary: string;            // "GPU delivery slips 15 days → Rack & Stack moves → Energization at risk"
  rationale: string;
  sources: { kind: 'message' | 'mail' | 'checkin' | 'event'; id: string; quote?: string }[];
  changes: PlanChange[];
  impact: Impact;
  confidence?: number;        // AI-origin only
  /** Alternatives: proposals sharing a group are options; approving one supersedes the rest. */
  optionGroup?: string;
  optionLabel?: string;       // "Option A · Move the launch 2 weeks"
  state: 'pending' | 'approved' | 'edited_approved' | 'rejected' | 'superseded';
  decidedById?: string; decidedAt?: string;
  createdAt: string;
}

// ───────────────────────── Audit, reports, notifications ─────────────────────────
export interface AuditEntry {
  id: string; programId: string; at: string; actorId?: string;
  action: string;             // "proposal.approved", "baseline.set", "item.updated"
  targetId: string;
  before?: unknown; after?: unknown;
  proposalId?: string; changeRequestId?: string;
}

export interface StatusReport {
  id: string;                 // rpt_…
  programId: string;
  periodStart: string; periodEnd: string;
  state: 'draft' | 'published';
  version: number;
  sections: ReportSection[];
  publishedAt?: string; publishedById?: string;
}
export interface ReportSection {
  key: 'summary' | 'rag' | 'milestones' | 'critical_path' | 'budget' | 'risks' | 'decisions' | 'asks' | 'next';
  title: string;
  lines: { id: string; text: string; sources: { kind: 'item' | 'message' | 'proposal'; id: string }[] }[];
}

export interface Notification {
  id: string; personId: string; at: string;
  kind: 'mention' | 'approval_needed' | 'checkin_assigned' | 'cr_approval';
  targetId: string; read: boolean;
}

export interface DigestEntry {                    // "what changed since you last looked"
  id: string; programId: string; at: string;
  group: 'schedule' | 'rag' | 'risk' | 'decision' | 'budget' | 'sprint' | 'people';
  text: string; itemIds: string[]; sourceIds: string[];
}

// ───────────────────────── Documents (docs/documents.md) ─────────────────────────
export type DocumentKind = 'charter' | 'brd' | 'raci' | 'stakeholders';
export type LiveSource =
  | 'sponsor' | 'milestones' | 'budget' | 'team' | 'top_risks'
  | 'requirements' | 'raci' | 'stakeholders' | 'comms_plan';

export interface DocSection {
  id: string;
  title: string;
  kind: 'narrative' | 'live';
  body?: string;                       // narrative: markdown
  live?: { source: LiveSource; filter?: Record<string, unknown> };   // live: a binding, not content
}

/** Named ProjectDocument to avoid clashing with the DOM's global Document type. */
export interface ProjectDocument {
  id: string;                          // doc_…
  programId: string;
  kind: DocumentKind;
  title: string;
  ownerId: string;
  approverIds: string[];
  sharedWithGuestIds: string[];
  sections: DocSection[];              // working copy
  state: 'draft' | 'in_review' | 'approved';
  version: number;                     // working version number
  approvals: { personId: string; decision: 'approve' | 'reject'; at: string; note?: string }[];
  approvedVersion?: number;            // latest approved version
  driftAcknowledged?: { version: number; at: string; byId: string; note?: string };
  attachments: { id: string; name: string; mime: string; sizeBytes: number; url?: string; addedById: string; addedAt: string }[];
  createdAt: string;
  updatedAt: string;
}

/** A frozen approved version: live sections are stored as their rendered data at approval time. */
export interface DocumentVersion {
  id: string;                          // dver_…
  documentId: string;
  version: number;
  approvedAt: string;
  approverIds: string[];
  sections: (DocSection & { rendered?: unknown })[];
}

export interface Requirement {
  id: string;                          // req_…
  programId: string;
  documentId: string;
  code: string;                        // "BR-001"
  statement: string;
  rationale?: string;
  priority: 'must' | 'should' | 'could' | 'wont';
  status: 'proposed' | 'approved' | 'in_delivery' | 'met' | 'dropped';
  ownerId?: string;
  tracedItemIds: string[];             // plan items that deliver it
}

export type RaciLetter = 'R' | 'A' | 'C' | 'I';
/** Manual override of a derived RACI cell; [] = explicitly none. */
export interface RaciOverride { documentId: string; itemId: string; personId: string; letters: RaciLetter[] }

export interface Stakeholder {
  id: string;                          // stk_…
  programId: string;
  personId?: string;                   // a member or guest…
  name?: string; org?: string; role?: string;   // …or someone outside Keel
  influence: 1 | 2 | 3 | 4 | 5;
  interest: 1 | 2 | 3 | 4 | 5;
  attitude: 'champion' | 'supporter' | 'neutral' | 'skeptic' | 'blocker';
}

export interface CommsPlanRow {
  id: string;                          // com_…
  programId: string;
  audience: string;
  message: string;
  channel: 'meeting' | 'email' | 'keel' | 'slack' | 'teams' | 'report';
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'per_gate' | 'ad_hoc';
  ownerId: string;
  nextDue?: string;
}
