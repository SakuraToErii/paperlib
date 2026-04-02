# Phase 1 legacy persistence audit

Scope: classify legacy persistence/model/service residues related to the current Realm-backed storage layer, with emphasis on PaperEntity vs Entity usage, schema registration, migration baggage, sync semantics, and repository assumptions.

## Summary

The active persistence path has already shifted from the older PaperEntity model to Entity for paper records, but the codebase still carries meaningful compatibility residue. The largest legacy seams are:
- dual schema registration of Entity and PaperEntity in database configs
- migration code that still operates heavily on PaperEntity-era schemas and the PaperPaperSmartFilter legacy model
- sync/cloud logic that still depends on Realm cloud-era concepts such as _partition, Realm.App login, flexible-sync subscriptions, and local schema registration for legacy objects
- service and hook interfaces that still speak in terms of "PaperEntity" payloads/classes even when the actual stored type is Entity
- repository assumptions that hardcode library == 'main' and root-node names like Tags/Folders

Overall classification:
- Active/required: Entity schema, repository usage over Entity, relatedPaperIds handling, root categorizer conventions, some _partition handling while Realm sync remains present
- Compat-only: PaperEntity model/schema registration, PaperPaperSmartFilter registration, old-version migration branches, class-recovery and payload naming that preserve extension/runtime compatibility
- Ambiguous: whether Realm cloud/flexible sync support is still product-critical, whether _partition remains needed once "official" sync fully replaces Realm sync
- Removable later: commented migrateLocaltoCloud paths, paperEntityListened flag, PaperEntity-specific helper paths after extension/API cleanup

## Category: active / required

### 1. Entity is the active paper persistence model
- app/models/entity.ts:77 defines Entity.schema with the current paper/feed-capable record shape.
- app/service/repositories/db-repository/paper-entity-repository.ts:52-77 resolves paper records from realm.objects<Entity>("Entity"), not PaperEntity.
- app/service/repositories/db-repository/paper-entity-repository.ts:93-125 loads papers from realm.objects<Entity>("Entity") and filters to library == 'main'.
- app/service/repositories/db-repository/paper-entity-repository.ts:134-141 loadByIds also targets Entity.
- app/service/services/paper-service.ts:261 uses Entity as the updated draft/result type during writes.

Assessment: required. This is the real active storage path for papers.

Risk:
- Naming drift remains high because the repository/service is still called PaperEntityRepository while operating on Entity objects.

Recommended follow-up:
- Phase 2 rename repository/service surface area to Entity-centric names after API compatibility is planned.

### 2. Entity fields added during modernization are actively used
- app/models/entity.ts:68 defines relatedPaperIds.
- app/models/entity.ts:126-129 registers relatedPaperIds in schema.
- app/service/repositories/db-repository/paper-entity-repository.ts:166-168 normalizes relatedPaperIds.
- app/service/services/paper-service.ts:58-86 contains relation normalization helpers.
- app/service/services/paper-service.ts:661-704 updates bidirectional relatedPaperIds state.
- app/service/services/paper-service.ts:728-791 batch relate/unrelate logic also depends on relatedPaperIds.
- app/service/services/database/migration.ts:221-227 and 351-356 backfill relatedPaperIds for version <=10 databases.

Assessment: required.

Risk:
- Any attempt to prune migration/version handling must preserve relatedPaperIds backfill for older local data.

Recommended follow-up:
- Keep until minimum supported DB version is advanced beyond 10/11 and upgrade guarantees are documented.

### 3. Root categorizer conventions are still part of live repository semantics
- app/service/repositories/db-repository/categorizer-repository.ts:52-56 treats name == "Tags" as the tag root.
- app/service/repositories/db-repository/categorizer-repository.ts:74-78 treats name == "Folders" as the folder root.
- app/service/repositories/db-repository/categorizer-repository.ts:171-210 creates missing root nodes.
- app/renderer/services/querysentence-service.ts:190-192 explicitly strips filters that target Tags/Folders/SmartFilters roots.

Assessment: required for current tree semantics.

Risk:
- Root objects are represented by sentinel names rather than explicit type/role metadata, so removal/refactor would affect queries, migration, and UI assumptions together.

Recommended follow-up:
- Document root-node invariants centrally, or replace sentinel names with explicit root metadata in a later schema revision.

### 4. safeWrite/listener flags are actively depended on by repositories/services
- app/index.d.ts:160-169 extends Realm with safeWrite and listener flags.
- app/service/services/database/core.ts:140-155 initializes safeWrite and listener flags.
- app/service/repositories/db-repository/paper-entity-repository.ts:97-111 uses realm.entityListened.
- app/service/repositories/db-repository/feed-entity-repository.ts:83-95 uses realm.feedEntityListened.
- app/service/repositories/db-repository/categorizer-repository.ts:119-147 uses realm.tagsListened and realm.foldersListened.

Assessment: required today, though architecturally incidental.

Risk:
- These are ad hoc runtime extensions on Realm, so future refactors can break silently.

Recommended follow-up:
- Replace boolean listener bookkeeping with repository-owned subscription management when touching persistence internals.

### 5. Some _partition handling is still active while Realm sync/cloud path exists
- app/models/entity.ts:27 and 83 explicitly keep _partition with deprecation comments.
- app/service/services/database/core.ts:265-360 flexible sync subscriptions filter on _partition == cloudUser.id.
- app/service/services/database/core.ts:397-400 partition sync config still sets partitionValue: cloudUser.id.
- app/service/repositories/db-repository/paper-entity-repository.ts:185 and 203-227 pass partition through updates.
- app/service/repositories/db-repository/feed-entity-repository.ts:142 and 213-224 preserve/apply _partition.
- app/service/repositories/db-repository/categorizer-repository.ts:255 and 292-351 preserve/apply _partition.

Assessment: active if Realm sync remains supported.

Risk:
- _partition is simultaneously deprecated and operational. That makes cleanup unsafe until Realm sync strategy is settled.

Recommended follow-up:
- Decide whether Realm sync is still supported in-product. If not, make _partition removal a planned schema migration.

## Category: compat-only

### 1. PaperEntity model is legacy compatibility residue, not the active store model
- app/models/paper-entity.ts:35-77 defines the older PaperEntity schema.
- app/service/services/database/core.ts:237-246 registers PaperEntity.schema in local config.
- app/service/services/database/core.ts:267-288 and 374-395 register PaperEntity.schema in cloud configs.
- app/service/services/database/migration.ts:14-98 performs early-version migrations entirely over PaperEntity objects.
- app/service/services/database/core.ts:303-310 adds flexible-sync subscription for PaperEntity.

Assessment: compat-only. The active repository path does not query PaperEntity for current papers.

Why it still exists:
- old database upgrades
- possible extension/hook/runtime class recovery
- legacy synced realms that may still contain the old class

Risk:
- dual registration invites confusion and makes it easy to accidentally write new code against PaperEntity.
- syncing both Entity and PaperEntity suggests potential over-subscription or stale object-class exposure in cloud mode.

Recommended follow-up:
- Verify whether any non-migration data still exists under PaperEntity in live installs.
- If not, stop registering PaperEntity in fresh configs first, then remove the class after a migration cutoff.

### 2. "PaperEntity" remains a compatibility term in extension/service payloads
- app/service/services/scrape-service.ts:116-129 accepts payload.type === "PaperEntity" but converts directly to new Entity(payload.value).
- app/service/services/scrape-service.ts:151 and 168 comments still describe PaperEntity list/drafts.
- app/service/services/paper-service.ts:812 emits payloads with type: "PaperEntity".
- app/service/services/hook-service.ts:279-281 recovers objects as PaperEntity when the original object was PaperEntity.

Assessment: compat-only naming/interface baggage.

Risk:
- External extensions may still key on the old payload name/class, preventing straightforward removal.

Recommended follow-up:
- Inventory extension API expectations before renaming payload types or removing PaperEntity class recovery.

### 3. PaperPaperSmartFilter is explicit legacy baggage
- app/service/services/database/core.ts:276-287 and 383-394 register legacy schema name "PaperPaperSmartFilter" with comment "Legacy, will be removed in the future".
- app/service/services/database/core.ts:351-358 adds a flexible sync subscription for that legacy model.
- app/service/services/database/migration.ts:177-218 migrates PaperPaperSmartFilter into PaperSmartFilter and deletes the old model.
- app/service/services/database/migration.ts:302-348 syncMigrate also reads from "PaperPaperSmartFilter".

Assessment: compat-only.

Risk:
- Fresh databases still know about a model that should only matter during upgrade, increasing schema surface area and sync overhead.

Recommended follow-up:
- Confirm whether any supported upgrade path still needs this registered in newly opened realms; if not, gate it behind migration-only handling and remove from normal config schemas.

### 4. Old migration branches for versions <=6 are PaperEntity-era baggage
- app/service/services/database/migration.ts:13-98 mutates PaperEntity records for title/authors/publication defaults, basename conversion, _id copy, tags/folders IDs, codes, and pages/volume/number/publisher backfills.

Assessment: compat-only, assuming supported databases have mostly converged past these versions.

Risk:
- The longer these branches remain, the harder it is to reason about current schema invariants.

Recommended follow-up:
- Define minimum supported historical DB version and prune unreachable migration branches once telemetry/manual upgrade testing supports it.

## Category: ambiguous

### 1. Realm cloud sync support itself appears half-legacy, half-active
Evidence of continued Realm sync support:
- app/service/services/database/core.ts:87-126 still opens a cloud Realm and runs syncMigrate.
- app/service/services/database/core.ts:261-410 still constructs cloud configs for flexible and partition sync.
- app/service/services/database/core.ts:427-470 still logs into Realm.App with syncEmail/realmSync credentials.
- app/main/services/preference-service.ts:43 and 165-167 still define useSync values including "realm" and isFlexibleSync.

Evidence of newer non-Realm sync path:
- app/service/services/sync-service.ts:3-4 explicitly stores sync logs outside Realm.
- app/service/services/sync-service.ts:168-200 only auto-initializes the new path when useSync === "official".
- app/service/services/sync-service.ts:400-556 performs HTTP pull/merge/push of syncLogs against a remote API.

Assessment: ambiguous. There are clearly two sync concepts: old Realm database sync and newer official log-based sync.

Risk:
- Persisting both models makes _partition, Realm.App auth, and cloud-specific migrations hard to remove safely.
- Product behavior may differ based on preference combinations that are no longer fully exercised.

Recommended follow-up:
- Decide whether "realm" and/or "self-host" are still supported modes.
- If only official sync matters, plan a deprecation path for DatabaseCore cloud logic.

### 2. migrateLocaltoCloud methods may be dead migration tooling or still-needed escape hatches
- app/service/services/paper-service.ts:924-937 has migrateLocaltoCloud stubbed and commented out.
- app/service/services/smartfilter-service.ts:240-280 implements migrateLocaltoCloud using local Realm reads and current service update paths.
- app/service/services/categorizer-service.ts:534-577 implements a similar local-to-cloud migration path.

Assessment: ambiguous.

Risk:
- These methods imply a manual bridge from local to cloud persistence, but inconsistent implementation suggests they may no longer be tested.

Recommended follow-up:
- Verify whether any UI or upgrade workflow still calls these methods. If not, mark deprecated and remove later.

### 3. paperEntityListened looks vestigial but may exist for old callers
- app/index.d.ts:163 declares paperEntityListened.
- app/service/services/database/core.ts:149 initializes paperEntityListened = false.
- Search of active repositories shows Entity listeners use entityListened, not paperEntityListened.

Assessment: ambiguous leaning removable.

Risk:
- Could be retained for old code paths not covered in this audit, but no active paper repository use was found.

Recommended follow-up:
- Search wider app/tests for reads of paperEntityListened and remove if truly unused.

## Category: removable later

### 1. PaperEntity schema registration in fresh database configs
- app/service/services/database/core.ts:240, 270, 377 include PaperEntity.schema in all local/cloud schema arrays.

Assessment: removable later, after confirming no supported upgrade/live data path still depends on opening PaperEntity alongside Entity.

Risk:
- Removing too early could break opening old realm files or extension code expecting the schema to exist.

Recommended follow-up:
- First audit real persisted files and sync snapshots for presence of PaperEntity objects.

### 2. PaperPaperSmartFilter schema registration and subscription
- app/service/services/database/core.ts:276-287, 351-358, 383-394.

Assessment: removable later, likely sooner than PaperEntity if migration-only support can be isolated.

Risk:
- Legacy synced realms may still require model visibility during one-time upgrade.

Recommended follow-up:
- Restrict registration to migration contexts instead of every open.

### 3. Commented/cloud migration stubs
- app/service/services/paper-service.ts:924-937.

Assessment: removable later.

Risk:
- Minimal technical risk; primary risk is deleting a troubleshooting path someone still uses informally.

Recommended follow-up:
- Confirm no callers and remove with changelog note.

### 4. Legacy naming in service/repository APIs
- app/service/repositories/db-repository/paper-entity-repository.ts filename/class name still refers to PaperEntity despite operating on Entity.
- app/service/services/paper-service.ts and app/service/services/scrape-service.ts still use "PaperEntity" in comments/payload labels.

Assessment: removable later.

Risk:
- Mostly cognitive/maintenance risk, but external plugin compatibility must be preserved during rename.

Recommended follow-up:
- Add compatibility aliases or versioned extension API changes before renaming.

## Repository assumption audit

### A. Main library assumption is hardcoded
- app/service/repositories/db-repository/paper-entity-repository.ts:116 and 123 force library == 'main'.
- app/service/repositories/db-repository/paper-entity-repository.ts:157 hard-sets paperEntity.library = "main".
- app/service/repositories/db-repository/categorizer-repository.ts:434 uses library == 'main' when counting folder membership.

Assessment:
- Active assumption, but also technical debt if multi-library support is planned.

Risk:
- Hidden coupling between persistence and product scope; non-main libraries would silently disappear from standard queries.

Recommended follow-up:
- Either codify single-library scope explicitly or parameterize library in repository APIs.

### B. Deduplication still relies on title+authors fallbacks
- app/service/repositories/db-repository/paper-entity-repository.ts:63-73.
- app/service/repositories/db-repository/feed-entity-repository.ts:48-58.

Assessment:
- Active repository behavior with legacy flavor.

Risk:
- False positives/negatives in dedupe, especially across imported feeds and partially normalized metadata.

Recommended follow-up:
- Revisit dedupe keys now that Entity includes richer identifiers like doi/arxiv/issn/isbn.

### C. Root names are schema assumptions, not just UI labels
- app/service/repositories/db-repository/categorizer-repository.ts:52-56, 74-78, 171-210.
- app/service/services/database/migration.ts:109-117, 145-152, 187-196, 245-252, 277-284, 319-328 create root objects by name.

Assessment:
- Active assumption with migration coupling.

Risk:
- Renaming roots in UI/localization would break persistence logic unless decoupled.

Recommended follow-up:
- Separate display labels from stored root identity.

## Sync semantics audit

### Realm-sync-era semantics still embedded in persistence layer
- app/service/services/database/core.ts:89-126 opens cloud realm and runs syncMigrate after open.
- app/service/services/database/core.ts:265-360 supports flexible sync with per-model subscriptions filtered by _partition.
- app/service/services/database/core.ts:397-400 supports partition sync mode.
- app/service/services/database/core.ts:456-464 authenticates with Realm email/password credentials.

Classification: ambiguous/legacy-heavy active.

### New official sync is log-based and service-level, not Realm-level
- app/service/services/sync-service.ts:28-43 defines SyncLog schema.
- app/service/services/paper-service.ts:222-228, 457-461, 651-655, 717-720, 762-765 writes sync logs around paper mutations.
- app/service/services/sync-service.ts:400-556 pulls remote logs, replays them locally, then POSTs local logs.

Classification: active/required if official sync is the intended future.

Risk across both systems:
- Paper persistence now sits between two sync models with different conflict semantics.
- Realm sync works on object replication, while official sync replays service operations and uses timestamps/log IDs.
- That split delays removal of _partition and legacy cloud migration code.

Recommended follow-up:
- Choose one canonical sync architecture and mark the other deprecated.
- If official sync wins, move persistence cleanup behind that decision.

## Recommended follow-up plan

1. Decide sync support matrix
- Confirm whether useSync values "realm" and "self-host" remain supported alongside "official".
- This determines whether _partition, Realm.App login, and cloud schema baggage can be removed.

2. Measure real legacy object presence
- Inspect representative local/synced realm files for PaperEntity and PaperPaperSmartFilter object counts before deleting schema registration.

3. Separate compatibility surface from storage surface
- Keep extension-facing "PaperEntity" compatibility only at adapters/boundaries.
- Internally rename repositories/services/types to Entity-focused terminology.

4. Prune unreachable migrations
- Establish minimum upgradeable DB version and remove PaperEntity-era migration branches below that threshold.

5. Remove unused listener/schema residues
- Verify paperEntityListened and any remaining PaperEntity-only callers.
- Then remove paperEntityListened and eventually PaperEntity schema registration.

## Bottom line

The repo is already functionally centered on Entity, but it still carries a substantial Realm-era compatibility shell. The highest-value cleanup opportunities are not random deletions; they depend on first settling the sync strategy and verifying whether live data still contains PaperEntity/PaperPaperSmartFilter objects. Until that is done, those pieces should be treated as compatibility scaffolding rather than dead code.