import { SpawnOptions, spawn } from "child_process";
import { existsSync, promises as fsPromise } from "fs";
import os from "os";
import path, { isAbsolute } from "path";

import { errorcatching } from "@/base/error";
import { Eventable } from "@/base/event";
import { createDecorator } from "@/base/injection/injection";
import {
  constructFileURL,
  eraseProtocol,
  getFileType,
  getProtocol,
  getRelativePath,
  hasProtocol,
  listAllFiles,
} from "@/base/url";
import {
  getFolderPathFromRelativeFile,
  getParentFolderPath,
  isInternalLibraryPath,
  joinFolderPath,
  normalizeFolderPath,
} from "@/base/folder";
import { ILogService, LogService } from "@/common/services/log-service";

import { IFileBackend } from "../repositories/file-repository/backend";
import { LocalFileBackend } from "../repositories/file-repository/local-backend";
import { WebDavFileBackend } from "../repositories/file-repository/webdav-backend";

import { Entity } from "@/models/entity";
import { HookService, IHookService } from "./hook-service";

export interface IFileServiceState {
  backend: string;
  available: boolean;
  backendInitializing: boolean;
  backendInitialized: boolean;
}

export const IFileService = createDecorator("fileService");

export class FileService extends Eventable<IFileServiceState> {
  private _backend?: IFileBackend;

  constructor(
    @IHookService private readonly _hookService: HookService,
    @ILogService private readonly _logService: LogService
  ) {
    super("fileService", {
      backend: "",
      available: false,
      backendInitializing: false,
      backendInitialized: false,
    });
  }

  /**
   * Initialize the file backend.
   */
  @errorcatching("Failed to initialize the file backend.", true, "FileService")
  async initialize() {
    this._backend?.stopWatch();
    this._backend = undefined;
    this._backend = await this._initBackend();
  }

  private async _initBackend(): Promise<IFileBackend> {
    this.fire({ backendInitializing: true });
    if (
      (await PLMainAPI.preferenceService.get("syncFileStorage")) === "local"
    ) {
      this.fire({ backend: "local", available: true });
      return new LocalFileBackend(
        (await PLMainAPI.preferenceService.get("appLibFolder")) as string,
        (await PLMainAPI.preferenceService.get("sourceFileOperation")) as string
      );
    } else if (
      (await PLMainAPI.preferenceService.get("syncFileStorage")) === "webdav"
    ) {
      try {
        const webdavBackend = new WebDavFileBackend(
          (await PLMainAPI.preferenceService.get("appLibFolder")) as string,
          (await PLMainAPI.preferenceService.get(
            "sourceFileOperation"
          )) as string,
          (await PLMainAPI.preferenceService.get("webdavURL")) as string,
          (await PLMainAPI.preferenceService.get("webdavUsername")) as string,
          (await PLMainAPI.preferenceService.getPassword("webdav")) as string
        );

        const available = webdavBackend.check();
        this.fire({
          backend: "webdav",
          available,
          backendInitializing: false,
          backendInitialized: true,
        });
        return webdavBackend;
      } catch (e) {
        this._logService.error(
          "Failed to init webdav backend",
          e as Error,
          true,
          "FileService"
        );

        this.fire({ backend: "local", available: true });

        return new LocalFileBackend(
          (await PLMainAPI.preferenceService.get("appLibFolder")) as string,
          (await PLMainAPI.preferenceService.get(
            "sourceFileOperation"
          )) as string
        );
      }
    } else {
      throw new Error("Unknown file storage backend");
    }
  }

  async backend(): Promise<IFileBackend> {
    if (!this._backend && !this._eventState.backendInitializing) {
      this._backend = await this._initBackend();
    }
    return this._backend as IFileBackend;
  }

  /**
   * Start watching file changes. (Only for WebDAV file backend)
   */
  @errorcatching("Failed to watch file changes.", true, "FileService")
  async startWatch() {
    await this._backend?.startWatch();
  }

  /**
   * Stop watching file changes. (Only for WebDAV file backend)
   */
  @errorcatching("Failed to stop watching file changes.", true, "FileService")
  async stopWatch() {
    await this._backend?.stopWatch();
  }

  /**
   * Check if the file backend is available.
   */
  @errorcatching("Failed to check the file backend.", true, "FileService")
  async check() {
    return await this._backend?.check();
  }

  async libraryFolder() {
    return (await PLMainAPI.preferenceService.get("appLibFolder")) as string;
  }

  async usesLocalFileSystem() {
    return (
      ((await PLMainAPI.preferenceService.get("syncFileStorage")) as string) ===
      "local"
    );
  }

  getEntityFolderPath(paperEntity: Entity) {
    return normalizeFolderPath(
      paperEntity.folders
        .map((folder) => folder.name)
        .sort((left, right) => right.length - left.length)[0] || ""
    );
  }

  async createFolder(relativeFolderPath: string) {
    const normalizedFolderPath = normalizeFolderPath(relativeFolderPath);
    if (!normalizedFolderPath) {
      return;
    }

    await fsPromise.mkdir(
      path.join(await this.libraryFolder(), normalizedFolderPath),
      { recursive: true }
    );
  }

  async renameFolder(sourceRelativeFolderPath: string, targetRelativeFolderPath: string) {
    const normalizedSource = normalizeFolderPath(sourceRelativeFolderPath);
    const normalizedTarget = normalizeFolderPath(targetRelativeFolderPath);

    if (!normalizedSource || normalizedSource === normalizedTarget) {
      return;
    }

    await this.createFolder(getParentFolderPath(normalizedTarget));
    await fsPromise.rename(
      path.join(await this.libraryFolder(), normalizedSource),
      path.join(await this.libraryFolder(), normalizedTarget)
    );
  }

  async deleteEmptyFolder(relativeFolderPath: string, pruneParents = false) {
    const normalizedFolderPath = normalizeFolderPath(relativeFolderPath);
    if (!normalizedFolderPath) {
      return;
    }

    const libraryFolder = await this.libraryFolder();
    const absoluteFolderPath = path.join(
      libraryFolder,
      normalizedFolderPath
    );
    const children = await fsPromise.readdir(absoluteFolderPath);
    if (children.length > 0) {
      throw new Error("Only empty folders can be deleted.");
    }

    await fsPromise.rmdir(absoluteFolderPath);

    if (!pruneParents) {
      return;
    }

    let parentFolderPath = getParentFolderPath(normalizedFolderPath);
    while (parentFolderPath) {
      const absoluteParentFolderPath = path.join(libraryFolder, parentFolderPath);
      const parentChildren = await fsPromise.readdir(absoluteParentFolderPath);
      if (parentChildren.length > 0) {
        break;
      }

      await fsPromise.rmdir(absoluteParentFolderPath);
      parentFolderPath = getParentFolderPath(parentFolderPath);
    }
  }

  async listLibraryFolders() {
    const libraryFolder = await this.libraryFolder();
    const folders = new Set<string>();

    const visit = async (absoluteFolderPath: string) => {
      const items = await fsPromise.readdir(absoluteFolderPath, {
        withFileTypes: true,
      });

      for (const item of items) {
        const absoluteItemPath = path.join(absoluteFolderPath, item.name);
        const relativeItemPath = getRelativePath(absoluteItemPath, libraryFolder);

        if (isInternalLibraryPath(relativeItemPath)) {
          continue;
        }

        if (item.isDirectory()) {
          const normalizedFolderPath = normalizeFolderPath(relativeItemPath);
          if (normalizedFolderPath) {
            folders.add(normalizedFolderPath);
          }
          await visit(absoluteItemPath);
        }
      }
    };

    if (existsSync(libraryFolder)) {
      await visit(libraryFolder);
    }

    return Array.from(folders).sort((left, right) => {
      const leftDepth = left.split("/").length;
      const rightDepth = right.split("/").length;
      if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
      }
      return left.localeCompare(right);
    });
  }

  getManagedRelativePath(fileURL: string, libraryFolder: string) {
    if (getProtocol(fileURL) !== "file") {
      return "";
    }

    const rawPath = eraseProtocol(fileURL);
    if (!rawPath) {
      return "";
    }

    const relativePath = path.isAbsolute(rawPath)
      ? getRelativePath(rawPath, libraryFolder)
      : normalizeFolderPath(rawPath);
    const normalizedRelativePath = normalizeFolderPath(relativePath);

    if (
      !normalizedRelativePath ||
      normalizedRelativePath === ".." ||
      normalizedRelativePath.startsWith("../") ||
      isInternalLibraryPath(normalizedRelativePath)
    ) {
      return "";
    }

    return normalizedRelativePath;
  }

  remapManagedFileURL(
    fileURL: string,
    sourceRelativeFolderPath: string,
    targetRelativeFolderPath: string,
    libraryFolder: string
  ) {
    const normalizedSourceFolderPath = normalizeFolderPath(sourceRelativeFolderPath);
    const normalizedTargetFolderPath = normalizeFolderPath(targetRelativeFolderPath);
    const relativePath = this.getManagedRelativePath(fileURL, libraryFolder);

    if (
      !normalizedSourceFolderPath ||
      !relativePath ||
      !relativePath.startsWith(`${normalizedSourceFolderPath}/`)
    ) {
      return fileURL;
    }

    const suffix = relativePath.slice(normalizedSourceFolderPath.length + 1);
    return constructFileURL(
      joinFolderPath(normalizedTargetFolderPath, suffix),
      false,
      true,
      "",
      "file://"
    );
  }

  getLeafFolderFromEntityFiles(paperEntity: Entity, libraryFolder: string) {
    const localFileSup = Object.values(paperEntity.supplementaries).find((sup) => {
      return !!this.getManagedRelativePath(sup.url, libraryFolder);
    });

    if (!localFileSup) {
      return this.getEntityFolderPath(paperEntity);
    }

    return getFolderPathFromRelativeFile(
      this.getManagedRelativePath(localFileSup.url, libraryFolder)
    );
  }

  /**
   * Infer the relative path of a paper entity.
   * @param paperEntity - Paper entity to infer the relative path
   */
  async inferRelativeFileName(paperEntity: Entity): Promise<string> {
    // Prepare ingredients
    let titleStr =
      paperEntity.title.replace(/[^\p{L}\s\d]/gu, "").replace(/\s/g, "_") ||
      "untitled";
    const firstCharTitleStr =
      titleStr
        .split("_")
        .map((word: string) => {
          if (word) {
            return word.slice(0, 1);
          } else {
            return "";
          }
        })
        .filter((c: string) => c && c === c.toUpperCase())
        .join("") || "untitled";
    let authorStr =
      paperEntity.authors.split(",").map((author) => author.trim())[0] ||
      "anonymous";
    const firstNameStr = authorStr.split(" ").shift() || "anonymous";
    const lastNameStr = authorStr.split(" ").pop() || "anonymous";
    const yearStr = paperEntity.year || "0000";
    let publicationStr =
      paperEntity.journal ||
      paperEntity.booktitle ||
      paperEntity.publisher ||
      paperEntity.school ||
      paperEntity.institution ||
      "unknown";
    publicationStr = publicationStr.replace(/[^\p{L}\s\d]/gu, "");
    let idStr = paperEntity._id.toString();

    // =============================

    const renamingFormat = (await PLMainAPI.preferenceService.get(
      "renamingFormat"
    )) as string;
    let formatedFilename = "";
    if (renamingFormat === "short") {
      formatedFilename = `${firstCharTitleStr}_${idStr}`;
    } else if (renamingFormat === "authortitle") {
      if (authorStr !== paperEntity.authors && authorStr !== "anonymous") {
        authorStr = `${authorStr} et al`;
      }
      idStr = idStr.slice(-5, -1);
      formatedFilename = `${authorStr} - ${titleStr.slice(0, 20)}_${idStr}`;
    } else if (renamingFormat === "custom") {
      formatedFilename = (
        (await PLMainAPI.preferenceService.get(
          "customRenamingFormat"
        )) as string
      )
        .replaceAll("{title}", titleStr.slice(0, 150))
        .replaceAll("{firstchartitle}", firstCharTitleStr)
        .replaceAll("{author}", authorStr)
        .replaceAll("{year}", yearStr)
        .replaceAll("{lastname}", lastNameStr)
        .replaceAll("{firstname}", firstNameStr)
        .replaceAll("{publication}", publicationStr.slice(0, 100))
        .slice(0, 250);
      if (formatedFilename) {
        formatedFilename = `${formatedFilename}_${idStr}`;
      } else {
        formatedFilename = `${idStr}`;
      }
    } else {
      formatedFilename = `${titleStr.slice(0, 200)}_${idStr}`;
    }

    formatedFilename = formatedFilename
      .replace(/\\/g, "/")
      .replace(/\//g, "_")
      .replace(/[*?"<>|:#\\]/g, "");
    return formatedFilename;
  }

  /**
   * Move files of a paper entity to the library folder
   * @param paperEntity - Paper entity to move
   * @param moveMain - Move the main file
   * @param moveSups - Move the supplementary files
   * @returns
   */
  async move(
    paperEntity: Entity,
  ): Promise<Entity> {
    const backend = await this.backend();
    const libraryFolder = await this.libraryFolder();

    try {
      const formatedFilename = await this.inferRelativeFileName(paperEntity);
      const folderPath = this.getLeafFolderFromEntityFiles(
        paperEntity,
        libraryFolder
      );

      for (const [id, sup] of Object.entries(paperEntity.supplementaries)) {
        if (getProtocol(sup.url) !== "file") {
          continue;
        }

        const sourceURL = sup.url;
        const targetRelativePath = joinFolderPath(
          folderPath,
          `${formatedFilename}_${sup._id}${path.extname(sup.url)}`
        );
        const movedFilename = await backend.moveFile(sourceURL, targetRelativePath);
        sup.url = constructFileURL(
          movedFilename,
          false,
          true,
          "",
          "file://",
        );
        paperEntity.supplementaries[id] = sup;
      }

      for (const id of Object.keys(paperEntity.supplementaries)) {
        if (getProtocol(paperEntity.supplementaries[id].url) === "file" && path.isAbsolute(eraseProtocol(paperEntity.supplementaries[id].url))) {
          this._logService.warn(
            `The file ${paperEntity.supplementaries[id].url} cannot be moved to the library folder.`,
            "",
            true,
          )
          delete paperEntity.supplementaries[id];
        }
      }

      return paperEntity;
    } catch (e) {
      this._logService.error(
        "Failed to move files of a paper entity",
        e as Error,
        true,
        "FileService"
      );
      return paperEntity;
    }
  }

  /**
   * Move a file
   * @param sourceURL - Source file URL
   * @param targetURL - Target file URL
   * @returns
   */
  @errorcatching("Failed to move a file.", true, "FileService", "")
  async moveFile(sourceURL: string, targetURL: string): Promise<string> {
    const backend = await this.backend();

    return await backend.moveFile(sourceURL, targetURL);
  }

  /**
   * Remove files of a paper entity
   * @param paperEntity - Paper entity to remove
   */
  @errorcatching(
    "Failed to remove files of a paper entity.",
    true,
    "FileService"
  )
  async remove(paperEntity: Entity): Promise<void> {
    const backend = await this.backend();

    const files = Object.values(paperEntity.supplementaries).map((sup) => {
      if (getProtocol(sup.url) !== "file") {
        return null;
      } else {
        return sup.url;
      }
    }).filter((file) => file !== null) as string[];

    const results = await Promise.allSettled(
      files.map((file) => backend.removeFile(file))
    );

    for (const result of results) {
      if (result.status === "rejected") {
        this._logService.error(
          "Failed to remove file",
          result.reason as Error,
          true,
          "FileService"
        );
      }
    }
  }

  /**
   * Remove a file
   * @param url - Url of the file to remove
   */
  @errorcatching("Failed to remove a file.", true, "FileService")
  async removeFile(url: string): Promise<void> {
    const backend = await this.backend();

    const realURL = url.split(":::").pop() as string;
    return await backend.removeFile(realURL);
  }

  /**
   * List all files in a folder
   * @param folderURL - Url of the folder
   * @returns List of file names
   */
  @errorcatching("Failed to list all files.", true, "FileService", [])
  async listAllFiles(folderURL: string): Promise<string[]> {
    return listAllFiles(folderURL);
  }

  /**
   * Locate the paper files, such as the PDF, of paper entities.
   * @param paperEntities - The paper entities.
   * @returns The paper entities with the located file URLs.
   */
  async locateFileOnWeb(paperEntities: Entity[]) {
    try {
      this._logService.info(
        `Locating files for ${paperEntities.length} paper(s)...`,
        "",
        true,
        "FileService"
      );

      let updatedPaperEntityDrafts = paperEntities.map((paperEntity) => {
        if (paperEntity.defaultSup) {
          delete paperEntity.supplementaries[paperEntity.defaultSup];
        }
        paperEntity.defaultSup = undefined;
      });
      if (this._hookService.hasHook("locateFile")) {
        [updatedPaperEntityDrafts] = await this._hookService.modifyHookPoint(
          "locateFile",
          60000,
          updatedPaperEntityDrafts
        );
      }

      return updatedPaperEntityDrafts;
    } catch (e) {
      this._logService.error(
        "Failed to locate files",
        e as Error,
        true,
        "FileService"
      );
      return paperEntities;
    }
  }

  /**
   * Return the real and accessable path of the URL.
   * If the URL is a local file, return the path of the file.
   * If the URL is a remote file and `download` is `true`, download the file and return the path of the downloaded file.
   * If the URL is a web URL, return the URL.
   * @param url
   * @param download
   * @returns The real and accessable path of the URL.
   */
  @errorcatching("Failed to access the URL.", true, "FileService", "")
  async access(url: string, download: boolean): Promise<string> {
    const backend = await this.backend();

    return await backend.access(url, download);
  }

  /**
   * Open the URL.
   * @param url - URL to open
   */
  @errorcatching("Failed to open the URL.", true, "FileService")
  async open(url: string) {
    if (!hasProtocol(url)) {
      this._logService.error(
        "URL should have a protocol",
        "",
        true,
        "FileService"
      );
      return;
    }

    if (getProtocol(url) === "http" || getProtocol(url) === "https") {
      PLMainAPI.fileSystemService.openExternal(url);
    } else {
      const accessableURL = eraseProtocol(await this.access(url, true));
      if (
        (await PLMainAPI.preferenceService.get("selectedPDFViewer")) ===
          "default" ||
        getFileType(accessableURL) !== "pdf"
      ) {
        PLMainAPI.fileSystemService.openPath(accessableURL);
      } else {
        const viewerPath = (await PLMainAPI.preferenceService.get(
          "selectedPDFViewerPath"
        )) as string;
        const exists = existsSync(viewerPath);
        if (!exists) {
          this._logService.error(
            "Cannot find the custom PDF viewer",
            (await PLMainAPI.preferenceService.get(
              "selectedPDFViewer"
            )) as string,
            true,
            "FileService"
          );
        }
        const opts: SpawnOptions = {
          detached: true,
        };
        if (os.platform() === "win32") {
          spawn(viewerPath, [accessableURL], opts);
        } else {
          spawn("open", ["-a", viewerPath, accessableURL], opts);
        }
      }
    }
  }

  /**
   * Show the URL in Finder / Explorer.
   * @param url - URL to show
   */
  @errorcatching("Failed to show the URL in Finder.", true, "FileService")
  async showInFinder(url: string) {
    const accessedURL = eraseProtocol(await this.access(url, true));
    PLMainAPI.fileSystemService.showInFinder(accessedURL);
  }

  /**
   * Preview the URL only for MacOS.
   * Other platforms should install an extension.
   * @param url - URL to preview
   */
  @errorcatching("Failed to preview the URL.", true, "FileService")
  async preview(url: string) {
    const fileURL = await this.access(url, true);
    PLMainAPI.fileSystemService.preview(fileURL);
  }
}
