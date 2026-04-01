import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../app/base/url", () => ({
  constructFileURL: vi.fn((value: string) => `file://${value}`),
  eraseProtocol: vi.fn((value: string) => value.replace(/^file:\/\//, "")),
  getFileType: vi.fn(() => "pdf"),
  getProtocol: vi.fn((value: string) => {
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
  getFolderPathFromRelativeFile: vi.fn(),
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
  });

  it("uses the original source URL when renaming an already imported file", async () => {
    const { FileService } = await import("../../../app/service/services/file-service");
    const service = new FileService({ hasHook: vi.fn(() => false) } as any, {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    } as any);

    const moveFile = vi.fn(async (_sourceURL: string, targetURL: string) => targetURL);
    vi.spyOn(service, "backend").mockResolvedValue({ moveFile } as any);
    vi.spyOn(service, "inferRelativeFileName").mockResolvedValue("Renamed Title");
    vi.spyOn(service, "getEntityFolderPath").mockReturnValue("Library");

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
