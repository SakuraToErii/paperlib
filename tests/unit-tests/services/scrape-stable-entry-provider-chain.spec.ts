import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

vi.mock("mupdf", () => ({
  Document: {
    openDocument: vi.fn(() => ({
      countPages: () => 1,
      loadPage: () => ({
        toStructuredText: () => ({
          asJSON: () =>
            JSON.stringify({
              blocks: [
                {
                  lines: [
                    {
                      text: "This PDF mentions DOI 10.1000/pdf-bootstrap",
                    },
                  ],
                },
              ],
            }),
        }),
      }),
    })),
  },
}));

import { ScrapeService } from "../../../app/service/services/scrape-service";

describe("ScrapeService stable entry-provider chain", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createService({
    hookEntryResult = [],
    hookPredicate = () => false,
  }: {
    hookEntryResult?: Record<string, unknown>[];
    hookPredicate?: (hookName: string) => boolean;
  } = {}) {
    const hookService = {
      hasHook: vi.fn((hookName: string) => hookPredicate(hookName)),
      modifyHookPoint: vi.fn(async (...args: any[]) => args.slice(2)),
      transformhookPoint: vi.fn(async (hookName: string) => {
        if (hookName === "scrapeEntry") {
          return hookEntryResult;
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

    return {
      service: new ScrapeService(hookService as any, logService as any),
      hookService,
      logService,
    };
  }

  it("registers built-in entry providers ahead of hook fallback", () => {
    const { service } = createService();

    expect(
      (service as any)._listProviders("entry").map((provider: any) => provider.id)
    ).toEqual([
      "builtin:bibtex",
      "builtin:html-metadata",
      "builtin:pdf-bootstrap",
      "hook:entry",
    ]);
  });

  it("uses the built-in BibTeX entry provider before hook fallback", async () => {
    const { service, hookService } = createService({
      hookEntryResult: [
        {
          title: "Hook Title",
          authors: "Hook Author",
        },
      ],
      hookPredicate: (hookName) => hookName === "scrapeEntry",
    });

    const executeEntryProviderSpy = vi.spyOn(service as any, "_executeEntryProvider");

    const results = await service.scrapeEntry([
      {
        type: "bibtex",
        value: `@article{paperlib,
          title={BibTeX Title},
          author={Ada Lovelace and Grace Hopper},
          year={2024},
          journal={Journal of Tests}
        }`,
      },
    ]);

    expect(
      executeEntryProviderSpy.mock.calls.map(([provider]) => provider.id)
    ).toEqual(["builtin:bibtex"]);
    expect(hookService.transformhookPoint).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("BibTeX Title");
    expect(results[0].authors).toContain("Ada Lovelace");
  });

  it("uses the built-in HTML metadata entry provider before hook fallback", async () => {
    const { service, hookService } = createService({
      hookEntryResult: [
        {
          title: "Hook Title",
          authors: "Hook Author",
        },
      ],
      hookPredicate: (hookName) => hookName === "scrapeEntry",
    });

    const results = await service.scrapeEntry([
      {
        type: "webcontent",
        value: {
          url: "https://doi.org/10.1000/html-entry",
          document: `
            <html>
              <head>
                <meta name="citation_title" content="HTML Entry Title" />
                <meta name="citation_author" content="Ada Lovelace" />
                <meta name="citation_doi" content="10.1000/html-entry" />
              </head>
            </html>
          `,
          cookies: "",
        },
      },
    ]);

    expect(hookService.transformhookPoint).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("HTML Entry Title");
    expect(results[0].doi).toBe("10.1000/html-entry");
  });

  it("preserves built-in entry matches while sending unmatched payloads through hook fallback", async () => {
    const { service, hookService } = createService({
      hookEntryResult: [
        {
          title: "Hook Fallback Title",
          authors: "Hook Author",
          year: "2025",
          tags: [],
          folders: [],
          supplementaries: {},
        },
      ],
      hookPredicate: (hookName) => hookName === "scrapeEntry",
    });

    const results = await service.scrapeEntry([
      {
        type: "webcontent",
        value: {
          url: "https://example.test/paper",
          document: `
            <html>
              <head>
                <meta name="citation_title" content="Built-in HTML Title" />
                <meta name="citation_author" content="Built-in Author" />
              </head>
            </html>
          `,
          cookies: "",
        },
      },
      {
        type: "custom-import",
        value: {
          id: "hook-only",
        },
      },
    ]);

    expect(hookService.transformhookPoint).toHaveBeenCalledWith(
      "scrapeEntry",
      600000,
      [
        {
          type: "custom-import",
          value: {
            id: "hook-only",
          },
        },
      ]
    );
    expect(results.map((result) => result.title)).toEqual([
      "Built-in HTML Title",
      "Hook Fallback Title",
    ]);
  });

  it("extracts durable identifiers from PDFs through the built-in bootstrap provider", async () => {
    const { service, hookService } = createService({
      hookPredicate: (hookName) => hookName === "scrapeEntry",
    });
    const tempPDFPath = path.join(
      os.tmpdir(),
      `paperlib-entry-bootstrap-${Date.now()}.pdf`
    );

    await fs.writeFile(tempPDFPath, "fake-pdf");

    try {
      const results = await service.scrapeEntry([
        {
          type: "file",
          value: tempPDFPath,
        },
      ]);

      expect(hookService.transformhookPoint).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].doi).toBe("10.1000/pdf-bootstrap");
    } finally {
      await fs.unlink(tempPDFPath).catch(() => undefined);
    }
  });
});
