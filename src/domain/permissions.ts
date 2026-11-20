import type { Item, Membership, Role } from './types';

/** Who is acting, within one program. Built from a Membership. */
export interface Actor {
  personId: string;
  role: Role;
  workstreamIds: readonly string[];
}

export const actorFrom = (m: Membership | undefined): Actor | undefined =>
  m && { personId: m.personId, role: m.role, workstreamIds: m.workstreamIds };

export type Action =
  | 'program.view'
  | 'program.update'
  | 'demo.control'
  | 'item.view'
  | 'item.create'
  | 'item.edit'
  | 'relation.edit'
  | 'baseline.set'
  | 'proposal.decide'
  | 'changeRequest.decide'
  | 'report.publish'
  | 'budget.view'
  | 'mail.file'
  | 'checkin.send'
  | 'document.edit'
  | 'document.approve';

/** What an action is checked against, when it matters. */
export type Resource =
  | Pick<Item, 'workstreamId' | 'ownerId' | 'sharedWithGuestIds'>
  | { workstreamId: string } // creating an item in a workstream
  | { approverIds: readonly string[] }; // change requests, documents

const PM_ONLY: ReadonlySet<Action> = new Set([
  'program.update',
  'baseline.set',
  'proposal.decide',
  'report.publish',
  'mail.file',
  'checkin.send',
]);

/**
 * The single permission rule set (docs/data-model.md → Permissions).
 * UI hides what the API would reject; the API enforces.
 */
export function can(actor: Actor | undefined, action: Action, resource?: Resource): boolean {
  if (!actor) return false;
  const { role } = actor;

  if (action === 'program.view' || action === 'demo.control') return true;
  if (PM_ONLY.has(action)) return role === 'pm';

  switch (action) {
    case 'budget.view':
      return role !== 'guest';

    case 'item.view': {
      if (role !== 'guest') return true;
      return !!resource && 'sharedWithGuestIds' in resource && resource.sharedWithGuestIds.includes(actor.personId);
    }

    case 'item.create':
      if (role === 'pm') return true;
      if (role === 'lead' || role === 'member') return !!resource && 'workstreamId' in resource && actor.workstreamIds.includes(resource.workstreamId);
      return false;

    case 'item.edit': {
      if (role === 'pm') return true;
      if (!resource || !('workstreamId' in resource)) return false;
      if (role === 'lead') return actor.workstreamIds.includes(resource.workstreamId);
      if (role === 'member') return 'ownerId' in resource && resource.ownerId === actor.personId;
      return false;
    }

    case 'relation.edit':
    case 'document.edit':
      return role === 'pm' || role === 'lead';

    case 'changeRequest.decide':
    case 'document.approve':
      return role !== 'guest' && !!resource && 'approverIds' in resource && resource.approverIds.includes(actor.personId);
  }
  return false;
}
