import { describe, expect, it } from "vitest";

import {
  getPaperGraphNeighborhood,
  type PaperGraphData,
} from "../../../app/renderer/utils/paper-graph";

const buildGraph = (): PaperGraphData => ({
  nodes: [
    {
      id: "paper-1",
      label: "Paper 1",
      year: "2022",
      folderPath: "Research/ML",
      rootFolder: "Research",
      relationCount: 2,
      radius: 14,
      color: "#000000",
      x: 0,
      y: 0,
    },
    {
      id: "paper-2",
      label: "Paper 2",
      year: "2023",
      folderPath: "Research/ML",
      rootFolder: "Research",
      relationCount: 1,
      radius: 12,
      color: "#111111",
      x: 1,
      y: 1,
    },
    {
      id: "paper-3",
      label: "Paper 3",
      year: "2024",
      folderPath: "Research/Systems",
      rootFolder: "Research",
      relationCount: 1,
      radius: 12,
      color: "#222222",
      x: 2,
      y: 2,
    },
    {
      id: "paper-4",
      label: "Paper 4",
      year: "2021",
      folderPath: "Research/Theory",
      rootFolder: "Research",
      relationCount: 1,
      radius: 12,
      color: "#333333",
      x: 3,
      y: 3,
    },
  ],
  edges: [
    { id: "paper-1::paper-2", source: "paper-1", target: "paper-2" },
    { id: "paper-3::paper-1", source: "paper-3", target: "paper-1" },
    { id: "paper-3::paper-4", source: "paper-3", target: "paper-4" },
    { id: "paper-1::paper-999", source: "paper-1", target: "paper-999" },
  ],
});

describe("paper graph neighborhood helpers", () => {
  it("returns the selected node and its direct neighbors only", () => {
    const graph = buildGraph();

    const neighborhood = getPaperGraphNeighborhood(graph, "paper-1");

    expect(neighborhood.nodes.map((node) => node.id)).toEqual([
      "paper-1",
      "paper-2",
      "paper-3",
    ]);
    expect(neighborhood.edges).toEqual([
      { id: "paper-1::paper-2", source: "paper-1", target: "paper-2" },
      { id: "paper-3::paper-1", source: "paper-3", target: "paper-1" },
    ]);
  });

  it("never introduces nodes outside the active filtered graph", () => {
    const graph = buildGraph();

    const neighborhood = getPaperGraphNeighborhood(graph, "paper-1");

    expect(neighborhood.nodes.some((node) => node.id === "paper-999")).toBe(false);
    expect(neighborhood.edges.some((edge) => edge.target === "paper-999")).toBe(false);
  });

  it("returns a shallow copy of the full graph when no valid selection is provided", () => {
    const graph = buildGraph();

    const noSelection = getPaperGraphNeighborhood(graph);
    const invalidSelection = getPaperGraphNeighborhood(graph, "missing-paper");

    expect(noSelection).toEqual(graph);
    expect(noSelection).not.toBe(graph);
    expect(noSelection.nodes).not.toBe(graph.nodes);
    expect(noSelection.edges).not.toBe(graph.edges);
    expect(invalidSelection).toEqual(graph);
    expect(invalidSelection).not.toBe(graph);
  });
});
