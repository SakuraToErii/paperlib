# Obsidian Folder Graph Readiness Checklist

Date: 2026-04-02
Branch: `feat/obsidian-folder-graph`
Status: Conditional go
Scope: current feature-branch state in `/Users/komorex/Develop/paperlib`
Reference: `docs/plans/2026-04-01-obsidian-folder-graph.md`

## Snapshot

This branch has the core data model, service logic, graph derivation helpers, graph neighborhood mode, and targeted regression coverage expected for the Obsidian-folder-graph feature set. The branch is in a credible implementation-ready state for continued iteration rather than a final release-ready closeout.

## Implemented capabilities

- Paper relations are persisted on `Entity.relatedPaperIds`.
- Repository and migration paths initialize and normalize relation ids.
- Paper service exposes symmetric relation mutation flows, including:
  - `setRelatedPaperIds(...)`
  - `relateSelectedPapers(...)`
  - `unrelateSelectedPapers(...)`
- Relation cleanup on deletion is implemented in the repository/service path.
- Graph derivation utilities exist in `app/renderer/utils/paper-graph.ts`.
- Graph rendering semantics include:
  - unique relation edge derivation
  - publication-time-aware edge direction semantics
  - node sizing by relation count
  - folder-based color derivation using top-level folder families and subfolder shade variation
- Graph neighborhood mode is implemented in `paper-graph-view.vue` with an explicit `all | neighborhood` display mode.
- Neighborhood mode only shows the selected paper and direct neighbors from the currently derived graph dataset.
- Neighborhood mode does not silently fall back to the full graph for stale selections.
- Graph neighborhood UI strings and toggle wiring are present.

## Validation completed on this branch

Commands run successfully:

- `pnpm run typecheck`
- `pnpm vitest run tests/unit-tests/services/paper-relations.spec.ts tests/unit-tests/renderer/paper-graph.spec.ts tests/unit-tests/renderer/paper-graph-view.spec.ts tests/unit-tests/services/sync-service.spec.ts`

Observed results:

- Typecheck passed.
- 4 targeted test files passed.
- 19 targeted tests passed.
- Vitest emitted one expected stderr log from the invalid-paper-id regression case in `paper-relations.spec.ts`; the suite still passed and this appears intentional rather than a failing condition.
- Vitest also emitted a non-blocking Vite CJS deprecation notice and a stale `baseline-browser-mapping` data warning.

## Evidence anchors

Implementation and verification evidence observed in the repo:

- `app/models/entity.ts`
- `app/service/repositories/db-repository/paper-entity-repository.ts`
- `app/service/services/database/migration.ts`
- `app/service/services/paper-service.ts`
- `app/service/services/sync-service.ts`
- `app/renderer/utils/paper-graph.ts`
- `app/renderer/ui/main-view/data-view/components/graph-view/paper-graph-view.vue`
- `tests/unit-tests/services/paper-relations.spec.ts`
- `tests/unit-tests/services/sync-service.spec.ts`
- `tests/unit-tests/renderer/paper-graph.spec.ts`
- `tests/unit-tests/renderer/paper-graph-view.spec.ts`

Recent branch history also supports this readiness snapshot:

- `Improve graph mode navigation UX`
- `fix: hide empty related-paper search feedback while syncing`
- `test: cover graph folder derivation semantics`
- `docs: record phase 2 implementation plan`
- `localize graph neighborhood UI strings`

## Known limitations / remaining gaps

- This branch is not yet documented as a release-ready closeout; it reads more like an active checkpoint.
- The existing branch plan covers broader filesystem-folder mirroring goals, but this readiness snapshot only confirms the graph/relation work that is verifiable in the current branch state.
- No new consolidated review verdict document existed before this update; prior readiness notes were phase-specific and not branch-resume-oriented.
- Test validation here is targeted, not exhaustive; no full build/package validation was run as part of this task.
- Tooling warnings remain:
  - Vite Node API CJS deprecation notice
  - outdated `baseline-browser-mapping` dataset warning

## Recommended next steps

Priority 0

- Keep this readiness note updated as the branch changes.
- Preserve targeted relation/graph regressions when expanding UI behavior.

Priority 1

- Verify the remaining folder-mirroring scope from `docs/plans/2026-04-01-obsidian-folder-graph.md` against actual branch implementation status.
- Add or refresh a brief review note once the remaining folder/file operations are finalized.
- Expand targeted tests around graph interaction edge cases and cross-view selection behavior if UI iteration continues.

Priority 2

- Clean up non-blocking toolchain warnings when convenient.
- Run broader repo-supported validation if the branch is being prepared for merge.

## Checklist

- [x] Relation persistence exists on the entity model.
- [x] Relation mutation APIs exist in the paper service.
- [x] Symmetric batch relate / unrelate behavior is covered by tests.
- [x] Sync-service relation call paths are covered by tests.
- [x] Graph derivation helpers exist.
- [x] Graph folder/color derivation semantics are covered by tests.
- [x] Graph neighborhood mode exists in the renderer.
- [x] Neighborhood stale-selection behavior is covered by tests.
- [x] Typecheck was run successfully for this readiness refresh.
- [x] Targeted Vitest suites were run successfully for this readiness refresh.
- [ ] Full branch scope from the original plan is fully verified as complete.
- [ ] Branch is confirmed release-ready.

## Bottom line

Current verdict: conditional go.

The relation and graph portions of the feature branch are implemented, typechecked, and backed by focused regression tests. The branch is suitable for continued integration and review, but the broader original scope should still be checked before treating the branch as fully complete or merge-ready.
