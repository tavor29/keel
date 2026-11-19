# ADR 0001: Greenfield, not a fork

**Status:** Accepted, 2026-11-19

## Context
We reviewed three open-source projects as possible bases:
- **Worklenz** (AGPL-3.0; React 19 + Vite + Ant Design + Redux; Express/TS + Postgres). Very active. It has boards, lists, comments, time tracking, resource views and a client portal. Its Gantt is the small `gantt-task-react` library with no critical path or baselines.
- **GanttProject** (GPL-3.0). A Java/Kotlin **desktop** app with no web version.
- **OpenProject** (GPL-3.0; Rails + Angular). Very mature, but a large monolith on a different stack. Its scheduling docs describe predecessor/successor links with lag and automatic scheduling, but not critical path or start-to-start.

## Decision
Build Keel from scratch. Borrow **ideas, not code**: OpenProject's relation and scheduling-mode semantics, GanttProject's MS Project import approach, Worklenz's board and list patterns.

## Consequences
- A fork would only have saved the commodity parts (auth, boards, settings, backend). Keel's wedge (CPM engine, threads on items, mail filing, AI proposals, Briefing, status report) is new code either way.
- Keeps the mock-first front end (ADR 0002), the zero-ops Vercel demo, and an MIT license (a fork would have required AGPL or GPL).
- The portfolio story is "designed and built Keel", not "extended Worklenz".
- We revisit this when the backend phase starts, since adopting parts of the Worklenz backend could still be an option then.
