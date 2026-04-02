# Phase 1 Edge Migration Seam: from relatedPaperIds lists to future relation edges

Date: 2026-04-02
Status: Phase 1 planning seam document
Scope: document the practical seam needed to migrate the current paper-to-paper relation model from `Entity.relatedPaperIds` to a future edge store without rewriting the whole UI first.

## Goal

The current fork stores paper relations inline on each paper entity as `relatedPaperIds`. That works today, but it couples persistence, sync payloads, and many read paths directly to a list field on `Entity`.

Phase 1 should not implement a new edge model yet. It should define a migration seam so that Phase 2+ can introduce a dedicated `PaperRelation` edge store while keeping current behavior stable.

The seam should let us:

- preserve current user-visible behavior and tests now
- stop spreading new direct `relatedPaperIds` assumptions through the codebase
- keep sync replay semantics understandable during transition
- let graph/detail/batch UI swap to relation queries later instead of raw field access
- support an eventual canonical edge model like `PaperRelation { _id, sourcePaperId, targetPaperId, kind, createdAt, updatedAt, ... }`

## Current storage contract

The current persistent contract is still the inline list field:

- `app/models/entity.ts:68` declares `relatedPaperIds?: OID[]` on drafts
- `app/models/entity.ts:126` defines the Realm schema as `list<objectId>`
- `app/models/entity.ts:174` keeps the runtime entity field as `relatedPaperIds!: OID[]`
- `app/models/entity.ts:271` maps stored ids into `ObjectId` instances on construction

Migration implication: today there is no first-class relation object, no relation repository, and no separate query surface for edges. The seam therefore has to be introduced above the storage layer first, not by immediately changing Realm schema consumers everywhere.

## Current write paths

There are four effective write paths that matter.

### 1. General paper update persists whatever relation list is on the entity draft

`PaperService.update()` still writes whole paper entities through the repository:

- sync log written at `app/service/services/paper-service.ts:221-228`
- repository update call at `app/service/services/paper-service.ts:263-271`
- repository persists `object.relatedPaperIds = paperEntity.relatedPaperIds` at `app/service/repositories/db-repository/paper-entity-repository.ts:267-270` and `:299-302`

Repository normalization is minimal:

- `app/service/repositories/db-repository/paper-entity-repository.ts:166-168` dedupes ids and converts to `ObjectId`

Important seam implication: generic metadata updates can still carry relation state accidentally because whole-entity update remains a write path. Future edge migration should avoid making generic paper upserts responsible for relation persistence.

### 2. Detail-view single-paper editing uses `setRelatedPaperIds()`

The explicit relation write API today is `PaperService.setRelatedPaperIds()`:

- method starts at `app/service/services/paper-service.ts:631`
- it logs a paper update with `relatedPaperUpdate` payload at `app/service/services/paper-service.ts:651-657`
- it loads the source paper and requested target papers at `:661-669`
- it rewrites the source paper list at `:676`
- it enforces reverse links on all related papers at `:678-685`
- it removes stale reverse links from previously-related papers at `:687-701`

Renderer caller:

- `app/renderer/ui/main-view/detail-view/components/related-papers.vue:84-88`

Behavioral contract today:

- invalid ids are ignored
- self links are ignored
- nonexistent targets are ignored
- symmetry is enforced by mutating multiple paper records in one write transaction

This is the cleanest current seam candidate because it already represents an intent-level operation: “set the relation neighborhood for this paper”.

### 3. Batch relate / unrelate uses dedicated service methods

Batch commands are separate service methods:

- `PaperService.relateSelectedPapers()` at `app/service/services/paper-service.ts:706-749`
- `PaperService.unrelateSelectedPapers()` at `app/service/services/paper-service.ts:751-789`

They are called from:

- `app/renderer/ui/main-view/data-view/paper-data-view.vue:71-90`
- `app/renderer/ui/main-view/data-view/paper-data-view.vue:92-111`

They also emit sync payloads:

- relate payload at `paper-service.ts:717-724`
- unrelate payload at `paper-service.ts:762-769`

Current semantics:

- relate makes the selected set a clique by adding every selected paper to every other selected paper’s list
- unrelate removes links only among the selected set
- both methods mutate `relatedPaperIds` inline on each touched paper

These are also good seam candidates because they express relation operations, not generic paper writes.

### 4. Delete cleanup removes dangling ids from remaining papers

Relation cleanup happens in two places today:

- service-level cleanup before delete at `app/service/services/paper-service.ts:465-487`
- repository-level cleanup during delete at `app/service/repositories/db-repository/paper-entity-repository.ts:377-385`

Both strip deleted paper ids out of surviving papers’ `relatedPaperIds`.

Migration implication: future edge storage should collapse this to one authoritative cleanup path. With a real edge store, delete cleanup becomes edge deletion, not a whole-library scan of paper records.

## Current UI and read dependencies

The main UI still reads relation state directly from `Entity.relatedPaperIds`.

### Detail panel related papers component

`app/renderer/ui/main-view/detail-view/components/related-papers.vue` depends on the inline list in three ways:

- it decides whether relations exist with `props.entity.relatedPaperIds?.length` at `:61-64`
- it loads related paper records via `PLAPI.paperService.loadByIds(props.entity.relatedPaperIds)` at `:69-71`
- it computes add/remove drafts by editing the current id list in memory at `:97-102`, `:115-118`, and filters search results against that same list at `:154-162`
- its watcher keys off `JSON.stringify((props.entity.relatedPaperIds || []).map(...))` at `:171-179`

This component is the strongest current example of storage leaking into renderer state. A seam should replace “UI owns and edits the list field” with “UI asks a relation service for neighbors and submits relation commands”.

### Data view batch affordances

`app/renderer/ui/main-view/data-view/paper-data-view.vue` uses raw relation lists to determine whether the current selection can be un-related:

- `canUnrelateSelection()` checks `(paper.relatedPaperIds || []).some(...)` at `:54-69`

The actual write calls already go through service commands, which is good. The read-side enablement logic still assumes inline relation lists are preloaded on each entity.

### Graph derivation

`app/renderer/utils/paper-graph.ts` derives graph edges directly from the loaded entity set:

- it iterates `entity.relatedPaperIds` at `:316-352`
- it only keeps edges whose target paper is also in the currently loaded entity set at `:319-323`
- it drops self links at `:326-328`
- it dedupes each pair into one undirected graph edge at `:330-345`
- it computes node relation counts from those derived visible edges at `:347-351`

Tests lock this behavior in:

- `tests/unit-tests/renderer/paper-graph.spec.ts:136-186`
- `tests/unit-tests/renderer/paper-graph-view.spec.ts`

Migration implication: the graph does not need raw inline lists specifically; it needs a relation-neighbor source for the active entity set, plus the current rule that only visible, in-filter entities produce drawn edges.

### Candidate / metadata-refresh preservation path

The candidate view copies `relatedPaperIds` forward when drafting metadata updates:

- `app/renderer/ui/main-view/candidate-view/candidate-view.vue:34-40`

This is an important dependency because it shows the app currently treats `relatedPaperIds` as part of the normal paper draft payload. That is precisely the coupling the seam should reduce.

## Current sync payload implications

Sync currently treats relation changes as paper update logs, not as relation entities.

Schema and replay:

- sync log schema is defined at `app/service/services/sync-service.ts:28-43`
- replay loop is at `app/service/services/sync-service.ts:400-580`

Current relation-specific payload shapes inside `entity_type: "paper"` / `operation: "update"` are:

1. Single-paper relation set:
   - emitted by `paper-service.ts:651-657`
   - replayed by `sync-service.ts:463-469`

2. Batch relation command:
   - emitted by `paper-service.ts:717-724` and `:762-769`
   - replayed by `sync-service.ts:471-489`

3. Generic paper update payloads may also carry `relatedPaperIds` inside `paperEntityDrafts`:
   - emitted by `paper-service.ts:221-228`
   - replayed by `sync-service.ts:491-496`

This creates a migration hazard:

- relation changes already have special command-shaped sync payloads
- but whole-paper updates can still implicitly overwrite relation state because `paperEntityDrafts` includes `relatedPaperIds`

So Phase 1 seam work should aim for a rule like: explicit relation operations are authoritative for relation persistence; generic paper updates should preserve relation state unless relation mutation was explicitly requested.

That is consistent with the existing Phase 1 docs around preserving relation state during metadata refresh.

## Current graph derivation contract to preserve

Any edge-model migration must preserve these practical graph semantics from `app/renderer/utils/paper-graph.ts` and its tests:

- graph is derived from the currently loaded filtered paper set, not the whole library
- missing targets do not create dangling graph edges
- self links are ignored
- duplicate forward/backward storage still renders as one visible edge
- node degree shown in the graph is based on visible graph edges, not necessarily total library-wide relation count
- edge direction in the graph is derived from publication time, not from stored relation direction

This is good news for migration: a future `PaperRelation` model does not need to store graph-specific undirected edges. The renderer can continue deriving its graph view from a relation query result scoped to the active entity set.

## The seam to introduce

Phase 1 should define one clear abstraction boundary:

1. Write-side relation commands go through a dedicated relation-oriented service API.
2. Read-side relation access goes through resolver/query helpers, not direct renderer dependence on `entity.relatedPaperIds`.
3. Storage-specific details remain behind that API so inline lists and edge rows can coexist temporarily.

Pragmatically, that seam can be described as a `PaperRelationGateway` or relation module, even if the first implementation still uses `relatedPaperIds` under the hood.

### Write seam

Keep these as the only relation mutation intents exposed upward:

- `setRelations(paperId, relatedIds)`
- `relatePapers(paperIds)`
- `unrelatePapers(paperIds)`
- `removePaperRelations(paperIds)` for delete cleanup

Today those map directly to:

- `PaperService.setRelatedPaperIds()`
- `PaperService.relateSelectedPapers()`
- `PaperService.unrelateSelectedPapers()`
- delete cleanup in `PaperService.delete()` / repository delete

The migration seam should explicitly discourage any new code from mutating `Entity.relatedPaperIds` through generic paper drafts.

### Read seam

Add a relation read surface shaped around actual caller needs, for example:

- `listRelatedPaperIds(paperId): OID[]`
- `listRelatedPapers(paperId): Entity[]`
- `hasRelationBetween(a, b): boolean`
- `buildRelationSubgraph(entityIds): { neighborsByPaperId / edgePairs }`

These can initially adapt the current inline lists, but they should become the only sanctioned relation read API for:

- detail view related paper loading
- batch selection enablement
- graph edge derivation

### Representation seam

Keep `Entity.relatedPaperIds` as a compatibility projection during transition, not as the future source of truth.

Once the seam exists, the field can be treated as:

- current canonical store in Phase 1
- optional mirrored cache / compatibility projection in Phase 2 dual-write mode
- removable legacy projection after all UI and sync consumers stop depending on it

## Proposed future edge model

A pragmatic future model is an undirected canonical pair stored once, even if APIs continue to expose “neighbors of paper X”. For example:

- `PaperRelation`
- `_id`
- `paperAId`
- `paperBId`
- `kind` defaulting to `related`
- `createdAt`
- `updatedAt`
- optional provenance fields later

Important: current UI semantics are symmetric and undirected. The future store should preserve that at the persistence level instead of storing two mirrored directed rows unless there is a later product need for directionality.

Canonical invariant:

- store one row per sorted paper pair
- never store self edges
- if either endpoint is deleted, delete the edge row

That matches current user behavior better than continuing to mirror lists across paper entities forever.

## Staged migration path

### Stage 0: document and freeze the seam while keeping list storage canonical

Immediate Phase 1 objective:

- document that relation mutations must go through dedicated service methods
- document that new UI code should not directly own `relatedPaperIds` editing logic
- document that generic paper updates must preserve relation state unless explicit relation commands are present

No storage change yet.

### Stage 1: introduce relation gateway helpers on top of current lists

Implement a thin relation layer that still reads/writes `relatedPaperIds` underneath.

Expected refactors:

- move normalization/symmetry logic out of ad hoc `PaperService` methods into a relation-focused helper/module
- route detail-view loading through relation queries instead of direct `loadByIds(props.entity.relatedPaperIds)`
- route batch enablement through `hasRelationBetween` or selection-subgraph helpers
- route graph building through a relation edge resolver for the active entity set

Success criterion:

- renderer code no longer needs to know whether relations come from inline ids or edge rows

### Stage 2: stop implicit relation persistence in generic paper updates

Tighten update semantics so relation state is no longer casually rewritten through whole-paper drafts.

Practical rule:

- if a metadata refresh/update omits relation changes, existing relations remain untouched
- only explicit relation commands mutate relation state

This stage is important before dual-write, otherwise generic update replay can fight edge writes.

### Stage 3: dual-write list field plus edge store

Add `PaperRelation` persistence while preserving `relatedPaperIds` as a compatibility mirror.

During this stage:

- dedicated relation commands write the edge store first
- compatibility projection updates `relatedPaperIds` for old readers and tests
- delete cleanup deletes edges, then refreshes any compatibility projection if still enabled
- sync can continue accepting old `relatedPaperUpdate` and batch payloads, but replay should target the relation gateway, not direct entity field semantics

Success criterion:

- all visible behavior is driven by relation gateway reads, which may now come from edges

### Stage 4: switch read paths to edges as source of truth

Once detail view, graph, batch enablement, and any search/result augmentation read through the gateway, switch the gateway’s backing store from inline lists to `PaperRelation` queries.

At this point `relatedPaperIds` becomes:

- derived compatibility projection only, or
- optional migration fallback during rollout

### Stage 5: simplify sync and retire legacy field dependence

After all clients and tests are updated:

- introduce relation-native sync payloads or a dedicated `entity_type: "relation"`
- stop sending relation state inside generic `paperEntityDrafts`
- eventually remove `relatedPaperIds` from active business logic
- only then consider schema removal or one-time migration cleanup

## Concrete recommendations for this repo

1. Treat the current explicit relation methods in `app/service/services/paper-service.ts:631-789` as the seed of the seam.
2. Do not add new renderer code that edits `props.entity.relatedPaperIds` directly; wrap reads/writes behind relation helpers first.
3. Refactor `app/renderer/ui/main-view/detail-view/components/related-papers.vue` so it depends on relation queries and relation commands, not raw list manipulation.
4. Refactor `app/renderer/ui/main-view/data-view/paper-data-view.vue` selection checks so they ask relation helpers whether selected papers are connected.
5. Refactor `app/renderer/utils/paper-graph.ts` to accept resolved relation pairs or a relation resolver, while preserving current filtered-set graph semantics.
6. Remove the double delete cleanup eventually; keep one authoritative relation cleanup path.
7. Tighten generic paper update semantics so `paperEntityDrafts` do not silently become relation overwrites during metadata refresh or sync replay.
8. When edge storage arrives, prefer one canonical undirected pair row per relation instead of mirrored directed records.

## Risks and constraints

- The current renderer expects `relatedPaperIds` to already be present on loaded paper entities, so read-side decoupling is the main migration prerequisite.
- Sync replay currently mixes command-style relation updates and whole-paper updates. If generic paper updates keep carrying relation fields, dual-write will be fragile.
- Tests currently encode list-based assumptions indirectly, especially graph tests and service relation tests, so migration should preserve behavior first and swap storage second.
- `candidate-view.vue` currently copies `relatedPaperIds` into update drafts. That should eventually become preservation by default, not explicit field copying scattered across UI code.

## Phase 1 outcome to aim for

By the end of this seam work, the repo should still store relations in `Entity.relatedPaperIds`, but the architecture should be ready for edge migration because:

- relation mutations are command-based
- relation reads are query-based
- generic paper update no longer owns relation semantics
- sync replay targets relation commands instead of assuming inline-list persistence
- graph/detail/batch UI depend on a stable relation API rather than raw storage shape

That is the practical bridge from today’s inline lists to a future `PaperRelation` edge model without forcing a disruptive UI rewrite first.
