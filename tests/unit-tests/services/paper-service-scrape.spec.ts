import { describe, expect, it, vi } from "vitest";

import { PaperService } from "../../../app/service/services/paper-service";

describe("PaperService scrape integration boundaries", () => {
  function createService({
    dbInitializing = false,
    scrapedDrafts = [{ title: "Updated Title" }],
  }: {
    dbInitializing?: boolean;
    scrapedDrafts?: Record<string, unknown>[];
  } = {}) {
    const databaseCore = {
      getState: vi.fn(
        (key: string) => key === "dbInitializing" && dbInitializing
      ),
      already: vi.fn(),
    };
    const paperEntityRepository = {
      on: vi.fn(),
    };
    const scrapeService = {
      scrape: vi.fn(async () => scrapedDrafts),
    };
    const schedulerService = {
      createTask: vi.fn(),
    };
    const logService = {
      info: vi.fn(),
    };

    const service = new PaperService(
      databaseCore as any,
      paperEntityRepository as any,
      scrapeService as any,
      {} as any,
      schedulerService as any,
      {} as any,
      {} as any,
      logService as any
    );

    return { service, databaseCore, scrapeService, logService };
  }

  it("refreshes existing papers through PaperEntity payloads and persists update-mode results", async () => {
    const { service, scrapeService, logService } = createService();
    const updateSpy = vi
      .spyOn(service, "update")
      .mockImplementation(async (drafts) => drafts as any);
    const paperEntities = [
      { _id: "paper-1", title: "Seed A" },
      { _id: "paper-2", title: "Seed B" },
    ];

    await service.scrape(paperEntities as any, ["doi", "arxiv"]);

    expect(logService.info).toHaveBeenCalledWith(
      "Scraping 2 paper(s)...",
      "",
      true,
      "PaperService"
    );
    expect(scrapeService.scrape).toHaveBeenCalledWith(
      [
        { type: "PaperEntity", value: paperEntities[0] },
        { type: "PaperEntity", value: paperEntities[1] },
      ],
      ["doi", "arxiv"],
      true
    );
    expect(updateSpy).toHaveBeenCalledWith(
      [{ title: "Updated Title" }],
      false,
      true
    );
  });

  it("skips scrape work while the database is still initializing", async () => {
    const { service, scrapeService } = createService({ dbInitializing: true });
    const updateSpy = vi.spyOn(service, "update");

    await service.scrape([{ _id: "paper-1", title: "Seed A" }] as any);

    expect(scrapeService.scrape).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("uses non-forced metadata refresh when no specific scrapers are requested", async () => {
    const { service, scrapeService } = createService();
    const updateSpy = vi
      .spyOn(service, "update")
      .mockImplementation(async (drafts) => drafts as any);
    const paperEntity = { _id: "paper-1", title: "Seed A" };

    await service.scrape([paperEntity] as any);

    expect(scrapeService.scrape).toHaveBeenCalledWith(
      [{ type: "PaperEntity", value: paperEntity }],
      [],
      false
    );
    expect(scrapeService.scrape).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith(
      [{ title: "Updated Title" }],
      false,
      true
    );
  });
});
