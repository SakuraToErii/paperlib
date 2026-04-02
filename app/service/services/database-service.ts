import { existsSync } from "fs";
import path from "path";

import { errorcatching } from "@/base/error";
import { Eventable } from "@/base/event";
import { createDecorator } from "@/base/injection/injection";
import { listAllFiles } from "@/base/url";
import { ProcessingKey, processing } from "@/common/utils/processing";
import { DatabaseCore, IDatabaseCore } from "@/service/services/database/core";

export interface IDatabaseServiceState {
  dbInitializing: number;
  dbInitialized: number;
}

export const IDatabaseService = createDecorator("databaseService");

/**
 * Service for database operations except data access and modification.
 */
export class DatabaseService extends Eventable<IDatabaseServiceState> {
  private _localLibraryBootstrapPromise: Promise<void> | null = null;
  private _releaseLocalLibraryBootstrap?: () => void;

  constructor(@IDatabaseCore private readonly _databaseCore: DatabaseCore) {
    super("databaseService", {
      dbInitializing: 0,
      dbInitialized: 0,
    });

    this._databaseCore.on(["dbInitializing", "dbInitialized"], (payload) => {
      this.fire({ [payload.key]: payload.value });
    });
  }

  private async _planLocalLibraryBootstrap() {
    const appLibFolder = (await PLMainAPI.preferenceService.get(
      "appLibFolder"
    )) as string;
    const isFlexibleSync = (await PLMainAPI.preferenceService.get(
      "isFlexibleSync"
    )) as boolean;
    const syncFileStorage = (await PLMainAPI.preferenceService.get(
      "syncFileStorage"
    )) as string;

    if (
      !appLibFolder ||
      isFlexibleSync ||
      syncFileStorage !== "local" ||
      existsSync(path.join(appLibFolder, "default.realm"))
    ) {
      return [];
    }

    return listAllFiles(appLibFolder).filter((filePath) =>
      /\.pdf$/i.test(filePath)
    );
  }

  private async _reserveLocalLibraryBootstrap() {
    if (this._localLibraryBootstrapPromise) {
      return this._localLibraryBootstrapPromise;
    }

    let releaseBootstrap = () => {};
    const bootstrapReady = new Promise<void>((resolve) => {
      releaseBootstrap = resolve;
    });
    this._releaseLocalLibraryBootstrap = releaseBootstrap;
    this._localLibraryBootstrapPromise = (async () => {
      try {
        const pdfPaths = await this._planLocalLibraryBootstrap();
        await bootstrapReady;

        if (pdfPaths.length > 0) {
          await PLAPILocal.paperService.create(pdfPaths);
        }
      } finally {
        this._localLibraryBootstrapPromise = null;
        this._releaseLocalLibraryBootstrap = undefined;
      }
    })();

    return this._localLibraryBootstrapPromise;
  }

  /**
   * Initialize the database.
   * @param reinit - Whether to reinitialize the database. */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to initialize the database.", true, "DatabaseService")
  async initialize(reinit: boolean = true) {
    const localLibraryBootstrapPromise = this._reserveLocalLibraryBootstrap();
    await this._databaseCore.initRealm(reinit);
    this._releaseLocalLibraryBootstrap?.();
    await localLibraryBootstrapPromise;
  }

  /**
   * Pause the synchronization of the database. */
  @errorcatching(
    "Failed to pause the synchronization.",
    true,
    "DatabaseService"
  )
  pauseSync() {
    this._databaseCore.pauseSync();
  }

  /**
   * Resume the synchronization of the database. */
  @errorcatching(
    "Failed to resume the synchronization.",
    true,
    "DatabaseService"
  )
  resumeSync() {
    this._databaseCore.resumeSync();
  }

  /**
   * Delete the synchronization cache. */
  async deleteSyncCache() {
    await this._databaseCore.deleteSyncCache();
  }
}
