# ADR 0002: The prototype is the real front end on a mock API

**Status:** Accepted, 2026-11-19

## Context
Keel must work both as a public portfolio demo (zero ops, always up) and later as a real internal tool. A throwaway clickable mock would be wasted work. Building a backend first would delay the demo and add hosting.

## Decision
Write production-quality UI code against a typed `KeelApi` contract. In v1 the only implementation is in-memory with localStorage persistence, simulated latency and an event bus. All domain logic (CPM, EVM, impact, permissions) lives in pure `domain/` code.

## Consequences
- The demo deploys as static files on Vercel.
- The backend becomes "implement the contract", and `domain/` is reused server-side ([backend.md](../backend.md)).
- The mock must stay honest: async calls, enforced permissions, no shortcuts that a real backend couldn't provide.
