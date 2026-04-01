# Phase 1 Contract-Freeze Plan for Paperlib Fork

> **For Hermes:** this is the execution plan for Phase 1 only. Use subagent-driven-development. For every implementation slice, use a fresh implementer subagent, then a spec-compliance reviewer, then a code-quality reviewer. Do not skip review loops. This phase is allowed to produce documentation and code changes because its goal is to freeze contracts in writing and align implementation with those contracts.

**Parent plan:** `.hermes/plans/2026-04-01_210932-paperlib-fork-master-plan.md`
**Plan date:** 2026-04-01 21:13:31
**Repo:** `/Users/komorex/Develop/paperlib`
**Branch:** `feat/obsidian-folder-graph`

**Goal:** produce a durable, repo-grounded contract for folder semantics, relation semantics, sync semantics, and migration/backward-compat boundaries; audit current code against that contract; close the most important mismatches; and add minimum regression coverage so later parallel development can proceed safely.

**Architecture:** Phase 1 treats contracts as first-class deliverables. The service layer remains the source of truth for folder/relation behavior, the renderer consumes those contracts, and tests encode the highest-risk invariants. The work is deliberately front-loaded into documentation, audit, and low-risk hardening rather than new feature breadth.

**Tech Stack:** Electron, Vue 3, TypeScript, Realm, existing Paperlib services/repositories, local git only, repo test/typecheck commands.

---

## 1. Why Phase 1 Exists

The current branch already has a working MVP-plus implementation for:
- local folder mirroring
- recursive folder selection
- related papers
- graph view
- graph styling/interaction polish
- sync replay handling for relation updates

That is enough to make future work dangerous if assumptions remain implicit. The next steps involve batch relation edits, graph neighborhood filtering, larger-graph handling, migration safety, and broader QA. Without a frozen contract, every future stream could drift:
- UI may assume relation behavior that service code does not guarantee.
- Tests may encode expectations that migration code does not preserve.
- Folder behavior may regress toward the old “group” mental model.
- Non-local backends may appear to support semantics they cannot actually guarantee.

Phase 1 therefore exists to make the rules explicit, verify current code against them, and add enough guardrails that Phase 2 can safely parallelize.

---

## 2. Phase 1 Deliverables

At the end of Phase 1, the branch should have the following deliverables.

### D1. Contract documentation
A durable written contract covering:
- canonical folder semantics in local mode
- relation API semantics and invariants
- sync-log and replay semantics for relation changes
- migration/backward-compat expectations
- local vs non-local backend boundaries

### D2. Audit report
A concrete repo-specific audit that answers:
- which parts of the current implementation already satisfy the contract
- which parts partially satisfy it
- which mismatches exist
- which mismatches are critical vs important vs minor

### D3. Contract-alignment fixes
Implementation changes limited to the most important gaps that would otherwise poison later development, especially in service/data/sync code.

### D4. Minimum regression coverage
A first set of tests or executable validation paths covering the highest-risk contract invariants.

### D5. Phase 2 readiness note
A short note stating whether the branch is ready to proceed into broad parallel work, plus any remaining known limitations.

---

## 3. Frozen Contract Areas

These are the contract areas Phase 1 must explicitly settle.

### Contract Area A: Folder canonical semantics

**Purpose**
- Prevent regression from “folder = real directory” back into “folder = legacy grouping field with filesystem flavor”.

**Rules to freeze**
1. In local mode, the folder tree shown in the sidebar represents the real directory structure under `appLibFolder`.
2. A paper has one canonical filesystem-backed folder membership in local mode.
3. Folder membership should be replaced, not appended, when a paper is moved between folders in the managed local-library workflow.
4. Selecting a folder in queries includes descendants by exact-or-prefix semantics.
5. Tags remain independent and must not be coerced into folder semantics.
6. Folder create/rename/move/delete operations in local mode must act on real directories, then resync the mirrored folder tree.
7. Non-empty folder deletion must be blocked and explained.
8. Non-local backends must not pretend to support local filesystem mirroring if they cannot guarantee it.

**Questions Phase 1 must answer explicitly**
- What is the precise behavior for root-level papers?
- What happens if a paper’s stored folder membership and actual managed path disagree?
- Which service owns the final reconcile step after file moves/renames?
- Which operations are local-only and how should unsupported cases surface?

### Contract Area B: Relation API semantics and invariants

**Purpose**
- Make related papers reliable enough to support batch workflows, graph filtering, and long-term data integrity.

**Rules to freeze**
1. Relations are symmetric.
2. Relations are deduplicated.
3. Relation operations are idempotent where feasible.
4. A paper cannot relate to itself.
5. Deleting a paper removes reverse references from remaining papers.
6. Single-paper and batch relation operations must reuse the same invariants.
7. The renderer should call service APIs rather than modifying relation arrays ad hoc.

**Questions Phase 1 must answer explicitly**
- What is the canonical meaning of `setRelatedPaperIds` vs `addRelatedPapers` vs `removeRelatedPapers`?
- What exactly does `relateSelectedPapers(ids)` mean — all-to-all clique or anchor-based relation?
- What exactly does `unrelateSelectedPapers(ids)` remove?
- What should happen if some selected ids are invalid, duplicated, or deleted during the operation?

### Contract Area C: Sync-log and replay semantics

**Purpose**
- Ensure relation updates are not special-case DB mutations that drift away from the app’s sync story.

**Rules to freeze**
1. Relation updates that should participate in sync/replay must use a canonical sync-log payload shape.
2. Replay must distinguish relation updates from ordinary paper-draft updates.
3. Replay must avoid duplicate sync-log emission.
4. No relation replay path may violate the symmetric-update invariant.

**Questions Phase 1 must answer explicitly**
- What payload shape is canonical for relation updates?
- Which operations must emit sync logs, and which are replay-only or internal-only?
- How should batch relation operations be represented in sync semantics?

### Contract Area D: Migration and backward compatibility

**Purpose**
- Keep existing libraries openable and future changes safe.

**Rules to freeze**
1. Missing `relatedPaperIds` on older entities must not break startup or access.
2. Existing folder data inconsistent with current local topology must be reconciled predictably.
3. Startup migration and reconcile behavior must be idempotent.
4. Existing non-local setups must degrade clearly rather than silently misbehaving.
5. Existing preferences should keep safe defaults if new graph-related options are absent.

**Questions Phase 1 must answer explicitly**
- Which inconsistencies should be auto-fixed vs merely detected/logged?
- What is the minimum acceptable migration path for older DBs?
- Which future changes would require a schema-version bump versus service-level reconcile only?

---

## 4. Phase 1 Work Breakdown

Phase 1 is split into five implementation slices. These slices are designed for subagent-driven development and review.

### Slice 1: Write explicit contract documents

**Objective:** record the canonical semantics in repo-visible documentation so future work has a stable source of truth.

**Files**
- Create or modify: `docs/plans/` documents for Phase 1 contracts
- Optionally update the master plan if wording must be aligned

**Subagent type**
- Documentation/architecture subagent

**Outputs**
- One contract note or a small set of contract notes covering folder, relation, sync, and migration semantics
- Crisp invariant lists and backend-boundary notes

**Verification**
- Document includes exact invariants, exclusions, and unresolved questions
- Contract language is repo-specific, not generic

### Slice 2: Audit current implementation against the contract

**Objective:** compare current code behavior to the written contract and classify mismatches.

**Files to inspect**
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/service/services/sync-service.ts`
- `app/base/folder.ts`
- relevant repository/model/migration files
- relevant renderer callers if they bypass service contracts

**Subagent type**
- Architecture/code-audit subagent

**Outputs**
- Audit report with sections:
  - already compliant
  - partially compliant
  - non-compliant
  - open questions
- Severity tags:
  - Critical: blocks Phase 2
  - Important: should fix in Phase 1 if low/medium effort
  - Minor: can defer to Phase 2+

**Verification**
- Every mismatch cites file paths and approximate code locations
- Report distinguishes contract gaps from stylistic preferences

### Slice 3: Close critical and selected important service-layer mismatches

**Objective:** fix the implementation gaps that would undermine future parallel work.

**Likely files**
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/service/services/sync-service.ts`
- supporting repository/model files if required

**Subagent type**
- Service/data implementer subagent

**Scope constraints**
- Prefer low-risk alignment fixes over speculative refactors
- Do not expand product scope beyond the frozen contracts
- Avoid UI work unless needed to stop contract violation at the caller boundary

**Verification**
- `pnpm run typecheck`
- targeted validation of relation symmetry, deletion cleanup, and folder reconcile semantics

### Slice 4: Add minimum regression coverage for frozen invariants

**Objective:** encode the highest-risk behaviors as tests or executable regression checks.

**Likely file targets**
- test files under `tests/`
- utility test targets for `app/base/folder.ts`
- service/integration test targets where relation invariants are easiest to validate

**Subagent type**
- QA/test subagent

**Minimum desired coverage**
1. Recursive folder query behavior
2. Relation symmetry and deduplication
3. Deletion cleanup for related papers
4. Contract-safe handling of missing/legacy `relatedPaperIds`
5. If practical, one smoke path covering graph/list/table consistency assumptions

**Verification**
- tests run successfully in repo-supported ways
- test names and assertions clearly encode contract expectations

### Slice 5: Write Phase 1 readiness summary

**Objective:** summarize what is now frozen, what was fixed, what remains deferred, and whether Phase 2 can begin.

**Files**
- Update or create a short readiness note in `docs/plans/` or `.hermes/plans/`

**Subagent type**
- Release/review subagent

**Outputs**
- readiness verdict
- remaining known limitations
- explicit handoff notes for Phase 2 stream owners

**Verification**
- Summary references actual contract docs, audit findings, and completed fixes/tests

---

## 5. Review Workflow Per Slice

Each slice must use the following sequence.

### Step A: Implementer / author subagent
The implementer writes the document, audit, code, or tests for that slice.

### Step B: Spec-compliance reviewer
The reviewer checks only whether the slice satisfies the exact plan objective and output requirements.
- If it fails, the slice returns to an implementer/fix subagent.
- Do not proceed to quality review until spec compliance passes.

### Step C: Code-quality / artifact-quality reviewer
The reviewer checks clarity, maintainability, correctness, missed edge cases, and risks.
- Critical issues must be fixed.
- Important issues should be fixed if the effort is reasonable within Phase 1 scope.

### Step D: Controller decision
Hermes main session decides whether the slice is complete and updates the todo list.

---

## 6. Concrete Task List for Delegation

These are the exact Phase 1 tasks I should delegate next.

### Task P1-1: Draft folder/relation/sync/migration contract note

**Objective:** create a single durable contract document for Phase 1.

**Files:**
- Create: `docs/plans/2026-04-01-phase1-contract-freeze.md` or similar

**Must include:**
- folder canonical semantics
- relation API definitions
- sync-log/replay semantics for relation changes
- migration/backward-compat boundaries
- local vs non-local behavior table

**Validation:**
- contract document is specific enough that future subagents can implement against it without guessing

### Task P1-2: Audit service and model code against the contract

**Objective:** identify mismatches between current branch behavior and the new contract document.

**Files to inspect:**
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/service/services/sync-service.ts`
- `app/base/folder.ts`
- relevant repository/model/migration files

**Validation:**
- audit report with severity, file references, and recommended fixes

### Task P1-3: Fix critical contract mismatches

**Objective:** correct the highest-risk behavior gaps found in P1-2.

**Likely files:**
- service/model/repository files from the audit

**Validation:**
- `pnpm run typecheck`
- if possible, targeted test/run commands proving the fixed contract behavior

### Task P1-4: Add minimum contract regression tests

**Objective:** make the most important Phase 1 invariants executable.

**Likely files:**
- tests for folder semantics, relation symmetry, deletion cleanup, legacy/default compatibility

**Validation:**
- repo-supported tests pass

### Task P1-5: Write Phase 1 readiness summary

**Objective:** record readiness for Phase 2 and any known deferred items.

**Validation:**
- summary clearly states go/no-go for Phase 2 parallelization

---

## 7. Likely Files by Concern Area

### Folder semantics
- `app/base/folder.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/renderer/services/querysentence-service.ts`

### Relation semantics
- `app/service/services/paper-service.ts`
- repository/model files for entity persistence
- relation-editing callers in renderer if needed

### Sync semantics
- `app/service/services/sync-service.ts`
- `app/service/services/paper-service.ts`

### Migration / backward compatibility
- entity/model/schema files
- database migration files
- preference defaults if implicated

### Testing
- `tests/` and any repo-supported unit/integration targets

---

## 8. Validation Commands

These are the expected verification commands for Phase 1 slices when code changes land.

### Required baseline
```bash
pnpm run typecheck
```

### Additional repo-supported checks when practical
```bash
pnpm run test:e2e-dev
```

Use targeted tests or narrower commands if full E2E is too heavy for a given slice, but do not skip executable validation entirely when code changes are made.

---

## 9. Risks Specific to Phase 1

### Risk 1: Over-documenting without enforcing
If contract notes are written but no audit/fixes/tests follow, the phase becomes ceremonial instead of protective.

**Mitigation**
- Require Slice 2–4, not just Slice 1.

### Risk 2: Refactor creep
A subagent may try to “clean everything up” while fixing contract mismatches.

**Mitigation**
- Keep Slice 3 focused on critical and selected important mismatches only.

### Risk 3: UI assumptions remain implicit
Even if service contracts are frozen, renderer callers may still encode hidden semantics.

**Mitigation**
- Include renderer callers in the audit when they may bypass service guarantees.

### Risk 4: Legacy/migration behavior remains under-tested
This can defer risk into later phases.

**Mitigation**
- Ensure at least one compatibility-oriented regression path in Slice 4.

---

## 10. Definition of Done for Phase 1

Phase 1 is complete only when all of the following are true:
- Contract documentation exists in the repo.
- Audit report exists and is specific.
- Critical mismatches found by the audit are fixed or explicitly justified/deferred with user-visible rationale.
- Minimum regression coverage exists for the highest-risk invariants.
- `pnpm run typecheck` passes after Phase 1 code changes.
- A readiness note states whether Phase 2 can begin and what remains deferred.

---

## 11. Immediate Execution Order

After saving this plan, the next execution order is:
1. Delegate P1-1 in plan/documentation mode.
2. Delegate P1-2 in audit mode.
3. Review both outputs.
4. Delegate P1-3 only after the audit has identified specific critical mismatches.
5. Delegate P1-4 after the service fixes are known.
6. Delegate P1-5 when the above are complete.

This preserves the intended order:
- document the contract
- audit current code
- fix gaps
- encode regressions
- declare readiness
