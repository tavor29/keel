import { describe, expect, it } from 'vitest';
import { createSeedState, shiftDates, weeksToShift } from './index';

describe('demo seed', () => {
  it('shifts ISO dates everywhere, including inside text and timestamps', () => {
    const v = shiftDates({ d: '2027-03-03', t: '2027-03-03T10:00:00Z', s: 'ship 2027-03-03, FAT 2027-02-10', n: 3, id: 'PO-4471' }, 7);
    expect(v).toEqual({ d: '2027-03-10', t: '2027-03-10T10:00:00Z', s: 'ship 2027-03-10, FAT 2027-02-17', n: 3, id: 'PO-4471' });
  });

  it('counts whole weeks to the current Monday', () => {
    expect(weeksToShift(new Date('2026-11-18T12:00:00Z'))).toBe(0);
    expect(weeksToShift(new Date('2026-11-23T01:00:00Z'))).toBe(1);
  });

  it('keeps text consistent with the shifted plan', () => {
    const s = createSeedState(new Date('2027-06-02T12:00:00Z'));
    const swgr = s.items.find((i) => i.id === 'itm_titan_swgr_b');
    const msg = s.messages.find((m) => m.id === 'msg_titan_fat_plan');
    expect(swgr?.type === 'procurement' && swgr.expectedDelivery).toBeTruthy();
    expect(msg!.body).toContain(swgr!.type === 'procurement' ? swgr!.expectedDelivery! : 'x');
    expect(s.today).toBe('2027-05-31');
  });
});
