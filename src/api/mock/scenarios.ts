// Scripted demo scenarios (docs/demo-scenarios.md). Steps run on timers and pause on
// `waitFor` until the viewer acts (files the email, approves, switches persona…).
// The "AI" here is scripted: plan changes are fixed, but every number shown to the
// viewer comes from the real domain computations.
import { addDays, diffDays } from '@/domain/dates';
import type { ChangeRequest, CheckinRequest, MailMessage, Message, PlanChange, Proposal } from '@/domain/types';
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

const ALL: Scenario[] = [t1];

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
    list: () => ALL.map(({ id, programId, title, steps }) => ({ id, programId, title, steps })),
    run,
    stop: () => {
      active?.cancel();
      active = null;
    },
  };
}
