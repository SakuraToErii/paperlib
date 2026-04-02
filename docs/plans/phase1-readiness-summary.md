# Phase 1 Readiness Summary

Date: 2026-04-02
Branch: `feat/obsidian-folder-graph`
Status: Phase 1 substantially complete; safe to proceed into internal scraping architecture work

## Goal of Phase 1

Phase 1 was defined as a contract-first hardening round for the local-first Paperlib fork. The purpose was to stabilize the current Realm + filesystem behavior around:

- canonical local persistence semantics
- current `relatedPaperIds` relation-list storage
- delete/update/import preservation behavior
- local folder/file mutation behavior
- future migration seams for edge-based relation storage

This phase explicitly did not attempt to implement the future edge model or the built-in scrape architecture itself.

## What was completed

### 1. Repo-facing contracts and audits
Completed documents:
- `docs/plans/phase1-local-db-contract.md`
- `docs/plans/phase1-legacy-persistence-audit.md`
- `docs/plans/phase1-edge-migration-seam.md`

What these establish:
- `Entity` is the canonical local persisted paper model for current behavior
- `relatedPaperIds` is the current relation storage contract
- folder semantics are path-based and local-filesystem-centered
- legacy persistence residue (PaperEntity, _partition, Realm cloud-era baggage, etc.) is explicitly classified
- a future migration seam toward a `PaperRelation` edge model is written down

### 2. Relation-list integrity hardening
Completed work:
- shared relation integrity helper introduced under `app/service/services/paper-relation-integrity.ts`
- normalization logic consolidated for dedupe / invalid / self-link filtering / preservation helpers
- relation update behavior hardened in `paper-service.ts`
- relation-preservation behavior improved for update/import flows where incoming drafts omit relation fields

Protected invariants now:
- no duplicate stored relation ids
- no self-links in canonical updates
- invalid/nonexistent target ids filtered where appropriate
- explicit relation updates remain authoritative
- metadata refresh does not silently erase relation state when relation fields are omitted

### 3. Delete cleanup ownership clarified
Current intended owner:
- repository-side delete path

Notes:
- service-layer delete no longer needs to be interpreted as owning relation cleanup semantics
- targeted tests were polished so ownership expectations are expressed more clearly

### 4. Folder/file mutation hardening
Completed work:
- circular/descendant folder move detection tightened
- `FileService` hardened so absolute file URLs outside the library root are not misclassified as managed library files
- local folder rename behavior now protects against self/descendant moves defensively
- `CategorizerService.update` narrowed so metadata-only folder updates do not trigger unnecessary `syncFoldersWithLibrary()` work
- folder normalization/descendant semantics and managed-file behavior gained targeted unit coverage

Protected invariants now:
- local folder moves cannot recurse into themselves
- managed file detection is rooted in actual library containment
- metadata-only folder changes do not trigger path sync churn
- local-first folder/file semantics are more defensive against drift and accidental misuse

## Validation completed during Phase 1

Repeatedly validated across the phase:
- `pnpm run typecheck`
- targeted Vitest specs for relation behavior
- targeted Vitest specs for scrape/metadata preservation behavior
- targeted Vitest specs for folder and file service behavior

Phase 1 completed with green validations on the latest hardening slices.

## Local commit trail produced in Phase 1

Primary Phase 1 commits:
- `6fde924` docs: add phase1 local persistence contract and audit
- `8e1a558` Refactor relation normalization helpers
- `7f3cc05` Fix slice 2 relation integrity path
- `9c975d4` fix slice 3 relation metadata preservation
- `aedaae4` Fix slice 3 relation cleanup and refresh preservation
- `b24fb27` test: align delete relation cleanup ownership
- `334c01c` Polish delete cleanup relation test
- `0309867` Harden folder and managed file mutations

These sit on top of the earlier feature work for folder-sync, relations, graph view, UI polish, and sync replay hardening.

## Remaining risks / known follow-ups

These are not blockers for proceeding, but they should stay visible:

### A. Relation storage is still adjacency-list based
Current storage remains:
- `Entity.relatedPaperIds`

Implication:
- write complexity and cleanup rules still exist
- graph/query performance is bounded by current storage shape
- long-term `PaperRelation` edge migration remains important

### B. Some legacy persistence/runtime residue still exists
Examples:
- `PaperEntity` compatibility surface
- `_partition` / Realm cloud-era configuration and sync baggage
- old migration branches and schema registrations

Implication:
- future cleanup must be deliberate and migration-aware

### C. Folder/file tests can still be broadened later
Current Slice 4 work hardened important local cases, but more edge-case coverage is still possible for:
- rename/delete on nonexistent paths
- prune-parent behavior near library root
- cloud-folder delayed hydration edge cases

These are follow-up opportunities, not current blockers.

## Recommended next phase

Proceed to the short-term second major stream:
- internal, durable scraping/import architecture

Recommended next actions:
1. write a repo-facing Phase 2 scrape-architecture design doc
2. define provider/resolver/merge/persistence boundaries
3. internalize stable metadata sources first:
   - DOI
   - arXiv
   - BibTeX
   - generic HTML meta extraction
4. isolate volatile site-specific scrapers behind modular provider boundaries
5. ensure scrape/update flows preserve local organization and relations by default

## Readiness decision

Decision: GO

Reason:
- the local DB/file base is now materially more trustworthy than at the start of Phase 1
- relation-list behavior is hardened enough to continue product work safely
- folder/file mutation semantics are safer for local-first usage
- the migration seam and persistence contracts are documented, so future changes can build on explicit assumptions rather than implicit behavior

Phase 1 is therefore complete enough to move into internal scraping architecture work without losing control of the local-first core.
