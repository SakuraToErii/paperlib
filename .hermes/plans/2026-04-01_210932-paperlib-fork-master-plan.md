# Paperlib Fork Next-Phase Master Plan

> **For Hermes:** this is the canonical planning document for the next development stages of the Obsidian-style folder/graph/relation fork. Use this as the primary recall document before delegating future implementation work. Execute with subagent-driven-development in reviewed slices. Do not assume undocumented behavior.

**Plan date:** 2026-04-01 21:09:32
**Repo:** `/Users/komorex/Develop/paperlib`
**Branch:** `feat/obsidian-folder-graph`

**Goal:** evolve the current fork from a working feature branch into a stable, testable, long-lived Paperlib variant where folders map to the real local filesystem, paper relations are a first-class capability, and graph view becomes a usable exploration surface consistent with the existing app.

**Architecture:** keep local-library folders under `appLibFolder` as the canonical source for folder topology in local mode; keep paper relations persisted on `Entity.relatedPaperIds` with symmetric service-level writes and cleanup semantics; keep graph rendering derived from the same filtered `paperEntities` dataset used by list/table, with directional arrows and color/size encoding resolved at render time rather than stored redundantly.

**Tech Stack:** Electron, Vue 3, TypeScript, Realm, existing Paperlib services/repositories, graph utilities in renderer, Playwright/Vitest-based repo test surface, local git workflow only.

---

## 1. Current State Snapshot

The following work is already implemented on this branch and should be treated as the starting baseline, not as future scope:

- Local folder synchronization with the real library tree has been added.
- Folder queries are recursive in the Obsidian-style sense.
- Paper relations exist and can be edited from the detail panel.
- Graph view exists and is connected to the main paper view.
- Graph arrows follow publication-time ordering.
- Node size is tied to relation count.
- Graph color families derive from folder families.
- UI and interaction polish has already been applied to graph view and related-papers workflows.
- Relation sync semantics have been integrated into the existing paper update replay path.
- README and README_zhCN now include local test instructions for this fork.

Recent local commits for baseline context:
- `a855213` docs: add local testing guide for fork
- `70de830` Refine graph view interactions
- `a935271` Harden folder and relation semantics
- `0adc75c` Refine related papers detail panel UX
- `7f9d05e` fix: unify relation updates with sync replay
- `a252d3d` fix: harden folder sync and relation updates
- `fa4cd84` feat: add local folder sync and paper graph view
- `a2c821e` docs: add obsidian folder graph implementation plan

This means the next phase should focus on contract freezing, capability hardening, batch workflows, testing, performance safety, migration safety, and product polish — not re-implementing the original MVP.

---

## 2. Product Workstreams

These are the user-facing workstreams that define how the fork should evolve.

### Workstream A: 文件夹即真实空间

**Goal**
- Make users understand sidebar folders as real local directories, not a second abstract classification system.

**Why it matters**
- This is the conceptual foundation for the fork.
- If folder semantics are ambiguous, graph and relation semantics become harder to trust.

**Next focus areas**
- Improve feedback for folder create/rename/move/delete.
- Make empty-folder deletion vs non-empty-folder blocking explicit and explainable.
- Continue refining recursive inclusion behavior when selecting a parent folder.
- Improve clarity around root-level behavior and drag-drop outcomes.

**Primary acceptance criteria**
- Folder operations always reflect real local directory changes in local mode.
- Selecting a parent folder includes descendants consistently.
- Managed paper files stay aligned with canonical folder membership.
- Non-empty folder deletion never silently fails.

**Best-fit subagents**
- Product/UI subagent
- Service semantics subagent
- QA subagent

### Workstream B: 论文关系闭环

**Goal**
- Make paper relation management complete and dependable even without using graph view.

**Why it matters**
- Relations are useful on their own and should not depend on the graph to feel first-class.

**Next focus areas**
- Batch relate / unrelate operations for selected papers.
- Better relation picker / relation search UX.
- Stronger regression coverage for cleanup when deleting papers.
- Clarify relation semantics in UI copy where necessary.

**Primary acceptance criteria**
- Single-paper and multi-paper relation operations are symmetric and predictable.
- Duplicate relations never accumulate.
- Deleting a paper leaves no dangling reverse relations.
- Related papers UI remains understandable under empty/loading/error states.

**Best-fit subagents**
- Relation service subagent
- Detail-panel UI subagent
- QA subagent

### Workstream C: 图谱视图作为结果浏览器

**Goal**
- Keep graph as another visualization of the current filtered result set, not a detached subsystem.

**Why it matters**
- This preserves product coherence and keeps filters/search/folders as the main navigation model.

**Next focus areas**
- Neighborhood filtering.
- “Show current paper subgraph” mode.
- Smarter label display strategy.
- Large-graph degradation behavior.

**Primary acceptance criteria**
- Graph always honors the active search/query/folder scope.
- Users can reduce noise and focus on meaningful subgraphs.
- Graph remains usable when the paper set grows.
- Selection/open/detail behavior stays aligned with list/table views.

**Best-fit subagents**
- Graph renderer subagent
- Graph UX subagent
- Performance subagent

### Workstream D: 图谱可理解性与可配置性

**Goal**
- Make graph encodings immediately understandable: color = folder family, size = relation count, direction = time ordering.

**Why it matters**
- If users cannot interpret the graph quickly, the feature remains visually impressive but operationally weak.

**Next focus areas**
- Further stabilize default color-family assignment.
- Add user-defined color mapping/palette overrides.
- Improve legend and explanatory microcopy.
- Ensure visual consistency across light/dark themes.

**Primary acceptance criteria**
- Default graph colors stay stable across refreshes/restarts.
- Users can override defaults without breaking readability.
- Legend/microcopy explain graph rules clearly.
- Theme switching does not degrade contrast or affordances.

**Best-fit subagents**
- UX/visual subagent
- Preferences/settings subagent

### Workstream E: 系统反馈与容错

**Goal**
- Ensure every key action provides clear feedback, explains failure modes, and degrades safely.

**Why it matters**
- Filesystem-backed behavior and relation semantics can feel risky without explicit system feedback.

**Next focus areas**
- Empty states
- Disabled states
- Error feedback
- Success notifications
- Explicit local vs non-local backend degradation messaging

**Primary acceptance criteria**
- No important action fails silently.
- Unsupported or risky actions are blocked or explained before execution.
- Empty states are tailored, not generic.
- Non-local limitations are visible and predictable.

**Best-fit subagents**
- UX copy subagent
- Service boundary-handling subagent
- QA subagent

---

## 3. Technical Streams

These technical streams define how engineering work should be organized.

### Stream 1: Backend / Service / Data Model

**Priority:** highest

**Responsibilities**
- `relatedPaperIds` persistence and consistency
- symmetric relation writes, deduplication, idempotence
- reverse-relation cleanup on paper deletion
- canonical folder-membership semantics
- sync log / replay / cache consistency

**Typical file scope**
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/base/folder.ts`
- related repository / model / migration files

**Preferred subagent roles**
- Data-model subagent
- Paper-service subagent
- Folder/file-service subagent

### Stream 2: Renderer / UI

**Responsibilities**
- unify graph/list/table behavior
- graph component interactions
- related-papers editing flow in detail panel
- menu/context-menu integration
- locale and copy completion

**Typical file scope**
- `app/renderer/ui/main-view/data-view/components/graph-view/*`
- `app/renderer/ui/main-view/detail-view/components/related-papers.vue`
- `app/renderer/ui/main-view/detail-view/paper-detail-view.vue`
- `app/renderer/ui/main-view/menubar-view/window-menu-bar.vue`
- `app/locales/locales/*.json`

**Preferred subagent roles**
- Graph UI subagent
- Detail-panel subagent
- Menu/command subagent

### Stream 3: Testing / QA

**Responsibilities**
- folder utility tests
- relation correctness tests
- graph utility tests
- service integration tests
- smoke E2E coverage

**Key validation targets**
- old DB can still open after migration
- relation symmetry and cleanup
- recursive folder query behavior
- graph-view switching main path
- local folder operations do not break managed files

**Preferred subagent roles**
- Unit-test subagent
- Service integration-test subagent
- E2E subagent

### Stream 4: Performance / Observability

**Responsibilities**
- graph build-time measurement
- folder sync timing and scale measurement
- relation batch-write optimization
- large-graph degradation strategy
- critical logging and diagnostics

**Preferred subagent roles**
- Service performance subagent
- Graph performance subagent
- Logging/diagnostics subagent

### Stream 5: Migration / Backward Compatibility

**Responsibilities**
- Realm migration strategy
- legacy folder-data normalization
- default compatibility for missing `relatedPaperIds`
- local vs WebDAV boundary handling
- preference/default-value compatibility

**Preferred subagent roles**
- Migration subagent
- Backward-compat subagent
- Storage-semantics subagent

---

## 4. Delegation Structure

Use the following long-lived conceptual structure in future implementation rounds.

### Controller / 总控智能体

**Role:** Hermes main session

**Responsibilities**
- maintain the master plan
- prioritize streams and phases
- freeze contracts before broad parallel implementation
- dispatch subagents with exact task context
- gather review results and decide merge order
- perform final acceptance and user-facing summaries

### Stream A Owner: 服务与数据主干

**Responsibilities**
- protect folder / relation / sync semantics
- define service-level contracts for UI consumers

### Stream B Owner: UI / 交互

**Responsibilities**
- own graph interactions, detail panel, menu entry points, and feedback states

### Stream C Owner: 测试 / QA

**Responsibilities**
- turn high-risk paths into repeatable regression checks

### Stream D Owner: 性能 / 可观测性

**Responsibilities**
- prevent large libraries from degrading graph/folder behavior unacceptably

### Stream E Owner: 迁移 / 向后兼容

**Responsibilities**
- guard upgrades, old data, and backend-boundary behavior

### Release / Review Subagent

**Responsibilities**
- typecheck
- smoke test
- code review
- merge-readiness judgment
- release-note/checklist preparation if needed

---

## 5. Execution Order

The recommended order remains phase-based.

### Phase 1: 契约冻结

This phase should happen before any broad next-step implementation.

**Objectives**
- freeze service/data/migration contracts
- clarify local vs non-local boundaries
- freeze canonical folder semantics
- freeze relation API semantics

**Deliverables**
- a written contract note for folder semantics
- a written contract note for relation APIs and invariants
- a written contract note for migration/backward-compat expectations
- a concrete Phase 1 task list ready for subagent execution

**Why first**
- Prevents UI, tests, and performance work from building on shifting assumptions.

### Phase 2: 并行开发

**Objectives**
- service/data hardening
- UI integration and interaction enhancements
- simultaneous test additions
- profiling/diagnostics on key paths

**Parallel tracks**
- Stream A hardens APIs and invariants
- Stream B wires graph / relation / menu UX
- Stream C adds test coverage in parallel
- Stream D profiles and adds large-data guardrails
- Stream E validates migration and compatibility assumptions

### Phase 3: 交互与回归补强

**Objectives**
- batch relation workflows
- graph neighborhood filtering
- richer feedback/empty/error states
- large-graph protection
- restart/upgrade regression validation

### Phase 4: 准发布整理

**Objectives**
- full typecheck
- smoke test
- migration/open-existing-library validation
- real local usage test
- README / docs / changelog / handoff updates

---

## 6. Phase 1 Detailed Plan: Contract Freeze

This is the next execution target after this master plan is recorded.

### Phase 1 Scope

Phase 1 is not about major feature expansion. It is about stabilizing assumptions and making future delegation safe.

### Phase 1 Contract Areas

#### Contract A: Relation API and invariants

**Questions to answer and freeze**
- What is the exact behavior of `setRelatedPaperIds`, `addRelatedPapers`, `removeRelatedPapers`?
- What is the exact behavior for batch relation creation/removal among selected papers?
- Must relation updates always be symmetric? (expected answer: yes)
- What deduplication and idempotence guarantees are required?
- What happens when deleting a paper with relations?
- What sync-log payload shape should be treated as canonical for relation updates?

**Expected outcome**
- a clear invariant list that service/UI/QA can all use

#### Contract B: Folder canonical semantics

**Questions to answer and freeze**
- What exactly counts as a canonical paper folder membership in local mode?
- When should a paper’s folder membership be replaced vs appended?
- How should parent-folder recursive selection behave in queries?
- What filesystem operations are supported in local mode?
- What exact limitations apply in non-local / WebDAV mode?
- Which service owns resync responsibility after create/rename/move/delete?

**Expected outcome**
- a single source of truth for folder semantics that prevents “group vs folder” drift

#### Contract C: Migration and backward compatibility

**Questions to answer and freeze**
- What happens when existing DB entities do not have `relatedPaperIds`?
- What happens when existing folder data is inconsistent with current local directory topology?
- What startup-time migration/reconcile behavior is acceptable?
- Which behaviors are local-only and should be documented as such?
- What preference defaults must be retained for existing users?

**Expected outcome**
- a migration/backward-compat checklist that must pass before later phases are called done

### Phase 1 Suggested Implementation Slices

These are the first slices to delegate after plan approval.

#### Slice 1: Write the contract notes into repo documentation

**Objective**
- Record the frozen semantics in a durable document so future implementation/review uses the same source.

**Likely files**
- Create or update a plan/contract document under `docs/plans/`
- Possibly add a shorter operator-facing note under `.hermes/plans/` if useful for agent control

**Validation**
- Document clearly states invariants, exclusions, and backend boundaries.

#### Slice 2: Audit current service code against the frozen contracts

**Objective**
- Compare current branch behavior with the written contract and identify mismatches.

**Likely files to inspect**
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/service/services/sync-service.ts`
- `app/base/folder.ts`

**Validation**
- Produce a concrete mismatch list with severity and file locations.

#### Slice 3: Fix contract mismatches in the service layer

**Objective**
- Close the gap between intended semantics and current implementation before more UI work lands.

**Likely files to change**
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/service/services/sync-service.ts`
- related repository/model files if needed

**Validation**
- `pnpm run typecheck`
- targeted regression checks for relation symmetry and folder behavior

#### Slice 4: Add minimum regression tests for frozen contracts

**Objective**
- Ensure the most important invariants are executable checks, not just documentation.

**Likely file targets**
- test files under `tests/` or repo-supported unit/integration locations
- possible utility tests for `app/base/folder.ts`
- possible utility tests for graph/relation helpers

**Validation**
- tests pass locally
- at minimum cover relation symmetry, recursive folder query, and deletion cleanup

---

## 7. Priority Backlog After Phase 1

After contract freeze, the recommended first product-value backlog is:

1. Batch relation editing
- High leverage for relation workflows
- Strongly aligned with existing service semantics work

2. Graph neighborhood filtering / current-paper subgraph mode
- Biggest usability gain for graph without huge architectural churn

3. Test coverage expansion
- relation symmetry
- recursive folder query
- graph main-path smoke
- delete cleanup behavior

4. Graph readability improvements
- label strategy
- large-graph degradation
- legend/help text improvements

5. Folder-feedback and backend-boundary polish
- clearer error/success states
- explicit non-local limitations

---

## 8. Validation and Release Gates

Every future implementation round should explicitly validate the following before being considered complete.

### Core validation checklist
- `pnpm run typecheck`
- relation edits remain symmetric and deduplicated
- deleting related papers leaves no dangling relations
- folder selection remains recursive
- folder operations reflect real local filesystem behavior in local mode
- graph honors active query/search/folder filters
- graph node size and direction rules remain intact
- tags remain independent from folder semantics
- restart behavior preserves folder/relation/graph consistency

### Release-readiness checklist
- no unresolved critical review issues
- local usage test path completed using the README checklist
- migration/backward-compat assumptions reviewed explicitly
- docs updated if semantics changed

---

## 9. Risks and Guardrails

### Key risks
- Schema or migration drift causing startup/open-library problems
- Silent mismatch between displayed folder topology and actual file locations
- Relation writes becoming asymmetric under edge cases or deletes
- Graph becoming unusable for larger libraries
- WebDAV or non-local modes misleading users about what is truly supported

### Guardrails
- Renderer must not invent folder/relation semantics on its own; it should consume service contracts.
- Arrow direction should remain a derived graph concern, not stored redundantly in DB.
- Large new work should not proceed until contract mismatches are identified.
- Any discovered contract gap should be reflected back into this master plan or a linked contract note.

---

## 10. How Hermes Should Use This Plan Later

When revisiting this repo in a future session:

1. Read this file first.
2. Confirm current branch and recent commits.
3. Determine whether the task belongs to Phase 1, 2, 3, or 4.
4. If implementation is requested, use subagent-driven-development:
   - one implementer subagent per slice
   - spec-compliance review
   - code-quality review
5. Update this plan or linked plan docs whenever the frozen contract changes.

---

## 11. Immediate Next Action

The next approved step after recording this plan is:
- execute Phase 1 in plan mode via delegated subagents
- specifically: produce contract documents, audit current implementation against those contracts, then begin the Phase 1 service/test hardening loop
