import { describe, expect, it } from "vitest";

function normalizeRequestedRelatedIds(
  paperId: string,
  relatedIds: string[]
): string[] {
  return Array.from(
    new Set(
      relatedIds.filter(
        (id) => /^[a-f\d]{24}$/i.test(id) && id !== paperId
      )
    )
  );
}

function setRelatedPaperIdsState(
  papers: Array<{ id: string; relatedPaperIds: string[] }>,
  paperId: string,
  relatedIds: string[]
) {
  const byId = new Map(
    papers.map((paper) => [paper.id, { ...paper, relatedPaperIds: [...paper.relatedPaperIds] }])
  );

  const targetPaper = byId.get(paperId);
  if (!targetPaper) {
    throw new Error(`Paper not found: ${paperId}`);
  }

  const requestedRelatedIds = normalizeRequestedRelatedIds(paperId, relatedIds);
  const existingRelatedIds = new Set(
    requestedRelatedIds.filter((id) => byId.has(id))
  );
  const normalizedRelatedIds = requestedRelatedIds.filter((id) =>
    existingRelatedIds.has(id)
  );

  const previouslyRelatedIds = new Set(targetPaper.relatedPaperIds);
  targetPaper.relatedPaperIds = [...normalizedRelatedIds];

  for (const relatedPaperId of existingRelatedIds) {
    const relatedPaper = byId.get(relatedPaperId);
    if (!relatedPaper) {
      continue;
    }

    const nextIds = new Set(relatedPaper.relatedPaperIds);
    nextIds.delete(relatedPaperId);
    nextIds.add(paperId);
    relatedPaper.relatedPaperIds = Array.from(nextIds).filter(
      (id) => /^[a-f\d]{24}$/i.test(id) && id !== relatedPaperId
    );
  }

  for (const previouslyRelatedId of previouslyRelatedIds) {
    if (normalizedRelatedIds.includes(previouslyRelatedId)) {
      continue;
    }

    const relatedPaper = byId.get(previouslyRelatedId);
    if (!relatedPaper) {
      continue;
    }

    relatedPaper.relatedPaperIds = relatedPaper.relatedPaperIds.filter(
      (id) => id !== paperId && id !== relatedPaper.id
    );
  }

  return byId;
}

function deletePaperState(
  papers: Array<{ id: string; relatedPaperIds: string[] }>,
  deletedIds: string[]
) {
  const deletedIdSet = new Set(deletedIds);

  return papers
    .filter((paper) => !deletedIdSet.has(paper.id))
    .map((paper) => ({
      ...paper,
      relatedPaperIds: paper.relatedPaperIds.filter(
        (relatedPaperId) => !deletedIdSet.has(relatedPaperId)
      ),
    }));
}

describe("relation contract invariants", () => {
  it("keeps relations symmetric and deduplicated", () => {
    const paperA = "507f1f77bcf86cd799439011";
    const paperB = "507f1f77bcf86cd799439012";
    const paperC = "507f1f77bcf86cd799439013";

    const state = setRelatedPaperIdsState(
      [
        { id: paperA, relatedPaperIds: [] },
        { id: paperB, relatedPaperIds: [paperA, paperA, paperB] },
        { id: paperC, relatedPaperIds: [] },
      ],
      paperA,
      [paperB, paperB, paperA, paperC]
    );

    expect(state.get(paperA)?.relatedPaperIds).toEqual([paperB, paperC]);
    expect(state.get(paperB)?.relatedPaperIds).toEqual([paperA]);
    expect(state.get(paperC)?.relatedPaperIds).toEqual([paperA]);
  });

  it("removes stale reverse relations when a paper relation set shrinks", () => {
    const paperA = "507f1f77bcf86cd799439021";
    const paperB = "507f1f77bcf86cd799439022";
    const paperC = "507f1f77bcf86cd799439023";

    const state = setRelatedPaperIdsState(
      [
        { id: paperA, relatedPaperIds: [paperB, paperC] },
        { id: paperB, relatedPaperIds: [paperA] },
        { id: paperC, relatedPaperIds: [paperA] },
      ],
      paperA,
      [paperB]
    );

    expect(state.get(paperA)?.relatedPaperIds).toEqual([paperB]);
    expect(state.get(paperB)?.relatedPaperIds).toEqual([paperA]);
    expect(state.get(paperC)?.relatedPaperIds).toEqual([]);
  });

  it("drops deleted paper ids from every remaining paper", () => {
    const paperA = "507f1f77bcf86cd799439031";
    const paperB = "507f1f77bcf86cd799439032";
    const paperC = "507f1f77bcf86cd799439033";

    const remainingPapers = deletePaperState(
      [
        { id: paperA, relatedPaperIds: [paperB, paperC] },
        { id: paperB, relatedPaperIds: [paperA, paperC] },
        { id: paperC, relatedPaperIds: [paperA, paperB] },
      ],
      [paperB]
    );

    expect(remainingPapers).toEqual([
      { id: paperA, relatedPaperIds: [paperC] },
      { id: paperC, relatedPaperIds: [paperA] },
    ]);
  });

  it("ignores invalid, self, and nonexistent related paper ids", () => {
    const paperA = "507f1f77bcf86cd799439041";
    const paperB = "507f1f77bcf86cd799439042";
    const nonexistent = "507f1f77bcf86cd7994390ff";

    const state = setRelatedPaperIdsState(
      [
        { id: paperA, relatedPaperIds: [] },
        { id: paperB, relatedPaperIds: [] },
      ],
      paperA,
      ["not-an-object-id", paperA, nonexistent, paperB, paperB]
    );

    expect(state.get(paperA)?.relatedPaperIds).toEqual([paperB]);
    expect(state.get(paperB)?.relatedPaperIds).toEqual([paperA]);
  });
});
