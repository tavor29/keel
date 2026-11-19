# ADR 0003: AI proposes, deterministic code computes impact, the PM approves

**Status:** Accepted, 2026-11-19

## Context
Turning conversation into plan updates is Keel's wedge. Fully automatic updates would quietly corrupt the plan and destroy PM trust. Model-computed schedule consequences would be unreliable.

## Decision
- Every model-originated change is a **Proposal** with source citations.
- **Impact** (moved dates, critical path, RAG, cost, CPI/SPI) is computed by `domain/impact()`, never by the model.
- The PM approves, edits and approves, or rejects. Change requests that need governance (cost, rebaseline) go through approvers.
- Structured **check-ins** supply clean signals alongside AI extraction.

## Consequences
- An approval UI (inline chip plus Briefing queue) is a core v1 surface.
- The scripted provider can drive the demo with exactly the same proposal pipeline.
- Ask Keel can "act" only by creating proposals.
