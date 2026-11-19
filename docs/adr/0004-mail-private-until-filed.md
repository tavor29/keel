# ADR 0004: Synced mail is private until the PM files and shares it

**Status:** Accepted, 2026-11-19

## Context
Full mailbox sync gives the AI the best signal, and it is also the most sensitive data in the product. One wrongly shared email (HR, pricing, personal) would end trust.

## Decision
- The AI only **suggests** a target item for each email.
- An email becomes visible to an item's members only after the PM chooses **File & share**. **File privately** keeps it `pm_only`.
- Sender and domain auto-share rules are an opt-in power feature.
- AI context is always built as the current persona, so `pm_only` content never enters a model call made for anyone else.

## Consequences
- Mail triage is its own screen.
- `Message.visibility` is part of the data model and enforced by the API's permission layer.
