import { normalizeFolderPath } from "@/base/folder";
import { ObjectId } from "bson";

import { OID } from "@/models/id";

export const normalizeRelationIds = (
  relatedIds: Iterable<OID | string> | undefined,
  selfId?: OID | string
) => {
  const normalizedSelfId = selfId ? `${selfId}` : undefined;

  return Array.from(
    new Set(
      Array.from(relatedIds || [])
        .map((id) => `${id}`)
        .filter(
          (id) =>
            ObjectId.isValid(id) &&
            (!normalizedSelfId || id !== normalizedSelfId)
        )
    )
  );
};

export const toObjectIds = (ids: Iterable<string>) => {
  return Array.from(ids).map((id) => new ObjectId(id)) as any;
};

export const repairRelationGraph = <
  TPaper extends { _id: OID | string; relatedPaperIds?: OID[] | string[] }
>(
  papers: Iterable<TPaper>
) => {
  const normalizedPapers = Array.from(papers);
  const paperMap = new Map(
    normalizedPapers.map((paper) => [`${paper._id}`, paper])
  );
  const adjacencyMap = new Map<string, Set<string>>();

  for (const paper of normalizedPapers) {
    const paperId = `${paper._id}`;
    const nextIds = new Set<string>();

    for (const relatedId of normalizeRelationIds(
      paper.relatedPaperIds as any,
      paperId
    )) {
      if (!paperMap.has(relatedId)) {
        continue;
      }

      nextIds.add(relatedId);
    }

    adjacencyMap.set(paperId, nextIds);
  }

  for (const [paperId, relatedIds] of adjacencyMap.entries()) {
    for (const relatedId of relatedIds) {
      if (!adjacencyMap.has(relatedId)) {
        continue;
      }

      adjacencyMap.get(relatedId)!.add(paperId);
    }
  }

  return normalizedPapers.map((paper) => ({
    paper,
    relatedIds: Array.from(adjacencyMap.get(`${paper._id}`) || []),
  }));
};

export const assignRepairedRelations = <
  TPaper extends { _id: OID | string; relatedPaperIds?: OID[] | string[] }
>(
  papers: Iterable<TPaper>,
  assign: (paper: TPaper, relatedIds: string[]) => void
) => {
  for (const { paper, relatedIds } of repairRelationGraph(papers)) {
    assign(paper, relatedIds);
  }
};

export const removeRelationIds = (
  relatedIds: Iterable<OID | string> | undefined,
  removedIds: Iterable<OID | string>
) => {
  const removedIdSet = new Set(normalizeRelationIds(removedIds));

  return normalizeRelationIds(relatedIds).filter((id) => !removedIdSet.has(id));
};

export const normalizeEntityFolderPath = (paper: {
  folders?: Array<{ name?: string }>;
}) => {
  const folderPaths = (paper.folders || [])
    .map((folder) => normalizeFolderPath(folder.name))
    .filter((folderPath) => folderPath);

  if (folderPaths.length === 0) {
    return "";
  }

  return folderPaths.sort((left, right) => right.length - left.length)[0];
};
