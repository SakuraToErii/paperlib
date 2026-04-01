import { describe, expect, it, vi } from "vitest";

import { Entity } from "../../../app/models/entity";
import { ScrapeService } from "../../../app/service/services/scrape-service";

describe("ScrapeService PaperEntity bypass compatibility", () => {
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
