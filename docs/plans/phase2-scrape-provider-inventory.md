# Phase 2 Scrape Provider Inventory

Date: 2026-04-02
Status: planning inventory
Scope: classify current scrape/import providers by stability, current residence, migration priority, and maintenance burden so Phase 2 can internalize durable sources first and keep brittle site parsers modular.

## Why this inventory exists

Phase 2 is supposed to replace extension-glue scraping with internal provider architecture, but it should not migrate every existing scraper uniformly.

The current app still depends on the two official scrape extensions being installed and loaded before core scrape flows are considered ready:

- `app/service/services/scrape-service.ts:55-101` waits for the extension process and checks `isOfficialScrapeExtensionInstalled()`
- `app/extension/services/extension-management-service.ts:656-675` treats both `@future-scholars/paperlib-entry-scrape-extension` and `@future-scholars/paperlib-metadata-scrape-extension` as the official scrape dependency set
- `app/service/services/scrape-service.ts:199-288` still delegates `scrapeEntry` and `scrapeMetadata` through hook points rather than internal provider modules

That means the migration priority should follow architectural value, not just code size:

1. internalize stable, durable, low-maintenance providers first
2. preserve safe merge/update semantics while doing so
3. isolate volatile providers so they stop defining the architecture

## Current scrape architecture locations

### App repo

The app currently owns orchestration, hook dispatch, and metadata merge behavior, but not most provider logic.

Key files:

- `app/service/services/scrape-service.ts:111-190` defines the top-level scrape pipeline
- `app/service/services/scrape-service.ts:199-288` delegates entry and metadata work through hooks
- `app/base/metadata.ts:32-40` contains preprint/publication heuristics used during metadata merging
- `tests/unit-tests/services/scrape-service.spec.ts:53-165` already protects important hook-rehydration and PaperEntity bypass behavior

### Entry scrape extension

The entry extension owns import/input transformation from files, URLs, HTML pages, and serialized app formats into `PaperEntity` drafts.

Key files:

- `../paperlib-extensions/paperlib-entry-scrape-extension/src/main.ts:37-45` registers the `scrapeEntry` transform hook
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:23-43` declares the active entry scraper registry
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:72-119` runs the registry and falls back to additional scrapers only when no primary scraper produced output

### Metadata scrape extension

The metadata extension owns metadata completion, PMS fallback logic, and the tiny remaining local metadata scraper set.

Key files:

- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:156-158` registers the `scrapeMetadata` modify hook
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:35-132` still exposes a much larger configured scraper list than is actually implemented locally
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:8-32` shows the real local implementation set today: `arxiv` plus clientside `ieee`
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:188-229` routes first through Paperlib Metadata Service, then local backup
- `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:239-366` separates precise, fuzzy, additional, and clientside phases

## Classification rubric

Stable providers:

- rely on durable identifiers or broadly standardized metadata formats
- are portable to internal modules without binding the architecture to one brittle website DOM
- have relatively low ongoing maintenance cost
- are good candidates for first-party tests and fixture coverage

Volatile providers:

- rely on site-specific HTML structure, login/session state, PDFs behind access rules, or anti-bot-sensitive flows
- have high breakage likelihood and ongoing maintenance burden
- should remain modular/optional, even if supported

Migration priority labels used below:

- P0: move into app-internal architecture first
- P1: keep but isolate behind provider boundaries soon after stable-source migration
- P2: defer; keep extension-backed or optional until architecture is settled
- P3: do not treat as a core metadata provider; retain only as compatibility/import glue if needed

Maintenance burden labels:

- Low: standardized API/format or deterministic local parsing
- Medium: some heuristic logic or format variance, but still reasonably durable
- High: site DOM, cookies, anti-bot, access control, or publisher-specific edge cases

## Provider inventory

| Provider/source | Type | Stable/volatile | Current residence | Key file references | Migration priority | Maintenance burden | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DOI identifier import | Metadata/input seed | Stable | App import path plus metadata extension preference surface; no first-party local provider implemented in current extension code | `../paperlib-extensions/paperlib-entry-scrape-extension/src/main.ts:114-130`, `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:63-69` | P0 | Low | Core durable identifier. Explicitly called out as a Phase 2 stable-source target in `.hermes/plans/2026-04-02_113403-phase2-internal-scrape-architecture-plan.md:43-49,116-123`. |
| arXiv identifier metadata | Metadata provider | Stable | Metadata extension local provider | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:8-10,30-32`, `../paperlib-extensions/paperlib-metadata-scrape-extension/src/scrapers/arxiv.ts:22-100` | P0 | Low | Best existing example of a durable identifier-based provider. Uses arXiv export API rather than DOM scraping. |
| BibTeX text import | Entry/import provider | Stable | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:23-38`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/bibtex-entry-scraper.ts` | P0 | Low | Standard interchange format and specifically named as a Phase 2 internalization target. |
| Generic HTML meta extraction (`citation_*`, `dc.*`, DOI/PDF tags) | Entry/import provider | Mostly stable | Entry extension additional scraper | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:40-43,92-106`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/webcontent-embed-entry-scraper.ts:20-69,71-233` | P0 | Medium | Not tied to one site, but still HTML-dependent. Strong candidate for internal built-in resolver/provider because it generalizes across publishers. |
| PDF local parsing and heuristic extraction | Entry/bootstrap provider | Semi-stable assistive only | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:23-38`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/pdf-entry-scraper.ts:104-110,175-208` | P1 | Medium | Valuable as bootstrap input, but should not be treated as authoritative metadata truth. Matches the architecture plan’s “assistive input, not sole truth” guidance. |
| arXiv webpage import | Entry/import resolver | Stable-ish | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/webcontent-arxiv-entry-scraper.ts:19-95` | P1 | Low | Really an arXiv URL resolver that yields an arXiv ID or downloaded PDF. Worth internalizing after the canonical arXiv metadata provider. |
| Generic PDF URL import | Entry/import resolver | Stable-ish | Entry extension additional scraper | `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/webcontent-pdfurl-entry-scraper.ts:7-30` | P1 | Low | Useful as a generic input resolver, not a metadata authority. Handles plain `.pdf` URLs and OpenReview PDF URLs. |
| PaperEntity bypass payload | Compatibility/import seam | Stable | App plus entry extension | `app/service/services/scrape-service.ts:33-46,116-129`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:26-27`, `tests/unit-tests/services/scrape-service.spec.ts:104-165` | P1 | Low | Important compatibility seam during migration because it allows internal resolvers/providers to bypass extension parsing. |
| Zotero CSV import | Entry/import provider | Stable | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:27-28`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/zoterocsv-entry-scraper.ts:11-93` | P2 | Medium | Useful import format, but not central to metadata-provider architecture. Keep modular. |
| Paperlib CSV import | Entry/import provider | Stable | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:27-28`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/paperlibcsv-entry-scraper.ts:10-94` | P2 | Medium | Internal data portability path rather than external metadata provider. Not urgent for Phase 2 scraping architecture. |
| MongoDB paper/feed/categorizer/smartfilter JSON import | Entry/import provider | Stable but non-core | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:34-37`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/mongodb-paperentity-json-scraper.ts`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/mongodb-feed-json-scraper.ts`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/mongodb-categorizer-json-scraper.ts`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/mongodb-smartfilter-json-scraper.ts` | P3 | Medium | Legacy/data import compatibility, not part of the durable scrape-provider core. |
| Google Scholar page scraper | Entry/import provider | Volatile | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:29-33`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/webcontent-googlescholar-entry-scraper.ts:22-170` | P1 | High | Fragile: parses Scholar HTML, depends on `data-aid`, performs follow-up citation fetches, and is likely anti-bot sensitive. Keep optional and isolated. |
| IEEE page scraper | Entry/import provider | Volatile | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:29-33`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/webcontent-ieee-entry-scraper.ts:19-142` | P1 | High | Depends on site script payload shape, cookies, access checks, and PDF download permissions. |
| IEEE metadata fallback | Metadata provider | Volatile | Metadata extension clientside phase | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:26-28,274-295,359-366`, `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:112-125` | P1 | High | Only remaining clientside metadata scraper. Should remain a degradable optional provider, not a core contract anchor. |
| ACM page scraper | Entry/import provider | Volatile | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:29-33`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/webcontent-acm-entry-scraper.ts:18-50` | P2 | High | Extremely thin DOM scraper today; likely brittle and low-value beyond compatibility. |
| CNKI scraper | Entry/import provider | Volatile | Entry extension | `../paperlib-extensions/paperlib-entry-scrape-extension/src/services/entry-scrape-service.ts:29-33`, `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/webcontent-cnki-entry-scraper.ts:16-149` | P2 | High | Region/site-specific flow with form POST export behavior. Valuable to preserve, but should stay optional and isolated. |
| OpenReview via PDF URL path | Entry/import resolver | Volatile-ish | Entry extension generic PDF URL path | `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/webcontent-pdfurl-entry-scraper.ts:26-29` | P2 | Medium | Current support is really “recognize OpenReview PDF URL shape,” not a full provider. Better treated as generic resolver glue. |
| Crossref | Metadata provider preference only in current local code snapshot | Stable | Metadata extension preference/config surface, likely PMS-backed rather than local | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:49-55` | P0 | Low | Durable source and high-value internalization target even though no local scraper file appears in the current extension repo. |
| DBLP | Metadata provider preference only in current local code snapshot | Stable | Metadata extension preference/config surface, likely PMS-backed rather than local | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:56-62` | P1 | Low | Strong CS-specific stable source. Good follow-on after DOI/arXiv/BibTeX/generic HTML because it is identifier/title based and lower-maintenance than publisher DOM scrapers. |
| OpenReview metadata | Metadata provider preference only in current local code snapshot | Stable-ish | Metadata extension preference/config surface, likely PMS-backed rather than local | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:70-76` | P1 | Medium | More durable than many publisher DOM scrapers, but less universal than DOI/arXiv. |
| Semantic Scholar | Metadata provider preference only in current local code snapshot | Mixed | Metadata extension preference/config surface, likely PMS-backed rather than local | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:91-97` | P1 | Medium | Useful title/identifier fallback; keep behind clean provider boundaries because ranking/matching behavior can drift. |
| PubMed | Metadata provider preference only in current local code snapshot | Stable | Metadata extension preference/config surface, likely PMS-backed rather than local | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:84-90` | P1 | Low | Durable biomedical source; good future internal provider, but not first wave unless biomed is a core fork priority. |
| Springer | Metadata provider preference only in current local code snapshot | Volatile/mixed | Metadata extension preference/config surface, likely PMS-backed rather than local | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:98-104` | P2 | High | Publisher-specific and likely subject to DOM/access churn if not API-backed. |
| ChemRxiv | Metadata provider preference only in current local code snapshot | Stable-ish | Metadata extension preference/config surface, likely PMS-backed rather than local | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:42-48` | P1 | Medium | Identifier/preprint style source; reasonable after DOI/arXiv core work. |
| NASA/ADS | Metadata provider preference only in current local code snapshot | Stable-ish | Metadata extension preference/config surface, likely PMS-backed rather than local | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:105-111` | P2 | Medium | Specialized domain source; useful but not foundational for the first migration wave. |
| Papers With Code | Additional metadata/source enrichment preference only in current local code snapshot | Mixed | Metadata extension preference/config surface, likely PMS-backed rather than local | `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:77-83` | P2 | Medium | Better treated as optional enrichment/additional provider than canonical metadata source. |

## What the codebase currently implies

### 1. The implemented local metadata set is much smaller than the configured scraper list

The metadata extension preference UI exposes many scrapers in `../paperlib-extensions/paperlib-metadata-scrape-extension/src/main.ts:35-132`, but the actual local registry in `../paperlib-extensions/paperlib-metadata-scrape-extension/src/services/metadata-scrape-service.ts:8-32` only wires:

- precise: `arxiv`
- clientside: `ieee`
- fuzzy/additional: none locally

That means most “providers” currently visible to users are not local first-party scrapers in this repo snapshot; they are effectively PMS-routed names or compatibility placeholders. This increases the value of Phase 2 internalizing a small, explicit stable subset rather than trying to preserve the current implicit everything-list.

### 2. Generic HTML metadata is already the strongest cross-site entry path

`webcontent-embed-entry-scraper.ts` is the closest thing to a generally reusable internal resolver/provider because it recognizes standards-like metadata tags instead of one site’s DOM. It is still HTML-based and has download heuristics, but architecturally it fits the planned “generic HTML meta extraction” provider far better than Scholar/IEEE/ACM/CNKI scrapers do.

### 3. PDF parsing should be preserved, but demoted to bootstrap input

The PDF entry scraper extracts arXiv IDs and DOIs directly from text and imported PDF metadata:

- `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/pdf-entry-scraper.ts:104-110`
- `../paperlib-extensions/paperlib-entry-scrape-extension/src/scrapers/pdf-entry-scraper.ts:175-208`

That makes it useful as an input resolver that discovers durable identifiers, but not as the final metadata authority. This aligns directly with the architecture plan in `.hermes/plans/2026-04-02_113403-phase2-internal-scrape-architecture-plan.md:43-50`.

### 4. Compatibility seams already exist and should be used

The app now supports direct `PaperEntity` payload bypass in `app/service/services/scrape-service.ts:33-46,116-129`, and tests cover that path in `tests/unit-tests/services/scrape-service.spec.ts:104-165`.

That means Phase 2 can internalize providers incrementally without breaking everything at once:

- internal resolvers/providers can emit `PaperEntity` drafts directly
- extension-backed scrapers can coexist temporarily behind the same pipeline
- volatile providers can be left out of the initial internal wave without blocking the architecture

## Recommended migration order

### Wave 1: internalize durable core providers now

These should become app-internal first-party providers/resolvers in the first implementation wave:

1. DOI provider
2. arXiv provider
3. BibTeX provider
4. generic HTML meta provider
5. PDF bootstrap resolver that extracts DOI/arXiv and hands off to stable providers

Why:

- they match the Phase 2 architecture plan exactly
- they are lowest-maintenance and easiest to fixture-test
- they reduce dependence on extension hook glue for common flows
- they do not lock the architecture to one website DOM

### Wave 2: isolate high-value but brittle web providers behind optional boundaries

Next, keep modular and degradable:

1. Google Scholar
2. IEEE
3. DBLP
4. OpenReview
5. PubMed/ChemRxiv depending on product focus

Why:

- some are valuable enough to keep
- but they should sit behind explicit provider contracts and fallback behavior
- they must not become required for the app’s core scrape architecture

### Wave 3: compatibility and niche import paths only

Defer unless a user-visible requirement demands them:

1. ACM page scraper
2. CNKI scraper
3. Springer/NASA ADS/Papers With Code enrichment
4. CSV/MongoDB importers beyond basic compatibility support

Why:

- these are either specialized, brittle, or not central to metadata-provider architecture
- they add maintenance surface without helping establish the durable internal core

## Recommended maintenance policy by class

### Stable core providers

Policy:

- internalize into app modules
- add fixture-based tests
- normalize around identifiers and standard metadata fields
- preserve local-managed fields during merge

Examples:

- DOI
n- arXiv
- BibTeX
- generic HTML meta

### Volatile optional providers

Policy:

- isolate behind optional provider boundaries
- allow failure/degradation without breaking the whole scrape flow
- avoid making them required for extension readiness or baseline metadata completion
- document expected maintenance burden explicitly

Examples:

- Google Scholar
- IEEE
- ACM
- CNKI

### Import compatibility providers

Policy:

- keep as resolvers/import adapters, not canonical metadata authorities
- preserve only if they serve migration, interoperability, or power-user workflows
- do not let them shape internal metadata contracts

Examples:

- CSV importers
- MongoDB JSON importers
- PaperEntity bypass

## Bottom line

The inventory points to a clear Phase 2 stance:

- the durable internal core should be DOI, arXiv, BibTeX, generic HTML metadata, and PDF-as-bootstrap
- current app architecture is still extension-hook-driven, so these sources provide the highest leverage migration path
- Google Scholar, IEEE, ACM, CNKI, and similar site parsers are real features but architecturally volatile
- many provider names currently exposed in metadata preferences are configuration/PMS surface area, not equivalent local implementations
- Phase 2 should therefore internalize the stable subset first and treat volatile providers as optional modules or later follow-up work
