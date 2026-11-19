# Future backend (one page)

This is not built in v1. It exists so the mock API contract stays honest. The backend implements [`KeelApi`](mock-api.md) over HTTP, with events over WebSocket.

```
 Browser (Keel SPA) ──HTTPS/JSON──►  API service (Node + TypeScript)
        ▲                               │  same domain/ package as the front end (CPM, EVM, impact, permissions)
        └──────── WebSocket events ─────┤
                                        ├──► Postgres (system of record; row-level program scoping)
                                        ├──► Job queue (Postgres-backed, e.g. pg-boss)
                                        │       ├─ connector workers: Jira, GitHub, M365 Graph (mail + Teams), Gmail, Slack
                                        │       ├─ AI worker: signal detection, proposals, report drafts
                                        │       └─ check-in scheduler (weekly rounds, reminders)
                                        └──► Object storage (attachments, exports)
 Inbound webhooks (Jira, GitHub, Slack, Graph change notifications) ──► API ──► queue
```

- **Shared domain package.** `src/domain/` moves to `packages/domain`, and the browser and server both import it. Schedule and impact are computed server-side for writes and client-side for instant previews. Identical code means identical answers.
- **Auth.** SSO via Microsoft Entra ID and Google (OIDC). Guests use magic links scoped to shared items.
- **Permissions.** The same `can()` function is enforced in the API. Postgres row-level security by `program_id` is a second line of defense.
- **Connectors.** Each connector implements `Connector { connect, sync, handleWebhook, mapping }`. Tokens are encrypted at rest. Mailbox sync uses delta queries (Graph and Gmail history IDs), and filed emails are copied as messages with `visibility`.
- **AI.** Calls go through `ServerProvider` with zero-data-retention settings. Per-workspace switches turn AI off or route it to a company-provided model endpoint. Prompts and outputs are logged for audit with a retention limit.
- **Data residency.** Single region per workspace (US or EU) in the first version.
- **Migrations.** SQL migrations. The mock's `schemaVersion` maps to the first migration set.
- **Hosting.** Containerized API plus managed Postgres. The front end stays on Vercel.
