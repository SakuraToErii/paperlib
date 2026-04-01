import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../../app/base/folder", () => ({
  getFolderPathFromRelativeFile: vi.fn((value: string) =>
    value.split("/").slice(0, -1).join("/")
  ),
  getParentFolderPath: vi.fn(),
  isInternalLibraryPath: vi.fn(() => false),
  joinFolderPath: vi.fn((...segments: string[]) =>
    segments.filter(Boolean).join("/").replace(/\/+/g, "/")
  ),
  normalizeFolderPath: vi.fn((value: string) => value.replace(/^\/+|\/+$/g, "")),
}));

describe("FileService.move", () => {
  beforeEach(() => {
    vi.resetModules();
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
      "Users/testuser/Downloads/Deep Learning Survey_main.pdf"
    );
    expect(paperEntity.supplementaries.main.url).toBe(
      "file://Users/testuser/Downloads/Deep Learning Survey_main.pdf"
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
