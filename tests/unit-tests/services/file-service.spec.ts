import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  afterEach,
} from "vitest";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    promises: {
      ...actual.promises,
      mkdir: vi.fn(),
      readdir: vi.fn(),
      rename: vi.fn(),
      rmdir: vi.fn(),
    },
  };
});

vi.mock("../../../app/base/url", () => ({
  constructFileURL: vi.fn((value: string) => `file://${value}`),
  eraseProtocol: vi.fn((value: string) => value.replace(/^file:\/\//, "")),
  getFileType: vi.fn(() => "pdf"),
  getProtocol: vi.fn((value: string) => {
    if (value.startsWith("file://") || value.startsWith("file:///")) {
      return "file";
    }
    const match = /^([a-zA-Z]+):/.exec(value);
    return match?.[1] || "";
  }),
  getRelativePath: vi.fn((target: string, base: string) =>
    target.startsWith(`${base}/`) ? target.slice(base.length + 1) : target
  ),
  hasProtocol: vi.fn((value: string) => /^[a-zA-Z]+:\/\//.test(value)),
  listAllFiles: vi.fn(async () => []),
}));

describe("FileService.move", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    globalThis.PLMainAPI = {
      preferenceService: {
        get: vi.fn(async (key: string) => {
          if (key === "appLibFolder") {
            return "/Users/testuser/Paperlib";
          }
          return "";
        }),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports external files into the library folder and updates the stored URL", async () => {
    const { FileService } = await import("../../../app/service/services/file-service");
    const service = new FileService({ hasHook: vi.fn(() => false) } as any, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any);

    const moveFile = vi.fn(async (_sourceURL: string, targetURL: string) => targetURL);
    vi.spyOn(service, "backend").mockResolvedValue({ moveFile } as any);
    vi.spyOn(service, "libraryFolder").mockResolvedValue("/library");
    vi.spyOn(service, "inferRelativeFileName").mockResolvedValue("Deep Learning Survey");
    vi.spyOn(service, "getEntityFolderPath").mockReturnValue("Folder");

    const paperEntity = {
      title: "Deep Learning Survey",
      folders: [{ name: "Folder" }],
      supplementaries: {
        main: {
          _id: "main",
          url: "file:///Users/testuser/Downloads/Deep Learning Survey.pdf",
        },
      },
    } as any;

    vi.spyOn(service, "getLeafFolderFromEntityFiles").mockReturnValue("Folder");

    await service.move(paperEntity);

    expect(moveFile).toHaveBeenCalledWith(
      "file:///Users/testuser/Downloads/Deep Learning Survey.pdf",
      "Folder/Deep Learning Survey_main.pdf"
    );
    expect(paperEntity.supplementaries.main.url).toBe(
      "file://Folder/Deep Learning Survey_main.pdf"
    );
  });

  it("uses the original managed folder when renaming an already imported file", async () => {
    const { FileService } = await import("../../../app/service/services/file-service");
    const service = new FileService({ hasHook: vi.fn(() => false) } as any, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any);

    const moveFile = vi.fn(async (_sourceURL: string, targetURL: string) => targetURL);
    vi.spyOn(service, "backend").mockResolvedValue({ moveFile } as any);
    vi.spyOn(service, "libraryFolder").mockResolvedValue("/library");
    vi.spyOn(service, "inferRelativeFileName").mockResolvedValue("Renamed Title");
    vi.spyOn(service, "getEntityFolderPath").mockReturnValue("Ignored Folder");

    const paperEntity = {
      title: "Renamed Title",
      supplementaries: {
        main: {
          _id: "main",
          url: "file://Library/Original Title_main.pdf",
        },
      },
    } as any;

    await service.move(paperEntity);

    expect(moveFile).toHaveBeenCalledWith(
      "file://Library/Original Title_main.pdf",
      "Library/Renamed Title_main.pdf"
    );
    expect(paperEntity.supplementaries.main.url).toBe(
      "file://Library/Renamed Title_main.pdf"
    );
  });
});

describe("FileService folder mutation helpers", () => {
  it("normalizes folder creation and renames while creating the target parent once", async () => {
    const { promises: fsPromise } = await import("fs");
    const { FileService } = await import("../../../app/service/services/file-service");
    const service = new FileService({ hasHook: vi.fn(() => false) } as any, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any);

    vi.spyOn(service, "libraryFolder").mockResolvedValue("/library");

    await service.createFolder(" Research\\ML / Agents ");
    expect(fsPromise.mkdir).toHaveBeenCalledWith("/library/Research/ML/Agents", {
      recursive: true,
    });

    const createFolderSpy = vi.spyOn(service, "createFolder").mockResolvedValue();
    await service.renameFolder(" Research\\ML ", " Archive / ML Renamed ");

    expect(createFolderSpy).toHaveBeenCalledWith("Archive");
    expect(fsPromise.rename).toHaveBeenCalledWith(
      "/library/Research/ML",
      "/library/Archive/ML Renamed"
    );
  });

  it("rejects renaming a folder into one of its descendants", async () => {
    const { FileService } = await import("../../../app/service/services/file-service");
    const service = new FileService({ hasHook: vi.fn(() => false) } as any, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any);

    vi.spyOn(service, "libraryFolder").mockResolvedValue("/library");

    await expect(
      service.renameFolder("Research/ML", "Research/ML/Agents")
    ).rejects.toThrow("Circular folder move is not allowed.");
  });

  it("prunes only empty parents when deleting empty folders", async () => {
    const { promises: fsPromise } = await import("fs");
    const { FileService } = await import("../../../app/service/services/file-service");
    const service = new FileService({ hasHook: vi.fn(() => false) } as any, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any);

    vi.spyOn(service, "libraryFolder").mockResolvedValue("/library");
    vi.mocked(fsPromise.readdir)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce(["keep.txt"] as any);

    await service.deleteEmptyFolder("Research/ML/Agents", true);

    expect(fsPromise.rmdir).toHaveBeenNthCalledWith(
      1,
      "/library/Research/ML/Agents"
    );
    expect(fsPromise.rmdir).toHaveBeenNthCalledWith(2, "/library/Research/ML");
    expect(fsPromise.rmdir).toHaveBeenCalledTimes(2);
  });

  it("rewrites only managed descendant file URLs during folder remaps", async () => {
    const { FileService } = await import("../../../app/service/services/file-service");
    const service = new FileService({ hasHook: vi.fn(() => false) } as any, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any);

    expect(
      service.remapManagedFileURL(
        "file://Research/ML/paper.pdf",
        " Research ",
        " Archive ",
        "/library"
      )
    ).toBe("file://Archive/ML/paper.pdf");

    expect(
      service.remapManagedFileURL(
        "file://ResearchX/paper.pdf",
        "Research",
        "Archive",
        "/library"
      )
    ).toBe("file://ResearchX/paper.pdf");

    expect(
      service.remapManagedFileURL(
        "https://example.com/paper.pdf",
        "Research",
        "Archive",
        "/library"
      )
    ).toBe("https://example.com/paper.pdf");
  });

  it("detects only managed local file URLs inside the library root", async () => {
    const { existsSync } = await import("fs");
    const { FileService } = await import("../../../app/service/services/file-service");
    const service = new FileService({ hasHook: vi.fn(() => false) } as any, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any);

    expect(service.getManagedRelativePath("file://Research/ML/paper.pdf", "/library")).toBe(
      "Research/ML/paper.pdf"
    );
    expect(
      service.getManagedRelativePath(
        "file:///library/Research/ML/paper.pdf",
        "/library"
      )
    ).toBe("Research/ML/paper.pdf");
    expect(service.getManagedRelativePath("file:///outside/paper.pdf", "/library")).toBe("");
    expect(service.getManagedRelativePath("file://../escape.pdf", "/library")).toBe("");

    vi.mocked(existsSync).mockReturnValue(true);
  });
});
