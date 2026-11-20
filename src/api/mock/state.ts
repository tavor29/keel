import type { PromotionDraft } from '@/domain/promotion';
import type {
  AuditEntry,
  Baseline,
  Calendar,
  Channel,
  CheckinRound,
  CostEntry,
  DigestEntry,
  Item,
  MailMessage,
  MailRule,
  Membership,
  Message,
  Notification,
  Person,
  Program,
  Proposal,
  Relation,
  Sprint,
  StatusReport,
  Workstream,
} from '@/domain/types';

/**
 * Bump when the shape of MockState or the seed changes incompatibly.
 * Old persisted state is discarded and the demo reseeds.
 */
export const SCHEMA_VERSION = 5;

export interface MockState {
  schemaVersion: number;
  /** Demo "today" (seed dates are shifted so this is the visitor's current week). */
  today: string;
  /** People offered in the demo persona switcher. */
  personaIds: string[];
  currentPersonId: string;
  /** Bumped on every write; schedule caches key on it. */
  rev: number;
  people: Person[];
  programs: Program[];
  calendars: Calendar[];
  workstreams: Workstream[];
  memberships: Membership[];
  items: Item[];
  relations: Relation[];
  baselines: Baseline[];
  sprints: Sprint[];
  costEntries: CostEntry[];
  channels: Channel[];
  messages: Message[];
  mail: MailMessage[];
  mailRules: MailRule[];
  checkinRounds: CheckinRound[];
  proposals: Proposal[];
  reports: StatusReport[];
  digest: DigestEntry[];
  notifications: Notification[];
  audit: AuditEntry[];
  /** Scripted "Promote to item" drafts, keyed by message id. */
  promotionHints: Record<string, PromotionDraft>;
  /** id counter for new records */
  seq: number;
}
