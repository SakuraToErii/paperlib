# Phase 2 README Follow-Through Plan: local-first scraping/import architecture

Date: 2026-04-02
Owner: worker-1 (planner)
Scope: convert the README Phase 2 short-term roadmap into an execution-ready plan grounded in the current repo state.

## Objective

Finish the README short-term scraping/import work described in `README.md:113-133` by turning the existing seam scaffolding into a real internal pipeline, internalizing the stable providers first, preserving local-managed fields by default, and leaving volatile providers as optional boundaries.

## Repo-grounded current state

1. The README already claims that Phase 2 groundwork exists and names the next work explicitly: internalize stable sources first, keep volatile scrapers isolated, and preserve local-managed fields during refresh/import (`README.md:107-128`).
2. The app already contains seam scaffolding for the new architecture:
   - provider/result contracts in `app/service/services/scrape-contract.ts:3-44`
   - resolver registry in `app/service/services/scrape-resolver.ts:5-79`
   - provider registry in `app/service/services/scrape-provider-registry.ts:6-35`
   - merge-policy seam in `app/service/services/scrape-merge-policy.ts:6-29`
3. `ScrapeService` still runs only hook-backed built-ins, still selects a single provider per kind, still waits for the official scrape extensions, and still keeps hook-tuple metadata flow alive (`app/service/services/scrape-service.ts:67-72`, `148-180`, `219-253`, `280-325`, `453-495`).
4. The merge safety baseline exists centrally in `app/base/metadata.ts:3-77`, which already preserves local-managed fields such as `relatedPaperIds`, `folders`, `tags`, `note`, and attachments.
5. Persistence is still caller-owned: browser import persists immediately after scrape (`app/service/services/browser-extension-service.ts:75-105`), and library refresh persists immediately after scrape (`app/service/services/paper-service.ts:772-795`).
6. The docs already recommend the exact migration order: Wave 1 stable providers (DOI, arXiv, BibTeX, generic HTML meta, PDF bootstrap), then Wave 2 volatile providers behind optional boundaries (`docs/plans/phase2-scrape-provider-inventory.md:152-199`).
7. The merge-policy doc already requires provider output to be normalized before persistence and centrally preserved in a shared merge/update layer (`docs/plans/phase2-safe-merge-policy.md:333-380`).

## What is still missing before the README claim can be considered “done”

- Internal provider execution is still mostly a hook wrapper, not a real provider pipeline.
- Stable providers are not yet first-party app providers.
- Extension readiness is still a hard dependency for common scrape flows.
- Persistence is still coupled directly to callers instead of a first-class post-merge boundary.
- Regression coverage is still seam-level; it does not yet prove the full stable-provider wave or fallback monotonicity.

## Phased execution plan

### Phase 1 — Finish the internal pipeline contract

**Why now**
This removes the architectural bottleneck: the current seam files exist, but `ScrapeService` still behaves like a hook dispatcher.

**Primary deliverables**
- Replace the metadata hook tuple dependency with named request/result objects inside the app pipeline.
- Allow multiple providers per kind to execute in priority order instead of selecting only the first provider.
- Add a real provider-execution envelope with normalized status, basis, warnings, diagnostics, and completeness.
- Make the hook-backed extension path a compatibility adapter instead of the architecture anchor.

**Likely touched files**
- `app/service/services/scrape-service.ts`
- `app/service/services/scrape-contract.ts`
- `app/service/services/scrape-provider-registry.ts`
- `app/service/services/scrape-resolver.ts`
- `app/service/services/scrape-merge-policy.ts`
- new app-owned provider modules under `app/service/services/` or a nearby `scrape-*` subdirectory
- `tests/unit-tests/services/scrape-service.spec.ts`

**Acceptance criteria**
- `ScrapeService` can run a prioritized provider chain for entry and metadata flows.
- Provider execution no longer depends on positional `[drafts, scrapers, force]` internals in the app-owned contract.
- Hook-backed extensions can still run as a compatibility provider.
- Existing PaperEntity bypass behavior still passes.

**Verification**
- extend `tests/unit-tests/services/scrape-service.spec.ts` for provider chaining and compatibility-adapter behavior
- verify existing bypass-preservation tests still pass

### Phase 2 — Internalize the stable README providers

**Why now**
This is the highest-leverage product work in the README and the docs: it reduces dependence on extension glue for the durable/common paths first.

**Primary deliverables**
- Add first-party internal resolver/provider support for:
  1. DOI
  2. arXiv
  3. BibTeX
  4. generic HTML metadata extraction
  5. PDF bootstrap resolution that extracts DOI/arXiv and hands off to durable providers
- Register these as app-owned providers ahead of the hook compatibility provider.
- Keep volatile site-specific scrapers out of the critical path.

**Likely touched files**
- `app/service/services/scrape-service.ts`
- `app/service/services/scrape-resolver.ts`
- `app/service/services/scrape-provider-registry.ts`
- new provider/resolver files for DOI/arXiv/BibTeX/HTML/PDF
- `tests/unit-tests/services/scrape-service.spec.ts`
- new provider fixture tests under `tests/unit-tests/services/`

**Acceptance criteria**
- Common DOI/arXiv/BibTeX/HTML/PDF-import flows resolve without requiring the official scrape extensions.
- Stable providers return normalized envelopes and participate in shared merge policy.
- PDF handling is bootstrap-only unless it has a durable identifier or structured metadata match.
- Hook-backed provider path remains available as fallback, not as the primary path.

**Verification**
- fixture-based unit tests per stable provider
- targeted scrape-service tests proving app-owned providers outrank hook fallback
- smoke coverage for browser-import-style `webcontent` and PaperEntity refresh flows

### Phase 3 — Make merge + persistence boundaries explicit and safe

**Why now**
Once app-owned providers exist, the remaining product risk is not extraction accuracy; it is accidental corruption of local-first state during refresh/update.

**Primary deliverables**
- Introduce an explicit post-provider merge stage that maps provider results into persistence drafts.
- Separate create/import semantics from refresh/update semantics.
- Remove the hard assumption that scrape callers must immediately persist raw provider output.
- Soften/remove the extension-installed gating for flows now covered by app-owned providers.

**Likely touched files**
- `app/base/metadata.ts`
- `app/service/services/scrape-merge-policy.ts`
- `app/service/services/scrape-service.ts`
- `app/service/services/browser-extension-service.ts`
- `app/service/services/paper-service.ts`
- `app/extension/services/extension-management-service.ts`
- `tests/unit-tests/services/scrape-service.spec.ts`
- `tests/unit-tests/services/paper-relations.spec.ts`
- `tests/unit-tests/services/file-service.spec.ts`

**Acceptance criteria**
- Refresh/update preserves `relatedPaperIds`, `folders`, `tags`, `note`, `supplementaries`, `defaultSup`, identity fields, and managed file placement by default.
- Empty or partial later-provider output cannot degrade an already richer merged draft.
- Browser import and library refresh can use app-owned providers without blocking on official extension readiness.
- Destructive overwrite remains opt-in only.

**Verification**
- preserve/extend current relation-preservation tests
- add tests for tags/folders/note/attachment preservation on refresh
- add tests for provider fallback monotonicity
- add targeted service tests for browser-import and metadata-refresh persistence boundaries

### Phase 4 — Isolate volatile providers and close the README/docs loop

**Why now**
After the stable core is internal, the remaining work is to keep the architecture honest and prevent fragile scrapers from re-becoming the center of the design.

**Primary deliverables**
- Keep Google Scholar / IEEE / DBLP / OpenReview / similar sources behind optional provider modules or compatibility adapters.
- Ensure volatile-provider failure degrades gracefully and does not block stable flows.
- Update README and Phase 2 docs so “current status” and “short-term plan” reflect what is now complete vs remaining.

**Likely touched files**
- optional provider modules / registration files
- `app/service/services/scrape-service.ts`
- `README.md`
- `README_zhCN.md`
- `docs/plans/phase2-*.md` follow-up notes if architectural deltas need recording
- regression tests covering graceful degradation

**Acceptance criteria**
- Stable core flows succeed even if volatile providers are absent or fail.
- Volatile providers are not required for readiness checks or metadata completion baselines.
- README wording accurately distinguishes completed Phase 2 core work from deferred optional-provider work.

**Verification**
- tests proving no hard failure when optional providers are unavailable
- README/doc review against implemented architecture and file reality

## Recommended execution order across people/lanes

### Lane A — architecture + pipeline owner
- **Role:** `executor` (high)
- **Scope:** Phase 1 plus the shared provider-execution pipeline in Phase 2
- **Files:** `scrape-service.ts`, `scrape-contract.ts`, `scrape-provider-registry.ts`, `scrape-resolver.ts`, `scrape-merge-policy.ts`

### Lane B — stable provider migration owner
- **Role:** `executor` or `dependency-expert` + `executor` pairing (high)
- **Scope:** DOI/arXiv/BibTeX/HTML/PDF resolver-provider modules and fixtures
- **Files:** new provider/resolver modules + targeted tests

### Lane C — merge/persistence safety owner
- **Role:** `executor` + `test-engineer` (medium/high)
- **Scope:** Phase 3 preservation-first integration in browser import / paper refresh callers
- **Files:** `metadata.ts`, `browser-extension-service.ts`, `paper-service.ts`, related tests

### Lane D — verification + docs closeout owner
- **Role:** `test-engineer`, `verifier`, then `writer` (medium)
- **Scope:** preservation regression matrix, optional-provider degradation tests, README/doc accuracy pass
- **Files:** test files + `README.md` / `README_zhCN.md` / any follow-up plan notes

## Suggested verification commands for execution handoff

Run at minimum after implementation slices land:

```bash
pnpm run typecheck
pnpm exec vitest run tests/unit-tests/services/scrape-service.spec.ts tests/unit-tests/services/paper-relations.spec.ts tests/unit-tests/services/file-service.spec.ts
```

Add targeted provider tests once new modules exist, for example:

```bash
pnpm exec vitest run tests/unit-tests/services/*scrape*.spec.ts
```

Manual/smoke checks expected before README closure:
- browser-extension import path using `webcontent`
- library metadata refresh path for existing papers
- refresh of an existing locally-managed paper with relations/tags/folders/note/attachments already set
- no-extension or degraded-extension scenario for the stable provider set

## Bottom line

The fastest safe path is:
1. turn the new seam files into a real prioritized internal pipeline,
2. internalize the stable providers the README already promised,
3. formalize merge/persistence safety at the caller boundary,
4. leave volatile providers optional and update README/docs only after the code matches the claim.
