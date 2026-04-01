import path from "path";

const RESERVED_FOLDER_NAMES = new Set(["Tags", "Folders"]);
const INTERNAL_FOLDER_NAMES = new Set([
  ".realm.management",
  "cache.realm.management",
]);

const INTERNAL_FILE_SUFFIXES = [
  ".realm",
  ".realm.lock",
  ".realm.note",
  ".realm.management",
  ".realm.log",
];

export const normalizeFolderPath = (folderPath?: string) => {
  if (!folderPath) {
    return "";
  }

  const normalized = folderPath
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== ".");

  return normalized.join("/");
};

export const getFolderDepth = (folderPath?: string) => {
  const normalized = normalizeFolderPath(folderPath);
  if (!normalized) {
    return 0;
  }
  return normalized.split("/").length;
};

export const getFolderLeafName = (folderPath?: string) => {
  const normalized = normalizeFolderPath(folderPath);
  return normalized.split("/").pop() || "";
};

export const getParentFolderPath = (folderPath?: string) => {
  const normalized = normalizeFolderPath(folderPath);
  if (!normalized) {
    return "";
  }

  const dirname = path.posix.dirname(normalized);
  return dirname === "." ? "" : dirname;
};

export const joinFolderPath = (...segments: (string | undefined)[]) => {
  return normalizeFolderPath(
    segments
      .map((segment) => normalizeFolderPath(segment))
      .filter((segment) => segment)
      .join("/")
  );
};

export const isValidFolderNameSegment = (folderName?: string) => {
  const normalized = normalizeFolderPath(folderName);
  return Boolean(
    normalized &&
      !normalized.includes("/") &&
      !RESERVED_FOLDER_NAMES.has(normalized)
  );
};

export const getFolderPrefixQuery = (folderPath: string) => {
  const normalized = normalizeFolderPath(folderPath);
  if (!normalized) {
    return "";
  }

  const escapedFolderPath = escapeRealmString(normalized);
  const escapedPrefix = escapeRealmString(`${normalized}/`);
  return `(ANY folders.name == "${escapedFolderPath}") OR (ANY folders.name BEGINSWITH "${escapedPrefix}")`;
};

export const escapeRealmString = (value: string) => {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
};

export const getTopLevelFolder = (folderPath?: string) => {
  const normalized = normalizeFolderPath(folderPath);
  return normalized.split("/")[0] || "";
};

export const getFolderShadeKey = (folderPath?: string) => {
  const normalized = normalizeFolderPath(folderPath);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  return parts.slice(1).join("/");
};

export const isFolderPathInside = (folderPath: string, maybeParentPath: string) => {
  const normalizedPath = normalizeFolderPath(folderPath);
  const normalizedParentPath = normalizeFolderPath(maybeParentPath);

  if (!normalizedParentPath) {
    return true;
  }

  return (
    normalizedPath === normalizedParentPath ||
    normalizedPath.startsWith(`${normalizedParentPath}/`)
  );
};

export const isInternalLibraryPath = (relativePath: string) => {
  const normalized = normalizeFolderPath(relativePath);
  if (!normalized) {
    return false;
  }

  const parts = normalized.split("/");
  if (parts.some((part) => INTERNAL_FOLDER_NAMES.has(part))) {
    return true;
  }

  const lastPart = parts[parts.length - 1];
  return INTERNAL_FILE_SUFFIXES.some((suffix) => lastPart.endsWith(suffix));
};

export const getFolderPathFromRelativeFile = (relativeFilePath: string) => {
  const normalized = normalizeFolderPath(relativeFilePath);
  if (!normalized) {
    return "";
  }

  const dirname = path.posix.dirname(normalized);
  return dirname === "." ? "" : dirname;
};
