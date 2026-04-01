# Obsidian-style Folder Sync + Paper Relation Graph Implementation Plan

> For Hermes: execute in small reviewed slices. Prefer isolated subagents for focused implementation/review on each slice.

Goal: make library folders mirror the real local filesystem structure, add paper-to-paper relations, and add an Obsidian-like graph view that matches the existing Paperlib UI.

Architecture:
- Treat local library folders under `appLibFolder` as the source of truth for `PaperFolder` topology.
- Store paper relations symmetrically on `Entity.relatedPaperIds`, and derive graph arrows from publication time at render time.
- Add a new `graph` main view mode that renders from the same filtered `paperEntities` dataset used by list/table views.

Tech stack: Electron, Vue 3, TypeScript, Realm, existing Paperlib services/repositories, plus a lightweight renderer-side graph component.

---

### Task 1: Add relation persistence to the paper model

Objective: extend `Entity` persistence so papers can reference related papers.

Files:
- Modify: `app/models/entity.ts`
- Modify: `app/service/repositories/db-repository/paper-entity-repository.ts`
- Modify: `app/service/services/database/core.ts`
- Modify: `app/service/services/database/migration.ts`

Steps:
1. Add `relatedPaperIds` to `IEntity`, `Entity.schema`, constructor/init logic, and Realm object typing.
2. Update repository defaults/update paths so `relatedPaperIds` is always normalized to object IDs.
3. Bump DB schema version and add migration/backfill for existing entities.
4. Verify by typecheck/build locally when Node is available:
   - `pnpm run typecheck`

### Task 2: Add relation mutation APIs

Objective: provide safe symmetric relation operations.

Files:
- Modify: `app/service/services/paper-service.ts`
- Modify: `app/service/repositories/db-repository/paper-entity-repository.ts`

Steps:
1. Add service methods for:
   - `setRelatedPaperIds(paperId, relatedIds)`
   - `addRelatedPapers(paperId, relatedIds)`
   - `removeRelatedPapers(paperId, relatedIds)`
   - `relateSelectedPapers(ids)`
   - `unrelateSelectedPapers(ids)`
2. Ensure all relation writes are symmetric and deduplicated.
3. Ensure paper deletion removes dangling reverse references.
4. Verify by typecheck/build locally when Node is available.

### Task 3: Add folder-path utility helpers

Objective: centralize filesystem-folder normalization and graph color helpers.

Files:
- Create: `app/base/folder.ts`
- Create: `app/renderer/utils/paper-graph.ts`

Steps:
1. Add helpers for normalized relative folder paths, escaping folder queries, and parent/child path checks.
2. Add graph utilities for:
   - publication-time ordering
   - unique undirected pair extraction
   - node sizing by relation count
   - palette generation from top-level folders and subfolder variation
3. Keep graph utilities pure so they are easy to review/test later.

### Task 4: Make folder queries recursive and graph-ready

Objective: make folder selection behave like filesystem browsing and expose folder metadata cleanly to the renderer.

Files:
- Modify: `app/renderer/services/querysentence-service.ts`
- Modify: `app/base/filter.ts` if needed for folder query support

Steps:
1. Change folder query generation so selecting `A/B` includes descendants using exact-or-prefix semantics.
2. Keep tag behavior unchanged.
3. Preserve existing sidebar tree structure and linked-folder icon behavior.

### Task 5: Mirror filesystem folder structure into PaperFolder tree

Objective: sync DB folders from the real folder tree under `appLibFolder`.

Files:
- Modify: `app/service/repositories/file-repository/backend.ts`
- Modify: `app/service/repositories/file-repository/local-backend.ts`
- Modify: `app/service/repositories/file-repository/webdav-backend.ts`
- Modify: `app/service/services/file-service.ts`
- Modify: `app/service/services/categorizer-service.ts`
- Modify: `app/service/repositories/db-repository/categorizer-repository.ts`

Steps:
1. Add backend directory operations as needed: create, rename/move, delete-empty, list directories.
2. Add folder-tree sync logic that scans `appLibFolder`, excludes internal Realm/cache artifacts, and rebuilds/updates `PaperFolder` topology.
3. Fix `PaperFolder` root creation bug if encountered.
4. Keep folder counts recursive.
5. Trigger sync after DB init and after folder/file operations.

### Task 6: Tie paper folder membership to real file paths

Objective: keep each paper’s folder membership aligned with its actual local file location.

Files:
- Modify: `app/service/services/file-service.ts`
- Modify: `app/service/services/paper-service.ts`
- Modify: `app/service/repositories/db-repository/paper-entity-repository.ts`

Steps:
1. Infer canonical paper folder from managed file location under `appLibFolder`.
2. When a paper is placed in a folder, move its managed files into that folder.
3. Replace folder membership instead of appending multiple group-style folders.
4. Reconcile folder membership after moves/renames/deletes.
5. Keep tags untouched.

### Task 7: Update sidebar folder operations to act on the real filesystem

Objective: make create/rename/move/delete folder actions manipulate real directories and then resync the mirror.

Files:
- Modify: `app/renderer/ui/sidebar-view/sidebar-library-view.vue`
- Modify: `app/service/services/categorizer-service.ts`
- Modify: `app/main/services/contextmenu-service.ts`

Steps:
1. Folder create: create directory under selected parent and resync.
2. Folder rename/move: rename/move directory and resync.
3. Folder delete: only allow delete when target subtree is empty; surface a clear error otherwise.
4. Paper drag-drop onto folder/root: move files and replace folder membership.

### Task 8: Add graph view mode to the main paper view

Objective: add a new main-view mode that shows the current filtered library as a graph.

Files:
- Create: `app/renderer/ui/main-view/data-view/components/graph-view/paper-graph-view.vue`
- Modify: `app/renderer/ui/main-view/data-view/paper-data-view.vue`
- Modify: `app/renderer/ui/main-view/main-view.vue`
- Modify: `app/renderer/ui/main-view/menubar-view/window-menu-bar.vue`
- Modify: `app/renderer/ui/main-view/menubar-view/components/menu-bar-btn.vue`
- Modify: `app/main/services/menu-service.ts` if the native menu mirrors view types

Steps:
1. Add `graph` to main view mode switching.
2. Render graph from injected `paperEntities` so it respects current filters.
3. Support click-to-select, double-click-to-open, hover highlight, pan/zoom/reset.
4. Keep styling aligned with the existing neutral/light-dark Paperlib design.

### Task 9: Add relation display and editing UI

Objective: let users inspect and edit relations without breaking the current UI flow.

Files:
- Create: `app/renderer/ui/main-view/detail-view/components/related-papers.vue`
- Modify: `app/renderer/ui/main-view/detail-view/paper-detail-view.vue`
- Modify: `app/main/services/contextmenu-service.ts`
- Modify: `app/renderer/ui/main-view/data-view/paper-data-view.vue`

Steps:
1. Add a detail-panel section listing related papers.
2. Allow remove-from-relation inline.
3. Add context-menu actions for multi-select relation/unrelation.
4. Optionally add a lightweight inline picker for adding relations from the detail pane.

### Task 10: Add preferences and locales for graph configuration

Objective: support user-defined graph colors and view labels while preserving defaults.

Files:
- Modify: `app/main/services/preference-service.ts`
- Modify: `app/service/services/preference-service.ts`
- Modify: `app/renderer/ui/preference-view/mainview-view.vue`
- Modify: `app/locales/locales/en.GB.json`
- Modify: `app/locales/locales/zh.CN.json`
- Modify: `app/locales/locales/zh.TW.json`
- Modify: `app/locales/locales/de.DE.json`
- Modify: `app/locales/locales/ar.json`

Steps:
1. Add graph-related preference fields and defaults.
2. Add a small preference UI for custom palette overrides.
3. Add all new strings across shipped locales.

### Task 11: Review, verify, and commit locally

Objective: validate the feature set and keep git history clean.

Files:
- Review all changed files

Steps:
1. Run when Node is available:
   - `pnpm run typecheck`
   - any repo-supported tests/build you can run safely
2. Review diffs with `git diff --stat` and targeted file diffs.
3. Make local commits in clear slices:
   - `feat: add paper relation persistence`
   - `feat: sync folders with local library tree`
   - `feat: add paper graph view and relation UI`
   - `chore: add graph preferences and locales`

---

Verification checklist:
- Selecting a folder in the sidebar includes papers from descendant folders.
- Creating/renaming/moving folders in the sidebar changes the real library directory tree.
- Dropping a paper into a folder moves the managed file(s) and updates folder membership.
- Related papers persist symmetrically.
- Graph arrows follow publication-time ordering.
- Node size reflects relation count.
- Node color families follow top-level folders by default and honor user overrides when set.
- Existing tags and general UI styling remain intact.