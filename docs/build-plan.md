# Build plan

**Vertical slice first:** get the Titan-1 hero story (scenario T1) working end to end at modest fidelity, then broaden. Each phase ends with something demoable.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Foundations** | Vite + React + TS strict, Tailwind + Radix, design tokens (light/dark), app shell (left nav, top bar, Ctrl+K stub), i18n setup, Vitest + Playwright wired, Vercel preview deploys, `KeelApi` contract + mock skeleton (event bus, latency, localStorage, reset) | App shell deploys to Vercel. CI runs lint, typecheck and tests |
| **1. Domain core** | `domain/`: types, calendar, CPM (FS/SS, lag, pins, SNET, deadlines), procurement nodes, baselines and variance, RAG, EVM, impact, permissions. MSPDI importer. Titan-1 seed (MSPDI + JSON) | Required scheduling tests from [scheduling.md §13](scheduling.md#13-required-tests) pass. Titan-1 imports and schedules in < 50 ms |
| **2. Hero slice (T1)** | Timeline (grid + Gantt, read-mostly, critical path, baseline ghosts, virtualized), Item detail with unified stream, Mail triage (file & share), proposals (inline chip + Briefing card + impact preview + approve), check-in answer, change request + exec approval + rebaseline, status report draft with source links. Scripted AI provider. Persona switcher, Run scenario T1, Reset | **T1 plays end to end** on Vercel. Playwright T1 test passes |
| **3. Broaden: agile + Lumen** | Lumen seed, sprints, backlog, sprint board, burndown, velocity, agile projection + delivery node, Jira mirror events, Channels with Slack/Teams bridge badges, Promote to item, scenarios L1 + L2 | L1 plays end to end. Hybrid Software Stack workstream shows in Titan-1 |
| **4. Plan editing + RAID + cost** | Timeline editing (drag move/resize, drag to link, indent/outdent, inline grid edit, undo), RAID log + heat map, budget view, EVM tiles and trend, workload heatmap, check-in rounds (weekly + ad hoc) and scenario T2 | A PM can build and edit a plan from scratch. T2 plays |
| **5. Remaining screens + I/O** | Boards/tables, Settings (calendar, cadence, members, workstreams), connector setup and mapping screens (mocked), AI settings + **BYOK Claude provider**, Ask Keel (scripted suggestions + live with key), notifications inbox + digest, MSPDI/CSV export, PDF and copy-as-email report export, scenario T3 | All nine screens are complete. Live AI works with a pasted key |
| **6. Polish + launch** | Mobile read-only views, guided tour, keyboard pass, axe checks, performance pass (60 fps timeline), empty and error states, README with GIFs, MIT license, case-study page and link from the personal site | Lighthouse a11y ≥ 95. E2E suite green. Public link live |

## Working agreements

- `domain/` changes ship with tests in the same commit.
- Every screen is built against `KeelApi` only, never against mock internals.
- Each phase ends with a Vercel preview link and an updated demo GIF.
- New decisions get an ADR in `docs/adr/`.

## Before going public

- Confirm the author's employer has no IP claim on Keel (work time, equipment, internal-tool use).
- Check that seed data is fully fictional (people, companies, suppliers).
