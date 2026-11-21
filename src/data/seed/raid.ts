// Assumptions, issues and decisions for the demo programs (fictional). Risks live in titan/risks.ts.
import type { Assumption, Decision, Issue } from '@/domain/types';

type Base = { programId: string; createdAt: string; updatedAt: string };
const common = (b: Base) => ({ ...b, sharedWithGuestIds: [] as string[], followerIds: [] as string[] });

export function titanRaid(b: Base, ws: Readonly<Record<'site' | 'power' | 'cooling' | 'network' | 'compute' | 'rack' | 'security', string>>, leadOf: (ws: string) => string) {
  let n = 0;
  const a = (k: string, w: string, title: string, description: string, validateBy: string, validated: boolean | undefined): Assumption => ({
    ...common(b), id: `itm_titan_${k}`, workstreamId: w, order: 920 + ++n, type: 'assumption', title, description, validateBy, ...(validated !== undefined ? { validated } : {}),
    status: validated === undefined ? 'in_progress' : 'done', ownerId: leadOf(w),
  });
  const i = (k: string, w: string, title: string, description: string, severity: Issue['severity'], status: Issue['status'], resolution?: string): Issue => ({
    ...common(b), id: `itm_titan_${k}`, workstreamId: w, order: 940 + ++n, type: 'issue', title, description, severity, status, ...(resolution ? { resolution } : {}), ownerId: leadOf(w),
  });
  const d = (k: string, w: string, title: string, context: string, options: string[], outcome: string | undefined, decidedAt?: string): Decision => ({
    ...common(b), id: `itm_titan_${k}`, workstreamId: w, order: 960 + ++n, type: 'decision', title, context, options,
    ...(outcome ? { outcome, decidedById: 'per_alex', decidedAt } : {}), status: outcome ? 'done' : 'in_progress', ownerId: 'per_alex',
  });
  return [
    a('asm_utility_capacity', ws.power, 'Utility can supply 48 MW by energization', 'The interconnect study assumes the substation upgrade on the utility side completes on their published schedule.', '2026-12-15', undefined),
    a('asm_soil', ws.site, 'Soil bearing capacity supports standard footings', 'Geotechnical report recommends spread footings; piling only under the yard equipment.', '2026-06-30', true),
    a('asm_liquid_share', ws.cooling, '80% of heat is removed by liquid cooling', 'Rack design assumes direct-to-chip liquid cooling for GPUs; air handles the remaining 20%.', '2027-01-20', undefined),
    a('asm_gpu_power', ws.compute, 'GPU nodes draw ≤ 11 kW each at full load', 'Busway and PDU sizing assumes the vendor’s rated draw; burn-in will confirm.', '2027-04-30', undefined),
    i('iss_rebar', ws.site, 'Rebar inspection failed on grid line C', 'Inspector rejected cover depth on two footings; rework needed before the pour.', 'medium', 'done', 'Reworked and re-inspected within 3 days; no schedule impact.'),
    i('iss_chiller_drawings', ws.cooling, 'Chiller submittal drawings rejected', 'Engineer of record rejected the chiller pad anchoring detail. Revised submittal due this week.', 'high', 'in_progress'),
    i('iss_fiber_crew', ws.network, 'Fiber crew short-staffed in Hall B', 'Lumen Cabling Co. is two technicians short; Hall B trunks running 2 days late.', 'medium', 'in_progress'),
    i('iss_badge_vendor', ws.security, 'Access-control vendor changed hardware model', 'The specified reader model is end-of-life; the replacement needs a firmware review.', 'low', 'in_progress'),
    d('dec_liquid', ws.cooling, 'Direct-to-chip liquid cooling for GPU racks', 'Air cooling cannot remove 100 kW+ per rack.', ['Rear-door heat exchangers', 'Direct-to-chip liquid cooling', 'Immersion cooling'], 'Direct-to-chip liquid cooling', '2026-05-20T10:00:00Z'),
    d('dec_six_day', ws.site, 'Six-day construction week', 'The original five-day plan missed G2 by three weeks.', ['Five-day week with overtime', 'Six-day week'], 'Six-day week', '2026-04-08T10:00:00Z'),
    d('dec_second_crane', ws.site, 'Second crane for steel erection (CR-014)', 'Steel erection was 6 days behind plan.', ['Accept the slip', 'Add a second crane'], 'Add a second crane', '2026-11-12T15:00:00Z'),
    d('dec_hall_order', ws.rack, 'Rack & stack order: halls A → D', 'GPU batches arrive monthly; should halls fill in parallel or in sequence?', ['In sequence A → D', 'In parallel across halls'], undefined),
  ];
}

export function lumenRaid(b: Base) {
  return [
    {
      ...common(b), id: 'itm_lumen_asm_traffic', workstreamId: 'wst_lumen_platform', order: 950, type: 'assumption' as const,
      title: 'Launch traffic ≤ 3× private-beta peak', description: 'Capacity plan and load tests assume launch week stays within 3× the beta peak.', validateBy: '2026-12-11', status: 'in_progress' as const, ownerId: 'per_noor_haddad',
    },
    {
      ...common(b), id: 'itm_lumen_iss_loadtest', workstreamId: 'wst_lumen_platform', order: 951, type: 'issue' as const,
      title: 'Load-test environment is unstable', description: 'Flaky load-test runs make autoscaling results unreliable.', severity: 'medium' as const, status: 'in_progress' as const, ownerId: 'per_tom_becker',
    },
    {
      ...common(b), id: 'itm_lumen_dec_pricing_model', workstreamId: 'wst_lumen_gtm', order: 952, type: 'decision' as const,
      title: 'Usage-based pricing with a free tier', context: 'Seat-based pricing tested poorly with developers in the beta.', options: ['Seat-based', 'Usage-based with free tier'],
      outcome: 'Usage-based with free tier', decidedById: 'per_alex', decidedAt: '2026-10-28T10:00:00Z', status: 'done' as const, ownerId: 'per_alex',
    },
  ];
}
