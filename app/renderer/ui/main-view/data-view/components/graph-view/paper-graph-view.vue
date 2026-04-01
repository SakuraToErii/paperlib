<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import { Entity, IEntityCollection } from "@/models/entity";
import {
  buildPaperGraph,
  getPaperGraphNeighborhood,
  layoutPaperGraph,
  PaperGraphEdge,
  PaperGraphNode,
} from "@/renderer/utils/paper-graph";

type GraphDisplayMode = "all" | "neighborhood";

const props = defineProps({
  entities: {
    type: Object as () => IEntityCollection,
    required: true,
    default: () => [],
  },
  selectedIndex: {
    type: Array as () => number[],
    required: true,
    default: () => [],
  },
  graphPalette: {
    type: String,
    default: "",
  },
});

const emits = defineEmits(["event:click", "event:dblclick"]);
const i18n = useI18n();

const container = ref<HTMLElement | null>(null);
const viewportWidth = ref(960);
const viewportHeight = ref(680);
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const hoveredNodeId = ref("");
const focusedNodeId = ref("");
const isPanning = ref(false);
const graphDisplayMode = ref<GraphDisplayMode>("all");
const panStart = ref({ x: 0, y: 0, panX: 0, panY: 0 });

const updateViewport = () => {
  if (!container.value) {
    return;
  }

  viewportWidth.value = container.value.clientWidth || 960;
  viewportHeight.value = container.value.clientHeight || 680;
};

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  updateViewport();
  if (container.value) {
    resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(container.value);
  }
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  window.removeEventListener("mousemove", onPointerMove);
  window.removeEventListener("mouseup", onPointerUp);
});

watch(
  () => [props.entities, props.selectedIndex, graphDisplayMode.value],
  () => {
    if (zoom.value === 1 && panX.value === 0 && panY.value === 0) {
      return;
    }
    fitGraph();
  },
  { deep: true }
);

const entitiesList = computed(() => Array.from(props.entities) as Entity[]);

const selectedNodeId = computed(() => {
  const selectedEntity = entitiesList.value[props.selectedIndex[0]];
  return selectedEntity ? `${selectedEntity._id}` : "";
});

const hasSelectedNodeInGraph = computed(() => {
  return !!selectedNodeId.value && baseGraph.value.nodes.some((node) => node.id === selectedNodeId.value);
});

const selectedEntity = computed(() => {
  return hasSelectedNodeInGraph.value && selectedNodeId.value
    ? entitiesList.value.find((entity) => `${entity._id}` === selectedNodeId.value)
    : undefined;
});

const indexById = computed(() => {
  return entitiesList.value.reduce((accumulator, entity, index) => {
    accumulator[`${entity._id}`] = index;
    return accumulator;
  }, {} as Record<string, number>);
});

const baseGraph = computed(() => buildPaperGraph(entitiesList.value, props.graphPalette));

const shouldShowNeighborhoodSelectionState = computed(() => {
  return graphDisplayMode.value === "neighborhood" && !hasSelectedNodeInGraph.value;
});

const graph = computed(() => {
  const graphData =
    graphDisplayMode.value === "neighborhood" && hasSelectedNodeInGraph.value
      ? getPaperGraphNeighborhood(baseGraph.value, selectedNodeId.value)
      : graphDisplayMode.value === "neighborhood"
        ? {
            nodes: [],
            edges: [],
          }
        : {
            nodes: [...baseGraph.value.nodes],
            edges: [...baseGraph.value.edges],
          };

  return {
    ...baseGraph.value,
    ...graphData,
    nodes: layoutPaperGraph(graphData.nodes, graphData.edges),
  };
});

const nodeMap = computed(() => {
  return graph.value.nodes.reduce((accumulator, node) => {
    accumulator[node.id] = node;
    return accumulator;
  }, {} as Record<string, PaperGraphNode>);
});

const legendEntries = computed(() => {
  return Object.entries(graph.value.colorMap).sort(([left], [right]) =>
    left.localeCompare(right)
  );
});

const folderNodeCounts = computed(() => {
  return graph.value.nodes.reduce((accumulator, node) => {
    const key = node.rootFolder || "Unfiled";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {} as Record<string, number>);
});

const adjacency = computed(() => {
  return graph.value.edges.reduce((accumulator, edge) => {
    if (!accumulator[edge.source]) {
      accumulator[edge.source] = new Set<string>();
    }
    if (!accumulator[edge.target]) {
      accumulator[edge.target] = new Set<string>();
    }
    accumulator[edge.source].add(edge.target);
    accumulator[edge.target].add(edge.source);
    return accumulator;
  }, {} as Record<string, Set<string>>);
});

const activeNodeId = computed(() => {
  return hoveredNodeId.value || focusedNodeId.value || selectedNodeId.value;
});

const activeNode = computed(() => {
  return activeNodeId.value ? nodeMap.value[activeNodeId.value] : undefined;
});

const activeNodeSet = computed(() => {
  const sourceNodeId = activeNodeId.value;
  if (!sourceNodeId) {
    return new Set<string>();
  }

  return new Set([
    sourceNodeId,
    ...(adjacency.value[sourceNodeId]
      ? Array.from(adjacency.value[sourceNodeId])
      : []),
  ]);
});

const edgeIsActive = (edge: PaperGraphEdge) => {
  if (!activeNodeId.value) {
    return true;
  }

  return edge.source === activeNodeId.value || edge.target === activeNodeId.value;
};

const nodeOpacity = (node: PaperGraphNode) => {
  if (activeNodeSet.value.size === 0) {
    return 1;
  }
  return activeNodeSet.value.has(node.id) ? 1 : 0.14;
};

const edgeOpacity = (edge: PaperGraphEdge) => {
  if (!activeNodeId.value) {
    return 0.4;
  }
  return edgeIsActive(edge) ? 0.95 : 0.08;
};

const labelVisible = (node: PaperGraphNode) => {
  return (
    graph.value.nodes.length <= 18 ||
    node.id === activeNodeId.value ||
    activeNodeSet.value.has(node.id)
  );
};

const nodeStroke = (node: PaperGraphNode) => {
  if (node.id === selectedNodeId.value) {
    return "rgba(255,255,255,0.96)";
  }
  if (node.id === activeNodeId.value) {
    return "rgba(255,255,255,0.82)";
  }
  return "rgba(255,255,255,0.36)";
};

const nodeStrokeWidth = (node: PaperGraphNode) => {
  if (node.id === selectedNodeId.value) {
    return 3;
  }
  if (node.id === activeNodeId.value) {
    return 2.4;
  }
  return 1.2;
};

const nodeRingRadius = (node: PaperGraphNode) => {
  if (node.id === selectedNodeId.value) {
    return node.radius + 7;
  }
  if (node.id === activeNodeId.value) {
    return node.radius + 5;
  }
  return node.radius + 3;
};

const nodeRingOpacity = (node: PaperGraphNode) => {
  if (node.id === selectedNodeId.value) {
    return 0.32;
  }
  if (node.id === activeNodeId.value) {
    return 0.22;
  }
  return 0;
};

const visibleNodeCount = computed(() => graph.value.nodes.length);
const visibleEdgeCount = computed(() => graph.value.edges.length);
const legendSummary = computed(() => legendEntries.value.length);
const graphSummaryText = computed(() =>
  i18n.t("mainview.graphSummary", {
    nodes: visibleNodeCount.value,
    links: visibleEdgeCount.value,
    folders: legendSummary.value,
  })
);
const activeNodeMetaText = computed(() => {
  if (!activeNode.value) {
    return "";
  }

  return i18n.t("mainview.graphActiveNodeMeta", {
    related: activeNode.value.relationCount,
    folder: activeNode.value.rootFolder || i18n.t("mainview.graphunfiled"),
    year: activeNode.value.year,
  });
});

const fitGraph = () => {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
};

const zoomBy = (factor: number) => {
  zoom.value = Math.min(2.5, Math.max(0.4, zoom.value * factor));
};

const setGraphDisplayMode = (mode: GraphDisplayMode) => {
  graphDisplayMode.value = mode;
};

const onWheel = (event: WheelEvent) => {
  if (shouldShowNeighborhoodSelectionState.value) {
    return;
  }

  event.preventDefault();
  zoomBy(event.deltaY > 0 ? 0.92 : 1.08);
};

const onPointerDown = (event: MouseEvent) => {
  if (
    shouldShowNeighborhoodSelectionState.value ||
    (event.target as HTMLElement)?.closest("[data-node-id], button")
  ) {
    return;
  }

  isPanning.value = true;
  panStart.value = {
    x: event.clientX,
    y: event.clientY,
    panX: panX.value,
    panY: panY.value,
  };
};

function onPointerMove(event: MouseEvent) {
  if (!isPanning.value) {
    return;
  }

  panX.value = panStart.value.panX + (event.clientX - panStart.value.x);
  panY.value = panStart.value.panY + (event.clientY - panStart.value.y);
}

function onPointerUp() {
  isPanning.value = false;
}

const clearInteractionState = () => {
  hoveredNodeId.value = "";
  focusedNodeId.value = "";
};

const onNodeClicked = (nodeId: string) => {
  const index = indexById.value[nodeId];
  if (index === undefined) {
    return;
  }
  focusedNodeId.value = nodeId;
  emits("event:click", [index]);
};

const onNodeDoubleClicked = (nodeId: string) => {
  const index = indexById.value[nodeId];
  if (index === undefined) {
    return;
  }
  emits("event:dblclick", [index]);
};

const onNodeKeydown = (event: KeyboardEvent, nodeId: string) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onNodeClicked(nodeId);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    clearInteractionState();
    container.value?.focus();
  }
};

const onContainerKeydown = (event: KeyboardEvent) => {
  if ((event.target as HTMLElement)?.closest("[data-node-id]")) {
    return;
  }

  if (event.key === "Escape") {
    clearInteractionState();
    fitGraph();
    return;
  }

  if (shouldShowNeighborhoodSelectionState.value) {
    return;
  }

  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomBy(1.12);
    return;
  }

  if (event.key === "-" || event.key === "_") {
    event.preventDefault();
    zoomBy(0.9);
    return;
  }

  if (event.key === "0") {
    event.preventDefault();
    fitGraph();
  }
};

const graphTransform = computed(() => {
  return `translate(${viewportWidth.value / 2 + panX.value} ${viewportHeight.value / 2 + panY.value}) scale(${zoom.value})`;
});
</script>

<template>
  <div
    ref="container"
    tabindex="0"
    class="relative w-full h-[calc(100vh-4rem)] overflow-hidden rounded-md border border-neutral-200 bg-gradient-to-br from-white via-neutral-50 to-neutral-100 shadow-sm outline-none dark:border-neutral-700 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950"
    :class="[
      isPanning ? 'cursor-grabbing' : 'cursor-default',
      shouldShowNeighborhoodSelectionState ? 'cursor-not-allowed' : ''
    ]"
    @mousedown="onPointerDown"
    @wheel="onWheel"
    @mouseleave="hoveredNodeId = ''"
    @keydown="onContainerKeydown"
  >
    <div class="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/70 to-transparent dark:from-neutral-950/40"></div>
    <svg
      class="h-full w-full select-none"
      :class="shouldShowNeighborhoodSelectionState ? 'pointer-events-none opacity-40' : ''"
    >
      <defs>
        <marker
          id="paper-graph-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      <g :transform="graphTransform">
        <line
          v-for="edge in graph.edges"
          :key="edge.id"
          :x1="nodeMap[edge.source]?.x || 0"
          :y1="nodeMap[edge.source]?.y || 0"
          :x2="nodeMap[edge.target]?.x || 0"
          :y2="nodeMap[edge.target]?.y || 0"
          class="text-neutral-400 dark:text-neutral-500 transition-all duration-150"
          stroke="currentColor"
          :stroke-width="edgeIsActive(edge) ? 2 : 1.4"
          :stroke-opacity="edgeOpacity(edge)"
          marker-end="url(#paper-graph-arrow)"
        />

        <g
          v-for="node in graph.nodes"
          :key="node.id"
          :transform="`translate(${node.x} ${node.y})`"
          :opacity="nodeOpacity(node)"
          class="cursor-pointer transition-opacity duration-150"
          :data-node-id="node.id"
          tabindex="0"
          role="button"
          :aria-label="node.label"
          @mouseenter="hoveredNodeId = node.id"
          @mouseleave="hoveredNodeId = ''"
          @focus="focusedNodeId = node.id"
          @blur="focusedNodeId = ''"
          @click.stop="onNodeClicked(node.id)"
          @dblclick.stop="onNodeDoubleClicked(node.id)"
          @keydown="(event) => onNodeKeydown(event, node.id)"
        >
          <circle
            :r="nodeRingRadius(node)"
            fill="rgba(59,130,246,0.16)"
            :opacity="nodeRingOpacity(node)"
          />
          <circle
            :r="node.radius + (node.id === selectedNodeId ? 3 : node.id === activeNodeId ? 1.5 : 0)"
            :fill="node.color"
            :stroke="nodeStroke(node)"
            :stroke-width="nodeStrokeWidth(node)"
          />
          <text
            v-if="labelVisible(node)"
            class="fill-neutral-800 dark:fill-neutral-100 text-[11px] font-semibold pointer-events-none"
            text-anchor="middle"
            :y="node.radius + 16"
          >
            {{ node.label.length > 32 ? `${node.label.slice(0, 29)}...` : node.label }}
          </text>
          <text
            v-if="labelVisible(node) && node.year"
            class="fill-neutral-500 dark:fill-neutral-400 text-[9px] pointer-events-none"
            text-anchor="middle"
            :y="node.radius + 29"
          >
            {{ node.year }}
          </text>
        </g>
      </g>
    </svg>

    <div
      v-if="graph.nodes.length > 0"
      class="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2"
    >
      <div class="rounded-md border border-neutral-200 bg-white/90 px-3 py-2 text-xxs text-neutral-600 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-800/90 dark:text-neutral-300">
        {{ graphSummaryText }}
      </div>
      <div
        class="pointer-events-auto rounded-lg border border-neutral-200 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-800/90"
      >
        <div class="grid grid-cols-2 gap-1">
          <button
            class="h-8 rounded-md px-3 text-xxs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-400"
            :class="graphDisplayMode === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700'"
            @click="setGraphDisplayMode('all')"
          >
            {{ $t("mainview.graphModeAll") }}
          </button>
          <button
            class="h-8 rounded-md px-3 text-xxs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-400"
            :class="graphDisplayMode === 'neighborhood'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700'"
            @click="setGraphDisplayMode('neighborhood')"
          >
            {{ $t("mainview.graphModeNeighborhood") }}
          </button>
        </div>
      </div>
      <div
        v-if="activeNode"
        class="max-w-[18rem] rounded-md border border-blue-200 bg-blue-50/95 px-3 py-2 text-xxs text-blue-900 shadow-sm backdrop-blur dark:border-blue-900/80 dark:bg-blue-950/70 dark:text-blue-100"
      >
        <div class="font-semibold truncate">{{ activeNode.label }}</div>
        <div class="mt-1 text-[10px] text-blue-700 dark:text-blue-200">
          {{ activeNodeMetaText }}
        </div>
      </div>
    </div>

    <div class="absolute right-3 top-3 flex flex-col gap-2">
      <button
        class="h-8 rounded-md border border-neutral-200 bg-white/90 px-3 text-xxs font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800/90 dark:text-neutral-200 dark:hover:bg-neutral-700"
        :aria-label="$t('menu.graphfit')"
        :disabled="shouldShowNeighborhoodSelectionState"
        @click="fitGraph"
      >
        {{ $t("menu.graphfit") }}
      </button>
      <div class="grid grid-cols-2 gap-2 rounded-md border border-neutral-200 bg-white/90 p-2 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-800/90">
        <button
          class="h-7 rounded-md border border-neutral-200 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700"
          :aria-label="$t('mainview.graphZoomIn')"
          :disabled="shouldShowNeighborhoodSelectionState"
          @click="zoomBy(1.12)"
        >
          +
        </button>
        <button
          class="h-7 rounded-md border border-neutral-200 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700"
          :aria-label="$t('mainview.graphZoomOut')"
          :disabled="shouldShowNeighborhoodSelectionState"
          @click="zoomBy(0.9)"
        >
          −
        </button>
      </div>
    </div>

    <div
      v-if="shouldShowNeighborhoodSelectionState"
      class="absolute inset-0 flex items-center justify-center p-6"
    >
      <div class="max-w-sm rounded-xl border border-dashed border-neutral-300 bg-white/90 px-6 py-5 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-900/90">
        <div class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {{ selectedNodeId ? $t("mainview.graphNeighborhoodUnavailableTitle") : $t("mainview.graphNeighborhoodSelectTitle") }}
        </div>
        <div class="mt-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          {{ selectedNodeId
            ? $t("mainview.graphNeighborhoodUnavailableDescription")
            : $t("mainview.graphNeighborhoodSelectDescription") }}
        </div>
      </div>
    </div>

    <div
      v-else-if="graph.nodes.length === 0"
      class="absolute inset-0 flex items-center justify-center p-6"
    >
      <div class="max-w-sm rounded-xl border border-dashed border-neutral-300 bg-white/80 px-6 py-5 text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-900/80">
        <div class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
          {{ $t("mainview.nopapersgraph") }}
        </div>
        <div class="mt-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
          {{ $t("mainview.graphEmptyDescription") }}
        </div>
      </div>
    </div>

    <div
      v-else
      class="absolute bottom-3 left-3 w-[18rem] rounded-lg border border-neutral-200 bg-white/92 p-3 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-800/92"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-xxs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {{ $t("mainview.graphlegend") }}
          </div>
          <div class="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
            {{ $t("mainview.graphLegendDescription") }}
          </div>
        </div>
        <div class="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-medium text-neutral-500 dark:bg-neutral-700/80 dark:text-neutral-300">
          {{ legendEntries.length }}
        </div>
      </div>
      <div class="mt-3 space-y-1.5 max-h-36 overflow-auto pr-1">
        <div
          v-for="[folderName, color] in legendEntries"
          :key="folderName"
          class="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-xxs text-neutral-700 hover:bg-neutral-100/80 dark:text-neutral-300 dark:hover:bg-neutral-700/60"
        >
          <div class="flex items-center gap-2 min-w-0">
            <div class="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5" :style="{ backgroundColor: color }"></div>
            <div class="truncate">{{ folderName }}</div>
          </div>
          <div class="text-[10px] text-neutral-400 dark:text-neutral-500">
            {{ folderNodeCounts[folderName] || 0 }}
          </div>
        </div>
      </div>
      <div class="mt-3 border-t border-neutral-200 pt-2 text-[10px] leading-4 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        {{ $t("mainview.graphInteractionHint") }}
      </div>
    </div>
  </div>
</template>
