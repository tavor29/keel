import type { Role } from './types';

/**
 * Actions grow as features land (phase 1 fills in item-level rules: own items,
 * workstream scope, guest sharing). Keep every rule here so UI and API agree.
 */
export type Action = 'program.view' | 'program.update' | 'demo.control';

const rules: Record<Action, readonly Role[]> = {
  'program.view': ['pm', 'lead', 'member', 'guest', 'exec'],
  'program.update': ['pm'],
  'demo.control': ['pm', 'lead', 'member', 'guest', 'exec'],
};

export function can(role: Role | undefined, action: Action): boolean {
  return role !== undefined && rules[action].includes(role);
}
