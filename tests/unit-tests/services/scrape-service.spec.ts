import { afterEach, describe, expect, it, vi } from "vitest";

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
    registry.register({
      id: "slow",
      kind: "metadata",
      priority: 5,
      label: "replaced",
    });

    expect(registry.list("metadata")).toEqual([
      { id: "slow", kind: "metadata", priority: 5, label: "replaced" },
      { id: "fast", kind: "metadata", priority: 10 },
    ]);
    expect(registry.get("metadata", "slow")?.label).toBe("replaced");
  });

  it("filters registry providers by requested ids while keeping hook fallback available", () => {
    const registry = new ScrapeProviderRegistry();

    registry.register({
      id: "builtin:doi",
      kind: "metadata",
      priority: 10,
      aliases: ["doi"],
    });
    registry.register({
      id: "builtin:arxiv",
      kind: "metadata",
      priority: 20,
      aliases: ["arxiv"],
    });
    registry.register({
      id: "hook:metadata",
      kind: "metadata",
      priority: 100,
    });

    expect(registry.list("metadata", ["doi"])).toEqual([
      {
        id: "builtin:doi",
        kind: "metadata",
        priority: 10,
        aliases: ["doi"],
      },
      {
        id: "hook:metadata",
        kind: "metadata",
        priority: 100,
      },
    ]);
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
      {
        title: Number.POSITIVE_INFINITY,
        publication: Number.POSITIVE_INFINITY,
      },
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

describe("ScrapeService seam strengthening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("routes scrapeEntry execution through the provider chain seam", async () => {
    const hookService = {
      hasHook: vi.fn((hookName: string) => hookName === "scrapeEntry"),
      modifyHookPoint: vi.fn(async (...args: any[]) => args.slice(2)),
      transformhookPoint: vi.fn(async () => [
        {
          _id: "507f1f77bcf86cd799439011",
          title: "Entry Result",
          authors: "Test Author",
          year: "2024",
          tags: [],
          folders: [],
          supplementaries: {},
        },
      ]),
    };

    const logService = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      progress: vi.fn(),
    };

    const service = new ScrapeService(hookService as any, logService as any);
    const executeEntryProviderSpy = vi.spyOn(
      service as any,
      "_executeEntryProvider"
    );

    const results = await service.scrapeEntry([
      { url: "https://example.test" },
    ]);

    expect(
      executeEntryProviderSpy.mock.calls.map(([provider]) => provider.id)
    ).toEqual(["hook:entry"]);
    expect(executeEntryProviderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hook:entry",
        kind: "entry",
      }),
      {
        payloads: [{ url: "https://example.test" }],
      }
    );
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Entry Result");
  });

  it("routes metadata dispatch through the provider chain and preserves hook behavior", async () => {
    const metadataDraft = {
      _id: "507f1f77bcf86cd799439011",
      title: "Metadata Result",
      authors: "Updated Author",
      year: "2025",
      tags: [],
      folders: [],
      supplementaries: {},
    };
    const hookService = {
      hasHook: vi.fn((hookName: string) => hookName === "scrapeMetadata"),
      modifyHookPoint: vi.fn(async (...args: any[]) => {
        if (args[0] === "scrapeMetadata") {
          return [[metadataDraft], args[3], args[4]];
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
    const executeMetadataProviderSpy = vi.spyOn(
      service as any,
      "_executeMetadataProvider"
    );

    const seedEntity = new Entity({
      _id: "507f1f77bcf86cd799439011",
      title: "Seed Title",
      authors: "Seed Author",
      year: "2024",
      tags: [],
      folders: [],
      supplementaries: {},
    });

    const [result] = await service.scrapeMetadata(
      [seedEntity],
      ["hooked"],
      true
    );

    expect(
      executeMetadataProviderSpy.mock.calls.map(([provider]) => provider.id)
    ).toEqual(["hook:metadata"]);
    expect(executeMetadataProviderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "hook:metadata",
        kind: "metadata",
      }),
      {
        drafts: [expect.any(Entity)],
        scrapers: ["hooked"],
        force: true,
      }
    );
    expect(result.title).toBe("Metadata Result");
    expect(result).toBeInstanceOf(Entity);
  });

  it("uses the built-in DOI provider before hook fallback on identifier happy paths", async () => {
    const hookService = {
      hasHook: vi.fn(() => false),
      modifyHookPoint: vi.fn(async (...args: any[]) => args.slice(2)),
      transformhookPoint: vi.fn(async () => []),
    };
    const logService = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      progress: vi.fn(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            DOI: "10.1000/test-doi",
            URL: "https://doi.org/10.1000/test-doi",
            title: ["Resolved DOI Title"],
            author: [{ given: "Ada", family: "Lovelace" }],
            publisher: "Test Publisher",
            issue: "2",
            page: "10-20",
            volume: "5",
            type: "journal-article",
            "container-title": ["Journal of Tests"],
            "published-online": { "date-parts": [[2025, 4, 1]] },
          },
        }),
      })) as any
    );

    const service = new ScrapeService(hookService as any, logService as any);
    const executeMetadataProviderSpy = vi.spyOn(
      service as any,
      "_executeMetadataProvider"
    );
    const seedEntity = new Entity({
      _id: "507f1f77bcf86cd799439011",
      title: "Seed Title",
      authors: "Seed Author",
      year: "2024",
      doi: "10.1000/test-doi",
      publication: "arXiv",
      tags: [],
      folders: [],
      supplementaries: {},
    });

    const [result] = await service.scrapeMetadata([seedEntity], [], false);

    expect(
      executeMetadataProviderSpy.mock.calls.map(([provider]) => provider.id)
    ).toEqual(["builtin:doi", "builtin:arxiv", "hook:metadata"]);
    expect(hookService.modifyHookPoint).not.toHaveBeenCalled();
    expect(result.title).toBe("Resolved DOI Title");
    expect(result.authors).toBe("Ada Lovelace");
    expect(result.publication).toBe("Journal of Tests");
    expect(result.doi).toBe("10.1000/test-doi");
  });

  it("limits builtin metadata dispatch to requested providers while retaining hook fallback", async () => {
    const hookService = {
      hasHook: vi.fn(() => false),
      modifyHookPoint: vi.fn(async (...args: any[]) => args.slice(2)),
      transformhookPoint: vi.fn(async () => []),
    };
    const logService = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      progress: vi.fn(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            DOI: "10.1000/test-doi",
            title: ["Resolved DOI Title"],
            author: [{ given: "Ada", family: "Lovelace" }],
          },
        }),
      })) as any
    );

    const service = new ScrapeService(hookService as any, logService as any);
    const executeMetadataProviderSpy = vi.spyOn(
      service as any,
      "_executeMetadataProvider"
    );
    const seedEntity = new Entity({
      _id: "507f1f77bcf86cd799439011",
      title: "Seed Title",
      authors: "Seed Author",
      year: "2024",
      doi: "10.1000/test-doi",
      arxiv: "2404.12345v1",
      tags: [],
      folders: [],
      supplementaries: {},
    });

    await service.scrapeMetadata([seedEntity], ["doi"], true);

    expect(
      executeMetadataProviderSpy.mock.calls.map(([provider]) => provider.id)
    ).toEqual(["builtin:doi", "hook:metadata"]);
  });

  it("uses the built-in arXiv provider before hook fallback on identifier happy paths", async () => {
    const hookService = {
      hasHook: vi.fn(() => false),
      modifyHookPoint: vi.fn(async (...args: any[]) => args.slice(2)),
      transformhookPoint: vi.fn(async () => []),
    };
    const logService = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      progress: vi.fn(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
          <feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
            <entry>
              <id>https://arxiv.org/abs/2404.12345v1</id>
              <updated>2026-04-01T00:00:00Z</updated>
              <published>2026-04-01T00:00:00Z</published>
              <title>Resolved arXiv Title</title>
              <summary>Test abstract</summary>
              <author><name>Grace Hopper</name></author>
              <arxiv:doi>10.1000/arxiv-doi</arxiv:doi>
            </entry>
          </feed>`,
      })) as any
    );

    const service = new ScrapeService(hookService as any, logService as any);
    const seedEntity = new Entity({
      _id: "507f1f77bcf86cd799439011",
      title: "Seed Title",
      authors: "Seed Author",
      year: "2024",
      arxiv: "2404.12345v1",
      tags: [],
      folders: [],
      supplementaries: {},
    });

    const [result] = await service.scrapeMetadata([seedEntity], [], false);

    expect(hookService.modifyHookPoint).not.toHaveBeenCalled();
    expect(result.title).toBe("Resolved arXiv Title");
    expect(result.authors).toBe("Grace Hopper");
    expect(result.publication).toBe("arXiv");
    expect(result.arxiv).toBe("2404.12345v1");
    expect(result.doi).toBe("10.1000/arxiv-doi");
  });

  it("delegates merge application through the merge-policy seam", () => {
    const hookService = {
      hasHook: vi.fn(() => false),
      modifyHookPoint: vi.fn(async (...args: any[]) => args.slice(2)),
      transformhookPoint: vi.fn(async () => []),
    };
    const logService = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      progress: vi.fn(),
    };
    const service = new ScrapeService(hookService as any, logService as any);
    const mergeSpy = vi.spyOn((service as any)._metadataMergePolicy, "merge");
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
    const providerResult = {
      provider: { id: "provider-a", kind: "metadata" as const },
      status: "matched" as const,
      basis: "paper-entity" as const,
      data: new Entity({
        ...origin,
        title: "Updated Title",
      }),
      warnings: [],
    };
    const mergePriorityLevel = { title: Number.POSITIVE_INFINITY };
    const context = {
      providerId: "provider-a",
      providerIndex: 3,
      force: false,
    };

    const merged = (service as any)._applyMetadataMergePolicy(
      origin,
      draft,
      providerResult,
      mergePriorityLevel,
      context
    );

    expect(mergeSpy).toHaveBeenCalledWith(
      origin,
      draft,
      providerResult,
      mergePriorityLevel,
      context
    );
    expect(merged.paperEntityDraft.title).toBe("Updated Title");
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

  it("keeps direct PaperEntity drafts while still scraping entry payloads in the same batch", async () => {
    const hookService = {
      hasHook: vi.fn((hookName: string) => hookName === "scrapeEntry"),
      modifyHookPoint: vi.fn(async (...args: any[]) => args.slice(2)),
      transformhookPoint: vi.fn(async (hookName: string) => {
        if (hookName === "scrapeEntry") {
          return [
            {
              _id: "507f1f77bcf86cd799439012",
              title: "Entry Scraped Title",
              authors: "Entry Author",
              year: "2025",
              tags: [],
              folders: [],
              supplementaries: {},
            },
          ];
        }
        return [];
      }),
    };

    const logService = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      progress: vi.fn(),
    };
    const waitForAPI = vi.fn(async () => true);
    const isOfficialScrapeExtensionInstalled = vi.fn(async () => "loaded");

    globalThis.PLAPILocal = {
      serviceRPCService: {
        waitForAPI,
      },
    } as any;

    globalThis.PLExtAPI = {
      extensionManagementService: {
        isOfficialScrapeExtensionInstalled,
      },
    } as any;

    const service = new ScrapeService(hookService as any, logService as any);
    const directPayload = {
      type: "PaperEntity",
      value: {
        _id: "507f1f77bcf86cd799439011",
        title: "Direct Draft Title",
        authors: "Direct Author",
        year: "2024",
        tags: [],
        folders: [],
        supplementaries: {},
      },
    };
    const entryPayload = {
      type: "webcontent",
      value: {
        url: "https://arxiv.org/abs/2401.00001",
        document: "<html></html>",
        cookies: "",
      },
    };

    const results = await service.scrape(
      [directPayload, entryPayload],
      [],
      false
    );

    expect(waitForAPI).toHaveBeenCalledTimes(1);
    expect(isOfficialScrapeExtensionInstalled).toHaveBeenCalledTimes(1);
    expect(hookService.transformhookPoint).toHaveBeenCalledWith(
      "scrapeEntry",
      600000,
      [entryPayload]
    );
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Direct Draft Title");
    expect(results[1].title).toBe("Entry Scraped Title");
  });
});
