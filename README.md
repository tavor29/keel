# Keel

**Program management where the conversation *is* the plan.**

**▶ Live demo: [keel-eta-blond.vercel.app](https://keel-eta-blond.vercel.app)** (fictional data; click **Demo** in the bottom-right corner and run the scenario)

Keel is a web app for program managers running multi-team, high-tech programs. It combines MS Project-grade scheduling (critical path, baselines, stage gates), Monday-style boards, and the conversation that usually lives in Slack and email. AI turns what people say into proposed plan changes, shows their impact, and lets the PM approve them in one click.

> Status: **Phases 0–2 done.** The hero demo plays end to end: a supplier email becomes an AI-proposed plan change, the PM approves it with its computed impact, an exec approves a change request, and the status report rewrites itself with linked sources. Built so far: Briefing, Timeline (split grid + Gantt, critical path, baselines), Item detail, Mail triage, Status report, and Demo controls. Next: [Phase 3, agile + Lumen AI](docs/build-plan.md).

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
