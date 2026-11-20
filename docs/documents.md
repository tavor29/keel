# Project documents (living docs)

> Status: **Agreed** (2026-11-20). Builds in phase 4, alongside the RAID log.

The project charter, BRD, RACI matrix and stakeholder and communications plan live **in Keel** as **living documents**:

- **Live sections** are rendered from plan data at view time: milestones, budget, team, risks, RACI assignments, stakeholders. They are always current.
- **Narrative sections** are written by people: purpose, scope, success criteria, requirement text.
- Each document goes through **sign-off with versions**. Every approved version is frozen, so you can always see what was signed and what has changed since.

This connects documents to the wedge: they move with the plan, the same way the status report does.

## 1. Document types (v1)

| Kind | Narrative sections | Live sections (from plan data) |
|---|---|---|
| **Project charter** | Purpose · Objectives · Scope in / out · Assumptions & constraints · Success criteria | Sponsor & approvers · Milestones & stage gates (dates, deadlines, RAG) · Budget by workstream (BAC, EAC) · Team (workstream leads) · Top risks |
| **BRD / requirements** | Business context · Glossary | **Requirements table**: ID (BR-001…), statement, rationale, MoSCoW priority, status, owner, **traced plan items**, coverage |
| **RACI matrix** | Notes | **Matrix**: deliverables (gates, milestones, chosen summary items) × people or roles, with R/A/C/I cells derived from the plan plus manual overrides |
| **Stakeholder & comms plan** | Engagement approach | **Stakeholder register** (members + external guests + added stakeholders: influence, interest, attitude) and a **communication plan** (audience, message, channel, cadence, owner, where the next one is due) |

A document can also carry **attachments** (e.g., a signed PDF, a vendor SOW) shown in its sidebar. Uploading arrives with the backend; in the v1 prototype attachments are seeded.

## 2. How "live" works

- A live section stores **a binding, not content**: `{ source: 'milestones', filter: { types: ['gate'] } }`. The viewer renders it from current plan data through the same `KeelApi` queries as every other screen.
- **On approval**, Keel renders every live section and stores the result in the frozen version. This is the audit record of exactly what was signed.
- **Drift.** When the current live rendering differs from the latest approved version, the document shows a **"Changed since v3 (approved Oct 2)"** badge on each affected section, with a side-by-side diff. Examples: G2 moved 12 days, budget EAC changed, a new top risk.
- Drift does **not** silently invalidate an approval. Instead:
  - **Material drift** (a gate or milestone slipped past its approved date, or EAC moved more than 5%) creates a **Briefing item**: "Charter v3 is out of date: G2 Energization moved +12 days. Start re-approval?"
  - The PM can **start a new version** (v4 draft, pre-filled with current live data) and send it for re-approval, or **acknowledge** the drift with a note.

## 3. Governance (sign-off + versions)

```
draft ──submit──► in_review ──all approvers approve──► approved (v N, frozen)
  ▲                   │                                     │
  └──── reject ◄──────┘                     edit narrative / start new version
                                                            ▼
                                                     draft (v N+1)
```

- **Approvers** are set per document (default: sponsor + PM for the charter; PM + workstream leads for the RACI; PM + business owner for the BRD).
- Editing the narrative of an approved document creates a **new draft version**. The approved version stays the *current approved* until the new one is approved.
- **Version history**: every approved version can be viewed, compared (text diff for narrative, table diff for live sections) and exported.
- Permissions: PM and workstream leads edit (`document.edit`). Named approvers approve (`document.approve`). Exec viewers read everything. Guests see only documents explicitly shared with them (e.g., a supplier sees the RACI for their scope).
- Every transition writes an `AuditEntry`.

## 4. Smart parts

- **RACI derivation.** For each deliverable:
  - **R** = item owner and assignees
  - **A** = workstream lead (for gates, the gate owner)
  - **C** = gate approvers and leads of predecessor workstreams
  - **I** = followers and exec viewers

  Manual overrides are stored per cell and shown with a marker. Validation flags rows without exactly one **A** or without any **R**.
- **Requirement traceability.** Each requirement links to the plan items that deliver it. Coverage shows untraced requirements, and items at risk show their requirements, so "BR-014 at risk because Hall C fabric slipped" appears automatically.
- **Communication plan → check-ins.** Comms rows can create recurring check-ins or reminders (e.g., "Monthly steering update to execs: due Dec 1").
- **AI assist** (same proposal rules as everything else):
  - Draft narrative sections from plan context (e.g., charter purpose and objectives from the program description and gates).
  - Suggest requirement → item traces.
  - Summarize drift ("Since v3: G2 +12 days, EAC +$1.2M, 2 new high risks").

## 5. Screen

**Documents** is a new left-nav entry, next to RAID log:

- **Library:** cards per document with kind, state (draft / in review / approved vN), drift badge, approvers, last updated.
- **Viewer and editor:** sections in order. Live sections show a "Live" badge and a small "as of now" timestamp. Narrative sections are edited inline as markdown. The right rail shows the approval panel, version history and attachments.
- **Compare:** pick two versions, or "approved vs. now".
- **Export:** PDF and Markdown (Word through the same path later).

## 6. Demo seed (Titan-1)

| Document | State | Notes |
|---|---|---|
| Project charter | **approved v3** (sponsor Jordan Lee, PM Alex Rivera) | During scenario T1 the G2 slip creates drift, and the Briefing asks to start v4 |
| BRD | approved v2, 24 requirements | 2 untraced requirements show in coverage |
| RACI matrix | in review v1 | One row missing an **A** is flagged |
| Stakeholder & comms plan | approved v1 | Steering committee update due this week shows on the Briefing |

Lumen AI gets a charter and a BRD (product requirements) only.
