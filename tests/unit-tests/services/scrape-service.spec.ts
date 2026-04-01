import { describe, expect, it, vi } from "vitest";

import { ScrapeService } from "../../../app/service/services/scrape-service";

describe("ScrapeService PaperEntity bypass compatibility", () => {
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
