import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../app/models/entity", async () => {
  const { ObjectId } = await import("bson");

  class Entity {
    _id: InstanceType<typeof ObjectId>;
    title: string;
    authors: string;
    year: string;
    relatedPaperIds: InstanceType<typeof ObjectId>[];

    constructor(object: any = {}, initObjectId = false) {
      this._id = object?._id ? new ObjectId(object._id) : initObjectId ? new ObjectId() : ("" as any);
      this.title = object?.title || "";
      this.authors = object?.authors || "";
      this.year = object?.year || "";
      this.relatedPaperIds = (object?.relatedPaperIds || []).map((id: any) => new ObjectId(id));
    }
  }

  return { Entity };
});

import { ObjectId } from "bson";
import { Entity } from "../../../app/models/entity";
import { PaperService } from "../../../app/service/services/paper-service";

declare global {
  // eslint-disable-next-line no-var
  var PLAPILocal: any;
}

type InMemoryPaper = Entity & { relatedPaperIds: ObjectId[] };

function createPaper(id: string, relatedPaperIds: string[] = []): InMemoryPaper {
  return new Entity({
    _id: new ObjectId(id),
    title: `Paper ${id.slice(-4)}`,
    authors: "Test Author",
    year: "2024",
    relatedPaperIds: relatedPaperIds.map((relatedId) => new ObjectId(relatedId)),
  }, false) as InMemoryPaper;
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
    delete: vi.fn((_realm: unknown, ids?: Array<string | ObjectId>, paperEntities?: Entity[]) => {
      const targetIds = new Set(
        (ids || paperEntities?.map((entity) => entity._id) || []).map((id) => `${id}`)
      );

      for (const id of targetIds) {
        papers.delete(id);
      }

      return [];
    }),
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
  return (papers.get(id)?.relatedPaperIds || []).map((relatedId) => `${relatedId}`);
}

describe("PaperService relations", () => {
  beforeEach(() => {
    globalThis.PLAPILocal = {
      syncService: {
        addSyncLog: vi.fn(async () => undefined),
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

    await service.setRelatedPaperIds(paperA, [paperB, paperB, paperA, paperC] as any);

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

  it("cleans deleted paper ids from remaining papers during delete", async () => {
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
    expect(relatedIdsOf(papers, paperA)).toEqual([paperC]);
    expect(relatedIdsOf(papers, paperC)).toEqual([paperA]);
    expect(repository.delete).toHaveBeenCalled();
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

    await service.setBatchRelatedPaperIds([
      paperA,
      paperB,
      paperC,
      paperA,
      "not-an-object-id",
      "507f1f77bcf86cd7994390ff",
    ] as any);

    expect(relatedIdsOf(papers, paperA)).toEqual([paperD, paperB, paperC]);
    expect(relatedIdsOf(papers, paperB)).toEqual([paperD, paperA, paperC]);
    expect(relatedIdsOf(papers, paperC)).toEqual([paperA, paperB]);
    expect(relatedIdsOf(papers, paperD)).toEqual([paperA, paperB]);
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

    await service.removeBatchRelatedPaperIds([
      paperA,
      paperB,
      paperC,
      paperA,
      "not-an-object-id",
      "507f1f77bcf86cd7994390ff",
    ] as any);

    expect(relatedIdsOf(papers, paperA)).toEqual([paperD]);
    expect(relatedIdsOf(papers, paperB)).toEqual([paperD]);
    expect(relatedIdsOf(papers, paperC)).toEqual([]);
    expect(relatedIdsOf(papers, paperD)).toEqual([paperA, paperB]);
  });
});
