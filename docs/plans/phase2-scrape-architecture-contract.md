# Phase 2 Scrape Architecture Contract

Date: 2026-04-02
Status: Draft Contract
Scope: target internal scrape architecture for `paperlib` and the current official scrape extensions under `paperlib-extensions`

## 1. Purpose

This document freezes the intended Phase 2 scrape architecture boundary for the current fork.
It is not a generic roadmap. It is a contract that:

1. anchors the current scrape entry points and extension glue,
2. identifies the legacy coupling that Phase 2 must replace,
3. defines the target internal architecture in explicit layers, and
4. names concrete files that must either remain boundary owners or be refactored behind new contracts.

Unless a later Phase 2 follow-up supersedes this file, the contracts below should be used as:

- implementation guidance,
- review criteria,
- regression expectations,
- extension compatibility guidance.

## 2. Code anchors

This contract is based on the current implementation in the following files.

Core app:
- `app/service/services/scrape-service.ts`
- `app/base/metadata.ts`
- `app/service/services/paper-service.ts`
- `app/service/services/browser-extension-service.ts`
- `tests/unit-tests/services/scrape-service.spec.ts`

Official entry scrape extension:
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/main.ts`
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts`
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/entry-scraper.ts`
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/paperentity-entry-scraper.ts`
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/pdf-entry-scraper.ts`
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/webcontent-*.ts`

Official metadata scrape extension:
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts`
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts`
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/scrapers/scraper.ts`
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/scrapers/arxiv.ts`

If code and this document diverge, this document defines the intended Phase 2 architecture target and the code becomes the migration subject.

## 3. Current architecture snapshot

## 3.1 Current top-level scrape entry points

Current user-visible scrape flows enter the system from these app-level call sites:

1. `app/service/services/browser-extension-service.ts:85`
   - Browser-extension import builds a `webcontent` payload.
   - Calls `this._scrapeService.scrape([payload], [])`.
   - Immediately persists via `this._paperService.update(scrapedPaperEntities, true, false)`.

2. `app/service/services/paper-service.ts:772`
   - Library metadata refresh calls `this._scrapeService.scrape(...)`.
   - Wraps each paper as `{ type: "PaperEntity", value: paperEntity }`.
   - Persists via `await this.update(scrapedPaperEntityDrafts, false, true)`.

3. `../paperlib-extensions/paperlib-entry-scrape-extension/src/main.ts:163`
   - The entry extension command `_import()` creates `PaperEntity` drafts from DOI/arXiv/title/web URL inputs.
   - Calls `PLAPI.scrapeService.scrape(...)` with paperentity-style payloads.
   - Immediately persists via `PLAPI.paperService.update(scrapedEntities)`.

These are the practical scrape entry points that matter for Phase 2. They currently combine orchestration, extension dispatch, and persistence too closely.

## 3.2 Current app-side scrape orchestration

`app/service/services/scrape-service.ts` currently owns all of the following responsibilities:

1. extension readiness gating via `_scrapeExtensionReady()` (`:55`),
2. payload splitting between raw entry payloads and `PaperEntity` bypass payloads (`:116-129`),
3. chunking and progress logging for scrape jobs (`:135-188`),
4. hook dispatch for entry scrape (`scrapeEntry`, `:199-233`),
5. hook dispatch for metadata scrape (`scrapeMetadata`, `:244-288`),
6. fuzzy candidate scrape (`fuzzyScrape`, `:302-397`).

This means the current `ScrapeService` is both:
- the public application facade, and
- the internal pipeline implementation.

Phase 2 must split those concerns.

## 3.3 Current plugin / extension glue

Current glue is hook-based, not contract-based.

Entry glue:
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/main.ts:43-45`
  registers `PLAPI.hookService.hookTransform("scrapeEntry", this.id, "scrapeEntry")`.
- App dispatch happens in `app/service/services/scrape-service.ts:210-220`
  via `this._hookService.transformhookPoint("scrapeEntry", ...)`.

Metadata glue:
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:156-158`
  registers `PLAPI.hookService.hookModify("scrapeMetadata", this.id, "scrapeMetadata")`.
- App dispatch happens in `app/service/services/scrape-service.ts:264-274`
  via `this._hookService.modifyHookPoint("scrapeMetadata", ...)`.

Important consequence:
- entry scraping is modeled as a transform hook that returns entities,
- metadata scraping is modeled as a modify hook that mutates and returns the whole `[paperEntityDrafts, scrapers, force]` tuple.

That tuple-shaped hook API is the primary architectural leak Phase 2 must remove.

## 3.4 Current extension-internal registries

The official extensions already contain local registry-like maps.

Entry extension:
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:23-43`
  defines `SCRAPER_OBJS` and `ADDITIONAL_SCRAPER_OBJS`.
- Dispatch is a sequential loop over all registered scrapers for each payload (`:76-108`).

Metadata extension:
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:8-32`
  defines `PRECISE_SCRAPERS`, `FUZZY_SCRAPERS`, `ADDITIONAL_SCRAPERS`, `PAPERLIB_METADATA_SERVICE_SCRAPERS`, `CLIENTSIDE_SCRAPERS`, and `SCRAPER_OBJS`.
- Dispatch policy is spread across `scrape()`, `scrapePMS()`, local backup logic, and client-side fallback.

Phase 2 should preserve the idea of registries, but move the contract to the app-owned internal architecture rather than leaving it implicit inside extensions.

## 3.5 Current bypass semantics

`app/service/services/scrape-service.ts` already supports a bypass payload:
- `_isPaperEntityPayload()` at `:33-38`
- `_getPaperEntityDraftsFromPayloads()` at `:40-46`
- direct bypass path in `scrape()` at `:116-129`

The current unit tests lock in this compatibility:
- `tests/unit-tests/services/scrape-service.spec.ts:104-171`
  verifies `PaperEntity` payloads bypass `scrapeEntry` hooks.
- `tests/unit-tests/services/scrape-service.spec.ts:53-102`
  verifies metadata hook results are rehydrated into `Entity` instances.

Phase 2 must preserve the bypass behavior, but express it as an input resolver contract instead of an ad hoc payload type check inside the main facade.

## 3.6 Current merge and persistence behavior

Current merge logic is not centralized in the scrape pipeline.

Observed state:
- `app/base/metadata.ts:45-77` exports `mergeMetadata(...)` and preserves user-owned fields such as `relatedPaperIds`, `tags`, `folders`, `supplementaries`, `defaultSup`, `note`, `flag`, `rating`, `addTime`, `library`, `_partition`, and `_id`.
- `app/base/metadata.ts:18-29` defines `isMetadataCompleted(...)`.
- `app/service/services/paper-service.ts:185-327` owns file movement, duplicate handling, relation preservation, database writes, failed-write cleanup, cache updates, and folder sync.

In practice this means:
- scrape returns entity drafts,
- persistence is decided by callers,
- merge policy is partly outside the scrape facade,
- the persistence boundary is caller-driven instead of architecture-driven.

Phase 2 must make these boundaries explicit.

## 4. Problems to fix in Phase 2

## 4.1 Hook tuple coupling

Current metadata extension glue exchanges `[paperEntityDrafts, scrapers, force]` tuples through `modifyHookPoint`.
This is brittle because:
- it couples hook ordering to positional tuple semantics,
- any new pipeline field becomes a hook API break,
- provider output cannot carry structured diagnostics cleanly,
- the extension hook owns both control input and data output.

Contract: Phase 2 must replace tuple-style scrape contracts with named request / result objects.

## 4.2 No app-owned provider contract

The app currently knows only hook names (`scrapeEntry`, `scrapeMetadata`, `fuzzyScrapeMetadata`) and not provider capabilities.
As a result:
- provider discovery is implicit,
- priority and applicability are extension-local,
- result confidence / provenance / diagnostics are not normalized.

Contract: Phase 2 must introduce an app-owned provider registry contract.

## 4.3 No normalized result envelope

Current providers effectively return bare `PaperEntity` objects or mutated entity arrays.
There is no normalized envelope for:
- provider id,
- match basis (doi/title/arxiv/url/etc.),
- confidence,
- partial vs complete result,
- warnings/errors,
- whether a provider changed user-owned fields,
- why a provider was skipped.

Contract: every Phase 2 provider execution must produce a normalized result envelope, even for failure or no-match cases.

## 4.4 Merge policy is not a first-class layer

`mergeMetadata(...)` exists, but the pipeline contract does not state when, how, and against which source envelopes it is applied.
This leaves ambiguity around:
- provider ordering,
- force refresh semantics,
- preserved fields,
- partial provider results,
- preprint-to-published upgrades.

Contract: Phase 2 must define a dedicated merge layer between provider results and persistence.

## 4.5 Persistence is too close to scrape callers

Callers such as `BrowserExtensionService` and `PaperService.scrape()` immediately persist scrape results.
This makes it hard to support:
- dry-run / preview scrape,
- merge inspection,
- debugging provider output,
- alternate persistence backends,
- explicit approval flows.

Contract: Phase 2 must define a hard persistence boundary after merge finalization.

## 5. Phase 2 target architecture

The target architecture is a five-layer pipeline:

1. Input resolvers
2. Provider registry
3. Result envelope
4. Merge layer
5. Persistence boundary

The public facade may stay named `ScrapeService`, but it becomes only an orchestration facade over these contracts.

## 5.1 Input resolvers contract

An input resolver converts an external scrape request into a normalized internal scrape seed.

### Responsibilities

Input resolvers must:
- classify input shape,
- preserve caller intent,
- emit normalized seeds for entry or metadata resolution,
- preserve the existing `PaperEntity` bypass behavior,
- avoid persistence side effects.

### Required resolver kinds

At minimum, Phase 2 must support resolvers for:
- `PaperEntity` / existing entity drafts,
- `webcontent` payloads from browser import,
- file-oriented payloads such as PDF and BibTeX,
- identifier-oriented inputs originating from extension commands or future direct API calls.

### Normalized seed contract

Every resolver output must include these conceptual fields:
- `kind`: `entry` or `metadata`
- `sourceType`: e.g. `paperEntity`, `webcontent`, `pdf`, `bibtex`, `identifier`, `url`
- `sourcePayload`: original payload or a traceable reference to it
- `seedEntity`: optional draft entity when already known
- `hints`: normalized lookup hints such as `doi`, `arxiv`, `title`, `url`, `publication`
- `requestedProviders`: optional provider ids selected by caller
- `force`: boolean
- `origin`: caller identity such as `browser-extension`, `paper-refresh`, `entry-extension-import`

### File references

Current logic to absorb into input resolvers:
- `app/service/services/scrape-service.ts:33-46`
- `app/service/services/scrape-service.ts:116-129`
- `app/service/services/browser-extension-service.ts:80-88`
- `app/service/services/paper-service.ts:783-792`
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/main.ts:104-166`

### Compatibility contract

The `PaperEntity` bypass remains supported exactly as a resolver behavior:
- bypass inputs must not invoke entry providers,
- bypass inputs may still invoke metadata providers,
- returned entities must remain proper `Entity` instances after hook/provider adaptation.

This compatibility is anchored by:
- `tests/unit-tests/services/scrape-service.spec.ts:53-102`
- `tests/unit-tests/services/scrape-service.spec.ts:104-171`

## 5.2 Provider registry contract

The provider registry is the app-owned directory of all scrape providers.
It replaces implicit hook-name dispatch as the primary execution model.

### Responsibilities

The registry must:
- register providers with stable ids,
- expose provider capabilities,
- select applicable providers for a normalized seed,
- order providers deterministically,
- support provider scoping by caller-requested ids,
- separate entry providers from metadata providers,
- allow adapter-backed extension providers during migration.

### Required provider metadata

Every provider registration must declare at least:
- `id`: stable provider id
- `phase`: `entry`, `metadata`, or `fuzzy-metadata`
- `sourceTypes`: supported input/source kinds
- `matchKinds`: e.g. `doi`, `arxiv`, `title`, `url`, `pdf`, `bibtex`, `paperEntity`
- `priority`: deterministic ordering key
- `breakable`: whether later providers may be skipped after strong success
- `mustWait`: whether provider completion is blocking before merge finalization
- `origin`: `core`, `official-extension`, or `third-party-extension`

These fields intentionally mirror existing extension concepts such as:
- `breakable` and `mustwait` in `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:8-28`
- the map registries in `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:23-43`

### Adapter migration rule

During migration, official extension hooks may be adapted into provider registrations rather than rewritten immediately.

Allowed transitional adapters:
- hook-backed entry provider adapter for `scrapeEntry`
- hook-backed metadata provider adapter for `scrapeMetadata`
- hook-backed fuzzy metadata adapter for `fuzzyScrapeMetadata`

But the app-owned registry is the contract owner; hook names become implementation details.

### File references

Current provider-like registries to normalize behind this contract:
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:23-43`
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:8-32`
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/main.ts:43-45`
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:156-158`
- `app/service/services/scrape-service.ts:210-220`
- `app/service/services/scrape-service.ts:264-274`
- `app/service/services/scrape-service.ts:366-380`

## 5.3 Result envelope contract

Every provider execution must emit a result envelope, not a bare entity.
This applies to success, partial success, no-match, skip, and error outcomes.

### Required envelope fields

Each envelope must carry at least:
- `providerId`
- `phase`
- `seedId` or equivalent request-local correlation id
- `status`: `success`, `partial`, `no-match`, `skipped`, `error`
- `entity`: optional normalized entity patch or full entity result
- `matchBasis`: e.g. `doi`, `arxiv`, `title`, `url`, `pdf-text`, `user-seed`
- `confidence`: normalized score or enum
- `completeness`: whether required metadata fields are satisfied
- `preservedFields`: fields intentionally not overwritten
- `warnings`: structured warnings
- `errors`: structured errors
- `timingMs`
- `rawProvenance`: optional raw source trace or external record id

### Contract rules

1. Providers must not silently swallow failures into empty entities.
2. `no-match` is distinct from `error`.
3. A provider may return a partial envelope with a useful patch.
4. Merge consumes envelopes, not providers directly.
5. Logging and UI progress should be derivable from envelopes rather than ad hoc side effects alone.

### File references

This contract normalizes behavior currently spread across:
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:72-119`
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:92-178`
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:188-220` and downstream fallback methods
- `app/service/services/scrape-service.ts:148-183`

## 5.4 Merge layer contract

The merge layer is a dedicated internal stage that combines:
- the original seed entity state,
- one or more provider result envelopes,
- force-refresh policy,
- preserved-field policy,
- completion policy.

### Responsibilities

The merge layer must:
- apply provider outputs in deterministic order,
- preserve user-owned fields by default,
- support force refresh without violating hard-preserved fields,
- distinguish enrichment from replacement,
- record provenance of the winning provider per field where feasible,
- output a finalized merged entity plus merge diagnostics.

### Preserved fields contract

The current preserved-field baseline from `app/base/metadata.ts:3-16` remains the minimum contract unless explicitly revised:
- `relatedPaperIds`
- `tags`
- `folders`
- `supplementaries`
- `defaultSup`
- `note`
- `flag`
- `rating`
- `addTime`
- `library`
- `_partition`
- `_id`

### Completion and preprint contract

Current semantics in `app/base/metadata.ts` must remain the default merge policy baseline:
- `isMetadataCompleted(...)` (`:18-29`) remains the completion check baseline.
- `isPreprint(...)` (`:31-43`) remains the baseline published-vs-preprint heuristic.
- `mergeMetadata(...)` (`:45-77`) remains the migration baseline for field-preserving merge behavior.

Phase 2 may replace the function implementation, but not the user-visible semantics without an explicit new contract.

### Merge output contract

The merge layer must output:
- `mergedEntity`
- `fieldWinners` or equivalent provenance map where practical
- `envelopesApplied`
- `envelopesSkipped`
- `mergeWarnings`
- `isMetadataCompleted`

### File references

Current merge semantics anchored in:
- `app/base/metadata.ts`
- `tests/unit-tests/services/scrape-service.spec.ts:8-51`

## 5.5 Persistence boundary contract

Persistence is outside scrape resolution.
This is the most important boundary to enforce in Phase 2.

### Rule

Scrape orchestration may return finalized merged entities and diagnostics, but it must not itself decide database writes, file moves, cache updates, or folder sync.

Those remain persistence concerns owned by `PaperService` or another explicit persistence application service.

### Current persistence owner

`app/service/services/paper-service.ts:185-327` currently owns:
- sync log creation,
- file movement,
- duplicate handling,
- relation preservation,
- repository update,
- cleanup on failed writes,
- cache updates,
- folder synchronization.

This remains the persistence owner in Phase 2 unless separately refactored by contract.

### Allowed callers after Phase 2

Callers may do one of two things after scrape finalization:

1. preview path
   - inspect merged results and diagnostics with no persistence

2. commit path
   - explicitly pass merged entities to `PaperService.update(...)` or equivalent persistence service

### File references

Current callers that cross this boundary and must remain explicit callers rather than hidden scrape side effects:
- `app/service/services/browser-extension-service.ts:85-107`
- `app/service/services/paper-service.ts:772-795`
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/main.ts:163-166`

## 6. Required app-layer refactor shape

Phase 2 should move `app/service/services/scrape-service.ts` toward this structure:

1. `ScrapeService` as public facade only
   - request normalization
   - high-level orchestration
   - progress reporting
   - compatibility wrappers

2. internal input resolver module
   - owns payload classification and seed normalization

3. internal provider registry module
   - owns provider registration and selection

4. internal execution module
   - runs selected providers and emits envelopes

5. internal merge module
   - merges envelopes onto seed entities

6. caller-owned persistence
   - still routed through `PaperService.update(...)`

This is an architecture contract, not a naming contract; exact file names may vary. But the ownership boundaries above must be visible in code.

## 7. Transitional compatibility rules

To avoid breaking the current ecosystem, Phase 2 must preserve the following externally visible behaviors during migration.

## 7.1 Existing hook compatibility

The existing hooks may continue to exist temporarily:
- `beforeScrapeEntry`
- `scrapeEntry`
- `afterScrapeEntry`
- `beforeScrapeMetadata`
- `scrapeMetadata`
- `afterScrapeMetadata`
- `beforeFuzzyScrape`
- `fuzzyScrapeMetadata`

But they become compatibility adapters, not architecture-defining interfaces.

## 7.2 Entity rehydration compatibility

Any hook/provider adapter that returns plain objects must be rehydrated into `Entity` instances before leaving the scrape facade.
This behavior is already covered by:
- `app/service/services/scrape-service.ts:249-285`
- `tests/unit-tests/services/scrape-service.spec.ts:53-102`

## 7.3 PaperEntity bypass compatibility

Bypass payloads must continue to skip entry execution and go directly to metadata enrichment.
This behavior is already covered by:
- `app/service/services/scrape-service.ts:116-129`
- `tests/unit-tests/services/scrape-service.spec.ts:104-171`

## 8. Non-goals for this contract

This contract does not freeze:
- exact TypeScript interface names,
- exact file paths for new internal modules,
- UI changes for scrape progress,
- remote metadata service product decisions,
- provider-specific algorithms inside arXiv, IEEE, Crossref, etc.

Those can evolve as long as they respect the contracts in Sections 5 through 7.

## 9. Acceptance criteria for Phase 2 architecture work

Phase 2 scrape architecture work should be considered contract-complete only when all of the following are true:

1. The app has an explicit input normalization step for scrape requests.
2. The app owns a provider registry abstraction with deterministic provider selection.
3. Provider execution emits normalized result envelopes.
4. Merge is a distinct internal layer, not an incidental caller behavior.
5. Persistence is explicitly outside scrape execution.
6. Existing `PaperEntity` bypass behavior still works.
7. Existing hook-based official extensions can still function through adapters or are migrated onto the registry contract.
8. Existing preserved metadata semantics remain intact unless superseded by a new contract.

## 10. Summary contract statement

Phase 2 redefines scraping from “hook-driven mutation of arrays and tuples” into “resolver -> provider registry -> result envelopes -> merge -> explicit persistence”.

Concretely:
- input classification moves out of ad hoc `payload.type` branching and into resolvers,
- extension glue moves out of architecture-defining hook names and into provider adapters/registrations,
- provider outputs stop being bare entities and become normalized envelopes,
- merge policy becomes a first-class layer anchored by `app/base/metadata.ts`,
- persistence remains owned by `PaperService`, not hidden inside scrape orchestration.
