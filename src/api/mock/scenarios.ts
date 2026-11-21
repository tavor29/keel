// Scripted demo scenarios (docs/demo-scenarios.md). Steps run on timers and pause on
// `waitFor` until the viewer acts (files the email, approves, switches persona…).
// The "AI" here is scripted: plan changes are fixed, but every number shown to the
// viewer comes from the real domain computations.
import { addDays, diffDays } from '@/domain/dates';
import type { ChangeRequest, CheckinRequest, CheckinRound, Item, MailMessage, Message, PlanChange, Proposal, Sprint, Task } from '@/domain/types';
import type { KeelEvent } from '../contract';
import type { EventBus } from './eventBus';
import type { MockState } from './state';

export interface ScenarioHost {
  readonly state: MockState;
  bus: EventBus<KeelEvent>;
  write<T>(fn: (s: MockState) => T, events?: (r: T) => KeelEvent[]): T;
  receiveMail(s: MockState, mail: Omit<MailMessage, 'id' | 'suggestion' | 'state'>): MailMessage;
  createProposal(s: MockState, p: Omit<Proposal, 'id' | 'impact' | 'state' | 'createdAt' | 'summary'> & { summary?: string }): Proposal;
  answerCheckin(s: MockState, programId: string, itemId: string, personId: string, answer: NonNullable<CheckinRequest['answer']>, channel: 'keel' | 'teams' | 'slack' | 'email'): { message: Message };
  createChangeRequest(
    s: MockState,
    programId: string,
    cr: Pick<ChangeRequest, 'title' | 'scopeDelta' | 'costDeltaCents' | 'changes' | 'approverIds' | 'workstreamId'> & { ownerId: string; description?: string },
  ): ChangeRequest;
  closeSprint(s: MockState, sprintId: string): { sprint: Sprint; carried: Task[] };
  sendRound(s: MockState, programId: string, scope: CheckinRound['scope'], kind: 'weekly' | 'adhoc'): CheckinRound;
  speed: number;
}

class Cancelled extends Error {}

interface Ctx {
  host: ScenarioHost;
  scenarioId: string;
  step: number;
  caption(text: string, hint?: string): void;
  delay(ms: number): Promise<void>;
  /** Resolves when an event matches (checked against current state first via `already`). */
  waitFor(hint: string, match: (e: KeelEvent, s: MockState) => boolean, already?: (s: MockState) => boolean): Promise<void>;
}

interface Scenario {
  id: string;
  programId: string;
  title: string;
  blurb: string;
  steps: number;
  run(ctx: Ctx): Promise<void>;
}

const TITAN = 'prg_titan';
const SWGR_B = 'itm_titan_swgr_b';
const SWGR_B_INST = 'itm_titan_swgr_b_inst';

const t1: Scenario = {
  id: 't1-switchgear-slip',
  programId: TITAN,
  title: 'T1 · The switchgear slip',
  blurb: 'Titan-1 · supplier email → AI proposal → approval → change request → report',
  steps: 9,
  async run(ctx) {
    const { host } = ctx;
    ctx.caption('A supplier email is about to land in Alex’s inbox…');
    await ctx.delay(1500);

    // 1. Supplier email
    const swgr = host.state.items.find((i) => i.id === SWGR_B);
    if (!swgr || swgr.type !== 'procurement' || !swgr.expectedDelivery) throw new Error('Seed is missing switchgear B');
    const was = swgr.expectedDelivery;
    const revised = addDays(was, 21);
    const fat = addDays(was, -21);
    const mail = host.write(
      (s) =>
        host.receiveMail(s, {
          ownerId: 'per_alex',
          from: 'chris.wu@voltgrid.example',
          to: ['alex.rivera@keel.example'],
          cc: ['priya.nair@keel.example'],
          subject: 'PO-4471 lineup B: FAT result and revised ship date',
          body: `Alex, lineup B failed factory acceptance testing on ${fat}: the protection relay panel did not pass. Rework is underway. Our revised ship date is ${revised} (previously ${was}). Sorry for the impact. Chris`,
          receivedAt: new Date().toISOString(),
        }),
      (m) => [{ type: 'mail.received', mail: m }],
    );
    ctx.caption('Supplier email received. Keel suggests filing it on “MV switchgear lineup B”.', 'Open Mail triage and click “File & share”.');

    // 2. Viewer files it
    await ctx.waitFor(
      'Open Mail triage and click “File & share”.',
      (e) => e.type === 'message.posted' && e.message.email?.mailMessageId === mail.id,
      (s) => s.mail.some((m) => m.id === mail.id && m.state !== 'unfiled'),
    );
    const filed = host.state.mail.find((m) => m.id === mail.id)!;
    if (filed.state === 'dismissed') {
      ctx.caption('Email dismissed. The scenario ends here. Reset the demo to try again.');
      return;
    }
    await ctx.delay(1200);

    // 3. Scripted AI proposal from the email
    const changes: PlanChange[] = [{ op: 'set_delivery', itemId: SWGR_B, expectedDelivery: revised }];
    const proposal = host.write(
      (s) =>
        host.createProposal(s, {
          programId: TITAN,
          origin: 'ai',
          rationale: `Chris Wu (VoltGrid) reports lineup B failed factory acceptance; the revised ship date is ${revised}, ${diffDays(was, revised)} days later than planned.`,
          sources: [{ kind: 'message', id: filed.filedMessageId!, quote: `Our revised ship date is ${revised} (previously ${was}).` }],
          changes,
          confidence: 0.91,
        }),
      (p) => [{ type: 'proposal.created', proposal: p }],
    );
    ctx.caption('Keel turned the email into a proposed plan change, with its impact computed by the scheduling engine.', 'Review the impact and click Approve, in the Briefing or on the email.');

    // 4. Viewer approves
    await ctx.waitFor(
      'Review the impact and click Approve, in the Briefing or on the email.',
      (e) => e.type === 'proposal.decided' && e.proposal.id === proposal.id,
      (s) => s.proposals.some((p) => p.id === proposal.id && p.state !== 'pending'),
    );
    if (host.state.proposals.find((p) => p.id === proposal.id)!.state === 'rejected') {
      ctx.caption('Proposal rejected: the plan is unchanged. The scenario ends here.');
      return;
    }
    ctx.caption('Approved. The schedule moved, the critical path shifted, and Energization (G2) changed color.');
    await ctx.delay(2500);

    // 5. Check-in answer from the Power lead (via Teams)
    const install = host.state.items.find((i) => i.id === SWGR_B_INST);
    if (!install || install.type !== 'task') throw new Error('Seed is missing switchgear B install');
    const { message } = host.write(
      (s) => host.answerCheckin(s, TITAN, SWGR_B_INST, 'per_priya', { kind: 'at_risk', newDate: addDays(revised, 14), note: 'We can recover 5 days with weekend crews and a second install team, about $120k.' }, 'teams'),
      (r) => [{ type: 'message.posted', message: r.message }, { type: 'item.changed', programId: TITAN, itemIds: [SWGR_B_INST] }],
    );
    ctx.caption('Priya answered her check-in from Teams: recover 5 days for about $120k.');
    await ctx.delay(1800);

    // 6. Scripted AI drafts a change request from the answer
    const cr = host.write(
      (s) =>
        host.createChangeRequest(s, TITAN, {
          title: 'CR-015 · Recover 5 days on switchgear B install',
          description: `Drafted by Keel from Priya Nair's check-in answer (message ${message.id}).`,
          scopeDelta: 'Weekend shifts and a second Summit Electrical install team for switchgear B.',
          costDeltaCents: 12_000_000,
          changes: [
            { op: 'set_dates', itemId: SWGR_B_INST, durationHalfDays: Math.max(2, install.durationHalfDays - 10) },
            { op: 'cost_entry', entry: { workstreamId: install.workstreamId, itemId: SWGR_B_INST, kind: 'commitment', amountCents: 12_000_000, date: s.today, vendor: 'Summit Electrical', ref: 'CR-015' } },
          ],
          approverIds: ['per_jordan'],
          workstreamId: install.workstreamId,
          ownerId: 'per_alex',
        }),
      (c) => [{ type: 'item.changed', programId: TITAN, itemIds: [c.id] }],
    );
    ctx.caption('Keel drafted CR-015 from Priya’s answer. It needs approval from Jordan Lee (exec).', 'Switch persona to Jordan Lee using the avatar menu (top right).');

    // 7–8. Exec approves
    await ctx.waitFor('Switch persona to Jordan Lee using the avatar menu (top right).', (e) => e.type === 'session.changed' && e.personId === 'per_jordan', (s) => s.currentPersonId === 'per_jordan');
    ctx.caption('You are now Jordan Lee (exec). CR-015 is waiting in the Briefing.', 'Approve CR-015 in the Briefing.');
    const decided = (s: MockState) => {
      const it = s.items.find((i) => i.id === cr.id);
      return it?.type === 'change' && (it.state === 'applied' || it.state === 'rejected');
    };
    await ctx.waitFor('Approve CR-015 in the Briefing.', (_e, s) => decided(s), decided);
    const final = host.state.items.find((i) => i.id === cr.id) as ChangeRequest;
    if (final.state === 'rejected') {
      ctx.caption('CR-015 rejected: G2 keeps its slip. The scenario ends here.');
      return;
    }
    ctx.caption('CR-015 approved: budget committed and a new baseline recorded with an audit trail.', 'Switch back to Alex Rivera, then open Status report and draft this week’s report.');

    // 9. Report refresh
    await ctx.waitFor('Switch back to Alex Rivera, then open Status report and draft this week’s report.', (e, s) => e.type === 'report.changed' && s.currentPersonId === 'per_alex');
    ctx.caption('Done: email → proposal → approval → plan, budget, baseline and report all updated, every line traceable to its source.');
  },
};

const t2: Scenario = {
  id: 't2-critical-path-checkin',
  programId: TITAN,
  title: 'T2 · Critical-path check-in',
  blurb: 'Titan-1 · ping everyone on the critical path → answers stream in from Keel, Teams and email → proposals for the at-risk items',
  steps: 4,
  async run(ctx) {
    const { host } = ctx;
    const sent = (s: MockState) => s.checkinRounds.some((r) => r.programId === TITAN && r.kind === 'adhoc' && r.scope.kind === 'critical_path');
    const before = host.state.checkinRounds.length;
    ctx.caption('Alex wants a fresh read on everything driving the end date.', 'In the Briefing’s Check-ins panel, click “Ping critical path”.');
    await ctx.waitFor('In the Briefing’s Check-ins panel, click “Ping critical path”.', (_e, s) => sent(s) && s.checkinRounds.length > before, () => false);
    const round = [...host.state.checkinRounds].reverse().find((r) => r.kind === 'adhoc' && r.scope.kind === 'critical_path')!;
    ctx.caption(`Check-in sent to ${round.requests.length} owners, each where they work (Keel, Teams, Slack or email). Answers are coming in…`);
    await ctx.delay(1200);

    const reqs = round.requests;
    const atRisk = reqs.slice(1, 3).map((r) => r.itemId);
    const blocked = reqs[3]?.itemId;
    for (const r of reqs) {
      const item = host.state.items.find((i) => i.id === r.itemId);
      if (!item) continue;
      const answer: NonNullable<CheckinRequest['answer']> = atRisk.includes(r.itemId)
        ? { kind: 'at_risk', newDate: addDays(host.state.today, 21), note: 'Crew is short this week; we need about 3 more days.' }
        : r.itemId === blocked
          ? { kind: 'blocked', reason: 'Waiting on the fire marshal to confirm the inspection slot.' }
          : { kind: 'on_track' };
      const { message } = host.write(
        (s) => host.answerCheckin(s, TITAN, r.itemId, r.personId, answer, r.channel === 'slack' ? 'slack' : r.channel === 'teams' ? 'teams' : r.channel === 'email' ? 'email' : 'keel'),
        (x) => [{ type: 'message.posted', message: x.message }, { type: 'item.changed', programId: TITAN, itemIds: [r.itemId] }],
      );
      if (answer.kind !== 'on_track') {
        host.write(
          (s) => {
            const it = s.items.find((i) => i.id === r.itemId);
            if (answer.kind === 'at_risk' && it?.type === 'task') {
              return host.createProposal(s, {
                programId: TITAN,
                origin: 'checkin',
                rationale: `Check-in answer from the owner: “${answer.note}”`,
                sources: [{ kind: 'message', id: message.id, quote: answer.note }],
                changes: [{ op: 'set_dates', itemId: it.id, durationHalfDays: it.durationHalfDays + 6 }],
              });
            }
            return host.createProposal(s, {
              programId: TITAN,
              origin: 'checkin',
              rationale: `Blocked: “${answer.kind === 'blocked' ? answer.reason : ''}” Keel suggests logging an issue so it is tracked and escalated.`,
              sources: [{ kind: 'message', id: message.id, quote: answer.kind === 'blocked' ? answer.reason : '' }],
              changes: [{ op: 'create_item', draft: { type: 'issue', title: `Blocked: ${it?.title ?? 'critical-path task'}`, workstreamId: it?.workstreamId ?? 'wst_titan_site', severity: 'high', description: answer.kind === 'blocked' ? answer.reason : '', status: 'blocked' } as Partial<Item> & { type: 'issue'; title: string; workstreamId: string } }],
            });
          },
          (p) => [{ type: 'proposal.created', proposal: p }],
        );
      }
      await ctx.delay(450);
    }
    const n = reqs.length;
    ctx.caption(`${n} answers: ${n - atRisk.length - (blocked ? 1 : 0)} on track, ${atRisk.length} at risk, ${blocked ? 1 : 0} blocked. Keel turned the exceptions into proposals.`, 'Review the new proposals in the Briefing’s “Needs you” list.');
    const decided = (s: MockState) => s.proposals.filter((p) => p.origin === 'checkin' && p.createdAt >= round.sentAt).every((p) => p.state !== 'pending');
    await ctx.waitFor('Review the new proposals in the Briefing’s “Needs you” list (approve or reject each).', (_e, s) => decided(s), decided);
    ctx.caption('Done: one ping, answers from wherever people work, and only the exceptions reached you, each with its computed impact.');
  },
};

// ── Lumen AI ─────────────────────────────
const LUMEN = 'prg_lumen';
const PLATFORM = 'wst_lumen_platform';
const INFRA = 'wst_lumen_infra';
const LAUNCH = 'itm_lumen_launch';
const EVAL_V2 = ['itm_lumen_lmp_eval_dash1', 'itm_lumen_lmp_eval_dash2', 'itm_lumen_lmp_eval_dash3'];
let msgSeq = 0;
const msgId = () => `msg_scn_${Date.now().toString(36)}_${++msgSeq}`;

function channelMessage(host: ScenarioHost, channel: string, m: Pick<Message, 'source' | 'body'> & { authorId?: string }): Message {
  return host.write(
    (s) => {
      const msg: Message = { id: msgId(), programId: LUMEN, container: { kind: 'channel', id: channel }, mentions: [], createdAt: new Date().toISOString(), visibility: 'members', ...m };
      s.messages.push(msg);
      return msg;
    },
    (msg) => [{ type: 'message.posted', message: msg }],
  );
}

const l1: Scenario = {
  id: 'l1-sprint-slip',
  programId: LUMEN,
  title: 'L1 · The sprint slip',
  blurb: 'Lumen AI · Jira sprint closes short → launch at risk → Slack message promoted to a decision → pick an option',
  steps: 6,
  async run(ctx) {
    const { host } = ctx;
    ctx.caption('Model Platform is about to close Sprint 14 in Jira…');
    await ctx.delay(1500);

    // 1. Jira: the last stories land, the sprint closes short
    const { sprint, carried } = host.write(
      (s) => {
        for (const id of ['itm_lumen_lmp_302', 'itm_lumen_lmp_305']) {
          const t = s.items.find((i) => i.id === id);
          if (t?.type === 'task') Object.assign(t, { status: 'done', percentComplete: 100 });
        }
        return host.closeSprint(s, 'spr_lmp_14');
      },
      () => [{ type: 'sprint.changed', sprintId: 'spr_lmp_14' }, { type: 'item.changed', programId: LUMEN, itemIds: [] }, { type: 'schedule.recomputed', programId: LUMEN }],
    );
    const jira = channelMessage(host, 'chn_lumen_platform', {
      source: 'jira',
      body: `Sprint 14 closed in Jira (LMP): ${sprint.completedPoints} of ${sprint.committedPoints} points done. ${carried.map((t) => t.externalRef?.key ?? t.title).join(', ')} moved back to the backlog.`,
    });
    ctx.caption(`Sprint 14 closed at ${sprint.completedPoints}/${sprint.committedPoints}. Velocity dropped, the projection moved out a sprint, and Public launch turned red.`);
    await ctx.delay(2000);

    // 2. Two options, each with computed impact
    const launch = host.state.items.find((i) => i.id === LAUNCH);
    if (!launch || launch.type !== 'milestone' || !launch.deadline) throw new Error('Seed is missing Public launch');
    const group = `l1_${Date.now().toString(36)}`;
    const sources = [{ kind: 'message' as const, id: jira.id, quote: jira.body }];
    host.write(
      (s) => [
        host.createProposal(s, {
          programId: LUMEN,
          origin: 'ai',
          optionGroup: group,
          optionLabel: 'Option A · Move Public launch 2 weeks',
          rationale: 'Keeps the launch scope intact. Partners and customers need to hear about the new date.',
          sources,
          changes: [{ op: 'set_field', itemId: LAUNCH, field: 'deadline', value: addDays(launch.deadline!, 14) }],
          confidence: 0.8,
        }),
        host.createProposal(s, {
          programId: LUMEN,
          origin: 'ai',
          optionGroup: group,
          optionLabel: 'Option B · Ship Eval dashboard v2 after launch',
          rationale: 'Removes 13 points (LMP-330 to LMP-332) from launch scope so the date holds. Nobody depends on v2 on day one.',
          sources,
          changes: EVAL_V2.map((itemId) => ({ op: 'set_status' as const, itemId, status: 'cancelled' as const })),
          confidence: 0.84,
        }),
      ],
      (ps) => ps.map((p) => ({ type: 'proposal.created' as const, proposal: p })),
    );
    ctx.caption('Keel proposed two options, each with its impact computed.');
    await ctx.delay(1800);

    // 3. The team talks in Slack; the PM promotes it to a decision
    const slack = channelMessage(host, 'chn_lumen_platform', {
      source: 'slack',
      authorId: 'per_sam',
      body: 'honestly we could ship the eval dashboard after launch, nobody needs v2 on day one',
    });
    host.write((s) => {
      s.promotionHints[slack.id] = {
        type: 'decision',
        title: 'Ship Eval dashboard v2 after launch?',
        workstreamId: PLATFORM,
        description: `Sprint 14 closed at ${sprint.completedPoints}/${sprint.committedPoints} and Public launch is at risk. Sam Okafor (Slack): “${slack.body}”`,
        options: ['Move Public launch 2 weeks', 'Ship Eval dashboard v2 after launch'],
      };
    });
    const promoted = (s: MockState) => !!s.messages.find((m) => m.id === slack.id)?.promotedItemId;
    ctx.caption('Sam suggested descoping in the bridged Slack channel.', 'Open Channels → #lumen-platform and use “Promote” on Sam’s message to record a decision.');
    await ctx.waitFor('Open Channels → #lumen-platform and use “Promote” on Sam’s message to record a decision.', (_e, s) => promoted(s), promoted);

    // 4. Choose an option
    const decided = (s: MockState) => s.proposals.some((p) => p.optionGroup === group && p.state !== 'pending');
    ctx.caption('Decision recorded with both options and a link back to the Slack message.', 'Choose an option: approve one of the two proposals in the Briefing.');
    await ctx.waitFor('Choose an option: approve one of the two proposals in the Briefing.', (_e, s) => decided(s), decided);
    const chosen = host.state.proposals.find((p) => p.optionGroup === group && (p.state === 'approved' || p.state === 'edited_approved'));
    if (!chosen) {
      ctx.caption('Both options were rejected: the launch stays at risk. The scenario ends here.');
      return;
    }
    const decisionId = host.state.messages.find((m) => m.id === slack.id)!.promotedItemId!;
    host.write(
      (s) => {
        const d = s.items.find((i) => i.id === decisionId);
        if (d?.type === 'decision') Object.assign(d, { outcome: chosen.optionLabel?.split(' · ')[1], decidedById: s.currentPersonId, decidedAt: new Date().toISOString(), status: 'done' });
        s.rev += 1;
      },
      () => [{ type: 'item.changed', programId: LUMEN, itemIds: [decisionId] }],
    );
    ctx.caption(`Done: Jira sprint close → projection → two options → Slack message promoted to a decision → “${chosen.optionLabel?.split(' · ')[1]}” applied to the plan.`);
  },
};

const l2: Scenario = {
  id: 'l2-pen-test',
  programId: LUMEN,
  title: 'L2 · Pen-test finding',
  blurb: 'Lumen AI · Teams message → issue → risk in the register + fix task on the plan',
  steps: 4,
  async run(ctx) {
    const { host } = ctx;
    ctx.caption('A message is about to land in the Security channel (bridged from Teams)…');
    await ctx.delay(1500);
    const teams = channelMessage(host, 'chn_lumen_security', {
      source: 'teams',
      authorId: 'per_ben_osei',
      body: 'Pen test found a critical auth issue in the API gateway: tokens can be replayed across tenants. We need a fix before the SOC 2 audit fieldwork.',
    });
    host.write((s) => {
      s.promotionHints[teams.id] = { type: 'issue', title: 'Critical: API gateway token replay across tenants', workstreamId: INFRA, severity: 'critical', description: teams.body };
    });
    const promoted = (s: MockState) => !!s.messages.find((m) => m.id === teams.id)?.promotedItemId;
    ctx.caption('Critical finding reported in Teams.', 'Open Channels → #security and Promote the message to an Issue.');
    await ctx.waitFor('Open Channels → #security and Promote the message to an Issue.', (_e, s) => promoted(s), promoted);
    await ctx.delay(1200);

    const p = host.write(
      (s) =>
        host.createProposal(s, {
          programId: LUMEN,
          origin: 'ai',
          rationale: 'A critical finding must be fixed and re-tested before audit fieldwork. Keel suggests a risk on the SOC 2 report and a fix task that feeds the audit.',
          sources: [{ kind: 'message', id: teams.id, quote: teams.body }],
          changes: [
            {
              op: 'create_item',
              draft: {
                id: 'itm_lumen_risk_pentest',
                type: 'risk',
                code: 'L-05',
                title: 'SOC 2 report delayed by open critical finding',
                workstreamId: INFRA,
                probability: 4,
                impact: 4,
                description: 'The API gateway token-replay finding must be fixed and re-tested before audit fieldwork, or the SOC 2 Type I report slips.',
                mitigation: 'Fix prioritized in the current sprint; re-test booked with the pen-test vendor.',
                contingency: 'Ask the auditor to carve out the gateway control and issue a bridge letter for launch.',
                status: 'in_progress',
                ownerId: 'per_ben_osei',
              } as Partial<Item> & { type: 'risk'; title: string; workstreamId: string },
            },
            {
              op: 'create_item',
              draft: { id: 'itm_lumen_fix_gateway', type: 'task', title: 'Fix API gateway token replay + re-test', workstreamId: INFRA, durationHalfDays: 12, snet: s.today, ownerId: 'per_ben_osei' } as Partial<Item> & { type: 'task'; title: string; workstreamId: string },
            },
            { op: 'add_relation', relation: { kind: 'FS', fromId: 'itm_lumen_fix_gateway', toId: 'itm_lumen_audit_fieldwork', lagHalfDays: 0 } },
          ],
          confidence: 0.88,
        }),
      (pp) => [{ type: 'proposal.created', proposal: pp }],
    );
    ctx.caption('Keel proposed a register risk and a fix task linked to the audit, with impact computed.', 'Approve the proposal in the Briefing.');
    const done = (s: MockState) => s.proposals.some((x) => x.id === p.id && x.state !== 'pending');
    await ctx.waitFor('Approve the proposal in the Briefing.', (_e, s) => done(s), done);
    ctx.caption('Done: Teams message → issue → risk L-05 in the register and a fix task on the plan, linked to the audit.');
  },
};

const ALL: Scenario[] = [t1, t2, l1, l2];

export function createScenarioRunner(host: ScenarioHost) {
  let active: { id: string; cancel: () => void } | null = null;

  const run = (scenarioId: string, speed?: number) => {
    const sc = ALL.find((x) => x.id === scenarioId);
    if (!sc) throw new Error(`Unknown scenario ${scenarioId}`);
    active?.cancel();
    let cancelled = false;
    const cleanups = new Set<() => void>();
    const cancel = () => {
      cancelled = true;
      for (const c of cleanups) c();
      cleanups.clear();
    };
    active = { id: scenarioId, cancel };
    const factor = speed ?? host.speed;
    let step = 0;
    const emit = (caption: string, extra: Partial<Extract<KeelEvent, { type: 'demo.step' }>> = {}) =>
      host.bus.emit({ type: 'demo.step', scenarioId, step, caption, ...extra });

    const ctx: Ctx = {
      host,
      scenarioId,
      get step() {
        return step;
      },
      caption(text, hint) {
        step += 1;
        emit(text, hint ? { hint } : {});
      },
      delay(ms) {
        return new Promise((resolve, reject) => {
          if (cancelled) return reject(new Cancelled());
          const t = setTimeout(() => {
            cleanups.delete(stop);
            resolve();
          }, ms * factor);
          const stop = () => {
            clearTimeout(t);
            reject(new Cancelled());
          };
          cleanups.add(stop);
        });
      },
      waitFor(hint, match, already) {
        return new Promise((resolve, reject) => {
          if (cancelled) return reject(new Cancelled());
          if (already?.(host.state)) return resolve();
          emit(hint, { hint, waiting: true });
          const off = host.bus.subscribe((e) => {
            if (e.type === 'demo.step') return;
            // Let the write finish updating state before checking.
            queueMicrotask(() => {
              if (!cancelled && match(e, host.state)) {
                off();
                cleanups.delete(stop);
                resolve();
              }
            });
          });
          const stop = () => {
            off();
            reject(new Cancelled());
          };
          cleanups.add(stop);
        });
      },
    };

    void sc
      .run(ctx)
      .then(() => {
        if (!cancelled) emit('Scenario complete.', { done: true });
      })
      .catch((err: unknown) => {
        if (err instanceof Cancelled) return;
        console.error('[keel] scenario failed', err);
        emit(`Scenario stopped: ${(err as Error).message}`, { done: true });
      })
      .finally(() => {
        if (active?.id === scenarioId) active = null;
      });
  };

  return {
    list: () => ALL.map(({ id, programId, title, blurb, steps }) => ({ id, programId, title, blurb, steps })),
    run,
    stop: () => {
      active?.cancel();
      active = null;
    },
  };
}
