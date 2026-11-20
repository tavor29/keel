# ADR 0007: Project documents are living documents with frozen approved versions

**Status:** Accepted, 2026-11-20

## Context
PMs keep a charter, BRD, RACI and stakeholder plan in Word or SharePoint. Those copies go stale as soon as the plan moves, and nobody can tell which version was signed. We considered three approaches:
- uploaded files with version history
- links to Drive or SharePoint
- documents authored in Keel

## Decision
Documents are authored in Keel. **Live sections** bind to plan data and render at view time. **Narrative sections** are written by people. **Sign-off** freezes a rendered copy of every section into an approved version. Later changes show as **drift** against the latest approved version, and material drift (gate slips, EAC more than 5%) asks the PM to start re-approval. External files can be attached.

## Consequences
- Documents are "always the latest" without anyone re-typing dates or budgets.
- Approvals stay auditable: the frozen copy is what was signed.
- There's a new `documents` area in the data model and API, a Documents screen (phase 4), and drift items on the Briefing.
- Word and PDF are export formats, not the source of truth.
