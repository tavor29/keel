# Keel

**Program management where the conversation *is* the plan.**

Keel is a web app for program managers running multi-team, high-tech programs. It combines MS Project-grade scheduling (critical path, baselines, stage gates), Monday-style boards, and the conversation that usually lives in Slack and email. AI turns what people say into proposed plan changes, shows their impact, and lets the PM approve them in one click.

> Status: **Phases 0–1 done**: app shell, mock API skeleton, and the domain core (calendar, CPM with deadline float, procurement, agile projection, baselines, RAG, EVM, impact previews, permissions, MS Project XML import/export) with the Titan-1 seed plan. Next: [Phase 2, the hero slice](docs/build-plan.md).

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
