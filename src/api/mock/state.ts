import type {
  AuditEntry,
  Calendar,
  Channel,
  Item,
  Membership,
  Message,
  Notification,
  Person,
  Program,
  Relation,
  Workstream,
} from '@/domain/types';

/**
 * Bump when the shape of MockState or the seed changes incompatibly.
 * Old persisted state is discarded and the demo reseeds.
 */
export const SCHEMA_VERSION = 1;

export interface MockState {
  schemaVersion: number;
  currentPersonId: string;
  people: Person[];
  programs: Program[];
  calendars: Calendar[];
  workstreams: Workstream[];
  memberships: Membership[];
  items: Item[];
  relations: Relation[];
  channels: Channel[];
  messages: Message[];
  notifications: Notification[];
  audit: AuditEntry[];
}
