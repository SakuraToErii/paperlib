<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { Entity, IEntityCollection } from "@/models/entity";
import {
  buildPaperGraph,
  layoutPaperGraph,
  PaperGraphEdge,
  PaperGraphNode,
} from "@/renderer/utils/paper-graph";

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

const container = ref<HTMLElement | null>(null);
const viewportWidth = ref(960);
const viewportHeight = ref(680);
const zoom = ref(1);
const panX = ref(0);
const panY = ref(0);
const hoveredNodeId = ref("");
const isPanning = ref(false);
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
  () => props.entities,
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

const indexById = computed(() => {
  return entitiesList.value.reduce((accumulator, entity, index) => {
    accumulator[`${entity._id}`] = index;
    return accumulator;
  }, {} as Record<string, number>);
});

const graph = computed(() => {
  const builtGraph = buildPaperGraph(entitiesList.value, props.graphPalette);
  return {
    ...builtGraph,
    nodes: layoutPaperGraph(builtGraph.nodes, builtGraph.edges),
  };
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

const activeNodeSet = computed(() => {
  const sourceNodeId = hoveredNodeId.value || selectedNodeId.value;
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
  const activeNodeId = hoveredNodeId.value || selectedNodeId.value;
  if (!activeNodeId) {
    return true;
  }

  return edge.source === activeNodeId || edge.target === activeNodeId;
};

const nodeOpacity = (node: PaperGraphNode) => {
  if (activeNodeSet.value.size === 0) {
    return 1;
  }
  return activeNodeSet.value.has(node.id) ? 1 : 0.18;
};

const edgeOpacity = (edge: PaperGraphEdge) => {
  if (!hoveredNodeId.value && !selectedNodeId.value) {
    return 0.72;
  }
  return edgeIsActive(edge) ? 0.92 : 0.12;
};

const labelVisible = (node: PaperGraphNode) => {
  return (
    props.entities.length <= 18 ||
    node.id === hoveredNodeId.value ||
    node.id === selectedNodeId.value ||
    activeNodeSet.value.has(node.id)
  );
};

const fitGraph = () => {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
};

const onWheel = (event: WheelEvent) => {
  event.preventDefault();
  const nextZoom = zoom.value * (event.deltaY > 0 ? 0.92 : 1.08);
  zoom.value = Math.min(2.5, Math.max(0.4, nextZoom));
};

const onPointerDown = (event: MouseEvent) => {
  if ((event.target as HTMLElement)?.closest("[data-node-id]")) {
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

const onNodeClicked = (nodeId: string) => {
  const index = indexById.value[nodeId];
  if (index === undefined) {
    return;
  }
  emits("event:click", [index]);
};

const onNodeDoubleClicked = (nodeId: string) => {
  const index = indexById.value[nodeId];
  if (index === undefined) {
    return;
  }
  emits("event:dblclick", [index]);
};

const graphTransform = computed(() => {
  return `translate(${viewportWidth.value / 2 + panX.value} ${viewportHeight.value / 2 + panY.value}) scale(${zoom.value})`;
});
</script>

<template>
  <div
    ref="container"
    class="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-neutral-50 dark:bg-neutral-900 rounded-md border border-neutral-200 dark:border-neutral-700"
    @mousedown="onPointerDown"
    @wheel="onWheel"
  >
    <svg class="w-full h-full select-none">
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
          :x1="graph.nodes.find((node) => node.id === edge.source)?.x || 0"
          :y1="graph.nodes.find((node) => node.id === edge.source)?.y || 0"
          :x2="graph.nodes.find((node) => node.id === edge.target)?.x || 0"
          :y2="graph.nodes.find((node) => node.id === edge.target)?.y || 0"
          class="text-neutral-400 dark:text-neutral-500 transition-opacity duration-150"
          stroke="currentColor"
          stroke-width="1.6"
          :stroke-opacity="edgeOpacity(edge)"
          marker-end="url(#paper-graph-arrow)"
        />

        <g
          v-for="node in graph.nodes"
          :key="node.id"
          :transform="`translate(${node.x} ${node.y})`"
          :opacity="nodeOpacity(node)"
          class="transition-opacity duration-150 cursor-pointer"
          :data-node-id="node.id"
          @mouseenter="hoveredNodeId = node.id"
          @mouseleave="hoveredNodeId = ''"
          @click.stop="onNodeClicked(node.id)"
          @dblclick.stop="onNodeDoubleClicked(node.id)"
        >
          <circle
            :r="node.radius + (node.id === selectedNodeId ? 3 : 0)"
            :fill="node.color"
            :stroke="node.id === selectedNodeId ? '#ffffff' : 'rgba(255,255,255,0.35)'"
            :stroke-width="node.id === selectedNodeId ? 2.5 : 1.2"
          />
          <text
            v-if="labelVisible(node)"
            class="fill-neutral-700 dark:fill-neutral-200 text-[11px] font-medium pointer-events-none"
            text-anchor="middle"
            :y="node.radius + 16"
          >
            {{ node.label.length > 32 ? `${node.label.slice(0, 29)}...` : node.label }}
          </text>
          <text
            v-if="labelVisible(node) && node.year"
            class="fill-neutral-400 dark:fill-neutral-500 text-[9px] pointer-events-none"
            text-anchor="middle"
            :y="node.radius + 29"
          >
            {{ node.year }}
          </text>
        </g>
      </g>
    </svg>

    <div class="absolute top-3 right-3 flex space-x-2">
      <button
        class="px-2 h-7 text-xxs rounded-md bg-white/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 hover:dark:bg-neutral-700 transition-colors"
        @click="fitGraph"
      >
        {{ $t("menu.graphfit") }}
      </button>
    </div>

    <div
      v-if="graph.nodes.length === 0"
      class="absolute inset-0 flex items-center justify-center text-xs text-neutral-400 dark:text-neutral-500"
    >
      {{ $t("mainview.nopapersgraph") }}
    </div>

    <div
      v-else
      class="absolute bottom-3 left-3 max-w-[16rem] rounded-md bg-white/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700 p-2 space-y-1"
    >
      <div class="text-xxs font-semibold text-neutral-500 dark:text-neutral-400">
        {{ $t("mainview.graphlegend") }}
      </div>
      <div class="space-y-1 max-h-32 overflow-auto">
        <div
          v-for="[folderName, color] in Object.entries(graph.colorMap)"
          :key="folderName"
          class="flex items-center space-x-2 text-xxs text-neutral-700 dark:text-neutral-300"
        >
          <div class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: color }"></div>
          <div class="truncate">{{ folderName }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
