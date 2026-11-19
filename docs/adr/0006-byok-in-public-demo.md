# ADR 0006: Public demo AI is scripted by default, with bring-your-own-key

**Status:** Accepted, 2026-11-19

## Context
A static Vercel front end cannot safely hold the author's API key, because anyone could read it. A serverless proxy would add ops and open-ended cost exposure.

## Decision
- The default provider is **scripted**, with deterministic outputs for every demo scenario step.
- **Bring your own key**: a visitor (or the author, in interviews) can paste a Claude API key in Settings → AI. It is stored only in their browser, and calls go directly from the browser to the Anthropic API.
- If a live call fails, the router falls back to scripted output.

## Consequences
- The demo works with no keys and costs nothing to run.
- Live AI is one paste away.
- The future backend replaces this with a server-side provider ([backend.md](../backend.md)).
