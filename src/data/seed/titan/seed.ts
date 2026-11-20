// Runtime seed for Titan-1: the plan comes from titan-1.xml through the real MSPDI
// importer; everything else (baseline, costs, conversation, mail, proposals) is layered on.
// All dates here are in "generator time" (today = TITAN_AS_OF); the caller shifts them.
import { snapshotBaseline } from '@/domain/baseline';
import { computeEvm } from '@/domain/evm';
import { computeImpact } from '@/domain/impact';
import { importMspdi } from '@/domain/io/mspdi';
import { suggestFiling } from '@/domain/mailFiling';
import { summarizeProposal } from '@/domain/narrative';
import { isTask, type PlanState } from '@/domain/plan';
import { schedule } from '@/domain/scheduling/schedule';
import type {
  Baseline,
  ChangeRequest,
  CheckinRound,
  CostEntry,
  DigestEntry,
  Item,
  MailMessage,
  Membership,
  Message,
  Person,
  Proposal,
  Relation,
  Sprint,
  Workstream,
} from '@/domain/types';
import { titanTeam, TITAN_WS } from './people';
import { titanRisks } from './risks';
import { titanSoftwareSprints } from './software';
import { TITAN_AS_OF, TITAN_PROGRAM_ID, titanCalendar, titanProgram } from './plan';
import titanXml from './titan-1.xml?raw';

const P = TITAN_PROGRAM_ID;
const T = (date: string, time = '09:00') => `${date}T${time}:00Z`;
const id = (k: string) => `itm_titan_${k}`;

export interface TitanSeed {
  people: Person[];
  memberships: Membership[];
  workstreams: Workstream[];
  items: Item[];
  relations: Relation[];
  baseline: Baseline;
  costEntries: CostEntry[];
  messages: Message[];
  mail: MailMessage[];
  proposals: Proposal[];
  checkinRounds: CheckinRound[];
  digest: DigestEntry[];
  sprints: Sprint[];
}

const base = { programId: P, sharedWithGuestIds: [] as string[], followerIds: [] as string[], createdAt: T('2026-07-10'), updatedAt: T('2026-11-10') };

export function titanSeed(): TitanSeed {
  const team = titanTeam(P);
  const imp = importMspdi(titanXml, { programId: P, now: T('2026-03-02') });
  const items: Item[] = imp.items;

  // ── Risks (RAID) and past change requests ─────────────────────────────
  items.push(...titanRisks(team, base));
  const cr = (k: string, title: string, cost: number, at: string, scope: string): ChangeRequest => ({
    ...base,
    id: id(k),
    workstreamId: TITAN_WS.site,
    order: 950,
    type: 'change',
    title,
    status: 'done',
    scopeDelta: scope,
    costDeltaCents: cost,
    changes: [],
    approverIds: ['per_jordan'],
    approvals: [{ personId: 'per_jordan', decision: 'approve', at }],
    state: 'applied',
    ownerId: 'per_alex',
  });
  items.push(
    cr('cr_012', 'CR-012 · Add stormwater detention capacity', 21_000_000, T('2026-08-03'), 'Larger detention pond required by the county.'),
    cr('cr_013', 'CR-013 · Upgrade hall fire suppression to clean agent', 46_000_000, T('2026-09-21'), 'Insurer requirement.'),
    cr('cr_014', 'CR-014 · Second crane for steel erection', 8_500_000, T('2026-11-12'), 'Recover 6 days on steel erection.'),
  );

  const sprints = titanSoftwareSprints(items);
  const plan: PlanState = { program: titanProgram, calendar: titanCalendar, workstreams: imp.workstreams, items, relations: imp.relations, sprints, costEntries: [], asOf: TITAN_AS_OF };

  // ── Contract baseline (G0): switchgear B was due mid-February; cooling & network were planned 10% faster ──
  const variant = structuredClone(plan);
  for (const it of variant.items) {
    if (it.id === id('swgr_b') && it.type === 'procurement') it.expectedDelivery = '2027-02-17';
    if (isTask(it) && (it.workstreamId === TITAN_WS.cooling || it.workstreamId === TITAN_WS.network)) it.durationHalfDays = Math.max(1, Math.floor(it.durationHalfDays * 0.9));
  }
  const baseline = snapshotBaseline(variant.items, schedule(variant), {
    id: 'bsl_titan_contract',
    programId: P,
    name: 'Contract baseline (G0)',
    createdAt: T('2026-07-10', '16:00'),
    createdById: 'per_alex',
    reason: 'Approved at G0 design freeze',
  });
  plan.baseline = baseline;

  // ── Costs: commitments for every PO placed; monthly actuals at a per-workstream CPI ──
  const result = schedule(plan);
  const evm = computeEvm(plan, result, TITAN_AS_OF);
  const cpi: Record<string, number> = { [TITAN_WS.cooling]: 0.93, [TITAN_WS.network]: 0.95, [TITAN_WS.site]: 0.97, [TITAN_WS.power]: 0.98 };
  const costEntries: CostEntry[] = [];
  let c = 0;
  for (const it of items) {
    if (it.type === 'procurement' && it.orderedOn && it.orderedOn <= TITAN_AS_OF) {
      costEntries.push({ id: `cst_titan_${++c}`, programId: P, workstreamId: it.workstreamId, itemId: it.id, kind: 'commitment', amountCents: it.poValueCents, date: it.orderedOn, ref: it.poNumber, vendor: it.supplier });
    }
  }
  const months = ['2026-03-31', '2026-04-30', '2026-05-29', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-30', '2026-11-13'];
  for (const ws of imp.workstreams) {
    const ev = evm.byWorkstream[ws.id]?.evCents ?? 0;
    if (!ev) continue;
    const ac = Math.round(ev / (cpi[ws.id] ?? 0.99));
    const weights = months.map((_, i) => i + 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let left = ac;
    months.forEach((m, i) => {
      const amt = i === months.length - 1 ? left : Math.round((ac * weights[i]!) / total);
      left -= amt;
      costEntries.push({ id: `cst_titan_${++c}`, programId: P, workstreamId: ws.id, kind: 'actual', amountCents: amt, date: m, ref: `Invoices ${m.slice(0, 7)}` });
    });
  }

  // ── Conversation already on the plan ─────────────────────────────
  const msg = (k: string, itemKey: string, m: Partial<Message> & Pick<Message, 'body' | 'createdAt' | 'source'>): Message => ({
    id: `msg_titan_${k}`,
    programId: P,
    container: { kind: 'item', id: id(itemKey) },
    mentions: [],
    visibility: 'members',
    ...m,
  });
  const messages: Message[] = [
    msg('fat_plan', 'swgr_b', {
      source: 'email',
      authorId: 'per_chris',
      createdAt: T('2026-10-20', '15:12'),
      body: 'Hi Alex, lineup B is on the line. Factory acceptance test is booked for 2027-02-10, and we are holding the 2027-03-03 ship date. I will confirm right after FAT.',
      email: { from: 'chris.wu@voltgrid.example', to: ['alex.rivera@keel.example'], cc: ['priya.nair@keel.example'], subject: 'PO-4471 lineup B: FAT date', mailMessageId: 'mail_seed_fat' },
    }),
    msg('crew', 'swgr_b_inst', { source: 'teams', authorId: 'per_priya', createdAt: T('2026-11-03', '10:40'), body: 'Summit Electrical crew is booked for a 2027-03-04 start on switchgear B. They need 48 h notice if that moves.' }),
    msg('g2_witness', 'g2', { source: 'keel', authorId: 'per_alex', createdAt: T('2026-11-09', '08:15'), body: 'Utility witness test is penciled in for the week of 2027-03-29. Their scheduler needs 3 weeks notice for changes.' }),
    msg('chiller_ship', 'chillers', { source: 'system', createdAt: T('2026-11-12', '07:00'), body: 'Northwind Thermal marked PO-5120 as shipped. ETA 2026-12-26.' }),
  ];

  // ── Mailbox (unfiled) ─────────────────────────────
  const mails: Omit<MailMessage, 'suggestion'>[] = [
    {
      id: 'mail_titan_1',
      ownerId: 'per_alex',
      from: 'logistics@northwind.example',
      to: ['alex.rivera@keel.example'],
      cc: [],
      subject: 'PO-5120 Chillers (4×): shipping notice',
      body: 'All four chillers left our plant this morning. Carrier ETA to site is 2026-12-26. Rigging plan attached.',
      receivedAt: T('2026-11-13', '16:20'),
      state: 'unfiled',
    },
    {
      id: 'mail_titan_2',
      ownerId: 'per_alex',
      from: 'programs@apexcompute.example',
      to: ['alex.rivera@keel.example'],
      cc: [],
      subject: 'PO-7020 GPU node batch 2: production update',
      body: 'Batch 2 boards passed burn-in at the factory. We remain on track for the 2027-02-04 delivery window.',
      receivedAt: T('2026-11-14', '11:05'),
      state: 'unfiled',
    },
    {
      id: 'mail_titan_3',
      ownerId: 'per_alex',
      from: 'facilities-news@keel.example',
      to: ['all-staff@keel.example'],
      cc: [],
      subject: 'Facilities newsletter: November',
      body: 'Holiday parking, new badge readers in HQ, and the winter safety reminder.',
      receivedAt: T('2026-11-15', '08:00'),
      state: 'unfiled',
    },
  ];
  const mail: MailMessage[] = mails.map((m) => {
    const s = suggestFiling(m, items, team.people);
    return s ? { ...m, suggestion: s } : m;
  });

  // ── A pending proposal from last week's check-in ─────────────────────────────
  const trunks = items.find((i) => i.id === id('trunks_b'));
  const proposals: Proposal[] = [];
  if (trunks && trunks.type === 'task') {
    const changes = [{ op: 'set_dates' as const, itemId: trunks.id, durationHalfDays: trunks.durationHalfDays + 4 }];
    const impact = computeImpact(plan, changes, result);
    proposals.push({
      id: 'prp_titan_trunks',
      programId: P,
      origin: 'checkin',
      summary: summarizeProposal(changes, impact, new Map(items.map((i) => [i.id, i]))),
      rationale: 'Check-in answer: "At risk: fiber crew is two people short this week; needs 2 more days."',
      sources: [{ kind: 'checkin', id: 'chk_titan_w46', quote: 'Fiber crew is two people short this week; needs 2 more days.' }],
      changes,
      impact,
      state: 'pending',
      createdAt: T('2026-11-13', '17:30'),
    });
  }

  // ── Last week's check-in round ─────────────────────────────
  const owners = (keys: string[]) => keys.map((k) => items.find((i) => i.id === id(k))).filter((i): i is Item => !!i && !!i.ownerId);
  const roundItems = owners(['walls', 'roofing', 'louvers', 'chiller_pads', 'plant_design', 'net_design', 'carriers', 'sub_civil', 'gen_pads', 'trunks_b', 'soc2_ready', 'noc_hire']);
  const checkinRounds: CheckinRound[] = [
    {
      id: 'chk_titan_w46',
      programId: P,
      kind: 'weekly',
      scope: { kind: 'active_window' },
      sentAt: T('2026-11-09', '08:00'),
      requests: roundItems.map((it, i) => ({
        itemId: it.id,
        personId: it.ownerId!,
        channel: team.people.find((p) => p.id === it.ownerId)?.home ?? 'keel',
        ...(i < roundItems.length - 2
          ? {
              answer: it.id === id('trunks_b') ? { kind: 'at_risk' as const, newDate: '2027-02-08', note: 'Fiber crew is two people short this week; needs 2 more days.' } : { kind: 'on_track' as const },
              answeredAt: T('2026-11-10', '12:00'),
            }
          : {}),
      })),
    },
  ];

  const digest: DigestEntry[] = [
    { id: 'dig_titan_1', programId: P, at: T('2026-11-12', '07:00'), group: 'schedule', text: 'Chillers (4×) shipped; delivery 2026-12-26 holds', itemIds: [id('chillers')], sourceIds: ['msg_titan_chiller_ship'] },
    { id: 'dig_titan_2', programId: P, at: T('2026-11-12', '15:00'), group: 'budget', text: 'CR-014 approved: second crane for steel erection (+$85k)', itemIds: [id('cr_014')], sourceIds: [] },
    { id: 'dig_titan_3', programId: P, at: T('2026-11-13', '17:30'), group: 'risk', text: 'Hall B fiber trunks reported at risk in check-in', itemIds: [id('trunks_b')], sourceIds: ['chk_titan_w46'] },
  ];

  return {
    people: team.people,
    memberships: team.memberships,
    workstreams: imp.workstreams,
    items,
    relations: imp.relations,
    baseline,
    costEntries,
    messages,
    mail,
    proposals,
    checkinRounds,
    digest,
    sprints,
  };
}
