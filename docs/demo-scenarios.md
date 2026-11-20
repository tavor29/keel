# Demo programs and scenarios

All people, companies and products below are **fictional**. Seed data lives in `src/data/seed/`. The Titan-1 plan is stored as an **MS Project XML (MSPDI)** file and loaded through the real importer, which proves the import path works.

## Personas (shared across both programs)

| Persona | Role (Titan-1) | Role (Lumen AI) |
|---|---|---|
| **Alex Rivera** | Program manager | Program manager |
| **Priya Nair** | Workstream lead, Power | Workstream lead, Infra & Security |
| **Sam Okafor** | Member, Rack & Stack | Member, Model Platform |
| **Jordan Lee** | Exec viewer (VP Infrastructure) | Exec viewer (CPO) |
| **Chris Wu** (VoltGrid Switchgear) | External guest (supplier) | — |

The persona switcher defaults to Alex Rivera (PM).

---

## Program A — Titan-1: HPC data center build

Waterfall, cost-loaded, critical path, stage gates. **Calendar:** Mon–Sat. **Budget:** $250M. **About 530 items (≈490 tasks, 16 procurement items, 6 gates), 660 dependencies, 10 workstreams, 83 people** (including contractor crews and a supplier guest). Defined in `src/data/seed/titan/plan.ts`, generated into `titan-1.xml` by `npm run seed:titan`.

**Dates.** The generator's "today" is 2026-11-16. When the demo loads, it shifts every date by whole weeks so that "today" lands in the visitor's current week (weekdays and float are unchanged).

| Workstream | Mode | Budget | Highlights |
|---|---|---|---|
| Site & Civil | scheduled | $12M | permits, foundations, building shell |
| Power | scheduled | $35M | utility interconnect, substation, **MV switchgear** (long-lead), UPS, busway |
| Cooling | scheduled | $25M | chillers (long-lead), CDUs, liquid-cooling loops |
| Network | scheduled | $15M | high-speed fabric, spine/leaf, optics (long-lead) |
| Compute Procurement | scheduled | $150M | GPU node batches 1–4 (long-lead), storage arrays |
| Rack & Stack | scheduled | $4M | rack install, cabling, burn-in per hall |
| Software Stack | **agile** | $3M | OS images, scheduler, storage software, observability (shows hybrid) |
| Commissioning | scheduled | $3M | L1–L5 commissioning, integrated systems test |
| Security & Compliance | scheduled | $1.5M | physical security, access control, audits |
| Ops Readiness | scheduled | $1.5M | runbooks, NOC staffing, support contracts |

**Stage gates:** G0 Design freeze → G1 Shell complete → **G2 Energization** (contractual deadline) → G3 Mechanical completion → G4 Integrated systems test (L5) → G5 Acceptance and go-live.

**Seeded state at "today":** about 40% through. CPI 0.97 (Cooling 0.93 and Network 0.95 show amber on the cost tiles), SPI ≈ 1.0. Contract baseline set at G0 (switchgear B was due mid-February; Cooling and Network were planned 10% faster, so they show variance). 5 open risks, 3 approved change requests (CR-012 to CR-014), a pending proposal from last week's check-in, and three unfiled emails.

### Scenario T1: "The switchgear slip" (hero, about 2 min)

| # | Event | What the viewer sees |
|---|---|---|
| 1 | Email from Chris Wu (VoltGrid) arrives in Alex's synced mailbox: *"MV switchgear lineup B failed factory acceptance test; revised ship date Mar 24 (was Mar 3)."* | Mail triage badge. Suggestion: **file to "MV switchgear lineup B" (PRC), 93% confidence**, because the PO number and supplier domain match |
| 2 | Alex clicks **File & share** | The email appears in the procurement item's stream, visible to the Power workstream |
| 3 | AI proposal created: *set_delivery +21 calendar days* (18 working days on the 6-day week) | Inline chip on the email plus a Briefing card. Impact: "G2 · Energization **+18 working days**, green → **red**" (slack 14 days → **4 days late**). The critical path changes |
| 4 | Alex approves | Timeline animates: bars shift, the critical path is re-highlighted, G2 turns **red**. A system message is posted on the thread: "Applied: …" |
| 5 | Check-in reply from Priya (via Teams): *"At risk. We can recover 5 days with weekend crews and a second install team, about $120k."* | The check-in answer lands on the install task |
| 6 | AI drafts **change request CR-015**: cost +$120k, install duration −5 days | CR card with impact preview: G2 **red → amber**, 1 day of slack. Needs exec approval |
| 7 | Persona switch to Jordan Lee (exec) → **Approve** | CR applied, budget updated, **rebaseline** "CR-015" recorded with audit trail |
| 8 | Back to Alex → **Status report → Refresh draft** | New lines: "Switchgear B FAT failure (VoltGrid) delayed delivery 3 weeks; recovered 5 days via CR-015 (+$120k); G2 Energization amber, 1 day float." Each line links to the email, the proposal and the CR |

9. **Documents tie-in:** the Briefing now shows *"Charter v3 is out of date: G2 Energization moved past its approved date. Start re-approval?"* Opening the charter highlights the drifted Milestones section against v3.

Guest view, optional: switch to Chris Wu. They see **only** the switchgear procurement item and its thread, with no budget figures.

### Scenario T2: "Critical-path check-in"

1. Alex runs an **ad hoc check-in: owners of everything on the critical path** (14 people, delivered via Keel, Teams or email per person).
2. Over about 20 seconds the answers stream in: 11 on track, 2 at risk (chiller start-up, optics delivery), 1 blocked (fire-marshal inspection not scheduled).
3. Three proposals appear. The blocked answer also suggests **Promote → Issue**, with the AHJ inspection as a dependency.
4. The Briefing "Needs you" list updates live.

### Scenario T3: "Import from MS Project" (settings demo)

Settings → Import → choose the bundled `titan-1-original.xml` → preview (612 tasks, 840 dependencies, 3 warnings: unsupported FF links converted to FS) → import into a sandbox program.

---

## Program B — Lumen AI: AI SaaS platform public launch

Agile workstreams on a milestone backbone. **Calendar:** Mon–Fri. **About 150 items, 5 workstreams, 25 people.** Two-week sprints, Jira-mirrored.

| Workstream | Mode | Highlights |
|---|---|---|
| Model Platform | agile (Jira: LMP) | inference service, fine-tuning pipeline, eval harness |
| Product & Web App | agile (Jira: LWA) | onboarding, workspace UI, billing |
| Data & Evaluation | agile | eval datasets, red-team suite, quality dashboard |
| Infra & Security | scheduled | SOC 2 Type I, pen test, multi-region rollout |
| Go-to-Market | scheduled | pricing, docs, launch event, partner announcements |

**Milestones:** Private beta → SOC 2 Type I report → **Public launch** (deadline).

### Scenario L1: "The sprint slip"

| # | Event | What the viewer sees |
|---|---|---|
| 1 | Jira event: Model Platform **Sprint 14 closes at 31/40 points** | Event appears in the workstream stream and the sprint board. Velocity chart updates |
| 2 | Projection recomputes: Model Platform finish **+1 sprint** | The delivery node moves, **Public launch turns amber** (float 3 days) |
| 3 | AI proposal with two options: (a) move Public launch +2 weeks, (b) descope "Eval dashboard v2" to post-launch | Impact shown for each option |
| 4 | In the bridged Slack channel `#lumen-platform`, Sam says *"honestly we could ship the eval dashboard after launch"* → Alex clicks **Promote → Decision** | AI pre-fills the Decision with the context, both options and links |
| 5 | Alex records outcome (b) and approves the descoping proposal | Launch is back to green. The decision shows in the RAID log, and the report draft gets a line citing the Slack message |

### Scenario L2: "Pen-test finding"

A bridged Teams message in `#security`: *"Pen test found a critical auth issue in the API gateway."* The AI suggests **Promote → Issue** (critical) and a **Risk** on the SOC 2 milestone (P4 × I4), with a mitigating task on Infra & Security. The heat map updates.

---

## Guided tour (about 60 s, T1-based)

1. Briefing: "This is where a PM starts the day: things that need you, what changed, program health."
2. Timeline: "A real critical-path schedule: 600 tasks, baselines, stage gates."
3. Mail triage: "Supplier email gets filed onto the plan item it's about."
4. The proposal card: "Keel proposes the plan change and shows its impact. You approve."
5. Status report: "The weekly report writes itself. Every line links to its source."

## Scenario script format

```ts
export interface ScenarioStep {
  atMs: number;                       // offset from scenario start (scaled by speed)
  caption: string;                    // shown in the demo panel and as a toast
  action:
    | { kind: 'mail.receive'; mail: Omit<MailMessage, 'id'> }
    | { kind: 'message.post'; container: Message['container']; message: Partial<Message> }
    | { kind: 'checkin.answer'; roundRef: string; itemId: string; answer: CheckinRequest['answer'] }
    | { kind: 'connector.event'; system: 'jira' | 'github'; payload: Record<string, unknown> }
    | { kind: 'ai.proposal'; scriptRef: string }         // scripted provider output
    | { kind: 'wait_for'; what: 'approval' | 'file' | 'persona'; ref?: string; hint: string };  // pauses until the viewer acts
}
```

`wait_for` steps make scenarios interactive. The panel shows the hint ("Approve the proposal to continue") and resumes when the viewer acts.
