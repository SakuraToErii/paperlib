import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdate = vi.fn(async (drafts: any[]) => drafts);
const mockScrape = vi.fn();

vi.mock("../../../app/models/entity", async () => {
  class Entity {
    title: string;
    year: string;
    booktitle: string;
    type: string;
    supplementaries: Record<string, any>;
    defaultSup: string;

    constructor(object: any = {}) {
      this.title = object.title || "";
      this.year = object.year || "";
      this.booktitle = object.booktitle || "";
      this.type = object.type || "";
      this.supplementaries = object.supplementaries || {};
      this.defaultSup = object.defaultSup || "";
    }
  }

  return { Entity };
});

vi.mock("../../../app/models/supplementary", () => {
  class Supplementary {
    _id: string;
    url: string;

    constructor(object: any = {}) {
      this._id = object._id || "";
      this.url = object.url || "";
    }
  }

  return { Supplementary };
});

vi.mock("../../../app/base/misc", () => ({
  uid: vi.fn(() => "sup-1"),
}));

import { PaperService } from "../../../app/service/services/paper-service";
import { uid } from "../../../app/base/misc";

declare global {
  // eslint-disable-next-line no-var
  var PLAPILocal: any;
}

describe("PaperService file import placeholder titles", () => {
  function createService() {
    return new PaperService(
      {
        getState: vi.fn(() => false),
        already: vi.fn((_key, callback) => callback()),
      } as any,
      {
        on: vi.fn(),
      } as any,
      {
        scrape: mockScrape,
      } as any,
      {} as any,
      {
        createTask: vi.fn(),
      } as any,
      {} as any,
      {} as any,
      {} as any
    );
  }

  beforeEach(() => {
    mockUpdate.mockClear();
    mockScrape.mockReset();
    vi.mocked(uid).mockClear();
    vi.mocked(uid).mockReturnValue("sup-1");
    globalThis.PLAPILocal = {
      logService: {
        error: vi.fn(),
      },
    };
  });

  it("routes file imports through scrape and keeps fallback files attached", async () => {
    const service = createService();
    mockScrape.mockResolvedValue([
      {
        title: "Scraped Deep Learning Survey",
        authors: "Ada Lovelace",
      },
    ]);

    const updateSpy = vi.spyOn(service, "update").mockImplementation(mockUpdate as any);

    const [draft] = await service.create(["/Users/testuser/Papers/Deep Learning Survey.pdf"]);

    expect(mockScrape).toHaveBeenCalledWith(
      [{ type: "file", value: "/Users/testuser/Papers/Deep Learning Survey.pdf" }],
      [],
      false
    );
    expect(draft.title).toBe("Scraped Deep Learning Survey");
    expect(draft.supplementaries["sup-1"].url).toBe("/Users/testuser/Papers/Deep Learning Survey.pdf");
    expect(draft.defaultSup).toBe("sup-1");

    updateSpy.mockRestore();
  });

  it("derives a clean title from file URLs when scrape yields no metadata", async () => {
    const service = createService();
    mockScrape.mockResolvedValue([]);

    const updateSpy = vi.spyOn(service, "update").mockImplementation(mockUpdate as any);

    const [draft] = await service.create(["file:///Users/testuser/Papers/Graph%20Nets.pdf"]);

    expect(draft.title).toBe("Graph Nets");
    expect(draft.supplementaries["sup-1"].url).toBe("file:///Users/testuser/Papers/Graph%20Nets.pdf");

    updateSpy.mockRestore();
  });

  it("restores fallback titles for incomplete scrape drafts", async () => {
    const service = createService();
    mockScrape.mockResolvedValue([
      {
        title: "",
        authors: "Recovered Author",
      },
    ]);

    const updateSpy = vi.spyOn(service, "update").mockImplementation(mockUpdate as any);

    const [draft] = await service.create(["/Users/testuser/Papers/Untitled Draft.pdf"]);

    expect(draft.title).toBe("Untitled Draft");
    expect(draft.supplementaries["sup-1"].url).toBe("/Users/testuser/Papers/Untitled Draft.pdf");

    updateSpy.mockRestore();
  });
});
