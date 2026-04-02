import { describe, expect, it, vi } from "vitest";

import { mergeMetadata } from "../../../app/base/metadata";
import { Entity } from "../../../app/models/entity";
import { DefaultMetadataMergePolicy } from "../../../app/service/services/scrape-merge-policy";
import { ScrapeProviderRegistry } from "../../../app/service/services/scrape-provider-registry";
import { ScrapeService } from "../../../app/service/services/scrape-service";

describe("ScrapeService Slice 2 scaffolding", () => {
  it("orders registry providers by priority and replaces duplicate ids", () => {
    const registry = new ScrapeProviderRegistry();

    registry.register({ id: "slow", kind: "metadata", priority: 20 });
    registry.register({ id: "fast", kind: "metadata", priority: 10 });
    registry.register({ id: "slow", kind: "metadata", priority: 5, label: "replaced" });

    expect(registry.list("metadata")).toEqual([
      { id: "slow", kind: "metadata", priority: 5, label: "replaced" },
      { id: "fast", kind: "metadata", priority: 10 },
    ]);
    expect(registry.get("metadata", "slow")?.label).toBe("replaced");
  });

  it("merge policy delegates to mergeMetadata while allowing force refresh priority override", () => {
    const policy = new DefaultMetadataMergePolicy();
    const origin = new Entity({
      _id: "507f1f77bcf86cd799439011",
      title: "Original Title",
      authors: "Seed Author",
      year: "2024",
      publication: "arXiv",
      tags: [],
      folders: [],
      supplementaries: {},
    });
    const draft = new Entity(origin);
    const higherPriorityMerged = policy.merge(
      origin,
      new Entity(origin),
      {
        provider: { id: "provider-a", kind: "metadata" },
        status: "matched",
        basis: "paper-entity",
        data: new Entity({
          ...origin,
          title: "Updated Title",
          publication: "Nature",
        }),
        warnings: [],
      },
      { title: Number.POSITIVE_INFINITY, publication: Number.POSITIVE_INFINITY },
      { providerId: "provider-a", providerIndex: 3, force: false }
    );

    expect(higherPriorityMerged.paperEntityDraft.title).toBe("Updated Title");
    expect(higherPriorityMerged.mergePriorityLevel.title).toBe(3);

    const forcedMerged = policy.merge(
      origin,
      draft,
      {
        provider: { id: "provider-b", kind: "metadata" },
        status: "matched",
        basis: "paper-entity",
        data: new Entity({
          ...origin,
          title: "Forced Title",
          publication: "Science",
        }),
        warnings: [],
      },
      { title: 0, publication: 0 },
      { providerId: "provider-b", providerIndex: 99, force: true }
    );

    expect(forcedMerged.paperEntityDraft.title).toBe("Forced Title");
    expect(forcedMerged.paperEntityDraft.publication).toBe("Science");
  });
});

describe("ScrapeService PaperEntity bypass compatibility", () => {
  it("preserves existing relatedPaperIds when metadata refresh omits relation fields", () => {
    const relatedPaperId = "507f1f77bcf86cd799439099";
    const origin = new Entity({
      _id: "507f1f77bcf86cd799439011",
      title: "Seed Title",
      authors: "Seed Author",
      year: "2024",
      publication: "arXiv",
      relatedPaperIds: [relatedPaperId as any],
      tags: [],
      folders: [],
      supplementaries: {},
    });
    const draft = new Entity(origin);
    const scraped = new Entity({
      _id: "507f1f77bcf86cd799439011",
      title: "Refreshed Title",
      authors: "Refreshed Author",
      year: "2025",
      publication: "Nature",
      tags: [],
      folders: [],
      supplementaries: {},
    });

    const { paperEntityDraft } = mergeMetadata(
      origin as any,
      draft as any,
      scraped as any,
      {
        title: Number.POSITIVE_INFINITY,
        authors: Number.POSITIVE_INFINITY,
        year: Number.POSITIVE_INFINITY,
        publication: Number.POSITIVE_INFINITY,
        relatedPaperIds: Number.POSITIVE_INFINITY,
      },
      0
    );

    expect(paperEntityDraft.title).toBe("Refreshed Title");
    expect(paperEntityDraft.relatedPaperIds.map((id) => `${id}`)).toEqual([
      relatedPaperId,
    ]);
  });

  it("rehydrates metadata hook results so title formatting stays intact after hook recovery", async () => {
    const beforeMetadataResult = {
      _id: "507f1f77bcf86cd799439011",
      title: "Recovered <math><mi>x</mi></math> title",
      authors: "Test Author",
      year: "2024",
      supplementaries: {},
      tags: [],
      folders: [],
    };

    const hookService = {
      hasHook: vi.fn((hookName: string) => {
        if (hookName === "beforeScrapeMetadata") {
          return "modify";
        }
        return false;
      }),
      modifyHookPoint: vi.fn(async (...args: any[]) => {
        if (args[0] === "beforeScrapeMetadata") {
          return [[beforeMetadataResult], args[3], args[4]];
        }
        return args.slice(2);
      }),
      transformhookPoint: vi.fn(async () => []),
    };

    const logService = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      progress: vi.fn(),
    };

    const service = new ScrapeService(hookService as any, logService as any);
    const seedEntity = new Entity({
      _id: "507f1f77bcf86cd799439011",
      title: "Seed Title",
      authors: "Seed Author",
      year: "2024",
      supplementaries: {},
      tags: [],
      folders: [],
    });

    const [result] = await service.scrapeMetadata([seedEntity], [], false);

    expect(result).toBeInstanceOf(Entity);
    expect(result.title).toBe(beforeMetadataResult.title);
  });

  it("bypasses scrapeEntry hooks for PaperEntity payloads that already contain entity drafts", async () => {
    const hookService = {
      hasHook: vi.fn((hookName: string) => {
        if (hookName === "scrapeEntry") {
          return "transform";
        }
        return false;
      }),
      modifyHookPoint: vi.fn(async (...args: any[]) => args.slice(2)),
      transformhookPoint: vi.fn(async () => []),
    };

    const logService = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      progress: vi.fn(),
    };

    globalThis.PLAPILocal = {
      serviceRPCService: {
        waitForAPI: vi.fn(async () => true),
      },
    } as any;

    globalThis.PLExtAPI = {
      extensionManagementService: {
        isOfficialScrapeExtensionInstalled: vi.fn(async () => "loaded"),
      },
    } as any;

    const service = new ScrapeService(hookService as any, logService as any);
    const payload = {
      type: "PaperEntity",
      value: {
        _id: "507f1f77bcf86cd799439011",
        title: "Draft Title",
        authors: "Test Author",
        year: "2024",
        journal: "Journal of Tests",
        publication: "",
        supplementaries: {
          main: {
            _id: "main",
            name: "main.pdf",
            url: "file:///tmp/main.pdf",
          },
          code: {
            _id: "code",
            name: "code.zip",
            url: "file:///tmp/code.zip",
          },
        },
        defaultSup: "main",
        tags: [],
        folders: [],
      },
    };

    const results = await service.scrape([payload], [], false);

    expect(hookService.transformhookPoint).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Draft Title");
    expect(results[0].journal).toBe("Journal of Tests");
    expect(results[0].supplementaries.main.url).toBe("file:///tmp/main.pdf");
    expect(results[0].defaultSup).toBe("main");
  });
});
