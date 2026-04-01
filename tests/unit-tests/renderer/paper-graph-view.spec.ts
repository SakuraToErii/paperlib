import { describe, expect, it } from "vitest";

import { buildPaperGraph, getPaperGraphNeighborhood } from "@/renderer/utils/paper-graph";
import { Entity } from "@/models/entity";

const makeEntity = (id: string, title: string, relatedPaperIds: string[] = []) => {
  return {
    _id: id,
    title,
    relatedPaperIds,
    folders: ["Root"],
    year: "2024",
  } as Entity;
};

describe("graph neighborhood selection validity", () => {
  it("does not silently fall back to the full graph for stale selections", () => {
    const entities = [
      makeEntity("paper-1", "Paper 1", ["paper-2"]),
      makeEntity("paper-2", "Paper 2", ["paper-1"]),
    ];

    const baseGraph = buildPaperGraph(entities);
    const selectedNodeId = "missing-paper";
    const hasSelectedNodeInGraph = baseGraph.nodes.some((node) => node.id === selectedNodeId);
    const graphData = hasSelectedNodeInGraph
      ? getPaperGraphNeighborhood(baseGraph, selectedNodeId)
      : { nodes: [], edges: [] };

    expect(hasSelectedNodeInGraph).toBe(false);
    expect(graphData).toEqual({ nodes: [], edges: [] });
    expect(graphData.nodes).not.toEqual(baseGraph.nodes);
    expect(graphData.edges).not.toEqual(baseGraph.edges);
  });

  it("keeps neighborhood mode empty when the selection becomes stale after filtering or reload", () => {
    const entities = [
      makeEntity("paper-1", "Paper 1", ["paper-2"]),
      makeEntity("paper-2", "Paper 2", ["paper-1", "paper-3"]),
      makeEntity("paper-3", "Paper 3", ["paper-2"]),
    ];

    const baseGraph = buildPaperGraph(entities);
    const selectedNodeId = "paper-2";
    const initialGraphData = baseGraph.nodes.some((node) => node.id === selectedNodeId)
      ? getPaperGraphNeighborhood(baseGraph, selectedNodeId)
      : { nodes: [], edges: [] };

    const filteredGraph = buildPaperGraph([
      makeEntity("paper-1", "Paper 1", []),
      makeEntity("paper-3", "Paper 3", []),
    ]);
    const filteredGraphData = filteredGraph.nodes.some((node) => node.id === selectedNodeId)
      ? getPaperGraphNeighborhood(filteredGraph, selectedNodeId)
      : { nodes: [], edges: [] };

    expect(initialGraphData.nodes.map((node) => node.id).sort()).toEqual([
      "paper-1",
      "paper-2",
      "paper-3",
    ]);
    expect(filteredGraphData).toEqual({ nodes: [], edges: [] });
  });

  it("still shows the neighborhood for valid selections", () => {
    const entities = [
      makeEntity("paper-1", "Paper 1", ["paper-2"]),
      makeEntity("paper-2", "Paper 2", ["paper-1", "paper-3"]),
      makeEntity("paper-3", "Paper 3", ["paper-2"]),
      makeEntity("paper-4", "Paper 4", []),
    ];

    const baseGraph = buildPaperGraph(entities);
    const selectedNodeId = "paper-2";
    const hasSelectedNodeInGraph = baseGraph.nodes.some((node) => node.id === selectedNodeId);
    const graphData = hasSelectedNodeInGraph
      ? getPaperGraphNeighborhood(baseGraph, selectedNodeId)
      : { nodes: [], edges: [] };

    expect(hasSelectedNodeInGraph).toBe(true);
    expect(graphData.nodes.map((node) => node.id).sort()).toEqual([
      "paper-1",
      "paper-2",
      "paper-3",
    ]);
    expect(graphData.nodes.some((node) => node.id === "paper-4")).toBe(false);
  });
});
