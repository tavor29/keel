import { describe, expect, it } from 'vitest';
import { can, type Actor } from './permissions';

const pm: Actor = { personId: 'p_pm', role: 'pm', workstreamIds: [] };
const lead: Actor = { personId: 'p_lead', role: 'lead', workstreamIds: ['ws_power'] };
const member: Actor = { personId: 'p_mem', role: 'member', workstreamIds: ['ws_rack'] };
const exec: Actor = { personId: 'p_exec', role: 'exec', workstreamIds: [] };
const guest: Actor = { personId: 'p_guest', role: 'guest', workstreamIds: [] };

const powerItem = { workstreamId: 'ws_power', ownerId: 'p_mem', sharedWithGuestIds: ['p_guest'] };
const rackItem = { workstreamId: 'ws_rack', ownerId: 'p_other', sharedWithGuestIds: [] };

describe('permissions', () => {
  it('denies everything without an actor (not a member)', () => {
    expect(can(undefined, 'program.view')).toBe(false);
  });

  it('keeps governance actions PM-only', () => {
    for (const a of ['program.update', 'baseline.set', 'proposal.decide', 'report.publish', 'mail.file', 'checkin.send'] as const) {
      expect(can(pm, a)).toBe(true);
      expect([lead, member, exec, guest].some((x) => can(x, a))).toBe(false);
    }
  });

  it('shows guests only items shared with them, and never budgets', () => {
    expect(can(guest, 'item.view', powerItem)).toBe(true);
    expect(can(guest, 'item.view', rackItem)).toBe(false);
    expect(can(exec, 'item.view', rackItem)).toBe(true);
    expect(can(guest, 'budget.view')).toBe(false);
    expect(can(exec, 'budget.view')).toBe(true);
  });

  it('scopes editing: PM all, lead own workstream, member own items, exec/guest none', () => {
    expect(can(pm, 'item.edit', rackItem)).toBe(true);
    expect(can(lead, 'item.edit', powerItem)).toBe(true);
    expect(can(lead, 'item.edit', rackItem)).toBe(false);
    expect(can(member, 'item.edit', powerItem)).toBe(true); // owner, even outside their workstream
    expect(can(member, 'item.edit', rackItem)).toBe(false);
    expect(can(exec, 'item.edit', powerItem)).toBe(false);
    expect(can(guest, 'item.edit', powerItem)).toBe(false);
  });

  it('scopes creation to the actor’s workstreams', () => {
    expect(can(member, 'item.create', { workstreamId: 'ws_rack' })).toBe(true);
    expect(can(member, 'item.create', { workstreamId: 'ws_power' })).toBe(false);
    expect(can(exec, 'item.create', { workstreamId: 'ws_rack' })).toBe(false);
  });

  it('lets named approvers decide change requests and approve documents', () => {
    const cr = { approverIds: ['p_exec', 'p_guest'] };
    expect(can(exec, 'changeRequest.decide', cr)).toBe(true);
    expect(can(pm, 'changeRequest.decide', cr)).toBe(false);
    expect(can(guest, 'changeRequest.decide', cr)).toBe(false); // guests never approve
    expect(can(exec, 'document.approve', cr)).toBe(true);
    expect(can(lead, 'document.edit')).toBe(true);
    expect(can(member, 'document.edit')).toBe(false);
  });
});
