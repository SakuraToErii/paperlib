import { beforeEach, describe, expect, it, vi } from "vitest";

const addSyncLog = vi.fn(async () => undefined);

vi.mock("../../../app/models/entity", async () => {
  const { ObjectId } = await import("bson");

  class Entity {
    _id: InstanceType<typeof ObjectId>;
    title: string;
    authors: string;
    year: string;
    relatedPaperIds: InstanceType<typeof ObjectId>[];

    constructor(object: any = {}, initObjectId = false) {
      this._id = object?._id
        ? new ObjectId(object._id)
        : initObjectId
        ? new ObjectId()
        : ("" as any);
      this.title = object?.title || "";
      this.authors = object?.authors || "";
      this.year = object?.year || "";
      this.relatedPaperIds = (object?.relatedPaperIds || []).map(
        (id: any) => new ObjectId(id)
      );
    }
  }

  return { Entity };
});

import { ObjectId } from "bson";
import { Entity } from "../../../app/models/entity";
import { PaperService } from "../../../app/service/services/paper-service";
import {
  normalizeEntityFolderPath,
  normalizeRelationIds,
  preserveMissingRelationIds,
  removeRelationIds,
  repairRelationGraph,
} from "../../../app/service/services/paper-relation-integrity";

declare global {
  var PLAPILocal: any;
}

type InMemoryPaper = Entity & { relatedPaperIds: ObjectId[] };

function createPaper(
  id: string,
  relatedPaperIds: string[] = []
): InMemoryPaper {
  return new Entity(
    {
      _id: new ObjectId(id),
      title: `Paper ${id.slice(-4)}`,
      authors: "Test Author",
      year: "2024",
      relatedPaperIds: relatedPaperIds.map(
        (relatedId) => new ObjectId(relatedId)
      ),
    },
    false
  ) as InMemoryPaper;
}

function createHarness(initialPapers: InMemoryPaper[]) {
  const papers = new Map(initialPapers.map((paper) => [`${paper._id}`, paper]));

  const realm = {
    safeWrite: (callback: () => void) => callback(),
  };

  const repository = {
    on: vi.fn(),
    load: vi.fn(() => Array.from(papers.values())),
    loadByIds: vi.fn((_realm: unknown, ids: Array<string | ObjectId>) =>
      ids
        .map((id) => papers.get(`${id}`))
        .filter((paper): paper is InMemoryPaper => Boolean(paper))
    ),
    delete: vi.fn(
      (
        _realm: unknown,
        ids?: Array<string | ObjectId>,
        paperEntities?: Entity[]
      ) => {
        const targetIds = new Set(
          (ids || paperEntities?.map((entity) => entity._id) || []).map(
            (id) => `${id}`
          )
        );

        for (const id of targetIds) {
          papers.delete(id);
        }

        return [];
      }
    ),
  };

  const databaseCore = {
    getState: vi.fn(() => false),
    already: vi.fn(),
    realm: vi.fn(async () => realm),
    getPartition: vi.fn(() => "unit-test"),
  };

  const noopAsync = vi.fn(async () => undefined);
  const noopSync = vi.fn(() => undefined);

  const service = new PaperService(
    databaseCore as any,
    repository as any,
    {} as any,
    {
      delete: noopAsync,
      updateFullTextCache: noopSync,
    } as any,
    {
      createTask: noopSync,
    } as any,
    {
      syncFoldersWithLibrary: noopAsync,
    } as any,
    {
      move: vi.fn(async (paper: Entity) => paper),
      remove: noopSync,
      moveFile: noopSync,
      removeFile: noopAsync,
    } as any,
    {
      info: noopSync,
      warn: noopSync,
      error: noopSync,
      progress: noopSync,
    } as any
  );

  return {
    service,
    papers,
    repository,
  };
}

function relatedIdsOf(papers: Map<string, InMemoryPaper>, id: string) {
  return (papers.get(id)?.relatedPaperIds || []).map(
    (relatedId) => `${relatedId}`
  );
}

describe("paper relation integrity helpers", () => {
  it("preserves existing related ids when an incoming update omits the relation field", () => {
    const relatedPaperId = "507f1f77bcf86cd7994390aa";

    expect(
      preserveMissingRelationIds(
        { relatedPaperIds: [relatedPaperId] },
        {} as { relatedPaperIds?: string[] }
      )
    ).toEqual([relatedPaperId]);
    expect(
      preserveMissingRelationIds(
        { relatedPaperIds: [relatedPaperId] },
        { relatedPaperIds: [] }
      )
    ).toEqual([]);
  });

  it("repairs graphs symmetrically while dropping self, duplicates, invalid, and missing ids", () => {
    const paperA = "507f1f77bcf86cd7994390a1";
    const paperB = "507f1f77bcf86cd7994390a2";
    const paperC = "507f1f77bcf86cd7994390a3";

    const repaired = repairRelationGraph([
      { _id: paperA, relatedPaperIds: [paperB, paperB, paperA, "bad-id"] as any },
      { _id: paperB, relatedPaperIds: [] },
      { _id: paperC, relatedPaperIds: [paperB] },
    ]);

    expect(
      Object.fromEntries(
        repaired.map(({ paper, relatedIds }) => [`${paper._id}`, relatedIds])
      )
    ).toEqual({
      [paperA]: [paperB],
      [paperB]: [paperA, paperC],
      [paperC]: [paperB],
    });
  });

  it("removes deleted ids through the shared normalization path", () => {
    const paperA = "507f1f77bcf86cd7994390b1";
    const paperB = "507f1f77bcf86cd7994390b2";

    expect(
      removeRelationIds([paperA, paperA, paperB, "bad-id"] as any, [paperA])
    ).toEqual([paperB]);
    expect(normalizeRelationIds([paperA, paperA, "bad-id"] as any)).toEqual([
      paperA,
    ]);
  });

  it("chooses the deepest normalized folder path as the canonical folder", () => {
    expect(
      normalizeEntityFolderPath({
        folders: [{ name: " Research " }, { name: "Research/ML " }],
      })
    ).toBe("Research/ML");
    expect(normalizeEntityFolderPath({ folders: [{ name: "  " }] })).toBe("");
  });
});

describe("PaperService relations", () => {
  beforeEach(() => {
    addSyncLog.mockClear();
    globalThis.PLAPILocal = {
      syncService: {
        addSyncLog,
      },
    };
  });

  it("keeps relations symmetric and deduplicated via the real service method", async () => {
    const paperA = "507f1f77bcf86cd799439011";
    const paperB = "507f1f77bcf86cd799439012";
    const paperC = "507f1f77bcf86cd799439013";

    const { service, papers } = createHarness([
      createPaper(paperA),
      createPaper(paperB, [paperA, paperA, paperB]),
      createPaper(paperC),
    ]);

    await service.setRelatedPaperIds(paperA, [
      paperB,
      paperB,
      paperA,
      paperC,
    ] as any);

    expect(relatedIdsOf(papers, paperA)).toEqual([paperB, paperC]);
    expect(relatedIdsOf(papers, paperB)).toEqual([paperA]);
    expect(relatedIdsOf(papers, paperC)).toEqual([paperA]);
  });

  it("removes stale reverse links when the related paper set shrinks", async () => {
    const paperA = "507f1f77bcf86cd799439021";
    const paperB = "507f1f77bcf86cd799439022";
    const paperC = "507f1f77bcf86cd799439023";

    const { service, papers } = createHarness([
      createPaper(paperA, [paperB, paperC]),
      createPaper(paperB, [paperA]),
      createPaper(paperC, [paperA]),
    ]);

    await service.setRelatedPaperIds(paperA, [paperB] as any);

    expect(relatedIdsOf(papers, paperA)).toEqual([paperB]);
    expect(relatedIdsOf(papers, paperB)).toEqual([paperA]);
    expect(relatedIdsOf(papers, paperC)).toEqual([]);
  });

  it("ignores invalid, self, and nonexistent related ids while keeping valid links symmetric", async () => {
    const paperA = "507f1f77bcf86cd799439041";
    const paperB = "507f1f77bcf86cd799439042";
    const nonexistent = "507f1f77bcf86cd7994390ff";

    const { service, papers } = createHarness([
      createPaper(paperA),
      createPaper(paperB),
    ]);

    await service.setRelatedPaperIds(paperA, [
      "not-an-object-id",
      paperA,
      nonexistent,
      paperB,
      paperB,
    ] as any);

    expect(relatedIdsOf(papers, paperA)).toEqual([paperB]);
    expect(relatedIdsOf(papers, paperB)).toEqual([paperA]);
  });

  it("ignores an invalid source paper id without mutating stored relations", async () => {
    const paperA = "507f1f77bcf86cd799439051";
    const paperB = "507f1f77bcf86cd799439052";
    const { service, papers } = createHarness([
      createPaper(paperA, [paperB]),
      createPaper(paperB, [paperA]),
    ]);

    await service.setRelatedPaperIds("not-an-object-id" as any, [] as any);

    expect(relatedIdsOf(papers, paperA)).toEqual([paperB]);
    expect(relatedIdsOf(papers, paperB)).toEqual([paperA]);
  });

  it("delete delegates relation cleanup to the repository-side owner", async () => {
    const paperA = "507f1f77bcf86cd799439031";
    const paperB = "507f1f77bcf86cd799439032";
    const paperC = "507f1f77bcf86cd799439033";

    const { service, papers, repository } = createHarness([
      createPaper(paperA, [paperB, paperC]),
      createPaper(paperB, [paperA, paperC]),
      createPaper(paperC, [paperA, paperB]),
    ]);

    await service.delete([paperB] as any, undefined, true);

    expect(Array.from(papers.keys())).toEqual([paperA, paperC]);
    expect(relatedIdsOf(papers, paperA)).toEqual([paperB, paperC]);
    expect(relatedIdsOf(papers, paperC)).toEqual([paperA, paperB]);
    expect(repository.delete).toHaveBeenCalled();
  });

  it("preserves relatedPaperIds across update when the incoming draft omits relations", async () => {
    const paperA = "507f1f77bcf86cd799439071";
    const paperB = "507f1f77bcf86cd799439072";

    const existingPaper = createPaper(paperA, [paperB]);
    const incomingDraft = {
      _id: paperA,
      title: "Updated title",
      authors: "Updated Author",
      year: "2025",
    } as any;

    const repositoryUpdate = vi.fn(
      (
        _realm: unknown,
        paperEntity: Entity,
        _partition: string,
        _allowUpdate: boolean
      ) => {
        const stored = existingPaper;
        stored.title = paperEntity.title;
        stored.authors = paperEntity.authors;
        stored.year = paperEntity.year;
        stored.relatedPaperIds = paperEntity.relatedPaperIds as ObjectId[];
        return true;
      }
    );

    const repository = {
      on: vi.fn(),
      load: vi.fn(() => [existingPaper]),
      loadByIds: vi.fn((_realm: unknown, ids: Array<string | ObjectId>) =>
        ids
          .map((id) => (`${id}` === paperA ? existingPaper : undefined))
          .filter((paper): paper is InMemoryPaper => Boolean(paper))
      ),
      toRealmObject: vi.fn((_realm: unknown, paperEntity: { _id: string | ObjectId }) =>
        `${paperEntity._id}` === paperA ? existingPaper : undefined
      ),
      update: repositoryUpdate,
    };

    const databaseCore = {
      getState: vi.fn(() => false),
      already: vi.fn(),
      realm: vi.fn(async () => ({ safeWrite: (callback: () => void) => callback() })),
      getPartition: vi.fn(() => "unit-test"),
    };

    const noopAsync = vi.fn(async () => undefined);
    const noopSync = vi.fn(() => undefined);

    const service = new PaperService(
      databaseCore as any,
      repository as any,
      {} as any,
      {
        delete: noopAsync,
        updateFullTextCache: noopSync,
      } as any,
      {
        createTask: noopSync,
      } as any,
      {
        syncFoldersWithLibrary: noopAsync,
      } as any,
      {
        move: vi.fn(async (paper: Entity) => paper),
        remove: noopSync,
        moveFile: noopSync,
        removeFile: noopAsync,
      } as any,
      {
        info: noopSync,
        warn: noopSync,
        error: noopSync,
        progress: noopSync,
      } as any
    );

    await service.update([incomingDraft], false, true, true);

    expect(repository.toRealmObject).toHaveBeenCalled();
    expect(repositoryUpdate).toHaveBeenCalled();
    expect(existingPaper.relatedPaperIds.map((id) => `${id}`)).toEqual([paperB]);
  });

  it("batch relate creates a clique across the selected papers without disturbing outside links", async () => {
    const paperA = "507f1f77bcf86cd799439061";
    const paperB = "507f1f77bcf86cd799439062";
    const paperC = "507f1f77bcf86cd799439063";
    const paperD = "507f1f77bcf86cd799439064";

    const { service, papers } = createHarness([
      createPaper(paperA, [paperD]),
      createPaper(paperB, [paperD]),
      createPaper(paperC),
      createPaper(paperD, [paperA, paperB]),
    ]);

    await service.relateSelectedPapers([
      paperA,
      paperB,
      paperC,
      paperA,
      "not-an-object-id",
      "507f1f77bcf86cd7994390ff",
    ] as any);

    expect(addSyncLog).toHaveBeenCalledWith("paper", "update", {
      relatedPaperBatchUpdate: {
        paperIds: [paperA, paperB, paperC, "507f1f77bcf86cd7994390ff"],
        action: "relate",
      },
    });
    expect(relatedIdsOf(papers, paperA)).toEqual([paperD, paperB, paperC]);
    expect(relatedIdsOf(papers, paperB)).toEqual([paperD, paperA, paperC]);
    expect(relatedIdsOf(papers, paperC)).toEqual([paperA, paperB]);
    expect(relatedIdsOf(papers, paperD)).toEqual([paperA, paperB]);
  });

  it("batch relate skips logging when replayed from sync", async () => {
    const paperA = "507f1f77bcf86cd799439081";
    const paperB = "507f1f77bcf86cd799439082";

    const { service, papers } = createHarness([
      createPaper(paperA),
      createPaper(paperB),
    ]);

    await service.relateSelectedPapers([paperA, paperB] as any, true);

    expect(addSyncLog).not.toHaveBeenCalled();
    expect(relatedIdsOf(papers, paperA)).toEqual([paperB]);
    expect(relatedIdsOf(papers, paperB)).toEqual([paperA]);
  });

  it("batch unrelate removes only intra-selection edges and preserves outside links", async () => {
    const paperA = "507f1f77bcf86cd799439071";
    const paperB = "507f1f77bcf86cd799439072";
    const paperC = "507f1f77bcf86cd799439073";
    const paperD = "507f1f77bcf86cd799439074";

    const { service, papers } = createHarness([
      createPaper(paperA, [paperB, paperC, paperD]),
      createPaper(paperB, [paperA, paperC, paperD]),
      createPaper(paperC, [paperA, paperB]),
      createPaper(paperD, [paperA, paperB]),
    ]);

    await service.unrelateSelectedPapers([
      paperA,
      paperB,
      paperC,
      paperA,
      "not-an-object-id",
      "507f1f77bcf86cd7994390ff",
    ] as any);

    expect(addSyncLog).toHaveBeenCalledWith("paper", "update", {
      relatedPaperBatchUpdate: {
        paperIds: [paperA, paperB, paperC, "507f1f77bcf86cd7994390ff"],
        action: "unrelate",
      },
    });
    expect(relatedIdsOf(papers, paperA)).toEqual([paperD]);
    expect(relatedIdsOf(papers, paperB)).toEqual([paperD]);
    expect(relatedIdsOf(papers, paperC)).toEqual([]);
    expect(relatedIdsOf(papers, paperD)).toEqual([paperA, paperB]);
  });

  it("batch unrelate skips logging when replayed from sync", async () => {
    const paperA = "507f1f77bcf86cd799439091";
    const paperB = "507f1f77bcf86cd799439092";
    const paperC = "507f1f77bcf86cd799439093";

    const { service, papers } = createHarness([
      createPaper(paperA, [paperB, paperC]),
      createPaper(paperB, [paperA]),
      createPaper(paperC, [paperA]),
    ]);

    await service.unrelateSelectedPapers([paperA, paperB] as any, true);

    expect(addSyncLog).not.toHaveBeenCalled();
    expect(relatedIdsOf(papers, paperA)).toEqual([paperC]);
    expect(relatedIdsOf(papers, paperB)).toEqual([]);
    expect(relatedIdsOf(papers, paperC)).toEqual([paperA]);
  });
});
