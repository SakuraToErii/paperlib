import Realm from "realm";

import { errorcatching } from "@/base/error";
import { Eventable } from "@/base/event";
import { createDecorator } from "@/base/injection/injection";
import {
  escapeRealmString,
  getParentFolderPath,
  isFolderPathInside,
  isValidFolderNameSegment,
  joinFolderPath,
  normalizeFolderPath,
} from "@/base/folder";
import { ILogService, LogService } from "@/common/services/log-service";
import {
  Categorizer,
  CategorizerType,
  Colors,
  ICategorizerCollection,
  ICategorizerRealmObject,
  PaperFolder,
  PaperTag,
} from "@/models/categorizer";
import { Entity } from "@/models/entity";
import { OID } from "@/models/id";
import { ProcessingKey, processing } from "@/common/utils/processing";
import { DatabaseCore, IDatabaseCore } from "@/service/services/database/core";

import {
  CategorizerRepository,
  ICategorizerRepository,
} from "../repositories/db-repository/categorizer-repository";
import { FileService, IFileService } from "./file-service";

export interface ICategorizerServiceState {
  tagsUpdated: number;
  foldersUpdated: number;
}

export const ICategorizerService = createDecorator("categorizerService");

export class CategorizerService extends Eventable<ICategorizerServiceState> {
  constructor(
    @IDatabaseCore private readonly _databaseCore: DatabaseCore,
    @ICategorizerRepository
    private readonly _categorizerRepository: CategorizerRepository,
    @IFileService private readonly _fileService: FileService,
    @ILogService private readonly _logService: LogService
  ) {
    super("categorizerService", {
      tagsUpdated: 0,
      foldersUpdated: 0,
    });

    this._categorizerRepository.on(
      ["tagsUpdated", "foldersUpdated"],
      (payload) => {
        this.fire({
          [payload.key]: payload.value,
        });
      }
    );

    this._databaseCore.on("dbInitialized", async () => {
      this._categorizerRepository.createRoots(
        await this._databaseCore.realm(),
        this._databaseCore.getPartition()
      );
      await this.syncFoldersWithLibrary();
    });
  }

  private _folderRoot(realm: Realm) {
    return realm
      .objects<PaperFolder>(PaperFolder.schema.name)
      .filtered("name == 'Folders'")[0] as ICategorizerRealmObject;
  }

  private async _updateLinkedFolderPath(oldFolderPath: string, newFolderPath: string) {
    const pluginLinkedFolder = (await PLMainAPI.preferenceService.get(
      "pluginLinkedFolder"
    )) as string;

    if (!pluginLinkedFolder) {
      return;
    }

    const normalizedOldFolderPath = normalizeFolderPath(oldFolderPath);
    const normalizedNewFolderPath = normalizeFolderPath(newFolderPath);
    if (!normalizedOldFolderPath) {
      return;
    }

    if (pluginLinkedFolder === normalizedOldFolderPath) {
      await PLMainAPI.preferenceService.set({
        pluginLinkedFolder: normalizedNewFolderPath,
      });
      return;
    }

    if (pluginLinkedFolder.startsWith(`${normalizedOldFolderPath}/`)) {
      await PLMainAPI.preferenceService.set({
        pluginLinkedFolder: normalizedNewFolderPath
          ? pluginLinkedFolder.replace(
              normalizedOldFolderPath,
              normalizedNewFolderPath
            )
          : "",
      });
    }
  }

  @processing(ProcessingKey.General)
  @errorcatching("Failed to sync folders with library.", true, "CategorizerService")
  async syncFoldersWithLibrary() {
    if (!(await this._fileService.usesLocalFileSystem())) {
      return;
    }

    const realm = await this._databaseCore.realm();
    this._categorizerRepository.createRoots(
      realm,
      this._databaseCore.getPartition()
    );

    const root = this._folderRoot(realm);
    const paperEntities = realm
      .objects<Entity>(Entity.schema.name)
      .filtered("library == 'main'");
    const libraryFolder = await this._fileService.libraryFolder();

    const folderPaths = new Set(await this._fileService.listLibraryFolders());
    const leafFolderByPaperId = new Map<string, string>();

    for (const paperEntity of paperEntities) {
      const leafFolderPath = normalizeFolderPath(
        this._fileService.getLeafFolderFromEntityFiles(paperEntity, libraryFolder)
      );
      if (leafFolderPath) {
        folderPaths.add(leafFolderPath);
      }
      leafFolderByPaperId.set(`${paperEntity._id}`, leafFolderPath);
    }

    const desiredFolderPaths = Array.from(folderPaths).sort((left, right) => {
      const leftDepth = left.split("/").length;
      const rightDepth = right.split("/").length;
      if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
      }
      return left.localeCompare(right);
    });

    realm.safeWrite(() => {
      const existingFolders = realm
        .objects<PaperFolder>(PaperFolder.schema.name)
        .filtered("name != 'Folders'");
      const existingFolderMap = new Map<string, ICategorizerRealmObject>();

      for (const existingFolder of existingFolders) {
        existingFolderMap.set(existingFolder.name, existingFolder as ICategorizerRealmObject);
      }

      for (const folderPath of desiredFolderPaths) {
        if (!existingFolderMap.has(folderPath)) {
          existingFolderMap.set(
            folderPath,
            realm.create<PaperFolder>(
              PaperFolder.schema.name,
              new PaperFolder(
                {
                  _partition: this._databaseCore.getPartition(),
                  name: folderPath,
                  color: Colors.blue,
                  children: [],
                },
                true
              )
            ) as ICategorizerRealmObject
          );
        }
      }

      root.children.splice(0, root.children.length);
      for (const folderPath of desiredFolderPaths) {
        const folderObject = existingFolderMap.get(folderPath)!;
        folderObject.children.splice(0, folderObject.children.length);
      }

      for (const folderPath of desiredFolderPaths) {
        const folderObject = existingFolderMap.get(folderPath)!;
        const parentFolderPath = getParentFolderPath(folderPath);
        const parentObject = parentFolderPath
          ? existingFolderMap.get(parentFolderPath)
          : root;

        if (parentObject) {
          parentObject.children.push(folderObject as any);
        }
      }

      for (const paperEntity of paperEntities) {
        const leafFolderPath = leafFolderByPaperId.get(`${paperEntity._id}`) || "";
        paperEntity.folders = leafFolderPath
          ? [existingFolderMap.get(leafFolderPath)!]
          : [];
      }

      for (const folderPath of desiredFolderPaths) {
        const folderObject = existingFolderMap.get(folderPath)!;
        folderObject.count = Array.from(leafFolderByPaperId.values()).filter(
          (leafFolderPath) =>
            leafFolderPath === folderPath ||
            leafFolderPath.startsWith(`${folderPath}/`)
        ).length;
      }

      const desiredFolderSet = new Set(desiredFolderPaths);
      const staleFolders = Array.from(existingFolders).filter(
        (folder) => !desiredFolderSet.has(folder.name)
      );
      if (staleFolders.length > 0) {
        realm.delete(staleFolders);
      }
    });
  }

  /**
   * Load categorizers.
   * @param type - The type of the categorizer.
   * @param sortBy - Sort by
   * @param sortOrder - Sort order
   * @returns
   */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to load categorizer.", true, "CategorizerService", [])
  async load(type: CategorizerType, sortBy: string, sortOrder: string) {
    return this._categorizerRepository.load(
      await this._databaseCore.realm(),
      type,
      sortBy,
      sortOrder
    );
  }

  /**
   * Load categorizers by ids.
   * @param type - The type of the categorizer.
   * @param ids - The ids of the categorizers.
   * @returns
   */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to load categorizer.", true, "CategorizerService", [])
  async loadByIds(type: CategorizerType, ids: OID[]) {
    return this._categorizerRepository.loadByIds(
      await this._databaseCore.realm(),
      type,
      ids
    );
  }

  /**
   * Create a categorizer.
   * @param type - The type of categorizer.
   * @param categorizer - The categorizer.
   * @param parentCategorizer - The parent categorizer to insert.
   * @returns
   */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to create categorizers.", true, "CategorizerService")
  async create(
    type: CategorizerType,
    categorizer: Categorizer,
    parentCategorizer?: Categorizer
  ) {
    return this.update(type, categorizer, parentCategorizer);
  }

  /**
   * Delete a categorizer.
   * @param type - The type of categorizer.
   * @param name - The name of categorizer.
   * @param categorizer - The categorizer.
   * @returns
   */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to delete categorizers.", true, "CategorizerService")
  async delete(
    type: CategorizerType,
    ids?: OID[],
    categorizers?: ICategorizerCollection
  ) {
    if (type === CategorizerType.PaperFolder) {
      if (!(await this._fileService.usesLocalFileSystem())) {
        throw new Error(
          "Filesystem-backed folders are only supported with the local file storage backend."
        );
      }

      const realm = await this._databaseCore.realm();
      const targetFolders = categorizers
        ? Array.from(categorizers)
        : this._categorizerRepository.loadByIds(realm, type, ids || []);

      for (const targetFolder of targetFolders) {
        if (targetFolder.name === "Folders") {
          continue;
        }
        await this._fileService.deleteEmptyFolder(targetFolder.name, true);
        await this._updateLinkedFolderPath(targetFolder.name, "");
      }

      await this.syncFoldersWithLibrary();
      return;
    }

    this._categorizerRepository.delete(
      await this._databaseCore.realm(),
      type,
      ids,
      categorizers
    );
  }

  /**
   * Colorize a categorizer.
   * @param id - The id of the categorizer.
   * @param color - The color.
   * @param type - The type of the categorizer.
   * @returns
   */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to colorize categorizers.", true, "CategorizerService")
  async colorize(id: OID, color: Colors, type: CategorizerType) {
    const realm = await this._databaseCore.realm();
    const objects = this._categorizerRepository.loadByIds(realm, type, [id]);

    if (objects.length === 0) {
      throw new Error(`Categorizer not found: ${id}`);
    }
    const object = objects[0] as ICategorizerRealmObject;
    const parents = object.linkingObjects<ICategorizerRealmObject>(
      type,
      "children"
    );
    const parent = parents.length > 0 ? parents[0] : undefined;

    this._categorizerRepository.update(
      await this._databaseCore.realm(),
      type,
      new Categorizer(
        {
          _id: id,
          name: object.name.split("/").pop(),
          color,
        },
        false
      ),
      this._databaseCore.getPartition(),
      parent
    );
  }

  /**
   * Rename a categorizer.
   * @param id - The id of the categorizer.
   * @param name - The new name of the categorizer.
   * @param type - The type of the categorizer.
   * @returns
   */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to rename categorizers.", true, "CategorizerService")
  async rename(id: OID, name: string, type: CategorizerType) {
    const realm = await this._databaseCore.realm();
    const objects = this._categorizerRepository.loadByIds(realm, type, [id]);

    if (objects.length === 0) {
      throw new Error(`Categorizer not found: ${id}`);
    }

    const object = objects[0] as ICategorizerRealmObject;
    const parents = object.linkingObjects<ICategorizerRealmObject>(
      type,
      "children"
    );
    const parent = parents.length > 0 ? parents[0] : undefined;

    return this.update(
      type,
      new Categorizer(
        {
          _id: id,
          name,
          color: object.color,
        },
        false
      ),
      parent
    );
  }

  /**
   * Update/Insert a categorizer.
   * @param type - The type of the categorizer.
   * @param categorizer - The categorizer.
   * @param parentCategorizer - The parent categorizer to insert.
   * @returns
   */
  @processing(ProcessingKey.General)
  @errorcatching("Failed to update categorizers.", true, "CategorizerService")
  async update(
    type: CategorizerType,
    categorizer: Categorizer,
    parentCategorizer?: Categorizer
  ) {
    if (!isValidFolderNameSegment(categorizer.name)) {
      throw new Error(
        "Invalid name, name cannot be empty, 'Tags', 'Folders', or contain '/'"
      );
    }

    if (type === CategorizerType.PaperFolder) {
      if (!(await this._fileService.usesLocalFileSystem())) {
        throw new Error(
          "Filesystem-backed folders are only supported with the local file storage backend."
        );
      }

      const realm = await this._databaseCore.realm();
      const targetObjects = categorizer._id
        ? this._categorizerRepository.loadByIds(realm, type, [categorizer._id])
        : [];
      const targetObject = targetObjects.length > 0
        ? (targetObjects[0] as ICategorizerRealmObject)
        : undefined;
      const currentFolderPath = targetObject?.name || "";
      const parentFolderPath = parentCategorizer && parentCategorizer.name !== "Folders"
        ? normalizeFolderPath(parentCategorizer.name)
        : "";
      const targetFolderName = normalizeFolderPath(categorizer.name).split("/").pop() || "";
      const targetFolderPath = joinFolderPath(parentFolderPath, targetFolderName);

      if (
        currentFolderPath &&
        parentFolderPath &&
        isFolderPathInside(parentFolderPath, currentFolderPath)
      ) {
        throw new Error("Circular folder move is not allowed.");
      }

      if (!targetObject) {
        await this._fileService.createFolder(targetFolderPath);
      } else if (currentFolderPath !== targetFolderPath) {
        await this._fileService.renameFolder(currentFolderPath, targetFolderPath);
        const libraryFolder = await this._fileService.libraryFolder();
        realm.safeWrite(() => {
          const folderObjects = realm
            .objects<PaperFolder>(PaperFolder.schema.name)
            .filtered("name != 'Folders'");

          for (const folderObject of folderObjects) {
            const normalizedFolderPath = normalizeFolderPath(folderObject.name);
            if (
              normalizedFolderPath === currentFolderPath ||
              normalizedFolderPath.startsWith(`${currentFolderPath}/`)
            ) {
              const suffix = normalizedFolderPath
                .slice(currentFolderPath.length)
                .replace(/^\/+/, "");
              folderObject.name = joinFolderPath(targetFolderPath, suffix);
            }
          }

          const paperEntities = realm
            .objects<Entity>(Entity.schema.name)
            .filtered("library == 'main'");
          for (const paperEntity of paperEntities) {
            for (const [supplementaryId, supplementary] of Object.entries(
              paperEntity.supplementaries
            )) {
              const nextURL = this._fileService.remapManagedFileURL(
                supplementary.url,
                currentFolderPath,
                targetFolderPath,
                libraryFolder
              );
              if (nextURL !== supplementary.url) {
                supplementary.url = nextURL;
                paperEntity.supplementaries[supplementaryId] = supplementary;
              }
            }
          }
        });
        await this._updateLinkedFolderPath(currentFolderPath, targetFolderPath);
      }

      if (targetObject && categorizer.color && targetObject.color !== categorizer.color) {
        this._categorizerRepository.update(
          realm,
          type,
          new Categorizer({
            _id: targetObject._id,
            name: targetFolderPath.split("/").pop(),
            color: categorizer.color,
          }),
          this._databaseCore.getPartition(),
          parentCategorizer
        );
      }

      await this.syncFoldersWithLibrary();
      const syncedFolder = realm
        .objects<PaperFolder>(PaperFolder.schema.name)
        .filtered(`name == "${escapeRealmString(targetFolderPath)}"`)[0];
      return syncedFolder;
    }

    return this._categorizerRepository.update(
      await this._databaseCore.realm(),
      type,
      categorizer,
      this._databaseCore.getPartition(),
      parentCategorizer
    );
  }

  /**
   * Migrate the local database to the cloud database. */
  @errorcatching(
    "Failed to migrate the local categorizers to the cloud database.",
    true,
    "DatabaseService"
  )
  async migrateLocaltoCloud() {
    const localConfig = await this._databaseCore.getLocalConfig(false);
    const localRealm = new Realm(localConfig);

    const rootTag = localRealm
      .objects<PaperTag>("PaperTag")
      .filtered("name == 'Tags'");
    const rootFolder = localRealm
      .objects<PaperFolder>("PaperFolder")
      .filtered("name == 'Folders'");

    const _migrate = async (
      type: CategorizerType,
      categorizer: Categorizer,
      parent?: Categorizer
    ) => {
      const migrateCategorizer = new Categorizer();
      migrateCategorizer._id = categorizer._id;
      migrateCategorizer.name = categorizer.name.split("/").pop() as string;
      migrateCategorizer.color = categorizer.color;
      migrateCategorizer.count = 0;
      await this.update(
        type,
        migrateCategorizer,
        new Categorizer({ _id: parent?._id, name: parent?.name })
      );

      categorizer.children.forEach(async (child) => {
        await _migrate(type, child, migrateCategorizer);
      });
    };

    for (const tag of rootTag[0].children) {
      await _migrate(CategorizerType.PaperTag, tag, rootTag[0]);
    }

    for (const folder of rootFolder[0].children) {
      await _migrate(CategorizerType.PaperFolder, folder, rootFolder[0]);
    }

    this._logService.info(
      `Migrated tags and folders to cloud database.`,
      "",
      true,
      "PaperService"
    );

    localRealm.close();
  }
}
