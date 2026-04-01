import { describe, expect, it } from "vitest";

import {
  escapeRealmString,
  getFolderPathFromRelativeFile,
  getFolderPrefixQuery,
  isFolderPathInside,
  isInternalLibraryPath,
  normalizeFolderPath,
} from "../../../app/base/folder";
import { QuerySentenceService } from "../../../app/renderer/services/querysentence-service";
import { CategorizerType } from "../../../app/models/categorizer";

describe("folder query contract invariants", () => {
  it("normalizes recursive folder inputs before building prefix queries", () => {
    expect(getFolderPrefixQuery(" Research\\ML / Agents ")).toBe(
      '(ANY folders.name == "Research/ML/Agents") OR (ANY folders.name BEGINSWITH "Research/ML/Agents/")'
    );
  });

  it("matches only the exact folder or its descendants", () => {
    const query = getFolderPrefixQuery("Research/ML");

    expect(query).toContain('ANY folders.name == "Research/ML"');
    expect(query).toContain('ANY folders.name BEGINSWITH "Research/ML/"');
    expect(query).not.toContain('Research/MLX');
  });

  it("escapes quotes for realm-safe folder queries after normalization", () => {
    expect(escapeRealmString('A/B"C')).toBe('A/B\\"C');
    expect(getFolderPrefixQuery('A/B"C')).toBe(
      '(ANY folders.name == "A/B\\"C") OR (ANY folders.name BEGINSWITH "A/B\\"C/")'
    );
  });
});

describe("folder compatibility helpers", () => {
  it("keeps empty parent filters compatible with legacy default behavior", () => {
    expect(isFolderPathInside("Research/ML", "")).toBe(true);
    expect(isFolderPathInside("Research/ML", "   ")).toBe(true);
  });

  it("treats only exact parents and descendants as inside", () => {
    expect(isFolderPathInside("Research/ML", "Research")).toBe(true);
    expect(isFolderPathInside("Research/ML/Agents", "Research/ML")).toBe(true);
    expect(isFolderPathInside("Research/MLX", "Research/ML")).toBe(false);
    expect(isFolderPathInside("Research", "Research/ML")).toBe(false);
  });

  it("derives folder paths from relative file paths after normalization", () => {
    expect(normalizeFolderPath(" Research\\ML / paper.pdf ")).toBe(
      "Research/ML/paper.pdf"
    );
    expect(getFolderPathFromRelativeFile(" Research\\ML / paper.pdf ")).toBe(
      "Research/ML"
    );
    expect(getFolderPathFromRelativeFile("paper.pdf")).toBe("");
  });
});

describe("sync/internal library path safety", () => {
  it("flags management files and realm artifacts regardless of nesting", () => {
    expect(isInternalLibraryPath("sync/.realm.management/state.json")).toBe(true);
    expect(isInternalLibraryPath("folder/cache.realm.management/LOCK")).toBe(true);
    expect(isInternalLibraryPath("folder/library.realm.note")).toBe(true);
    expect(isInternalLibraryPath("folder/library.realm.lock")).toBe(true);
  });

  it("does not classify user folders with similar prefixes as internal", () => {
    expect(isInternalLibraryPath("sync/.realm.management-backup/state.json")).toBe(false);
    expect(isInternalLibraryPath("folder/cache.realm.management.backup/file.txt")).toBe(
      false
    );
    expect(isInternalLibraryPath("folder/library.realm.txt")).toBe(false);
  });
});

describe("folder query integration invariants", () => {
  it("escapes quoted folder names when building renderer folder queries", () => {
    const service = new QuerySentenceService();
    const graph = service.parseDAG(
      [
        {
          _id: "folder-id" as any,
          name: 'Research/ML "Agents"',
          color: "blue",
          count: 1,
          children: [],
        },
      ],
      CategorizerType.PaperFolder
    );

    expect(graph.getNodeAttribute("folder-id", "query")).toBe(
      '(ANY folders.name == "Research/ML \\\"Agents\\\"") OR (ANY folders.name BEGINSWITH "Research/ML \\\"Agents\\\"/")'
    );
  });
});
