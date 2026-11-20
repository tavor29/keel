# Keel

**Program management where the conversation *is* the plan.**

**▶ Live demo: [keel-eta-blond.vercel.app](https://keel-eta-blond.vercel.app)** (fictional data; click **Demo** in the bottom-right corner and run the scenario)

Keel is a web app for program managers running multi-team, high-tech programs. It combines MS Project-grade scheduling (critical path, baselines, stage gates), Monday-style boards, and the conversation that usually lives in Slack and email. AI turns what people say into proposed plan changes, shows their impact, and lets the PM approve them in one click.

> Status: **Phases 0–3 done.** Three playable scenarios (Demo button): **T1** supplier email → AI proposal → change request → report (Titan-1, waterfall), **L1** Jira sprint closes short → launch at risk → Slack message promoted to a decision → pick an option (Lumen AI, agile), **L2** pen-test finding in Teams → issue → register risk + fix task. Screens: Briefing, Timeline, Boards (sprint board, burndown, velocity, backlog), Channels (Slack/Teams bridges, Promote to item), Mail triage, Status report, RAID risk register. Next: [Phase 4, plan editing, RAID, documents, cost](docs/build-plan.md).

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm run check        # lint + typecheck + unit tests
npm run e2e          # Playwright (first time: npx playwright install chromium)
npm run build        # static build in dist/ (deploys to Vercel as-is)
```

- **Spec:** [SPEC.md](SPEC.md)
- **Design docs:** [docs/](docs/)
- **Decisions:** [docs/adr/](docs/adr/)

Demo programs: **Titan-1** (HPC data center build, about $250M, waterfall) and **Lumen AI** (AI SaaS launch, agile).

## License

[MIT](LICENSE)
