# Phase 1 local DB contract

Date: 2026-04-02
Status: contract draft for current implementation
Scope: canonical local persistence semantics for the current `paperlib` fork

## Purpose

This document freezes the local-first persistence contract that Phase 1 code already implies. It is narrower than the broader Phase 1 contract freeze and focuses on:

- the canonical persisted paper model
- relation-list invariants
- folder and managed-file semantics
- metadata-update preservation rules
- local-first and cloud-folder assumptions

This document is intended to be a source-of-truth companion to:

- `docs/plans/2026-04-01-phase1-contract-freeze.md`
- `app/models/entity.ts`
- `app/service/repositories/db-repository/paper-entity-repository.ts`
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/base/folder.ts`

## Code references

Primary implementation anchors:

- `app/models/entity.ts`
- `app/models/supplementary.ts`
- `app/models/categorizer.ts`
- `app/service/repositories/db-repository/paper-entity-repository.ts`
- `app/service/services/paper-service.ts`
- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts`
- `app/base/folder.ts`
- `app/base/url.ts`
- `app/main/services/preference-service.ts`
- `app/service/services/database-service.ts`

Legacy/compatibility context only:

- `app/models/paper-entity.ts`

## 1. Canonical persisted paper model

## 1.1 Canonical Realm object

For current local persistence, the canonical stored paper record is `Entity`, not legacy `PaperEntity`.

Source:

- `app/models/entity.ts` defines the active schema name `Entity`
- `app/service/repositories/db-repository/paper-entity-repository.ts` loads and writes `realm.objects<Entity>("Entity")`
- `app/models/paper-entity.ts` is legacy compatibility context and is not the canonical Phase 1 local model

Therefore Phase 1 local persistence should treat `Entity` as the only normative paper schema for current behavior.

## 1.2 Canonical persisted fields

The persisted `Entity` contract includes at least these fields and semantics, per `app/models/entity.ts`.

Identity and scope:

- `_id: objectId` — primary key
- `_partition: string?` — deprecated cloud/Realm sync compatibility field, not local semantic truth
- `library: string` — current repository contract normalizes this to `"main"`
- `addTime: date`
- `type: string`

Core bibliographic payload:

- `title: string`
- `authors: string`
- `year: string`
- optional bib/pub fields such as `journal`, `booktitle`, `publication`, `pubTime`, `pubType`, `volume`, `number`, `pages`, `publisher`, `series`, `edition`, `editor`, `howpublished`, `organization`, `school`, `institution`, `address`
- optional abstract/identifier fields such as `abstract`, `doi`, `arxiv`, `issn`, `isbn`

Attachment payload:

- `defaultSup: string?`
- `supplementaries: Supplementary{}` where each entry is an embedded object with:
  - `_id: string`
  - `url: string`
  - `name: string`

Library classification and relation payload:

- `rating: int?`
- `tags: list<PaperTag>`
- `folders: list<PaperFolder>`
- `relatedPaperIds: list<objectId>`
- `flag: bool?`
- `note: string?`

Feed-only optional fields also exist on the same schema:

- `read: bool?`
- `feed: Feed?`

However, `PaperEntityRepository.load()` filters persisted library papers to `library == 'main'`, so the local paper-library contract in this document is about main-library `Entity` objects.

## 1.3 Repository normalization contract on write

`PaperEntityRepository.makeSureProperties()` establishes minimum persisted defaults before write.

Source: `app/service/repositories/db-repository/paper-entity-repository.ts`

On write, the repository normalizes:

- `_id` is assigned if absent, otherwise coerced to `ObjectId`
- `addTime` defaults to `new Date()`
- `library` is forced to `"main"`
- `type` defaults to `"article"`
- `supplementaries` defaults to an empty object-like payload
- `title` defaults to `""`
- `authors` defaults to `""`
- `year` defaults to `""`
- `rating` defaults to `0`
- `tags` defaults to `[]`
- `folders` defaults to `[]`
- `relatedPaperIds` is deduplicated and coerced to `ObjectId[]`
- `flag` defaults to `false`

Contract implication:

- callers may provide partial drafts
- the repository, not callers, is the final normalizer for persisted local records
- persisted main-library entities should not rely on missing values for these fields

## 1.4 Canonical attachment representation

The canonical attachment model is `supplementaries + defaultSup`, not legacy `mainURL + supURLs`.

Sources:

- `app/models/entity.ts`
- `app/models/supplementary.ts`
- `app/base/url.ts#getDefaultSupplementaryFileURL`
- `app/service/services/paper-service.ts#updateSups`, `#deleteSups`, `#create`
- `app/service/services/file-service.ts#move`

Contract:

- every managed attachment is stored under `entity.supplementaries[supId]`
- each supplementary has stable `_id`, `url`, and `name`
- `defaultSup` points at the canonical default attachment when one exists
- code paths that need the “main file” derive it from `defaultSup`, not from a separate `mainURL` field

Legacy `PaperEntity.mainURL` / `supURLs` remain compatibility context only and are not the canonical local Phase 1 storage contract.

## 2. Relation-list invariants

## 2.1 Stored representation

Paper relations are stored directly on each `Entity` as `relatedPaperIds: objectId[]`.

Sources:

- `app/models/entity.ts`
- `app/service/repositories/db-repository/paper-entity-repository.ts`
- `app/service/services/paper-service.ts`

There is no separate relation join table in local persistence.

## 2.2 Invariants

The current implementation freezes these invariants:

1. IDs must be valid object IDs
2. self-relations are invalid
3. duplicate relation IDs must collapse to one stored value
4. relations are intended to be symmetric
5. deleted targets must be removed from surviving papers

Implementation anchors:

- `PaperService._normalizeExistingRelatedIds()` removes invalid IDs, self IDs, and duplicates
- `PaperService._syncPaperRelationIds()` writes the normalized set back to a paper
- `PaperEntityRepository.makeSureProperties()` deduplicates `relatedPaperIds` on write
- `PaperService.delete()` and `PaperEntityRepository.delete()` both strip references to deleted papers from surviving entities

## 2.3 Symmetry contract

Phase 1 canonical semantics are undirected relations.

Source behavior:

- `setRelatedPaperIds()` updates the target paper and also rewrites the reciprocal relation lists of all surviving related papers
- `relateSelectedPapers()` forms a clique among the selected valid existing papers
- `unrelateSelectedPapers()` removes only intra-selection edges and preserves outside links

Contract implication:

- a local persistent state where `A` references `B` but `B` does not reference `A` is not canonical
- temporary asymmetry during an in-memory operation is acceptable only if the final committed Realm state is symmetric

## 2.4 Missing-target behavior

When relation updates name IDs that do not exist locally, the implementation converges to existing papers only.

Source: `PaperService.setRelatedPaperIds()` loads `requestedRelatedIds` from the repository and then persists only the IDs of found papers.

Contract:

- nonexistent target IDs are ignored during canonical persistence
- the persisted relation list is the set of valid, existing, non-self papers after normalization

## 2.5 Delete cleanup contract

Deleting a paper must also remove all edges pointing to it.

Sources:

- `app/service/services/paper-service.ts#delete`
- `app/service/repositories/db-repository/paper-entity-repository.ts#delete`

Contract:

- no surviving paper should retain a `relatedPaperIds` entry that points at a deleted paper
- relation cleanup is part of delete semantics, not an optional later repair step

## 3. Folder and file semantics

## 3.1 Folder path normalization

Folder paths are canonicalized by `normalizeFolderPath()` in `app/base/folder.ts`.

Normalization rules:

- empty input becomes `""`
- `\` becomes `/`
- segments are trimmed
- empty segments and `.` are removed
- normalized segments are rejoined using `/`

Contract:

- canonical persisted folder names use normalized relative paths
- absolute library paths must not be stored as folder names
- logical folder identity is path-string based after normalization

## 3.2 Folder object semantics

`PaperFolder.name` stores the canonical relative folder path for real folders.

Sources:

- `app/models/categorizer.ts`
- `app/service/services/categorizer-service.ts#syncFoldersWithLibrary`

Special case:

- `Folders` is the logical root node and not a real relative filesystem path

## 3.3 Single-leaf folder contract for papers

For local canonical semantics, `Entity.folders` is not a stable multi-folder classification list. It converges to zero or one canonical leaf folder.

Sources:

- `app/service/services/paper-service.ts#entityHasFolderSemanticChanges`
- `app/service/services/categorizer-service.ts#syncFoldersWithLibrary`
- `app/service/services/file-service.ts#getEntityFolderPath`
- `app/service/services/file-service.ts#getLeafFolderFromEntityFiles`

Observed contract:

- if a paper has managed local files, its canonical folder is derived from the deepest managed file location
- if no managed file determines a folder, fallback behavior may use the deepest declared `folders` entry
- after `syncFoldersWithLibrary()`, each `paperEntity.folders` is rewritten to either:
  - `[leafFolder]`, or
  - `[]`

Therefore Phase 1 canonical persistence semantics are:

- zero or one canonical folder per paper
- multiple stored folders are non-canonical transitional state
- folder truth is filesystem-aligned in local mode

## 3.4 Managed file contract

A managed file is a `file://` URL that resolves inside `appLibFolder` and is not an internal Realm artifact.

Sources:

- `app/service/services/file-service.ts#getManagedRelativePath`
- `app/base/folder.ts#isInternalLibraryPath`
- `app/main/services/preference-service.ts` for `appLibFolder`

`getManagedRelativePath()` rejects:

- non-`file` protocols
- empty paths
- paths outside the library (`..` / `../...`)
- internal Realm artifacts like `.realm`, `.realm.lock`, `.realm.note`, `.realm.log`, `.realm.management`, `cache.realm.management`

Contract:

- only non-internal files under the configured library root participate in canonical folder derivation
- Realm storage artifacts are never user folder content

## 3.5 File move and canonical URL semantics

`PaperService.update()` routes drafts through `FileService.move()` before persistence.

Sources:

- `app/service/services/paper-service.ts#update`
- `app/service/services/file-service.ts#move`
- `app/service/services/file-service.ts#inferRelativeFileName`

Current contract:

- incoming `file://` supplementaries are candidates for management in the library folder
- target relative path is `joinFolderPath(folderPath, formattedFilename + '_' + sup._id + ext)`
- after a successful move, the stored supplementary URL is rewritten to a `file://` URL pointing at the managed relative path
- if a supplementary still resolves to an absolute unmanaged local file after attempted move, it is warned about and removed from the entity draft

Contract implication:

- canonical local persistence prefers library-managed `file://` URLs over external absolute paths
- canonical attachment identity is preserved by supplementary `_id`, while file path may be rewritten during import or rename

## 3.6 Folder rename semantics

Folder rename is filesystem-first in local mode and then reflected back into persisted metadata.

Sources:

- `app/service/services/categorizer-service.ts` around folder updates
- `app/service/services/file-service.ts#renameFolder`
- `app/service/services/file-service.ts#remapManagedFileURL`
- `app/service/services/categorizer-service.ts#syncFoldersWithLibrary`

Contract:

- renaming a folder renames the actual filesystem folder under `appLibFolder`
- any persisted `PaperFolder.name` at or below the moved subtree is remapped to the new normalized path
- managed supplementary URLs under the moved subtree are remapped to the new relative location
- final canonical folder state is re-synchronized from the library via `syncFoldersWithLibrary()`

## 3.7 Empty-folder deletion semantics

Deleting a folder in local filesystem mode is constrained by real filesystem state.

Sources:

- `app/service/services/categorizer-service.ts#delete`
- `app/service/services/file-service.ts#deleteEmptyFolder`

Contract:

- only empty physical folders may be deleted
- parent folders may be pruned if they become empty and pruning is requested
- deleting a folder also triggers linked-folder-path cleanup and full folder resync

## 4. Metadata-update preservation rules

## 4.1 Updates are merge-by-entity, not field-patch diffs

Repository update semantics are whole-entity replacement for scalar payloads plus rebuilt object/list assignments for tags/folders/relations.

Source: `app/service/repositories/db-repository/paper-entity-repository.ts#update`

The repository overwrites the stored object’s current values with fields from the incoming entity draft for:

- bibliographic metadata
- abstract and identifiers
- `defaultSup`
- `supplementaries`
- `rating`, `flag`, `note`
- `tags`, `folders`, `relatedPaperIds`

Contract:

- callers must provide the fields they intend to preserve
- the persistence layer does not perform semantic field-level conflict merging beyond explicit normalization rules

## 4.2 Add-time and identity preservation

Canonical updates preserve entity identity.

Sources:

- `_id` is the primary key in `app/models/entity.ts`
- `toRealmObject()` looks up by `_id` first, then falls back to a dedupe lookup by title/authors
- `makeSureProperties()` preserves provided `_id` or generates one if absent

Contract:

- `_id` is the durable local identity
- `addTime` should be preserved across metadata refreshes when a caller passes the existing entity draft
- creating a new draft without the previous `_id` may create a new entity or hit legacy title/authors dedupe behavior; this is not a guaranteed merge contract

## 4.3 Supplementary preservation rules

Supplementary preservation is keyed by supplementary `_id`, not by URL string alone.

Sources:

- `app/models/supplementary.ts`
- `app/service/services/paper-service.ts#updateSups`
- `app/service/services/paper-service.ts#deleteSups`

Contract:

- preserving attachments across metadata updates requires preserving existing `supplementaries` entries and `defaultSup`
- deleting supplementaries must remove both the metadata entry and the underlying managed file when applicable
- if the deleted supplementary was `defaultSup`, the default is reassigned to another surviving supplementary or unset

## 4.4 Folder preservation rules for metadata-only updates

Metadata-only updates should not rewrite local folder topology unless the draft carries folder-semantic changes.

Source: `app/service/services/paper-service.ts#update`

Behavior:

- after successful updates, `syncFoldersWithLibrary()` runs only when at least one updated draft has folder-semantic changes
- `entityHasFolderSemanticChanges()` currently treats either of these as folder-semantic:
  - more than one assigned folder path
  - any assigned folder path containing `/`

Contract implication:

- ordinary metadata refreshes are intended to preserve the current folder tree without forced rebuild
- folder rebuild is explicitly reserved for drafts whose folder representation can affect canonical folder semantics
- however, because folder truth in local mode is filesystem-derived, later explicit sync may still re-normalize `entity.folders`

## 4.5 File-location preservation during metadata refresh

A metadata update must preserve existing managed file placement unless the file service intentionally remaps it.

Sources:

- `app/service/services/file-service.ts#getLeafFolderFromEntityFiles`
- `app/service/services/file-service.ts#move`
- `app/service/services/paper-service.ts#renameAll`

Observed contract:

- if an entity already has a managed file inside the library, `move()` prefers the original managed folder derived from existing files rather than blindly trusting current `entity.folders`
- renaming metadata like title may change the managed filename, but should keep the file under the same managed folder when one already exists

This is the key preservation rule that keeps metadata edits from silently relocating papers between folders.

## 4.6 Cache preservation boundary

Full-text cache updates are side effects, not primary persistence truth.

Sources:

- `app/service/services/paper-service.ts#update`
- `app/service/services/cache-service.ts`

Contract:

- cache refresh may be triggered after successful persistence
- local DB semantics do not depend on cache presence
- if cache and DB disagree, DB plus managed files are authoritative

## 5. Local-first and cloud-folder assumptions

## 5.1 Local-first default assumption

The current default preference model is local-first.

Source: `app/main/services/preference-service.ts`

Defaults include:

- `appLibFolder = ~/Documents/paperlib`
- `syncFileStorage = "local"`

Contract:

- Phase 1 canonical semantics assume local filesystem-backed library management by default
- folder semantics in this document are primarily defined for that local mode

## 5.2 Folder sync is only canonical in local filesystem mode

`CategorizerService.syncFoldersWithLibrary()` short-circuits unless `FileService.usesLocalFileSystem()` is true.

Sources:

- `app/service/services/categorizer-service.ts#syncFoldersWithLibrary`
- `app/service/services/file-service.ts#usesLocalFileSystem`

Contract:

- filesystem-derived folder truth applies only when `syncFileStorage == "local"`
- in non-local mode, the local code intentionally does not attempt full folder-tree reconciliation from a remote backend

## 5.3 WebDAV / non-local limitation contract

The file service supports a WebDAV backend, but folder-management semantics remain constrained.

Sources:

- `app/service/services/file-service.ts`
- `app/service/services/categorizer-service.ts#delete`

Current explicit contract:

- if folder deletion is requested while not using local filesystem storage, the service throws: filesystem-backed folders are only supported with the local file storage backend
- local folder rebuild and canonical mirror semantics are not guaranteed in WebDAV mode

Therefore, for Phase 1:

- local mode is the only fully specified canonical folder mode
- non-local backends may transport files, but they are not the normative source for folder-tree contracts in this phase

## 5.4 Cloud-sync boundary

`DatabaseService` exposes database initialization plus sync pause/resume and sync-cache deletion, but the canonical local contract remains centered on local Realm contents.

Sources:

- `app/service/services/database-service.ts`

Contract:

- sync layers may replicate or pause replication of local Realm state
- sync machinery does not redefine canonical local semantics of entities, folders, or relations
- when reasoning about correctness in Phase 1, validate the local Realm state and library folder state first

## 5.5 Deprecated partition/cloud fields

`_partition` remains in schemas for compatibility with older cloud/Realm-sync flows.

Sources:

- `app/models/entity.ts`
- `app/models/categorizer.ts`

Contract:

- `_partition` may be populated when available
- `_partition` is not part of canonical local user-visible semantics for paper identity, folder identity, or relation semantics
- future migration work may remove this field without changing the local persistence contract in this document

## 6. Practical canonical-state summary

A paper is in canonical local persisted state when all of the following are true:

- it is stored as an `Entity` in Realm
- `library == "main"`
- `_id` is stable and valid
- `supplementaries` is the attachment source of truth
- `defaultSup` points at the canonical default attachment or is unset
- any managed local attachments use normalized `file://` URLs under `appLibFolder`
- `relatedPaperIds` contains only valid, deduplicated, non-self object IDs
- relation symmetry holds across all referenced existing papers
- `folders` is either empty or contains exactly one canonical leaf `PaperFolder`
- that leaf folder matches the filesystem-derived managed-file location in local mode

## 7. Non-goals / explicitly not guaranteed in Phase 1

Phase 1 does not guarantee:

- stable canonical semantics for legacy `PaperEntity.mainURL` / `supURLs`
- multi-folder classification as a first-class persisted paper contract
- filesystem-mirrored folder reconciliation in WebDAV or other non-local modes
- field-level three-way merge semantics for concurrent metadata edits
- preservation of unmanaged absolute local file paths as canonical library state

## 8. Change guidance

Any future change should be treated as a contract change if it modifies one of these behaviors:

- switching the canonical paper schema away from `Entity`
- reintroducing multi-folder paper semantics
- changing the attachment source of truth away from `supplementaries + defaultSup`
- allowing asymmetric or directed relation persistence
- making non-local backends authoritative for folder-tree semantics

Such changes should update this file and the broader Phase 1/Phase 2 planning docs together.
