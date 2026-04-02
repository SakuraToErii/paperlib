# Task 2 Plan: Remaining README Work for Phase 2 Local-First Scraping/Import

Date: 2026-04-02
Worker: worker-2 (planner)
Status: draft for execution handoff

## Goal

Turn the README's current "Phase 2 architecture groundwork" into an executable implementation plan for the remaining local-first scraping/import work.

## Grounded repo state

From repo inspection:

- `README.md` already claims only groundwork is done: contract docs plus initial resolver/provider/merge scaffolding.
- `app/service/services/scrape-service.ts` now has seam scaffolding (`ScrapeProviderRegistry`, input resolvers, merge-policy seam), but still registers only hook-backed providers (`hook:entry`, `hook:metadata`, `hook:fuzzy`) and still waits for official scrape extensions before entry/fuzzy work.
- `app/service/services/scrape-contract.ts`, `scrape-provider-registry.ts`, `scrape-resolver.ts`, and `scrape-merge-policy.ts` exist, so the next step is not "invent the architecture"; it is to replace hook-only execution with real internal providers.
- `app/service/services/browser-extension-service.ts` and `app/service/services/paper-service.ts` still persist immediately after scrape results are returned, so the persistence boundary is still caller-driven.
- `app/base/metadata.ts` already preserves the local-managed fields called out in the docs (`relatedPaperIds`, `folders`, `tags`, `note`, attachment fields, identity fields).
- `tests/unit-tests/services/scrape-service.spec.ts` already covers the new seam scaffolding and PaperEntity bypass compatibility, but does not yet prove real internal provider execution.

## Recommended phased execution

### Phase 1 — Convert the seam into a real internal pipeline

**Why next:** the contract docs are already written and the app has the registry/resolver/merge seams. The blocker is that the seams still only wrap hook dispatch.

**Primary files:**

- `app/service/services/scrape-service.ts`
- `app/service/services/scrape-contract.ts`
- `app/service/services/scrape-provider-registry.ts`
- `app/service/services/scrape-resolver.ts`
- `app/service/services/scrape-merge-policy.ts`
- `tests/unit-tests/services/scrape-service.spec.ts`

**Work:**

1. Replace single-provider selection with ordered provider execution per kind.
2. Keep hook-backed providers as compatibility adapters, not as the only implementation.
3. Expand the request/result envelope enough to carry provider id, basis, confidence/diagnostics, and skip/no-match/error states cleanly.
4. Keep `PaperEntity` bypass behavior intact.

**Acceptance criteria:**

- `ScrapeService` can run more than one provider per kind in priority order.
- Hook integration is isolated behind adapter logic instead of leaking tuple semantics through the main pipeline.
- A provider failure/no-match does not break later providers.
- Existing PaperEntity bypass tests still pass.

**Verification:**

- Extend `tests/unit-tests/services/scrape-service.spec.ts` for ordered execution, fallback, and structured result envelopes.

### Phase 2 — Internalize the README's Wave 1 stable sources

**Why next:** README + docs consistently prioritize stable/local-first sources first.

**Primary files:**

- `app/service/services/scrape-service.ts`
- new provider/resolver modules under `app/service/services/` for:
  - DOI
  - arXiv
  - BibTeX
  - generic HTML metadata
  - PDF bootstrap resolver
- `tests/unit-tests/services/scrape-service.spec.ts`
- fixture files/tests added alongside service tests as needed

**Work:**

1. Add a DOI provider as a first-party metadata provider.
2. Add an arXiv provider as a first-party metadata provider.
3. Add BibTeX parsing as a first-party entry/import path.
4. Add generic HTML metadata extraction (`citation_*`, `dc.*`, DOI/PDF hints) as the built-in browser/webcontent path.
5. Add PDF bootstrap resolution that extracts DOI/arXiv and hands off to stable metadata providers instead of acting as final truth.

**Acceptance criteria:**

- Common DOI/arXiv/BibTeX/generic HTML flows succeed without requiring the official scrape extensions.
- PDF import can seed DOI/arXiv-based completion when identifiers are present.
- Built-in providers emit normalized results that can be merged consistently.
- Hook-backed volatile providers can remain as fallback/compatibility.

**Verification:**

- Fixture-driven unit tests per stable provider.
- Regression coverage for mixed payload batches and PaperEntity bypass coexistence.

### Phase 3 — Make merge and persistence boundaries explicit

**Why next:** the safe-merge policy is documented, but callers still persist immediately after scraping.

**Primary files:**

- `app/service/services/scrape-service.ts`
- `app/service/services/scrape-merge-policy.ts`
- `app/base/metadata.ts`
- `app/service/services/browser-extension-service.ts`
- `app/service/services/paper-service.ts`
- `tests/unit-tests/services/scrape-service.spec.ts`
- related regression tests in `tests/unit-tests/services/paper-relations.spec.ts` / `file-service.spec.ts`

**Work:**

1. Centralize merge application around normalized provider results.
2. Ensure partial/lower-quality provider outputs cannot degrade a richer earlier result.
3. Preserve local-managed fields exactly as described in `phase2-safe-merge-policy.md`.
4. Make caller persistence happen only after merged/finalized drafts are returned by the scrape pipeline.
5. Add a non-persisting preview/finalized-result seam if needed for browser import debugging and future review flows.

**Acceptance criteria:**

- Refresh/import flows preserve `relatedPaperIds`, folders, tags, notes, supplementaries, identity fields, and managed-file placement.
- A later provider cannot blank out richer earlier metadata.
- Browser-import and library-refresh callers consume finalized drafts rather than ad hoc raw hook output.

**Verification:**

- Extend scrape merge tests.
- Re-run relation/file preservation tests for update flows.

### Phase 4 — Remove core dependence on official scrape extensions and update README/docs

**Why last:** only after stable providers and merge behavior work internally should the README be advanced from "groundwork" to "internal core landed".

**Primary files:**

- `app/service/services/scrape-service.ts`
- `app/extension/services/extension-management-service.ts`
- `README.md`
- optionally a short execution-handoff doc under `docs/plans/`

**Work:**

1. Downgrade official scrape extensions from core requirement to optional compatibility layer for volatile providers.
2. Keep extension fallback only for sources that are intentionally still modular/brittle.
3. Update README "Current status" and "Short-term plan" so it reflects the landed internal core and clearly names what remains optional/deferred.

**Acceptance criteria:**

- Stable-source scrape/import works when official scrape extensions are absent/unloaded.
- README no longer overstates future work that has already landed.
- Remaining volatile-provider work is described as optional/follow-up, not as architecture-defining.

**Verification:**

- Manual smoke test matrix:
  - browser import from a citation-meta page
  - DOI import
  - arXiv import
  - existing-paper refresh preserving local-managed fields

## Explicitly deferred after this README scope

Keep these out of the first internal-core wave unless a product priority changes:

- Google Scholar / IEEE / ACM / CNKI and other brittle site scrapers as required-core behavior
- CSV / MongoDB import paths as architecture-defining work
- large relation-model redesign beyond current preservation seams

## Suggested execution staffing

Recommended small team split:

1. **Core pipeline lane — `executor` (high reasoning)**

   - Own `scrape-service.ts`, contract/registry/resolver/merge-policy evolution.
   - Deliver Phase 1 and the orchestration part of Phase 3.

2. **Stable providers lane — `executor` (high reasoning)**

   - Own DOI/arXiv/BibTeX/generic HTML/PDF-bootstrap provider modules.
   - Coordinate with the core lane on provider interfaces only.

3. **Regression + docs lane — `test-engineer` (medium) + `writer` (high)**

   - Expand unit coverage, preserve relation/file regressions, then update `README.md` once behavior lands.

4. **Closeout lane — `verifier` (high)**
   - Run final typecheck/tests/manual smoke matrix and confirm extension-optional behavior.

## Minimum verification commands for the implementation team

- `pnpm run typecheck`
- `pnpm exec vitest run tests/unit-tests/services/scrape-service.spec.ts`
- `pnpm exec vitest run tests/unit-tests/services/paper-relations.spec.ts tests/unit-tests/services/file-service.spec.ts`
- `pnpm exec prettier --check README.md app/service/services/*.ts tests/unit-tests/services/*.ts`

## Recommended first execution slice

Start with **Phase 1 + the DOI/arXiv happy path from Phase 2**.

Reason:

- it converts the existing scaffolding into a real internal pipeline,
- it validates the contract docs against the actual service layer,
- it unlocks the highest-value README claim quickly,
- and it reduces the risk of doing merge/persistence work on top of hook-only behavior.
