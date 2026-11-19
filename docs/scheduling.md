# Scheduling engine

Lives in `src/domain/scheduling/`. Pure TypeScript with no React and no I/O. It must be deterministic: the same input always gives the same output. Recompute is a full pass on every change. 600 nodes is trivial, and the budget is < 50 ms.

## 1. Time model

- The unit is the **working half-day slot**. Each working day has two slots (AM, PM). Non-working days have none.
- The calendar maps **date ↔ slot index**. Slot 0 is the AM of the program's first working day.
- Times are **boundaries** between slots. An item with start boundary `s` and duration `d` occupies slots `[s, s+d)` and has finish boundary `f = s + d`.
- Display:
  - Start date = `date(slot s)`
  - Finish date = `date(slot f−1)` for `d > 0`
  - Milestone or gate (`d = 0`) date = `date(slot s−1)`, i.e. the end of the predecessor's last half-day. When `s = 0` it is `date(slot 0)`.
- `Calendar.workWeek` + `holidays` define working days. Titan-1 uses a 6-day week (Mon–Sat). Lumen uses Mon–Fri.
- Helpers (all unit-tested): `toSlot(date, 'start'|'finish')`, `toDate(boundary, 'start'|'finish'|'milestone')`, `addWorkingDays(date, n)`, `workingDaysBetween(a, b)`, `calendarDaysToDate(date, n)` (for supplier lead times).

## 2. Graph

- **Nodes:** leaf schedulable items (task, milestone, gate), **procurement items** (§5), and **agile workstream delivery nodes** (§6).
- **Edges:** relations of kind `FS` and `SS` with `lagHalfDays` (may be negative = lead).
- **Summary (parent) items are not nodes.** Their span is computed from their children (min ES → max EF; same for LS/LF and baselines). In v1, dependencies **to or from summary items are rejected** (`ValidationError`). The UI offers "link to first/last child" instead.
- Cycle detection uses a topological sort (Kahn). On a cycle, throw `CycleError` with the cycle path so the UI can highlight it.

## 3. Forward pass (early dates)

For each node in topological order:

```
candidates = [0]                                         // program start
for each FS pred p with lag L:  candidates.push(EF(p) + L)
for each SS pred p with lag L:  candidates.push(ES(p) + L)
if snet:                        candidates.push(toSlot(snet, 'start'))
ES = max(candidates)
if pinned:                      ES = toSlot(pinned.start, 'start')   // overrides; flag conflict if < max(candidates)
EF = ES + duration
```

Pinned conflicts produce a `ScheduleWarning { itemId, kind: 'pin_violates_dependency', bySlots }`. The UI shows these as red link arrows.

## 4. Backward pass (late dates) and float

```
projectFinish = max(EF over all nodes)
for each node in reverse topological order:
  candidates = [projectFinish]
  if deadline:                    candidates.push(toSlot(deadline, 'finish'))
  for each FS succ s with lag L:  candidates.push(LS(s) − L)
  for each SS succ s with lag L:  candidates.push(LS(s) − L + duration)
  LF = min(candidates)
  LS = LF − duration
totalFloat = LS − ES          // half-days; may be negative (missed deadline)
critical   = totalFloat <= 0
```

A deadline earlier than the early finish gives negative float on the milestone and everything driving it. That's how "Energization gate misses its contractual date by 6 days" shows up.

The **critical path** is the set of critical nodes. The Gantt highlights them and the edges between two critical nodes whose constraint is *driving* (`ES(s) == EF(p) + L` for FS, `ES(s) == ES(p) + L` for SS).

## 5. Procurement nodes

A procurement item is a **fixed-date node** representing delivery:

- `deliveryBoundary = toSlot(expectedDelivery ?? (orderedOn ?? today) + leadTimeDays, 'start')`. Lead times are calendar days.
- It acts like a pinned milestone at `deliveryBoundary`, and its successors (install tasks, linked FS) are constrained by it.
- Computed fields:
  - **needBy** = `toDate(LS, 'start')`, the latest delivery that doesn't push any deadline or the program finish
  - **orderBy** = `needBy − leadTimeDays` (calendar days)
  - **floatDays** = working days between delivery and needBy (negative = delivery is late and is delaying the plan)
- RAG: green if float ≥ 10 working days, amber if 0–9, red if < 0 or `deliveryStatus = 'delayed'` with no new date.

## 6. Agile delivery nodes

Each `mode: 'agile'` workstream contributes one virtual node `wst_<id>:delivery` with zero duration at its **projected finish** (§8). Relations may use the workstream id as `fromId` (FS only). So a sprint slip moves the release milestone through the normal CPM pass.

## 7. Earned value (EVM)

As of date `t` (default: today), per item `i` with budget `BACᵢ`:

| Measure | Definition |
|---|---|
| **BAC** | Σ `budgetCents` of cost-loaded tasks + Σ `poValueCents` of procurement items |
| **PV(t)** | Σ BACᵢ × plannedFractionᵢ(t), where plannedFraction is linear over the item's **baseline** working slots (0 before start, 1 after finish) |
| **EV(t)** | Σ BACᵢ × percentCompleteᵢ / 100 |
| **AC(t)** | Σ `CostEntry.amountCents` where `kind = 'actual'` and `date ≤ t` |
| **CPI** | EV / AC (null if AC = 0) |
| **SPI** | EV / PV (null if PV = 0) |
| **EAC** | BAC / CPI (BAC if CPI null) |
| **ETC** | EAC − AC |
| **VAC** | BAC − EAC |

Committed cost = Σ `kind = 'commitment'`. The budget view shows BAC, committed, actual, EAC per workstream. Tiles use thresholds: green ≥ 0.98, amber 0.90–0.98, red < 0.90 (for CPI and SPI).

## 8. Agile projection

```
closed     = last 3 closed sprints (fewer if not available)
velocity   = mean(completedPoints of closed) || active.committedPoints
remaining  = Σ points of backlog items not done + remaining points of the active sprint
afterActive = max(0, remaining − activeRemaining)
projectedFinish = active.end + ceil(afterActive / velocity) × sprintLength   (working days)
```

Burndown comes from `Sprint.burndown` (seeded in the demo, appended on item status changes).

## 9. Baselines and variance

- `setBaseline` snapshots `{start, finish, budgetCents}` for all nodes (summaries included).
- Variance in working days: `startVar = ES − baselineStart`, `finishVar = EF − baselineFinish`. Positive means late.
- Rebaselining happens **only** through an approved change request (or by the PM with an explicit reason). Older baselines are kept and selectable in "Compare to…".

## 10. RAG roll-up

- Item (schedulable): **red** if float < 0, or blocked on the critical path. **Amber** if float < 10 half-days (5 days), or the latest check-in is `at_risk`. Otherwise **green**. A manual `rag` overrides it, shown with an "overridden" marker.
- Summary, workstream and program: the worst child among critical items. Otherwise amber if > 20% of children are amber or worse. Otherwise green.

## 11. Workload

Per person per ISO week: `load = Σ allocationPct × (task working slots in week / working slots in week)`. A load over 100% is overallocated (heatmap red). Agile items count by sprint: points-weighted share of the person's capacity, approximate and labelled as such.

## 12. Impact preview (for proposals and change requests)

`impact(state, changes)`:
1. Clone state and apply `changes`.
2. Re-run schedule, RAG and EVM.
3. Diff against current: moved items (start/finish deltas), newly critical items, RAG transitions, milestone slips (working days), cost delta, CPI/SPI/EAC before → after.

This is deterministic code. **The model never computes impact.**

## 13. Required tests

| Area | Cases |
|---|---|
| Calendar | 5- and 6-day weeks; holidays; half-day durations; milestone display date; slot↔date round-trip across year boundary |
| Forward pass | FS, SS, positive/negative lag, multiple preds (max wins), SNET, pin overriding and the pin-conflict warning |
| Backward pass | project-finish anchoring, deadlines → negative float, SS backward formula, float on parallel paths |
| Critical path | single path, two equal-length paths (both critical), driving-edge detection |
| Graph | cycle detection with path; summary-dependency rejection |
| Procurement | delivery from lead time vs. expected date; needBy/orderBy; negative float propagation |
| Agile | velocity from 0/1/3 closed sprints; projection; delivery node moving a milestone |
| EVM | PV linear interpolation, EV, AC cutoff, CPI/SPI null guards, EAC/ETC/VAC |
| Baseline | variance signs; rebaseline keeps history |
| Impact | slip on critical vs. non-critical item; float absorbing a slip; RAG transitions |
| MSPDI | import of seed Titan plan (task count, relation count, durations); export → import round-trip equality |
| Performance | 600-node random DAG recompute < 50 ms (benchmark test) |
