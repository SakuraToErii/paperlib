# Phase 2 Safe Merge Policy

Date: 2026-04-02
Status: Draft for Phase 2 implementation
Scope: local-first scrape/import refresh behavior for Paperlib main repo

## Purpose

Phase 2 needs an explicit merge/update contract so metadata refreshes do not destroy user-managed local state.

This document defines the safe merge/update policy for:
- scrape refreshes
- import refreshes
- provider retries/fallbacks
- future internal metadata resolvers

It is intentionally based on current app behavior plus the Phase 1 hardening work, so future implementation can preserve existing invariants instead of accidentally regressing them.

## Baseline assumptions from Phase 1

Phase 1 established and/or hardened these behaviors:
- relation preservation when incoming updates omit `relatedPaperIds`
- metadata merge preservation for local-managed fields during scrape refresh
- folder/file behavior centered on local managed file placement
- folder tree derivation from the library filesystem in local mode

Primary references:
- `docs/plans/phase1-readiness-summary.md`
- `docs/plans/phase1-local-db-contract.md`
- `app/base/metadata.ts`
- `app/service/services/paper-relation-integrity.ts`
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `tests/unit-tests/services/scrape-service.spec.ts`
- `tests/unit-tests/services/paper-relations.spec.ts`
- `tests/unit-tests/services/file-service.spec.ts`

## Core policy

Safe merge/update means:
1. remote/provider metadata may improve bibliographic fields
2. remote/provider metadata must not silently erase local-managed fields
3. omitted incoming fields are not equivalent to authoritative deletion
4. explicit user edits remain authoritative over later refreshes unless the user explicitly requests overwrite behavior
5. managed file placement must remain stable unless the operation is explicitly a file move/rehome operation

In short: refreshes enrich metadata; they do not reorganize the user’s library.

## Merge model

For any refresh of an existing paper, treat fields in three classes.

### A. Remote-managed bibliographic fields

These may be updated from scraped/imported metadata when new data is non-empty and wins the merge policy:
- `title`
- `authors`
- `publication`
- `pubTime`
- `year`
- `month`
- `journal`
- `booktitle`
- `volume`
- `number`
- `pages`
- `publisher`
- `doi`
- `arxiv`
- `mainURL`
- `codes`
- other normalized citation/source-identification fields

Current merge hook:
- `app/base/metadata.ts:45` `mergeMetadata(...)`

Policy:
- provider values may fill empty local values
- provider values may replace stale bibliographic values when the merge priority policy allows it
- empty provider values must never blank out a populated local value during refresh
- provider fallback chains must be monotonic: a later failed/partial provider result cannot degrade an earlier richer merged draft

### B. Local-managed preservation fields

These are user/library managed and must be preserved by default across scrape/import refreshes:
- `relatedPaperIds`
- `folders`
- `tags`
- `note`
- `flag`
- `rating`
- `supplementaries`
- `defaultSup`
- `addTime`
- `library`
- `_id`
- `_partition`

Current preservation hook:
- `app/base/metadata.ts:3` `PRESERVED_METADATA_KEYS`
- `app/base/metadata.ts:60-63` preserved keys keep draft values instead of scraped values

Policy:
- refresh operations must carry forward the current stored value for these fields unless the operation explicitly targets that field
- an incoming payload omitting any of these fields must preserve the existing stored value
- an incoming payload including empty/default values for these fields must still not overwrite current stored values during ordinary refresh
- future internal providers should generally avoid emitting these fields at all unless they are intentionally participating in a user-authorized mutation flow

Important note:
- current code preserves `note` singular, not `notes`
- user requirement language should be interpreted as preserving local notes content via the persisted `note` field
- file references for this model are in `app/models/paper-entity.ts` and `app/base/metadata.ts`

### C. Explicitly mutable local-organization fields

These may change only through dedicated user/library operations, not through metadata refresh:
- relation edits via relation UI/service methods
- folder assignment changes via categorizer/folder workflows
- tag assignment changes via categorizer/tag workflows
- note edits in editor/UI flows
- file moves/renames via file service/folder operations

Relevant code paths:
- `app/service/services/paper-service.ts`
- `app/service/services/paper-relation-integrity.ts`
- `app/service/services/categorizer-service.ts`
- `app/service/services/file-service.ts`

Policy:
- refresh code must not impersonate these flows
- if a provider returns organization-like data, treat it as advisory/import-only and ignore it during ordinary update of an existing paper

## Explicit preservation rules

### 1. Preserve `relatedPaperIds` unless the incoming update explicitly sets them

Required behavior:
- if incoming refresh data omits `relatedPaperIds`, preserve stored relations
- if incoming refresh data explicitly sets `relatedPaperIds`, that is an authoritative relation update only when the caller is a relation-aware operation
- generic scrape/import refresh must not clear relations just because provider output lacks them

Current hardening:
- `app/service/services/paper-relation-integrity.ts:29-43` `preserveMissingRelationIds(...)`
- `app/service/services/paper-service.ts:248-253` preserves current relations before repository update
- `tests/unit-tests/services/paper-relations.spec.ts:166-181`
- `tests/unit-tests/services/paper-relations.spec.ts:338-423`
- `tests/unit-tests/services/scrape-service.spec.ts:8-51`

Phase 2 policy:
- `relatedPaperIds` is local graph state, not remote citation-import truth, unless the user explicitly runs a relation import/rebuild feature
- standard metadata refresh must preserve it
- standard import dedupe/update must preserve it when matching an existing record

### 2. Preserve `folders` and effective file placement during refresh

Required behavior:
- metadata refresh must not reassign a paper to a different folder
- metadata refresh must not infer a new managed folder from scraped metadata
- metadata refresh must not trigger library reorganization solely because title/authors/publication changed
- a rename of bibliographic metadata may rename a managed file only within its current managed folder if the operation is the normal `update()` path and file naming policy applies
- even in that case, the containing managed folder must remain stable unless the user explicitly moved the paper or renamed/remapped folders

Current behavior references:
- `app/base/metadata.ts:3-16` preserves `folders`, `supplementaries`, and `defaultSup`
- `app/service/services/file-service.ts:165-170` canonical folder path is derived from current entity folder assignment
- `app/service/services/file-service.ts:348-360` leaf folder can be inferred from managed files already in library
- `app/service/services/file-service.ts` `move(...)` keeps already-managed files in their current managed folder, as validated by tests
- `app/service/services/categorizer-service.ts:115-225` folder tree is rebuilt from filesystem plus managed leaf file locations in local mode
- `tests/unit-tests/services/file-service.spec.ts:63-134`

Phase 2 policy:
- folder assignment is local organization state and must survive refresh unchanged
- file placement is part of local organization state
- refresh may update filenames according to existing naming logic, but must not relocate files into a different folder based solely on refreshed metadata
- future resolver/import pipelines must preserve existing managed file URLs when no explicit move/rehome action was requested

Operational rule:
- never treat incoming provider folder/tag/category signals as authoritative for an existing record

### 3. Preserve `tags`

Required behavior:
- refresh must not remove or replace user tags
- provider/import tags may only be added through an explicit import mode designed to merge external labels
- default update behavior is preserve-local, ignore-remote

Current behavior reference:
- `app/base/metadata.ts:3-16` includes `tags` in preserved keys
- persisted model field is in `app/models/paper-entity.ts`

Phase 2 policy:
- for existing papers, incoming `tags` from scrape/import are ignored unless the caller explicitly opts into a tag-import mode
- if such a mode is added later, it must default to additive merge, never destructive replacement

### 4. Preserve `note`

Required behavior:
- refresh must not blank or rewrite user notes
- provider/import notes or abstract-like text must not be mapped into `note` on existing entities unless explicitly requested

Current behavior reference:
- `app/base/metadata.ts:3-16` preserves `note`
- persisted model field is `note` in `app/models/paper-entity.ts`

Phase 2 policy:
- local note content is authoritative
- any future provider-sourced annotations must land in a separate imported field or explicit review step, not overwrite `note`

### 5. Preserve `supplementaries`, `defaultSup`, and existing file bindings

Required behavior:
- metadata refresh must not drop local attachments
- metadata refresh must not reset default supplementary selection
- metadata refresh must not replace a local main file URL with a remote URL unless the user explicitly performs an attachment replacement/import action

Current behavior reference:
- `app/base/metadata.ts:3-16` preserves `supplementaries` and `defaultSup`
- `tests/unit-tests/services/scrape-service.spec.ts:104-170` validates PaperEntity payloads keep supplementary URLs intact
- `app/service/services/file-service.ts:280-317` distinguishes managed local files from unmanaged/remote URLs
- `app/service/services/file-service.ts:348-360` derives leaf folder from managed files only

Phase 2 policy:
- for existing records, attachment state is local-managed state
- provider-discovered PDF/code URLs are candidates for import, not automatic replacement of existing local attachments
- if a paper already has a managed main file, refresh should not switch it to a newly scraped remote URL

### 6. Preserve identity and library ownership

Required behavior:
- refresh must never replace `_id`, `_partition`, `library`, or `addTime`
- matching an existing paper means updating that entity, not creating a new logical identity in-place

Current behavior reference:
- `app/base/metadata.ts:3-16`

Phase 2 policy:
- dedupe/match logic must bind incoming metadata to the existing entity identity before merge
- identity fields are immutable in refresh flows

## Omitted vs explicit-empty semantics

Phase 2 must distinguish these cases:

1. field omitted from incoming payload
   - means provider does not know
   - preserve current value

2. field present but empty
   - for bibliographic fields: usually treat as unknown/non-authoritative; do not erase populated local value during ordinary refresh
   - for local-managed fields: never treat as authoritative deletion during ordinary refresh

3. field present with value in an explicit user-authorized destructive operation
   - only then may replacement/removal occur
   - this should be a different code path or an explicit mode flag, not ordinary scrape/import refresh

This distinction is mandatory because current Phase 1 hardening already relies on omitted-field preservation semantics for relations and metadata-managed fields.

## Operation-specific policy

### Scrape refresh of an existing paper

Default behavior:
- update bibliographic/source fields only
- preserve all local-managed fields
- preserve existing managed file placement
- preserve relation graph state

Relevant references:
- `app/base/metadata.ts`
- `tests/unit-tests/services/scrape-service.spec.ts`

### Import of a new paper

Default behavior:
- imported payload may initialize bibliographic fields
- imported payload may initialize attachments when creating a brand-new entity
- imported payload may initialize folders/tags only if the creation flow is explicitly designed to do so
- after creation, those fields become local-managed

Important distinction:
- creation semantics may accept importer-provided organization defaults
- update semantics for an already matched paper must preserve existing local organization

### Import matched onto an existing paper

Default behavior:
- behave like refresh, not replace
- merge bibliographic improvements
- preserve existing local organization and attachments
- do not downgrade or rehome files
- do not clear notes, tags, folders, or relations

### Provider fallback chain

Default behavior:
- earlier successful provider results establish candidate values
- later provider attempts may improve unresolved bibliographic fields
- later provider attempts may not degrade populated bibliographic fields with empties
- later provider attempts may never overwrite local-managed fields

## File placement and folder safety rules

These rules are especially important for the local-first library model.

1. Managed-vs-unmanaged distinction must remain explicit
   - see `app/service/services/file-service.ts:280-317`
   - only file URLs inside the actual library root count as managed library files

2. Existing managed folder wins during rename/update
   - see `tests/unit-tests/services/file-service.spec.ts:101-134`
   - when a file is already imported, renaming should stay in the original managed folder rather than jumping to a newly inferred folder

3. Folder tree remains derived state in local mode
   - see `app/service/services/categorizer-service.ts:115-225`
   - refresh should not directly mutate folder tree structure except through existing file/categorizer flows

4. Metadata-only refresh must not cause folder sync churn unless folder semantics actually changed through an explicit folder operation
   - see `app/service/services/paper-service.ts:317-325`

## Non-goals for ordinary refresh

Ordinary scrape/import refresh must not:
- clear `relatedPaperIds`
- overwrite or clear `tags`
- overwrite or clear `folders`
- overwrite or clear `note`
- replace local attachments with remote URLs
- move files across folders based on scraped metadata
- rewrite plugin-linked folder preferences
- create destructive organization changes from partial provider output

## Required implementation constraints for Phase 2

Phase 2 implementation should follow these constraints:

1. Separate provider output from persistence draft
   - provider output should first land in a transient normalized result object
   - merge policy should then map only allowed fields into the persistence draft

2. Preserve local-managed fields centrally
   - do not rely on each provider to remember preservation rules
   - preservation must happen in one shared merge/update layer

3. Prefer allowlists over implicit object spread
   - avoid `existing = { ...existing, ...incoming }` style updates for persisted entities
   - use explicit field classes and policies

4. Keep create-vs-update semantics separate
   - new entity creation can accept importer defaults
   - updating a matched entity must be preservation-first

5. Make destructive overwrite an explicit opt-in mode
   - if bulk overwrite/reimport is ever needed, it should be a separate user-visible action with warnings
   - it must not be the default refresh path

## Suggested acceptance tests for Phase 2

At minimum, preserve or extend tests covering:
- existing paper refresh preserves `relatedPaperIds` when omitted by incoming metadata
  - `tests/unit-tests/services/scrape-service.spec.ts`
  - `tests/unit-tests/services/paper-relations.spec.ts`
- existing paper update preserves relations when draft omits relation field
  - `tests/unit-tests/services/paper-relations.spec.ts`
- existing managed files stay in the original managed folder during rename/update
  - `tests/unit-tests/services/file-service.spec.ts`
- refresh of an existing paper with local tags/folders/note/attachments keeps them unchanged
  - new Phase 2 tests should be added for explicit coverage
- provider fallback with partial/empty data cannot degrade an already merged richer draft
  - new Phase 2 tests should be added

## Decision summary

Default safe merge/update semantics for Phase 2 are:
- preserve local-managed fields by default
- treat omitted incoming fields as unknown, not deletion
- allow refresh to improve bibliographic metadata only
- keep relations, notes, tags, folders, and file placement stable unless the user explicitly invokes a local organization mutation flow

This policy matches the current hardened direction of the codebase and should be treated as the contract for Phase 2 internal scrape/import architecture work.
