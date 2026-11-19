# AI design

Lives in `src/ai/`. The principle: **the model reads and proposes, deterministic code computes, and a human approves.**

## 1. Provider interface

```ts
export type ModelTier = 'draft' | 'classify';          // draft → claude-sonnet-5-5, classify → claude-haiku-5-5

export interface AiProvider {
  id: 'claude' | 'scripted' | string;
  available(): Promise<boolean>;
  run<T>(task: AiTask<T>, input: AiTaskInput): Promise<AiResult<T>>;
}

export interface AiTask<T> {
  name: 'detect_signal' | 'draft_proposal' | 'file_mail' | 'suggest_promotion'
      | 'draft_report' | 'summarize_digest' | 'ask';
  tier: ModelTier;
  system: string;                                     // prompt in src/ai/prompts/<name>.md
  schema: ZodType<T>;                                 // output validated; invalid → one retry, then fail soft
}

export interface AiResult<T> { output: T; usage?: { inputTokens: number; outputTokens: number }; provider: string }
```

Implementations:

- **`ClaudeProvider`** calls the Messages API directly from the browser (`https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version`, and `anthropic-dangerous-direct-browser-access: true`). It uses structured JSON output validated with zod. It is only active when a **Bring-your-own-key** key is present.
- **`ScriptedProvider`** returns deterministic outputs from `src/ai/scripts/`, keyed by scenario step or by a normalized input fingerprint. It is the default in the public demo and in tests.
- Future: `ServerProvider` (the backend proxies to Claude or to a company's own model).

`AiRouter` picks Claude if a key exists and the call succeeds. Otherwise it falls back to scripted output, so the **demo never breaks**.

## 2. Tasks

| Task | Tier | Input | Output |
|---|---|---|---|
| `detect_signal` | classify | one message + container item + its neighborhood | `{ isSignal, kind: 'slip'\|'pull_in'\|'blocked'\|'cost'\|'risk'\|'decision'\|'none', itemId?, confidence }` |
| `draft_proposal` | draft | signal + message(s) + item neighborhood + calendar | `{ summary, rationale, changes: PlanChange[], sources: [{id, quote}] }` |
| `file_mail` | classify | email + candidate items (by keyword/PO/supplier/domain match) | `{ itemId \| null, confidence, reason }` |
| `suggest_promotion` | draft | channel message + surrounding messages + workstreams | `NewItem` draft (type, title, workstream, owner, fields) |
| `draft_report` | draft | period digest + schedule/EVM snapshot + RAID + proposals decided | `ReportSection[]`; every line cites source ids |
| `summarize_digest` | classify | raw digest entries | grouped, deduplicated one-line summaries |
| `ask` | draft | question + retrieved context | `{ answer, citations[], proposedChanges?: PlanChange[] }` (changes become a Proposal) |

Only `detect_signal` positives (confidence ≥ 0.6) trigger `draft_proposal`. Proposals with confidence < 0.75 are labelled "low confidence".

## 3. Context building (no vector DB in v1)

Retrieval is **structural + keyword**:
- **Item neighborhood**: the item, its parent, its predecessors and successors (2 hops), the milestones and gates it drives, its open risks, and the last 20 messages in its stream.
- **Candidates for mail filing**: items whose PO number, supplier, guest domain, or title keywords match the email.
- **Ask Keel**: keyword search over items and messages, plus the schedule/EVM snapshot, plus critical path, upcoming milestones and top risks.

**Visibility is respected.** Context is built *as the current persona*, so `pm_only` emails never reach a model call made for another user.

## 4. Guardrails

- **Never auto-apply.** Every model-originated change becomes a `Proposal`.
- **Impact is computed by `domain/impact()`**, never by the model. If the model's free-text summary contradicts the computed impact, the UI shows the computed numbers, and `summary` is regenerated from the impact by a template.
- **Schema-validated output.** Unknown item ids, invalid dates or unknown fields cause the proposal to be dropped, with an "AI couldn't interpret this message" note available on hover.
- **Citations are validated.** Report lines and Ask answers that cite ids not in the provided context are removed.
- **Prompt injection.** Email, chat and connector text is wrapped in `<untrusted_content>` tags. The system prompt states that it is data and never instructions. The model has no tools, and its only effect is returned JSON.
- **Privacy.** A BYOK key is stored in `localStorage` only, sent only to `api.anthropic.com`, and can be cleared from Settings.

## 5. UX conventions

- AI-originated things carry a small spark icon and "Suggested by Keel".
- A proposal card shows the summary, the computed impact (moves, critical path, RAG, $ and CPI/SPI), source quotes with links, and **Approve**, **Edit & approve** and **Reject** buttons.
- "Edit & approve" opens the changes as a small editable list, and `proposals.preview()` updates the impact live as you edit.

## 6. Scripted mode

- Every demo scenario step that needs AI has a scripted output in `src/ai/scripts/<scenario>.ts`.
- Ask Keel without a key offers **suggested questions**, each with a scripted answer ("What's driving the Energization gate?", "Which POs are at risk this quarter?", "Summarize this week for the exec staff"). For free-form questions it replies "Connect your own key in Settings → AI to ask anything", and still runs a keyword search over items as a useful fallback.

## 7. Cost note (BYOK)

The Settings → AI screen shows the models in use and a rough per-action token estimate, so a visitor using their own key knows what they're spending.
