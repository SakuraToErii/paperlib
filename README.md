<div align="center">
<img src="./assets/icon.png" height="95" />
<br />
<img src="https://img.shields.io/badge/dynamic/json?label=Release&query=version&url=https://raw.githubusercontent.com/Future-Scholars/paperlib/master/package.json" />
<img src="https://img.shields.io/github/license/Future-Scholars/paperlib" />
<img src="https://img.shields.io/github/stars/Future-Scholars/paperlib" />
<h2><a href="https://paperlib.app/" > Paperlib </a></h2>
An open-source academic paper management tool.
</div>

<p align='center'>
Join our <a href="https://discord.gg/4unrSRjcM9">Discord community</a>!
</p>

<p align='center'>
<a href='https://github.com/Future-Scholars/paperlib'>English</a> | <a href='https://github.com/Future-Scholars/paperlib/blob/main/README_zhCN.md'>中文</a>
</p>

<p align='center'>
<a href='https://paperlib.app/en/'>Webpage</a> | <a href='https://paperlib.app/en/download.html'>Download</a> | <a href='https://paperlib.app/en/doc/getting-started.html'>Quick Start</a> | <a href='https://github.com/users/Future-Scholars/projects/1/views/1'>Roadmap</a>
</p>

![](./assets/ui.png)

---

📣 **I'm looking for someone to work with me on developing Paperlib.** 📣

If you are interested please contact me.

## Introduction

I'm a computer science PhD student. Conference papers are in major in my research community, which is different from other disciplines. Without DOI, ISBN, metadata of a lot of conference papers are hard to look up (e.g., NIPS, ICLR etc.). When I cite a publication in a draft paper, I need to manually search the publication information of it in Google Scholar or DBLP over and over again.

**Why not Zotero, Mendely?**

- A good metadata scraping capability is one of the core functions of a paper management tool. Unfortunately, no software in this world does this well, not even commercial software.

- A modern UI. No extra useless features.

What we need may be to: import a paper, scrape the metadata of it as accurately as possible, simply organise the library, and export it when we are writing our papers.

That is Paperlib.

## Highlights

- Scrape paper’s metadata with many scrapers. Support writing your metadata scrapers. Tailored for many disciplines.
- Fulltext and advanced search.
- Smart filter.
- Rating, flag, tag, folder and markdown/plain text note.
- RSS feed subscription to follow the newest publications on your research topic.
- Locate and download PDF files from the web.
- macOS spotlight-like plugin to copy-paste references easily when writing a draft paper. Also supports MS Word.
- Cloud sync, supports macOS, Linux, and Windows.
- Beautiful and clean UI.
- Extensible. You can write your own extensions.

### With Extensions, you have:

- Show citation counts.
- Summarize papers by LLMs.
- Automatically tag papers by LLMs.
- Semantically search your library with natural language, such as: 'papers written by Geoffrey in 2024'.
- Chat with LLMs about your papers.
- and more...

## Download and Install

<a href="https://paperlib.app/en/download.html" style="font-size: 16px"> » Download Here « </a>

### Windows

⚠️ You may notice that a warning shows when you install Paperlib on Windows. The reason is that there is no code signing in Paperlib because it is so expensive. The source code of Paperlib can be found here. It won't hurt your PC and will never collect any personal information. Please make sure you are using HTTPS and our official webpage or Github to download the installer. When you install `latest.exe`, in the "Windows protected your PC" window, please click `More info` and `Run anyway`.

### macOS

⚠️ You may need to click the `preference` - `Security & Privacy` - `run anyway`.

### Linux

See [here](https://paperlib.app/en/download-linux.html).

## Quick Start

[Introduction (EN)](https://paperlib.app/en/doc/getting-started.html)  
[Introduction (CN)](https://paperlib.app/cn/doc/getting-started.html)

## Local Testing for This Fork

This fork adds an Obsidian-style local-folder workflow, paper relations, and a paper graph view. The steps below are intended for local manual testing during development and for testing the feature branch on another machine.

## Fork Roadmap Snapshot

This fork is being developed as a local-first Paperlib variant focused on filesystem-backed organization, paper-to-paper relations, graph navigation, and a durable built-in scraping/import architecture.

### Current status
Already implemented on this branch:

- Obsidian-style local folder workflow, with folder semantics aligned to real local directories
- paper-to-paper relations stored on the current `relatedPaperIds` model
- graph view with paper-only nodes, publication-time-derived edge direction, relation-count-driven node sizing, and folder-family-based coloring
- UI polish for graph interactions and related-papers workflows
- Phase 1 local-first hardening of:
  - local database and persistence contracts
  - relation integrity behavior and update preservation
  - folder/file mutation behavior and managed-file path safety
- Phase 2 architecture groundwork for internal scraping/import refactoring:
  - scrape architecture contract docs
  - provider inventory and migration priorities
  - safe merge/update policy docs
  - initial internal scrape resolver/provider/merge scaffolding in the service layer
- Phase 2 execution slice 1 for the durable built-in scraping/import path:
  - prioritized metadata-provider chaining in `ScrapeService`
  - built-in DOI and arXiv metadata providers ahead of hook-based compatibility fallback
  - stable metadata providers are now registered through the provider registry rather than hard-coded dispatch branches
  - metadata-provider requests can now target built-ins by alias (`doi`, `arxiv`) while still retaining hook fallback
  - mixed `PaperEntity` + entry-payload handling kept compatible with the existing refresh/import flows
  - targeted regression coverage for scrape-service boundaries, browser-extension import boundaries, and PaperService refresh boundaries
- Phase 2 execution slice 2 for the durable built-in scraping/import path:
  - built-in entry-provider chaining now exists ahead of `hook:entry`
  - BibTeX entry parsing is now internalized as an app-owned provider
  - generic HTML/webcontent metadata bootstrap is now internalized as an app-owned provider
  - PDF identifier bootstrap now extracts durable IDs and feeds the app-owned pipeline
  - entry-provider results are grouped per payload so built-in matches can coexist with hook fallback
  - targeted regression coverage now exists for the built-in entry-provider chain
- Local library onboarding hardening:
  - `PaperService.create()` restored to the real scrape/import path instead of the previous placeholder draft path
  - filename-based fallback metadata is still preserved when scrape results are missing or incomplete
  - first-run local-library bootstrap now imports existing PDFs when `appLibFolder` points to a folder with no `default.realm`
  - bootstrap import is guarded so concurrent database initialization does not double-import the same folder
- Local-first UX hardening:
  - cloud/WebDAV settings remain available for compatibility
  - the preference UI now makes local workflow primary and de-emphasizes sync/remoting as optional paths
- Local bootstrap regression hardening:
  - bootstrap is now regression-covered for the “skip when flexible sync is enabled” path
  - bootstrap is now regression-covered for the “skip when file storage is not local” path

### Short-term plan
1. Harden and manually validate the now-landed stable-provider core

- Keep the newly landed stable sources credible as the default app-owned path:
  - done: DOI metadata
  - done: arXiv metadata
  - done: metadata-provider registry integration / alias-based routing / targeted regression coverage
  - done: built-in BibTeX entry provider
  - done: built-in generic HTML/webcontent entry provider
  - done: built-in PDF identifier bootstrap entry provider
- Re-check the remaining caller-boundary behavior:
  - browser import
  - file import / local-library bootstrap
  - refresh/update preservation of local-managed fields
- Keep volatile site-specific scrapers isolated and modular.
- Keep the hook-backed provider path as compatibility fallback rather than the primary architecture anchor.

2. Make the next graph/database seam the main active branch priority

- Move from `relatedPaperIds` adjacency reads toward a dedicated relation/graph read gateway.
- Keep graph/query acceleration isolated from scrape/import churn.
- Continue reducing legacy persistence residue where that does not broaden scope.
- Add more regression coverage around local folder/file edge cases and relation-read behavior.

### Long-term plan

1. High-performance local database and graph queries

- Migrate from adjacency-list relation storage toward canonical edge storage.
- Add dedicated relation/graph read APIs.
- Reduce whole-library scans and improve large-library performance.

2. Local-first library portability instead of app-level cloud sync

- Prioritize using iCloud / OneDrive / Dropbox / Syncthing style folder replication for the library.
- Keep Paperlib semantics local-first rather than depending on app-managed cloud sync.
- Improve resilience and repair tooling for cloud-folder-backed local libraries.

3. Obsidian-inspired high-performance graph experience

- Expand from the current graph view to more scalable graph data services.
- Add stronger neighborhood, filtering, and incremental graph-read capabilities.
- Keep the graph useful on large literature libraries without sacrificing the app’s current visual style.

### Current branch notes
Working branch:

- `feat/obsidian-folder-graph`

Latest verified leader checkpoint for quick resume:

- commit: `fcb94e9` — `Make the stable entry-provider slice verifiable on the leader branch`
- previous handoff checkpoint: `dfd9d2a` — verified graph/database handoff note

### Session resume snapshot

If you start a fresh session later, this is the quickest way to resume the branch intelligently.

#### What is already true now
- Local folder semantics, paper relations, and the graph view are already implemented and regression-covered.
- Built-in DOI and arXiv metadata providers are already in the app-side scrape pipeline.
- Stable metadata providers are now routed through the provider registry instead of special-cased `ScrapeService` branches.
- Requested provider filtering now supports stable-provider aliases while keeping hook fallback available.
- Built-in entry providers now exist ahead of `hook:entry` for:
  - BibTeX payloads / `.bib` files
  - generic HTML/webcontent metadata
  - PDF identifier bootstrap
- The app-side scrape pipeline now supports built-in entry-provider chaining with hook fallback for unmatched payloads.
- `PaperService.create()` now uses the real scrape/import path again, with filename fallback only as a safety net.
- Selecting a brand-new local library folder that already contains PDFs now bootstraps those PDFs into the library automatically.
- Cloud/WebDAV is still present for compatibility, but it is no longer framed as the primary product direction in preferences.
- Database bootstrap regressions now explicitly cover “flexible sync enabled” and “non-local file storage” skip paths.
- Leader-side verification for the current checkpoint passes:
  - `rtk pnpm run typecheck`
  - focused scrape/import/graph regression suites
  - `rtk pnpm exec prettier --check docs/plans/2026-04-02-phase2-graph-db-performance-handoff.md`

#### What is not finished yet
- The newly landed built-in entry-provider slice still needs manual in-app smoke validation for real BibTeX / HTML / PDF imports.
- The merge/finalization boundary should still be reviewed whenever refresh/update behavior is touched:
  - `relatedPaperIds`
  - folders
  - tags
  - notes
  - managed files / file placement
- The graph still reads from the current `relatedPaperIds` adjacency model; canonical edge storage and graph-read APIs are not implemented yet.
- Large-library performance work is still a roadmap item, not a finished branch capability.

#### Recommended next session
The best next execution slice is:

1. do a manual smoke pass for the newly landed stable entry-provider slice:
   - real BibTeX import
   - real browser/webcontent import
   - real PDF bootstrap import
   - confirm hook fallback still behaves sanely when built-ins do not match
2. start the next graph/database seam:
   - add a dedicated relation/graph read gateway
   - begin separating read APIs from the current adjacency-list storage shape
   - keep renderer consumers moving toward the gateway rather than deeper direct storage coupling
3. only after the read gateway is stable, begin the canonical edge-storage migration:
   - relation/graph read APIs
   - large-library query improvements
   - reduced whole-library scans

#### Best files to read first in a new session
- `README.md`
- `docs/plans/phase1-local-db-contract.md`
- `docs/plans/phase1-edge-migration-seam.md`
- `docs/plans/phase2-scrape-architecture-contract.md`
- `docs/plans/phase2-scrape-provider-inventory.md`
- `docs/plans/phase2-safe-merge-policy.md`
- `docs/plans/2026-04-02-phase2-graph-db-performance-handoff.md`
- `app/service/services/paper-service.ts`
- `app/service/services/database-service.ts`
- `app/service/services/scrape-contract.ts`
- `app/service/services/scrape-service.ts`
- `app/service/services/scrape-provider-registry.ts`
- `app/service/services/scrape-builtin-metadata.ts`
- `app/service/services/scrape-stable-entry-providers.ts`
- `app/service/services/scrape-stable-metadata-providers.ts`
- `app/renderer/ui/preference-view/cloud-view.vue`
- `tests/unit-tests/services/paper-service-create.spec.ts`
- `tests/unit-tests/services/database-service.spec.ts`
- `tests/unit-tests/services/scrape-service.spec.ts`
- `tests/unit-tests/services/scrape-stable-entry-provider-chain.spec.ts`
- `tests/unit-tests/services/scrape-stable-entry-providers.spec.ts`
- `tests/unit-tests/services/scrape-stable-metadata-providers.spec.ts`

#### Current known risks / gaps
- The new local-library bootstrap is unit-tested, but not yet validated with a full interactive Electron smoke test.
- The new built-in entry-provider slice is verified at type/test level, but still needs real interactive import checks before it should be treated as fully settled.
- The graph still reads from the current `relatedPaperIds` adjacency model, so large-library scalability work remains open.
- Cloud/WebDAV has been de-emphasized in UI, but the compatibility backend still exists and should be removed only carefully.
- The team-run auto-checkpoint commits are useful historical breadcrumbs, but the leader commit `fcb94e9` is the real resume point to trust.

#### Suggested verification when resuming work

Run at minimum:

```bash
rtk pnpm run typecheck
rtk pnpm exec vitest run --exclude '.omx/**' \
  tests/unit-tests/services/scrape-stable-entry-providers.spec.ts \
  tests/unit-tests/services/scrape-stable-entry-provider-chain.spec.ts \
  tests/unit-tests/services/scrape-stable-metadata-providers.spec.ts \
  tests/unit-tests/services/paper-service-create.spec.ts \
  tests/unit-tests/services/database-service.spec.ts \
  tests/unit-tests/services/file-service.spec.ts \
  tests/unit-tests/services/scrape-service.spec.ts
```

If the next session touches graph/relation code, also rerun the graph/relation suites:

```bash
rtk pnpm exec vitest run --exclude '.omx/**' \
  tests/unit-tests/services/paper-relations.spec.ts \
  tests/unit-tests/renderer/paper-graph.spec.ts \
  tests/unit-tests/renderer/paper-graph-view.spec.ts
```

If you need the exact current leader checkpoint before starting, confirm it with:

```bash
rtk git branch --show-current
rtk git log --oneline -3
```

If you want the wider current regression floor for the entry-provider slice, run:

```bash
rtk pnpm exec vitest run --exclude '.omx/**' \
  tests/unit-tests/services/scrape-stable-metadata-providers.spec.ts \
  tests/unit-tests/services/scrape-stable-entry-providers.spec.ts \
  tests/unit-tests/services/scrape-stable-entry-provider-chain.spec.ts \
  tests/unit-tests/services/paper-service-create.spec.ts \
  tests/unit-tests/services/database-service.spec.ts \
  tests/unit-tests/services/file-service.spec.ts \
  tests/unit-tests/services/browser-extension-service.spec.ts \
  tests/unit-tests/services/scrape-service.spec.ts \
  tests/unit-tests/services/paper-relations.spec.ts \
  tests/unit-tests/renderer/paper-graph.spec.ts \
  tests/unit-tests/renderer/paper-graph-view.spec.ts
```

Recent planning/reference docs for this fork:

- `docs/plans/phase1-local-db-contract.md`
- `docs/plans/phase1-legacy-persistence-audit.md`
- `docs/plans/phase1-edge-migration-seam.md`
- `docs/plans/phase1-readiness-summary.md`
- `docs/plans/2026-04-02-phase2-graph-db-performance-handoff.md`
- `docs/plans/phase2-scrape-architecture-contract.md`
- `docs/plans/phase2-scrape-provider-inventory.md`
- `docs/plans/phase2-safe-merge-policy.md`

### 1. Get the branch and install dependencies

If you are testing on another machine, clone your fork and switch to this branch first:

```bash
git clone git@github.com:SakuraToErii/paperlib.git
cd paperlib
git checkout feat/obsidian-folder-graph
pnpm install
```

If you already have the repository locally:

```bash
git fetch origin
git checkout feat/obsidian-folder-graph
git pull
pnpm install
```

Requirements:

- Node.js 20.14+
- pnpm (v9 recommended; pnpm v10 requires approving install/build scripts for native/Electron deps)

Install dependencies:

```bash
pnpm install
```

If you use pnpm v10+, approve the build/install scripts that Paperlib depends on before starting the app:

```bash
pnpm approve-builds electron esbuild keytar realm vue-demi
pnpm install
```

Without that approval, pnpm skips Electron's install script, `node_modules/electron/dist` is never downloaded, and `pnpm run dev` fails with `Error: Electron uninstall`.

Fresh-machine note:

- `pnpm install` can succeed while still skipping Electron's postinstall download if your pnpm config requires explicit approval for build scripts.
- If `pnpm run dev` fails with `Error: Electron uninstall` or `Electron failed to install correctly`, approve the blocked build scripts and reinstall/rebuild Electron.

Recommended recovery steps:

```bash
pnpm approve-builds
pnpm install
pnpm exec electron --version
```

If Electron is still missing, use the package's own fallback reinstall path:

```bash
rm -rf node_modules/electron
pnpm add -D electron@31.1.0
pnpm exec electron --version
```

You should only continue once `pnpm exec electron --version` prints the installed Electron version successfully.

### 2. Start the app in development mode

```bash
pnpm run dev
```

This launches the Electron app with the renderer in watch mode.

### 3. Recommended local test setup

Before testing the new behavior, prepare a clean local paper library on your machine, for example:

```text
~/Paperlib-Test-Library/
  RL/
    Exploration/
    Reward-Shaping/
  LLM/
    Agents/
    RAG/
  Robot/
    Manipulation/
```

Import several PDFs into different folders so that you can verify:

- top-level folder color families (for example RL / LLM / Robot)
- child-folder shade variations inside the same family
- recursive folder browsing behavior
- graph node sizing and edge directions

### 4. Manual test checklist

#### Folder structure behavior

- Create a folder from the app and confirm the real local directory is created.
- Rename a folder and confirm the real local directory is renamed.
- Move a folder and confirm the real local directory moves with it.
- Delete an empty folder and confirm the local directory is removed.
- Verify that deleting a non-empty folder is blocked with proper feedback.
- Select a parent folder and confirm papers from descendant folders are included.
- Drag a paper into another folder and confirm its managed local path is updated.

#### Related papers behavior

- Open a paper detail panel and add related papers.
- Confirm the relation is visible from both papers.
- Remove a relation and confirm it disappears from both sides.
- Delete a paper that has relations and confirm no dangling relation remains.
- If available in your current UI flow, try batch relate / batch unrelate from multiple selected papers.

#### Graph view behavior

- Switch between list, table, and graph views.
- Confirm the graph reflects the current query, search, and folder scope.
- Confirm each paper appears as one node and attachments are excluded.
- Confirm node size grows with the number of related papers.
- Confirm edge direction follows publication time ordering.
- Confirm node colors follow top-level folder families, with shade variations for subfolders.
- Confirm click, double-click, hover, zoom, pan, focus-selected, neighborhood mode, back-to-whole-graph, and reset behaviors work correctly.

#### Regression checks

- Edit tags and confirm tags still work independently from folders.
- Restart the app and confirm folders, relations, and graph data remain consistent.
- Run a full typecheck before submitting changes:

```bash
pnpm run typecheck
```

### 5. Optional targeted tests

These tests are useful if you want to quickly validate the core semantics before or after manual testing:

```bash
pnpm vitest run \
  tests/unit-tests/base/folder.spec.ts \
  tests/unit-tests/renderer/paper-graph.spec.ts \
  tests/unit-tests/renderer/paper-graph-view.spec.ts \
  tests/unit-tests/services/paper-relations.spec.ts \
  tests/unit-tests/services/sync-service.spec.ts
```

### 6. Optional packaging smoke test

If you want to verify that the app still packages locally on macOS Apple Silicon:

```bash
pnpm run build-mac-arm-dev
```

Use the platform-specific build scripts in `package.json` for other targets.

## Donate

<a href="https://www.buymeacoffee.com/geoffreychen777" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>

<a href="https://www.buymeacoffee.com/geoffreychen777" target="_blank"><img src="./assets/wechat.png" alt="Buy Me A Coffee" height="174" width="174"></a>

## Usage Demos

### Scrape metadata for conference papers such as ICLR, ICML, NeurIPS

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/4ffc556e-ba9c-48f3-9066-0370487a90ca" style="width: 70%" />

### Smooth paper writing integration with any editors.

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/fefb4e9e-7d6e-4259-b4f1-bc7109c87802" style="width: 70%" />

### Summarize your papers by LLM. Tag your papers by LLM

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/87040ded-dd4a-470a-bceb-73cd9d334cc3" style="width: 70%" />

### Organize your library with tags, folders and smart filters

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/391ee552-a3be-4e16-8023-e1c57ba45481" style="width: 70%" />

### Three view mode

<img src="https://github.com/Future-Scholars/paperlib/assets/14183213/c8a06b1d-0dc2-4291-9f4b-d38b01e760c2" style="width: 70%" />

## Sponsors

<img src="https://user-images.githubusercontent.com/14183213/179353324-42ee9831-68a8-4816-97f5-cc7be7189ce8.png" style="width: 160px"/>

<a href="cloudflare.com"><img src="https://blog.cloudflare.com/content/images/2022/10/CF_logo_stacked_blktype.png" style="width: 160px"/></a>

<a href="https://www.digitalocean.com/">
  <img src="https://opensource.nyc3.cdn.digitaloceanspaces.com/attribution/assets/SVG/DO_Logo_horizontal_blue.svg" width="160px">
</a>

## Contribute to Paperlib

### Extensions

Please refer to [link](https://paperlib.app/en/extension-doc/) for the development document.

### New Features

I'm open to any new feature request, we can discuss it in the issue.

## License

[GPL-3.0 License](./LICENSE)
