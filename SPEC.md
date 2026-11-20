# Keel — Product Specification (v1)

> Status: **Agreed** (design session, 2026-11-19). This is the source of truth for the v1 prototype.
> Details live in [`docs/`](docs/) — see the [index](#13-document-index) at the end.

---

## 1. What Keel is

Keel is a web app for **program managers coordinating multi-team, high-tech programs** — hardware + software, suppliers, budgets in the hundreds of millions. It competes with three tools PMs juggle today:

| Today | Its gap for a high-tech program manager | Keel |
|---|---|---|
| **MS Project** | Strong scheduling, zero collaboration | Same scheduling core (critical path, baselines), built for a team |
| **Monday.com** | Flexible boards, shallow dependencies and scheduling | Boards *and* a real CPM engine |
| **Slack / email** | Conversation is disconnected from the plan | Conversation **is** the plan |

### The wedge

**Conversation and plan are the same object.** Every plan item has a thread; email, chat and engineering-tool events land on the item they're about; and AI turns what people say into **proposed plan changes** — with their schedule/cost impact — that the PM approves in one click.

Result: status flows *from* the work. The PM stops chasing updates and rewriting status reports.

### Purpose of v1

1. **Portfolio piece** — a public, polished, demo-able product with a case study.
2. **Internal tool** — the same front-end code becomes the real tool for the author's team once a backend is added (see [docs/backend.md](docs/backend.md)).

v1 is a **clickable prototype built as the real front end**: production-quality UI code on a typed **mock API** (in-memory + localStorage). Nothing is thrown away when the backend arrives.

---

## 2. Goals and non-goals

### Goals (v1)
- Tell the full wedge story in a ~2-minute demo, on two contrasting programs (agile AI SaaS, waterfall HPC data-center build).
- A scheduling engine a professional PM respects: FS/SS + lag, critical path, baseline variance.
- Hold up at real scale: 600+ task plan, 80+ people, virtualized grid and Gantt.
- Every AI output is traceable to its source and nothing changes the plan without approval.
- Zero-ops public demo on Vercel; works offline of any AI key.

### Non-goals (v1)
- A real backend, real auth, real connectors (all mocked behind real interfaces).
- Resource leveling, per-person calendars, FF/SF dependencies, multi-currency.
- Cross-program dependencies and portfolio rollups.
- Full Scrum/SAFe (PI planning, ceremonies, retros).
- Native mobile apps (phones get a responsive read-only view).
- Replacing Jira/GitHub for engineers.

---

## 3. Users and roles

**Primary user:** a program manager coordinating several engineering teams (HW, FW, SW, QA, supply chain, contractors) with cross-team dependencies, milestones and a large budget.

| Role | Can |
|---|---|
| **Program manager (PM)** | Everything in the program: plan, baseline, approve proposals, approve change requests, generate reports, manage members |
| **Workstream lead** | Edit items in their workstream, answer/forward check-ins, propose changes outside their workstream |
| **Member** | Edit items they own, post in threads/channels, answer check-ins |
| **External guest** | Sees **only** items explicitly shared with them (e.g., a supplier on a procurement item); replies in those threads (typically via email) |
| **Exec viewer** | Read-only: Briefing summary, status reports, dashboards, RAID |

Roles are fixed (no custom roles in v1). Role checks live in one `can(user, action, resource)` function in the domain layer.

---

## 4. Structure and item types

```
Workspace
└── Program            (methodology backbone: milestones + stage gates; one working calendar)
    └── Workstream     (one per team; mode = "scheduled" | "agile")
        └── Item       (task, milestone, stage gate, risk, issue, decision,
                        assumption, change request, procurement item)
```

- A **program** always has a milestone backbone. Each **workstream** runs either a **scheduled plan** (Gantt, CPM) or **sprints** (backlog, board, burndown). Sprint-run work rolls up to program milestones.
- Items can have parent items (WBS outline) inside a workstream. WBS numbers are computed (1, 1.2, 1.2.3).
- **Relations** between items: `FS` / `SS` dependency with lag (working days), plus non-scheduling links (`relates`, `blocks`, `mitigates` for risk→task, `caused-by`, `promoted-from`).

### Item types

| Type | Purpose | Type-specific fields |
|---|---|---|
| **Task** | Work with duration | duration, % complete, assignments (allocation %), story points (agile), sprint |
| **Milestone** | Zero-duration event | deadline (optional), RAG |
| **Stage gate** | Milestone with governance | entry criteria, exit criteria (checklists), approvers, decision |
| **Risk** | RAID: R | probability (1–5), impact (1–5), score, mitigation plan, mitigating items, trigger |
| **Issue** | RAID: I | severity, impacted items, resolution |
| **Decision** | RAID: D | context, options, outcome, decided by/at |
| **Assumption** | RAID: A | statement, validation by, status |
| **Change request** | Governed scope/cost/schedule change | scope delta, cost delta, schedule delta (computed preview), approvers, status; on approval → applies changes and **rebaselines with audit trail** |
| **Procurement item** | Long-lead purchase | supplier, PO number, PO value, lead time, order-by (computed), need-by (computed from dependent install task), expected delivery, delivery status, float (computed) |

Full types: [docs/data-model.md](docs/data-model.md).

---

## 5. The core loop

```
  conversation ─────────────► signal ─────────────► proposal ─────────► plan
  (thread msg, email,         (AI extraction,        (change + impact     (approved →
   Slack/Teams msg,            check-in answer,       preview: dates,      applied, CPM
   Jira/GitHub event)          connector event)       critical path, $)    recomputed,
                                                                           audit logged)
                                                       ▲
                                                 PM approves / edits / rejects
```

1. **Conversation** arrives on an item thread, a channel, a filed email, a bridged Slack/Teams message, or a connector event.
2. **Signals** are extracted: by AI (from free text) or directly (check-in answers, Jira status changes).
3. A **Proposal** is created: one or more concrete plan changes + a computed **impact preview** (what moves, critical path change, milestone RAG change, cost/EVM change), with links to the source messages.
4. The PM **approves** (one click), **edits then approves**, or **rejects**. Nothing changes the plan without approval (except a member editing their own item directly, which is a normal edit, not a proposal).
5. Approved changes are applied, the schedule is recomputed, an audit entry is written, and the source thread gets a system message ("Applied: GPU delivery +15d → Rack & Stack start moved to Mar 12").

Proposals show **inline** (a chip under the triggering message) **and** in the **Briefing** queue.

---

## 6. Screens

All ten screens are in v1 (Documents added 2026-11-20). Global chrome: left nav (program switcher, screens), top bar (search / **Ctrl+K command palette**, Ask Keel, notifications inbox, persona switcher in demo mode, theme toggle).

### 6.1 Briefing (home)
The PM's start-of-day screen; replaces "unread counts".
- **Needs you:** proposals awaiting approval (with impact summaries), change requests to approve, check-ins due, mentions.
- **What changed since you last looked:** grouped digest (schedule moves, RAG changes, new risks, decisions made, budget movements), each line linking to its source.
- **Program health:** milestone strip (next 5, RAG), critical path summary, CPI/SPI tiles, budget burn, top 5 risks, sprint health (agile workstreams).
- **Check-ins:** status of the current check-in round (answered / pending / at-risk answers).

### 6.2 Timeline (waterfall home)
MS Project-style **split grid + Gantt**.
- Grid (left): WBS, name, type icon, owner, duration, start, finish, % complete, total float, baseline variance; configurable columns; outline indent/outdent; inline editing; virtualized rows (600+).
- Gantt (right): bars, milestones (diamonds), stage gates (gated diamond), dependency arrows (FS/SS, lag labels), **critical path highlight**, **baseline ghost bars**, today line, zoom (day/week/month/quarter), drag to move/resize, drag to link.
- Toolbar: baseline set/compare, critical-path toggle, filter (workstream, owner, type, critical only, slipped only), zoom, export.
- Agile workstreams appear as summary bars (sprint ranges) linked to milestones.

### 6.3 Item detail
Side panel (from anywhere) and full page.
- Header: type, title, status, RAG, owner, dates, float, quick actions.
- Fields: type-specific (see §4).
- Relations: predecessors/successors with lag; links.
- **Unified stream:** chat messages, filed emails, bridged Slack/Teams messages, Jira/GitHub events, check-in answers, AI proposals, system audit messages — one chronological stream with source badges.
- Composer: message, @mention, attach, "send as email to guest", slash commands (`/checkin`, `/risk`, `/decision`).
- Followers, sharing (external guests).

### 6.4 Channels
Free chat for talk that isn't about one item yet.
- Program-level and workstream-level channels; bridged channels show the Slack/Teams badge.
- Message actions: reply in thread, **Promote to task / risk / issue / decision / change request** (pre-filled by AI from the message and its context; the new item links back via `promoted-from`).
- AI chip on messages that look like plan signals ("sounds like a schedule slip on Chiller install — create proposal?").

### 6.5 Mail triage
Synced mailbox view (mocked Outlook/Gmail).
- List of synced messages with AI **filing suggestion**: target item + confidence + reason ("subject mentions PO-4471, sender @coolingco.com, matches Chiller procurement item").
- Actions: **File & share to item**, file privately (only PM sees), dismiss, "always file from this sender to item X" (creates a rule — power feature, opt-in).
- Filed emails are **private by default**; visible to the item's members only after the PM confirms.
- Replies from an item thread to a guest go out as normal email (mocked).

### 6.6 Status report
Auto-drafted weekly report, editable before publishing.
- Sections: executive summary, overall RAG + per-workstream RAG, milestones (changed / at risk), critical path changes, budget & EVM (CPI, SPI, EAC, VAC), top risks & issues, decisions made, asks/escalations, next period.
- **Every line links to its source** (items, messages, proposals). Hovering a line highlights its sources.
- Draft → edit → publish; published reports are versioned snapshots.
- Export: PDF, "copy as email" (HTML). PPTX later.

### 6.7 RAID log
Table views of Risks, Assumptions, Issues, Decisions (tabs), plus a **risk heat map** (probability × impact). Filters, sorting, inline edit, link to mitigating items.

### 6.7b Documents (living project documents)
Project charter, BRD/requirements, RACI matrix, and stakeholder & communications plan, **authored in Keel**. **Live sections** (milestones, budget, team, top risks, requirements traceability, RACI, stakeholders) render from plan data at view time, so they're always current. **Narrative sections** are written by people. **Sign-off** (draft → in review → approved vN) freezes a rendered copy, and later changes show as **drift** ("Changed since v3"). Material drift (a gate slips past its approved date, EAC moves > 5%) puts "start re-approval?" on the Briefing. Version history, compare, attachments, and PDF/Markdown export. RACI cells are derived from owners, leads, approvers and followers, with overrides and validation (exactly one A, at least one R). Full design: [docs/documents.md](docs/documents.md).

### 6.8 Boards and tables
- **Board** (kanban) by status / owner / workstream; for agile workstreams: **sprint board**, **backlog** (drag into sprint), **burndown** and **velocity** charts.
- **Table** (Monday-style) with grouping and custom-ish columns (from a fixed set of fields in v1).
- **Workload heatmap:** person × week, allocation %, overallocation highlighted.
- **Budget view:** per-workstream budget, committed (POs/contracts), actual, forecast at completion, change orders.

### 6.9 Settings and connectors
- Program settings: calendar (work week, holidays), check-in cadence, members & roles, workstreams.
- Connectors (mocked, realistic setup flows): Jira, GitHub, Outlook (M365), Gmail, Slack, Teams — status, mapping (e.g., Jira project ↔ workstream), last sync.
- AI: provider, **"Bring your own key"** field (stored in the browser only), model choices.
- Import/export: MS Project XML (MSPDI) import; CSV/Excel and MSPDI export.

### Phones
Responsive **read-only** for: Briefing, status report, item threads (with replying), approving/rejecting proposals. Timeline and grid editing are desktop-only, with a friendly "open on desktop to edit the plan" notice.

---

## 7. Scheduling

- **Durations** in working days, half-day granularity. **One working calendar per program** (work week + holidays; HPC program uses a 6-day week).
- **Dependencies:** FS and SS with lag (positive or negative, working days).
- **Auto-rescheduling** on any change; tasks may be **pinned** (manual dates) or use a **start-no-earlier-than** constraint.
- **Critical path** via CPM forward/backward pass; total float per item; milestone **deadlines** produce negative float when missed. **Deadline float** (slack against the nearest downstream deadline) drives RAG.
- **Baselines:** one active baseline per program (re-baselining happens through approved change requests, or by the PM with a recorded reason; history is kept); variance shown in grid and as ghost bars.
- **Resources:** assignments with allocation %; workload heatmap; **no auto-leveling**.
- **Agile roll-up:** a sprint-run workstream contributes a summary span (first sprint start → projected completion from velocity) that can be a predecessor of milestones.

Algorithm, edge cases and required tests: [docs/scheduling.md](docs/scheduling.md).

---

## 8. Agile (lightweight)

- Backlog, sprints (2-week default), story points, sprint board, burndown, velocity (last 3 sprints).
- Projected completion of a sprint-run workstream = remaining points ÷ average velocity → sprint count → date. This feeds the milestone backbone, so "sprint 14 slipped" can turn a release milestone amber the same way a schedule slip does.
- **Jira mirroring** (mocked): a workstream can be linked to a Jira board; issues/sprints are read-only mirrors with status events flowing into item streams.

---

## 9. Cost and earned value

- **Budget** (BAC) per workstream and per item (cost-loaded tasks, PO values on procurement items).
- **Commitments:** POs and contracts (committed vs. actual vs. remaining).
- **Actuals:** recorded per item/period (seeded in the demo).
- **Forecast at completion** per workstream and program.
- **Change orders** via change requests (cost delta requires approval; approval updates the budget baseline with audit).
- **EVM:** PV, EV, AC → **CPI = EV/AC**, **SPI = EV/PV**, **EAC = BAC/CPI**, **ETC = EAC − AC**, **VAC = BAC − EAC**. Shown as tiles on the Briefing and in the status report. Formulas: [docs/scheduling.md §EVM](docs/scheduling.md#7-earned-value-evm).
- Single currency (USD) in v1.

---

## 10. Communication

- **Threads on every item** + **program/workstream channels** + **Promote to item**.
- **Email — full mailbox sync** (Outlook/Gmail, mocked): AI suggests filing; **private until the PM confirms**; sender/domain rules are an opt-in power feature. Replies from Keel go out as email to guests.
- **Slack/Teams — bridge + native:** selected channels mirror into Keel channels (two-way); native chat for project talk; teams migrate gradually.
- **Check-ins:** owners of items active or starting within 2 weeks are asked **weekly** (program cadence) plus **ad hoc** ("ping owners of everything on the critical path"). Delivered where the owner lives (Keel / Slack / Teams / email). One-tap answers: **On track** · **At risk + new date** · **Blocked + why**. Answers become signals → proposals.
- **Notifications:** in-app inbox for things *for you* (mentions, approvals, check-ins assigned to you); the **"what changed" digest** replaces unread counts everywhere else; follow/unfollow per item feeds your digest; optional daily email digest.

---

## 11. AI

- **Provider interface** (`AiProvider`) so a company can bring its own model or private deployment. Default: **Claude** — `claude-sonnet-5-5` for drafting/extraction, `claude-haiku-5-5` for cheap classification (email filing, signal detection).
- **Features:**
  1. **Signal → proposal** extraction from threads, channels, filed email, bridged chat, connector events.
  2. **Impact preview** — computed by the scheduling/EVM engine, *not* by the model. The model proposes changes; deterministic code computes consequences.
  3. **Email filing** suggestions.
  4. **Promote-to-item** pre-fill.
  5. **Status report drafting** with source citations.
  6. **"What changed" digest** summarization.
  7. **Ask Keel** — question or command (in the Ctrl+K palette). Answers cite items/messages; any change it wants to make is a **proposal** awaiting approval.
  8. Stretch: workload rebalancing suggestions ("move cabling review 3 days, no critical-path impact").
- **Public demo:** **scripted by default**; **Bring your own key** makes real calls direct from the browser to the API (key in browser storage only). No server, no cost exposure.

Details: [docs/ai.md](docs/ai.md).

---

## 12. Connectors (v1: mocked)

One `Connector` interface; first adapters: **Jira, GitHub, Outlook (M365), Gmail, Slack, Teams**. Later adapters (Azure DevOps, GitLab, Monday, Smartsheet, WhatsApp) are additional implementations. In the prototype each connector has: a realistic setup screen, a mapping screen, and a seeded event stream used by the demo scenarios.

---

## 13. Demo mode

Two seeded programs, five personas, scripted scenarios. Full scripts: [docs/demo-scenarios.md](docs/demo-scenarios.md).

| Program | Method | Scale |
|---|---|---|
| **Lumen AI** — AI SaaS platform public launch | Agile workstreams + release milestone backbone | ~150 items, 5 workstreams, 25 people |
| **Titan-1** — HPC data center build | Waterfall, critical path, stage gates, cost-loaded | ~530 items (~490 tasks), 10 workstreams, 80+ people (incl. contractors), ~$250M |

Demo controls (visible in a collapsible "Demo" panel):
- **Persona switcher:** PM · workstream lead · exec viewer · supplier guest (+ member).
- **Program switcher.**
- **Run scenario:** plays scripted events on a timeline (e.g., supplier email arrives → AI proposal → check-in replies → Jira sprint closes) so the loop happens live.
- **Reset demo:** per-visitor data lives in localStorage; reset restores seed.
- **Guided tour:** optional ~60-second walkthrough of the hero story.

---

## 14. Look and feel

**Enterprise classic, made modern.** The familiar structure of MS Project (split grid+Gantt, outline indent, WBS numbers, dense rows) with a modern finish (clean type, crisp 1px borders, restrained color reserved for status/RAG, subtle motion).

- Rows 28–32 px; compact controls; slim toolbar (no ribbon).
- **Light theme default**, dark fully supported.
- **Keyboard-first:** Ctrl+K palette, arrow-key grid navigation, shortcuts for indent/outdent/link/zoom.
- **Accessibility:** full keyboard navigation, visible focus, **WCAG AA** contrast in both themes.
- English only; **all strings in i18n resources** (RTL-ready layout via logical CSS properties).

---

## 15. Tech stack and front-end architecture

| Concern | Choice |
|---|---|
| Language / build | TypeScript (strict), React, Vite |
| Styling / primitives | Tailwind CSS + Radix primitives (shadcn/ui-style components owned in-repo) with Keel design tokens |
| Grid | TanStack Table + TanStack Virtual |
| Gantt | Custom SVG, virtualized, built in-repo |
| Routing | React Router |
| Server state | TanStack Query over the `KeelApi` contract |
| UI state | Zustand (small, per-feature stores) |
| Charts | Recharts (burndown, velocity, EVM trend, heat map can be custom SVG) |
| i18n | i18next + react-i18next |
| Tests | Vitest (unit), Playwright (e2e) |
| Hosting | Vercel (static build) |

```
src/
  app/            routing, layout, providers, command palette
  ui/             design system: tokens, primitives, components
  features/       briefing/ timeline/ item/ channels/ mail/ report/ raid/ boards/ settings/ demo/
  domain/         PURE TS, no React: scheduling (CPM), calendar, evm, proposals, permissions, rollups
  api/            contract.ts (KeelApi), mock/ (in-memory + localStorage impl, event bus, latency sim)
  ai/             AiProvider interface, claude provider (BYOK), scripted provider
  connectors/     Connector interface + mock adapters
  data/seed/      lumen/ titan/ (JSON fixtures; Titan plan as MSPDI XML to prove import)
  i18n/           en.json
tests/e2e/        Playwright
```

Rules: `domain/` has no UI or I/O dependencies and is 100% unit-tested where it computes. Features talk to data only through `KeelApi`. The mock API is the contract the future backend implements ([docs/mock-api.md](docs/mock-api.md)).

---

## 16. Quality bar

- **Unit tests (required):** CPM (FS/SS, lag, negative lag, pins, SNET constraints, deadlines/negative float, cycles), calendar math (work weeks, holidays, half-days), baseline variance, EVM math, agile projection, procurement order-by/need-by/float, permission rules, MSPDI import round-trip.
- **E2E (Playwright):** the Titan-1 hero scenario end to end; Lumen sprint-slip scenario; mobile read-only approval.
- **Performance:** Titan-1 timeline scrolls at 60 fps on a mid-range laptop; recompute of 600-task CPM < 50 ms.
- **Accessibility:** keyboard-only pass of every screen; axe checks in e2e.

---

## 17. Delivery

- **Repo:** public, **MIT license** (after confirming the author's employer has no IP claim).
- **Hosting:** Vercel; "Try the demo" link from the author's personal website.
- **Case study page** on the personal site: problem → insight → design decisions → demo GIF → link.
- **Build order:** vertical slice first (Titan-1 hero story end to end), then broaden. See [docs/build-plan.md](docs/build-plan.md).

---

## 18. Later (explicitly out of v1)

Real backend + SSO + real connectors · mobile companion app · PPTX export · cross-program dependencies and portfolio rollups · resource leveling · per-person calendars · FF/SF dependencies · multi-currency · custom roles · custom fields builder · additional connectors (Azure DevOps, GitLab, Monday, Smartsheet, WhatsApp) · additional UI languages.

---

## 19. Document index

| Doc | Contents |
|---|---|
| [docs/data-model.md](docs/data-model.md) | TypeScript domain types |
| [docs/mock-api.md](docs/mock-api.md) | `KeelApi` contract, events, mock implementation rules |
| [docs/scheduling.md](docs/scheduling.md) | Calendar, CPM, baselines, procurement dates, agile projection, EVM, test matrix |
| [docs/ai.md](docs/ai.md) | Provider interface, features, proposal model, BYOK, scripted provider |
| [docs/demo-scenarios.md](docs/demo-scenarios.md) | Programs, workstreams, personas, scenario scripts |
| [docs/documents.md](docs/documents.md) | Living project documents: charter, BRD, RACI, stakeholder & comms plan |
| [docs/backend.md](docs/backend.md) | Future backend architecture (one page) |
| [docs/build-plan.md](docs/build-plan.md) | Phases and exit criteria |
| [docs/adr/](docs/adr/) | Architecture decision records |
