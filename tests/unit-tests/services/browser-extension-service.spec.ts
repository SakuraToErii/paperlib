import { describe, expect, it, vi } from "vitest";

vi.mock("ws", () => ({
  WebSocketServer: class MockWebSocketServer {
    handlers = new Map<string, Function>();

    constructor(_options: Record<string, unknown>) {}

    on(event: string, handler: Function) {
      this.handlers.set(event, handler);
    }
  },
  WebSocket: class MockWebSocket {},
}));

import { BrowserExtensionService } from "../../../app/service/services/browser-extension-service";

describe("BrowserExtensionService scrape integration boundaries", () => {
  it("routes browser webcontent payloads through scrape service and preserves imported tags", async () => {
    const scrapedPaper = {
      title: "Imported Paper",
      tags: [] as string[],
    };
    const scrapeService = {
      scrape: vi.fn(async () => [scrapedPaper]),
    };
    const paperService = {
      update: vi.fn(async (drafts: unknown[]) => drafts),
    };

    const service = new BrowserExtensionService(
      scrapeService as any,
      paperService as any,
      {} as any
    );
    const send = vi.fn();
    (service as any)._ws = { send };

    const browserExtMsg = {
      url: "https://arxiv.org/abs/2401.00001",
      document: "<html></html>",
      cookies: "",
      options: {
        downloadPDF: false,
        tags: ["ml", "preprint"],
      },
    };

    await (service as any)._create(7, browserExtMsg);

    expect(scrapeService.scrape).toHaveBeenCalledWith(
      [{ type: "webcontent", value: browserExtMsg }],
      []
    );
    expect(scrapedPaper.tags).toEqual(["ml", "preprint"]);
    expect(paperService.update).toHaveBeenCalledWith(
      [scrapedPaper],
      true,
      false
    );
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ id: 7, value: "successful" })
    );
  });

  it("returns the no-importer response without updating papers when scrape yields nothing", async () => {
    const scrapeService = {
      scrape: vi.fn(async () => []),
    };
    const paperService = {
      update: vi.fn(),
    };

    const service = new BrowserExtensionService(
      scrapeService as any,
      paperService as any,
      {} as any
    );
    const send = vi.fn();
    (service as any)._ws = { send };

    await (service as any)._create(undefined, {
      url: "https://doi.org/10.1000/test",
      document: "<html></html>",
      cookies: "",
      options: {
        downloadPDF: false,
        tags: ["ignored"],
      },
    });

    expect(paperService.update).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ response: "no-avaliable-importer" })
    );
  });

  it("uses the backward-compatible success response when the browser extension omits a message id", async () => {
    const scrapedPaper = {
      title: "Imported Paper",
      tags: [] as string[],
    };
    const scrapeService = {
      scrape: vi.fn(async () => [scrapedPaper]),
    };
    const paperService = {
      update: vi.fn(async (drafts: unknown[]) => drafts),
    };

    const service = new BrowserExtensionService(
      scrapeService as any,
      paperService as any,
      {} as any
    );
    const send = vi.fn();
    (service as any)._ws = { send };

    await (service as any)._create(undefined, {
      url: "https://doi.org/10.1000/test",
      document: "<html></html>",
      cookies: "",
      options: {
        downloadPDF: true,
        tags: [],
      },
    });

    expect(paperService.update).toHaveBeenCalledWith(
      [scrapedPaper],
      true,
      false
    );
    expect(scrapedPaper.tags).toEqual([]);
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ response: "successful" })
    );
  });
});
