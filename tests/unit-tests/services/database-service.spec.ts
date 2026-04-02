import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

vi.mock("../../../app/base/url", () => ({
  listAllFiles: vi.fn(() => []),
}));

declare global {
  // eslint-disable-next-line no-var
  var PLMainAPI: any;
  // eslint-disable-next-line no-var
  var PLAPILocal: any;
}

describe("DatabaseService.initialize bootstrap support", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    globalThis.PLMainAPI = {
      preferenceService: {
        get: vi.fn(async (key: string) => {
          switch (key) {
            case "appLibFolder":
              return "/Users/testuser/Paperlib";
            case "isFlexibleSync":
              return false;
            case "syncFileStorage":
              return "local";
            default:
              return "";
          }
        }),
      },
    };

    globalThis.PLAPILocal = {
      paperService: {
        create: vi.fn(async () => []),
      },
    };
  });

  it("bootstraps local PDFs on first-run local libraries", async () => {
    const { existsSync } = await import("fs");
    const { listAllFiles } = await import("../../../app/base/url");
    const { DatabaseService } = await import(
      "../../../app/service/services/database-service"
    );

    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(listAllFiles).mockReturnValue([
      "/Users/testuser/Paperlib/A.pdf",
      "/Users/testuser/Paperlib/notes.txt",
      "/Users/testuser/Paperlib/sub/B.PDF",
    ]);

    const initRealm = vi.fn(async () => undefined);
    const service = new DatabaseService({
      initRealm,
      on: vi.fn(),
    } as any);

    await service.initialize();

    expect(initRealm).toHaveBeenCalledWith(true);
    expect(PLAPILocal.paperService.create).toHaveBeenCalledWith([
      "/Users/testuser/Paperlib/A.pdf",
      "/Users/testuser/Paperlib/sub/B.PDF",
    ]);
  });

  it("skips bootstrap when the local realm already exists", async () => {
    const { existsSync } = await import("fs");
    const { listAllFiles } = await import("../../../app/base/url");
    const { DatabaseService } = await import(
      "../../../app/service/services/database-service"
    );

    vi.mocked(existsSync).mockReturnValue(true);

    const initRealm = vi.fn(async () => undefined);
    const service = new DatabaseService({
      initRealm,
      on: vi.fn(),
    } as any);

    await service.initialize(false);

    expect(initRealm).toHaveBeenCalledWith(false);
    expect(listAllFiles).not.toHaveBeenCalled();
    expect(PLAPILocal.paperService.create).not.toHaveBeenCalled();
  });

  it("reuses the reserved bootstrap promise so concurrent initialize calls import once", async () => {
    const { existsSync } = await import("fs");
    const { listAllFiles } = await import("../../../app/base/url");
    const { DatabaseService } = await import(
      "../../../app/service/services/database-service"
    );

    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(listAllFiles).mockReturnValue([
      "/Users/testuser/Paperlib/A.pdf",
      "/Users/testuser/Paperlib/B.pdf",
    ]);

    let releaseInitRealm = () => {};
    const initRealm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseInitRealm = resolve;
        })
    );
    const service = new DatabaseService({
      initRealm,
      on: vi.fn(),
    } as any);

    const firstInitialize = service.initialize();
    const secondInitialize = service.initialize();

    expect(initRealm).toHaveBeenCalledTimes(2);
    expect(PLAPILocal.paperService.create).not.toHaveBeenCalled();

    releaseInitRealm();
    await Promise.all([firstInitialize, secondInitialize]);

    expect(PLAPILocal.paperService.create).toHaveBeenCalledTimes(1);
    expect(PLAPILocal.paperService.create).toHaveBeenCalledWith([
      "/Users/testuser/Paperlib/A.pdf",
      "/Users/testuser/Paperlib/B.pdf",
    ]);
  });
});
