# ADR 0005: Custom SVG Gantt; Radix + Tailwind design system; TanStack grid

**Status:** Accepted, 2026-11-19

## Context
The look is "enterprise classic, made modern": an MS Project-style split grid and Gantt with dense rows, at 600+ rows. Commercial Gantt libraries (Bryntum, DHTMLX Pro) cost per developer and limit visual control. Fluent 2 is familiar but heavy and hard to bend. Ant Design looks like every admin panel.

## Decision
- Radix primitives + Tailwind, with shadcn/ui-style components owned in the repo and Keel design tokens (light default, dark supported, WCAG AA).
- TanStack Table + TanStack Virtual for the grid.
- A custom, virtualized SVG Gantt that shares row virtualization with the grid.

## Consequences
- More up-front work on the Gantt (drag, link, zoom, critical path, baselines), which is also a showcase piece.
- No licensing cost, and full control over the design.
