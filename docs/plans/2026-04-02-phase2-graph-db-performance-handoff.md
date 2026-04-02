# Phase 2 Graph / Local DB Performance Handoff

Date: 2026-04-02
Branch: `feat/obsidian-folder-graph`
Status: ready for the next focused execution slice after local-first bootstrap + stable-provider hardening

## Why this handoff exists

The current branch already has:

- local-first folder / file semantics hardened in Phase 1
- relation / graph behavior protected by focused regression tests
- local-library bootstrap coverage for first-run local imports
- Phase 2 scrape-provider work underway for durable metadata resolution

The next meaningful bottleneck is no longer bootstrap correctness; it is graph and local-database scaling under the current storage shape.

## Current constraints to carry forward

1. Relations still persist on `Entity.relatedPaperIds`, so graph reads and relation cleanup remain coupled to whole-entity storage.
2. Graph derivation is still filtered-set based and renderer-visible behavior must preserve the existing contract from `docs/plans/phase1-edge-migration-seam.md`.
3. Phase 1 explicitly classified graph/query performance as limited by the current adjacency-list storage (`docs/plans/phase1-readiness-summary.md`).
4. Legacy Realm sync/cloud residue still exists, so storage cleanup must remain migration-aware rather than opportunistic.

## Practical performance targets

### A. Introduce a relation read gateway before changing storage

Goal:
- stop adding new renderer/service reads that depend directly on `entity.relatedPaperIds`

Start from:
- `app/service/services/paper-service.ts`
- `app/renderer/ui/main-view/detail-view/components/related-papers.vue`
- `app/renderer/ui/main-view/data-view/paper-data-view.vue`
- `app/renderer/utils/paper-graph.ts`

Expected outcome:
- detail view, graph derivation, and batch enablement read through one query surface
- edge-storage migration can happen behind that surface later

### B. Keep current graph semantics while reducing whole-entity coupling

Must preserve:
- graph derives from the active filtered entity set
- missing targets do not create dangling edges
- self-links stay ignored
- duplicate forward/backward storage still collapses to one visible edge
- edge direction remains render-derived from publication time

Candidate next seam:
- `buildRelationSubgraph(entityIds)`
- `hasRelationBetween(a, b)`
- `listRelatedPaperIds(paperId)`

### C. Prepare a migration-safe local DB path

Goal:
- make future graph/relation performance work independent from legacy Realm sync baggage

Priority questions:
1. Which active callers still require `_partition` / Realm-sync-era assumptions?
2. Which query paths are doing repeated whole-entity scans that can be narrowed once a relation gateway exists?
3. Which tests currently encode inline-list assumptions and therefore need preservation-first refactors?

## Recommended execution order

1. Add relation read helpers/gateway without changing storage truth.
2. Refactor graph/detail/batch consumers onto the gateway.
3. Add targeted regression tests proving graph semantics stay unchanged.
4. Only then prototype edge-style storage or query acceleration behind the gateway.
5. Defer Realm/cloud residue removal until sync strategy is explicitly settled.

## High-value files to inspect first

- `app/service/services/paper-service.ts`
- `app/renderer/utils/paper-graph.ts`
- `app/renderer/ui/main-view/detail-view/components/related-papers.vue`
- `app/renderer/ui/main-view/data-view/paper-data-view.vue`
- `docs/plans/phase1-edge-migration-seam.md`
- `docs/plans/phase1-local-db-contract.md`
- `tests/unit-tests/services/paper-relations.spec.ts`
- `tests/unit-tests/renderer/paper-graph.spec.ts`
- `tests/unit-tests/renderer/paper-graph-view.spec.ts`

## Regression floor to preserve

Run these before and after any performance slice:

```bash
rtk pnpm run typecheck
rtk vitest run tests/unit-tests/services/paper-relations.spec.ts tests/unit-tests/renderer/paper-graph.spec.ts tests/unit-tests/renderer/paper-graph-view.spec.ts
```

If relation reads move behind a gateway, add:

```bash
rtk vitest run tests/unit-tests/services/*relation*.spec.ts tests/unit-tests/renderer/*graph*.spec.ts
```

## Bottom line

The safe next move is not “optimize the graph” in place. It is to introduce a relation-read gateway that preserves current graph semantics, then move graph/detail/batch consumers onto it so storage and query-shape improvements can land without destabilizing the local-first branch.
