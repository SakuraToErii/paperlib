# Phase 2 Implementation Plan: Batch Relations + Graph Neighborhood Filtering

> **For Hermes:** execute this plan with subagent-driven-development in small reviewed slices. Use the Phase 1 contract/readiness documents as hard constraints. Do not broaden scope before the core slices below are complete and reviewed.

**Parent documents**
- `.hermes/plans/2026-04-01_210932-paperlib-fork-master-plan.md`
- `docs/plans/2026-04-01-phase1-contract-freeze.md`
- `docs/plans/2026-04-01-phase1-readiness-summary.md`

**Plan date:** 2026-04-01 21:49:47
**Repo:** `/Users/komorex/Develop/paperlib`
**Branch:** `feat/obsidian-folder-graph`

**Goal:** implement the first controlled Phase 2 feature wave by adding batch paper-relation workflows and graph neighborhood-focused browsing, while preserving the Phase 1 contracts for folder/relation/sync semantics.

**Architecture:** batch relation actions must be thin UI/service consumers of the existing relation contract, not a second relation system. Graph neighborhood filtering must remain a derived view over the current filtered `paperEntities` dataset, not a separate query engine or persistence model. Validation must extend the new Phase 1 regression anchors rather than replace them.

**Tech Stack:** Electron, Vue 3, TypeScript, Realm, existing Paperlib services/repositories, current graph renderer, Vitest-based unit tests, local git only.

---

## 1. Phase 2 Scope

This Phase 2 plan intentionally covers only the highest-value next wave:

1. Batch relation editing
- Allow selected papers to be related/unrelated in a consistent and reviewable way.
- Make the UI semantics unambiguous.
- Reuse the Phase 1 relation invariants.

2. Graph neighborhood filtering / current-paper subgraph browsing
- Reduce graph noise.
- Make graph useful for local exploration instead of only whole-result browsing.
- Preserve graph as a projection of the active filtered set.

3. QA / review support for the above
- Add focused regression coverage.
- Review the implementation against Phase 1 guardrails.

### Explicitly out of scope for this wave
- Full custom graph palette/preferences redesign
- Large-graph virtualization or major renderer rewrite
- WebDAV/non-local folder parity work
- Full sync contract expansion for folder/tag entity types
- Broad migration redesign
- Rebuilding the detail panel from scratch

---

## 2. Phase 2 Product Objectives

### Objective A: 批量 relation 编辑

Users should be able to select multiple papers and perform a batch relation action without leaving ambiguity about what it does.

**Planned semantics**
- `relateSelectedPapers(ids)` means: create an all-to-all relation set among the selected papers, filtered by Phase 1 invariants.
- `unrelateSelectedPapers(ids)` means: remove all relations among the selected papers, but do not remove their relations to papers outside the selection.

**Acceptance criteria**
- Multi-select context menu action is available in paper views where selection exists.
- Batch relate creates the expected clique among selected papers.
- Batch unrelate removes only intra-selection edges.
- No duplicate, invalid, self, or dangling relations are introduced.
- Detail panel and graph reflect the updated relations immediately after the operation.

### Objective B: 图谱邻域过滤 / 当前论文子图

Users should be able to focus the graph around a paper instead of always seeing the entire active result set.

**Planned semantics**
- Graph continues to start from the active filtered `paperEntities` set.
- A new neighborhood mode derives a subgraph from the currently selected paper.
- Initial neighborhood scope for this wave:
  - current paper only
  - current paper + direct neighbors
- Keep it simple for Phase 2. Do not add arbitrary depth controls yet unless needed by implementation ergonomics.

**Acceptance criteria**
- User can toggle between whole-result graph and focused neighborhood graph.
- When no paper is selected, the neighborhood mode explains how to activate it.
- Selection/open/detail behavior remains consistent with list/table/graph interaction rules.
- Neighborhood mode never shows nodes outside the active filtered result set.

### Objective C: 反馈与状态清晰度

These two features must include just enough feedback to avoid user confusion.

**Acceptance criteria**
- Batch relation actions show success/failure feedback.
- Disabled states are explicit when selection is insufficient.
- Neighborhood mode has clear empty/disabled states.
- Microcopy makes the action semantics understandable without reading docs.

---

## 3. Phase 2 Guardrails from Phase 1

The following rules are inherited and non-negotiable for this wave.

1. Do not redefine folder semantics.
- No Phase 2 task may alter canonical folder semantics unless a new contract update is written first.

2. Batch relation actions must reuse the Phase 1 relation contract.
- symmetry
- deduplication
- no self-links
- no dangling/nonexistent references
- deletion cleanup remains intact

3. Graph neighborhood mode must remain derived.
- No new persistence field for graph modes.
- No separate graph-only entity layer.
- No graph-specific relation storage.

4. Do not blur local vs non-local boundaries.
- This wave is about renderer/service workflows on top of existing local semantics, not backend parity expansion.

5. Any relation-write changes must extend existing tests.
- `tests/unit-tests/services/paper-relations.spec.ts` remains the anchor.

6. Any graph-helper/path-helper changes must extend corresponding tests.
- Add tests to graph utilities if new helper logic is introduced.

---

## 4. Implementation Streams for Phase 2

### Stream A: Service / relation workflow

**Purpose**
- Provide stable batch relation operations that the UI can call directly.

**Likely file targets**
- `app/service/services/paper-service.ts`
- possibly relation-related repository/helper code if needed

**Expected work**
- harden or finalize:
  - `relateSelectedPapers(ids)`
  - `unrelateSelectedPapers(ids)`
- ensure batch operations preserve Phase 1 invariants
- ensure update propagation is compatible with existing sync/replay semantics

### Stream B: UI / relation actions

**Purpose**
- Expose batch relation editing through existing Paperlib interaction surfaces.

**Likely file targets**
- `app/main/services/contextmenu-service.ts`
- `app/renderer/ui/main-view/data-view/paper-data-view.vue`
- related selection/menu files if needed
- maybe `related-papers.vue` only if it needs a post-action refresh tweak

**Expected work**
- add context-menu actions for multi-select relate/unrelate
- ensure enabled/disabled states depend on selection size
- wire UI feedback after success/failure

### Stream C: Graph neighborhood filtering

**Purpose**
- Add a focused graph mode around the selected paper without breaking the existing whole-result graph.

**Likely file targets**
- `app/renderer/ui/main-view/data-view/components/graph-view/paper-graph-view.vue`
- `app/renderer/utils/paper-graph.ts`
- possibly `paper-data-view.vue` if mode/state must be threaded down

**Expected work**
- add neighborhood derivation helper(s)
- add graph mode toggle(s)
- support empty state when no selection exists
- preserve current whole-result graph as default or easy fallback

### Stream D: QA / regression coverage

**Purpose**
- Protect the new relation and graph semantics from quiet regression.

**Likely file targets**
- `tests/unit-tests/services/paper-relations.spec.ts`
- new graph utility tests, likely under `tests/unit-tests/renderer/` or similar repo-supported path
- maybe lightweight UI smoke coverage if repo patterns support it cleanly

**Expected work**
- add tests for batch relate/unrelate semantics
- add graph neighborhood helper tests
- avoid brittle E2E unless a minimal smoke path is clearly worth it

---

## 5. Task-by-Task Plan

### Task 1: Freeze Phase 2 semantics for batch relation actions

**Objective:** make batch action semantics explicit before implementation.

**Files:**
- Update: this plan or a short linked note if needed
- Inspect: `app/service/services/paper-service.ts`

**Steps**
1. Confirm the exact meaning of `relateSelectedPapers(ids)` as all-to-all relation creation.
2. Confirm the exact meaning of `unrelateSelectedPapers(ids)` as removing only intra-selection edges.
3. Confirm behavior for duplicates, invalid ids, and small selections (`0` / `1` items).
4. Record any deviations before code changes begin.

**Validation**
- No ambiguity remains about what the UI action means.

### Task 2: Implement or harden batch relation service methods

**Objective:** ensure batch relation operations fully satisfy the Phase 1 relation contract.

**Files:**
- Modify: `app/service/services/paper-service.ts`
- Possibly inspect supporting repository logic if necessary

**Steps**
1. Review the current implementations of batch relation methods, if they already exist.
2. Align them with the explicit semantics from Task 1.
3. Keep implementation low-risk and service-centered.
4. Ensure invalid/self/nonexistent ids are filtered or safely ignored per existing contract behavior.
5. Ensure no new sync/log divergence is introduced.

**Validation**
- `pnpm run typecheck`
- target relation tests pass

### Task 3: Add batch relation UI actions

**Objective:** expose batch relation editing in existing multi-select flows.

**Files:**
- Modify: `app/main/services/contextmenu-service.ts`
- Modify: `app/renderer/ui/main-view/data-view/paper-data-view.vue`
- Possibly modify adjacent menu/selection integration files

**Steps**
1. Add multi-select context menu entries for relation actions.
2. Disable or hide actions when the selection is too small.
3. Call the service-layer batch methods.
4. Show minimal success/failure feedback.
5. Keep wording precise so users understand the action scope.

**Validation**
- selection-dependent menu behavior works
- action effects appear in detail and graph views after execution

### Task 4: Add graph neighborhood derivation helpers

**Objective:** create low-risk graph utility support for selected-paper subgraphs.

**Files:**
- Modify: `app/renderer/utils/paper-graph.ts`

**Steps**
1. Add a helper that derives a neighborhood node/edge subset from:
   - active filtered graph data
   - current selected paper id
2. Keep the initial implementation to direct-neighbor filtering only.
3. Ensure no nodes outside the active filtered result set are introduced.
4. Keep helpers pure and easy to test.

**Validation**
- helper behavior can be unit-tested independently

### Task 5: Wire neighborhood mode into graph view

**Objective:** let users switch between whole-result graph and focused neighborhood graph.

**Files:**
- Modify: `app/renderer/ui/main-view/data-view/components/graph-view/paper-graph-view.vue`
- Possibly modify: `app/renderer/ui/main-view/data-view/paper-data-view.vue`

**Steps**
1. Add a simple UI toggle or mode selector.
2. When neighborhood mode is active:
   - if a paper is selected, show selected+neighbors subgraph
   - if no paper is selected, show a clear instructional empty/disabled state
3. Preserve all existing graph interactions where possible.
4. Keep the default whole-result graph available.

**Validation**
- graph behavior remains stable in both modes
- empty/selection states are understandable

### Task 6: Add regression coverage for batch relation actions

**Objective:** ensure Phase 2 relation additions inherit the Phase 1 safety net.

**Files:**
- Modify: `tests/unit-tests/services/paper-relations.spec.ts`

**Steps**
1. Add tests for batch relate semantics.
2. Add tests for batch unrelate semantics.
3. Include edge cases for small selection and duplicate ids.
4. Keep tests grounded in the actual PaperService test harness introduced in Phase 1.

**Validation**
- targeted Vitest relation suite passes

### Task 7: Add regression coverage for graph neighborhood helpers

**Objective:** make graph neighborhood semantics executable and reviewable.

**Files:**
- Create or modify: graph utility test file under repo-supported unit-test paths
- Modify: `app/renderer/utils/paper-graph.ts` only if Task 4 introduced new helpers

**Steps**
1. Test direct-neighbor subset derivation.
2. Test “selected paper missing” behavior where applicable.
3. Test that neighborhood mode does not escape the filtered result set.
4. Test that whole-result mode behavior remains unaffected.

**Validation**
- targeted graph helper tests pass

### Task 8: Review, validate, and commit in clean slices

**Objective:** keep git history understandable and Phase 2 reviewable.

**Recommended commit slices**
- `feat: add batch paper relation actions`
- `feat: add graph neighborhood filtering`
- `test: add phase 2 relation and graph regressions`

**Validation**
- `pnpm run typecheck`
- targeted Vitest suites for relation and graph helpers
- any focused renderer/app checks that are low-risk and fast

---

## 6. Recommended Delegation Order

This is the order I should use when actually executing Phase 2.

### Round 1
1. Stream A implementer: batch relation service semantics
2. Spec reviewer for Stream A
3. Code-quality reviewer for Stream A

### Round 2
1. Stream B implementer: batch relation UI actions
2. Stream C implementer: graph neighborhood helper layer
3. Review each independently

### Round 3
1. Stream C/graph UI implementer: neighborhood mode wiring
2. Stream D implementer: relation + graph regression tests
3. Review each independently

### Round 4
1. Final integration reviewer for the whole Phase 2 slice
2. Full validation run
3. Local git commit cleanup if needed

This order keeps service semantics stable before UI wiring, and keeps graph helper logic reviewable before embedding it deeply into the component.

---

## 7. Risks for This Wave

### Risk 1: Batch relation action semantics are unclear to users
**Mitigation**
- Keep wording explicit: selected papers will all become mutually related / intra-selection relations will be removed.

### Risk 2: Graph neighborhood mode becomes a second query model
**Mitigation**
- Keep it derived from the already filtered `paperEntities` only.

### Risk 3: Batch relation actions accidentally break sync assumptions
**Mitigation**
- Reuse the existing relation service APIs and regression tests.

### Risk 4: Renderer state complexity grows too fast
**Mitigation**
- Keep neighborhood mode minimal in this wave; no deep multi-level traversal UI yet.

### Risk 5: Test brittleness from overreaching UI coverage
**Mitigation**
- Prefer service/utility tests first, only add UI smoke checks if there is a clean stable pattern.

---

## 8. Definition of Done for This Phase 2 Wave

This wave is complete only when:
- Batch relation actions work through the intended UI surface.
- Batch relation actions preserve Phase 1 invariants.
- Graph supports a focused neighborhood/current-paper mode.
- Neighborhood mode never escapes the active filtered result set.
- Tests exist for new relation and graph semantics.
- `pnpm run typecheck` passes.
- New work is reviewed against the Phase 1 guardrails.

---

## 9. Immediate Next Action

After saving this plan, the next step is to execute Phase 2 Round 1:
- implement/harden batch relation service semantics first
- review that slice
- then continue to UI wiring and graph neighborhood filtering
