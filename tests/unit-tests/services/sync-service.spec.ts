import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SyncService, type SyncLog } from "../../../app/service/services/sync-service";

const getStoreValue = vi.fn();
const setStoreValue = vi.fn();
const deleteStoreValue = vi.fn();
const setRelatedPaperIds = vi.fn(async () => undefined);
const relateSelectedPapers = vi.fn(async () => undefined);
const unrelateSelectedPapers = vi.fn(async () => undefined);
const updatePaper = vi.fn(async () => undefined);

vi.mock("electron-store", () => {
  return {
    default: class ElectronStoreMock {
      has() {
        return true;
      }

      get(key: string) {
        return getStoreValue(key);
      }

      set(key: string, value: unknown) {
        setStoreValue(key, value);
      }

      delete(key: string) {
        deleteStoreValue(key);
      }
    },
  };
});

declare global {
  // eslint-disable-next-line no-var
  var PLAPILocal: any;
}

describe("SyncService invokeSync relation replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getStoreValue.mockImplementation((key: string) => {
      if (key === "accessToken") {
        return "token";
      }
      if (key === "lastSyncAt") {
        return "";
      }
      if (key === "syncLogs") {
        return [];
      }
      if (key === "expiredAt") {
        return 0;
      }
      return undefined;
    });

    globalThis.PLAPILocal = {
      paperService: {
        setRelatedPaperIds,
        relateSelectedPapers,
        unrelateSelectedPapers,
        update: updatePaper,
      },
    };

    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({
        code: 2000,
        data: [],
      }),
    })));
  });

  it("replays batch relate logs via the dedicated relation path", async () => {
    const remoteLog: z.infer<typeof SyncLog> = {
      log_id: "123e4567-e89b-12d3-a456-426614174000",
      operation: "update",
      entity_type: "paper",
      value: {
        relatedPaperBatchUpdate: {
          paperIds: [
            "507f1f77bcf86cd799439101",
            "507f1f77bcf86cd799439102",
          ],
          action: "relate",
        },
      },
      timestamp: "2024-01-01T00:00:00.000Z",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    };

    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({
        code: 2000,
        data: [remoteLog],
      }),
    })));

    const service = new SyncService();

    await service.invokeSync();

    expect(relateSelectedPapers).toHaveBeenCalledWith(
      ["507f1f77bcf86cd799439101", "507f1f77bcf86cd799439102"],
      true
    );
    expect(unrelateSelectedPapers).not.toHaveBeenCalled();
    expect(setRelatedPaperIds).not.toHaveBeenCalled();
    expect(updatePaper).not.toHaveBeenCalled();
  });

  it("replays batch unrelate logs via the dedicated relation path", async () => {
    const remoteLog = {
      log_id: "123e4567-e89b-12d3-a456-426614174001",
      operation: "update",
      entity_type: "paper",
      value: {
        relatedPaperBatchUpdate: {
          paperIds: [
            "507f1f77bcf86cd799439111",
            "507f1f77bcf86cd799439112",
          ],
          action: "unrelate",
        },
      },
      timestamp: "2024-01-02T00:00:00.000Z",
      created_at: "2024-01-02T00:00:00.000Z",
      updated_at: "2024-01-02T00:00:00.000Z",
    };

    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({
        code: 2000,
        data: [remoteLog],
      }),
    })));

    const service = new SyncService();

    await service.invokeSync();

    expect(unrelateSelectedPapers).toHaveBeenCalledWith(
      ["507f1f77bcf86cd799439111", "507f1f77bcf86cd799439112"],
      true
    );
    expect(relateSelectedPapers).not.toHaveBeenCalled();
    expect(setRelatedPaperIds).not.toHaveBeenCalled();
    expect(updatePaper).not.toHaveBeenCalled();
  });
});
